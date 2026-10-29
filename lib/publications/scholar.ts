import { DomUtils, parseDocument } from "htmlparser2";
import type { Element, ParentNode } from "domhandler";
import type { CitationYearSeries, ScholarCitationRecord, ScholarCitationSnapshot } from "@/types/publication";

const PROFILE_ID = "iCd8LKAAAAAJ";
const ORIGIN = "https://scholar.google.com";
const PAGE_SIZE = 100;
const PAGE_LIMIT = 6;
const HISTORY_LIMIT = 16;
const DEFAULT_BUDGET_MS = 40_000;
const REQUEST_TIMEOUT_MS = 8_000;

class ScholarRequestError extends Error {
  constructor(message: string, readonly blocked = false) {
    super(message);
    this.name = "ScholarRequestError";
  }
}

type Scope = ParentNode;
const find = (scope: Scope, id: string) => DomUtils.findOne(node => node.attribs.id === id, scope.children);
const hasClass = (node: Element, name: string) => (node.attribs.class ?? "").split(/\s+/).includes(name);
const byClass = (scope: Scope, name: string) => DomUtils.findAll(node => hasClass(node, name), scope.children);
const text = (node: Scope | null | undefined) => node ? DomUtils.textContent(node).replace(/\s+/g, " ").trim() : "";

function checkedDate(checkedAt: string) {
  const date = new Date(checkedAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid Scholar observation date");
  return date;
}

function parseCount(value: string): number | undefined {
  const normalized = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(normalized)) return undefined;
  const count = Number(normalized.replaceAll(",", ""));
  return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
}

function parseYear(value: string): number | undefined {
  return /^\d{4}$/.test(value) && Number(value) >= 1900 ? Number(value) : undefined;
}

