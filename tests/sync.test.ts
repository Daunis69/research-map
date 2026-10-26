import test from "node:test";
import * as syncLogic from "../lib/syncLogic";
import assert from "node:assert/strict";

test("an affiliation snapshot over 2MB round-trips through a cache value under 2MB", () => {
  const dataset = { publications: [{ title: "affiliation metadata ".repeat(130000) }], fetchedAt: "2026-10-14", sources: [] };
  const encoded = syncLogic.encodeCachedDataset?.(dataset as unknown as import("../types/publication").PublicationDataset);
  assert.ok(encoded && Buffer.byteLength(encoded) < 2_000_000);
  assert.deepEqual(syncLogic.decodeCachedDataset?.(encoded!), dataset);
});
import {
  compareDatasets,
  failedRefreshDataset,
  isAuthorized,
  needsRefresh,
} from "@/lib/syncLogic";
import type { Publication, PublicationDataset } from "@/types/publication";
import { deduplicatePublications } from "../lib/publications/deduplicate";

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

test("Vercel update diagnostics identify missing storage and cron authorization independently", () => {
  const cases = [
    { onVercel: true, hasStorage: false, hasCronSecret: false, expected: ["Automatic updates", "Scheduled updates"] },
    { onVercel: true, hasStorage: true, hasCronSecret: false, expected: ["Scheduled updates"] },
    { onVercel: true, hasStorage: false, hasCronSecret: true, expected: ["Automatic updates"] },
    { onVercel: true, hasStorage: true, hasCronSecret: true, expected: [] },
    { onVercel: false, hasStorage: false, hasCronSecret: false, expected: [] },
  ];
  for (const { expected, ...configuration } of cases) {
    const issues = syncLogic.getSyncConfigurationIssues?.(configuration);
    assert.deepEqual(issues?.map(issue => issue.source), expected);
    assert.ok(issues?.every(issue => issue.status === "error"));
  }
});

test("a final article replacing a known preprint counts as an update rather than a new publication", () => {
  const preprint = { ...paper, id: "doi:10.2139/ssrn.123", doi: "10.2139/ssrn.123", journal: "SSRN Electronic Journal", authors: ["Jane Smith"] };
  const final = { ...preprint, id: "doi:10.1234/final", doi: "10.1234/final", journal: "Water Research" };
  const incoming = deduplicatePublications([preprint, final]);
  const result = compareDatasets([preprint], incoming, timestamp);
  assert.equal(result.newPublications, 0);
  assert.equal(result.updatedPublications, 1);
  assert.equal(result.publications[0].discoveredAt, preprint.discoveredAt);
});

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
