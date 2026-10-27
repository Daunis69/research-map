import reviewedVersions from "../../data/publication-versions.json";
import type { Publication, PublicationVersion } from "../../types/publication";
import { canonicalAuthor, normalizeDoi, normalizeText } from "./normalize";

const preferredDois = new Map(
  reviewedVersions.flatMap(({ preferredDoi, alternateDois }) =>
    [preferredDoi, ...alternateDois].map(doi => [doi, preferredDoi] as const),
  ),
);
const preferredSources = new Map(
  reviewedVersions.flatMap(group => (group.alternateSourceUrls ?? [])
    .map(url => [url, group.preferredDoi] as const)),
);

function reviewedGroups(p: Publication): string[] {
  return [
    ...publicationDois(p).flatMap(doi => preferredDois.get(doi) ?? []),
    ...publicationVersions(p).flatMap(version => [version.source, ...(version.sourceAliases ?? [])]
      .flatMap(source => Object.values(source).flatMap(url => url ? preferredSources.get(url) ?? [] : []))),
  ];
}

export function publicationVersions(p: Publication): PublicationVersion[] {
  const { id, title, year, publicationDates, doi, journal, publicationUrl, source } = p;
  return [{ id, title, year, publicationDates, doi: normalizeDoi(doi), journal, publicationUrl, source }, ...(p.alternateVersions ?? [])];
}

export function publicationDois(p: Publication): string[] {
  return [...new Set(publicationVersions(p).flatMap(version => {
    const doi = normalizeDoi(version.doi);
    return doi ? [doi] : [];
  }))];
}

/** Exact title and corroborating authors, never general fuzzy title similarity. */
export function samePublicationVersions(a: Publication, b: Publication): boolean {
  const aDois = publicationDois(a);
  const bDois = publicationDois(b);
  if (aDois.some(doi => bDois.includes(doi))) return true;
  const aGroups = reviewedGroups(a);
  if (reviewedGroups(b).some(group => aGroups.includes(group))) return true;
  if (a.year !== null && b.year !== null && Math.abs(a.year - b.year) > 3) return false;
  const titles = publicationVersions(a).map(version => normalizeText(version.title))
    .filter(title => title && !/^(editorial|introduction|preface|correction|erratum|abstract|foreword)$/.test(title));
  if (!publicationVersions(b).some(version => titles.includes(normalizeText(version.title)))) return false;
  const authorsA = new Set(a.authors.map(canonicalAuthor));
  const authorsB = new Set(b.authors.map(canonicalAuthor));
  if (!authorsA.size || !authorsB.size) return false;
  const overlap = [...authorsA].filter(author => authorsB.has(author)).length;
  return overlap >= Math.min(2, authorsA.size, authorsB.size) &&
    overlap / Math.min(authorsA.size, authorsB.size) >= 0.6;
}

function versionQuality(p: Publication): number {
  const metadata = `${p.journal ?? ""} ${p.doi ?? ""}`;
  if (/ssrn|research square|medrxiv|biorxiv|authorea|preprint|10\.(?:2139|21203|1101|22541)\//i.test(metadata)) return 0;
  if (/conference|abstracts|proceedings|10\.1289\/(?:isee|isesisee)/i.test(metadata)) return 1;
  if (/repository|rcaap|10\.5451\/|^HAL \(/i.test(metadata)) return 2;
  return p.journal ? 4 : 3;
}

export function differentPublicationVersions(a: Publication, b: Publication): boolean {
  const doiA = normalizeDoi(a.doi);
  const doiB = normalizeDoi(b.doi);
  if (doiA && doiB) return doiA !== doiB;
  // A conference/preprint record can lack a DOI; it is still a distinct version.
  const categoryA = versionQuality(a);
  const categoryB = versionQuality(b);
  // Missing venue metadata (3) is not evidence of a different version.
  return categoryA !== 3 && categoryB !== 3 && categoryA !== categoryB;
}

/** A journal article wins over a preprint or abstract even if the latter is newer. */
export function comparePublicationVersions(a: Publication, b: Publication): number {
  const doiA = normalizeDoi(a.doi);
  const doiB = normalizeDoi(b.doi);
  if (doiA === doiB) return 0;
  if (doiA && preferredDois.get(doiB ?? "") === doiA) return 1;
  if (doiB && preferredDois.get(doiA ?? "") === doiB) return -1;
  return versionQuality(a) - versionQuality(b) || Number(Boolean(doiA)) - Number(Boolean(doiB));
}