function documentFrom(html: string) {
  const document = parseDocument(html);
  const title = text(DomUtils.findOne(node => node.name === "title", document.children));
  const blocked = DomUtils.existsOne(node => {
    const marker = `${node.attribs.id ?? ""} ${node.attribs.class ?? ""}`;
    return /(?:captcha|recaptcha)/i.test(marker)
      || (node.name === "form" && /accounts\.google\.com|\/sorry\//i.test(node.attribs.action ?? ""));
  }, document.children);
  // Plain challenge messages are served without a fixed DOM identifier.
  const bodyText = text(DomUtils.findOne(node => node.name === "body", document.children) ?? document);
  if (blocked || /unusual traffic|automated queries|not a robot/i.test(bodyText)
    || /sign in|google accounts|sorry/i.test(title)) {
    throw new ScholarRequestError("Google Scholar public access is blocked or requires sign-in", true);
  }
  return document;
}

function profileUrl(profileId = PROFILE_ID, start = 0) {
  const url = new URL("/citations", ORIGIN);
  url.searchParams.set("user", profileId);
  url.searchParams.set("hl", "en");
  url.searchParams.set("pagesize", String(PAGE_SIZE));
  if (start) url.searchParams.set("cstart", String(start));
  return url.href;
}

function validatedArticleUrl(value: string, expectedProfileId: string) {
  try {
    const url = new URL(value, ORIGIN);
    const id = url.searchParams.get("citation_for_view");
    if (url.origin !== ORIGIN || url.pathname !== "/citations" || url.username || url.password
      || url.searchParams.get("user") !== expectedProfileId
      || url.searchParams.get("view_op") !== "view_citation"
      || !id || !id.startsWith(`${expectedProfileId}:`)
      || !/^[A-Za-z0-9_-]+$/.test(id.slice(expectedProfileId.length + 1))) return undefined;
    return { id, url: url.href };
  } catch {
    return undefined;
  }
}

function assertProfileIdentity(document: Scope, expectedProfileId: string) {
  const name = text(find(document, "gsc_prf_in"));
  if (!name || (expectedProfileId === PROFILE_ID && !/\bmakris\b/i.test(name))) {
    throw new Error("Google Scholar profile identity did not match the expected researcher");
  }
  const canonicalLinks = DomUtils.findAll(node => node.name === "link"
    && (node.attribs.rel ?? "").split(/\s+/).includes("canonical"), document.children);
  for (const link of canonicalLinks) {
    const url = new URL(link.attribs.href ?? "", ORIGIN);
    if (url.origin !== ORIGIN || url.pathname !== "/citations" || url.searchParams.get("user") !== expectedProfileId) {
      throw new Error("Google Scholar profile identity did not match the expected profile ID");
    }
  }
  return name;
}

/** A chart's first year and bars share an ancestor; choose it before an expanded duplicate chart. */
function parseChart(scope: Scope | null, prefix: string, checkedAt: string): CitationYearSeries | undefined {
  if (!scope) return undefined;
  const firstYear = byClass(scope, `${prefix}_t`)[0];
  if (!firstYear) return undefined;
  let chart: Scope | null = firstYear.parent;
  while (chart && chart !== scope && !byClass(chart, `${prefix}_a`).length) chart = chart.parent;
  if (!chart) return undefined;
  const labels = byClass(chart, `${prefix}_t`);
  const bars = byClass(chart, `${prefix}_a`);
  const years = labels.map(label => parseYear(text(label)));
  if (!years.length || years.some(year => year === undefined) || new Set(years).size !== years.length) return undefined;
  if (!bars.length) return undefined;
  const values = new Map<number, number>();
  for (const [index, bar] of bars.entries()) {
    const count = parseCount(text(byClass(bar, `${prefix}_al`)[0]));
    if (count === undefined) return undefined;
    let year: number | undefined;
    try {
      const link = new URL(bar.attribs.href ?? "", ORIGIN);
      const from = parseYear(link.searchParams.get("as_ylo") ?? "");
      const through = parseYear(link.searchParams.get("as_yhi") ?? "");
      if (from && from === through) year = from;
    } catch { /* A missing per-bar year can use its aligned visible label. */ }
    if (year === undefined && bars.length === years.length) year = years[index];
    if (year === undefined || !years.includes(year) || values.has(year)) return undefined;
    values.set(year, count);
  }
  // A missing bar is not evidence of a zero. All visible years must be observed.
  if (values.size !== years.length) return undefined;
  const currentYear = checkedDate(checkedAt).getUTCFullYear();
  const visibleYears = (years as number[]).filter(year => year <= currentYear).sort((a, b) => a - b);
  if (!visibleYears.length) return undefined;
  return {
    from: visibleYears[0], through: visibleYears.at(-1)!,
    counts: visibleYears.map(year => ({ year, citations: values.get(year)! })),
  };
}

function profileRows(document: Scope) {
  const table = find(document, "gsc_a_b");
  if (!table) throw new Error("Google Scholar profile publication table is missing");
  return DomUtils.findAll(node => node.name === "tr", table.children);
}

/** Parse only public profile evidence. Profile totals and annual totals are independent provider observations. */
export function parseScholarProfile(html: string, checkedAt = new Date().toISOString(), expectedProfileId = PROFILE_ID): ScholarCitationSnapshot {
  checkedDate(checkedAt);
  const document = documentFrom(html);
  const name = assertProfileIdentity(document, expectedProfileId);
  const stats = find(document, "gsc_rsb_st");
  if (!stats) throw new Error("Google Scholar profile citation statistics are missing");
  const rows = DomUtils.findAll(node => node.name === "tr", stats.children);
  const citationCells = rows.map(row => DomUtils.getChildren(row).filter((node): node is Element => "name" in node && node.name === "td"))
    .find(cells => text(cells[0]).toLowerCase() === "citations");
  const total = parseCount(text(citationCells?.[1]));
  if (total === undefined) throw new Error("Google Scholar profile citation total is invalid");
  const headerCells = rows.flatMap(row => DomUtils.findAll(node => node.name === "th", row.children));
  const recentFrom = headerCells.map(cell => /^Since (\d{4})$/i.exec(text(cell))).find(Boolean)?.[1];
  const recentTotal = parseCount(text(citationCells?.[2]));
  const records: ScholarCitationRecord[] = [];
  const seen = new Set<string>();
  for (const row of profileRows(document).slice(0, PAGE_SIZE)) {
    const cells = DomUtils.getChildren(row).filter((node): node is Element => "name" in node && node.name === "td");
    const titleLink = cells[0] && DomUtils.findOne(node => node.name === "a", cells[0].children);
    const identity = titleLink && validatedArticleUrl(titleLink.attribs.href ?? "", expectedProfileId);
    const title = text(titleLink);
    const rawCount = text(cells[1]);
    const estimated = /\*\s*$/.test(rawCount);
    const countText = rawCount.replace(/\*\s*$/, "").trim();
    const recordTotal = countText === "" && rawCount === "" ? 0 : parseCount(countText);
    if (!identity || !title || !cells[1] || recordTotal === undefined || seen.has(identity.id)) continue;
    const details = byClass(cells[0], "gs_gray");
    records.push({
      ...identity, title, authors: text(details[0]), publication: text(details[1]),
      year: parseYear(text(cells[2])) ?? null, total: recordTotal,
      ...(estimated ? { estimated: true } : {}),
    });
    seen.add(identity.id);
  }
  const yearly = parseChart(find(document, "gsc_rsb_cit"), "gsc_g", checkedAt);
  return {
    profile: {
      source: "Google Scholar", profileId: expectedProfileId, url: profileUrl(expectedProfileId), name, total,
      ...(recentFrom && recentTotal !== undefined ? { recent: { from: Number(recentFrom), total: recentTotal } } : {}),
      ...(yearly ? { yearly } : {}), checkedAt, recordCount: records.length, updateStatus: "snapshot",
    }, records,
  };
}

/** Optional article detail evidence never turns a missing positive history into a zero series. */
export function parseScholarArticle(html: string, record: ScholarCitationRecord, checkedAt: string): ScholarCitationRecord {
  checkedDate(checkedAt);
  const identity = validatedArticleUrl(record.url, PROFILE_ID);
  if (!identity || identity.id !== record.id) throw new Error("Google Scholar article identity is invalid");
  const document = documentFrom(html);
  const title = text(find(document, "gsc_oci_title"));
  const observedTitle = title.toLowerCase();
  const expectedTitle = record.title.replace(/\s+/g, " ").trim().toLowerCase();
  const truncatedPrefix = /(?:…|\.{3})$/.test(expectedTitle) ? expectedTitle.replace(/(?:…|\.{3})$/, "").trimEnd() : undefined;
  if (!title || (observedTitle !== expectedTitle
    && !(truncatedPrefix && truncatedPrefix.length >= 20 && observedTitle.startsWith(truncatedPrefix)))) {
    throw new Error("Google Scholar article identity did not match the requested article");
  }
  const yearly = parseChart(find(document, "gsc_oci_graph"), "gsc_oci_g", checkedAt);
  return yearly ? { ...record, yearly, historyCheckedAt: checkedAt } : { ...record };
}

export interface ScholarFetchOptions {
  fetcher?: typeof fetch;
  now?: string;
  budgetMs?: number;
  previous?: ScholarCitationSnapshot;
  historyIds?: string[];
}

/** Fetch public HTML with a strict budget; any incomplete profile leaves fallback selection to the caller. */
export async function fetchScholarCitations(options: ScholarFetchOptions = {}): Promise<ScholarCitationSnapshot> {
  const checkedAt = options.now ?? new Date().toISOString();
  checkedDate(checkedAt);
  const budget = Math.min(DEFAULT_BUDGET_MS, options.budgetMs ?? DEFAULT_BUDGET_MS);
  if (!Number.isFinite(budget) || budget <= 0) throw new ScholarRequestError("Google Scholar refresh budget is exhausted");
  const deadline = Date.now() + budget;
  const fetcher = options.fetcher ?? fetch;
  const request = async (url: string) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ScholarRequestError("Google Scholar refresh budget is exhausted");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(url, { cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal });
          if (!response.ok) throw new ScholarRequestError(`Google Scholar request returned HTTP ${response.status}`, response.status === 403 || response.status === 429);
          if (response.url && new URL(response.url).origin !== ORIGIN) throw new ScholarRequestError("Google Scholar request left its public host", true);
          return await response.text();
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new ScholarRequestError("Google Scholar request timed out or exceeded its refresh budget"));
          }, Math.min(REQUEST_TIMEOUT_MS, remaining));
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  let snapshot: ScholarCitationSnapshot | undefined;
  const records = new Map<string, ScholarCitationRecord>();
  let complete = false;
  for (let page = 0; page < PAGE_LIMIT; page++) {
    const html = await request(profileUrl(PROFILE_ID, page * PAGE_SIZE));
    const parsed = parseScholarProfile(html, checkedAt);
    if (snapshot && (parsed.profile.name !== snapshot.profile.name || parsed.profile.total !== snapshot.profile.total)) {
      throw new Error("Google Scholar profile identity or total changed during pagination");
    }
    snapshot ??= parsed;
    for (const record of parsed.records) records.set(record.id, record);
    // Count source rows, including rejected cells and repeated IDs, to avoid false end-of-list signals.
    if (profileRows(parseDocument(html)).length < PAGE_SIZE) { complete = true; break; }
  }
  if (!snapshot || !complete) throw new Error("Google Scholar profile pagination did not complete within its page limit");
  const previous = new Map((options.previous?.profile.profileId === PROFILE_ID ? options.previous.records : []).map(record => [record.id, record]));
  for (const [id, record] of records) {
    const old = previous.get(id);
    const wasInferredZero = old?.total === 0 && old.yearly?.counts.every(count => count.citations === 0);
    if (old?.yearly && !(wasInferredZero && record.total > 0)) {
      records.set(id, { ...record, yearly: old.yearly, ...(old.historyCheckedAt ? { historyCheckedAt: old.historyCheckedAt } : {}) });
    }
  }
  const ids = [...new Set(options.historyIds ?? [])].filter(id => records.has(id)).slice(0, HISTORY_LIMIT);
  for (const id of ids) {
    if (Date.now() >= deadline) break;
    const record = records.get(id)!;
    try {
      records.set(id, parseScholarArticle(await request(record.url), record, checkedAt));
    } catch (error) {
      if (error instanceof ScholarRequestError && error.blocked) break;
      // Optional history failures must not discard a fully verified profile.
    }
  }
  return {
    profile: { ...snapshot.profile, recordCount: records.size, updateStatus: "live" },
    records: [...records.values()],
  };
}
