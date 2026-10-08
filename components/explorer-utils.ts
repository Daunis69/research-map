import type { Publication, StudyLocation } from "@/types/publication";

export type View = "map" | "timeline" | "publications";
export type Sort = "newest" | "oldest" | "title" | "citations";
export interface ExplorerFilters {
  q: string;
  year: string;
  from: string;
  to: string;
  country: string;
  city: string;
  place: string;
  topic: string;
  geography: string;
  sort: Sort;
}

export function hasCoordinates(
  location: StudyLocation,
): location is StudyLocation & { latitude: number; longitude: number } {
  return (
    typeof location.latitude === "number" &&
    Number.isFinite(location.latitude) &&
    Math.abs(location.latitude) <= 90 &&
    typeof location.longitude === "number" &&
    Number.isFinite(location.longitude) &&
    Math.abs(location.longitude) <= 180
  );
}

export function geographyStatus(publication: Publication) {
  return (
    publication.geographyStatus ??
    (publication.studyLocations.length ? "located" : "unknown")
  );
}

export function locationLabel(publication: Publication) {
  if (geographyStatus(publication) === "non-geographic")
    return "Global / Non-geographic research";
  return (
    publication.studyLocations.map((location) => location.name).join(" · ") ||
    "Location not determined"
  );
}

export function filterPublications(
  publications: Publication[],
  filters: ExplorerFilters,
) {
  const query = filters.q.trim().toLocaleLowerCase();
  return publications
    .filter((publication) => {
      if (
        query &&
        ![
          publication.title,
          ...publication.authors,
          publication.journal ?? "",
          ...publication.topics,
          ...(publication.keywords ?? []),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query)
      )
        return false;
      if (filters.year && String(publication.year) !== filters.year)
        return false;
      if (
        filters.from &&
        (publication.year === null || publication.year < Number(filters.from))
      )
        return false;
      if (
        filters.to &&
        (publication.year === null || publication.year > Number(filters.to))
      )
        return false;
      if (
        filters.country &&
        !publication.studyLocations.some(
          (location) => location.country === filters.country,
        )
      )
        return false;
      if (
        filters.city &&
        !publication.studyLocations.some(
          (location) => location.city === filters.city,
        )
      )
        return false;
      if (
        filters.place &&
        !publication.studyLocations.some(
          (location) => location.name === filters.place,
        )
      )
        return false;
      if (filters.topic && !publication.topics.includes(filters.topic))
        return false;
      if (
        filters.geography &&
        geographyStatus(publication) !== filters.geography
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      if (filters.sort === "title") return a.title.localeCompare(b.title);
      if (filters.sort === "citations")
        return (b.citationCount ?? -1) - (a.citationCount ?? -1);
      if (a.year === null)
        return b.year === null ? a.title.localeCompare(b.title) : 1;
      if (b.year === null) return -1;
      return (
        (filters.sort === "oldest" ? a.year - b.year : b.year - a.year) ||
        a.title.localeCompare(b.title)
      );
    });
}

export function countValues(values: string[]) {
  return [
    ...values
      .reduce(
        (counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1),
        new Map<string, number>(),
      )
      .entries(),
  ].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function safeExternalUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function doiUrl(doi?: string) {
  if (!doi) return undefined;
  const identifier = doi
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
  return /^10\.\d{4,9}\//.test(identifier)
    ? `https://doi.org/${encodeURI(identifier).replaceAll("?", "%3F").replaceAll("#", "%23")}`
    : undefined;
}
