import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { fetchAllPublications } from "../lib/publications/fetchAll";
import { enrichPublication } from "../lib/locationExtractor";
import type { PublicationDataset } from "../types/publication";

async function main() {
  // Node's built-in loader avoids another dependency and keeps secrets server-side.
  for (const env of [".env.local", ".env"]) {
    const envPath = resolve(process.cwd(), env);
    if (existsSync(envPath)) process.loadEnvFile(envPath);
  }
  const path = resolve(process.cwd(), "data/publications.json");
  let previous: PublicationDataset | undefined;
  try {
    previous = JSON.parse(await readFile(path, "utf8")) as PublicationDataset;
  } catch {
    /* First import has no snapshot. */
  }
  const dataset = await fetchAllPublications(previous?.publications ?? []);
  dataset.publications = dataset.publications.map((publication) =>
    enrichPublication(publication),
  );
  await writeFile(path, `${JSON.stringify(dataset, null, 2)}\n`);
  console.log(
    `Imported ${dataset.publications.length} publications to ${path}`,
  );
  console.table(dataset.sources);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Import failed");
  process.exitCode = 1;
});
