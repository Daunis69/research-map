import test from "node:test";
import assert from "node:assert/strict";
import seed from "../data/publications.json";
import { normalizeCrossrefWork, enrichWithCrossref } from "../lib/publications/crossref";
import { makePublication } from "../lib/publications/normalize";
import { deduplicatePublications, mergePublications } from "../lib/publications/deduplicate";
import { compareDatasets } from "../lib/syncLogic";
import { filterPublications } from "../components/explorer-utils";
import type { Publication } from "../types/publication";

const doi = "10.1234/publication-dates";
const checkedAt = "2026-10-27T00:00:00.000Z";
const crossref = (printYear?: number, timestamp = checkedAt, identifier = doi) => normalizeCrossrefWork({
  DOI: identifier, title: ["Date classification fixture"],
  author: [{ given: "Alice", family: "Example" }, { given: "Bob", family: "Example" }],
  "container-title": ["Example Journal"],
  published: { "date-parts": [[2025, 12, 24]] },
  "published-online": { "date-parts": [[2025, 12, 24]] },
  "published-print": printYear ? { "date-parts": [[printYear, 2, 2]] } : undefined,
}, timestamp)!;
const openAlex = () => makePublication({
  title: "Date classification fixture", year: 2025, doi,
  authors: ["Alice Example", "Bob Example"], topics: [],
  source: { openAlex: "https://openalex.org/W123" },
}, "2026-10-28T00:00:00.000Z");

test("journal issue year takes priority while the online-first year is retained", () => {
  const publication = crossref(2026);
  assert.equal(publication.year, 2026);
  assert.equal(publication.publicationDates?.onlineYear, 2025);
  assert.equal(publication.publicationDates?.printYear, 2026);
  assert.equal(crossref().year, 2025);
});

test("merging richer or newer OpenAlex metadata cannot revert a verified issue year", () => {
  const corrected = mergePublications(openAlex(), crossref(2026));
  assert.equal(corrected.year, 2026);
  assert.ok(corrected.source.openAlex && corrected.source.crossref);
  assert.equal(mergePublications(corrected, openAlex()).year, 2026);
  assert.equal(deduplicatePublications([openAlex(), crossref(2026), corrected]).length, 1);
});

test("a later publisher date correction supersedes earlier issue-year evidence", () => {
  const corrected = mergePublications(openAlex(), crossref(2026));
  assert.equal(mergePublications(corrected, crossref(2027, "2026-10-29T00:00:00.000Z")).year, 2027);
});

test("a metadata response omitting a known print date retains the earlier evidence", () => {
  const result = mergePublications(crossref(2026), crossref(undefined, "2026-10-29T00:00:00.000Z"));
  assert.equal(result.year, 2026);
  assert.equal(result.publicationDates?.onlineYear, 2025);
});

test("retaining a print date never makes older evidence outrank a later publisher correction", () => {
  const initial = crossref(2026, "2026-01-01T00:00:00.000Z");
  const correction = crossref(2027, "2026-02-01T00:00:00.000Z");
  const omitted = crossref(undefined, "2026-03-01T00:00:00.000Z");
  const first = mergePublications(mergePublications(initial, correction), omitted);
  const reordered = mergePublications(mergePublications(initial, omitted), correction);
  assert.equal(first.year, 2027);
  assert.equal(reordered.year, 2027);
  assert.deepEqual(first.publicationDates, reordered.publicationDates);
});

test("a response without dates does not renew retained online or fallback year evidence", () => {
  const initial = crossref(undefined, "2026-01-01T00:00:00.000Z");
  const correction = normalizeCrossrefWork({ DOI: doi, title: [initial.title], "published-online": { "date-parts": [[2026]] } }, "2026-02-01T00:00:00.000Z")!;
  const omitted = normalizeCrossrefWork({ DOI: doi, title: [initial.title] }, "2026-03-01T00:00:00.000Z")!;
  const result = mergePublications(mergePublications(initial, omitted), correction);
  assert.equal(result.year, 2026);
  assert.equal(result.publicationDates?.onlineYear, 2026);
});

test("preprint dates cannot change the canonical journal article year", () => {
  const final = { ...openAlex(), year: 2026, journal: "Example Journal" };
  const preprint = { ...crossref(2027, checkedAt, "10.1101/123456"), journal: "bioRxiv" };
  const result = deduplicatePublications([preprint, final]);
  assert.equal(result.length, 1);
  assert.equal(result[0].doi, doi);
  assert.equal(result[0].year, 2026);
  assert.equal(result[0].publicationDates, undefined);
});

test("rechecking identical publication dates is not counted as a changed publication", () => {
  const result = compareDatasets([crossref(2026)], [crossref(2026, "2026-10-29T00:00:00.000Z")], "2026-10-29T00:00:00.000Z");
  assert.equal(result.updatedPublications, 0);
});

test("previously enriched DOIs are revisited after 30 days to discover journal issue dates", async () => {
  const old = crossref(undefined, "2020-01-01T00:00:00.000Z");
  let requests = 0;
  const result = await enrichWithCrossref([old], { fetchImpl: async () => {
    requests++;
    return Response.json({ message: { DOI: doi, title: [old.title], "published-print": { "date-parts": [[2026]] } } });
  } });
  assert.equal(requests, 1);
  assert.equal(result.publications[0]?.year, 2026);
});

test("recent successful date checks do not cause unnecessary metadata requests", async () => {
  let requests = 0;
  await enrichWithCrossref([crossref(2026, new Date().toISOString())], { fetchImpl: async () => {
    requests++;
    throw new Error("No request expected");
  } });
  assert.equal(requests, 0);
});

test("all thirteen full-title matches from the supplied 2026 list appear in the 2026 filter", () => {
  const expectedDois = [
    "10.1186/s12989-026-00694-5", "10.1186/s12889-026-27121-w", "10.21203/rs.3.rs-10572106/v1",
    "10.3390/nu18172820", "10.1016/j.jncc.2026.04.007", "10.1371/journal.pone.0326641",
    "10.1080/09603123.2025.2540476", "10.1080/09603123.2026.2638885", "10.1093/annweh/wxaf074",
    "10.1007/s00431-025-06736-y", "10.1530/etj-25-0335", "10.1016/j.envint.2025.109985", "10.1093/exposome/osaf019",
  ];
  const imported = seed.publications as Publication[];
  const correctedDois = new Set(["10.1080/09603123.2025.2540476", "10.1093/annweh/wxaf074", "10.1530/etj-25-0335", "10.1016/j.envint.2025.109985", "10.1093/exposome/osaf019"]);
  const staleSnapshot = imported.filter(p => p.doi && correctedDois.has(p.doi)).map(p => ({
    ...p, year: 2025, publicationDates: undefined, updatedAt: "2027-01-01T00:00:00.000Z",
  }));
  const publications = deduplicatePublications([...staleSnapshot, ...imported]);
  assert.equal(publications.length, deduplicatePublications(imported).length);
  const result = filterPublications(publications, { q: "", year: "2026", from: "", to: "", country: "", city: "", place: "", topic: "", geography: "", sort: "newest" });
  for (const identifier of expectedDois) assert.ok(result.some(p => p.doi === identifier), `Missing from 2026: ${identifier}`);
  assert.equal(publications.filter(p => p.doi === "10.1093/annweh/wxaf074").length, 1);
});
