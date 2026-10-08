import researcher from "../../data/researcher.json";
import type { Publication } from "../../types/publication";
import { fetchJson, type FetchOptions } from "./http";
import {
  array,
  makePublication,
  nested,
  normalizeDoi,
  normalizeYear,
  plainText,
  record,
  safeUrl,
  text,
  uniqueStrings,
} from "./normalize";
import {
  hasCorroboratedOpenAlexAuthorship,
  isExcludedPublication,
  isPublicationContent,
} from "./eligibility";

export function reconstructAbstract(value: unknown): string | undefined {
  const words: [number, string][] = [];
  for (const [word, positions] of Object.entries(record(value))) {
    for (const position of array(positions)) {
      if (
        typeof position === "number" &&
        Number.isInteger(position) &&
        position >= 0 &&
        position < 100_000
      )
        words.push([position, word]);
    }
  }
  return words.length
    ? words
        .sort((a, b) => a[0] - b[0])
        .map(([, word]) => word)
        .join(" ")
    : undefined;
}

export function normalizeOpenAlexWork(
  value: unknown,
  now?: string,
): Publication | null {
  const work = record(value);
  const title = plainText(work.title) ?? plainText(work.display_name);
  if (!title || !isPublicationContent(title, text(work.type))) return null;
  const doi = normalizeDoi(work.doi);
  if (
    isExcludedPublication({
      title,
      doi,
      source: { openAlex: safeUrl(work.id) },
    })
  )
    return null;
  return makePublication(
    {
      title,
      year: normalizeYear(work.publication_year),
      authors: uniqueStrings(
        array(work.authorships).map(
          (author) =>
            nested(author, "author", "display_name") ??
            record(author).raw_author_name,
        ),
      ),
      journal: plainText(
        nested(work, "primary_location", "source", "display_name"),
      ),
      doi,
      publicationUrl:
        safeUrl(nested(work, "primary_location", "landing_page_url")) ??
        (doi ? `https://doi.org/${doi}` : safeUrl(work.id)),
      abstract: reconstructAbstract(work.abstract_inverted_index),
      topics: uniqueStrings(
        array(work.topics).map((topic) => record(topic).display_name),
      ),
      keywords: uniqueStrings(
        array(work.keywords).map((keyword) => record(keyword).display_name),
      ),
      citationCount:
        typeof work.cited_by_count === "number"
          ? Math.max(0, work.cited_by_count)
          : undefined,
      source: { openAlex: safeUrl(work.id) },
    },
    now,
  );
}

function apiUrl(path: string): URL {
  const url = new URL(path, "https://api.openalex.org");
  if (process.env.OPENALEX_EMAIL)
    url.searchParams.set("mailto", process.env.OPENALEX_EMAIL);
  return url;
}

export async function fetchOpenAlexPublications(
  options: FetchOptions = {},
): Promise<Publication[]> {
  const headers: Record<string, string> = process.env.OPENALEX_API_KEY
    ? { Authorization: `Bearer ${process.env.OPENALEX_API_KEY}` }
    : {};
  const authorUrl = apiUrl("/authors");
  authorUrl.searchParams.set(
    "filter",
    `orcid:https://orcid.org/${researcher.orcid}`,
  );
  authorUrl.searchParams.set("per_page", "100");
  const authors = record(await fetchJson(authorUrl, options, headers));
  const verifiedIds = array(authors.results)
    .filter((author) => {
      const item = record(author);
      const orcid = text(item.orcid)?.replace(/^https?:\/\/orcid.org\//, "");
      const affiliations = [
        ...array(item.last_known_institutions),
        ...array(item.affiliations).map((value) => record(value).institution),
      ];
      return (
        orcid === researcher.orcid &&
        affiliations.some((affiliation) =>
          text(record(affiliation).id)?.endsWith(
            researcher.openAlexInstitutionId,
          ),
        )
      );
    })
    .map((author) => text(record(author).id)?.split("/").at(-1))
    .filter((id): id is string => Boolean(id));
  if (!verifiedIds.length)
    throw new Error(
      "OpenAlex identity verification did not match the verified ORCID and institution",
    );
  const publications: Publication[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined = "*";
  while (cursor) {
    if (seenCursors.has(cursor))
      throw new Error("OpenAlex repeated a pagination cursor");
    seenCursors.add(cursor);
    const url = apiUrl("/works");
    url.searchParams.set(
      "filter",
      `authorships.author.id:${verifiedIds.join("|")}`,
    );
    url.searchParams.set("per_page", "100");
    url.searchParams.set("cursor", cursor);
    url.searchParams.set(
      "select",
      "id,doi,title,type,publication_year,authorships,primary_location,abstract_inverted_index,topics,keywords,cited_by_count",
    );
    const response = record(await fetchJson(url, options, headers));
    if (!Array.isArray(response.results))
      throw new Error("OpenAlex returned an unexpected response");
    for (const value of response.results) {
      if (!hasCorroboratedOpenAlexAuthorship(value, verifiedIds)) continue;
      const publication = normalizeOpenAlexWork(value);
      if (publication) publications.push(publication);
    }
    cursor = text(nested(response, "meta", "next_cursor"));
    if (!response.results.length) break;
  }
  return publications;
}
