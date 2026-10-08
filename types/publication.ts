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
  authors: string[];
  journal?: string;
  doi?: string;
  publicationUrl?: string;
  abstract?: string;
  topics: string[];
  keywords?: string[];
  studyLocations: StudyLocation[];
  geographyStatus?: "located" | "unknown" | "non-geographic";
  citationCount?: number;
  source: {
    openAlex?: string;
    orcid?: string;
    crossref?: string;
    ktisis?: string;
  };
  discoveredAt: string;
  updatedAt: string;
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
}

export interface LocationOverride {
  locations: StudyLocation[];
  geographyStatus?: "located" | "unknown" | "non-geographic";
  note?: string;
}
