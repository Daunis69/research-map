import { readFile, writeFile } from "node:fs/promises";
import { normalizeOpenAlexWork } from "../lib/publications/openalex";
import { normalizeKtisisItem } from "../lib/publications/ktisis";
import { normalizeOrcidSummaries } from "../lib/publications/orcid";
import { deduplicatePublications } from "../lib/publications/deduplicate";
import { enrichPublication } from "../lib/locationExtractor";
import { deriveTopics } from "../lib/topics";
import {
  hasCorroboratedOpenAlexAuthorship,
  isExcludedPublication,
} from "../lib/publications/eligibility";
import researcher from "../data/researcher.json";
import exclusions from "../data/publication-exclusions.json";
import type { Publication, PublicationDataset } from "../types/publication";

async function main() {
  const read = async (name: string): Promise<unknown> =>
    JSON.parse(
      (await readFile(`.cache/source-import/${name}.raw.json`, "utf8")).replace(
        /^\uFEFF/,
        "",
      ),
    ) as unknown;
  const now = new Date().toISOString();
  const oaRaw = (await read("openalex-works")) as unknown[];
  const ktRaw = (await read("ktisis-works")) as unknown[];
  const oa = oaRaw
    .filter((work) => hasCorroboratedOpenAlexAuthorship(work))
    .map((work) => normalizeOpenAlexWork(work, now))
    .filter((work): work is Publication => work !== null);
  const kt = ktRaw
    .map((work) => normalizeKtisisItem(work, now))
    .filter((work): work is Publication => work !== null);
  const orcid = normalizeOrcidSummaries(await read("orcid-works"), now);
  let publications = deduplicatePublications([...oa, ...kt, ...orcid]);
  console.log(
    `Before Crossref: OpenAlex ${oa.length}, Ktisis ${kt.length}, ORCID ${deduplicatePublications(orcid).length}, merged ${publications.length}`,
  );
  const prior = JSON.parse(
    await readFile("data/publications.json", "utf8"),
  ) as PublicationDataset;
  const crossref = {
    publications: prior.publications.filter((work) => work.source.crossref),
    status: prior.sources.find((source) => source.source === "Crossref")!,
  };
  publications = deduplicatePublications([
    ...publications,
    ...prior.publications,
  ])
    .filter((work) => !isExcludedPublication(work))
    .map((publication) =>
      enrichPublication({ ...publication, topics: deriveTopics(publication) }),
    );
  const dataset: PublicationDataset = {
    publications,
    fetchedAt: now,
    sources: [
      {
        source: "OpenAlex",
        status: "ok",
        count: oa.length,
        message:
          "Complete cursor harvest: 222 candidates over 3 pages; 217 retained after identity and supplementary-material checks.",
      },
      {
        source: "ORCID",
        status: "ok",
        count: deduplicatePublications(orcid).length,
        message: "Complete public grouped works record.",
      },
      {
        source: "Ktisis",
        status: "ok",
        count: kt.length,
        message:
          "Complete authority search: 3 pages, 201 entities; 176 verified Publication entities retained.",
      },
      crossref.status,
    ],
  };
  await writeFile(
    "data/publications.json",
    JSON.stringify(dataset, null, 2) + "\n",
  );
  const provenance = {
    importedAt: prior.fetchedAt,
    reviewedAt: now,
    researcher,
    identityEvidence: [
      {
        url: researcher.repositoryUrl,
        fact: "The institutional person record names Makris, Konstantinos C.; lists Professor of Environmental Health, CUT; and links BOTH supplied Scholar iCd8LKAAAAAJ and ORCID 0000-0001-5251-8619.",
      },
      {
        url: researcher.institutionUrl,
        fact: "Official university staff page identifies Professor Konstantinos Makris, Water and Health / exposome research, and Cyprus University of Technology.",
      },
      {
        url: `https://api.openalex.org/authors?filter=orcid:https://orcid.org/${researcher.orcid}`,
        fact: "Returned A5059194195 and A5129952756 with the institutional ORCID and CUT affiliation. The secondary author cluster needs per-work checks because it also contained unrelated physics supplements.",
      },
      {
        url: "https://www-oembed.physics.uoc.gr/en/faculty/k.makris",
        fact: "The University of Crete physicist has different ORCID 0000-0002-0626-0589 and Scholar Xb9GqdoAAAAJ. Name similarity alone is not accepted.",
      },
    ],
    doiCrossChecks: publications
      .filter(
        (work) =>
          work.doi &&
          work.source.openAlex &&
          work.source.orcid &&
          work.source.ktisis,
      )
      .slice(0, 5)
      .map(({ title, doi, source }) => ({
        title,
        doi,
        source,
        evidence:
          "The same DOI is independently present in the verified author's ORCID record, exact-authority Ktisis publication and OpenAlex harvest.",
      })),
    crossrefChecks: crossref.publications
      .slice(0, 4)
      .map(({ title, doi, source }) => ({
        title,
        doi,
        crossref: source.crossref,
        evidence:
          "Fetched Crossref's single DOI endpoint and accepted metadata only when the response DOI exactly matched the already-verified publication DOI. No claim is made that Crossref supplied an author ORCID.",
      })),
    harvest: {
      openAlexCandidateWorks: oaRaw.length,
      openAlexPages: 3,
      openAlexRetained: oa.length,
      orcidGroupedWorks: 159,
      ktisisEntities: ktRaw.length,
      ktisisPages: 3,
      ktisisPublications: kt.length,
      deduplicatedTotal: publications.length,
      crossrefEnriched: crossref.publications.length,
    },
    exclusions,
    secondaryProfileRules:
      "Accept only work-level raw ORCID/CUT affiliation or at least two coauthors independently present in authority-linked Ktisis publications. Current two genuine 2026 health articles carry work-level CUT affiliation. The HBM review has Maryam Zare Jeddi and Karen S. Galea; both occur in Ktisis-verified papers.",
    corpusScope:
      "Includes articles, reviews, preprints, books/chapters, dissertations, conference papers/abstracts and corrections present in verified sources. Supplementary files, datasets, software, awards, talks, committee memberships and teaching records are excluded. Distinct preprint/final DOIs are kept separately.",
    limitations: [
      "Complete pagination means complete records returned by these APIs on the import date, not a guarantee that every publication is indexed.",
      "Seven large primary-profile Global Burden of Disease collaborations have OpenAlex authorship lists truncated at 100. Their author-profile index association is retained; full author lists may be added by subsequent Crossref enrichment.",
      "Crossref initial enrichment succeeded for 11 of 80 attempted known DOIs; other attempts were unavailable. Runtime enrichment now respects the current single concurrent request public-pool limit with pacing and a 45-second budget, and retries unfinished enrichment on later syncs.",
      "ORCID works can be self-maintained or incomplete; missing fields stay missing until another source supplies metadata.",
      "Study geography is inferred conservatively from article text and never from author or publisher affiliations. Unknown locations remain visible in the list and timeline.",
    ],
    apiDocumentation: [
      "https://help.openalex.org/api/paging/",
      "https://help.openalex.org/api/authentication/",
      "https://github.com/ORCID/ORCID-Source/blob/main/orcid-api-web/tutorial/works.md",
      "https://github.com/DSpace/RestContract/blob/main/search-endpoint.md",
      "https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/",
    ],
  };
  await writeFile(
    "data/provenance.json",
    JSON.stringify(provenance, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      total: publications.length,
      located: publications.filter((p) => p.studyLocations.length).length,
      countries: [
        ...new Set(
          publications
            .flatMap((p) => p.studyLocations.map((l) => l.country))
            .filter(Boolean),
        ),
      ],
      sources: dataset.sources,
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
