import { ArrowUpRight, Quote } from "lucide-react";
import type { Publication } from "@/types/publication";
import { getCitationMetrics, getYearCitations } from "@/lib/citations";

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
            <strong>{metrics.total.toLocaleString("en-GB")}</strong>
            <span>all-time {metrics.total === 1 ? "citation" : "citations"}</span>
            <a className="text-link" href={`https://openalex.org/${metrics.workId.split("/").pop()}`} target="_blank" rel="noopener noreferrer">
              OpenAlex <ArrowUpRight size={12} aria-hidden="true" />
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
          <p className="citation-note">Last checked {checkedDate(metrics.checkedAt)}. OpenAlex counts can differ from Google Scholar.</p>
        </>
      ) : <p className="unknown-note">Citations unavailable. A verified OpenAlex citation record has not been retrieved for this paper.</p>}
    </section>
  );
}
