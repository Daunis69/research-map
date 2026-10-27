import type { PublicationDateMetadata } from "../../types/publication";
import { normalizeDoi, normalizeYear, safeUrl } from "./normalize";

/** Only date evidence belonging to the canonical DOI can supply its display year. */
export function mergePublicationDates(
  doi: string | undefined,
  ...candidates: (PublicationDateMetadata | undefined)[]
): PublicationDateMetadata | undefined {
  const canonical = normalizeDoi(doi);
  if (!canonical) return undefined;
  const dates = candidates.filter((date): date is PublicationDateMetadata => Boolean(
    date && normalizeDoi(date.doi) === canonical && safeUrl(date.sourceUrl) && Number.isFinite(Date.parse(date.checkedAt)),
  )).sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt));
  if (!dates.length) return undefined;
  const latest = dates[dates.length - 1];
  const merged: PublicationDateMetadata = { doi: canonical, year: null, sourceUrl: latest.sourceUrl, checkedAt: latest.checkedAt };
  for (const [field, observation] of [
    ["year", "yearCheckedAt"], ["printYear", "printCheckedAt"], ["onlineYear", "onlineCheckedAt"],
  ] as const) {
    const evidence = dates.flatMap(date => {
      const value = normalizeYear(date[field]);
      const observedAt = date[observation] ?? date.checkedAt;
      return value !== null && Number.isFinite(Date.parse(observedAt)) ? [{ value, observedAt }] : [];
    }).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt) || a.value - b.value);
    const chosen = evidence[evidence.length - 1];
    if (chosen) {
      merged[field] = chosen.value;
      merged[observation] = chosen.observedAt;
    }
  }
  return merged;
}
