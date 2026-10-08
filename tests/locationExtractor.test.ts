import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichPublication,
  extractStudyLocations,
  findLocationOverride,
} from "../lib/locationExtractor";
import {
  createCachedGeocoder,
  geocodeLocation,
  KNOWN_PLACES,
  validCoordinates,
} from "../lib/geocode";
import { deriveTopics } from "../lib/topics";
import type {
  LocationOverride,
  Publication,
  StudyLocation,
} from "../types/publication";

// These are synthetic method sentences for unit tests, not publication records.
function publication(fields: Partial<Publication> = {}): Publication {
  return {
    id: "fixture-without-doi",
    title: "An analytical method",
    year: null,
    authors: [],
    topics: [],
    studyLocations: [],
    source: {},
    discoveredAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...fields,
  };
}

test("missing DOI and abstract remain unknown, without invented coordinates", () => {
  const result = enrichPublication(publication());
  assert.deepEqual(result.studyLocations, []);
  assert.equal(result.geographyStatus, "unknown");
});

test("explicit participant residence establishes a study country", () => {
  const locations = extractStudyLocations({
    title: "An exposure study",
    abstract: "The study consisted of 150 children living in Cyprus.",
  });
  assert.equal(locations.length, 1);
  assert.equal(locations[0].name, "Cyprus");
  assert.equal(locations[0].confidence, "high");
  assert.match(locations[0].evidence ?? "", /150 children living in Cyprus/);
  assert.equal(locations[0].latitude, 35);
});

test("affiliations, publisher locations and coauthor origins cannot establish geography", () => {
  for (const abstract of [
    "The authors are affiliated with Cyprus University of Technology in Limassol, Cyprus.",
    "We recruited study staff from the University of Cyprus.",
    "The corresponding author lives in Nicosia, Cyprus.",
    "Published by a publisher in Greece.",
  ])
    assert.deepEqual(
      extractStudyLocations({ title: "An analytical method", abstract }),
      [],
    );
});

test("background comparisons cannot become study geography", () => {
  const locations = extractStudyLocations({
    title: "An exposure study",
    abstract:
      "Previous studies recruited children in Greece. We recruited children in Cyprus and compared results with studies in Germany.",
  });
  assert.deepEqual(
    locations.map((location) => location.name),
    ["Cyprus"],
  );
});

test("supports multiple actual study countries", () => {
  const locations = extractStudyLocations({
    title: "An exposure study",
    abstract: "We recruited participants in Cyprus and Greece.",
  });
  assert.deepEqual(
    locations.map((location) => location.name),
    ["Cyprus", "Greece"],
  );
});

test("a city and parent country in the same clause do not duplicate the site", () => {
  const locations = extractStudyLocations({
    title: "An exposure study",
    abstract: "Water samples were collected in Limassol, Cyprus.",
  });
  assert.equal(locations.length, 1);
  assert.equal(locations[0].city, "Limassol");
  assert.equal(locations[0].country, "Cyprus");
});

test("preserves two cities within a country", () => {
  const locations = extractStudyLocations({
    title: "An exposure study",
    abstract: "We recruited children in Limassol and Nicosia, Cyprus.",
  });
  assert.deepEqual(
    locations.map((location) => location.name),
    ["Limassol", "Nicosia"],
  );
});

test("explicit study title can establish a location without an abstract", () => {
  const locations = extractStudyLocations({
    title: "Pesticide exposure among children in Cyprus",
  });
  assert.equal(locations[0]?.name, "Cyprus");
  assert.equal(locations[0]?.confidence, "medium");
});

test("bare geographic keywords do not establish a study site", () => {
  assert.deepEqual(
    extractStudyLocations({
      title: "An analytical method",
      keywords: ["Cyprus", "Greece", "pesticides"],
    }),
    [],
  );
  assert.equal(
    extractStudyLocations({
      title: "An analytical method",
      keywords: ["Study location: Cyprus"],
    })[0]?.name,
    "Cyprus",
  );
});

test("repository study-area metadata is supported independently from affiliation", () => {
  const locations = extractStudyLocations({
    title: "An exposure study",
    repositoryMetadata: [
      "Study area: Limassol, Cyprus",
      "Cyprus University of Technology",
    ],
  });
  assert.deepEqual(
    locations.map((location) => location.name),
    ["Limassol"],
  );
});

