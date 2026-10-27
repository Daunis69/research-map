import type { Publication } from "../../types/publication";
import { parseOpenAlexCitations, selectCitationMetrics } from "../citations";
import { fetchJson as fetchMetadataJson } from "./http";
import { normalizeDoi, record } from "./normalize";

interface CitationTarget {
  kind: "doi" | "openAlex";
  value: string;
  indexes: number[];
}

function openAlexWorkId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^https:\/\/openalex\.org\/(W\d+)\/?$/i.exec(value.trim());
  return match ? `https://openalex.org/${match[1].toUpperCase()}` : undefined;
}

/** Refresh only exact known work identities; citation lookup never discovers papers. */
export async function refreshPublicationCitations(
  publications: Publication[],
  options: { fetcher?: typeof fetchMetadataJson; now?: string; budgetMs?: number } = {},
): Promise<{ publications: Publication[]; checked: number; failed: number }> {
  const targets = new Map<string, CitationTarget>();
  publications.forEach((publication, index) => {
    // A merged journal article can still carry a preprint's source ID.
    const doi = normalizeDoi(publication.doi);
    const value = doi ?? openAlexWorkId(publication.source.openAlex);
    if (!value) return;
    const kind = doi ? "doi" : "openAlex";
    const key = `${kind}:${value}`;
    const target = targets.get(key);
    if (target) target.indexes.push(index);
    else targets.set(key, { kind, value, indexes: [index] });
  });
  const result = [...publications];
  let checked = 0;
  let failed = 0;
  const requestedBudget = options.budgetMs ?? 45_000;
  const budgetMs = Number.isFinite(requestedBudget) ? Math.max(0, Math.min(45_000, requestedBudget)) : 45_000;
  const deadline = performance.now() + budgetMs;
  const checkedAt = options.now ?? new Date().toISOString();
  const fetcher = options.fetcher ?? fetchMetadataJson;
  const headers: Record<string, string> = process.env.OPENALEX_API_KEY
    ? { Authorization: `Bearer ${process.env.OPENALEX_API_KEY}` }
    : {};

  for (const kind of ["doi", "openAlex"] as const) {
    const queue = [...targets.values()].filter(target => target.kind === kind);
    for (let start = 0; start < queue.length; start += 45) {
      const batch = queue.slice(start, start + 45);
      const remaining = Math.floor(deadline - performance.now());
      if (remaining <= 0) {
        failed += queue.length - start;
        break;
      }
      const url = new URL("https://api.openalex.org/works");
      url.searchParams.set("filter", kind === "doi"
        ? `doi:${batch.map(target => `https://doi.org/${target.value}`).join("|")}`
        : `ids.openalex:${batch.map(target => target.value.split("/").at(-1)).join("|")}`);
      url.searchParams.set("per_page", "100");
      url.searchParams.set("select", "id,doi,cited_by_count,counts_by_year");
      const timeoutMs = Math.min(8_000, remaining);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Also bound injected fetchers that fail to observe the native abort signal.
        const response = record(await Promise.race([
          fetcher(url, { signal: AbortSignal.timeout(timeoutMs), timeoutMs, retries: 0 }, headers),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Citation request timed out")), timeoutMs);
          }),
        ]));
        if (!Array.isArray(response.results)) throw new Error("Malformed citation response");
        const byValue = new Map(batch.map(target => [target.value, target]));
        const refreshed = new Set<string>();
        const invalid = new Set<string>();
        let malformed = false;
        for (const raw of response.results) {
          const work = record(raw);
          const doi = normalizeDoi(work.doi);
          const workId = openAlexWorkId(work.id);
          const identity = kind === "doi" ? doi : workId;
          const target = identity ? byValue.get(identity) : undefined;
          if (!target) {
            if (!doi && !workId) malformed = true;
            continue;
          }
          const metrics = parseOpenAlexCitations(raw, checkedAt);
          if (!metrics) {
            invalid.add(target.value);
            continue;
          }
          for (const index of target.indexes) {
            const publication = result[index];
            const selected = selectCitationMetrics(publication, publication.citationMetrics, metrics);
            if (selected) result[index] = { ...publication, citationMetrics: selected, citationCount: selected.total };
          }
          refreshed.add(target.value);
        }
        checked += refreshed.size;
        failed += batch.filter(target => !refreshed.has(target.value) && (malformed || invalid.has(target.value))).length;
      } catch {
        // Preserve prior snapshots and expose failures through the sync status only.
        failed += batch.length;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
  }
  return { publications: result, checked, failed };
}
