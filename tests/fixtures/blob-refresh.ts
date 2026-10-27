import assert from "node:assert/strict";
import { BlobPreconditionFailedError } from "@vercel/blob";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { readSnapshot, writeSnapshot } from "../../lib/storage";
import type { PublicationDataset } from "../../types/publication";

process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_regressionstore_fake";
let revision = 1;
let concurrentUpdate = false;
let stored: PublicationDataset = { publications: [], sources: [], fetchedAt: "2026-10-01T00:00:00.000Z" };
const originalDispatcher = getGlobalDispatcher();
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);
agent.get("https://regressionstore.private.blob.vercel-storage.com")
  .intercept({ path: /.*/, method: "GET" })
  .reply((options) => {
    const headers = new Headers(options.headers as HeadersInit);
    if (headers.get("accept-encoding") === "identity") {
      return { statusCode: 504, data: "Uncompressed snapshot transfer timed out" };
    }
    const etag = `"revision-${revision}"`;
    // Compressed downloads carry weak ETags; metadata supplies the strong revision.
    return { statusCode: 200, data: JSON.stringify(stored), responseOptions: {
      headers: { etag: `W/${etag}` },
    } };
  }).persist();
agent.get("https://vercel.com")
  .intercept({ path: /.*/, method: "GET" })
  .reply(() => {
    if (concurrentUpdate) {
      concurrentUpdate = false;
      revision++;
      stored = { ...stored, fetchedAt: "2026-10-04T00:00:00.000Z" };
    }
    return { statusCode: 200, data: JSON.stringify({ etag: `"revision-${revision}"` }) };
  }).persist();
agent.get("https://vercel.com")
  .intercept({ path: /.*/, method: "PUT" })
  .reply((options) => {
    const headers = new Headers(options.headers as HeadersInit);
    if (headers.get("x-if-match") !== `"revision-${revision}"`) {
      return { statusCode: 412, data: JSON.stringify({ error: { code: "precondition_failed" } }) };
    }
    stored = JSON.parse(String(options.body)) as PublicationDataset;
    revision++;
    return { statusCode: 200, data: JSON.stringify({ url: "https://regressionstore.private.blob.vercel-storage.com/makris/publications-v1.json", pathname: "makris/publications-v1.json", etag: `"revision-${revision}"` }) };
  }).persist();

async function verify() {
  try {
    const first = await readSnapshot();
    assert.ok(first);
    assert.equal(first.etag, '"revision-1"');
    await writeSnapshot({ ...stored, fetchedAt: "2026-10-02T00:00:00.000Z" }, first.etag);
    const second = await readSnapshot();
    assert.equal(second?.dataset.fetchedAt, "2026-10-02T00:00:00.000Z");
    await writeSnapshot({ ...stored, fetchedAt: "2026-10-03T00:00:00.000Z" }, second?.etag);
    await assert.rejects(writeSnapshot({ ...stored, fetchedAt: "2026-10-01T00:00:00.000Z" }, first.etag), BlobPreconditionFailedError);
    assert.equal((await readSnapshot())?.dataset.fetchedAt, "2026-10-03T00:00:00.000Z");
    concurrentUpdate = true;
    await assert.rejects(readSnapshot(), BlobPreconditionFailedError);
    assert.equal((await readSnapshot())?.dataset.fetchedAt, "2026-10-04T00:00:00.000Z");
    console.log("consecutive updates verified");
  } finally {
    setGlobalDispatcher(originalDispatcher);
    await agent.close();
  }
}

void verify();
