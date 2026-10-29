import "server-only";
import { revalidateTag } from "next/cache";
import seed from "@/data/publications.json";
import type { PublicationDataset } from "@/types/publication";
import { deduplicatePublications } from "@/lib/publications/deduplicate";
import { enrichAuthorLocations } from "@/lib/authorLocations";
import {
  AllSourcesFailedError,
  fetchAllPublications,
} from "@/lib/publications/fetchAll";
import {
  compareDatasets,
  failedRefreshDataset,
  needsRefresh,
} from "@/lib/syncLogic";
import { hasBlobStorage, readSnapshot, writeSnapshot } from "@/lib/storage";
import { withBundledCitations } from "@/lib/citationSnapshot";
import { refreshPublicationCitations } from "@/lib/publications/citationSync";
import { currentScholarSnapshot } from "@/lib/scholarSnapshot";
import { refreshScholarReference } from "@/lib/publications/scholarSync";
import { attachScholarCitations } from "@/lib/scholarCitations";

export const DATASET_TAG = "makris-publications-v1";
const importedDataset = seed as PublicationDataset;
export const seedDataset: PublicationDataset = {
  ...importedDataset,
  publications: withBundledCitations(deduplicatePublications(importedDataset.publications)),
};

export interface SyncResult {
  success: boolean;
  total: number;
  newPublications: number;
  updatedPublications: number;
  timestamp: string;
  sources: PublicationDataset["sources"];
  skipped?: boolean;
}

let pendingSync: Promise<SyncResult> | undefined;

async function performSync(onlyIfStale: boolean): Promise<SyncResult> {
  if (process.env.VERCEL && !hasBlobStorage())
    throw new Error("Persistent snapshot storage is not configured");
  // Storage read failure must never be treated as an empty store and overwrite known data.
  const stored = await readSnapshot();
  const previous = stored ? { ...stored.dataset, publications: deduplicatePublications([...stored.dataset.publications, ...seedDataset.publications]) } : seedDataset;
  const timestamp = new Date().toISOString();
  if (onlyIfStale && !needsRefresh(previous)) {
    return {
      success: true,
      total: previous.publications.length,
      newPublications: 0,
      updatedPublications: 0,
      timestamp,
      sources: previous.sources,
      skipped: true,
    };
  }
  let incoming: PublicationDataset;
  try {
    incoming = await fetchAllPublications(previous.publications);
  } catch (error) {
    const statuses =
      error instanceof AllSourcesFailedError ? error.sources : previous.sources;
    await writeSnapshot(
      failedRefreshDataset(previous, statuses, timestamp),
      stored?.etag,
    );
    revalidateTag(DATASET_TAG, { expire: 0 });
    throw error;
  }
  const citations = await refreshPublicationCitations(incoming.publications);
  incoming.publications = citations.publications;
  incoming.sources.push({
    source: "OpenAlex citations", status: citations.failed ? "error" : "ok", count: citations.checked,
    message: citations.failed
      ? `Citation checks failed for ${citations.failed} known works; previously checked counts are retained.`
      : "Exact DOI/work citation lookups completed. Unindexed papers remain unavailable.",
  });
  const scholar = await refreshScholarReference(currentScholarSnapshot(previous.scholarSnapshot), incoming.publications);
  incoming.sources.push({
    source: "Google Scholar citations", status: scholar.succeeded ? "ok" : "error", count: scholar.snapshot.records.length,
    message: scholar.succeeded ? "Verified profile and paper citation counts refreshed."
      : "Google Scholar could not be checked; the last verified citation snapshot and its checked date are retained.",
  });
  const result = compareDatasets(
    previous.publications.map((p) => enrichAuthorLocations(p)),
    incoming.publications.map((p) => enrichAuthorLocations(p)),
    timestamp,
  );
  const next: PublicationDataset = {
    ...incoming,
    publications: attachScholarCitations(result.publications, scholar.snapshot).publications,
    scholarSnapshot: scholar.snapshot,
    fetchedAt: timestamp,
    lastAttemptAt: timestamp,
    isFallback: false,
  };
  await writeSnapshot(next, stored?.etag);
  revalidateTag(DATASET_TAG, { expire: 0 });
  return {
    success: true,
    total: next.publications.length,
    newPublications: result.newPublications,
    updatedPublications: result.updatedPublications,
    timestamp,
    sources: next.sources,
  };
}

export function syncPublications(onlyIfStale = false): Promise<SyncResult> {
  // Dedupe requests inside an instance; Blob ETags guard writes across instances.
  pendingSync ??= performSync(onlyIfStale).finally(() => {
    pendingSync = undefined;
  });
  return pendingSync;
}
