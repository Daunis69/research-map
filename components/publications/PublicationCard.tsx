import { ArrowUpRight, MapPin } from "lucide-react";
import type { Publication } from "@/types/publication";
import {
  doiUrl,
  geographyStatus,
  locationLabel,
} from "@/components/explorer-utils";

export default function PublicationCard({
  publication,
  onSelect,
  compact = false,
}: {
  publication: Publication;
  onSelect: (publication: Publication) => void;
  compact?: boolean;
}) {
  return (
    <article
      className={`publication-card ${compact ? "publication-card-compact" : ""}`}
    >
      <div className="paper-eyebrow">
        <span>{publication.year ?? "Year unavailable"}</span>
        <span className="paper-type">RESEARCH PUBLICATION</span>
      </div>
      <h3>
        <button className="paper-title" onClick={() => onSelect(publication)}>
          {publication.title}
        </button>
      </h3>
      <p className="paper-journal">
        {publication.journal ?? "Journal not provided"}
      </p>
      {!compact && (
        <p className="paper-authors">
          {publication.authors.slice(0, 4).join(", ") || "Authors not provided"}
          {publication.authors.length > 4
            ? ` +${publication.authors.length - 4} authors`
            : ""}
        </p>
      )}
      <p
        className={`paper-location ${geographyStatus(publication) !== "located" ? "muted" : ""}`}
      >
        <MapPin size={13} aria-hidden="true" />
        {locationLabel(publication)}
      </p>
      <div className="paper-bottom">
        <div className="paper-tags">
          {publication.topics.slice(0, compact ? 2 : 3).map((topic) => (
            <span key={topic}>{topic}</span>
          ))}
          {publication.topics.length > (compact ? 2 : 3) && (
            <span title={publication.topics.slice(compact ? 2 : 3).join(", ")}>
              +{publication.topics.length - (compact ? 2 : 3)}
            </span>
          )}
        </div>
        {!compact && doiUrl(publication.doi) && (
          <a
            className="text-link doi-link"
            href={doiUrl(publication.doi)}
            target="_blank"
            rel="noopener noreferrer"
          >
            DOI <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        )}
      </div>
    </article>
  );
}
