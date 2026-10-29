import type { CitationSummary } from "@/lib/citations";
import type { CitationYearSeries, Publication, PublicationDataset, ScholarCitationMetrics, ScholarCitationRecord, ScholarCitationSnapshot } from "@/types/publication";
import { normalizeDoi, normalizeText } from "@/lib/publications/normalize";

export const SCHOLAR_PROFILE_ID = "iCd8LKAAAAAJ";
const validCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const validTime = (value: string) => Number.isFinite(Date.parse(value));
const titleKey = (value: string) => normalizeText(value.replace(/\([A-Z][A-Z0-9 -]{1,10}\)/g, ""));

function validUrl(value: string, id?: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "scholar.google.com" && url.pathname === "/citations" &&
      url.searchParams.get("user") === SCHOLAR_PROFILE_ID && (!id || url.searchParams.get("citation_for_view") === id);
  } catch { return false; }
}

function validSeries(series: CitationYearSeries | undefined, checkedAt: string): series is CitationYearSeries {
  if (!series || !Number.isInteger(series.from) || series.from < 1800 || !Number.isInteger(series.through) || series.through < series.from || series.through > new Date(checkedAt).getUTCFullYear() || !Array.isArray(series.counts)) return false;
  const seen = new Set<number>();
  return series.counts.every(row => {
    if (!row || !Number.isInteger(row.year) || row.year < series.from || row.year > series.through || !validCount(row.citations) || seen.has(row.year)) return false;
    seen.add(row.year); return true;
  });
}

export function getCitationMetrics(publication: Publication): ScholarCitationMetrics | undefined {
  const metric = publication.scholarCitations;
  return metric?.source === "Google Scholar" && metric.publicationId === publication.id &&
    typeof metric.workId === "string" && metric.workId.startsWith(`${SCHOLAR_PROFILE_ID}:`) && validUrl(metric.url, metric.workId) &&
    validCount(metric.total) && validTime(metric.checkedAt) ? metric : undefined;
}

export function getCitationCount(publication: Publication): number | undefined {
  return getCitationMetrics(publication)?.total;
}

export function getYearCitations(publication: Publication, year: number): number | undefined {
  const metric = getCitationMetrics(publication);
  const series = metric?.yearly;
  if (!metric || !validSeries(series, metric.checkedAt) || !Number.isInteger(year) || year < series.from || year > series.through) return undefined;
  return series.counts.find(row => row.year === year)?.citations ?? 0;
}

export function getCitationSummary(publications: Publication[]): CitationSummary {
  const papers = [...new Map(publications.map(p => [p.id, p])).values()];
  const unique = new Map<string, Publication>();
  for (const p of papers) {
    const metric = getCitationMetrics(p);
    if (!metric) continue;
    const old = unique.get(metric.workId);
    if (!old || Date.parse(metric.checkedAt) > Date.parse(getCitationMetrics(old)!.checkedAt)) unique.set(metric.workId, p);
  }
  const covered = [...unique.values()];
  const metrics = covered.map(p => getCitationMetrics(p)!);
  const histories = metrics.flatMap(m => validSeries(m.yearly, m.checkedAt) ? m.yearly! : []);
  const byYear: CitationSummary["byYear"] = [];
  if (histories.length) {
    const from = Math.min(...histories.map(s => s.from));
    const through = Math.max(...metrics.map(m => new Date(m.checkedAt).getUTCFullYear()));
    for (let year = from; year <= through; year++) {
      const counts = covered.flatMap(p => { const value = getYearCitations(p, year); return value === undefined ? [] : [value]; });
      byYear.push({ year, citations: counts.length ? counts.reduce((sum, value) => sum + value, 0) : undefined, coveredPublications: counts.length });
    }
  }
  const times = metrics.map(m => m.checkedAt).sort((a, b) => Date.parse(a) - Date.parse(b));
  return { publications: papers.length, totalCitations: metrics.length ? metrics.reduce((sum, m) => sum + m.total, 0) : undefined,
    coveredPublications: covered.length, annualCoveredPublications: histories.length, byYear,
    oldestCheckedAt: times[0], latestCheckedAt: times.at(-1) };
}

function validRecord(record: ScholarCitationRecord): boolean {
  return !!record && typeof record.id === "string" && record.id.startsWith(`${SCHOLAR_PROFILE_ID}:`) && validUrl(record.url, record.id) && typeof record.title === "string" && !!record.title.trim() && validCount(record.total);
}

