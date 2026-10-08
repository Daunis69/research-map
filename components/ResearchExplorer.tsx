"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Globe2,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Publication, PublicationDataset } from "@/types/publication";
import ResearchFilters from "@/components/filters/ResearchFilters";
import PublicationCard from "@/components/publications/PublicationCard";
import PublicationDetail from "@/components/publications/PublicationDetail";
import {
  countValues,
  filterPublications,
  geographyStatus,
  hasCoordinates,
  type ExplorerFilters,
  type Sort,
  type View,
} from "@/components/explorer-utils";

const ResearchMap = dynamic(() => import("@/components/map/ResearchMap"), {
  ssr: false,
  loading: () => (
    <div className="map-skeleton">
      <Globe2 size={38} strokeWidth={1} />
      <span>Loading research geography…</span>
    </div>
  ),
});
const SCHOLAR_URL =
  "https://scholar.google.com/citations?view_op=list_works&hl=en&user=iCd8LKAAAAAJ&sortby=pubdate";

export default function ResearchExplorer({
  dataset,
}: {
  dataset: PublicationDataset;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selectedPublication, setSelectedPublication] =
    useState<Publication | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [listLimit, setListLimit] = useState(24);
  const [railLimit, setRailLimit] = useState(12);
  const filterDialog = useRef<HTMLDialogElement>(null);
  const view = (
    ["map", "timeline", "publications"].includes(params.get("view") ?? "")
      ? params.get("view")
      : "map"
  ) as View;
  const filters: ExplorerFilters = {
    q: params.get("q") ?? "",
    year: params.get("year") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    country: params.get("location") ?? "",
    city: params.get("city") ?? "",
    place: params.get("place") ?? "",
    topic: params.get("topic") ?? "",
    geography: params.get("geography") ?? "",
    sort: (["newest", "oldest", "title", "citations"].includes(
      params.get("sort") ?? "",
    )
      ? params.get("sort")
      : "newest") as Sort,
  };
  const serializedFilters = JSON.stringify(filters);
  const filtered = useMemo(
    () =>
      filterPublications(
        dataset.publications,
        JSON.parse(serializedFilters) as ExplorerFilters,
      ),
    [dataset.publications, serializedFilters],
  );
  const update = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(window.location.search);
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    // Next.js integrates native history with useSearchParams. Filtering this
    // already-loaded dataset needs no server round trip, even while dragging a slider.
    startTransition(() =>
      window.history.replaceState(
        null,
        "",
        `${pathname}${next.size ? `?${next.toString()}` : ""}`,
      ),
    );
    setListLimit(24);
    setRailLimit(12);
  };
  const resetFilters = () =>
    update(
      Object.fromEntries(
        [
          "q",
          "year",
          "from",
          "to",
          "location",
          "city",
          "place",
          "topic",
          "geography",
        ].map((key) => [key, null]),
      ),
    );
  const total = dataset.publications.length;
  const years = dataset.publications
    .map((publication) => publication.year)
    .filter((year): year is number => year !== null);
  const countries = new Set(
    dataset.publications.flatMap((publication) =>
      publication.studyLocations
        .map((location) => location.country)
        .filter(Boolean),
    ),
  );
  const topics = new Set(
    dataset.publications.flatMap((publication) => publication.topics),
  );
  const mapped = filtered.filter((publication) =>
    publication.studyLocations.some(hasCoordinates),
  );
  const unknown = filtered.filter(
    (publication) => geographyStatus(publication) === "unknown",
  ).length;
  const global = filtered.filter(
    (publication) => geographyStatus(publication) === "non-geographic",
  ).length;
  const unplotted = filtered.length - mapped.length - unknown - global;
  const timeline = countValues(
    filtered.map((publication) =>
      publication.year === null ? "Year unavailable" : String(publication.year),
    ),
  ).sort((a, b) =>
    a[0] === "Year unavailable"
      ? 1
      : b[0] === "Year unavailable"
        ? -1
        : filters.sort === "oldest"
          ? Number(a[0]) - Number(b[0])
          : Number(b[0]) - Number(a[0]),
  );
  const maxYearCount = Math.max(1, ...timeline.map(([, count]) => count));
  const activeFilters = Object.entries({
    q: filters.q,
    year: filters.year,
    from: filters.from && `From ${filters.from}`,
    to: filters.to && `To ${filters.to}`,
    location: filters.country,
    city: filters.city,
    place: filters.place,
    topic: filters.topic,
    geography:
      filters.geography === "unknown"
        ? "Location not determined"
        : filters.geography === "non-geographic"
          ? "Global / Non-geographic"
          : filters.geography === "located"
            ? "Identified locations"
            : "",
  }).filter(([, value]) => value);
  const syncDate = Number.isNaN(Date.parse(dataset.fetchedAt))
    ? "Not available"
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(dataset.fetchedAt));
  const sourceFailure = dataset.sources.some(
    (source) => source.status === "error",
  );
  const emptyState = (
    <div className="empty-state">
      <Search size={30} strokeWidth={1.4} aria-hidden="true" />
      <h3>
        {total
          ? "No publications match your filters"
          : "The publication collection is not available yet"}
      </h3>
      <p>
        {total
          ? "Try a broader year range, a different topic, or clear your filters."
          : "Metadata sources may be temporarily unavailable. The collection will retry automatically when its cache refreshes."}
      </p>
      {total > 0 && (
        <button className="secondary-button" onClick={resetFilters}>
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <>
      <a className="skip-link" href="#research-results">
        Skip to research results
      </a>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Scientific Research Map home">
          Scientific Research Map
        </Link>
        <a
          className="scholar-header"
          href={SCHOLAR_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Google Scholar <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </header>
      <main>
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <h1 id="page-title">Professor Konstantinos C. Makris</h1>
            <p className="researcher-line">Cyprus University of Technology</p>
            <p className="hero-description">
              Explore publications by study location, topic and year.
            </p>
          </div>
        </section>
        <section className="metrics" aria-label="Collection statistics">
          <div className="metric">
            <div>
              <strong>{total.toLocaleString()}</strong>
              <span>Publications</span>
            </div>
          </div>
          <div className="metric">
            <div>
              <strong>{countries.size}</strong>
              <span>Study countries</span>
            </div>
          </div>
          <div className="metric">
            <div>
              <strong className="year-stat">
                {years.length
                  ? `${Math.min(...years)}–${Math.max(...years)}`
                  : "—"}
              </strong>
              <span>Publication years</span>
            </div>
          </div>
          <div className="metric">
            <div>
              <strong>{topics.size}</strong>
              <span>Research topics</span>
            </div>
          </div>
          <div className="collection-status">
            <span
              className={`status-dot ${dataset.isFallback || sourceFailure ? "status-amber" : ""}`}
            />
            <div>
              <strong>
                {dataset.isFallback
                  ? "Saved collection"
                  : "Updated automatically"}
              </strong>
              <span>Checked {syncDate}</span>
            </div>
          </div>
        </section>
        <section className="explorer" aria-label="Research explorer">
          <aside className="desktop-filters">
            <ResearchFilters
              publications={dataset.publications}
              filters={filters}
              update={update}
              reset={resetFilters}
            />
          </aside>
          <div className="results-panel" id="research-results" tabIndex={-1}>
            <div className="results-toolbar">
              <nav className="view-tabs" aria-label="Research view">
                {(
                  [
                    { id: "map", label: "Map", icon: Globe2 },
                    { id: "timeline", label: "Timeline", icon: CalendarDays },
                    {
                      id: "publications",
                      label: "Publications",
                      icon: FileText,
                    },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    aria-current={view === id ? "page" : undefined}
                    onClick={() => update({ view: id === "map" ? null : id })}
                    className={view === id ? "active" : ""}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </nav>
              <div className="toolbar-right">
                <button
                  className="mobile-filter-toggle secondary-button"
                  onClick={() => filterDialog.current?.showModal()}
                >
                  <SlidersHorizontal size={15} aria-hidden="true" />
                  Filters
                  {activeFilters.length > 0 && (
                    <span>{activeFilters.length}</span>
                  )}
                </button>
                <span className="result-count" role="status">
                  {pending ? (
                    "Updating…"
                  ) : (
                    <>
                      <strong>{filtered.length}</strong>{" "}
                      {filtered.length === 1 ? "publication" : "publications"}
                    </>
                  )}
                </span>
              </div>
            </div>
            {activeFilters.length > 0 && (
              <div className="active-filters" aria-label="Active filters">
                {activeFilters.map(([key, value]) => (
                  <button
                    key={key}
                    onClick={() =>
                      update({
                        [key]: null,
                        ...(key === "location" ? { city: null } : {}),
                      })
                    }
                  >
                    {value}
                    <X size={12} aria-hidden="true" />
                    <span className="sr-only">Remove filter</span>
                  </button>
                ))}
                <button className="clear-filters" onClick={resetFilters}>
                  Clear all
                </button>
              </div>
            )}
            {view === "map" && (
              <div className="map-layout">
                <section
                  className="map-section"
                  aria-label="Study location map"
                >
                  <div className="map-heading">
                    <h2>Study locations</h2>
                    <p>Select a marker to explore.</p>
                  </div>
                  <div className="map-container">
                    <ResearchMap
                      publications={filtered}
                      onSelectLocation={(name) => update({ place: name })}
                      resetKey={resetKey}
                    />
                    {mapped.length === 0 && (
                      <div className="map-empty">
                        <MapPin size={20} />
                        <strong>No mapped study locations</strong>
                        <span>
                          {filtered.length
                            ? "These publications remain available in the list."
                            : "Broaden your filters to explore the map."}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="map-bottom-overlay">
                    <div className="map-legend">
                      <span className="legend-bubble">n</span>
                      <span>Publications at a study location</span>
                    </div>
                    <button
                      onClick={() => {
                        setResetKey((value) => value + 1);
                        update({ place: null });
                      }}
                      className="map-reset"
                    >
                      Reset view
                    </button>
                  </div>
                  <div className="map-caption">
                    <span>
                      <MapPin size={13} aria-hidden="true" />
                      {mapped.length} publications with mapped study locations
                    </span>
                  </div>
                </section>
                <aside
                  className="publication-rail"
                  aria-label="Publications matching the map"
                >
                  <div className="rail-heading">
                    <div>
                      <h2>{filters.place || "Publications"}</h2>
                    </div>
                    <span className="count-badge">{filtered.length}</span>
                  </div>
                  <div className="rail-sort">
                    <span>
                      {filters.sort === "oldest"
                        ? "Oldest first"
                        : filters.sort === "title"
                          ? "Title A–Z"
                          : filters.sort === "citations"
                            ? "Most cited first"
                            : "Newest first"}
                    </span>
                  </div>
                  <div className="rail-list">
                    {filtered.length
                      ? filtered
                          .slice(0, railLimit)
                          .map((publication) => (
                            <PublicationCard
                              key={publication.id}
                              publication={publication}
                              onSelect={setSelectedPublication}
                              compact
                            />
                          ))
                      : emptyState}
                    {filtered.length > railLimit && (
                      <button
                        className="rail-load-more"
                        onClick={() => setRailLimit((limit) => limit + 12)}
                      >
                        Load more publications <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                  <button
                    className="view-all-button"
                    onClick={() => update({ view: "publications" })}
                  >
                    View all publications{" "}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </aside>
              </div>
            )}
            {view === "timeline" && (
              <section className="timeline-view">
                <div className="view-heading">
                  <div>
                    <h2>Publication timeline</h2>
                  </div>
                  <select
                    aria-label="Timeline order"
                    value={filters.sort === "oldest" ? "oldest" : "newest"}
                    onChange={(event) => update({ sort: event.target.value })}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </div>
                {filtered.length ? (
                  <>
                    <div
                      className="year-chart"
                      aria-label="Publication counts by year"
                    >
                      {[...timeline]
                        .filter(([year]) => year !== "Year unavailable")
                        .sort((a, b) => Number(a[0]) - Number(b[0]))
                        .map(([year, count]) => (
                          <button
                            key={year}
                            title={`${year}: ${count} publications. Filter to this year.`}
                            onClick={() =>
                              update({ year, from: null, to: null })
                            }
                          >
                            <span className="bar-count">{count}</span>
                            <span
                              className="year-bar"
                              style={{
                                height: `${Math.max(5, (count / maxYearCount) * 95)}px`,
                              }}
                            />
                            <span>{year}</span>
                          </button>
                        ))}
                    </div>
                    <div className="timeline-list">
                      {timeline.map(([year, count]) => (
                        <section className="timeline-year" key={year}>
                          <div className="timeline-year-label">
                            <h3>{year}</h3>
                            <span>
                              {count}{" "}
                              {count === 1 ? "publication" : "publications"}
                            </span>
                          </div>
                          <div className="timeline-papers">
                            {filtered
                              .filter(
                                (publication) =>
                                  String(
                                    publication.year ?? "Year unavailable",
                                  ) === year,
                              )
                              .map((publication) => (
                                <PublicationCard
                                  key={publication.id}
                                  publication={publication}
                                  onSelect={setSelectedPublication}
                                />
                              ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  </>
                ) : (
                  emptyState
                )}
              </section>
            )}
            {view === "publications" && (
              <section className="publications-view">
                <div className="view-heading">
                  <div>
                    <h2>Publications</h2>
                  </div>
                  <select
                    aria-label="Sort publications"
                    value={filters.sort}
                    onChange={(event) => update({ sort: event.target.value })}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="title">Title A–Z</option>
                    <option value="citations">Most cited</option>
                  </select>
                </div>
                <div className="publications-grid">
                  {filtered.slice(0, listLimit).map((publication) => (
                    <PublicationCard
                      key={publication.id}
                      publication={publication}
                      onSelect={setSelectedPublication}
                    />
                  ))}
                </div>
                {!filtered.length && emptyState}
                {filtered.length > listLimit && (
                  <button
                    className="secondary-button load-more"
                    onClick={() => setListLimit((limit) => limit + 24)}
                  >
                    Load more publications{" "}
                    <span>
                      {Math.min(listLimit, filtered.length)} of{" "}
                      {filtered.length}
                    </span>
                  </button>
                )}
              </section>
            )}
            <div className="geography-note">
              <p>
                {unknown}{" "}
                with location not determined · {global} global / non-geographic
                {unplotted > 0
                  ? ` · ${unplotted} with an identified place awaiting coordinates`
                  : ""}
                . These papers appear in the publication list and timeline.
              </p>
              <button
                onClick={() =>
                  update({
                    view: "publications",
                    geography: "unknown",
                    place: null,
                    location: null,
                    city: null,
                  })
                }
              >
                View unmapped <ArrowRight size={13} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
        <details className="source-details" id="methodology">
          <summary>
            <span
              className={`status-dot ${dataset.isFallback || sourceFailure ? "status-amber" : ""}`}
            />
            Sources & study-location methodology{" "}
            <ChevronRight size={14} aria-hidden="true" />
          </summary>
          <div className="source-detail-content">
            <p>
              Study locations come from evidence in publication titles,
              abstracts and keywords, never author affiliations. Open a
              publication to inspect its location evidence and confidence.
              Uncertain locations remain unmapped.
            </p>
            <p>
              {dataset.isFallback
                ? "A saved collection is being served while live metadata is unavailable. Its source date is shown above; it may not include the newest publications."
                : "The collection is checked automatically. Source counts describe fetched records before merging and deduplication."}
            </p>
            <ul>
              {dataset.sources.map((source, index) => (
                <li key={`${source.source}-${index}`}>
                  <strong>{source.source}</strong>
                  <span>
                    {source.status === "ok" ? (
                      <>
                        <Check size={13} aria-hidden="true" />
                        {source.count} records
                      </>
                    ) : source.status === "error" ? (
                      "Temporarily unavailable"
                    ) : (
                      "Not queried"
                    )}
                  </span>
                  {source.message && <p>{source.message}</p>}
                </li>
              ))}
            </ul>
            <p>
              Country-level markers use representative coordinates, not exact
              participant or field-site locations. The displayed collection may
              be incomplete when a source is unavailable or has not indexed a
              paper yet.
            </p>
          </div>
        </details>
      </main>
      <footer className="site-footer">
        <span>
          Konstantinos C. Makris <span className="footer-divider">/</span>{" "}
          Scientific Research Map
        </span>
        <span>Collection checked {syncDate}</span>
      </footer>
      <dialog
        ref={filterDialog}
        className="filter-dialog"
        aria-label="Research filters"
        onClick={(event) => {
          if (event.target === event.currentTarget)
            filterDialog.current?.close();
        }}
      >
        <ResearchFilters
          publications={dataset.publications}
          filters={filters}
          update={update}
          reset={resetFilters}
          onClose={() => filterDialog.current?.close()}
        />
      </dialog>
      <PublicationDetail
        publication={selectedPublication}
        onClose={() => setSelectedPublication(null)}
      />
    </>
  );
}
