"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Quote } from "lucide-react";
import type { Publication, ScholarCitationProfile } from "@/types/publication";
import { getCitationCount, getCitationMetrics, getCitationSummary, getYearCitations } from "@/lib/scholarCitations";

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
  reference,
  citationYear,
  onYearChange,
  onSelect,
}: {
  publications: Publication[];
  allPublications: Publication[];
  reference?: ScholarCitationProfile;
  citationYear: string;
  onYearChange: (year: string | null) => void;
  onSelect: (publication: Publication) => void;
}) {
  const [limit, setLimit] = useState(25);
  const summary = useMemo(() => getCitationSummary(publications), [publications]);
  const overall = useMemo(() => getCitationSummary(allPublications), [allPublications]);
  const hasSubset = publications.length !== allPublications.length;
  const profileScope = hasSubset ? undefined : reference;
  const profileHistory = reference?.yearly;
  const profileYears = profileHistory
    ? Array.from({ length: profileHistory.through - profileHistory.from + 1 }, (_, index) => profileHistory.from + index)
    : [];
  const availableYears = [...new Set([...overall.byYear.map(({ year }) => year), ...profileYears])].sort((a, b) => a - b);
  const selectedYear = /^\d{4}$/.test(citationYear) && availableYears.includes(Number(citationYear))
    ? Number(citationYear) : undefined;
  const annualRows = availableYears.map((year) => {
    const paperRow = summary.byYear.find((row) => row.year === year);
    return {
      year,
      citations: profileScope ? profileScope.yearly?.counts.find((row) => row.year === year)?.citations : paperRow?.citations,
      coveredPublications: paperRow?.coveredPublications ?? 0,
    };
  });
  const maxAnnualCount = Math.max(1, ...annualRows.map((row) => row.citations ?? 0));
  const period = selectedYear === undefined ? "All time" : String(selectedYear);
  const periodRow = summary.byYear.find((row) => row.year === selectedYear);
  const periodCitations = profileScope
    ? selectedYear === undefined ? profileScope.total : profileScope.yearly?.counts.find((row) => row.year === selectedYear)?.citations
    : selectedYear === undefined ? summary.totalCitations : periodRow?.citations;
  const periodCoverage = selectedYear === undefined ? summary.coveredPublications : periodRow?.coveredPublications ?? 0;
  const ranked = useMemo(() => publications.map((publication) => ({
    publication,
    count: selectedYear === undefined ? getCitationCount(publication) : getYearCitations(publication, selectedYear),
    total: getCitationCount(publication),
    metrics: getCitationMetrics(publication),
  })).sort((a, b) => (b.count ?? -1) - (a.count ?? -1) || a.publication.title.localeCompare(b.publication.title)), [publications, selectedYear]);
  const checkedRange = summary.oldestCheckedAt && summary.latestCheckedAt && summary.oldestCheckedAt !== summary.latestCheckedAt
    ? `${dateLabel(summary.oldestCheckedAt)}–${dateLabel(summary.latestCheckedAt)}`
    : dateLabel(summary.latestCheckedAt);

  return (
    <section className="citations-view" aria-labelledby="citations-title">
      <div className="view-heading citations-heading">
        <div>
          <p className="eyebrow">RESEARCH IMPACT · GOOGLE SCHOLAR</p>
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
      <p className="citation-scope"><strong>{countLabel(summary.publications)} selected site {summary.publications === 1 ? "paper" : "papers"}</strong>. {profileScope ? `The headline and annual chart show the full Google Scholar profile (${countLabel(profileScope.recordCount)} records); the paper table shows this site’s collection.` : "Filters choose the publication cohort; the citation year selects when those papers received citations."}</p>

      <div className="citation-stat-grid" aria-label={profileScope ? "Scholar profile citations and site paper coverage" : "Citation statistics for selected papers"}>
        <div className="citation-stat">
          <span>{profileScope ? "Scholar profile citations" : selectedYear === undefined ? "All-time citations" : `Citations received in ${selectedYear}`}</span>
          <strong>{countLabel(periodCitations)}</strong>
          <small>{profileScope ? `${period} · ${countLabel(profileScope.recordCount)} profile records` : `${countLabel(periodCoverage)} of ${countLabel(summary.publications)} papers with ${selectedYear === undefined ? "citation counts" : "history for this year"}`}</small>
        </div>
        <div className="citation-stat">
          <span>Papers with citation counts</span>
          <strong>{countLabel(summary.coveredPublications)}<em> / {countLabel(summary.publications)}</em></strong>
          <small>{countLabel(summary.publications - summary.coveredPublications)} unavailable · missing counts are excluded</small>
        </div>
        <div className="citation-stat">
          <span>Papers with annual history</span>
          <strong>{countLabel(summary.annualCoveredPublications)}<em> / {countLabel(summary.publications)}</em></strong>
          <small>{summary.annualCoveredPublications ? "Coverage varies by calendar year" : "Annual history unavailable"}</small>
        </div>
      </div>
      <p className="citation-overall">
        <Quote size={13} aria-hidden="true" />
        <span>{reference ? <>Full Google Scholar profile: <strong>{countLabel(reference.total)}</strong> all-time citations across {countLabel(reference.recordCount)} records. <a href={reference.url} target="_blank" rel="noopener noreferrer">Google Scholar <ArrowUpRight size={11} aria-hidden="true" /></a>{hasSubset ? " The statistics above reflect your selected site papers." : ""}</> : <>Full site collection: <strong>{countLabel(overall.totalCitations)}</strong> all-time citations across {countLabel(overall.coveredPublications)} of {countLabel(overall.publications)} papers.{hasSubset ? " The statistics above reflect your selected papers." : ""}</>}</span>
      </p>
      <p className="citation-note">{reference ? `Google Scholar ${reference.updateStatus === "snapshot" ? "snapshot" : "profile"} checked ${dateLabel(reference.checkedAt)}. ` : "Counts are from Google Scholar. "}Site paper totals include verified matches with available counts{summary.coveredPublications ? `; checked ${checkedRange}` : ""}. Missing counts are excluded.{ranked.some(({ metrics }) => metrics?.estimated) ? " An asterisk (*) marks an estimated Google Scholar count." : ""}</p>

      <div className="citation-section-heading">
        <div>
          <h3>Citations received by year</h3>
          <p>Calendar year of the citation, {profileScope ? "across the full Google Scholar profile." : "across the selected papers."}</p>
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
                  aria-label={`${year}: ${countLabel(citations)} citations, ${profileScope ? "full Google Scholar profile" : `${countLabel(coveredPublications)} papers covered`}. Show papers for this citation year.`}
                  title={`${year}: ${countLabel(citations)} citations · ${profileScope ? `Google Scholar profile (${countLabel(profileScope.recordCount)} records)` : `${countLabel(coveredPublications)}/${countLabel(summary.publications)} papers covered`}`}
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
            <div className="citation-table-scroll" tabIndex={0} role="group" aria-label={profileScope ? "Yearly Google Scholar profile citation counts" : "Yearly citation counts and paper coverage"}>
              <table>
                <caption className="sr-only">Citations received in each calendar year {profileScope ? "across the full Google Scholar profile" : "by selected papers"}</caption>
                <thead><tr><th scope="col">Citation year</th><th scope="col">Citations</th><th scope="col">{profileScope ? "Scope" : "Papers covered"}</th></tr></thead>
                <tbody>{annualRows.map((row) => <tr key={row.year}><th scope="row">{row.year}</th><td>{countLabel(row.citations)}</td><td>{profileScope ? `Scholar profile (${countLabel(profileScope.recordCount)} records)` : `${countLabel(row.coveredPublications)} / ${countLabel(summary.publications)}`}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </>
      ) : <div className="citation-empty">Annual citation history is unavailable for this collection.</div>}
      <p className="citation-note">{profileScope ? "Google Scholar reports profile lifetime and annual figures separately; they may not sum exactly. Profile history does not establish an individual paper’s annual history. " : "Annual totals include only selected papers with available history for that year. "}Missing histories and years outside a reported range are unavailable, not zero.</p>

      <div className="citation-section-heading citation-ranking-heading">
        <div><h3>Citations by paper</h3><p>{period} · highest citation counts first · selected papers only</p></div>
        <span className="citation-coverage">{countLabel(periodCoverage)} / {countLabel(summary.publications)} covered</span>
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
                      {metrics && <a className="citation-source-link" href={metrics.url} target="_blank" rel="noopener noreferrer">Google Scholar <ArrowUpRight size={11} aria-hidden="true" /></a>}
                    </th>
                    <td className={`citation-number ${count === undefined ? "citation-unavailable" : ""}`}>{countLabel(count)}{selectedYear === undefined && metrics?.estimated ? "*" : ""}</td>
                    {selectedYear !== undefined && <td className={`citation-number ${total === undefined ? "citation-unavailable" : ""}`}>{countLabel(total)}{metrics?.estimated ? "*" : ""}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ranked.length > limit && <button className="secondary-button load-more" onClick={() => setLimit((value) => value + 25)}>Load more papers <span>{countLabel(Math.min(limit, ranked.length))} of {countLabel(ranked.length)}</span></button>}
        </>
      ) : <div className="citation-empty">No papers match your filters. Clear or broaden the filters to explore citations.</div>}
    </section>
  );
}