export function chooseScholarSnapshot(...snapshots: (ScholarCitationSnapshot | undefined)[]): ScholarCitationSnapshot {
  const valid = snapshots.filter((s): s is ScholarCitationSnapshot => !!s && s.profile?.source === "Google Scholar" &&
    s.profile.profileId === SCHOLAR_PROFILE_ID && validUrl(s.profile.url) && validCount(s.profile.total) && validTime(s.profile.checkedAt) &&
    Array.isArray(s.records) && s.records.every(validRecord) && new Set(s.records.map(r => r.id)).size === s.records.length && s.profile.recordCount === s.records.length);
  const latest = valid.sort((a, b) => Date.parse(b.profile.checkedAt) - Date.parse(a.profile.checkedAt))[0];
  if (!latest) throw new Error("No valid Google Scholar reference snapshot");
  return latest;
}

/** Keep the source's complete record list on the server, separate from the curated bibliography. */
export function withScholarReference(dataset: PublicationDataset, snapshot: ScholarCitationSnapshot, reviewed: Record<string, string> = {}): PublicationDataset {
  const matched = attachScholarCitations(dataset.publications, snapshot, reviewed);
  const result = { ...dataset, publications: matched.publications, citationReference: matched.profile };
  delete result.scholarSnapshot;
  return result;
}

function matchScore(record: ScholarCitationRecord, publication: Publication): number {
  const doi = normalizeDoi(record.doi);
  const publicationDoi = normalizeDoi(publication.doi);
  if (doi && publicationDoi) return doi === publicationDoi ? 200 : 0;
  const years = [publication.year, publication.publicationDates?.onlineYear, ...(publication.alternateVersions ?? []).map(v => v.year)].filter((y): y is number => typeof y === "number");
  if (record.year !== null && years.length && !years.some(year => Math.abs(year - record.year!) <= 1)) return 0;
  const sourceTitle = titleKey(record.title.replace(/(?:\.{3}|…)\s*$/, ""));
  const truncated = /(?:\.{3}|…)\s*$/.test(record.title);
  const primary = titleKey(publication.title);
  let score = primary === sourceTitle ? 100 : truncated && sourceTitle.length >= 80 && primary.startsWith(sourceTitle) ? 90 : 0;
  if (!score && (publication.alternateVersions ?? []).some(v => titleKey(v.title) === sourceTitle)) score = 60;
  if (!score) return 0;
  const journal = normalizeText(publication.journal ?? "").replace(/^the /, "");
  if (journal.length >= 6 && normalizeText(record.publication).replace(/^the /, "").includes(journal)) score += 15;
  if (record.year === publication.year) score += 5;
  const surnames = record.authors.split(",").slice(0, 3).map(name => normalizeText(name).split(" ").at(-1)).filter(Boolean);
  if (surnames.some(name => publication.authors.some(author => normalizeText(author).split(" ").includes(name!)))) score += 3;
  return score;
}

/** Attach citation metadata only; the publication corpus and all other fields survive. */
export function attachScholarCitations(publications: Publication[], input: ScholarCitationSnapshot, reviewed: Record<string, string> = {}) {
  const snapshot = chooseScholarSnapshot(input);
  const assignments = new Map<string, { record: ScholarCitationRecord; score: number }>();
  const unmatchedRecords: ScholarCitationRecord[] = [];
  const ambiguousRecords: string[] = [];
  for (const record of snapshot.records) {
    const target = reviewed[record.id];
    const candidates = publications.map(p => ({ p, score: target ? p.id === target ? 300 : 0 : matchScore(record, p) }))
      .filter(c => c.score > 0).sort((a, b) => b.score - a.score);
    if (!candidates.length) { unmatchedRecords.push(record); continue; }
    if (candidates[1]?.score === candidates[0].score) { ambiguousRecords.push(record.id); continue; }
    const winner = candidates[0];
    const old = assignments.get(winner.p.id);
    if (!old || winner.score > old.score || (winner.score === old.score && record.total > old.record.total)) assignments.set(winner.p.id, { record, score: winner.score });
  }
  return {
    profile: snapshot.profile, matched: assignments.size, unmatchedRecords, ambiguousRecords,
    publications: publications.map(p => {
      const record = assignments.get(p.id)?.record;
      const scholarCitations: ScholarCitationMetrics | undefined = record ? { source: "Google Scholar", publicationId: p.id,
        workId: record.id, url: record.url, total: record.total, checkedAt: snapshot.profile.checkedAt,
        estimated: record.estimated, yearly: validSeries(record.yearly, snapshot.profile.checkedAt) ? record.yearly : undefined } : undefined;
      return { ...p, scholarCitations };
    }),
  };
}
