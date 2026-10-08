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

test("same title with distinct first author, year or DOI is retained separately", () => {
  assert.equal(
    deduplicatePublications([
      paper(),
      paper({ authors: ["Alex Jones"] }),
      paper({ year: 2021 }),
    ]).length,
    3,
  );
  assert.equal(
    deduplicatePublications([
      paper({ doi: "10.1234/preprint" }),
      paper({ doi: "10.1234/final" }),
    ]).length,
    2,
  );
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
