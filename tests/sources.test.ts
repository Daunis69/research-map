import test from "node:test";
import assert from "node:assert/strict";
import {
  AllSourcesFailedError,
  fetchAllPublications,
} from "../lib/publications/fetchAll";
import {
  fetchOpenAlexPublications,
  normalizeOpenAlexWork,
  reconstructAbstract,
} from "../lib/publications/openalex";
import {
  fetchKtisisPublications,
  normalizeKtisisItem,
} from "../lib/publications/ktisis";
import {
  fetchOrcidPublications,
  normalizeOrcidWork,
} from "../lib/publications/orcid";
import {
  enrichWithCrossref,
  normalizeCrossrefWork,
} from "../lib/publications/crossref";
import { makePublication } from "../lib/publications/normalize";
import type { Publication } from "../types/publication";
import { hasCorroboratedOpenAlexAuthorship } from "../lib/publications/eligibility";

const paper = (title: string) =>
  makePublication({ title, year: 2020, authors: [], topics: [], source: {} });
const fail = async (): Promise<Publication[]> => {
  throw new Error("Temporary API failure");
};
const noEnrichment = async () => ({
  publications: [],
  status: { source: "Crossref", status: "skipped" as const, count: 0 },
});
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
const orcid = "https://orcid.org/0000-0001-5251-8619";
const institution = { id: "https://openalex.org/I163151358" };

test("one unavailable API preserves previous records and successful source metadata", async () => {
  const data = await fetchAllPublications([paper("Previously imported")], {
    openAlex: async () => [paper("New publication")],
    orcid: fail,
    ktisis: async () => [],
    crossref: noEnrichment,
  });
  assert.equal(data.publications.length, 2);
  assert.equal(
    data.sources.find((source) => source.source === "ORCID")?.status,
    "error",
  );
});

test("complete API failure throws instead of claiming a successful sync", async () => {
  await assert.rejects(
    fetchAllPublications([paper("Prior record")], {
      openAlex: fail,
      orcid: fail,
      ktisis: fail,
      crossref: noEnrichment,
    }),
    AllSourcesFailedError,
  );
});

test("Crossref failure never discards successful discovery results", async () => {
  const data = await fetchAllPublications([], {
    openAlex: async () => [paper("New publication")],
    orcid: async () => [],
    ktisis: async () => [],
    crossref: async () => {
      throw new Error("Unavailable");
    },
  });
  assert.equal(data.publications.length, 1);
  assert.equal(data.sources.at(-1)?.status, "error");
});

test("OpenAlex walks every cursor and scopes the query to ORCID plus institution", async () => {
  const requested: URL[] = [];
  const mock: typeof fetch = async (input) => {
    const url = new URL(String(input));
    requested.push(url);
    if (url.pathname === "/authors")
      return json({
        results: [
          {
            id: "https://openalex.org/A1",
            orcid,
            last_known_institutions: [institution],
          },
          {
            id: "https://openalex.org/A2",
            orcid,
            affiliations: [{ institution }],
          },
          {
            id: "https://openalex.org/Awrong",
            orcid: "https://orcid.org/0000-0002-0626-0589",
            last_known_institutions: [institution],
          },
        ],
      });
    assert.equal(url.searchParams.get("filter"), "authorships.author.id:A1|A2");
    const first = url.searchParams.get("cursor") === "*";
    return json({
      meta: { next_cursor: first ? "second-page" : null },
      results: [
        {
          id: first ? "https://openalex.org/W1" : "https://openalex.org/W2",
          title: first ? "First page" : "Second page",
        },
      ],
    });
  };
  const data = await fetchOpenAlexPublications({ fetchImpl: mock });
  assert.equal(data.length, 2);
  assert.equal(requested.length, 3);
  assert.equal(requested[2].searchParams.get("cursor"), "second-page");
});

test("OpenAlex rejects a same-name person without verified identity", async () => {
  const mock: typeof fetch = async () =>
    json({
      results: [
        {
          id: "https://openalex.org/Awrong",
          orcid: "https://orcid.org/0000-0002-0626-0589",
          last_known_institutions: [institution],
        },
      ],
    });
  await assert.rejects(
    fetchOpenAlexPublications({ fetchImpl: mock }),
    /identity verification/,
  );
});

test("OpenAlex reconstructs abstracts without treating affiliation as study geography", () => {
  assert.equal(reconstructAbstract({ water: [1], Clean: [0] }), "Clean water");
  const work = normalizeOpenAlexWork({
    title: "Laboratory experiment",
    publication_year: "unexpected",
    authorships: [
      {
        author: { display_name: "A Researcher" },
        institutions: [{ country_code: "CY" }],
      },
    ],
  });
  assert.ok(work);
  assert.equal(work.year, null);
  assert.equal(work.abstract, undefined);
  assert.deepEqual(work.studyLocations, []);
});

