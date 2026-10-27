import type { AuthorAffiliation, Publication, PublicationVersion } from "../../types/publication";
import {
  fallbackKey,
  normalizeDoi,
  normalizeText,
  publicationId,
  sourceIdentityKeys,
  uniqueStrings,
} from "./normalize";
import {
  comparePublicationVersions,
  differentPublicationVersions,
  publicationDois,
  publicationVersions,
  samePublicationVersions,
} from "./versions";
import { mergePublicationDates } from "./dates";
import { selectCitationMetrics } from "../citations";

const quality = (p: Publication) =>
  p.source.openAlex ? 4 : p.source.ktisis ? 3 : p.source.crossref ? 2 : 1;

const authorKey = (name: string) => normalizeText(name.includes(",") ? name.split(",").reverse().join(" ") : name);
const affiliationKey = (a: AuthorAffiliation) => `${a.authorId ?? authorKey(a.author)}|${a.institutionId ?? a.institution?.toLowerCase() ?? ""}|${a.countryCode ?? ""}`;

export function mergePublications(a: Publication, b: Publication): Publication {
  const versionPreference = comparePublicationVersions(a, b);
  const preferA = versionPreference > 0 || (versionPreference === 0 &&
    (quality(a) > quality(b) || (quality(a) === quality(b) && a.updatedAt >= b.updatedAt)));
  const [preferred, other] = preferA ? [a, b] : [b, a];
  const differentVersion = differentPublicationVersions(a, b);
  const doi = normalizeDoi(preferred.doi) ?? normalizeDoi(other.doi);
  const source = differentVersion ? preferred.source : { ...other.source, ...preferred.source };
  const citationMetrics = selectCitationMetrics({ doi, source }, preferred.citationMetrics, differentVersion ? undefined : other.citationMetrics);
  const publicationDates = mergePublicationDates(doi, preferred.publicationDates, differentVersion ? undefined : other.publicationDates);
  const abstract = differentVersion ? preferred.abstract :
    (a.abstract?.length ?? 0) >= (b.abstract?.length ?? 0)
      ? a.abstract
      : b.abstract;
  const affiliations = new Map<string, AuthorAffiliation>();
  const otherAffiliations = differentVersion ? [] : other.authorAffiliations ?? [];
  const primary = preferred.authorAffiliations ?? otherAffiliations;
  const primaryAuthors = new Set(primary.map(link => authorKey(link.author)));
  const oldByKey = new Map(otherAffiliations.map(link => [affiliationKey(link), link]));
  const supplements = otherAffiliations.filter(link => {
    const sameProvider = Boolean(link.sourceUrl && Object.values(preferred.source).includes(link.sourceUrl));
    return !primaryAuthors.has(authorKey(link.author)) && (preferred.affiliationsIncomplete !== false || !sameProvider);
  });
  // A refreshed author relationship replaces the older one; only matching
  // relationships inherit resolved geography. Missing/truncated records retain
  // earlier links for uncovered authors, and other providers may fill gaps.
  for (const affiliation of [...supplements, ...primary]) {
    const key = affiliationKey(affiliation);
    const defined = Object.fromEntries(Object.entries(affiliation).filter(([, value]) => value !== undefined));
    affiliations.set(key, { ...oldByKey.get(key), ...affiliations.get(key), ...defined } as AuthorAffiliation);
  }
  const authors = differentVersion && preferred.authors.length ? preferred.authors : a.authors.length >= b.authors.length ? a.authors : b.authors;
  const authorCount = differentVersion ? preferred.authorCount ?? authors.length : Math.max(a.authorCount ?? a.authors.length, b.authorCount ?? b.authors.length);
  const covered = new Set([...affiliations.values()].map(link => authorKey(link.author)));
  const merged: Publication = {
    ...other,
    ...preferred,
    doi,
    year: publicationDates?.printYear ?? publicationDates?.year ?? preferred.year ?? other.year,
    publicationDates,
    journal: preferred.journal || other.journal,
    abstract,
    publicationUrl: preferred.publicationUrl || other.publicationUrl,
    authors,
    authorAffiliations: affiliations.size ? [...affiliations.values()] : differentVersion ? preferred.authorAffiliations : preferred.authorAffiliations ?? other.authorAffiliations,
    authorCount,
    affiliationsIncomplete: preferred.affiliationsIncomplete === true || authorCount > authors.length || authors.some(author => !covered.has(authorKey(author))),
    topics: uniqueStrings([...preferred.topics, ...other.topics]),
    keywords: uniqueStrings([
      ...(preferred.keywords ?? []),
      ...(other.keywords ?? []),
    ]),
    citationMetrics,
    citationCount: citationMetrics?.total ?? (differentVersion ? preferred.citationCount :
      a.citationCount === undefined && b.citationCount === undefined
        ? undefined
        : Math.max(a.citationCount ?? 0, b.citationCount ?? 0)),
    source,
    studyLocations: a.studyLocations.length
      ? a.studyLocations
      : b.studyLocations,
    geographyStatus: a.studyLocations.length
      ? a.geographyStatus
      : b.geographyStatus,
    discoveredAt:
      a.discoveredAt < b.discoveredAt ? a.discoveredAt : b.discoveredAt,
    updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt,
  };
  merged.id = publicationId(merged);
  const versions = new Map<string, PublicationVersion>();
  for (const version of [...publicationVersions(other), ...publicationVersions(preferred)]) {
    const key = normalizeDoi(version.doi) ? `doi:${normalizeDoi(version.doi)}` : version.id;
    if (key === merged.id) continue;
    const existing = versions.get(key);
    if (!existing) {
      versions.set(key, version);
      continue;
    }
    const source = { ...existing.source, ...version.source };
    const sourceKey = (value: Publication["source"]) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    const aliases = new Map(
      [existing.source, ...(existing.sourceAliases ?? []), version.source, ...(version.sourceAliases ?? [])]
        .map(value => [sourceKey(value), value]),
    );
    aliases.delete(sourceKey(source));
    versions.set(key, { ...existing, ...version, source,
      sourceAliases: aliases.size ? [...aliases.values()] : undefined });
  }
  merged.alternateVersions = versions.size ? [...versions.values()].sort((a, b) => a.id.localeCompare(b.id)) : undefined;
  return merged;
}

