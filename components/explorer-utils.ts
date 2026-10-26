import type { Publication, PublicationDataset, StudyLocation } from "@/types/publication";

export function getCollectionStatus(dataset: PublicationDataset, now = Date.now()) {
  const failed = (source: string) => dataset.sources.some(item => item.source === source && item.status === "error");
  if (failed("Automatic updates")) return {
    label: "Updates not configured",
    description: "This site is showing a saved collection. The owner needs to configure persistent storage before automatic updates can be saved.",
    warning: true,
  };
  if (failed("Scheduled updates")) return {
    label: "Daily updates not configured",
    description: "The daily refresh is not configured. Page visits can still request a refresh when persistent storage is available.",
    warning: true,
  };
  const checked = Date.parse(dataset.fetchedAt);
  if (!Number.isFinite(checked) || now - checked >= 86_400_000) return {
    label: "Refresh overdue",
    description: "The collection has not had a successful check within the last 24 hours. Saved publications remain available while refreshes are retried.",
    warning: true,
  };
  if (dataset.isFallback) return {
    label: "Saved collection",
    description: "A saved collection is being served. Its source date is shown above; it may not include the newest publications.",
    warning: true,
  };
  if (dataset.sources.some(source => source.status === "error")) return {
    label: "Some sources unavailable",
    description: "The collection was checked recently, but some metadata sources could not be refreshed. Previously imported publications are retained.",
    warning: true,
  };
  return {
    label: "Collection up to date",
    description: "The collection was checked within the last 24 hours without reported source failures.",
    warning: false,
  };
}

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

export function hasCoordinates<T extends StudyLocation>(
  location: T,
): location is T & { latitude: number; longitude: number } {
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
  return publication.authorLocations?.length ? "located" : "unknown";
}

export function locationLabel(publication: Publication) {
  return (
    (publication.authorLocations ?? []).map((location) => location.name).join(" · ") ||
    "Author locations unavailable"
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
          ...(publication.authorAffiliations ?? []).map(a => a.institution ?? ""),
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
        !(publication.authorLocations ?? []).some(
          (location) => location.country === filters.country,
        )
      )
        return false;
      if (
        filters.city &&
        !(publication.authorLocations ?? []).some(
          (location) => location.city === filters.city,
        )
      )
        return false;
      if (
        filters.place &&
        !(publication.authorLocations ?? []).some(
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
