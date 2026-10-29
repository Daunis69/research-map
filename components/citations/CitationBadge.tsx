import { ArrowUpRight, Quote } from "lucide-react";
import type { Publication } from "@/types/publication";
import { getCitationMetrics } from "@/lib/scholarCitations";

export default function CitationBadge({ publication }: { publication: Publication }) {
  const metrics = getCitationMetrics(publication);
  return (
    <p className={`paper-citations ${metrics ? "" : "muted"}`}>
      <Quote size={12} aria-hidden="true" />
      {metrics ? (
        <>
          <span title={metrics.estimated ? "Estimated Google Scholar citation count" : undefined}>{metrics.total.toLocaleString("en-GB")}{metrics.estimated ? "*" : ""} {metrics.total === 1 ? "citation" : "citations"}</span>
          <a href={metrics.url} target="_blank" rel="noopener noreferrer" aria-label="Citation source: Google Scholar">
            Google Scholar <ArrowUpRight size={11} aria-hidden="true" />
          </a>
        </>
      ) : "Citations unavailable"}
    </p>
  );
}