function deduplicatePass(publications: Publication[]): Publication[] {
  const output: Publication[] = [];
  const doiIndex = new Map<string, number>();
  const titleIndex = new Map<string, number[]>();
  const sourceIndex = new Map<string, number[]>();
  for (const input of publications) {
    const doi = normalizeDoi(input.doi);
    const key = fallbackKey(input);
    let index = doi ? doiIndex.get(doi) : undefined;
    if (index === undefined) {
      // ORCID summaries omit authors; the detail response for the same put-code
      // can therefore have a different fallback key. Its source identity is exact.
      index = sourceIdentityKeys(input)
        .flatMap((identity) => sourceIndex.get(identity) ?? [])
        .find(
          (candidate) =>
            !doi || !output[candidate].doi || publicationDois(output[candidate]).includes(doi),
        );
    }
    if (index === undefined) {
      // A DOI-less metadata copy can still be recognized by its original fallback key.
      index = titleIndex
        .get(key)
        ?.find(
          (candidate) =>
            !doi || !output[candidate].doi || output[candidate].doi === doi,
        );
    }
    if (index === undefined) {
      const match = output.findIndex(candidate => samePublicationVersions(input, candidate));
      if (match !== -1) index = match;
    }
    if (index === undefined) {
      index = output.length;
      output.push({ ...input, doi, id: publicationId(input) });
    } else output[index] = mergePublications(output[index], input);
    for (const knownDoi of publicationDois(output[index])) doiIndex.set(knownDoi, index);
    for (const identity of sourceIdentityKeys(output[index])) {
      const sources = sourceIndex.get(identity) ?? [];
      if (!sources.includes(index)) sources.push(index);
      sourceIndex.set(identity, sources);
    }
    const indices = titleIndex.get(key) ?? [];
    if (!indices.includes(index)) indices.push(index);
    titleIndex.set(key, indices);
  }
  return output.sort(
    (a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title),
  );
}

export function deduplicatePublications(
  publications: Publication[],
): Publication[] {
  let current = publications;
  // A late DOI detail can connect an earlier author-less summary to a DOI work.
  // Re-run only when records merged, so those newly available identities converge.
  for (;;) {
    const merged = deduplicatePass(current);
    if (merged.length === current.length) return merged;
    current = merged;
  }
}
