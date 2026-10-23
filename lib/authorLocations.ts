import overrideData from "../data/author-location-overrides.json";
import type { AuthorLocation, LocationOverride, Publication } from "../types/publication";
import { findLocationOverride } from "./locationExtractor";
import { geocodeLocation, validCoordinates } from "./geocode";
import { deriveTopics } from "./topics";

const overrides = overrideData as Record<string, LocationOverride>;
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

export function affiliationCountry(code: string | undefined): string | undefined {
  if (!code || !/^[A-Z]{2}$/.test(code)) return undefined;
  const name = countryNames.of(code);
  if (!name || name === code || code === "ZZ") return undefined;
  return code === "TR" ? "Turkey" : name;
}

/** Only paper-specific affiliations supply map geography. Old study pins are ignored. */
export function enrichAuthorLocations(
  publication: Publication,
  entries: Record<string, LocationOverride> = overrides,
): Publication {
  const override = findLocationOverride(publication, entries);
  if (override) {
    const authorLocations: AuthorLocation[] = override.locations.map(location => ({
      ...geocodeLocation(location), authors: [], institutions: [],
      precision: location.city ? "institution" : "country", manuallyVerified: true,
      evidence: location.evidence ?? override.note ?? "Manually reviewed author affiliation location.",
    }));
    return { ...publication, authorLocations, geographyStatus: authorLocations.length ? "located" : "unknown", topics: deriveTopics(publication) };
  }
  const grouped = new Map<string, AuthorLocation>();
  for (const affiliation of publication.authorAffiliations ?? []) {
    const country = affiliationCountry(affiliation.countryCode) ?? affiliation.country;
    const precise = validCoordinates(affiliation);
    if (!country && !precise) continue;
    const name = precise
      ? [affiliation.city ?? affiliation.institution, country].filter(Boolean).join(", ")
      : country!;
    if (!name) continue;
    const base = precise ? {
      name, country, city: affiliation.city,
      latitude: affiliation.latitude, longitude: affiliation.longitude,
      confidence: "high" as const,
    } : geocodeLocation({ name, country, confidence: "medium" });
    const key = `${base.name}|${base.latitude ?? ""}|${base.longitude ?? ""}`;
    const location = grouped.get(key) ?? {
      ...base, authors: [], institutions: [], precision: precise ? "institution" : "country",
      evidence: precise ? "Institution location from affiliation metadata attached to this publication." : "Country reported in this publication’s author affiliations; marker represents the country.",
    } satisfies AuthorLocation;
    if (!location.authors.includes(affiliation.author)) location.authors.push(affiliation.author);
    if (affiliation.institution && !location.institutions.includes(affiliation.institution)) location.institutions.push(affiliation.institution);
    grouped.set(key, location);
  }
  const authorLocations = [...grouped.values()];
  return { ...publication, topics: deriveTopics(publication), authorLocations,
    geographyStatus: authorLocations.length ? "located" : "unknown" };
}
