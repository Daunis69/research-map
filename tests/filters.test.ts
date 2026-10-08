import test from "node:test";
import assert from "node:assert/strict";
import {
  filterPublications,
  type ExplorerFilters,
} from "@/components/explorer-utils";
import type { Publication } from "@/types/publication";

const filters: ExplorerFilters = {
  q: "",
  year: "",
  from: "",
  to: "",
  country: "",
  city: "",
  place: "",
  topic: "",
  geography: "",
  sort: "newest",
};
const base: Publication = {
  id: "a",
  title: "Water fixture",
  year: 2020,
  authors: ["Fixture Author"],
  journal: "Fixture Journal",
  keywords: ["cohort"],
  topics: ["Water"],
  studyLocations: [],
  geographyStatus: "unknown",
  source: {},
  discoveredAt: "",
  updatedAt: "",
};
const located: Publication = {
  ...base,
  id: "b",
  title: "Another fixture",
  year: 2024,
  geographyStatus: "located",
  studyLocations: [
    { name: "Nicosia", country: "Cyprus", city: "Nicosia", confidence: "high" },
  ],
};
const unknownYear: Publication = { ...base, id: "c", year: null };

test("all views retain unknown geography and unknown years by default", () => {
  assert.deepEqual(
    filterPublications([base, unknownYear, located], filters).map((p) => p.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    filterPublications([base, unknownYear, located], {
      ...filters,
      sort: "oldest",
    }).map((p) => p.id),
    ["a", "b", "c"],
  );
});
test("shared filters combine geography, years and metadata keywords", () => {
  assert.deepEqual(
    filterPublications([base, located], {
      ...filters,
      country: "Cyprus",
      city: "Nicosia",
      from: "2022",
      q: "cohort",
      topic: "Water",
    }).map((p) => p.id),
    ["b"],
  );
  assert.equal(
    filterPublications([base, located], { ...filters, year: "1999" }).length,
    0,
  );
});
test("unknown-location filter is explicit and does not hide missing metadata", () => {
  assert.equal(
    filterPublications([base, located], { ...filters, geography: "unknown" })[0]
      .id,
    "a",
  );
  assert.equal(
    filterPublications([base], { ...filters, q: "fixture author" }).length,
    1,
  );
  assert.equal(
    filterPublications([base], { ...filters, q: "fixture journal" }).length,
    1,
  );
});
