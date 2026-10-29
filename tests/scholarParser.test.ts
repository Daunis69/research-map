import test from "node:test";
import assert from "node:assert/strict";
import { fetchScholarCitations, parseScholarArticle, parseScholarProfile } from "../lib/publications/scholar";
import type { ScholarCitationRecord } from "../types/publication";

const now = "2026-10-29T00:00:00.000Z";
const profileId = "iCd8LKAAAAAJ";
const articleUrl = (id: string) => `https://scholar.google.com/citations?view_op=view_citation&hl=en&user=${profileId}&citation_for_view=${profileId}:${id}`;
const row = (id: string, count = "12", year = "2024", href = articleUrl(id)) => `<tr class="gsc_a_tr"><td class="gsc_a_t"><a class="gsc_a_at" href="${href.replaceAll("&", "&amp;")}">Water &amp; health ${id}</a><div class="gs_gray">A Example, KC Makris</div><div class="gs_gray">Journal of Water 12 (3), 1–9</div></td><td class="gsc_a_c"><a>${count}</a></td><td class="gsc_a_y"><span>${year}</span></td></tr>`;
const graph = (prefix = "gsc_g", years = [2007, 2025, 2026], counts = [3, 5, 4]) => `<div class="chart">${years.map(year => `<span class="${prefix}_t">${year}</span>`).join("")}${counts.map((count, i) => `<a class="${prefix}_a" href="/scholar?as_ylo=${years[i]}&amp;as_yhi=${years[i]}"><span class="${prefix}_al">${count}</span></a>`).join("")}</div>`;
const profile = (rows = row("a"), extra = "", user = profileId, name = "Konstantinos C. Makris") => `<html><head><link rel="canonical" href="https://scholar.google.com/citations?user=${user}&amp;hl=en"></head><body><div id="gsc_prf_in">${name}</div><div id="gsc_rsb_cit"><table id="gsc_rsb_st"><thead><tr><th></th><th>All</th><th>Since 2021</th></tr></thead><tbody><tr><td>Citations</td><td class="gsc_rsb_std">26,235</td><td class="gsc_rsb_std">22,786</td></tr><tr><td>h-index</td><td>69</td><td>61</td></tr></tbody></table>${graph()}${extra}</div><div id="gsc_prf_pua">61 articles</div><table><tbody id="gsc_a_b">${rows}</tbody></table></body></html>`;
const response = (html: string, status = 200) => new Response(html, { status });
const record = (extra: Partial<ScholarCitationRecord> = {}): ScholarCitationRecord => ({ id: `${profileId}:a`, url: articleUrl("a"), title: "Water & health a", authors: "A Example, KC Makris", publication: "Journal of Water 12 (3), 1–9", year: 2024, total: 12, ...extra });

test("Scholar profile parses independent provider totals and scopes the first annual chart", () => {
  const value = parseScholarProfile(profile(row("a"), graph("gsc_g", [2026], [999])), now);
  assert.equal(value.profile.name, "Konstantinos C. Makris");
  assert.equal(value.profile.total, 26235);
  assert.deepEqual(value.profile.recent, { from: 2021, total: 22786 });
  assert.equal(value.profile.recordCount, 1);
  assert.equal(value.profile.source, "Google Scholar");
  assert.equal(value.profile.updateStatus, "snapshot");
  assert.equal(value.profile.url, `https://scholar.google.com/citations?user=${profileId}&hl=en&pagesize=100`);
  assert.deepEqual(value.profile.yearly, { from: 2007, through: 2026, counts: [{ year: 2007, citations: 3 }, { year: 2025, citations: 5 }, { year: 2026, citations: 4 }] });
  assert.deepEqual(value.records[0], record());
});

test("Scholar rows distinguish estimates, known blank zeros and missing publication years", () => {
  const value = parseScholarProfile(profile(row("a", "1,234<sup>*</sup>") + row("b", "", "")), now);
  assert.equal(value.records[0].total, 1234);
  assert.equal(value.records[0].estimated, true);
  assert.equal(value.records[1].total, 0);
  assert.equal(value.records[1].year, null);
  assert.equal(value.records[1].yearly, undefined);
});

test("Scholar ignores malformed citation cells instead of changing unknown values to zero", () => {
  for (const count of ["-2", "1.2", "NaN", "1,2", "9007199254740992", "12 unknown", "—"]) {
    assert.equal(parseScholarProfile(profile(row("a", count)), now).records.length, 0, count);
  }
});

