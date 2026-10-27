import { ArrowUpRight, Quote } from "lucide-react";
import type { Publication } from "@/types/publication";
import { getCitationMetrics } from "@/lib/citations";

export default function CitationBadge({ publication }: { publication: Publication }) {
  const metrics = getCitationMetrics(publication);
  return (
    <p className={`paper-citations ${metrics ? "" : "muted"}`}>
      <Quote size={12} aria-hidden="true" />
      {metrics ? (
        <>
          <span>{metrics.total.toLocaleString("en-GB")} {metrics.total === 1 ? "citation" : "citations"}</span>
          <a href={`https://openalex.org/${metrics.workId.split("/").pop()}`} target="_blank" rel="noopener noreferrer" aria-label="Citation source: OpenAlex">
            OpenAlex <ArrowUpRight size={11} aria-hidden="true" />
          </a>
        </>
      ) : "Citations unavailable"}
    </p>
  );
}
