"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Quote } from "lucide-react";
import type { Publication } from "@/types/publication";
import { getCitationCount, getCitationMetrics, getCitationSummary, getYearCitations } from "@/lib/citations";

function countLabel(count: number | undefined) {
  return count === undefined ? "Unavailable" : count.toLocaleString("en-GB");
}

function dateLabel(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(value));
}

export default function CitationsView({
  publications,
  allPublications,
  citationYear,
  onYearChange,
  onSelect,
}: {
  publications: Publication[];
  allPublications: Publication[];
  citationYear: string;
  onYearChange: (year: string | null) => void;
  onSelect: (publication: Publication) => void;
}) {
  const [limit, setLimit] = useState(25);
  const summary = useMemo(() => getCitationSummary(publications), [publications]);
  const overall = useMemo(() => getCitationSummary(allPublications), [allPublications]);
  const availableYears = overall.byYear.map(({ year }) => year);
  const selectedYear = /^\d{4}$/.test(citationYear) && availableYears.includes(Number(citationYear))
    ? Number(citationYear) : undefined;
  const annualRows = availableYears.map((year) => summary.byYear.find((row) => row.year === year) ?? { year, citations: undefined, coveredPublications: 0 });
  const maxAnnualCount = Math.max(1, ...annualRows.map((row) => row.citations ?? 0));
  const period = selectedYear === undefined ? "All time" : String(selectedYear);
  const periodRow = annualRows.find((row) => row.year === selectedYear);
  const periodCitations = selectedYear === undefined ? summary.totalCitations : periodRow?.citations;
  const periodCoverage = selectedYear === undefined ? summary.coveredPublications : periodRow?.coveredPublications ?? 0;
  const ranked = useMemo(() => publications.map((publication) => ({
    publication,
    count: selectedYear === undefined ? getCitationCount(publication) : getYearCitations(publication, selectedYear),
    total: getCitationCount(publication),
    metrics: getCitationMetrics(publication),
  })).sort((a, b) => (b.count ?? -1) - (a.count ?? -1) || a.publication.title.localeCompare(b.publication.title)), [publications, selectedYear]);
  const hasSubset = summary.publications !== overall.publications;
  const checkedRange = summary.oldestCheckedAt && summary.latestCheckedAt && summary.oldestCheckedAt !== summary.latestCheckedAt
    ? `${dateLabel(summary.oldestCheckedAt)}–${dateLabel(summary.latestCheckedAt)}`
    : dateLabel(summary.latestCheckedAt);

  return (
    <section className="citations-view" aria-labelledby="citations-title">
      <div className="view-heading citations-heading">
        <div>
          <p className="eyebrow">RESEARCH IMPACT · OPENALEX</p>
          <h2 id="citations-title">Citations</h2>
        </div>
        <label className="citation-year-select">
          Citations received
          <select value={selectedYear ?? ""} onChange={(event) => onYearChange(event.target.value || null)}>
            <option value="">All time</option>
            {[...availableYears].sort((a, b) => b - a).map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </div>
      <p className="citation-scope"><strong>{summary.publications} selected {summary.publications === 1 ? "paper" : "papers"}</strong>. Filters choose the publication cohort; the citation year selects when those papers received citations.</p>

      <div className="citation-stat-grid" aria-label="Citation statistics for selected papers">
        <div className="citation-stat">
          <span>{selectedYear === undefined ? "All-time citations" : `Citations received in ${selectedYear}`}</span>
          <strong>{countLabel(periodCitations)}</strong>
          <small>{periodCoverage} of {summary.publications} papers with {selectedYear === undefined ? "citation counts" : "history for this year"}</small>
        </div>
        <div className="citation-stat">
          <span>Papers with citation counts</span>
          <strong>{summary.coveredPublications}<em> / {summary.publications}</em></strong>
          <small>{summary.publications - summary.coveredPublications} unavailable · missing counts are excluded</small>
        </div>
        <div className="citation-stat">
          <span>Papers with annual history</span>
          <strong>{summary.annualCoveredPublications}<em> / {summary.publications}</em></strong>
          <small>{summary.annualCoveredPublications ? "Coverage varies by calendar year" : "Annual history unavailable"}</small>
        </div>
      </div>
      <p className="citation-overall">
        <Quote size={13} aria-hidden="true" />
        <span>Full collection: <strong>{countLabel(overall.totalCitations)}</strong> all-time citations across {overall.coveredPublications} of {overall.publications} papers.{hasSubset ? " The statistics above reflect your selected papers." : ""}</span>
      </p>
      <p className="citation-note">Counts are from OpenAlex and can differ from Google Scholar. Totals include only papers with available counts{summary.coveredPublications ? `; checked ${checkedRange}` : ""}.</p>

      <div className="citation-section-heading">
        <div>
          <h3>Citations received by year</h3>
          <p>Calendar year of the citation, across the selected papers.</p>
        </div>
        {selectedYear !== undefined && <button className="text-link" onClick={() => onYearChange(null)}>Show all time</button>}
      </div>
      {annualRows.length ? (
        <>
          <div className="citation-chart-scroll" tabIndex={0} role="group" aria-label="Citations received by calendar year. Select a year to rank papers.">
            <div className="citation-chart">
              {annualRows.map(({ year, citations, coveredPublications }) => (
                <button
                  key={year}
                  className={`${selectedYear === year ? "active" : ""} ${citations === undefined ? "citation-bar-unavailable" : ""}`}
                  onClick={() => onYearChange(String(year))}
                  aria-pressed={selectedYear === year}
                  aria-label={`${year}: ${countLabel(citations)} citations, ${coveredPublications} papers covered. Show papers for this citation year.`}
                  title={`${year}: ${countLabel(citations)} citations · ${coveredPublications}/${summary.publications} papers covered`}
                >
                  <span className="citation-bar-count">{citations === undefined ? "—" : citations.toLocaleString("en-GB")}</span>
                  <span className="citation-bar-track"><span className="citation-bar" style={{ height: `${citations === undefined ? 5 : Math.max(2, citations / maxAnnualCount * 100)}%` }} /></span>
                  <span>{year}</span>
                </button>
              ))}
            </div>
          </div>
          <details className="citation-year-data">
            <summary>View yearly counts and coverage</summary>
            <div className="citation-table-scroll" tabIndex={0} role="group" aria-label="Yearly citation counts and paper coverage">
              <table>
                <caption className="sr-only">Citations received in each calendar year by selected papers</caption>
                <thead><tr><th scope="col">Citation year</th><th scope="col">Citations</th><th scope="col">Papers covered</th></tr></thead>
                <tbody>{annualRows.map((row) => <tr key={row.year}><th scope="row">{row.year}</th><td>{countLabel(row.citations)}</td><td>{row.coveredPublications} / {summary.publications}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </>
      ) : <div className="citation-empty">Annual citation history is unavailable for this collection.</div>}
      <p className="citation-note">Annual history begins no earlier than 2012 and is available only within each paper’s reported OpenAlex range. Earlier years and missing histories are unavailable, not zero. Annual totals can cover fewer papers than all-time totals. All-time counts can include earlier citations, so they may exceed the sum of yearly figures.</p>

      <div className="citation-section-heading citation-ranking-heading">
        <div><h3>Citations by paper</h3><p>{period} · highest citation counts first · selected papers only</p></div>
        <span className="citation-coverage">{periodCoverage} / {summary.publications} covered</span>
      </div>
      {ranked.length ? (
        <>
          <div className="citation-table-scroll citation-paper-table-scroll" tabIndex={0} role="group" aria-label="Papers ranked by citations">
            <table className="citation-paper-table">
              <caption className="sr-only">Selected papers ranked by citations received {selectedYear === undefined ? "in all years" : `in ${selectedYear}`}. Unavailable counts appear last.</caption>
              <thead><tr><th scope="col" className="citation-rank">#</th><th scope="col">Publication</th><th scope="col" className="citation-number">{selectedYear ?? "All-time"}<span>Citations</span></th>{selectedYear !== undefined && <th scope="col" className="citation-number">All-time<span>Citations</span></th>}</tr></thead>
              <tbody>
                {ranked.slice(0, limit).map(({ publication, count, total, metrics }, index) => (
                  <tr key={publication.id}>
                    <td className="citation-rank">{count === undefined ? "—" : index + 1}</td>
                    <th scope="row">
                      <button className="paper-title" onClick={() => onSelect(publication)}>{publication.title}</button>
                      <p className="citation-paper-meta">{publication.year ?? "Year unavailable"}{publication.journal ? ` · ${publication.journal}` : ""}</p>
                      {metrics && <a className="citation-source-link" href={`https://openalex.org/${metrics.workId.split("/").pop()}`} target="_blank" rel="noopener noreferrer">OpenAlex <ArrowUpRight size={11} aria-hidden="true" /></a>}
                    </th>
                    <td className={`citation-number ${count === undefined ? "citation-unavailable" : ""}`}>{countLabel(count)}</td>
                    {selectedYear !== undefined && <td className={`citation-number ${total === undefined ? "citation-unavailable" : ""}`}>{countLabel(total)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ranked.length > limit && <button className="secondary-button load-more" onClick={() => setLimit((value) => value + 25)}>Load more papers <span>{Math.min(limit, ranked.length)} of {ranked.length}</span></button>}
        </>
      ) : <div className="citation-empty">No papers match your filters. Clear or broaden the filters to explore citations.</div>}
    </section>
  );
}