test("Scholar article links must remain on the expected public profile and host", () => {
  for (const href of [articleUrl("a").replace(profileId, "other"), articleUrl("a").replace("scholar.google.com", "evil.test"), "javascript:alert(1)", articleUrl("a").replace(":a", ":bad:id")]) {
    assert.equal(parseScholarProfile(profile(row("a", "12", "2024", href)), now).records.length, 0, href);
  }
  assert.throws(() => parseScholarProfile(profile("", "", "other"), now), /profile|identity/i);
  assert.throws(() => parseScholarProfile(profile("", "", profileId, "Another Person"), now), /profile|identity/i);
});

test("Scholar rejects challenge pages and invalid profile observations", () => {
  for (const html of ["<html>Our systems have detected unusual traffic from your computer network</html>", "<form id='gs_captcha_f'>reCAPTCHA</form>", "<title>Sign in - Google Accounts</title>", profile().replace("26,235", "unknown"), "<html>not a profile</html>"]) {
    assert.throws(() => parseScholarProfile(html, now));
  }
  assert.throws(() => parseScholarProfile(profile(), "invalid"));
});

test("Scholar profile excludes future annual observations and never invents annual data", () => {
  const html = profile().replace(graph(), graph("gsc_g", [2007, 2026, 2027], [2, 3, 999]));
  assert.deepEqual(parseScholarProfile(html, now).profile.yearly, { from: 2007, through: 2026, counts: [{ year: 2007, citations: 2 }, { year: 2026, citations: 3 }] });
  assert.equal(parseScholarProfile(profile().replace(graph(), ""), now).profile.yearly, undefined);
});

test("Scholar article reads its own calendar graph without confusing it with total citations", () => {
  const html = `<div id="gsc_oci_title"><a>Water &amp; health a</a></div><div id="gsc_oci_graph">${graph("gsc_oci_g", [2024, 2025, 2026], [1, 5, 4])}</div>`;
  const parsed = parseScholarArticle(html, record(), now);
  assert.equal(parsed.total, 12);
  assert.deepEqual(parsed.yearly, { from: 2024, through: 2026, counts: [{ year: 2024, citations: 1 }, { year: 2025, citations: 5 }, { year: 2026, citations: 4 }] });
  assert.equal(parsed.historyCheckedAt, now);
  assert.equal(parseScholarArticle("<div id='gsc_oci_title'>Water &amp; health a</div>", record(), now).yearly, undefined);
  assert.equal(parseScholarArticle(html.replace("<span class=\"gsc_oci_g_al\">5</span>", "<span class=\"gsc_oci_g_al\">unknown</span>"), record(), now).yearly, undefined);
});

test("Scholar article rejects a challenge or a mismatched article identity", () => {
  assert.throws(() => parseScholarArticle("<div id='gs_captcha_f'>challenge</div>", record(), now));
  assert.throws(() => parseScholarArticle("<div id='gsc_oci_title'>Different article</div>", record(), now), /article|identity/i);
});

test("Scholar article accepts a full title when the public profile truncates its suffix", () => {
  const article = record({ title: "Global burden of disease in\u00a0…" });
  const parsed = parseScholarArticle(`<div id="gsc_oci_title">Global burden of disease in 204 countries</div><div id="gsc_oci_graph">${graph("gsc_oci_g", [2026], [12])}</div>`, article, now);
  assert.equal(parsed.yearly?.counts[0].citations, 12);
  assert.throws(() => parseScholarArticle("<div id='gsc_oci_title'>Global burden of something else</div>", article, now), /article|identity/i);
});

test("Scholar graph bars may use nonexecuted javascript placeholders and visible label order", () => {
  const html = profile().replaceAll(/href="\/scholar\?as_ylo=\d+&amp;as_yhi=\d+"/g, 'href="javascript:void(0)"');
  assert.deepEqual(parseScholarProfile(html, now).profile.yearly?.counts, [{ year: 2007, citations: 3 }, { year: 2025, citations: 5 }, { year: 2026, citations: 4 }]);
});

test("Scholar fetch completes ordinary pagination and deduplicates repeated article IDs", async () => {
  const requested: URL[] = [];
  const value = await fetchScholarCitations({ now, fetcher: async (input, init) => {
    const url = new URL(String(input)); requested.push(url);
    assert.equal(init?.headers, undefined);
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    return response(requested.length === 1 ? profile(Array.from({ length: 100 }, (_, i) => row(String(i))).join("")) : profile(row("99") + row("100")));
  } });
  assert.equal(value.records.length, 101);
  assert.equal(value.profile.recordCount, 101);
  assert.equal(value.profile.updateStatus, "live");
  assert.equal(requested[1].searchParams.get("cstart"), "100");
  assert.equal(requested[1].searchParams.get("pagesize"), "100");
});

