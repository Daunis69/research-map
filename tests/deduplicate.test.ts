import test from "node:test";
import assert from "node:assert/strict";
import { deduplicatePublications } from "../lib/publications/deduplicate";
import {
  makePublication,
  normalizeDoi,
  normalizeYear,
  publicationId,
  plainText,
} from "../lib/publications/normalize";
import type { Publication } from "../types/publication";

test("scientific less-than and greater-than expressions survive abstract cleanup", () => {
  assert.equal(
    plainText("<jats:p>p < 0.05; exposure > 2.</jats:p>"),
    "p < 0.05; exposure > 2.",
  );
});

const paper = (overrides: Partial<Publication> = {}) =>
  makePublication(
    {
      title: "Study of drinking water",
      year: 2020,
      authors: ["Jane Smith"],
      topics: [],
      source: {},
      ...overrides,
    },
    "2026-01-01T00:00:00.000Z",
  );

test("ORCID summary and detail merge by exact work identity when authors arrive later", () => {
  const source = { orcid: "https://orcid.org/0000-0001-5251-8619/work/1234" };
  const result = deduplicatePublications([
    paper({ authors: [], source }),
    paper({ authors: ["Jane Smith"], source }),
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].authors, ["Jane Smith"]);
});

test("shared author profile URLs never merge different papers", () => {
  const source = { orcid: "https://orcid.org/0000-0001-5251-8619" };
  assert.equal(
    deduplicatePublications([
      paper({ title: "First paper", source }),
      paper({ title: "Second paper", source }),
    ]).length,
    2,
  );
});

