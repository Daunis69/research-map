import "server-only";
import { revalidateTag } from "next/cache";
import seed from "@/data/publications.json";
import type { PublicationDataset } from "@/types/publication";
import { enrichPublication } from "@/lib/locationExtractor";
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

export const DATASET_TAG = "makris-publications-v1";
export const seedDataset = seed as PublicationDataset;

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
  const previous = stored?.dataset ?? seedDataset;
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
  const result = compareDatasets(
    previous.publications.map((p) => enrichPublication(p)),
    incoming.publications.map((p) => enrichPublication(p)),
    timestamp,
  );
  const next: PublicationDataset = {
    ...incoming,
    publications: result.publications,
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
