import test from "node:test";
import assert from "node:assert/strict";
import { parseOpenAlexCitations, selectCitationMetrics, getCitationCount, getYearCitations, getCitationSummary, withCitationMetrics } from "../lib/citations";
import { filterPublications, type ExplorerFilters } from "../components/explorer-utils";
import { makePublication } from "../lib/publications/normalize";
import { mergePublications } from "../lib/publications/deduplicate";
import { compareDatasets } from "../lib/syncLogic";
import type { CitationMetrics, Publication } from "../types/publication";

const doi = "10.1234/citations";
const now = "2026-10-27T00:00:00.000Z";
const work = (extra: Record<string, unknown> = {}) => ({ id: "https://openalex.org/W123", doi: `https://doi.org/${doi}`, cited_by_count: 12, counts_by_year: [{ year: 2025, cited_by_count: 3 }, { year: 2026, cited_by_count: 4 }], ...extra });
const metrics = (extra: Record<string, unknown> = {}, date = now) => parseOpenAlexCitations(work(extra), date)!;
const paper = (citationMetrics?: CitationMetrics, extra: Partial<Publication> = {}) => makePublication({ title: "Citation fixture", year: 2026, doi, authors: ["Alice Example"], topics: [], source: { openAlex: "https://openalex.org/W123" }, citationMetrics, citationCount: citationMetrics?.total, ...extra }, now);

test("citation parser normalizes exact identities and annual calendar counts", () => {
  const value = metrics();
  assert.equal(value.source, "OpenAlex");
  assert.equal(value.doi, doi);
  assert.equal(value.total, 12);
  assert.deepEqual(value.yearly, { from: 2012, through: 2026, counts: [{ year: 2025, citations: 3 }, { year: 2026, citations: 4 }] });
});

test("missing annual history is unavailable while a present empty series records zeros", () => {
  const missing = metrics({ counts_by_year: undefined });
  assert.equal(missing.yearly, undefined);
  assert.equal(getYearCitations(paper(missing), 2026), undefined);
  assert.equal(getYearCitations(paper(metrics({ counts_by_year: [] })), 2026), 0);
  assert.equal(getYearCitations(paper(metrics()), 2011), undefined);
  assert.equal(getYearCitations(paper(metrics()), 2027), undefined);
});

test("malformed and duplicate annual rows cannot inflate counts or invent future years", () => {
  const value = metrics({ counts_by_year: [
    { year: 2026, cited_by_count: 2 }, { year: 2026, cited_by_count: 4 },
    { year: 2027, cited_by_count: 100 }, { year: 2011, cited_by_count: 100 },
  ] });
  assert.deepEqual(value.yearly?.counts, [{ year: 2026, citations: 4 }]);
  assert.equal(metrics({ counts_by_year: "invalid" }).yearly, undefined);
  for (const invalid of [{ year: 2025, cited_by_count: -1 }, { year: 2024, cited_by_count: "12" }, { year: 2023.5, cited_by_count: 10 }, { year: 2022, cited_by_count: Infinity }]) {
    assert.equal(metrics({ counts_by_year: [invalid] }).yearly, undefined);
  }
});

test("citation totals must be finite nonnegative safe integers attached to a valid work", () => {
  for (const total of [undefined, null, -1, 1.5, Infinity, NaN, "12", Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseOpenAlexCitations(work({ cited_by_count: total }), now), undefined);
  }
  assert.equal(parseOpenAlexCitations(work({ id: "https://evil.test/W123" }), now), undefined);
  assert.equal(parseOpenAlexCitations(work(), "invalid"), undefined);
  assert.equal(getCitationCount(paper(metrics({ cited_by_count: 0, counts_by_year: [] }))), 0);
  assert.equal(getCitationCount(paper(undefined, { citationCount: 12 })), undefined);
});

test("newest whole snapshot wins even when a source corrects its total downward", () => {
  const old = metrics({}, "2026-10-26T00:00:00.000Z");
  const fresh = metrics({ cited_by_count: 8, counts_by_year: undefined });
  assert.equal(selectCitationMetrics(paper(), old, fresh), fresh);
  assert.equal(selectCitationMetrics(paper(), fresh, old), fresh);
  assert.equal(selectCitationMetrics(paper(), old, fresh)?.yearly, undefined);
});

test("canonical DOI scope rejects citation metadata from another version", () => {
  const preprint = metrics({ doi: "https://doi.org/10.1234/preprint", cited_by_count: 100 });
  assert.equal(selectCitationMetrics(paper(), preprint), undefined);
  assert.equal(getCitationCount(paper(preprint)), undefined);
  assert.equal(selectCitationMetrics(paper(undefined, { doi: undefined }), metrics())?.total, 12);
  assert.equal(selectCitationMetrics(paper(undefined, { doi: undefined, source: {} }), metrics()), undefined);
});

test("publication merging preserves newest citation evidence independently of metadata preference", () => {
  const fresh = paper(metrics({ cited_by_count: 8 }), { updatedAt: "2026-10-26T00:00:00.000Z" });
  const stale = paper(metrics({}, "2026-10-25T00:00:00.000Z"), { updatedAt: now });
  for (const merged of [mergePublications(fresh, stale), mergePublications(stale, fresh)]) {
    assert.equal(merged.citationCount, 8);
    assert.equal(merged.citationMetrics?.total, 8);
  }
});

