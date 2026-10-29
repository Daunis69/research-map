import "server-only";
import baseline from "@/data/google-scholar-citations.json";
import { chooseScholarSnapshot, withScholarReference } from "@/lib/scholarCitations";
import type { PublicationDataset, ScholarCitationSnapshot } from "@/types/publication";

export function currentScholarSnapshot(stored?: ScholarCitationSnapshot): ScholarCitationSnapshot {
  return chooseScholarSnapshot(stored, baseline as ScholarCitationSnapshot);
}

export function withCurrentScholarReference(dataset: PublicationDataset): PublicationDataset {
  return withScholarReference(dataset, currentScholarSnapshot(dataset.scholarSnapshot));
}
