import overrideData from "../data/location-overrides.json";
import type {
  LocationOverride,
  Publication,
  StudyLocation,
} from "../types/publication";
import {
  findKnownPlace,
  geocodeLocation,
  KNOWN_PLACES,
  type KnownPlace,
} from "./geocode";
import { deriveTopics } from "./topics";

export interface LocationInput {
  title: string;
  abstract?: string;
  keywords?: readonly string[];
  /** Supply study-area descriptions, never author-address/repository owner fields. */
  repositoryMetadata?: readonly string[];
}

type EvidenceSource = "Title" | "Abstract" | "Keyword" | "Repository metadata";
const overrides = overrideData as Record<string, LocationOverride>;

const affiliation =
  /\b(?:affiliat\w*|universit\w*|department|faculty|researchers?|investigators?|authors?|collaborators?|correspondence|publisher|published by|journal office|co-authors?)\b/i;
const background =
  /\b(?:previous(?:ly)?|earlier|prior|other|published)\s+(?:research|studies|study|surveys?|reports?|cohorts?)\b|\b(?:for example|such as|e\.g\.|compared (?:with|to)|comparison (?:with|to)|unlike|similar to)\b/i;
const hypothetical =
  /\b(?:will be|would be|could be|to be|planned|proposed|hypothetical|simulated)\b/i;
const negated =
  /\b(?:not|never)\s+(?:(?:actually|directly|physically)\s+)?(?:conducted|performed|carried out|recruited|enrolled|collected|in|from)|\bno\s+(?:participants|children|adults|samples)|\b(?:excluded|exclusion)\b/i;
const originOnly =
  /\b(?:born|immigrants?|migrants?|refugees?|nationality|citizenship|manufactured|imported|developed in)\b/i;
