import "server-only";
import { unstable_cache } from "next/cache";
import { after } from "next/server";
import { readSnapshot, hasBlobStorage } from "@/lib/storage";
import { DATASET_TAG, seedDataset, syncPublications } from "@/lib/sync";
import { needsRefresh } from "@/lib/syncLogic";
import { enrichPublication } from "@/lib/locationExtractor";
import type { PublicationDataset } from "@/types/publication";
import { isExcludedPublication } from "@/lib/publications/eligibility";
import { deduplicatePublications } from "@/lib/publications/deduplicate";

const cachedSnapshot = unstable_cache(
  async () => (await readSnapshot())?.dataset ?? seedDataset,
  ["makris-dataset-v1", seedDataset.fetchedAt, String(seedDataset.publications.length)],
  { revalidate: 300, tags: [DATASET_TAG] },
);

export async function getPublicationDataset(): Promise<PublicationDataset> {
  let dataset: PublicationDataset;
  try {
    dataset = await cachedSnapshot();
  } catch {
    console.error(
      "Publication snapshot read failed; serving the bundled import.",
    );
    dataset = { ...seedDataset, isFallback: true };
  }
  if (needsRefresh(dataset) && (!process.env.VERCEL || hasBlobStorage())) {
    after(async () => {
      try {
        await syncPublications(true);
      } catch {
        console.error(
          "Background publication refresh failed; the previous dataset is retained.",
        );
      }
    });
  }
  const sources = [...dataset.sources];
  if (process.env.VERCEL && !hasBlobStorage()) {
    sources.push({
      source: "Automatic updates",
      status: "error",
      count: 0,
      message: "The owner needs to connect a private Blob store.",
    });
  }
  // Apply current checked-in overrides on every read, including to an older Blob snapshot.
  return {
    ...dataset,
    sources,
    publications: deduplicatePublications(dataset.publications)
      .filter((p) => !isExcludedPublication(p))
      .map((p) => enrichPublication(p)),
  };
}
