import researcher from "../../data/researcher.json";
import institutionData from "../../data/institutions.json";
import { enrichAuthorLocations } from "../authorLocations";
import { parseOpenAlexCitations } from "../citations";
import { validCoordinates } from "../geocode";
import type { AuthorAffiliation, Publication } from "../../types/publication";
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

export interface InstitutionGeo {
  countryCode?: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

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
  catalog: Record<string, InstitutionGeo> = institutionData as Record<string, InstitutionGeo>,
): Publication | null {
  const work = record(value);
  const title = plainText(work.title) ?? plainText(work.display_name);
  if (!title || !isPublicationContent(title, text(work.type))) return null;
  const doi = normalizeDoi(work.doi);
  const citationMetrics = parseOpenAlexCitations(work, now);
  const authorships = array(work.authorships);
  const authorAffiliations: AuthorAffiliation[] = authorships.flatMap((value) => {
    const authorship = record(value);
    const author = plainText(nested(value, "author", "display_name")) ?? plainText(authorship.raw_author_name);
    if (!author) return [];
    const authorId = safeUrl(nested(value, "author", "id"));
    const sourceUrl = safeUrl(work.id);
    const institutions = array(authorship.institutions).flatMap((item): AuthorAffiliation[] => {
      const institution = plainText(record(item).display_name);
      if (!institution) return [];
      const code = text(record(item).country_code)?.toUpperCase();
      const institutionId = safeUrl(record(item).id);
      const geo = institutionId ? catalog[institutionId] : undefined;
      return [{ ...(geo && (!code || !geo.countryCode || code === geo.countryCode) ? geo : {}),
        author, authorId, institution, institutionId,
        countryCode: code && /^[A-Z]{2}$/.test(code) ? code : undefined, sourceUrl }];
    });
    // OpenAlex can identify an affiliation country even when no institution matches.
    const countries = uniqueStrings(array(authorship.countries)).filter(code => /^[A-Z]{2}$/i.test(code));
    return [...institutions, ...countries.filter(code => !institutions.some(i => i.countryCode === code.toUpperCase()))
      .map(countryCode => ({ author, authorId, countryCode: countryCode.toUpperCase(), sourceUrl }))];
  });
  const authorCount = typeof work.authors_count === "number" && Number.isInteger(work.authors_count) && work.authors_count >= authorships.length
    ? work.authors_count : authorships.length;
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
      authorAffiliations,
      authorCount,
      affiliationsIncomplete: !authorships.length || work.is_authors_truncated === true || authorCount > authorships.length || authorships.length === 100 ||
        authorships.some(value => !authorAffiliations.some(a => a.author === (plainText(nested(value, "author", "display_name")) ?? plainText(record(value).raw_author_name)))),
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
      citationMetrics,
      citationCount: citationMetrics?.total,
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

/** Batch institution IDs only; errors leave explicitly labelled country fallbacks. */
export async function fetchInstitutionCatalog(ids: string[], options: FetchOptions = {}, maximum = 250): Promise<Record<string, InstitutionGeo>> {
  const result: Record<string, InstitutionGeo> = {};
  const safeIds = [...new Set(ids)].filter(id => /^https:\/\/openalex\.org\/I\d+$/.test(id)).slice(0, maximum);
  const budget = AbortSignal.timeout(45_000);
  const signal = options.signal ? AbortSignal.any([budget, options.signal]) : budget;
  const headers: Record<string, string> = process.env.OPENALEX_API_KEY ? { Authorization: `Bearer ${process.env.OPENALEX_API_KEY}` } : {};
  for (let start = 0; start < safeIds.length && !signal.aborted; start += 50) {
    const batch = safeIds.slice(start, start + 50);
    const url = apiUrl("/institutions");
    url.searchParams.set("filter", `ids.openalex:${batch.map(id => id.split("/").at(-1)).join("|")}`);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("select", "id,country_code,geo");
    try {
      const response = record(await fetchJson(url, { ...options, signal, timeoutMs: options.timeoutMs ?? 8000 }, headers));
      for (const item of array(response.results)) {
        const id = safeUrl(record(item).id);
        if (!id || !batch.includes(id)) continue;
        const geo = record(record(item).geo);
        const coordinates = { latitude: typeof geo.latitude === "number" ? geo.latitude : undefined, longitude: typeof geo.longitude === "number" ? geo.longitude : undefined };
        result[id] = { countryCode: text(record(item).country_code) ?? text(geo.country_code), country: text(geo.country), city: text(geo.city), ...(validCoordinates(coordinates) ? coordinates : {}) };
      }
    } catch {
      console.warn("[publications] Institution geography unavailable; retaining country-level affiliation locations.");
    }
  }
  return result;
}

export async function fetchOpenAlexPublications(
  options: FetchOptions = {},
  previous: Publication[] = [],
): Promise<Publication[]> {
  const catalog: Record<string, InstitutionGeo> = { ...institutionData };
  for (const paper of previous) for (const affiliation of paper.authorAffiliations ?? []) {
    if (affiliation.institutionId && validCoordinates(affiliation)) catalog[affiliation.institutionId] = {
      countryCode: affiliation.countryCode, country: affiliation.country, city: affiliation.city,
      latitude: affiliation.latitude, longitude: affiliation.longitude,
    };
  }
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
      "id,doi,title,type,publication_year,authorships,is_authors_truncated,primary_location,abstract_inverted_index,topics,keywords,cited_by_count,counts_by_year",
    );
    const response = record(await fetchJson(url, options, headers));
    if (!Array.isArray(response.results))
      throw new Error("OpenAlex returned an unexpected response");
    for (const value of response.results) {
      if (!hasCorroboratedOpenAlexAuthorship(value, verifiedIds)) continue;
      const publication = normalizeOpenAlexWork(value, undefined, catalog);
      if (publication) publications.push(publication);
    }
    cursor = text(nested(response, "meta", "next_cursor"));
    if (!response.results.length) break;
  }
  const ids = publications.flatMap(p => (p.authorAffiliations ?? []).map(a => a.institutionId)).filter((id): id is string => Boolean(id && !catalog[id]));
  Object.assign(catalog, await fetchInstitutionCatalog(ids, options));
  return publications.map(p => enrichAuthorLocations({ ...p, authorAffiliations: p.authorAffiliations?.map(a => {
    const geo = a.institutionId ? catalog[a.institutionId] : undefined;
    return geo && (!a.countryCode || !geo.countryCode || a.countryCode === geo.countryCode) ? { ...a, ...geo } : a;
  }) }));
}