test("unlisted named study sites retain evidence without fabricated coordinates", () => {
  const locations = extractStudyLocations({
    title: "An exposure study",
    abstract: "The study was conducted in Kalamata, Greece.",
  });
  assert.equal(locations.length, 1);
  assert.equal(locations[0].name, "Kalamata");
  assert.equal(locations[0].country, "Greece");
  assert.equal(locations[0].latitude, undefined);
});

test("months in method sentences are not mistaken for places", () => {
  assert.deepEqual(
    extractStudyLocations({
      title: "An exposure study",
      abstract: "A survey was conducted in March–May 2020.",
    }),
    [],
  );
  assert.deepEqual(
    extractStudyLocations({
      title: "An exposure study",
      abstract: "A survey was conducted in English.",
    }),
    [],
  );
});

test("study protocols do not imply completed study sites", () => {
  assert.deepEqual(
    extractStudyLocations({
      title:
        "A study protocol for an intervention study in Cyprus and Pakistan",
    }),
    [],
  );
});

test("a cohort name does not establish where its samples originated", () => {
  assert.deepEqual(
    extractStudyLocations({
      title: "An exposure study",
      abstract:
        "Hair samples from the Cyprus Metabolism Prospective Cohort Study were randomly selected.",
    }),
    [],
  );
});

test("instrument origin and research staff are not study areas", () => {
  const locations = extractStudyLocations({
    title: "An exposure study",
    abstract:
      "We recruited participants in Cyprus using a questionnaire developed in Greece.",
  });
  assert.deepEqual(
    locations.map((location) => location.name),
    ["Cyprus"],
  );
  assert.deepEqual(
    extractStudyLocations({
      title: "An exposure study",
      abstract: "Participants were recruited by researchers from Greece.",
    }),
    [],
  );
});

test("explicit cohort settings and passive case-control methods are supported", () => {
  assert.deepEqual(
    extractStudyLocations({
      title: "An exposure study",
      abstract: "A pilot case-control study was conducted in Nicosia, Cyprus.",
    }).map((location) => location.name),
    ["Nicosia"],
  );
  assert.deepEqual(
    extractStudyLocations({
      title: "An exposure study",
      abstract:
        "A case-control study nested within the HUNT cohort (Norway) and the Lifelines cohort (Netherlands) was set up.",
    }).map((location) => location.name),
    ["Norway", "Netherlands"],
  );
});

test("reviewed country and industrial-area reference points stay in bounds", () => {
  assert.ok(
    KNOWN_PLACES.filter((place) => place.latitude !== undefined).every(
      validCoordinates,
    ),
  );
  for (const name of ["France", "Netherlands", "Norway", "Pakistan", "Kuwait"])
    assert.ok(validCoordinates(geocodeLocation({ name, confidence: "high" })));
  const sites = extractStudyLocations({
    title:
      "Public health risks in and around the Vasilikos Energy Center, Cyprus",
  });
  assert.equal(sites[0]?.name, "Vasilikos Energy Center");
  assert.ok(validCoordinates(sites[0]));
});

test("invalid manual coordinates are sanitized before reaching a map", () => {
  const entries: Record<string, LocationOverride> = {
    "fixture-without-doi": {
      locations: [
        {
          name: "Unlisted test site",
          confidence: "high",
          latitude: 900,
          longitude: 20,
        },
      ],
    },
  };
  const result = enrichPublication(publication(), entries);
  assert.equal(result.studyLocations[0].latitude, undefined);
  assert.equal(result.studyLocations[0].longitude, undefined);
  assert.equal(result.studyLocations[0].name, "Unlisted test site");
  assert.equal(validCoordinates({ latitude: NaN, longitude: 20 }), false);
  assert.equal(validCoordinates({ latitude: 30, longitude: Infinity }), false);
});

test("ambiguous city names are not silently assigned a country", () => {
  const locations = extractStudyLocations({
    title: "An exposure study",
    abstract: "The study was conducted in Athens.",
  });
  assert.ok(locations.every((location) => location.latitude === undefined));
});