test("late source detail bridges a DOI record and an author-less summary", () => {
  const source = { orcid: "https://orcid.org/0000-0001-5251-8619/work/55" };
  const result = deduplicatePublications([
    paper({
      doi: "10.1234/bridge",
      source: { openAlex: "https://openalex.org/W55" },
    }),
    paper({ authors: [], source }),
    paper({ doi: "10.1234/bridge", source }),
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(deduplicatePublications(result), result);
});

test("DOI deduplication normalizes resolver URLs and merges complementary fields", () => {
  const result = deduplicatePublications([
    paper({
      doi: "https://doi.org/10.1234/EXAMPLE",
      source: { openAlex: "https://openalex.org/W1" },
      citationCount: 9,
    }),
    paper({
      doi: "doi:10.1234/example",
      abstract: "The study examined drinking water.",
      journal: "Example journal",
      source: { ktisis: "https://ktisis.cut.ac.cy/example" },
    }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].doi, "10.1234/example");
  assert.equal(result[0].abstract, "The study examined drinking water.");
  assert.equal(result[0].citationCount, 9);
  assert.ok(result[0].source.openAlex && result[0].source.ktisis);
});

test("fallback deduplication handles punctuation and surname-first author notation", () => {
  const result = deduplicatePublications([
    paper({ title: "Study of drinking-water", authors: ["Smith, Jane"] }),
    paper({ title: "STUDY OF DRINKING WATER", authors: ["Jane Smith"] }),
  ]);
  assert.equal(result.length, 1);
  assert.match(result[0].id, /^work:/);
});

test("same title with unrelated authors or a distant publication year stays separate", () => {
  assert.equal(
    deduplicatePublications([
      paper(),
      paper({ authors: ["Alex Jones"] }),
      paper({ year: 2010 }),
    ]).length,
    3,
  );
});

test("a preprint and final article appear once using the final DOI, year and link", () => {
  const preprint = paper({ doi: "10.2139/ssrn.12345", year: 2019,
    journal: "SSRN Electronic Journal", publicationUrl: "https://example.org/preprint",
    source: { openAlex: "https://openalex.org/W12345" } });
  const final = paper({ doi: "10.1234/final", journal: "Water Research",
    publicationUrl: "https://example.org/final", source: { orcid: "https://orcid.org/0000/work/12345" } });
  for (const input of [[preprint, final], [final, preprint], [preprint, final, preprint]]) {
    const result = deduplicatePublications(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].doi, final.doi);
    assert.equal(result[0].year, 2020);
    assert.equal(result[0].publicationUrl, final.publicationUrl);
    assert.deepEqual(deduplicatePublications(result), result);
  }
});

test("reordered authors and surname-first names do not create another publication", () => {
  const result = deduplicatePublications([
    paper({ authors: ["Jane Smith", "John Brown", "Alex Jones"] }),
    paper({ authors: ["Jones, Alex", "Smith, Jane", "Brown, John"] }),
  ]);
  assert.equal(result.length, 1);
});

test("a later conference abstract does not replace the final article", () => {
  const result = deduplicatePublications([
    paper({ doi: "10.1234/abstract", year: 2021, journal: "ISEE Conference Abstracts" }),
    paper({ doi: "10.1234/article", journal: "Environmental Research" }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].doi, "10.1234/article");
  assert.equal(result[0].year, 2020);
});

test("the final article retains its own authors, affiliations, abstract and DOI metadata source", () => {
  const result = deduplicatePublications([
    paper({ doi: "10.2139/ssrn.123", journal: "SSRN Electronic Journal",
      authors: ["Jane Smith", "John Brown"], abstract: "A longer preprint abstract with preliminary findings.",
      source: { crossref: "https://api.crossref.org/works/10.2139%2Fssrn.123" },
      authorAffiliations: [{ author: "John Brown", institution: "Preprint institution", countryCode: "GB" }] }),
    paper({ doi: "10.1234/final", journal: "Water Research", abstract: "Final findings.",
      authorAffiliations: [{ author: "Jane Smith", institution: "Final institution", countryCode: "CY" }] }),
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].authors, ["Jane Smith"]);
  assert.deepEqual(result[0].authorAffiliations?.map(a => a.institution), ["Final institution"]);
  assert.equal(result[0].abstract, "Final findings.");
  assert.equal(result[0].source.crossref, undefined);
  assert.equal(result[0].alternateVersions?.[0].source.crossref, "https://api.crossref.org/works/10.2139%2Fssrn.123");
});

test("reviewed title changes link the CIRCA-CHEM preprint to its final paper", () => {
  const result = deduplicatePublications([
    paper({ title: "An Iso-Pesticide and Time-Restricted Dietary Intervention", doi: "10.2139/ssrn.4096552", journal: "SSRN Electronic Journal" }),
    paper({ title: "A time differentiated dietary intervention effect", doi: "10.1016/j.isci.2022.105847", journal: "iScience" }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].doi, "10.1016/j.isci.2022.105847");
});

test("the CIRCA-CHEM journal article wins over both its preprint and newer conference record", () => {
  const records = [
    paper({ doi: "10.18332/popmed/164917", year: 2023, journal: "Population Medicine" }),
    paper({ doi: "10.1016/j.isci.2022.105847", year: 2022, journal: "iScience" }),
    paper({ doi: "10.2139/ssrn.4096552", year: 2022, journal: "SSRN Electronic Journal" }),
  ];
  for (const input of [records, [...records].reverse()]) {
    const result = deduplicatePublications(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].doi, "10.1016/j.isci.2022.105847");
    assert.equal(result[0].alternateVersions?.length, 2);
  }
});

test("alternate DOI and source identities survive repeated imports with changed titles", () => {
  const source = { openAlex: "https://openalex.org/W123" };
  const preprint = paper({ doi: "10.2139/ssrn.123", journal: "SSRN Electronic Journal", source });
  const final = paper({ doi: "10.1234/final", journal: "Water Research" });
  const merged = deduplicatePublications([preprint, final]);
  assert.equal(merged[0].alternateVersions?.[0].doi, preprint.doi);
  assert.equal(deduplicatePublications([...merged, { ...preprint, title: "Changed preprint title" }]).length, 1);
  assert.equal(deduplicatePublications([...merged, paper({ title: "Corrected old title", source })]).length, 1);
});

test("an old-title metadata copy joins an existing version group in either import order", () => {
  const preprint = paper({ title: "Old CIRCA-CHEM title", doi: "10.2139/ssrn.4096552", journal: "SSRN Electronic Journal" });
  const final = paper({ title: "Final CIRCA-CHEM title", doi: "10.1016/j.isci.2022.105847", journal: "iScience" });
  const [group] = deduplicatePublications([preprint, final]);
  const copy = paper({ title: preprint.title });
  assert.equal(deduplicatePublications([copy, group]).length, 1);
  assert.equal(deduplicatePublications([group, copy]).length, 1);
});

test("new source identities on an alternate DOI survive later metadata imports", () => {
  const preprint = paper({ doi: "10.2139/ssrn.123", journal: "SSRN Electronic Journal",
    source: { openAlex: "https://openalex.org/W1" } });
  const final = paper({ doi: "10.1234/final", journal: "Water Research" });
  const initial = deduplicatePublications([preprint, final]);
  const imported = { ...preprint, source: { orcid: "https://orcid.org/0000/work/99", openAlex: "https://openalex.org/W2" } };
  for (const input of [[...initial, imported], [imported, ...initial]]) {
    const next = deduplicatePublications(input);
    for (const source of [imported.source, preprint.source]) {
      const summary = paper({ title: "New summary title", authors: [], source });
      assert.equal(deduplicatePublications([...next, summary]).length, 1);
    }
  }
});

test("missing final affiliations cannot import a preprint-only author's location", () => {
  const preprint = paper({ doi: "10.2139/ssrn.123", journal: "SSRN Electronic Journal",
    authors: ["Jane Smith", "John Brown"],
    authorAffiliations: [{ author: "John Brown", institution: "Preprint institution", countryCode: "GB" }] });
  for (const authorAffiliations of [undefined, []]) {
    const final = paper({ doi: "10.1234/final", journal: "Water Research", authorAffiliations });
    const [merged] = deduplicatePublications([preprint, final]);
    assert.deepEqual(merged.authorAffiliations ?? [], []);
  }
});

test("a DOI-less conference copy cannot replace final authors or abstract", () => {
  const conference = paper({ year: 2021, journal: "Abstracts of Papers of the American Chemical Society",
    authors: ["Smith, J", "Brown, J"], abstract: "A long conference abstract with preliminary results." });
  const final = paper({ doi: "10.1234/final", journal: "Water Research", abstract: "Final results.",
    authors: ["Jane Smith", "John Brown"] });
  for (const input of [[conference, final], [final, conference]]) {
    const [merged] = deduplicatePublications(input);
    assert.deepEqual(merged.authors, final.authors);
    assert.equal(merged.abstract, final.abstract);
  }
});

test("adding a DOI and journal to an incomplete metadata copy retains its paper affiliations", () => {
  const incomplete = paper({ authorAffiliations: [{ author: "Jane Smith", institution: "Example University", countryCode: "CY" }],
    source: { openAlex: "https://openalex.org/W123" } });
  const enriched = paper({ doi: "10.1234/final", journal: "Water Research", authorAffiliations: [],
    source: { crossref: "https://api.crossref.org/works/10.1234%2Ffinal" } });
  const [merged] = deduplicatePublications([incomplete, enriched]);
  assert.deepEqual(merged.authorAffiliations?.map(a => a.countryCode), ["CY"]);
});

test("reviewed repository copies with truncated titles appear with the final article", () => {
  const suffix = "human biomonitoring and surveillance of chemical exposure in occupational settings";
  const repository = paper({ title: suffix, year: 2021, journal: "RCAAP Project by FCT", source: { openAlex: "https://openalex.org/W7139679966" } });
  const final = paper({ title: `An introduction to BASIC Guide: ${suffix}`, doi: "10.1093/annweh/wxaf074", journal: "Annals of Work Exposures and Health" });
  for (const input of [[repository, final], [final, repository]]) {
    const result = deduplicatePublications(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, final.title);
    assert.equal(result[0].year, final.year);
  }
});

test("subtitle similarity cannot merge an original article with its correction", () => {
  const title = "human biomonitoring and surveillance of chemical exposure in occupational settings";
  const repository = paper({ title, journal: "RCAAP Project by FCT", source: { openAlex: "https://openalex.org/W7139679966" } });
  const original = paper({ title: `An introduction to BASIC Guide: ${title}`, doi: "10.1093/annweh/wxaf074" });
  const correction = paper({ title: `Correction to: ${title}`, doi: "10.1234/correction" });
  for (const input of [[repository, correction, original], [original, repository, correction]]) {
    const result = deduplicatePublications(input);
    assert.equal(result.length, 2);
    assert.ok(result.some(p => p.doi === correction.doi));
    assert.ok(result.some(p => p.doi === original.doi));
  }
});

test("corrections, generic titles and similar follow-up studies stay separate", () => {
  assert.equal(deduplicatePublications([
    paper(), paper({ title: "Correction to Study of drinking water", doi: "10.1234/correction" }),
    paper({ title: "Study of drinking water in children", doi: "10.1234/children" }),
    paper({ title: "Study of drinking water in adults", doi: "10.1234/adults" }),
    paper({ title: "Editorial", doi: "10.1234/editorial-1" }),
    paper({ title: "Editorial", doi: "10.1234/editorial-2" }),
  ]).length, 6);
});

test("a fallback record merges with a subsequently discovered DOI", () => {
  const result = deduplicatePublications([
    paper(),
    paper({ doi: "10.1234/example" }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "doi:10.1234/example");
});

test("missing DOI and abstract still produce a deterministic usable publication", () => {
  const value = paper({ authors: [], year: null });
  assert.equal(value.doi, undefined);
  assert.equal(value.abstract, undefined);
  assert.equal(publicationId(value), publicationId({ ...value }));
  assert.deepEqual(value.studyLocations, []);
  assert.equal(value.geographyStatus, "unknown");
});

test("malformed DOI and unexpected year are rejected safely", () => {
  assert.equal(normalizeDoi("https://unrelated.example/paper"), undefined);
  assert.equal(normalizeDoi("10.1234/hello%20world"), undefined);
  assert.equal(normalizeYear("not-a-year"), null);
  assert.equal(normalizeYear(99999), null);
  assert.equal(normalizeYear("2021-04-11"), 2021);
});
