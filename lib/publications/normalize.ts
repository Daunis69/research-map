import type { Publication } from "../../types/publication";

/** Only work-specific source URLs identify a paper; a shared author profile does not. */
export function sourceIdentityKeys(
  publication: Pick<Publication, "source">,
): string[] {
  return Object.entries(publication.source).flatMap(([source, url]) => {
    if (!url) return [];
    const isWork =
      source === "orcid"
        ? /\/work\/\d+\/?$/.test(url)
        : source === "openAlex"
          ? /\/W\d+\/?$/.test(url)
          : source === "ktisis"
            ? /\/entities\/publication\/[^/]+\/?$/.test(url)
            : /\/works\/10\./.test(url);
    return isWork ? [`${source}:${url.replace(/\/$/, "")}`] : [];
  });
}

export type JsonRecord = Record<string, unknown>;
export const record = (value: unknown): JsonRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
export const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
export const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
export const nested = (value: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>((current, key) => record(current)[key], value);

export function plainText(value: unknown): string | undefined {
  const input = text(value);
  return (
    input
      ?.replace(
        /<\/?(?:[a-z]+:)?(?:p|div|span|i|b|em|strong|sup|sub|br|title|sec|italic|bold|abstract|xref|label|ext-link|a)\b[^<>]*>/gi,
        " ",
      )
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/\s+/g, " ")
      .trim() || undefined
  );
}

export function normalizeDoi(value: unknown): string | undefined {
  const input = text(value);
  if (!input) return undefined;
  let cleaned = input
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi\s*:\s*/i, "")
    .trim();
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    /* Keep a literal DOI if percent escaping is malformed. */
  }
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned)
    ? cleaned.toLowerCase()
    : undefined;
}

export function safeUrl(value: unknown): string | undefined {
  const input = text(value);
  if (!input) return undefined;
  try {
    const url = new URL(input);
    return /^(https?):$/.test(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeYear(value: unknown): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d{4}(?:\D|$)/.test(value)
        ? Number(value.slice(0, 4))
        : NaN;
  return Number.isInteger(number) &&
    number >= 1600 &&
    number <= new Date().getUTCFullYear() + 2
    ? number
    : null;
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function canonicalAuthor(value: string | undefined): string {
  if (!value) return "unknown";
  const parts = value.includes(",")
    ? value.split(",").reverse().join(" ")
    : value;
  const words = normalizeText(parts).split(" ");
  return `${words.at(-1) ?? ""} ${words[0]?.[0] ?? ""}`.trim();
}

export function fallbackKey(
  publication: Pick<Publication, "title" | "year" | "authors">,
): string {
  return `${normalizeText(publication.title)}|${publication.year ?? "unknown"}|${canonicalAuthor(publication.authors[0])}`;
}

export function publicationId(
  publication: Pick<Publication, "title" | "year" | "authors" | "doi">,
): string {
  const doi = normalizeDoi(publication.doi);
  if (doi) return `doi:${doi}`;
  let hash = 2166136261;
  for (const char of fallbackKey(publication))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `work:${(hash >>> 0).toString(16)}`;
}

export function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  return values.map(plainText).filter((value): value is string => {
    if (!value || seen.has(value.toLowerCase())) return false;
    seen.add(value.toLowerCase());
    return true;
  });
}

export function makePublication(
  input: Omit<
    Publication,
    "id" | "discoveredAt" | "updatedAt" | "studyLocations"
  > &
    Partial<
      Pick<Publication, "id" | "discoveredAt" | "updatedAt" | "studyLocations">
    >,
  now = new Date().toISOString(),
): Publication {
  const publication: Publication = {
    ...input,
    id: input.id ?? publicationId(input),
    title: plainText(input.title) ?? "Untitled publication",
    year: normalizeYear(input.year),
    authors: uniqueStrings(input.authors),
    topics: uniqueStrings(input.topics),
    doi: normalizeDoi(input.doi),
    abstract: plainText(input.abstract),
    publicationUrl: safeUrl(input.publicationUrl),
    studyLocations: input.studyLocations ?? [],
    geographyStatus: input.geographyStatus ?? "unknown",
    discoveredAt: input.discoveredAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
  return publication;
}
