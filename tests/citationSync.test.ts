import test from "node:test";
import assert from "node:assert/strict";
import type { Publication } from "../types/publication";
import { makePublication } from "../lib/publications/normalize";
import { refreshPublicationCitations } from "../lib/publications/citationSync";

const now = "2026-10-27T00:00:00.000Z";
const paper = (doi?: string, openAlex?: string): Publication => makePublication({
  title: `Citation fixture ${doi ?? openAlex ?? "unidentified"}`, year: 2020,
  doi, source: { openAlex }, authors: [], topics: [],
}, "2020-01-01T00:00:00.000Z");
const work = (doi = "10.1234/known", id = "https://openalex.org/W1", total = 3) => ({
  id, doi: `https://doi.org/${doi}`, cited_by_count: total,
  counts_by_year: [{ year: 2026, cited_by_count: total }],
});

test("citation refresh uses canonical DOI before a preprint source ID and preserves the collection", async () => {
  const original = [paper("10.1234/known", "https://openalex.org/W999"), paper()];
  const result = await refreshPublicationCitations(original, { now, fetcher: async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/works");
    assert.equal(url.searchParams.get("filter"), "doi:https://doi.org/10.1234/known");
    assert.equal(url.searchParams.get("select"), "id,doi,cited_by_count,counts_by_year");
    assert.ok(Number(url.searchParams.get("per_page")) <= 100);
    assert.equal(url.searchParams.has("api_key"), false);
    assert.ok(options?.signal);
    assert.ok((options?.timeoutMs ?? Infinity) <= 8000);
    return { results: [work()] };
  } });
  assert.equal(result.checked, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.publications.length, 2);
  assert.equal(result.publications[0].citationMetrics?.total, 3);
  assert.deepEqual(result.publications.map(p => [p.id, p.doi, p.source, p.updatedAt]), original.map(p => [p.id, p.doi, p.source, p.updatedAt]));
  assert.equal(original[0].citationMetrics, undefined);
});

test("citation refresh accepts newest downward corrections as whole snapshots", async () => {
  const original = { ...paper("10.1234/known"), citationCount: 10, citationMetrics: {
    source: "OpenAlex" as const, workId: "https://openalex.org/W1", doi: "10.1234/known",
    total: 10, checkedAt: "2025-01-01T00:00:00.000Z",
    yearly: { from: 2012, through: 2025, counts: [{ year: 2025, citations: 10 }] },
  } };
  const result = await refreshPublicationCitations([original], { now, fetcher: async () => ({ results: [work()] }) });
  assert.equal(result.publications[0].citationCount, 3);
  assert.deepEqual(result.publications[0].citationMetrics?.yearly?.counts, [{ year: 2026, citations: 3 }]);
});

test("citation refresh never uses a title match, a preprint DOI, or an unrelated work ID", async () => {
  const original = [paper("10.1234/known", "https://openalex.org/W1"), paper(undefined, "https://openalex.org/W2")];
  const result = await refreshPublicationCitations(original, { now, fetcher: async () => ({ results: [
    { ...work("10.1234/preprint", "https://openalex.org/W1", 100), title: original[0].title },
    work("10.1234/other", "https://openalex.org/W3", 200),
  ] }) });
  assert.equal(result.checked, 0);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.publications, original);
});

test("citation refresh batches unique DOI identities and exact OpenAlex ID fallbacks separately", async () => {
  const publications = Array.from({ length: 91 }, (_, n) => paper(`10.1234/paper${n}`));
  publications.push(paper("10.1234/paper0"), paper(undefined, "https://openalex.org/W200"));
  let calls = 0;
  const result = await refreshPublicationCitations(publications, { now, fetcher: async input => {
    calls++;
    const url = new URL(String(input));
    const filter = url.searchParams.get("filter")!;
    if (filter.startsWith("ids.openalex:")) {
      assert.equal(filter, "ids.openalex:W200");
      return { results: [{ id: "https://openalex.org/W200", cited_by_count: 0 }] };
    }
    const ids = filter.slice(4).split("|");
    assert.ok(ids.length <= 50);
    return { results: ids.map(id => work(id.replace("https://doi.org/", ""), `https://openalex.org/W${Number(id.match(/\d+$/)?.[0]) + 1000}`, 2)) };
  } });
  assert.equal(calls, 4);
  assert.equal(result.checked, 92);
  assert.equal(result.publications.length, 93);
  assert.equal(result.publications.at(-1)?.citationCount, 0);
  assert.equal(result.publications.at(-1)?.citationMetrics?.yearly, undefined);
  assert.equal(result.publications[91].citationCount, 2);
});

test("unindexed citations are unavailable while malformed and failed lookups are observable", async () => {
  const original = { ...paper("10.1234/known"), citationCount: 8, citationMetrics: {
    source: "OpenAlex" as const, workId: "https://openalex.org/W1", doi: "10.1234/known",
    total: 8, checkedAt: "2025-01-01T00:00:00.000Z",
  } };
  const absent = await refreshPublicationCitations([original], { now, fetcher: async () => ({ results: [] }) });
  assert.equal(absent.failed, 0);
  for (const fetcher of [
    async () => { throw new Error("Unavailable"); },
    async () => ({ unexpected: [] }),
    async () => ({ results: [null] }),
    async () => ({ results: [work("10.1234/known", "https://openalex.org/W1", -1)] }),
  ]) {
    const result = await refreshPublicationCitations([original], { now, fetcher });
    assert.equal(result.checked, 0);
    assert.equal(result.failed, 1);
    assert.deepEqual(result.publications[0], original);
  }
});

test("citation requests cannot run beyond the refresh budget even when a fetcher ignores cancellation", async () => {
  const started = performance.now();
  const result = await refreshPublicationCitations([paper("10.1234/known")], {
    now, budgetMs: 20, fetcher: async () => new Promise<never>(() => {}),
  });
  assert.equal(result.failed, 1);
  assert.equal(result.checked, 0);
  assert.ok(performance.now() - started < 1000);
});

test("citation refresh with no valid source identities performs no requests", async () => {
  const original = [paper(), paper(undefined, "https://example.com/W1"), paper(undefined, "https://openalex.org/A1")];
  const result = await refreshPublicationCitations(original, { now, fetcher: async () => { throw new Error("Must not fetch"); } });
  assert.equal(result.checked, 0);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.publications, original);
});

test("exhausted citation budget reports unattempted targets without discarding metadata", async () => {
  const original = [paper("10.1234/known")];
  const result = await refreshPublicationCitations(original, { now, budgetMs: 0, fetcher: async () => { throw new Error("Must not fetch"); } });
  assert.equal(result.checked, 0);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.publications, original);
});
