import "server-only";
import baseline from "@/data/citations.json";
import { withCitationMetrics } from "@/lib/citations";
import type { CitationMetrics, Publication } from "@/types/publication";

export function withBundledCitations(publications: Publication[]): Publication[] {
  return withCitationMetrics(publications, baseline.records as CitationMetrics[]);
}
