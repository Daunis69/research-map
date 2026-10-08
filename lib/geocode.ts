import type { StudyLocation } from "../types/publication";

export interface KnownPlace {
  name: string;
  aliases: readonly string[];
  country: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  /** Ambiguous city names require this country in the same evidence clause. */
  requiresCountry?: boolean;
}

/**
 * Representative country label points, not participant/sample locations.
 * Public-domain Natural Earth (LABEL_Y, LABEL_X), retrieved 2026-10-07:
 * https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson
 * https://www.naturalearthdata.com/about/terms-of-use/
 */
const COUNTRY_POINTS: Readonly<Record<string, readonly [number, number]>> = {
  Canada: [60.324287, -101.9107],
  Argentina: [-33.501159, -64.173331],
  Chile: [-38.151771, -72.318871],
  Kenya: [0.549043, 37.907632],
  Norway: [61.357092, 9.679975],
  "South Africa": [-29.708776, 23.665734],
  Mexico: [23.919988, -102.289448],
  Brazil: [-12.098687, -49.55945],
  France: [46.696113, 2.552275],
  Nigeria: [9.439799, 7.50322],
  Ghana: [7.717639, -1.036941],
  Israel: [30.911148, 34.847915],
  Lebanon: [34.133368, 35.992892],
  Jordan: [30.805025, 36.375991],
  "United Arab Emirates": [23.466285, 54.547256],
  Kuwait: [29.413628, 47.313999],
  Iraq: [33.09403, 43.26181],
  Thailand: [15.45974, 101.073198],
  Vietnam: [21.715416, 105.387292],
  "South Korea": [36.384924, 128.129504],
  India: [22.686852, 79.358105],
  Bangladesh: [24.214956, 89.684963],
  Pakistan: [29.328389, 68.545632],
  Iran: [32.166225, 54.931495],
  Sweden: [65.85918, 19.01705],
  Poland: [51.990316, 19.490468],
  Austria: [47.518859, 14.130515],
  Romania: [45.733237, 24.972624],
  Germany: [50.961733, 9.678348],
  Bulgaria: [42.508785, 25.15709],
  Turkey: [39.345388, 34.508268],
  Switzerland: [46.719114, 7.463965],
  Belgium: [50.785392, 4.800448],
  Netherlands: [52.422211, 5.61144],
  Portugal: [39.606675, -8.271754],
  Spain: [40.090953, -3.464718],
  Ireland: [53.078726, -7.798588],
  "New Zealand": [-39.759, 172.787],
  Australia: [-24.129522, 134.04972],
  China: [32.498178, 106.337289],
  Taiwan: [23.652408, 120.868204],
  Italy: [44.732482, 11.076907],
  Denmark: [55.966965, 9.018163],
  "United Kingdom": [54.402739, -2.116346],
  Finland: [63.252361, 27.276449],
  Japan: [36.142538, 138.44217],
  "Saudi Arabia": [23.806908, 44.6996],
  Egypt: [26.186173, 29.445837],
};

function countryPoint(
  name: string,
): Pick<KnownPlace, "latitude" | "longitude"> {
  const point = COUNTRY_POINTS[name];
  return point ? { latitude: point[0], longitude: point[1] } : {};
}

/**
 * A checked-in geocoding cache: no requests are made for visitors or during sync.
 * Coordinates are representative gazetteer points, never sampling coordinates.
 * Sources: GeoNames 146669 (Cyprus), 146268 (Nicosia), 390903 (Greece),
 * 6252001 (US), 264371 (Athens); Limassol: https://apsida.cut.ac.cy/items/show/48487.
 * Names without a reviewed coordinate remain searchable but are not mapped.
 */
export const KNOWN_PLACES: readonly KnownPlace[] = [
  {
    name: "Cyprus",
    aliases: ["Cyprus", "Republic of Cyprus"],
    country: "Cyprus",
    latitude: 35,
    longitude: 33,
  },
  {
    name: "Limassol",
    aliases: ["Limassol", "Lemesos"],
    country: "Cyprus",
    city: "Limassol",
    latitude: 34.68406,
    longitude: 33.03794,
  },
  {
    name: "Nicosia",
    aliases: ["Nicosia", "Lefkosia"],
    country: "Cyprus",
    city: "Nicosia",
    latitude: 35.17284,
    longitude: 33.35397,
  },
  {
    name: "Vasilikos",
    aliases: ["Vasilikos"],
    country: "Cyprus",
    city: "Vasilikos",
    requiresCountry: true,
  },
  // Centroid of Cyprus Department of Lands and Surveys' VASILIKOS polygon,
  // retrieved 2026-10-07; an area reference point, not an individual sample site.
  // https://eservices.dls.moi.gov.cy/arcgis/rest/services/National/Hydrography_Data_GR/MapServer/7/query?where=OBJECTID%3D1&outFields=NAME&outSR=4326&f=pjson
  {
    name: "Vasilikos Energy Center",
    aliases: ["Vasilikos Energy Center", "Vasilikos Energy Centre"],
    country: "Cyprus",
    city: "Vasilikos Energy Center",
    latitude: 34.730906,
    longitude: 33.306158,
    requiresCountry: true,
  },
  {
    name: "Larnaca",
    aliases: ["Larnaca", "Larnaka"],
    country: "Cyprus",
    city: "Larnaca",
  },
  {
    name: "Paphos",
    aliases: ["Paphos", "Pafos"],
    country: "Cyprus",
    city: "Paphos",
  },
  {
    name: "Greece",
    aliases: ["Greece", "Hellenic Republic"],
    country: "Greece",
    latitude: 39,
    longitude: 22,
  },
  {
    name: "Athens",
    aliases: ["Athens"],
    country: "Greece",
    city: "Athens",
    latitude: 37.98376,
    longitude: 23.72784,
    requiresCountry: true,
  },
  {
    name: "Thessaloniki",
    aliases: ["Thessaloniki"],
    country: "Greece",
    city: "Thessaloniki",
  },
  {
    name: "United States",
    aliases: [
      "United States of America",
      "United States",
      "USA",
      "U.S.A.",
      "U.S.",
    ],
    country: "United States",
    latitude: 39.76,
    longitude: -98.5,
  },
  ...[
    "United Kingdom",
    "Canada",
    "Australia",
    "Germany",
    "France",
    "Spain",
    "Italy",
    "Portugal",
    "Netherlands",
    "Belgium",
    "Denmark",
    "Sweden",
    "Norway",
    "Finland",
    "Switzerland",
    "Austria",
    "Poland",
    "Romania",
    "Bulgaria",
    "Ireland",
    "Malta",
    "Israel",
    "Lebanon",
    "Jordan",
    "Saudi Arabia",
    "United Arab Emirates",
    "Kuwait",
    "Egypt",
    "Iran",
    "Iraq",
    "India",
    "Pakistan",
    "Bangladesh",
    "China",
    "Japan",
    "South Korea",
    "Taiwan",
    "Thailand",
    "Vietnam",
    "Singapore",
    "Brazil",
    "Mexico",
    "Argentina",
    "Chile",
    "South Africa",
    "Kenya",
    "Ghana",
    "Nigeria",
    "New Zealand",
  ].map(
    (name): KnownPlace => ({
      name,
      aliases: [name],
      country: name,
      ...countryPoint(name),
    }),
  ),
  {
    name: "Turkey",
    aliases: ["Turkey", "Türkiye", "Turkiye"],
    country: "Turkey",
    ...countryPoint("Turkey"),
  },
];

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/\.$/, "");
}

