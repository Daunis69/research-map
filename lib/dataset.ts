import "server-only";
import { unstable_cache } from "next/cache";
import { after } from "next/server";
import { readSnapshot, hasBlobStorage } from "@/lib/storage";
import { DATASET_TAG, seedDataset, syncPublications } from "@/lib/sync";
import { decodeCachedDataset, encodeCachedDataset, getSyncConfigurationIssues, needsRefresh } from "@/lib/syncLogic";
import { enrichAuthorLocations } from "@/lib/authorLocations";
import type { PublicationDataset } from "@/types/publication";
import { isExcludedPublication } from "@/lib/publications/eligibility";
import { deduplicatePublications } from "@/lib/publications/deduplicate";
import { withBundledCitations } from "@/lib/citationSnapshot";

const cachedSnapshot = unstable_cache(
  async () => encodeCachedDataset((await readSnapshot())?.dataset ?? { ...seedDataset, isFallback: true }),
  ["makris-author-affiliations-gzip-v3", seedDataset.fetchedAt, String(seedDataset.publications.length)],
  { revalidate: 300, tags: [DATASET_TAG] },
);

export async function getPublicationDataset(): Promise<PublicationDataset> {
  let dataset: PublicationDataset;
  try {
    dataset = decodeCachedDataset(await cachedSnapshot());
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
  const sources = [...dataset.sources, ...getSyncConfigurationIssues({
    onVercel: Boolean(process.env.VERCEL),
    hasStorage: hasBlobStorage(),
    hasCronSecret: Boolean(process.env.CRON_SECRET),
  })];
  // Apply current checked-in overrides on every read, including to an older Blob snapshot.
  return {
    ...dataset,
    sources,
    publications: withBundledCitations(deduplicatePublications([...dataset.publications, ...seedDataset.publications]))
      .filter((p) => !isExcludedPublication(p))
      .map((p) => enrichAuthorLocations(p)),
  };
}