test("Scholar fetch rejects incomplete pagination instead of publishing a truncated profile", async () => {
  let calls = 0;
  await assert.rejects(fetchScholarCitations({ now, fetcher: async () => {
    calls++;
    return response(profile(Array.from({ length: 100 }, (_, i) => row(String(i + calls * 100))).join("")));
  } }), /complete|pagination|limit/i);
  assert.equal(calls, 6);
});

test("Scholar fetch rejects a changed profile on a later pagination page", async () => {
  let calls = 0;
  await assert.rejects(fetchScholarCitations({ now, fetcher: async () => {
    calls++;
    return response(calls === 1 ? profile(Array.from({ length: 100 }, (_, i) => row(String(i))).join("")) : profile(row("a"), "", profileId, "Different Researcher"));
  } }), /identity|profile/i);
});

test("Scholar fetch makes no further requests after HTTP or HTML blocking", async () => {
  for (const blocked of [response("Forbidden", 403), response("Too many requests", 429), response("<div id='gs_captcha_f'>reCAPTCHA</div>")]) {
    let calls = 0;
    await assert.rejects(fetchScholarCitations({ now, historyIds: [`${profileId}:a`], fetcher: async () => { calls++; return blocked; } }));
    assert.equal(calls, 1);
  }
});

test("Scholar fetch enforces the overall budget even if an injected fetcher ignores abort", async () => {
  const started = Date.now();
  let calls = 0;
  await assert.rejects(fetchScholarCitations({ now, budgetMs: 20, fetcher: async () => { calls++; return new Promise<Response>(() => {}); } }), /budget|timeout|timed out/i);
  assert.ok(Date.now() - started < 1000);
  assert.equal(calls, 1);
});

test("Scholar keeps previous annual history and retires inferred zero history when citations arrive", async () => {
  const previous = parseScholarProfile(profile(row("a") + row("b", "0")), "2026-10-28T00:00:00.000Z");
  previous.records[0].yearly = { from: 2024, through: 2026, counts: [{ year: 2026, citations: 10 }] };
  previous.records[0].historyCheckedAt = previous.profile.checkedAt;
  previous.records[1].yearly = { from: 2007, through: 2026, counts: [] };
  previous.records[1].historyCheckedAt = previous.profile.checkedAt;
  const value = await fetchScholarCitations({ now, previous, fetcher: async () => response(profile(row("a", "13") + row("b", "1"))) });
  assert.deepEqual(value.records[0].yearly, previous.records[0].yearly);
  assert.equal(value.records[0].historyCheckedAt, previous.profile.checkedAt);
  assert.equal(value.records[1].yearly, undefined);
  assert.equal(value.records[1].historyCheckedAt, undefined);
});

test("Scholar optional article history only requests known IDs and stops on blocking without losing the profile", async () => {
  let calls = 0;
  const value = await fetchScholarCitations({ now, historyIds: ["unknown", `${profileId}:a`, `${profileId}:b`], fetcher: async () => {
    calls++;
    return calls === 1 ? response(profile(row("a") + row("b"))) : response("Forbidden", 403);
  } });
  assert.equal(value.records.length, 2);
  assert.equal(value.profile.updateStatus, "live");
  assert.equal(calls, 2);
  assert.equal(value.records[0].yearly, undefined);
});

test("Scholar optional article history stops on an HTML challenge and preserves previous evidence", async () => {
  const previous = parseScholarProfile(profile(row("a") + row("b")), "2026-10-28T00:00:00.000Z");
  previous.records[0].yearly = { from: 2026, through: 2026, counts: [{ year: 2026, citations: 12 }] };
  previous.records[0].historyCheckedAt = previous.profile.checkedAt;
  let calls = 0;
  const value = await fetchScholarCitations({ now, previous, historyIds: [`${profileId}:a`, `${profileId}:b`], fetcher: async () => {
    calls++;
    return calls === 1 ? response(profile(row("a") + row("b"))) : response("<div id='gs_captcha_f'>challenge</div>");
  } });
  assert.equal(calls, 2);
  assert.deepEqual(value.records[0].yearly, previous.records[0].yearly);
  assert.equal(value.records[0].historyCheckedAt, previous.profile.checkedAt);
});

test("Scholar optional article history is capped and failed history does not discard verified profile data", async () => {
  let calls = 0;
  const ids = Array.from({ length: 20 }, (_, i) => `${profileId}:${i}`);
  const value = await fetchScholarCitations({ now, historyIds: ids, fetcher: async () => {
    calls++;
    if (calls === 1) return response(profile(ids.map((_, i) => row(String(i))).join("")));
    return response("Server error", 500);
  } });
  assert.equal(value.records.length, 20);
  assert.equal(calls, 17);
});
