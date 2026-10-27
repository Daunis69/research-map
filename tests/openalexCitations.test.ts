import test from "node:test";
import assert from "node:assert/strict";
import { fetchOpenAlexPublications, normalizeOpenAlexWork } from "../lib/publications/openalex";

const now = "2026-10-27T00:00:00.000Z";

test("OpenAlex discovery preserves validated totals and annual citation observations", () => {
  const publication = normalizeOpenAlexWork({
    id: "https://openalex.org/W7117233116", doi: "https://doi.org/10.1093/annweh/wxaf074",
    title: "Citation observation fixture", publication_year: 2025, cited_by_count: 3,
    counts_by_year: [{ year: 2026, cited_by_count: 3 }],
  }, now)!;
  assert.equal(publication.citationCount, 3);
  assert.deepEqual(publication.citationMetrics, {
    source: "OpenAlex", workId: "https://openalex.org/W7117233116", doi: "10.1093/annweh/wxaf074",
    total: 3, checkedAt: now,
    yearly: { from: 2012, through: 2026, counts: [{ year: 2026, citations: 3 }] },
  });
});

test("OpenAlex discovery cannot expose malformed citation totals as valid observations", () => {
  for (const cited_by_count of [-1, 1.5, Infinity, "3"]) {
    const publication = normalizeOpenAlexWork({ id: "https://openalex.org/W1", title: "Invalid count fixture", cited_by_count }, now)!;
    assert.equal(publication.citationCount, undefined);
    assert.equal(publication.citationMetrics, undefined);
  }
});

test("OpenAlex discovery explicitly requests annual citation data", async () => {
  let selected: string[] = [];
  const publications = await fetchOpenAlexPublications({ fetchImpl: async input => {
    const url = new URL(String(input));
    if (url.pathname === "/authors") return Response.json({ results: [{
      id: "https://openalex.org/A1", orcid: "https://orcid.org/0000-0001-5251-8619",
      last_known_institutions: [{ id: "https://openalex.org/I163151358" }],
    }] });
    selected = url.searchParams.get("select")!.split(",");
    return Response.json({ results: [{ id: "https://openalex.org/W1", title: "Annual discovery fixture", cited_by_count: 0, counts_by_year: [] }] });
  } });
  assert.ok(selected.includes("counts_by_year"));
  assert.equal(publications[0]?.citationMetrics?.total, 0);
});
