export interface StudyLocation {
  name: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  confidence: "high" | "medium" | "low";
  evidence?: string;
  manuallyVerified?: boolean;
}

export interface Publication {
  id: string;
  title: string;
  year: number | null;
  /** Publisher date evidence for this DOI; journal issue/print year is preferred. */
  publicationDates?: PublicationDateMetadata;
  authors: string[];
  /** Affiliations attached to this work, never an author's current profile. */
  authorAffiliations?: AuthorAffiliation[];
  authorCount?: number;
  affiliationsIncomplete?: boolean;
  authorLocations?: AuthorLocation[];
  journal?: string;
  doi?: string;
  publicationUrl?: string;
  abstract?: string;
  topics: string[];
  keywords?: string[];
  /** Legacy study-area data retained for old imports; never used by the active map. */
  studyLocations: StudyLocation[];
  geographyStatus?: "located" | "unknown" | "non-geographic";
  citationCount?: number;
  /** Verified citations for this canonical work; missing data is not zero. */
  citationMetrics?: CitationMetrics;
  /** Primary citation reference, matched to this exact publication identity. */
  scholarCitations?: ScholarCitationMetrics;
  source: {
    openAlex?: string;
    orcid?: string;
    crossref?: string;
    ktisis?: string;
  };
  /** Other records of this same work, retained so later imports cannot recreate duplicates. */
  alternateVersions?: PublicationVersion[];
  discoveredAt: string;
  updatedAt: string;
}

export type PublicationVersion = Pick<
  Publication,
  "id" | "title" | "year" | "publicationDates" | "doi" | "journal" | "publicationUrl" | "source"
> & { sourceAliases?: Publication["source"][] };

export interface PublicationDateMetadata {
  doi: string;
  year: number | null;
  printYear?: number;
  onlineYear?: number;
  /** Per-field observation times survive later responses that omit that field. */
  yearCheckedAt?: string;
  printCheckedAt?: string;
  onlineCheckedAt?: string;
  sourceUrl: string;
  checkedAt: string;
}

export interface CitationMetrics {
  source: "OpenAlex";
  workId: string;
  doi?: string;
  total: number;
  checkedAt: string;
  /** Citations received by calendar year, independently of publication year. */
  yearly?: {
    from: number;
    through: number;
    counts: { year: number; citations: number }[];
  };
}

export type CitationYearSeries = NonNullable<CitationMetrics["yearly"]>;

export interface ScholarCitationMetrics {
  source: "Google Scholar";
  publicationId: string;
  workId: string;
  url: string;
  total: number;
  checkedAt: string;
  estimated?: boolean;
  yearly?: CitationYearSeries;
}

export interface ScholarCitationRecord {
  id: string;
  url: string;
  title: string;
  authors: string;
  publication: string;
  year: number | null;
  total: number;
  estimated?: boolean;
  doi?: string;
  yearly?: CitationYearSeries;
  historyCheckedAt?: string;
}

export interface ScholarCitationProfile {
  source: "Google Scholar";
  profileId: string;
  url: string;
  name: string;
  total: number;
  recent?: { from: number; total: number };
  yearly?: CitationYearSeries;
  checkedAt: string;
  recordCount: number;
  updateStatus: "live" | "snapshot";
  lastAttemptAt?: string;
}

export interface ScholarCitationSnapshot {
  profile: ScholarCitationProfile;
  records: ScholarCitationRecord[];
}

export interface AuthorAffiliation {
  author: string;
  authorId?: string;
  institution?: string;
  institutionId?: string;
  countryCode?: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  sourceUrl?: string;
}

export interface AuthorLocation extends StudyLocation {
  authors: string[];
  institutions: string[];
  precision: "institution" | "country";
}

export interface SourceStatus {
  source: string;
  status: "ok" | "error" | "skipped";
  count: number;
  message?: string;
}

export interface PublicationDataset {
  publications: Publication[];
  fetchedAt: string;
  sources: SourceStatus[];
  isFallback?: boolean;
  lastAttemptAt?: string;
  citationReference?: ScholarCitationProfile;
  /** Stored on the server; omitted from the public page payload. */
  scholarSnapshot?: ScholarCitationSnapshot;
}

export interface LocationOverride {
  locations: StudyLocation[];
  geographyStatus?: "located" | "unknown" | "non-geographic";
  note?: string;
}
