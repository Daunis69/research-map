import test from "node:test";
import assert from "node:assert/strict";
import {
  compareDatasets,
  failedRefreshDataset,
  isAuthorized,
  needsRefresh,
} from "@/lib/syncLogic";
import type { Publication, PublicationDataset } from "@/types/publication";

const paper: Publication = {
  id: "fixture-1",
  title: "Test fixture",
  authors: [],
  year: null,
  topics: [],
  studyLocations: [],
  source: {},
  discoveredAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const timestamp = "2026-02-01T00:00:00.000Z";

test("ORCID author enrichment counts as an update even when fallback identity changes", () => {
  const old = {
    ...paper,
    source: { orcid: "https://orcid.org/0000-0001-5251-8619/work/1234" },
  };
  const result = compareDatasets(
    [old],
    [{ ...old, id: "work:with-author", authors: ["Jane Smith"] }],
    timestamp,
  );
  assert.equal(result.newPublications, 0);
  assert.equal(result.updatedPublications, 1);
  assert.equal(result.publications[0].discoveredAt, old.discoveredAt);
});

test("sync fails closed without a configured secret and requires exact Bearer authentication", () => {
  assert.equal(isAuthorized("Bearer undefined", undefined), false);
  assert.equal(isAuthorized(null, "secret"), false);
  assert.equal(isAuthorized("secret", "secret"), false);
  assert.equal(isAuthorized("Bearer wrong", "secret"), false);
  assert.equal(isAuthorized("Bearer secret", "secret"), true);
});

test("timestamp-only updates are not reported as changed publications", () => {
  const result = compareDatasets(
    [paper],
    [{ ...paper, updatedAt: timestamp }],
    timestamp,
  );
  assert.equal(result.updatedPublications, 0);
  assert.equal(result.newPublications, 0);
  assert.equal(result.publications[0].updatedAt, paper.updatedAt);
});

test("sync reports new and changed metadata while retaining discovery dates", () => {
  const result = compareDatasets(
    [paper],
    [
      { ...paper, citationCount: 4 },
      { ...paper, id: "fixture-2" },
    ],
    timestamp,
  );
  assert.equal(result.updatedPublications, 1);
  assert.equal(result.newPublications, 1);
  assert.equal(result.publications[0].discoveredAt, paper.discoveredAt);
  assert.equal(result.publications[0].updatedAt, timestamp);
  assert.equal(result.publications[1].discoveredAt, timestamp);
});

test("stale data retries after 24 hours and backs off failed attempts for 15 minutes", () => {
  const now = Date.parse(timestamp);
  const data: PublicationDataset = {
    publications: [paper],
    sources: [],
    fetchedAt: paper.discoveredAt,
  };
  assert.equal(needsRefresh(data, now), true);
  assert.equal(needsRefresh({ ...data, fetchedAt: timestamp }, now), false);
  assert.equal(
    needsRefresh({ ...data, lastAttemptAt: timestamp }, now + 899_999),
    false,
  );
  assert.equal(
    needsRefresh({ ...data, lastAttemptAt: timestamp }, now + 900_000),
    true,
  );
  assert.equal(needsRefresh({ ...data, fetchedAt: "invalid" }, now), true);
});

test("a newly supplied DOI updates a previously known DOI-less work", () => {
  const result = compareDatasets(
    [paper],
    [{ ...paper, id: "doi:10.1234/fixture", doi: "10.1234/fixture" }],
    timestamp,
  );
  assert.equal(result.newPublications, 0);
  assert.equal(result.updatedPublications, 1);
  assert.equal(result.publications[0].discoveredAt, paper.discoveredAt);
});

test("a failed refresh preserves publications and last success while reporting current failures", () => {
  const previous: PublicationDataset = {
    publications: [paper],
    fetchedAt: paper.discoveredAt,
    sources: [{ source: "OpenAlex", status: "ok", count: 1 }],
  };
  const sources: PublicationDataset["sources"] = [
    { source: "OpenAlex", status: "error", count: 0 },
  ];
  const failed = failedRefreshDataset(previous, sources, timestamp);
  assert.deepEqual(failed.publications, previous.publications);
  assert.equal(failed.fetchedAt, previous.fetchedAt);
  assert.equal(failed.lastAttemptAt, timestamp);
  assert.equal(failed.sources[0].status, "error");
  assert.equal(failed.isFallback, true);
});
