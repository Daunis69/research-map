import { ArrowUpRight, Quote } from "lucide-react";
import type { Publication } from "@/types/publication";
import { getCitationMetrics, getYearCitations } from "@/lib/scholarCitations";

function checkedDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(value));
}

export default function PublicationCitations({ publication }: { publication: Publication }) {
  const metrics = getCitationMetrics(publication);
  const annual = metrics?.yearly;
  const years = annual
    ? Array.from({ length: annual.through - annual.from + 1 }, (_, index) => annual.from + index)
    : [];

  return (
    <section className="detail-section detail-citations">
      <h3><Quote size={15} aria-hidden="true" /> Citations</h3>
      {metrics ? (
        <>
          <div className="detail-citation-total">
            <strong>{metrics.total.toLocaleString("en-GB")}{metrics.estimated ? "*" : ""}</strong>
            <span>all-time {metrics.total === 1 ? "citation" : "citations"}</span>
            <a className="text-link" href={metrics.url} target="_blank" rel="noopener noreferrer">
              Google Scholar <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </div>
          {annual ? (
            <>
              <p className="citation-note">Citations received by calendar year · {annual.from}–{annual.through}</p>
              <dl className="citation-history" aria-label="Annual citations received">
                {years.map((year) => (
                  <div key={year}>
                    <dt>{year}</dt>
                    <dd>{getYearCitations(publication, year)?.toLocaleString("en-GB") ?? "Unavailable"}</dd>
                  </div>
                ))}
              </dl>
              <p className="citation-note">Years outside this range are unavailable; they are not counted as zero.</p>
            </>
          ) : <p className="citation-note">Annual citation history is unavailable for this paper.</p>}
          <p className="citation-note">Google Scholar · last checked {checkedDate(metrics.checkedAt)}. Lifetime and annual figures are reported separately and may not sum exactly.{metrics.estimated ? " An asterisk (*) marks an estimated Google Scholar count." : ""}</p>
        </>
      ) : <p className="unknown-note">Citations unavailable. A verified Google Scholar citation record has not been matched to this paper.</p>}
    </section>
  );
}
