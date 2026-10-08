import type {
  Publication,
  PublicationDataset,
  SourceStatus,
} from "../../types/publication";
import { enrichWithCrossref, type CrossrefResult } from "./crossref";
import { deduplicatePublications } from "./deduplicate";
import { fetchKtisisPublications } from "./ktisis";
import { fetchOpenAlexPublications } from "./openalex";
import { fetchOrcidPublications } from "./orcid";
import { isExcludedPublication } from "./eligibility";

export class AllSourcesFailedError extends Error {
  constructor(public readonly sources: SourceStatus[]) {
    super(
      "All publication discovery sources failed; the last good dataset must be retained.",
    );
    this.name = "AllSourcesFailedError";
  }
}

export interface SourceLoaders {
  openAlex: () => Promise<Publication[]>;
  orcid: () => Promise<Publication[]>;
  ktisis: () => Promise<Publication[]>;
  crossref: (publications: Publication[]) => Promise<CrossrefResult>;
}

export async function fetchAllPublications(
  previous: Publication[] = [],
  overrides: Partial<SourceLoaders> = {},
): Promise<PublicationDataset> {
  const loaders: SourceLoaders = {
    openAlex: () => fetchOpenAlexPublications(),
    orcid: () => fetchOrcidPublications(),
    ktisis: () => fetchKtisisPublications(),
    crossref: (publications) => enrichWithCrossref(publications),
    ...overrides,
  };
  const names = ["OpenAlex", "ORCID", "Ktisis"];
  const results = await Promise.allSettled([
    loaders.openAlex(),
    loaders.orcid(),
    loaders.ktisis(),
  ]);
  const sources: SourceStatus[] = results.map((result, index) => {
    if (result.status === "fulfilled")
      return {
        source: names[index],
        status: "ok",
        count: deduplicatePublications(result.value).length,
      };
    console.error(
      `[publications] ${names[index]} unavailable; retaining prior records.`,
    );
    return {
      source: names[index],
      status: "error",
      count: 0,
      message:
        "The source could not be refreshed. Previously imported records are retained.",
    };
  });
  if (results.every((result) => result.status === "rejected"))
    throw new AllSourcesFailedError(sources);
  const fresh = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (!fresh.length)
    throw new AllSourcesFailedError(
      sources.map((source) => ({
        ...source,
        message:
          "No records returned. Retaining the last good snapshot for review.",
      })),
    );
  let publications = deduplicatePublications(
    [...fresh, ...previous].filter(
      (publication) => !isExcludedPublication(publication),
    ),
  );
  try {
    const enriched = await loaders.crossref(publications);
    publications = deduplicatePublications([
      ...publications,
      ...enriched.publications,
    ]);
    sources.push(enriched.status);
  } catch {
    console.error(
      "[publications] Crossref enrichment unavailable; retaining discovery metadata.",
    );
    sources.push({
      source: "Crossref",
      status: "error",
      count: 0,
      message: "DOI enrichment is temporarily unavailable.",
    });
  }
  return { publications, fetchedAt: new Date().toISOString(), sources };
}
