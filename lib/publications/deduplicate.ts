import type { Publication } from "../../types/publication";
import {
  fallbackKey,
  normalizeDoi,
  publicationId,
  sourceIdentityKeys,
  uniqueStrings,
} from "./normalize";

const quality = (p: Publication) =>
  p.source.openAlex ? 4 : p.source.ktisis ? 3 : p.source.crossref ? 2 : 1;

export function mergePublications(a: Publication, b: Publication): Publication {
  const [preferred, other] = quality(a) >= quality(b) ? [a, b] : [b, a];
  const abstract =
    (a.abstract?.length ?? 0) >= (b.abstract?.length ?? 0)
      ? a.abstract
      : b.abstract;
  const merged: Publication = {
    ...other,
    ...preferred,
    doi: normalizeDoi(a.doi) ?? normalizeDoi(b.doi),
    year: preferred.year ?? other.year,
    journal: preferred.journal || other.journal,
    abstract,
    publicationUrl: preferred.publicationUrl || other.publicationUrl,
    authors: a.authors.length >= b.authors.length ? a.authors : b.authors,
    topics: uniqueStrings([...preferred.topics, ...other.topics]),
    keywords: uniqueStrings([
      ...(preferred.keywords ?? []),
      ...(other.keywords ?? []),
    ]),
    citationCount:
      a.citationCount === undefined && b.citationCount === undefined
        ? undefined
        : Math.max(a.citationCount ?? 0, b.citationCount ?? 0),
    source: { ...other.source, ...preferred.source },
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
            !doi || !output[candidate].doi || output[candidate].doi === doi,
        );
    }
    if (index === undefined) {
      // Different DOIs can identify a preprint and its final article: never collapse them by title.
      index = titleIndex
        .get(key)
        ?.find(
          (candidate) =>
            !doi || !output[candidate].doi || output[candidate].doi === doi,
        );
    }
    if (index === undefined) {
      index = output.length;
      output.push({ ...input, doi, id: publicationId(input) });
    } else output[index] = mergePublications(output[index], input);
    if (doi) doiIndex.set(doi, index);
    for (const identity of sourceIdentityKeys(input)) {
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
