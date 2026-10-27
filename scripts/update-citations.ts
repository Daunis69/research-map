import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { refreshPublicationCitations } from "../lib/publications/citationSync";
import { getCitationMetrics, getCitationSummary, withCitationMetrics } from "../lib/citations";
import { deduplicatePublications } from "../lib/publications/deduplicate";
import type { CitationMetrics, PublicationDataset } from "../types/publication";

async function main() {
  const input = resolve(process.argv[2] ?? "data/publications.json");
  const output = resolve("data/citations.json");
  const dataset = JSON.parse(await readFile(input, "utf8")) as PublicationDataset;
  if (!Array.isArray(dataset.publications)) throw new Error("Input must contain a publication collection");
  const baseline = JSON.parse(await readFile(output, "utf8")) as { records: CitationMetrics[] };
  const previous = withCitationMetrics(deduplicatePublications(dataset.publications), baseline.records);
  const fetchedAt = new Date().toISOString();
  const result = await refreshPublicationCitations(previous, { now: fetchedAt });
  if (!result.checked) throw new Error("No citation metadata was verified; existing baseline was retained");
  const records = new Map<string, CitationMetrics>();
  for (const publication of result.publications) {
    const metric = getCitationMetrics(publication);
    if (metric) records.set(metric.workId, metric);
  }
  await writeFile(output, JSON.stringify({ fetchedAt, records: [...records.values()].sort((a, b) => a.workId.localeCompare(b.workId)) }, null, 2) + "\n");
  const summary = getCitationSummary(result.publications);
  console.log(JSON.stringify({ checked: result.checked, failed: result.failed, publications: summary.publications, covered: summary.coveredPublications, annualHistories: summary.annualCoveredPublications, totalCitations: summary.totalCitations, annualTotal: summary.byYear.reduce((sum, row) => sum + (row.citations ?? 0), 0) }));
  if (result.failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Citation baseline update failed");
  process.exitCode = 1;
});
