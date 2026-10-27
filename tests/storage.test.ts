import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test("Blob snapshots support consecutive conditional updates and reject stale writes", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--conditions=react-server",
    "--import", "tsx",
    "tests/fixtures/blob-refresh.ts",
  ]);
  assert.match(stdout, /consecutive updates verified/);
});
