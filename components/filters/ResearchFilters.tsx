"use client";

import { Search, X } from "lucide-react";
import type { Publication } from "@/types/publication";
import {
  countValues,
  geographyStatus,
  type ExplorerFilters,
} from "@/components/explorer-utils";

export interface FilterProps {
  publications: Publication[];
  filters: ExplorerFilters;
  update: (values: Record<string, string | null>) => void;
  reset: () => void;
  onClose?: () => void;
}

export default function ResearchFilters({
  publications,
  filters,
  update,
  reset,
  onClose,
}: FilterProps) {
  const years = publications
    .map((publication) => publication.year)
    .filter((year): year is number => year !== null && Number.isFinite(year));
  const minYear = years.length
    ? Math.min(...years)
    : new Date().getUTCFullYear();
  const maxYear = years.length ? Math.max(...years) : minYear;
  const countries = [
    ...new Set(
      publications.flatMap((publication) =>
        publication.studyLocations
          .map((location) => location.country)
          .filter((country): country is string => Boolean(country)),
      ),
    ),
  ].sort();
  const cities = [
    ...new Set(
      publications.flatMap((publication) =>
        publication.studyLocations
          .filter(
            (location) =>
              !filters.country || location.country === filters.country,
          )
          .map((location) => location.city)
          .filter((city): city is string => Boolean(city)),
      ),
    ),
  ].sort();
  const topics = countValues(
    publications.flatMap((publication) => [...new Set(publication.topics)]),
  );
  const regions = countValues(
    publications.flatMap((publication) => [
      ...new Set(publication.studyLocations.map((location) => location.name)),
    ]),
  ).slice(0, 5);
  const unknown = publications.filter(
    (publication) => geographyStatus(publication) === "unknown",
  ).length;
  const global = publications.filter(
    (publication) => geographyStatus(publication) === "non-geographic",
  ).length;
  const prefix = onClose ? "mobile-" : "desktop-";

  return (
    <div className="filter-content">
      <div className="filter-heading">
        <h2>Filters</h2>
        {onClose ? (
          <button
            className="icon-button"
            aria-label="Close filters"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        ) : (
          <button className="reset-link" onClick={reset}>
            Reset
          </button>
        )}
      </div>
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          update({ q: String(data.get("q") ?? "") });
        }}
      >
        <label className="sr-only" htmlFor={`${prefix}search`}>
          Search publications, authors, journals or keywords
        </label>
        <input
          id={`${prefix}search`}
          name="q"
          key={filters.q}
          defaultValue={filters.q}
          type="search"
          placeholder="Search publications…"
        />
        <button type="submit" aria-label="Search publications">
          <Search size={17} />
        </button>
      </form>
      <section className="filter-section">
        <div className="filter-label-row">
          <h3>Publication year</h3>
          <button
            className="reset-link"
            onClick={() => update({ year: null, from: null, to: null })}
          >
            All years
          </button>
        </div>
        <div className="year-range-label">
          <span>{filters.year || filters.from || minYear}</span>
          <span>—</span>
          <span>{filters.year || filters.to || maxYear}</span>
        </div>
        <div className="year-sliders">
          <label className="sr-only" htmlFor={`${prefix}year-from`}>
            Publication year from
          </label>
          <input
            id={`${prefix}year-from`}
            type="range"
            min={minYear}
            max={maxYear}
            value={filters.year || filters.from || minYear}
            onChange={(event) =>
              update({
                year: null,
                from: event.target.value,
                to: String(
                  Math.max(
                    Number(event.target.value),
                    Number(filters.to || filters.year || maxYear),
                  ),
                ),
              })
            }
            disabled={!years.length}
          />
          <label className="sr-only" htmlFor={`${prefix}year-to`}>
            Publication year to
          </label>
          <input
            id={`${prefix}year-to`}
            type="range"
            min={minYear}
            max={maxYear}
            value={filters.year || filters.to || maxYear}
            onChange={(event) =>
              update({
                year: null,
                to: event.target.value,
                from: String(
                  Math.min(
                    Number(event.target.value),
                    Number(filters.from || filters.year || minYear),
                  ),
                ),
              })
            }
            disabled={!years.length}
          />
        </div>
        <p className="filter-hint">Adjust the start and end of the period.</p>
      </section>
      <section className="filter-section">
        <label className="filter-label" htmlFor={`${prefix}country`}>
          Study location
        </label>
        <select
          id={`${prefix}country`}
          value={filters.country}
          onChange={(event) =>
            update({ location: event.target.value, city: null, place: null })
          }
        >
          <option value="">All countries</option>
          {countries.map((country) => (
            <option key={country}>{country}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`${prefix}city`}>
          City or region
        </label>
        <select
          id={`${prefix}city`}
          value={filters.city}
          onChange={(event) =>
            update({ city: event.target.value, place: null })
          }
        >
          <option value="">All cities / regions</option>
          {cities.map((city) => (
            <option key={city}>{city}</option>
          ))}
        </select>
      </section>
      <section className="filter-section">
        <label className="filter-label" htmlFor={`${prefix}topics`}>
          Research topic
        </label>
        <select
          id={`${prefix}topics`}
          value={filters.topic}
          onChange={(event) => update({ topic: event.target.value })}
        >
          <option value="">All research topics</option>
          {topics.map(([topic, count]) => (
            <option key={topic} value={topic}>
              {topic} ({count})
            </option>
          ))}
        </select>
      </section>
      <section className="filter-section">
        <label className="filter-label" htmlFor={`${prefix}geography`}>
          Geographic coverage
        </label>
        <select
          id={`${prefix}geography`}
          value={filters.geography}
          onChange={(event) => update({ geography: event.target.value })}
        >
          <option value="">All publications</option>
          <option value="located">Identified study locations</option>
          <option value="unknown">Location not determined ({unknown})</option>
          <option value="non-geographic">
            Global / Non-geographic ({global})
          </option>
        </select>
      </section>
      {regions.length > 0 && (
        <details className="filter-section region-section">
          <summary>Most studied regions</summary>
          <div className="region-list">
            {regions.map(([region, count]) => (
              <button
                key={region}
                onClick={() =>
                  update({ place: filters.place === region ? null : region })
                }
                className={filters.place === region ? "active" : ""}
              >
                <span>{region}</span>
                <span className="region-count">{count}</span>
              </button>
            ))}
          </div>
        </details>
      )}
      {onClose && (
        <div className="mobile-filter-actions">
          <button className="secondary-button" onClick={reset}>
            Reset filters
          </button>
          <button className="primary-button" onClick={onClose}>
            Show results
          </button>
        </div>
      )}
    </div>
  );
}