test("hypothetical and explicitly negated sites are rejected", () => {
  for (const abstract of [
    "The study will be conducted in Cyprus.",
    "The study was not conducted in Cyprus.",
    "No participants were recruited in Cyprus.",
  ])
    assert.deepEqual(
      extractStudyLocations({ title: "An exposure study", abstract }),
      [],
    );
});

test("DOI override always takes priority over extracted geography and ID override", () => {
  const entries: Record<string, LocationOverride> = {
    "10.1234/unit-test": {
      locations: [{ name: "Greece", country: "Greece", confidence: "high" }],
    },
    "fixture-without-doi": {
      locations: [{ name: "Cyprus", confidence: "high" }],
    },
  };
  const result = enrichPublication(
    publication({
      doi: "https://doi.org/10.1234/UNIT-TEST",
      title: "Children in Cyprus",
    }),
    entries,
  );
  assert.deepEqual(
    result.studyLocations.map((location) => location.name),
    ["Greece"],
  );
  assert.equal(result.studyLocations[0].manuallyVerified, true);
  assert.equal(result.geographyStatus, "located");
});

test("empty manual override suppresses automatically inferred geography", () => {
  const entries: Record<string, LocationOverride> = {
    "fixture-without-doi": { locations: [], geographyStatus: "unknown" },
  };
  const result = enrichPublication(
    publication({ title: "Children in Cyprus" }),
    entries,
  );
  assert.deepEqual(result.studyLocations, []);
  assert.equal(result.geographyStatus, "unknown");
  assert.equal(
    findLocationOverride(publication(), entries),
    entries["fixture-without-doi"],
  );
});

test("missing geography is distinct from explicitly non-geographic work", () => {
  assert.equal(
    enrichPublication(
      publication({ title: "A systematic review of pesticide exposure" }),
    ).geographyStatus,
    "unknown",
  );
  assert.equal(
    enrichPublication(
      publication({ abstract: "This is non-geographic research." }),
    ).geographyStatus,
    "non-geographic",
  );
  assert.equal(
    enrichPublication(
      publication({
        title:
          "Global incidence and prevalence of disease: a systematic analysis",
      }),
    ).geographyStatus,
    "non-geographic",
  );
  const entries: Record<string, LocationOverride> = {
    "fixture-without-doi": { locations: [], geographyStatus: "non-geographic" },
  };
  assert.equal(
    enrichPublication(publication(), entries).geographyStatus,
    "non-geographic",
  );
});

test("geocoder never substitutes a city in a contradictory country", () => {
  const location: StudyLocation = {
    name: "Athens",
    city: "Athens",
    country: "United States",
    confidence: "high",
  };
  assert.equal(geocodeLocation(location).latitude, undefined);
});

test("optional geocoder coalesces and caches requests", async () => {
  let requests = 0;
  const resolve = createCachedGeocoder(async () => {
    requests++;
    return { latitude: 37.04, longitude: 22.11 };
  }, 0);
  const location: StudyLocation = {
    name: "Kalamata",
    country: "Greece",
    confidence: "high",
  };
  const [first, second] = await Promise.all([
    resolve(location),
    resolve(location),
  ]);
  assert.equal(first.latitude, 37.04);
  assert.deepEqual(first, second);
  await resolve(location);
  assert.equal(requests, 1);
});

test("optional geocoder failure preserves the publication location", async () => {
  const resolve = createCachedGeocoder(async () => {
    throw new Error("service unavailable");
  }, 0);
  const location: StudyLocation = { name: "Kalamata", confidence: "medium" };
  assert.deepEqual(await resolve(location), location);
});

test("topics preserve source metadata and derive relevant readable aliases", () => {
  const topics = deriveTopics({
    title: "Glyphosate exposure in children",
    keywords: ["exposome", "biomarkers"],
    topics: ["Environmental chemistry", "Pesticides"],
  });
  assert.ok(topics.includes("Pesticides"));
  assert.ok(topics.includes("Exposomics"));
  assert.ok(topics.includes("Biomonitoring"));
  assert.ok(topics.includes("Children's Health"));
  assert.ok(topics.includes("Environmental chemistry"));
  assert.equal(topics.filter((topic) => topic === "Pesticides").length, 1);
});
