import test from "node:test";
import assert from "node:assert/strict";
import * as explorerUtils from "../components/explorer-utils";
import type { PublicationDataset } from "../types/publication";

const now = Date.parse("2026-10-26T12:00:00Z");
const current: PublicationDataset = {
  publications: [],
  fetchedAt: "2026-10-26T04:00:00Z",
  sources: [{ source: "OpenAlex", status: "ok", count: 1 }],
};

test("an overdue collection never claims that automatic updates are healthy", () => {
  const stale = { ...current, fetchedAt: "2026-10-07T11:29:17.927Z" };
  const status = explorerUtils.getCollectionStatus?.(stale, now);
  assert.equal(status?.warning, true);
  assert.match(status?.label ?? "", /overdue/i);
  assert.equal(stale.fetchedAt, "2026-10-07T11:29:17.927Z");
});

test("missing persistent storage is reported even when the import is recent", () => {
  const status = explorerUtils.getCollectionStatus?.({
    ...current,
    sources: [{ source: "Automatic updates", status: "error", count: 0 }],
  }, now);
  assert.equal(status?.warning, true);
  assert.match(status?.label ?? "", /not configured/i);
});

test("missing cron authorization is distinguished from a healthy daily schedule", () => {
  const status = explorerUtils.getCollectionStatus?.({
    ...current,
    sources: [{ source: "Scheduled updates", status: "error", count: 0 }],
  }, now);
  assert.equal(status?.warning, true);
  assert.match(status?.label ?? "", /not configured/i);
});

test("a recent partial sync shows its unavailable sources instead of claiming full success", () => {
  const status = explorerUtils.getCollectionStatus?.({
    ...current,
    sources: [...current.sources, { source: "Crossref", status: "error", count: 0 }],
  }, now);
  assert.equal(status?.warning, true);
  assert.match(status?.label ?? "", /sources unavailable/i);
});

test("a saved fallback is not presented as a successful live update", () => {
  const status = explorerUtils.getCollectionStatus?.({ ...current, isFallback: true }, now);
  assert.equal(status?.warning, true);
  assert.match(status?.label ?? "", /saved/i);
});

test("only a recent collection without reported failures gets a healthy status", () => {
  const status = explorerUtils.getCollectionStatus?.(current, now);
  assert.equal(status?.warning, false);
  assert.match(status?.label ?? "", /up to date/i);
});

test("an invalid check date is treated as overdue instead of healthy", () => {
  const status = explorerUtils.getCollectionStatus?.({ ...current, fetchedAt: "invalid" }, now);
  assert.equal(status?.warning, true);
});