const repositoryItem = {
  uuid: "example",
  entityType: "Publication",
  metadata: {
    "dc.title": [{ value: "Repository paper" }],
    "dc.contributor.author": [
      {
        value: "Makris, Konstantinos C.",
        authority: "d526a7a1-3a1b-4b46-aed8-d3276a929152",
      },
    ],
  },
};

test("Ktisis includes only publications with the exact author authority", () => {
  assert.ok(normalizeKtisisItem(repositoryItem));
  assert.equal(
    normalizeKtisisItem({ ...repositoryItem, entityType: "Speaker" }),
    null,
  );
  assert.equal(
    normalizeKtisisItem({
      ...repositoryItem,
      metadata: {
        ...repositoryItem.metadata,
        "dc.contributor.author": [
          { value: "Makris, Konstantinos C.", authority: "another-person" },
        ],
      },
    }),
    null,
  );
});

test("Ktisis retrieves all numbered pages", async () => {
  const pages: string[] = [];
  const mock: typeof fetch = async (input) => {
    const url = new URL(String(input));
    pages.push(url.searchParams.get("page")!);
    assert.equal(
      url.searchParams.get("f.author"),
      "d526a7a1-3a1b-4b46-aed8-d3276a929152,authority",
    );
    return json({
      _embedded: {
        searchResult: {
          page: { totalPages: 2 },
          _embedded: {
            objects: [{ _embedded: { indexableObject: repositoryItem } }],
          },
        },
      },
    });
  };
  assert.equal((await fetchKtisisPublications({ fetchImpl: mock })).length, 2);
  assert.deepEqual(pages, ["0", "1"]);
});

test("ORCID complete grouped list and bulk detail are merged without credentials", async () => {
  const summary = {
    "put-code": 1,
    title: { title: { value: "A public work" } },
  };
  const mock: typeof fetch = async (input) =>
    String(input).endsWith("/works")
      ? json({ group: [{ "work-summary": [summary] }] })
      : json({
          bulk: [
            { work: { ...summary, "short-description": "A useful abstract." } },
          ],
        });
  const publications = await fetchOrcidPublications({ fetchImpl: mock });
  assert.equal(publications.length, 2);
  assert.equal(publications[1].abstract, "A useful abstract.");
  assert.equal(normalizeOrcidWork(summary)?.doi, undefined);
});

test("Crossref only enriches a previously known DOI and rejects a mismatched response", async () => {
  const known = { ...paper("Known record"), doi: "10.1234/known" };
  const mock: typeof fetch = async (input) => {
    assert.ok(String(input).includes("10.1234%2Fknown"));
    return json({
      message: { DOI: "10.1234/wrong", title: ["Unrelated record"] },
    });
  };
  const result = await enrichWithCrossref([known, paper("No DOI")], {
    fetchImpl: mock,
    retries: 0,
  });
  assert.equal(result.publications.length, 0);
  assert.equal(result.status.status, "error");
  assert.equal(normalizeCrossrefWork({ title: ["Missing date"] })?.year, null);
});

test("split author profile inherited ORCID alone cannot admit the physicist's work", () => {
  const work = {
    title: "Deep learning in PT-symmetric multimode waveguide sensors",
    authorships: [
      {
        author: {
          id: "https://openalex.org/A5129952756",
          orcid,
          display_name: "Konstantinos C. Makris",
        },
        raw_author_name: "Makris, Konstantinos",
        institutions: [],
      },
      { author: { display_name: "Kyriakos Skarsoulis" } },
      { author: { display_name: "Demetri Psaltis" } },
    ],
  };
  assert.equal(hasCorroboratedOpenAlexAuthorship(work), false);
  assert.equal(
    hasCorroboratedOpenAlexAuthorship({
      ...work,
      authorships: [{ ...work.authorships[0], institutions: [institution] }],
    }),
    true,
  );
});

test("supplementary files are excluded even when OpenAlex labels them articles", () => {
  assert.equal(
    normalizeOpenAlexWork({
      title: "Additional file 1 of Plastic signatures in childhood",
      type: "article",
    }),
    null,
  );
  assert.equal(
    normalizeOpenAlexWork({
      title: "Dataset accompanying the article",
      type: "dataset",
    }),
    null,
  );
  assert.equal(
    normalizeOrcidWork({ title: { title: { value: "Supplementary" } } }),
    null,
  );
});

test("explicit misattribution exclusions also remove records from an older cache", async () => {
  const old = {
    ...paper("Deep learning in PT-symmetric multimode waveguide sensors"),
    doi: "10.60893/figshare.app.c.8310463",
  };
  const data = await fetchAllPublications([old], {
    openAlex: async () => [paper("Verified health paper")],
    orcid: async () => [],
    ktisis: async () => [],
    crossref: noEnrichment,
  });
  assert.equal(data.publications.length, 1);
  assert.equal(data.publications[0].title, "Verified health paper");
});
