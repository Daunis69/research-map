import test from "node:test";
import assert from "node:assert/strict";
import { attachScholarCitations, getCitationCount, getCitationSummary, getYearCitations, chooseScholarSnapshot, withScholarReference } from "../lib/scholarCitations";
import { refreshScholarReference } from "../lib/publications/scholarSync";
import { makePublication } from "../lib/publications/normalize";
import type { Publication, ScholarCitationRecord, ScholarCitationSnapshot } from "../types/publication";

const now = "2026-10-29T08:20:43.074Z";
const record = (extra: Partial<ScholarCitationRecord> = {}): ScholarCitationRecord => ({ id: "iCd8LKAAAAAJ:fixture", url: "https://scholar.google.com/citations?user=iCd8LKAAAAAJ&citation_for_view=iCd8LKAAAAAJ:fixture&view_op=view_citation", title: "A detailed study of environmental health and drinking water exposure", authors: "A Example, KC Makris", publication: "Journal of Examples 4, 1-10", year: 2026, total: 6, ...extra });
const paper = (extra: Partial<Publication> = {}) => makePublication({ title: record().title, doi: "10.1234/example", year: 2026, authors: ["Alice Example", "Konstantinos C. Makris"], journal: "Journal of Examples", topics: ["Water"], source: {}, ...extra }, now);
const snapshot = (records: ScholarCitationRecord[] = [record()]): ScholarCitationSnapshot => ({ profile: { source: "Google Scholar", profileId: "iCd8LKAAAAAJ", url: "https://scholar.google.com/citations?user=iCd8LKAAAAAJ", name: "Konstantinos C. Makris", total: 26235, checkedAt: now, recordCount: records.length, updateStatus: "snapshot", yearly: { from: 2007, through: 2026, counts: [{ year: 2026, citations: 9046 }] } }, records });

test("public dataset preserves bibliography and metadata while omitting the private source record list", () => {
  const dataset = { publications: [paper()], fetchedAt: now, lastAttemptAt: now, sources: [{ source: "ORCID", status: "ok" as const, count: 1 }], scholarSnapshot: snapshot() };
  const result = withScholarReference(dataset, snapshot());
  assert.equal(result.citationReference?.total, 26235);
  assert.equal(Object.hasOwn(result, "scholarSnapshot"), false);
  assert.equal(result.publications.length, dataset.publications.length);
  assert.equal(result.sources, dataset.sources);
  assert.equal(result.fetchedAt, dataset.fetchedAt);
  assert.equal(result.lastAttemptAt, dataset.lastAttemptAt);
  const unchanged = { ...result.publications[0] }; delete unchanged.scholarCitations;
  assert.deepEqual(unchanged, dataset.publications[0]);
  assert.equal(dataset.scholarSnapshot.records.length, 1);
});

test("a failed or blocked refresh retains verified figures and their original observation date", async () => {
  const previous = snapshot();
  const attempt = "2026-10-30T04:00:00.000Z";
  const result = await refreshScholarReference(previous, [paper()], async () => { throw new Error("HTTP 403"); }, attempt);
  assert.equal(result.succeeded, false);
  assert.equal(result.snapshot.records, previous.records);
  assert.equal(result.snapshot.profile.total, 26235);
  assert.equal(result.snapshot.profile.checkedAt, now);
  assert.equal(result.snapshot.profile.lastAttemptAt, attempt);
  assert.equal(result.snapshot.profile.updateStatus, "snapshot");
});

test("a successful refresh accepts downward corrections and rotates only matched article histories", async () => {
  const previous = snapshot([record({ historyCheckedAt: now }), record({ id: "iCd8LKAAAAAJ:unmatched", title: "An unrelated work" })]);
  const next = snapshot([record({ total: 5 })]); next.profile.total = 25000;
  const result = await refreshScholarReference(previous, [paper()], async options => {
    assert.deepEqual(options.historyIds, [record().id]);
    assert.equal(options.previous, previous);
    return next;
  }, now);
  assert.equal(result.succeeded, true);
  assert.equal(result.snapshot.profile.total, 25000);
  assert.equal(result.snapshot.records[0].total, 5);
});

