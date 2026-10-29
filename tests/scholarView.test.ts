import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DomUtils, parseDocument } from "htmlparser2";
import type { Element, ParentNode } from "domhandler";
import CitationsView from "../components/citations/CitationsView";
import CitationBadge from "../components/citations/CitationBadge";
import PublicationCitations from "../components/citations/PublicationCitations";
import { SCHOLAR_PROFILE_ID } from "../lib/scholarCitations";
import type { Publication, ScholarCitationProfile } from "../types/publication";

const checkedAt = "2026-10-29T08:20:43.074Z";
const profileUrl = `https://scholar.google.com/citations?user=${SCHOLAR_PROFILE_ID}`;
const reference: ScholarCitationProfile = {
  source: "Google Scholar",
  profileId: SCHOLAR_PROFILE_ID,
  url: profileUrl,
  name: "Konstantinos C. Makris",
  total: 26235,
  recordCount: 279,
  checkedAt,
  updateStatus: "snapshot",
  yearly: { from: 2007, through: 2026, counts: [{ year: 2007, citations: 0 }, { year: 2026, citations: 9046 }] },
};

function paper(id: string, title: string): Publication {
  return {
    id, title, year: 2026, authors: ["A Example"], topics: [], studyLocations: [],
    source: {}, discoveredAt: checkedAt, updatedAt: checkedAt,
  };
}

function scholarPaper(id: string, total: number, estimated = false): Publication {
  const publication = paper(id, `Scholar paper ${id}`);
  const workId = `${SCHOLAR_PROFILE_ID}:${id}`;
  return {
    ...publication,
    scholarCitations: {
      source: "Google Scholar", publicationId: id, workId,
      url: `${profileUrl}&view_op=view_citation&citation_for_view=${workId}`,
      total, estimated, checkedAt,
    },
  };
}

const known: Publication = {
  ...scholarPaper("known", 6),
  scholarCitations: {
    ...scholarPaper("known", 6).scholarCitations!,
    yearly: { from: 2025, through: 2026, counts: [{ year: 2025, citations: 1 }, { year: 2026, citations: 5 }] },
  },
};
const zero = scholarPaper("zero", 0);
const unmatched: Publication = {
  ...paper("unmatched", "OpenAlex-only paper"),
  source: { openAlex: "https://openalex.org/W123" },
  citationCount: 12345,
  citationMetrics: { source: "OpenAlex", workId: "https://openalex.org/W123", total: 12345, checkedAt },
};
const allPublications = [known, zero, unmatched];

const text = (node: ParentNode) => DomUtils.textContent(node).replace(/\s+/g, " ").trim();
const byClass = (scope: ParentNode, name: string) => DomUtils.findAll(node => (node.attribs.class ?? "").split(/\s+/).includes(name), scope.children);
const byTag = (scope: ParentNode, name: string) => DomUtils.findAll(node => node.name === name, scope.children);

function renderView(publications = allPublications, citationYear = "") {
  return parseDocument(renderToStaticMarkup(React.createElement(CitationsView, {
    publications, allPublications, reference, citationYear,
    onYearChange: () => {}, onSelect: () => {},
  })));
}

function primaryCount(document: ParentNode) {
  return text(byTag(byClass(document, "citation-stat")[0], "strong")[0]);
}

function paperCounts(document: ParentNode, title: string) {
  const table = byClass(document, "citation-paper-table")[0];
  const row = byTag(table, "tr").find(row => byClass(row, "paper-title").some(button => text(button) === title));
  assert.ok(row, `Missing paper row: ${title}`);
  return byClass(row, "citation-number").map(text);
}

function chartBar(document: ParentNode, year: number): Element {
  const chart = byClass(document, "citation-chart")[0];
  const bar = byTag(chart, "button").find(button => button.attribs["aria-label"]?.startsWith(`${year}:`));
  assert.ok(bar, `Missing citation year: ${year}`);
  return bar;
}

test("citation view keeps three statistics and labels the full profile separately from site papers", () => {
  const document = renderView();
  assert.equal(byClass(document, "citation-stat-grid").length, 1);
  assert.equal(byClass(document, "citation-stat").length, 3);
  assert.equal(byClass(document, "citation-chart").length, 1);
  assert.equal(byClass(document, "citation-paper-table").length, 1);
  assert.equal(primaryCount(document), "26,235");
  assert.match(text(byClass(document, "citation-stat")[0]), /Scholar profile citations.*279 profile records/);
  assert.match(text(byClass(document, "citation-scope")[0]), /3 selected site papers.*Google Scholar profile \(279 records\)/);
  assert.match(text(byClass(document, "citation-stat")[1]), /2 \/ 3.*1 unavailable/);
  assert.match(text(byClass(document, "citation-stat")[2]), /1 \/ 3/);
  assert.match(text(document), /Google Scholar snapshot checked 29 Oct 2026/);
  assert.doesNotMatch(text(document), /automatic/i);
});