test("a preferred journal version cannot inherit a preprint's higher citation total", () => {
  const journal = paper(undefined, { journal: "Journal of Examples", source: { crossref: `https://api.crossref.org/works/${doi}` } });
  const preprint = paper(metrics({ doi: "10.1234/preprint", cited_by_count: 100 }), { doi: "10.1234/preprint", journal: "medRxiv", publicationUrl: "https://www.medrxiv.org/content/10.1234/preprint", year: 2025 });
  const merged = mergePublications(journal, preprint);
  assert.equal(merged.doi, doi);
  assert.equal(getCitationCount(merged), undefined);
  assert.equal(merged.citationCount, undefined);
});

test("summary separates lifetime totals, yearly coverage, unknowns, zeros and repeated works", () => {
  const a = paper(metrics());
  const b = paper(metrics({ id: "https://openalex.org/W456", doi: undefined, cited_by_count: 0, counts_by_year: [] }), { id: "other", doi: undefined, source: { openAlex: "https://openalex.org/W456" } });
  const unknown = paper(undefined, { id: "unknown", doi: undefined, source: {} });
  const summary = getCitationSummary([a, b, unknown, a]);
  assert.equal(summary.publications, 3);
  assert.equal(summary.coveredPublications, 2);
  assert.equal(summary.totalCitations, 12);
  assert.equal(summary.annualCoveredPublications, 2);
  assert.deepEqual(summary.byYear.find(row => row.year === 2026), { year: 2026, citations: 4, coveredPublications: 2 });
  assert.equal(summary.byYear.find(row => row.year === 2012)?.citations, 0);
  assert.equal(getCitationSummary([unknown]).totalCitations, undefined);
  assert.deepEqual(getCitationSummary([unknown]).byYear, []);
  assert.equal(getCitationSummary([a, { ...a, id: "duplicate-alias" }]).totalCitations, 12);
});

test("a 2026 journal paper can receive citations during its 2025 online-first year", () => {
  assert.equal(getYearCitations(paper(metrics()), 2025), 3);
  assert.equal(getCitationSummary([paper(metrics())]).byYear.find(row => row.year === 2025)?.citations, 3);
});

test("annual coverage does not turn unchecked years or missing histories into zeros", () => {
  const older = paper(metrics({}, "2025-10-27T00:00:00.000Z"));
  const totalOnly = paper(metrics({ id: "https://openalex.org/W456", doi: undefined, cited_by_count: 9, counts_by_year: undefined }), { id: "total-only", doi: undefined, source: { openAlex: "https://openalex.org/W456" } });
  const summary = getCitationSummary([older, totalOnly]);
  assert.equal(summary.totalCitations, 21);
  assert.equal(summary.annualCoveredPublications, 1);
  assert.equal(getYearCitations(older, 2026), undefined);
  assert.equal(getYearCitations(totalOnly, 2025), undefined);
});

test("citation check timestamps alone do not report changed publications", () => {
  const a = paper(metrics({}, "2026-10-26T00:00:00.000Z"));
  const b = paper(metrics());
  assert.equal(compareDatasets([a], [b], now).updatedPublications, 0);
  assert.equal(compareDatasets([a], [paper(metrics({ cited_by_count: 13 }))], now).updatedPublications, 1);
});

test("bundled citation evidence upgrades only exact identities and preserves newer live corrections", () => {
  const baseline = metrics();
  const fresh = metrics({ cited_by_count: 8 }, "2026-10-27T01:00:00.000Z");
  const unrelated = paper(undefined, { doi: "10.1234/unrelated", id: "unrelated" });
  const before = [paper(), unrelated, paper(fresh, { id: "fresh" })];
  const result = withCitationMetrics(before, [baseline]);
  assert.equal(result.length, before.length);
  assert.deepEqual(result.map(p => p.id), before.map(p => p.id));
  assert.equal(getCitationCount(result[0]), 12);
  assert.equal(getCitationCount(result[1]), undefined);
  assert.equal(getCitationCount(result[2]), 8);
  assert.equal(result[0].updatedAt, before[0].updatedAt);
});

test("most-cited sorting keeps verified zeros ahead of unknown legacy counts", () => {
  const scholar = (publicationId: string, total: number) => ({ source: "Google Scholar" as const, publicationId, workId: `iCd8LKAAAAAJ:${publicationId}`, url: `https://scholar.google.com/citations?user=iCd8LKAAAAAJ&citation_for_view=iCd8LKAAAAAJ:${publicationId}`, total, checkedAt: now });
  const high = paper(metrics({ cited_by_count: 12 }), { id: "high", scholarCitations: scholar("high", 12) });
  const zero = paper(metrics({ cited_by_count: 0, counts_by_year: [] }), { id: "zero", scholarCitations: scholar("zero", 0) });
  const unknown = paper(undefined, { id: "unknown", citationCount: 9999 });
  const filters: ExplorerFilters = { q: "", year: "", from: "", to: "", country: "", city: "", place: "", topic: "", geography: "", sort: "citations" };
  assert.deepEqual(filterPublications([unknown, zero, high], filters).map(p => p.id), ["high", "zero", "unknown"]);
  const selected = filterPublications([high, paper(metrics(), { year: 2025, id: "older" })], { ...filters, from: "2026", to: "2026" });
  assert.equal(getCitationSummary(selected).totalCitations, 12);
  assert.equal(getCitationSummary(selected).byYear.find(row => row.year === 2025)?.citations, 3);
});
