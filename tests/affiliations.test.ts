import test from "node:test";
import assert from "node:assert/strict";
import { fetchOpenAlexPublications, normalizeOpenAlexWork } from "../lib/publications/openalex";
import { mergePublications } from "../lib/publications/deduplicate";
import { normalizeCrossrefWork } from "../lib/publications/crossref";

const work = {
  id: "https://openalex.org/W123",
  title: "Water sampling in Greece",
  publication_year: 2020,
  authors_count: 2,
  authorships: [
    { author: { id: "https://openalex.org/A1", display_name: "Alice" },
      institutions: [{ id: "https://openalex.org/I1", display_name: "Cyprus University of Technology", country_code: "CY" }] },
    { author: { id: "https://openalex.org/A2", display_name: "Bob" },
      institutions: [{ id: "https://openalex.org/I2", display_name: "University of Washington", country_code: "US" }] },
  ],
};

test("paper-specific affiliations preserve the relationship between author and institution", () => {
  const paper = normalizeOpenAlexWork(work)!;
  assert.equal(paper.authorAffiliations?.length, 2);
  assert.deepEqual(paper.authorAffiliations?.map(a => [a.author, a.institution, a.countryCode]), [
    ["Alice", "Cyprus University of Technology", "CY"],
    ["Bob", "University of Washington", "US"],
  ]);
});

test("merging an older record cannot drop newly supplied affiliations", () => {
  const incoming = normalizeOpenAlexWork(work)!;
  const old = { ...incoming, authorAffiliations: undefined };
  assert.equal(mergePublications(old, incoming).authorAffiliations?.length, 2);
});

test("missing affiliations and truncated author lists are reported as incomplete", () => {
  const paper = normalizeOpenAlexWork({ ...work, authors_count: 102, authorships: [work.authorships[0], { author: { display_name: "Bob" }, institutions: [] }] })!;
  assert.equal(paper.affiliationsIncomplete, true);
  assert.equal(paper.authorCount, 102);
});

test("author locations use institution countries even when the title names a different study country", () => {
  const paper = normalizeOpenAlexWork(work)!;
  assert.deepEqual(paper.authorLocations?.map(l => l.country).sort(), ["Cyprus", "United States"]);
});

test("a paper with no affiliations stays unmapped regardless of its abstract or title", () => {
  const paper = normalizeOpenAlexWork({ ...work, abstract_inverted_index: { "Greece": [0] }, authorships: [{ author: { display_name: "Alice" }, institutions: [] }] })!;
  assert.deepEqual(paper.authorLocations, []);
});

test("shared institution locations retain both authors without duplicate pins", () => {
  const paper = normalizeOpenAlexWork({ ...work, authorships: [work.authorships[0], { ...work.authorships[0], author: { display_name: "Bob" } }] })!;
  assert.equal(paper.authorLocations?.length, 1);
  assert.deepEqual(paper.authorLocations?.[0].authors, ["Alice", "Bob"]);
  assert.equal(paper.authorLocations?.[0].precision, "country");
});

test("institution coordinates are used when supplied by the institution record", () => {
  const paper = normalizeOpenAlexWork(work, undefined, {
    "https://openalex.org/I1": { country: "Cyprus", city: "Limassol", latitude: 34.684, longitude: 33.038 },
  })!;
  assert.equal(paper.authorLocations?.find(l => l.country === "Cyprus")?.latitude, 34.684);
  assert.equal(paper.authorLocations?.find(l => l.country === "Cyprus")?.precision, "institution");
});

test("sync resolves newly encountered institutions without using author profile locations", async () => {
  const fetchImpl: typeof fetch = async input => {
    const url = new URL(String(input));
    const response = url.pathname === "/authors" ? { results: [{ id: "https://openalex.org/A5059194195", orcid: "https://orcid.org/0000-0001-5251-8619", last_known_institutions: [{ id: "https://openalex.org/I163151358" }] }] }
      : url.pathname === "/institutions" ? { results: [{ id: "https://openalex.org/I1", geo: { country: "Cyprus", country_code: "CY", city: "Limassol", latitude: 34.684, longitude: 33.038 } }] }
      : { meta: { next_cursor: null }, results: [work] };
    return new Response(JSON.stringify(response), { headers: { "Content-Type": "application/json" } });
  };
  const papers = await fetchOpenAlexPublications({ fetchImpl });
  assert.equal(papers[0]?.authorLocations?.find(l => l.country === "Cyprus")?.latitude, 34.684);
});

test("country aliases from institution records do not duplicate country filters or map points", () => {
  const paper = normalizeOpenAlexWork({ ...work, authorships: work.authorships.map(a => ({ ...a, institutions: a.institutions.map(i => ({ ...i, country_code: "NL" })) })) }, undefined, {
    "https://openalex.org/I1": { country: "The Netherlands", city: "Amsterdam", latitude: 52.374, longitude: 4.8897 },
    "https://openalex.org/I2": { country: "Netherlands", city: "Amsterdam", latitude: 52.374, longitude: 4.8897 },
  })!;
  assert.equal(paper.authorLocations?.length, 1);
  assert.equal(paper.authorLocations?.[0].country, "Netherlands");
});

test("added authors without affiliations make merged coverage incomplete", () => {
  const source = normalizeOpenAlexWork({ ...work, authorships: [work.authorships[0]], authors_count: 1 })!;
  const additional = { ...source, authors: ["Alice", "Bob"], source: { crossref: "https://api.crossref.org/works/10.1234/test" }, authorAffiliations: undefined, affiliationsIncomplete: undefined };
  assert.equal(mergePublications(source, additional).affiliationsIncomplete, true);
});

test("a complete refreshed source replaces a corrected author institution", () => {
  const previous = normalizeOpenAlexWork({ ...work, authorships: [work.authorships[0]], authors_count: 1 })!;
  const corrected = normalizeOpenAlexWork({ ...work, authorships: [{ ...work.authorships[0], institutions: work.authorships[1].institutions }], authors_count: 1 })!;
  const merged = mergePublications(corrected, previous);
  assert.deepEqual(merged.authorAffiliations?.map(a => a.countryCode), ["US"]);
});

test("Crossref preserves affiliations attached to each author on the paper", () => {
  const paper = normalizeCrossrefWork({ title: ["Test paper"], author: [{ given: "Alice", family: "Example", affiliation: [{ name: "Example University, Limassol, Cyprus" }] }] })!;
  assert.equal(paper.authorAffiliations?.[0].author, "Alice Example");
  assert.equal(paper.authorAffiliations?.[0].institution, "Example University, Limassol, Cyprus");
  assert.equal(paper.authorLocations?.[0].country, "Cyprus");
});
