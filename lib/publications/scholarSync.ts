import { attachScholarCitations } from "@/lib/scholarCitations";
import { fetchScholarCitations, type ScholarFetchOptions } from "@/lib/publications/scholar";
import type { Publication, ScholarCitationSnapshot } from "@/types/publication";

export async function refreshScholarReference(previous: ScholarCitationSnapshot, publications: Publication[],
  refresh: (options: ScholarFetchOptions) => Promise<ScholarCitationSnapshot> = fetchScholarCitations,
  now = new Date().toISOString(),
) {
  const matched = attachScholarCitations(publications, previous);
  const ids = new Set(matched.publications.flatMap(p => p.scholarCitations ? [p.scholarCitations.workId] : []));
  // Rotate bounded article checks so histories are refreshed across the whole collection.
  const historyIds = previous.records.filter(r => ids.has(r.id) && r.total > 0)
    .sort((a, b) => Date.parse(a.historyCheckedAt ?? "1970-01-01") - Date.parse(b.historyCheckedAt ?? "1970-01-01"))
    .slice(0, 16).map(r => r.id);
  try {
    const snapshot = await refresh({ previous, historyIds, now });
    return { snapshot, succeeded: true };
  } catch {
    // A blocked, partial or failed request cannot replace verified figures or their checked date.
    return { snapshot: { ...previous, profile: { ...previous.profile, updateStatus: "snapshot" as const, lastAttemptAt: now } }, succeeded: false };
  }
}
