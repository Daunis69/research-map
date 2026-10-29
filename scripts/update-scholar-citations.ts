import { readFile, writeFile } from "node:fs/promises";
import { fetchScholarCitations } from "../lib/publications/scholar";
import { attachScholarCitations, getCitationSummary } from "../lib/scholarCitations";
import { deduplicatePublications } from "../lib/publications/deduplicate";
import type { PublicationDataset, ScholarCitationSnapshot } from "../types/publication";

async function main() {
  let previous: ScholarCitationSnapshot | undefined;
  try { previous = JSON.parse(await readFile("data/google-scholar-citations.json", "utf8")); } catch { /* First verified import. */ }
  const dataset = JSON.parse(await readFile(process.argv[2] ?? "data/publications.json", "utf8")) as PublicationDataset;
  const publications = deduplicatePublications(dataset.publications);
  const initial = await fetchScholarCitations({ previous });
  const matched = attachScholarCitations(publications, initial);
  const year = new Date(initial.profile.checkedAt).getUTCFullYear();
  const recent = matched.publications.filter(p => p.year === year && p.scholarCitations).sort((a, b) => b.scholarCitations!.total - a.scholarCitations!.total);
  const highest = matched.publications.filter(p => p.scholarCitations).sort((a, b) => b.scholarCitations!.total - a.scholarCitations!.total);
  const historyIds = [...new Set([...recent, ...highest].map(p => p.scholarCitations!.workId))].slice(0, 16);
  const result = await fetchScholarCitations({ previous: initial, historyIds });
  result.profile.updateStatus = "snapshot";
  await writeFile("data/google-scholar-citations.json", JSON.stringify(result, null, 2) + "\n");
  const final = attachScholarCitations(publications, result);
  const summary = getCitationSummary(final.publications);
  console.log(JSON.stringify({ profileTotal: result.profile.total, sourceRecords: result.records.length, publications: publications.length, matched: final.matched,
    selectedTotal: summary.totalCitations, annualHistories: summary.annualCoveredPublications,
    unmatched: final.publications.filter(p => !p.scholarCitations).map(p => ({ id: p.id, title: p.title, year: p.year })) }));
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Scholar citation import failed"); process.exitCode = 1; });
