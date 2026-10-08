import "server-only";
import { get, put } from "@vercel/blob";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PublicationDataset } from "@/types/publication";

const BLOB_PATH = "makris/publications-v1.json";
const LOCAL_PATH = path.join(process.cwd(), ".cache", "publications.json");

export interface StoredSnapshot {
  dataset: PublicationDataset;
  etag?: string;
}
export function hasBlobStorage() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN),
  );
}

function parseDataset(text: string): PublicationDataset {
  const value: unknown = JSON.parse(text);
  if (
    !value ||
    typeof value !== "object" ||
    !("publications" in value) ||
    !Array.isArray(value.publications) ||
    !("fetchedAt" in value) ||
    typeof value.fetchedAt !== "string" ||
    !("sources" in value) ||
    !Array.isArray(value.sources)
  ) {
    throw new Error("Invalid stored publication dataset");
  }
  for (const p of value.publications) {
    if (
      !p ||
      typeof p.id !== "string" ||
      typeof p.title !== "string" ||
      !Array.isArray(p.authors) ||
      !Array.isArray(p.topics) ||
      !Array.isArray(p.studyLocations) ||
      !p.source
    ) {
      throw new Error("Invalid publication in stored dataset");
    }
  }
  return value as PublicationDataset;
}

export async function readSnapshot(): Promise<StoredSnapshot | null> {
  if (hasBlobStorage()) {
    const result = await get(BLOB_PATH, {
      access: "private",
      useCache: false,
      abortSignal: AbortSignal.timeout(15000),
    });
    if (!result) return null;
    if (!result.stream) throw new Error("Snapshot stream unavailable");
    return {
      dataset: parseDataset(await new Response(result.stream).text()),
      etag: result.blob.etag,
    };
  }
  if (process.env.VERCEL) return null;
  try {
    const text = await readFile(LOCAL_PATH, "utf8");
    return {
      dataset: parseDataset(text),
      etag: createHash("sha256").update(text).digest("hex"),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeSnapshot(
  dataset: PublicationDataset,
  etag?: string,
): Promise<void> {
  const text = JSON.stringify(dataset);
  if (hasBlobStorage()) {
    // Conditional writes prevent overlapping cron/request refreshes losing each other's data.
    await put(BLOB_PATH, text, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: Boolean(etag),
      ...(etag ? { ifMatch: etag } : {}),
      contentType: "application/json",
      cacheControlMaxAge: 60,
      abortSignal: AbortSignal.timeout(15000),
    });
    return;
  }
  if (process.env.VERCEL)
    throw new Error(
      "Connect a private Vercel Blob store to enable persistent synchronization",
    );
  await mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  const temp = `${LOCAL_PATH}.${randomUUID()}.tmp`;
  await writeFile(temp, text, "utf8");
  await rename(temp, LOCAL_PATH);
}