const empirical =
  /\b(?:study|survey|trial|cohort|sampling|samples?|measured|measurements?|exposures?|exposom\w*|contamination|biomonitoring|epidemiolog\w*|children|adults|residents|population|patients|workers|nurses|groundwater|water|air pollution|air quality|incidence|prevalence|cancer|thyroid|health risks?|diseases?)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clauses(text: string): string[] {
  return text
    .replace(
      /<\/?(?:[a-z]+:)?(?:p|div|span|i|b|em|strong|sup|sub|br|title|sec|italic|bold|abstract|xref|label|ext-link|a)\b[^<>]*>/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .split(
      /(?<=[.!?])\s+(?=[A-Z])|[;\n]|\b(?:whereas|while|but|and compared|in contrast to|using|according to)\b/i,
    )
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function matchedPlaces(
  clause: string,
): Array<{ place: KnownPlace; index: number; length: number }> {
  const matches: Array<{ place: KnownPlace; index: number; length: number }> =
    [];
  for (const place of KNOWN_PLACES) {
    if (
      place.requiresCountry &&
      !new RegExp(`\\b${escapeRegExp(place.country)}\\b`, "i").test(clause)
    )
      continue;
    for (const alias of place.aliases) {
      const pattern = new RegExp(
        `(?<![\\p{L}])${escapeRegExp(alias)}(?![\\p{L}])`,
        "giu",
      );
      for (const match of clause.matchAll(pattern))
        matches.push({ place, index: match.index, length: match[0].length });
    }
  }
  // Longest aliases win (e.g. United States of America vs. United States).
  return matches
    .sort((a, b) => a.index - b.index || b.length - a.length)
    .filter(
      (match, index, all) =>
        !all
          .slice(0, index)
          .some(
            (other) =>
              other.index <= match.index &&
              other.index + other.length >= match.index + match.length,
          ),
    );
}

function isStudyEvidence(
  clause: string,
  placeIndex: number,
  source: EvidenceSource,
): boolean {
  if (
    affiliation.test(clause) ||
    background.test(clause) ||
    hypothetical.test(clause) ||
    negated.test(clause) ||
    originOnly.test(clause)
  )
    return false;
  const prefix = clause.slice(0, placeIndex);
  // Limit extraction to an explicit geographic phrase; names merely mentioned in
  // background discussion, instrument brands or citation titles are insufficient.
  const geographicPhrase =
    /\b(?:in|from|across|within|at|near|of|around)\s+(?:(?:the|rural|urban|southern|northern|eastern|western|central|south-eastern|north-eastern|south-western|north-western|island of|city of|region of)\s+)*$/i.test(
      prefix,
    ) ||
    /\b(?:in|from|across|within|at|near|around)\b[^.;:]{0,100}(?:,\s*|\band\s+|\band in\s+)$/i.test(
      prefix,
    ) ||
    (source === "Title" && /[:(]\s*$/.test(prefix)) ||
    (/\bcohort\s*\($/i.test(prefix) &&
      /\b(?:nested|set up|case.control|cross-sectional)\b/i.test(clause));
  if (!geographicPhrase) return false;
  if (source === "Title")
    return (
      empirical.test(clause) &&
      !/\b(?:review|perspective|commentary|editorial|protocol)\b/i.test(clause)
    );
  if (
    (source === "Keyword" || source === "Repository metadata") &&
    /\b(?:study (?:site|area|location)|sampling (?:site|area|location))\s*(?::|is|in)/i.test(
      clause,
    )
  )
    return true;
  if (
    /\b(?:study|survey|trial|cohort)\b.{0,70}\b(?:was|were)\b.{0,20}\b(?:conducted|undertaken|performed|carried out|set up|initiated)\b/i.test(
      prefix,
    )
  )
    return true;
  if (
    /\b(?:this|the|our)\s+(?:study|survey|trial|cohort|research)\b.{0,100}\b(?:conducted|undertaken|performed|carried out|took place|based|consisted|included|recruited|enrolled)\b/i.test(
      prefix,
    )
  )
    return true;
  if (
    /\b(?:study|cohort)\b/i.test(prefix) &&
    /\b(?:was|were)\s+(?:conducted|set up)\b/i.test(clause.slice(placeIndex))
  )
    return true;
  if (
    /\b(?:post-hoc analysis|secondary analysis)\b.{0,120}\b(?:study|cohort)\b/i.test(
      prefix,
    ) &&
    /\bsubjects?\s+(?:were\s+)?included\b/i.test(clause.slice(placeIndex))
  )
    return true;
  if (
    /\b(?:participants?|subjects?|children|adults?|patients?|workers?|residents?|families|women|men|volunteers?|population|households?)\b.{0,65}\b(?:recruited|enrolled|selected|living|residing|resided|residence)\b/i.test(
      prefix,
    )
  )
    return true;
  if (
    /\b(?:samples?|measurements?|sampling|specimens?)\b.{0,65}\b(?:collected|obtained|taken|performed|conducted)\b/i.test(
      prefix,
    )
  )
    return true;
  if (
    /\bwe\b.{0,45}\b(?:recruited|enrolled|sampled|surveyed|collected|assessed|measured|examined|investigated)\b/i.test(
      prefix,
    )
  )
    return true;
  // Passive recruitment commonly follows the country: "children from Cyprus
  // were recruited". A sample/population noun and an actual action are required.
  return (
    /\b(?:participants?|children|adults?|patients?|workers?|residents?|samples?|households?)\b/i.test(
      prefix,
    ) &&
    /\b(?:were|was)\s+(?:randomly\s+)?(?:recruited|enrolled|selected|sampled|collected|assessed|examined|analy[sz]ed)\b/i.test(
      clause.slice(placeIndex),
    )
  );
}

function explicitUnlistedPlaces(
  clause: string,
  source: EvidenceSource,
): StudyLocation[] {
  if (
    affiliation.test(clause) ||
    background.test(clause) ||
    hypothetical.test(clause) ||
    negated.test(clause) ||
    originOnly.test(clause)
  )
    return [];
  // Restrict free-form recognition to explicit method/location labels and named
  // places; unresolved names are retained without coordinates, never guessed.
  const pattern =
    /\b(?:(?:study|survey|trial)\s+(?:was\s+)?conducted\s+in\s+|(?:study|sampling) (?:site|area|location)\s*:\s*)([A-Z][\p{L}'-]*(?:\s+[A-Z][\p{L}'-]*){0,3})(?:,\s*([A-Z][\p{L}'-]*(?:\s+[A-Z][\p{L}'-]*){0,3}))?/gu;
  const locations: StudyLocation[] = [];
  for (const match of clause.matchAll(pattern)) {
    const name = match[1].trim();
    if (
      /^(?:The|Methods|Results|Conclusion|Europe|Asia|Africa|Global|Worldwide|Laboratory|Laboratories|Hospital|Clinic|School|Primary|Secondary|General|January|February|March|April|May|June|July|August|September|October|November|December|Spring|Summer|Autumn|Winter)\b/.test(
        name,
      )
    )
      continue;
    if (findKnownPlace(name)) continue;
    const country = match[2] ? findKnownPlace(match[2]) : undefined;
    // Without country context, a capitalized phrase could be a language, month,
    // named method or institution rather than a place. Prefer an unknown site.
    if (!country || country.city) continue;
    locations.push({
      name,
      country: country.country,
      city: name,
      confidence: "medium",
      evidence: `${source}: “${clause.slice(0, 700)}” (Named study site; coordinates require review.)`,
    });
  }
  return locations;
}

export function extractStudyLocations(input: LocationInput): StudyLocation[] {
  const evidence: Array<{ text: string; source: EvidenceSource }> = [
    { text: input.title ?? "", source: "Title" },
    { text: input.abstract ?? "", source: "Abstract" },
    ...(input.keywords ?? []).map((text) => ({
      text,
      source: "Keyword" as const,
    })),
    ...(input.repositoryMetadata ?? []).map((text) => ({
      text,
      source: "Repository metadata" as const,
    })),
  ];
  const found = new Map<string, StudyLocation>();
  for (const item of evidence) {
    for (const clause of clauses(item.text)) {
      const accepted: StudyLocation[] = [];
      for (const { place, index, length } of matchedPlaces(clause)) {
        // A country embedded in a cohort/project's proper name is not its site.
        if (
          /^\s+(?:[A-Z][a-z]+\s+){0,4}(?:Cohort|Study|Project|Consortium)\b/.test(
            clause.slice(index + length),
          )
        )
          continue;
        // "Study location: Cyprus" is valid explicit repository/keyword evidence.
        const labeled =
          (item.source === "Keyword" ||
            item.source === "Repository metadata") &&
          /^(?:study|sampling) (?:site|area|location)\s*:\s*/i.test(clause) &&
          !affiliation.test(clause) &&
          !background.test(clause) &&
          !hypothetical.test(clause) &&
          !negated.test(clause);
        if (!labeled && !isStudyEvidence(clause, index, item.source)) continue;
        accepted.push(
          geocodeLocation({
            name: place.name,
            country: place.country,
            city: place.city,
            confidence: item.source === "Title" ? "medium" : "high",
            evidence: `${item.source}: “${clause.slice(0, 700)}”`,
          }),
        );
      }
      accepted.push(...explicitUnlistedPlaces(clause, item.source));
      // A city and its parent country in one clause are one study location, not
      // two samples. Distinct cities and different countries are preserved.
      for (const location of accepted) {
        if (
          !location.city &&
          accepted.some(
            (other) => other.city && other.country === location.country,
          )
        )
          continue;
        const key = `${location.name.toLocaleLowerCase("en")}|${location.country ?? ""}`;
        const previous = found.get(key);
        if (
          !previous ||
          (previous.confidence !== "high" && location.confidence === "high")
        )
          found.set(key, location);
      }
    }
  }
  const locations = [...found.values()];
  return locations.filter(
    (location) =>
      location.city ||
      !locations.some(
        (other) => other.city && other.country === location.country,
      ),
  );
}

function normalizedDoi(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLocaleLowerCase("en");
}

/** DOI override wins over ID override; an intentional empty array also wins. */
export function findLocationOverride(
  publication: Pick<Publication, "id" | "doi">,
  entries: Record<string, LocationOverride> = overrides,
): LocationOverride | undefined {
  if (publication.doi) {
    const doi = normalizedDoi(publication.doi);
    const key = Object.keys(entries).find(
      (candidate) => normalizedDoi(candidate) === doi,
    );
    if (key !== undefined) return entries[key];
  }
  return entries[publication.id];
}

function explicitNonGeographic(input: LocationInput): boolean {
  // Missing geography, reviews, models and laboratory experiments are NOT
  // inherently global. Only an explicit absence of study geography qualifies.
  const explicitGlobalTitle =
    /^\s*(?:the\s+)?global\b.{0,250}\b(?:analysis|study|burden|incidence|prevalence|assessment|trends?|patterns?|mortality)\b/i.test(
      input.title,
    );
  return (
    explicitGlobalTitle ||
    [input.title, input.abstract ?? "", ...(input.keywords ?? [])].some(
      (text) =>
        /\b(?:non-geographic(?:al)? (?:research|study)|no (?:specific )?geographic(?:al)? (?:study )?(?:scope|location)|not (?:tied|specific) to (?:any |a )?(?:geographic(?:al)? )?(?:location|region))\b/i.test(
          text,
        ),
    )
  );
}

export function enrichPublication(
  publication: Publication,
  entries: Record<string, LocationOverride> = overrides,
): Publication {
  const override = findLocationOverride(publication, entries);
  const topics = deriveTopics(publication);
  if (override !== undefined) {
    const studyLocations = (
      Array.isArray(override.locations) ? override.locations : []
    ).map((location) =>
      geocodeLocation({
        ...location,
        confidence: location.confidence ?? "high",
        manuallyVerified: true,
        evidence:
          location.evidence ??
          override.note ??
          "Manually reviewed study location.",
      }),
    );
    return {
      ...publication,
      topics,
      studyLocations,
      geographyStatus: studyLocations.length
        ? "located"
        : override.geographyStatus === "non-geographic"
          ? "non-geographic"
          : "unknown",
    };
  }
  const studyLocations = extractStudyLocations(publication);
  return {
    ...publication,
    topics,
    studyLocations,
    geographyStatus: studyLocations.length
      ? "located"
      : explicitNonGeographic(publication)
        ? "non-geographic"
        : "unknown",
  };
}
