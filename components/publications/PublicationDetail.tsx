"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRight, Check, FileText, MapPin, X } from "lucide-react";
import type { Publication } from "@/types/publication";
import {
  doiUrl,
  locationLabel,
  safeExternalUrl,
} from "@/components/explorer-utils";

export default function PublicationDetail({
  publication,
  onClose,
}: {
  publication: Publication | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (publication && !dialog.current?.open) dialog.current?.showModal();
    if (!publication && dialog.current?.open) dialog.current?.close();
  }, [publication]);

  return (
    <dialog
      ref={dialog}
      className="publication-dialog"
      aria-labelledby="detail-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {publication && (
        <div className="dialog-content">
          <div className="dialog-topline">
            <span className="eyebrow">
              <FileText size={14} aria-hidden="true" /> PUBLICATION DETAIL
            </span>
            <button
              className="icon-button"
              onClick={onClose}
              aria-label="Close publication details"
              autoFocus
            >
              <X size={21} />
            </button>
          </div>
          <div className="detail-year">
            {publication.year ?? "Year unavailable"}
            {publication.citationCount !== undefined && (
              <span>
                {publication.citationCount.toLocaleString()} citations in source
                metadata
              </span>
            )}
          </div>
          <h2 id="detail-title">{publication.title}</h2>
          <p className="detail-authors">
            {publication.authors.join(", ") || "Author metadata unavailable"}
          </p>
          <p className="detail-journal">
            {publication.journal ?? "Journal metadata unavailable"}
          </p>
          <section className="detail-section">
            <h3>
              <MapPin size={16} aria-hidden="true" />
              Study geography
            </h3>
            {publication.studyLocations.length ? (
              publication.studyLocations.map((location, index) => (
                <div
                  className="evidence-card"
                  key={`${location.name}-${index}`}
                >
                  <div className="evidence-heading">
                    <strong>{location.name}</strong>
                    <span
                      className={`confidence confidence-${location.confidence}`}
                    >
                      {location.manuallyVerified && (
                        <Check size={12} aria-hidden="true" />
                      )}
                      {location.manuallyVerified
                        ? "Manually verified"
                        : `${location.confidence} confidence`}
                    </span>
                  </div>
                  <p>
                    {location.evidence ||
                      "No supporting evidence was included in the source metadata."}
                  </p>
                </div>
              ))
            ) : (
              <p className="unknown-note">
                {locationLabel(publication)}. No study-location marker has been
                assigned to this publication.
              </p>
            )}
          </section>
          <section className="detail-section">
            <h3>Research topics</h3>
            <div className="paper-tags detail-tags">
              {publication.topics.length ? (
                publication.topics.map((topic) => (
                  <span key={topic}>{topic}</span>
                ))
              ) : (
                <p className="muted">Topic metadata unavailable.</p>
              )}
            </div>
          </section>
          <section className="detail-section">
            <h3>Abstract</h3>
            <p className="detail-abstract">
              {publication.abstract ||
                "An abstract is not available in the connected metadata sources. Visit the publication for the full research record."}
            </p>
          </section>
          <div className="detail-actions">
            {safeExternalUrl(publication.publicationUrl) && (
              <a
                className="primary-button"
                href={safeExternalUrl(publication.publicationUrl)}
                target="_blank"
                rel="noopener noreferrer"
              >
                View publication <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            )}
            {doiUrl(publication.doi) && (
              <a
                className="secondary-button"
                href={doiUrl(publication.doi)}
                target="_blank"
                rel="noopener noreferrer"
              >
                View DOI <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            )}
            <a
              className="secondary-button"
              href={`https://scholar.google.com/scholar?q=${encodeURIComponent(publication.title)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Scholar <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
          {publication.doi && (
            <p className="detail-doi">DOI: {publication.doi}</p>
          )}
          <div className="detail-sources">
            <span>Metadata sources</span>
            <div>
              {Object.entries(publication.source).map(([name, url]) =>
                safeExternalUrl(url) ? (
                  <a
                    key={name}
                    href={safeExternalUrl(url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {name === "openAlex"
                      ? "OpenAlex"
                      : name === "orcid"
                        ? "ORCID"
                        : name === "ktisis"
                          ? "Ktisis"
                          : "Crossref"}
                    <ArrowUpRight size={12} aria-hidden="true" />
                  </a>
                ) : null,
              )}
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
