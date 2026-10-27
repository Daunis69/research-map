import type { CitationMetrics, Publication } from "@/types/publication";
import { normalizeDoi } from "@/lib/publications/normalize";

const annualStart = 2012;
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const citationWorkId = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const match = value.match(/^(?:https?:\/\/(?:api\.)?openalex\.org\/(?:works\/)?)?(W\d+)\/?$/i);
  return match ? `https://openalex.org/${match[1].toUpperCase()}` : undefined;
};

/** OpenAlex supplies annual citations from 2012, omitting zero-activity years. */
export function parseOpenAlexCitations(value: unknown, checkedAt = new Date().toISOString()): CitationMetrics | undefined {
  const work = object(value);
  const workId = citationWorkId(work.id);
  if (!workId || !count(work.cited_by_count) || !Number.isFinite(Date.parse(checkedAt))) return undefined;
  const through = new Date(checkedAt).getUTCFullYear();
  const result: CitationMetrics = { source: "OpenAlex", workId, doi: normalizeDoi(work.doi), total: work.cited_by_count, checkedAt };
  if (!Array.isArray(work.counts_by_year) || through < annualStart) return result;
  const years = new Map<number, number>();
  for (const entry of work.counts_by_year) {
    const row = object(entry);
    if (typeof row.year !== "number" || !Number.isInteger(row.year)) return result;
    if (row.year < annualStart || row.year > through) continue;
    // Corrupt annual data cannot establish that missing years have zero citations.
    if (!count(row.cited_by_count)) return result;
    years.set(row.year, Math.max(years.get(row.year) ?? 0, row.cited_by_count));
  }
  result.yearly = { from: annualStart, through, counts: [...years].sort(([a], [b]) => a - b).map(([year, citations]) => ({ year, citations })) };
  return result;
}

function validMetrics(value: CitationMetrics | undefined): value is CitationMetrics {
  if (!value || value.source !== "OpenAlex" || citationWorkId(value.workId) !== value.workId || !count(value.total) || !Number.isFinite(Date.parse(value.checkedAt))) return false;
  if (!value.yearly) return true;
  const { from, through, counts } = value.yearly;
  if (!Number.isInteger(from) || from < annualStart || !Number.isInteger(through) || through < from || through > new Date(value.checkedAt).getUTCFullYear() || !Array.isArray(counts)) return false;
  const seen = new Set<number>();
  return counts.every(row => {
    if (!row || !Number.isInteger(row.year) || row.year < from || row.year > through || !count(row.citations) || seen.has(row.year)) return false;
    seen.add(row.year);
    return true;
  });
}

/** Choose one complete observation; never add versions or retain a stale maximum. */
export function selectCitationMetrics(publication: Pick<Publication, "doi" | "source">, ...candidates: (CitationMetrics | undefined)[]): CitationMetrics | undefined {
  const doi = normalizeDoi(publication.doi);
  const workId = citationWorkId(publication.source.openAlex);
  let selected: CitationMetrics | undefined;
  for (const metric of candidates) {
    if (!validMetrics(metric)) continue;
    if (doi ? normalizeDoi(metric.doi) !== doi : !workId || metric.workId !== workId) continue;
    if (!selected || Date.parse(metric.checkedAt) > Date.parse(selected.checkedAt)) selected = metric;
  }
  return selected;
}

export function getCitationMetrics(publication: Publication): CitationMetrics | undefined {
  return selectCitationMetrics(publication, publication.citationMetrics);
}

export function getCitationCount(publication: Publication): number | undefined {
  return getCitationMetrics(publication)?.total;
}

export function getYearCitations(publication: Publication, year: number): number | undefined {
  const series = getCitationMetrics(publication)?.yearly;
  if (!series || !Number.isInteger(year) || year < series.from || year > series.through) return undefined;
  return series.counts.find(row => row.year === year)?.citations ?? 0;
}

export interface CitationSummary {
  totalCitations: number | undefined;
  publications: number;
  coveredPublications: number;
  annualCoveredPublications: number;
  byYear: { year: number; citations: number | undefined; coveredPublications: number }[];
  oldestCheckedAt?: string;
  latestCheckedAt?: string;
}

export function getCitationSummary(publications: Publication[]): CitationSummary {
  const unique = new Map<string, Publication>();
  for (const publication of publications) {
    const metrics = getCitationMetrics(publication);
    const key = metrics?.workId ?? publication.id;
    const previous = unique.get(key);
    if (!previous || Date.parse(metrics?.checkedAt ?? "") > Date.parse(getCitationMetrics(previous)?.checkedAt ?? "")) unique.set(key, publication);
  }
  const papers = [...unique.values()];
  const metrics = papers.flatMap(p => getCitationMetrics(p) ?? []);
  const histories = metrics.flatMap(m => m.yearly ?? []);
  const byYear: CitationSummary["byYear"] = [];
  if (histories.length) {
    const from = Math.min(...histories.map(h => h.from));
    const through = Math.max(...metrics.map(m => new Date(m.checkedAt).getUTCFullYear()));
    for (let year = from; year <= through; year++) {
      const counts = papers.flatMap(p => { const value = getYearCitations(p, year); return value === undefined ? [] : [value]; });
      byYear.push({ year, citations: counts.length ? counts.reduce((sum, value) => sum + value, 0) : undefined, coveredPublications: counts.length });
    }
  }
  const times = metrics.map(m => m.checkedAt).sort((a, b) => Date.parse(a) - Date.parse(b));
  return {
    totalCitations: metrics.length ? metrics.reduce((sum, m) => sum + m.total, 0) : undefined,
    publications: papers.length,
    coveredPublications: metrics.length,
    annualCoveredPublications: histories.length,
    byYear,
    oldestCheckedAt: times[0], latestCheckedAt: times.at(-1),
  };
}

/** Apply a baseline only to known exact identities, preserving newer live data. */
export function withCitationMetrics(publications: Publication[], baseline: readonly CitationMetrics[]): Publication[] {
  const byDoi = new Map<string, CitationMetrics[]>();
  const byId = new Map<string, CitationMetrics[]>();
  for (const metric of baseline) {
    if (!validMetrics(metric)) continue;
    const doi = normalizeDoi(metric.doi);
    if (doi) byDoi.set(doi, [...byDoi.get(doi) ?? [], metric]);
    byId.set(metric.workId, [...byId.get(metric.workId) ?? [], metric]);
  }
  return publications.map(publication => {
    const doi = normalizeDoi(publication.doi);
    const candidates = doi ? byDoi.get(doi) : byId.get(citationWorkId(publication.source.openAlex) ?? "");
    const metrics = selectCitationMetrics(publication, publication.citationMetrics, ...candidates ?? []);
    return metrics ? { ...publication, citationMetrics: metrics, citationCount: metrics.total } : publication;
  });
}
