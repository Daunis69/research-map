import { createHash, timingSafeEqual } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { Publication, PublicationDataset, SourceStatus } from "@/types/publication";
import { fallbackKey, sourceIdentityKeys } from "@/lib/publications/normalize";
import { publicationVersions } from "@/lib/publications/versions";

export function describeSyncError(error: unknown, secrets: readonly (string | undefined)[] = []): string {
  let message = error instanceof Error ? error.message : "Unknown synchronization error";
  for (const secret of secrets) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }
  return message.replace(/https?:\/\/[^\s"'<>]+/gi, "[url]").slice(0, 400);
}

export function getSyncConfigurationIssues(configuration: {
  onVercel: boolean;
  hasStorage: boolean;
  hasCronSecret: boolean;
}): SourceStatus[] {
  if (!configuration.onVercel) return [];
  const issues: SourceStatus[] = [];
  if (!configuration.hasStorage) issues.push({
    source: "Automatic updates", status: "error", count: 0,
    message: "The owner needs to connect a private Blob store.",
  });
  if (!configuration.hasCronSecret) issues.push({
    source: "Scheduled updates", status: "error", count: 0,
    message: "The owner needs to configure CRON_SECRET in the Production environment and redeploy to authorize daily refreshes.",
  });
  return issues;
}

/** Next's data-cache item limit is 2MB; affiliations compress well as JSON. */
export function encodeCachedDataset(dataset: PublicationDataset): string {
  return gzipSync(JSON.stringify(dataset)).toString("base64");
}

export function decodeCachedDataset(value: string): PublicationDataset {
  return JSON.parse(gunzipSync(Buffer.from(value, "base64")).toString("utf8")) as PublicationDataset;
}

export function isAuthorized(
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !header) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(header), hash(`Bearer ${secret}`));
}

function contentFingerprint(publication: Publication): string {
  const content = {
    ...publication,
    discoveredAt: undefined,
    updatedAt: undefined,
  };
  return JSON.stringify(content);
}

/** Timestamps are not changes. Keep discovery dates stable across daily imports. */
export function compareDatasets(
  previous: Publication[],
  incoming: Publication[],
  timestamp: string,
) {
  const known = new Map(previous.flatMap(p => publicationVersions(p).map(version => [version.id, p] as const)));
  const knownSources = new Map(
    previous.flatMap((p) =>
      sourceIdentityKeys(p).map((key) => [key, p] as const),
    ),
  );
  const withoutDoi = new Map(
    previous.filter((p) => !p.doi).map((p) => [fallbackKey(p), p]),
  );
  let newPublications = 0;
  let updatedPublications = 0;
  const publications = incoming.map((publication) => {
    // Learning a DOI upgrades the identity of an existing work, not a new discovery.
    const old =
      publicationVersions(publication).map(version => known.get(version.id)).find(Boolean) ??
      (publication.doi
        ? withoutDoi.get(fallbackKey(publication))
        : undefined) ??
      sourceIdentityKeys(publication)
        .map((key) => knownSources.get(key))
        .find(
          (p) => p && (!p.doi || !publication.doi || p.doi === publication.doi),
        );
    if (!old) {
      newPublications++;
      return { ...publication, discoveredAt: timestamp, updatedAt: timestamp };
    }
    const changed = contentFingerprint(old) !== contentFingerprint(publication);
    if (changed) updatedPublications++;
    return {
      ...publication,
      discoveredAt: old.discoveredAt,
      updatedAt: changed ? timestamp : old.updatedAt,
    };
  });
  return { publications, newPublications, updatedPublications };
}

export function needsRefresh(
  dataset: PublicationDataset,
  now = Date.now(),
): boolean {
  const lastSuccess = Date.parse(dataset.fetchedAt);
  const lastAttempt = Date.parse(dataset.lastAttemptAt ?? dataset.fetchedAt);
  // A failed run can be retried after 15 minutes without hammering upstream APIs.
  return (
    (!Number.isFinite(lastSuccess) || now - lastSuccess >= 86_400_000) &&
    (!Number.isFinite(lastAttempt) || now - lastAttempt >= 900_000)
  );
}

export function failedRefreshDataset(
  previous: PublicationDataset,
  sources: PublicationDataset["sources"],
  timestamp: string,
): PublicationDataset {
  return { ...previous, sources, lastAttemptAt: timestamp, isFallback: true };
}
