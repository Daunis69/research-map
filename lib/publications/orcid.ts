import researcher from "../../data/researcher.json";
import type { Publication } from "../../types/publication";
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
import { isPublicationContent } from "./eligibility";

export function normalizeOrcidWork(
  value: unknown,
  now?: string,
): Publication | null {
  const work = record(value);
  const title = plainText(nested(work, "title", "title", "value"));
  if (
    !title ||
    !isPublicationContent(
      title,
      typeof work.type === "string" ? work.type : undefined,
    )
  )
    return null;
  const externalIds = array(nested(work, "external-ids", "external-id"));
  const doi = externalIds
    .map(record)
    .filter(
      (id) =>
        id["external-id-type"] === "doi" &&
        id["external-id-relationship"] !== "part-of",
    )
    .map((id) => normalizeDoi(id["external-id-value"]))
    .find(Boolean);
  return makePublication(
    {
      title,
      year: normalizeYear(nested(work, "publication-date", "year", "value")),
      authors: uniqueStrings(
        array(nested(work, "contributors", "contributor")).map((author) =>
          nested(author, "credit-name", "value"),
        ),
      ),
      doi,
      journal: plainText(nested(work, "journal-title", "value")),
      abstract: plainText(work["short-description"]),
      topics: [],
      publicationUrl:
        safeUrl(nested(work, "url", "value")) ??
        (doi ? `https://doi.org/${doi}` : undefined),
      source: {
        orcid: `https://orcid.org/${researcher.orcid}${typeof work["put-code"] === "number" ? `/work/${work["put-code"]}` : ""}`,
      },
    },
    now,
  );
}

export function normalizeOrcidSummaries(
  value: unknown,
  now?: string,
): Publication[] {
  return array(record(value).group)
    .flatMap((group) => array(record(group)["work-summary"]))
    .map((work) => normalizeOrcidWork(work, now))
    .filter((publication): publication is Publication => publication !== null);
}

export async function fetchOrcidPublications(
  options: FetchOptions = {},
): Promise<Publication[]> {
  const base = `https://pub.orcid.org/v3.0/${researcher.orcid}`;
  const headers = { Accept: "application/vnd.orcid+json" };
  // This endpoint returns the complete grouped works list, not a first page.
  const response = record(await fetchJson(`${base}/works`, options, headers));
  if (!Array.isArray(response.group))
    throw new Error("ORCID returned an unexpected works response");
  const summaries = array(response.group).flatMap((group) =>
    array(record(group)["work-summary"]),
  );
  const codes = [
    ...new Set(
      summaries
        .map((work) => record(work)["put-code"])
        .filter((code): code is number => typeof code === "number"),
    ),
  ];
  const batches: number[][] = [];
  for (let i = 0; i < codes.length; i += 100)
    batches.push(codes.slice(i, i + 100));
  const results = await mapConcurrent(batches, 2, async (batch) =>
    fetchJson(`${base}/works/${batch.join(",")}`, options, headers),
  );
  const details = results.flatMap((result) =>
    result.status === "fulfilled"
      ? array(record(result.value).bulk).map((item) => record(item).work)
      : [],
  );
  return [...summaries, ...details]
    .map((work) => normalizeOrcidWork(work))
    .filter((publication): publication is Publication => publication !== null);
}