test("filtered citation totals use verified paper sums while retaining the full profile reference", () => {
  const document = renderView([known]);
  assert.equal(primaryCount(document), "6");
  assert.match(text(byClass(document, "citation-stat")[0]), /^All-time citations/);
  assert.match(text(byClass(document, "citation-overall")[0]), /Full Google Scholar profile: 26,235 all-time citations across 279 records/);
  assert.deepEqual(paperCounts(document, known.title), ["6"]);
});

test("profile annual counts do not become individual paper histories", () => {
  const document = renderView(allPublications, "2026");
  assert.equal(primaryCount(document), "9,046");
  assert.match(chartBar(document, 2026).attribs["aria-label"], /9,046 citations, full Google Scholar profile/);
  assert.deepEqual(paperCounts(document, known.title), ["5", "6"]);
  assert.deepEqual(paperCounts(document, zero.title), ["Unavailable", "0"]);
  assert.deepEqual(paperCounts(document, unmatched.title), ["Unavailable", "Unavailable"]);
  assert.match(text(byClass(document, "citation-coverage")[0]), /1 \/ 3 covered/);
  assert.match(text(document), /profile lifetime and annual figures separately; they may not sum exactly/);
  assert.equal(text(byClass(chartBar(document, 2007), "citation-bar-count")[0]), "0");
});

test("filtered annual counts use paper history and retain earlier profile years as selectable", () => {
  const annual = renderView([known], "2026");
  assert.equal(primaryCount(annual), "5");
  assert.match(chartBar(annual, 2026).attribs["aria-label"], /5 citations, 1 papers covered/);
  assert.deepEqual(paperCounts(annual, known.title), ["5", "6"]);

  const beforeHistory = renderView([known], "2007");
  assert.equal(primaryCount(beforeHistory), "Unavailable");
  assert.deepEqual(paperCounts(beforeHistory, known.title), ["Unavailable", "6"]);
  const selectedOption = byTag(beforeHistory, "option").find(option => option.attribs.value === "2007");
  assert.ok(selectedOption && "selected" in selectedOption.attribs);
});

test("missing Scholar evidence stays unavailable across the view, badge and detail without OpenAlex fallback", () => {
  const document = renderView([unmatched]);
  assert.equal(primaryCount(document), "Unavailable");
  assert.deepEqual(paperCounts(document, unmatched.title), ["Unavailable"]);
  assert.equal(byClass(document, "citation-source-link").length, 0);
  assert.doesNotMatch(text(document), /12,345/);

  const badge = parseDocument(renderToStaticMarkup(React.createElement(CitationBadge, { publication: unmatched })));
  assert.equal(text(badge), "Citations unavailable");
  assert.equal(byTag(badge, "a").length, 0);
  const detail = parseDocument(renderToStaticMarkup(React.createElement(PublicationCitations, { publication: unmatched })));
  assert.match(text(detail), /verified Google Scholar citation record has not been matched/);
  assert.equal(byClass(detail, "detail-citation-total").length, 0);
  assert.doesNotMatch(text(detail), /12,345|OpenAlex/);

  assert.equal(primaryCount(renderView([zero])), "0");
  const zeroBadge = parseDocument(renderToStaticMarkup(React.createElement(CitationBadge, { publication: zero })));
  assert.equal(text(byTag(zeroBadge, "span")[0]), "0 citations");
  assert.equal(text(byTag(zeroBadge, "a")[0]), "Google Scholar");
});

test("citation links use Google Scholar and estimated lifetime counts keep their source asterisk", () => {
  const estimated: Publication = {
    ...known,
    scholarCitations: { ...known.scholarCitations!, total: 43, estimated: true },
  };
  const document = renderView([estimated]);
  assert.deepEqual(paperCounts(document, estimated.title), ["43*"]);
  assert.match(text(document), /An asterisk \(\*\) marks an estimated Google Scholar count/);
  const annual = renderView([estimated], "2026");
  assert.deepEqual(paperCounts(annual, estimated.title), ["5", "43*"]);

  const badge = parseDocument(renderToStaticMarkup(React.createElement(CitationBadge, { publication: estimated })));
  assert.equal(text(byTag(badge, "span")[0]), "43* citations");
  assert.equal(text(byTag(badge, "a")[0]), "Google Scholar");
  const detail = parseDocument(renderToStaticMarkup(React.createElement(PublicationCitations, { publication: estimated })));
  const detailTotal = byClass(detail, "detail-citation-total")[0];
  assert.equal(text(byTag(detailTotal, "strong")[0]), "43*");
  assert.equal(text(byTag(detailTotal, "span")[0]), "all-time citations");
  assert.equal(text(byTag(detailTotal, "a")[0]), "Google Scholar");
  assert.match(text(detail), /last checked 29 Oct 2026/);
  assert.match(text(detail), /An asterisk \(\*\) marks an estimated Google Scholar count/);

  for (const scope of [document, badge, detail]) {
    const links = byTag(scope, "a");
    assert.ok(links.length > 0);
    for (const link of links) {
      assert.equal(new URL(link.attribs.href).hostname, "scholar.google.com");
      assert.equal(link.attribs.target, "_blank");
      assert.equal(link.attribs.rel, "noopener noreferrer");
    }
  }
  assert.equal(byClass(document, "citation-source-link")[0].attribs.href, estimated.scholarCitations!.url);
});