test("Scholar reference changes citation fields only and keeps profile totals separate", () => {
  const original = paper({ citationCount: 5091 });
  const result = attachScholarCitations([original], snapshot());
  assert.equal(result.profile.total, 26235);
  assert.equal(getCitationCount(result.publications[0]), 6);
  const { scholarCitations, ...unchanged } = result.publications[0];
  assert.ok(scholarCitations);
  assert.deepEqual(unchanged, original);
  assert.equal(getCitationSummary(result.publications).totalCitations, 6);
});

test("exact DOI evidence wins while a conflicting DOI cannot match by title", () => {
  const exact = record({ doi: "10.1234/example", title: "A publisher title variant" });
  assert.equal(getCitationCount(attachScholarCitations([paper()], snapshot([exact])).publications[0]), 6);
  assert.equal(getCitationCount(attachScholarCitations([paper()], snapshot([record({ doi: "10.1234/other" })])).publications[0]), undefined);
});

test("title punctuation, coauthors and online-first year support the same work", () => {
  const source = record({ title: record().title.toUpperCase() + ".", year: 2025 });
  assert.equal(getCitationCount(attachScholarCitations([paper()], snapshot([source])).publications[0]), 6);
  assert.equal(attachScholarCitations([paper()], snapshot([source])).publications[0].year, 2026);
});

test("long truncated titles match only an unambiguous publication", () => {
  const prefix = "A longitudinal environmental exposure study of children with multiple detailed biomarkers of health ";
  const a = paper({ title: prefix + "in Cyprus" });
  const b = paper({ title: prefix + "in Greece" });
  const source = record({ title: prefix.trim() + " …" });
  assert.equal(getCitationCount(attachScholarCitations([a], snapshot([source])).publications[0]), 6);
  assert.ok(attachScholarCitations([a, b], snapshot([source])).publications.every(p => !p.scholarCitations));
});

test("journal and preprint records are never added together or selected by highest count", () => {
  const primary = paper({ alternateVersions: [{ id: "preprint", title: "A preprint exposure analysis", year: 2025, doi: "10.1234/preprint", journal: "Research Square", source: {} }] });
  const preprint = record({ id: "iCd8LKAAAAAJ:preprint", url: record().url.replace('fixture','preprint'), title: "A preprint exposure analysis", year: 2025, total: 100, publication: "Research Square" });
  const result = attachScholarCitations([primary], snapshot([preprint, record()]));
  assert.equal(getCitationCount(result.publications[0]), 6);
});

test("unknown Scholar data never falls back to an OpenAlex count or becomes zero", () => {
  const unknown = paper({ title: "A completely different publication", citationCount: 999 });
  const zero = attachScholarCitations([paper()], snapshot([record({ total: 0 })])).publications[0];
  assert.equal(getCitationCount(unknown), undefined);
  assert.equal(getCitationCount(zero), 0);
  assert.equal(getCitationSummary([unknown]).totalCitations, undefined);
});

test("per-paper citation years use only that paper's Scholar history", () => {
  const source = record({ yearly: { from: 2025, through: 2026, counts: [{ year: 2025, citations: 1 }, { year: 2026, citations: 5 }] } });
  const p = attachScholarCitations([paper()], snapshot([source])).publications[0];
  assert.equal(getYearCitations(p, 2025), 1);
  assert.equal(getYearCitations(p, 2026), 5);
  assert.equal(getYearCitations(p, 2024), undefined);
  assert.equal(getYearCitations(attachScholarCitations([paper()], snapshot()).publications[0], 2026), undefined);
});

test("repeated publication inputs and stale identity-bound metrics cannot inflate totals", () => {
  const p = attachScholarCitations([paper()], snapshot()).publications[0];
  assert.equal(getCitationSummary([p, p]).totalCitations, 6);
  assert.equal(getCitationCount({ ...p, id: "another-paper" }), undefined);
  assert.equal(getCitationCount({ ...p, scholarCitations: { ...p.scholarCitations!, total: -1 } }), undefined);
});

test("a checked-in reference cannot overwrite a newer stored Scholar snapshot", () => {
  const older = snapshot();
  const newer = { ...snapshot(), profile: { ...snapshot().profile, total: 26236, checkedAt: "2026-10-30T00:00:00.000Z" } };
  assert.equal(chooseScholarSnapshot(older, newer).profile.total, 26236);
  assert.equal(chooseScholarSnapshot(newer, older).profile.total, 26236);
});
