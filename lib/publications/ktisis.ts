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
import { isPublicationContent } from "./eligibility";

export function normalizeKtisisItem(
  value: unknown,
  now?: string,
): Publication | null {
  const item = record(value);
  const metadata = record(item.metadata);
  const values = (key: string) =>
    array(metadata[key]).map((value) => record(value).value);
  // The repository also returns awards, committees, teaching and talks. They are not publications.
  if (
    (text(item.entityType) ?? text(values("dspace.entity.type")[0])) !==
      "Publication" ||
    item.withdrawn === true
  )
    return null;
  const authors = array(metadata["dc.contributor.author"]);
  if (
    !authors.some((author) =>
      [researcher.ktisisPersonId, researcher.ktisisLegacyId].includes(
        String(record(author).authority),
      ),
    )
  )
    return null;
  const title = plainText(values("dc.title")[0]);
  if (!title || !isPublicationContent(title, text(values("dc.type")[0])))
    return null;
  const doi = [
    ...values("dc.identifier.doi"),
    ...values("dc.identifier.uri"),
    ...values("dc.identifier"),
  ]
    .map(normalizeDoi)
    .find(Boolean);
  const repositoryUrl = `https://ktisis.cut.ac.cy/entities/publication/${item.uuid ?? item.id}`;
  return makePublication(
    {
      title,
      year: normalizeYear(values("dc.date.issued")[0]),
      authors: uniqueStrings(authors.map((author) => record(author).value)),
      doi,
      journal:
        plainText(values("dc.relation.ispartof")[0]) ??
        plainText(values("dc.relation.journal")[0]),
      abstract: plainText(values("dc.description.abstract")[0]),
      keywords: uniqueStrings(values("dc.subject")),
      topics: [],
      publicationUrl: safeUrl(values("dc.identifier.uri")[0]) ?? repositoryUrl,
      source: { ktisis: repositoryUrl },
    },
    now,
  );
}

export async function fetchKtisisPublications(
  options: FetchOptions = {},
): Promise<Publication[]> {
  const publications: Publication[] = [];
  let page = 0;
  let totalPages = 1;
  while (page < totalPages) {
    const url = new URL(
      "https://ktisis.cut.ac.cy/server/api/discover/search/objects",
    );
    url.searchParams.set("f.author", `${researcher.ktisisPersonId},authority`);
    url.searchParams.set("size", "100");
    url.searchParams.set("page", String(page));
    const response = await fetchJson(url, {
      ...options,
      timeoutMs: options.timeoutMs ?? 15_000,
    });
    const results = record(
      nested(response, "_embedded", "searchResult") ??
        nested(response, "_embedded", "searchResults"),
    );
    const paging = record(results.page);
    if (typeof paging.totalPages !== "number")
      throw new Error("Ktisis returned an unexpected pagination response");
    totalPages = paging.totalPages;
    for (const object of array(nested(results, "_embedded", "objects"))) {
      const publication = normalizeKtisisItem(
        nested(object, "_embedded", "indexableObject"),
      );
      if (publication) publications.push(publication);
    }
    page++;
  }
  return publications;
}