const placesByName = new Map(
  KNOWN_PLACES.flatMap((place) =>
    place.aliases.map((alias) => [normalize(alias), place] as const),
  ),
);

export function findKnownPlace(name: string): KnownPlace | undefined {
  return placesByName.get(normalize(name));
}

/** Only enrich already identified places. Never guess a missing place from affiliation. */
export function geocodeLocation(location: StudyLocation): StudyLocation {
  if (validCoordinates(location)) return { ...location };
  // A partially entered or out-of-range coordinate must never reach Leaflet.
  const sanitized = { ...location };
  delete sanitized.latitude;
  delete sanitized.longitude;
  const place = findKnownPlace(location.city ?? location.name);
  if (!place || (place.requiresCountry && location.country !== place.country))
    return sanitized;
  if (location.country && location.country !== place.country) return sanitized;
  return {
    ...sanitized,
    country: location.country ?? place.country,
    city: location.city ?? place.city,
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

export function validCoordinates(
  location: Pick<StudyLocation, "latitude" | "longitude">,
): boolean {
  return (
    typeof location.latitude === "number" &&
    Number.isFinite(location.latitude) &&
    Math.abs(location.latitude) <= 90 &&
    typeof location.longitude === "number" &&
    Number.isFinite(location.longitude) &&
    Math.abs(location.longitude) <= 180
  );
}

export type GeocodingProvider = (
  place: Readonly<StudyLocation>,
) => Promise<Pick<StudyLocation, "latitude" | "longitude"> | null>;

/**
 * Optional ingestion/admin adapter for a geocoder chosen by the maintainer.
 * Providers must disambiguate country/city and return null for ambiguous results.
 * Results (including misses) are cached and requests serialized/rate limited.
 * This process cache is not durable on Vercel: reviewed results belong in the
 * checked-in lookup/overrides before enabling across multiple server instances.
 */
export function createCachedGeocoder(
  provider: GeocodingProvider,
  minimumIntervalMs = 1100,
) {
  const cache = new Map<string, StudyLocation>();
  const pending = new Map<string, Promise<StudyLocation>>();
  let queue: Promise<unknown> = Promise.resolve();
  let lastRequest = 0;
  return (location: StudyLocation): Promise<StudyLocation> => {
    location = geocodeLocation(location);
    if (validCoordinates(location)) return Promise.resolve(location);
    const key = `${normalize(location.name)}|${normalize(location.country ?? "")}`;
    const hit = cache.get(key);
    if (hit)
      return Promise.resolve({
        ...location,
        latitude: hit.latitude,
        longitude: hit.longitude,
      });
    const active = pending.get(key);
    if (active)
      return active.then((result) => ({
        ...location,
        latitude: result.latitude,
        longitude: result.longitude,
      }));
    const task = queue
      .then(async () => {
        const wait = Math.max(0, lastRequest + minimumIntervalMs - Date.now());
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        lastRequest = Date.now();
        try {
          const result = await provider(Object.freeze({ ...location }));
          const valid =
            result &&
            typeof result.latitude === "number" &&
            typeof result.longitude === "number" &&
            Number.isFinite(result.latitude) &&
            Math.abs(result.latitude) <= 90 &&
            Number.isFinite(result.longitude) &&
            Math.abs(result.longitude) <= 180;
          const resolved = valid ? { ...location, ...result } : { ...location };
          if (cache.size >= 2000)
            cache.delete(cache.keys().next().value as string);
          cache.set(key, resolved);
          return resolved;
        } catch {
          // A geocoder outage must not remove an otherwise valid publication.
          return { ...location };
        }
      })
      .finally(() => pending.delete(key));
    pending.set(key, task);
    queue = task;
    return task;
  };
}
