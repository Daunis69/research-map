import type { Publication, SourceStatus } from "../../types/publication";
import { fetchJson, mapConcurrent, type FetchOptions } from "./http";
import {
  array,
  makePublication,
  nested,
  normalizeDoi,
  normalizeYear,
  plainText,
  record,
  safeUrl,
  uniqueStrings,
} from "./normalize";

export function normalizeCrossrefWork(
  value: unknown,
  now?: string,
): Publication | null {
  const work = record(value);
  const title = plainText(array(work.title)[0]);
  if (!title) return null;
  const dates = [
    work.published,
    work["published-print"],
    work["published-online"],
    work.issued,
  ];
  const year =
    dates
      .map((date) =>
        normalizeYear(array(array(record(date)["date-parts"])[0])[0]),
      )
      .find((year) => year !== null) ?? null;
  const doi = normalizeDoi(work.DOI);
  return makePublication(
    {
      title,
      year,
      doi,
      authors: uniqueStrings(
        array(work.author).map((value) => {
          const author = record(value);
          return (
            author.name ??
            [author.given, author.family]
              .filter((part) => typeof part === "string")
              .join(" ")
          );
        }),
      ),
      journal: plainText(array(work["container-title"])[0]),
      abstract: plainText(work.abstract),
      topics: [],
      keywords: uniqueStrings(array(work.subject)),
      publicationUrl:
        safeUrl(work.URL) ?? (doi ? `https://doi.org/${doi}` : undefined),
      source: {
        crossref: doi
          ? `https://api.crossref.org/works/${encodeURIComponent(doi)}`
          : undefined,
      },
    },
    now,
  );
}

export interface CrossrefResult {
  publications: Publication[];
  status: SourceStatus;
}

export async function enrichWithCrossref(
  publications: Publication[],
  options: FetchOptions = {},
  maximum = 40,
): Promise<CrossrefResult> {
  // Only DOI identities already established by a verified author source enter this queue.
  // Old successes are retained in the snapshot, so remaining works are enriched on later runs.
  const pending = publications
    .filter((publication) => publication.doi && !publication.source.crossref)
    .sort(
      (a, b) =>
        Number(!b.abstract || !b.authors.length) -
          Number(!a.abstract || !a.authors.length) ||
        (b.year ?? 0) - (a.year ?? 0),
    );
  const candidates = pending.slice(0, maximum);
  const budget = AbortSignal.timeout(45_000);
  const signal = options.signal
    ? AbortSignal.any([budget, options.signal])
    : budget;
  // Crossref's public pool permits one concurrent request. Pace single DOI
  // lookups below its five-per-second limit, even when responses are very fast.
  const results = await mapConcurrent(candidates, 1, async (publication) => {
    signal.throwIfAborted();
    if (!options.fetchImpl)
      await new Promise((resolve) => setTimeout(resolve, 250));
    const url = new URL(
      `https://api.crossref.org/works/${encodeURIComponent(publication.doi!)}`,
    );
    if (process.env.OPENALEX_EMAIL)
      url.searchParams.set("mailto", process.env.OPENALEX_EMAIL);
    const response = await fetchJson(url, {
      ...options,
      signal,
      timeoutMs: options.timeoutMs ?? 8000,
      retries: options.retries ?? 1,
    });
    const work = normalizeCrossrefWork(nested(response, "message"));
    if (!work || work.doi !== publication.doi)
      throw new Error("Crossref did not return the requested DOI identity");
    return work;
  });
  const enriched = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const failed = results.length - enriched.length;
  return {
    publications: enriched,
    status: {
      source: "Crossref",
      status: failed ? "error" : candidates.length ? "ok" : "skipped",
      count: enriched.length,
      message: candidates.length
        ? `${enriched.length} known DOIs enriched; ${failed} unavailable; ${Math.max(0, pending.length - candidates.length)} queued for a later sync.`
        : "Known DOI metadata is already enriched, or no DOI is available.",
    },
  };
}
