# Makris Scientific Research Map

A responsive publication atlas for **Professor Konstantinos C. Makris, Cyprus University of Technology**. Explore the same dataset through an interactive author-location map, a chronological timeline, and a searchable publication list. Filters are shareable in the URL.

Map points represent **the institutions of all available authors listed on each publication**. Institution coordinates are used when available; country-level markers are labelled as approximate. Papers without usable affiliations remain in the list and timeline as **Author locations unavailable**. Publication details show authors, institutions and incomplete affiliation coverage.

Search covers titles, authors, journals, topics, keywords and reported institutions. Filters cover publication years, author countries/cities, topics and affiliation availability. The publication list can be sorted by date, title or source citation count. Header statistics describe the whole collection; result counts reflect the active filters.

## Publication counts and duplicate versions

The bundled import was fetched on **7 October 2026**. With the current deduplication and author-location rules, checked on **26 October 2026**, it displays:

| Measure | Count |
| --- | --- |
| Unique publications | 231 |
| Publications with mapped author locations | 181 |
| Publications without mapped author locations | 50 |
| Countries in author locations | 69 |
| Publication years | 2003–2026 |

`data/publications.json` contains **249 imported records**, which the application combines into **231 unique publications** before displaying them. These are snapshot figures, not fixed targets; later imports, stored updates and reviewed corrections can change them. The collection includes publication records such as conference abstracts and preprints as well as journal articles.

Copies are matched by normalized DOI, exact work-specific source identity, or title/year/author identity when DOI metadata is missing. Versions with the same normalized title, corroborating authors and known publication years within three years can also be combined. Reviewed title changes and repository copies are linked in `data/publication-versions.json`. The final journal article is preferred when identified, and alternate identities are retained so later imports do not recreate duplicates. Affiliations from a separate preprint or abstract version are not added to the preferred article's locations.

The map, timeline, publication list and header totals use the same unique collection. A paper can appear at several author locations, so adding marker counts will double-count some papers. Source status counts overlap: OpenAlex, ORCID and Ktisis report their own retained records, while Crossref reports known DOIs enriched. Their counts are not the collection total. Google Scholar is linked for reference; it does not supply this application's dataset or counts.

## Quick start

Install Node.js 22 LTS or newer, open a terminal in this folder, and run:

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). A real, checked-in initial import makes the website usable immediately, without credentials or successful academic API calls. Do not delete `data/publications.json`.

For a production build and the data-logic checks, run these commands in order:

```sh
npm run lint
npm test
npm run build -- --webpack
npm run typecheck
npm start
```

`npm start` serves the production build. Stop the development server first if it already occupies port 3000. The lockfile fixes the versions used by this project.

The commands above use the Webpack build verified for this checkout. `npm run build` uses Next.js's default Turbopack bundler; `-- --webpack` is the supported alternative if a local worker cannot start. For a standalone type check on a fresh checkout, run `npx next typegen` before `npm run typecheck` to create Next.js's generated route types. Do not run type checking concurrently with a build that regenerates those files. Restart a running `npm start` server after rebuilding, then reload existing browser tabs to see code changes.

## Verified researcher identity

The supplied [Google Scholar profile](https://scholar.google.com/citations?user=iCd8LKAAAAAJ) is an external link, not a scraper target.

- ORCID: [0000-0001-5251-8619](https://orcid.org/0000-0001-5251-8619).
- Primary OpenAlex profile: [A5059194195](https://openalex.org/A5059194195).
- Additional verified OpenAlex profile: [A5129952756](https://openalex.org/A5129952756).
- [Ktisis institutional person record](https://ktisis.cut.ac.cy/entities/person/d526a7a1-3a1b-4b46-aed8-d3276a929152) links the same Scholar account and ORCID.

The two recorded OpenAlex identities have the same verified ORCID and Cyprus University of Technology affiliation. At sync time, the importer looks up author IDs by that ORCID, verifies the university affiliation and queries the returned verified IDs to recover split author records. The secondary profile also contained unrelated physics records, so works attributed only to a secondary identity must supply a matching raw ORCID, work-level Cyprus University of Technology affiliation, or at least two independently corroborated coauthors. `data/publication-exclusions.json` records known misattributions and supplementary files; exclusions also apply to older snapshots. See `data/researcher.json` for current profile settings and `data/provenance.json` for the original identity evidence and DOI cross-checks. Do not replace these identifiers with results of a name-only search: there are other researchers called Konstantinos Makris.

The importers request all available discovery pages from the verified source identities. A successful sync can still have individual source errors or incomplete affiliations; check the source status rather than treating the checked date as proof that every provider succeeded. Metadata providers have indexing delays, omissions, duplicates, and occasional misattributions. This project cannot promise that a provider already contains every paper a researcher has written.

## Researcher profile and footer

The footer's expandable **Affiliations and memberships** section shows:

- Cyprus University of Technology: Full Professor of Environmental Health; the CLOTHO Lab directorship, past Water and Health Lab directorship, Cyprus International Institute for Environmental and Public Health, and School of Health Sciences.
- Aristotle University of Thessaloniki: Visiting Full Professor, Department of Medicine, Faculty of Health Sciences, with the supplied campus address.
- European Exposome Alliance membership and website link.

Edit this text and its website links in `data/researcher.json`. The original import evidence in `data/provenance.json` is a historical record and may contain older profile wording. Each footer column has a supplied logo in `public/logos/`, rendered by `components/ResearcherAffiliations.tsx`; layout and responsive sizing are in `app/globals.css`.

These profile affiliations describe the researcher. Publication map locations are derived separately from each paper's author affiliations.

## How the application fits together

The application uses Next.js 16 App Router, strict TypeScript, React, Tailwind CSS, Leaflet/React Leaflet, Leaflet marker clustering, and OpenStreetMap tiles. Leaflet is imported dynamically in a client component with server rendering disabled. No map API key is needed. OpenStreetMap attribution remains visible; use an appropriate tile provider if traffic exceeds the public tile service's usage policy.

```text
OpenAlex + ORCID + author-linked Ktisis records
                  ↓
      normalize / combine duplicate versions
                  ↓
       Crossref enriches known DOIs
                  ↓
       topics + author institution locations
                  ↓
 private Blob JSON snapshot (local runs use .cache without Blob credentials)
                  ↓
      compressed Next.js Data Cache
                  ↓
        Map / Timeline / Publications
```

Important files:

| Area                           | Files                             |
| ------------------------------ | --------------------------------- |
| Shared data contract           | `types/publication.ts`            |
| Bundled starting collection    | `data/publications.json`          |
| Source requests and merging    | `lib/publications/`               |
| Reviewed versions and exclusions | `data/publication-versions.json`, `data/publication-exclusions.json` |
| Author location derivation     | `lib/authorLocations.ts`           |
| Institution coordinate cache  | `data/institutions.json`          |
| Reviewed place coordinates     | `lib/geocode.ts`                  |
| Topic grouping                 | `lib/topics.ts`                   |
| Human corrections              | `data/author-location-overrides.json` |
| Durable dataset storage        | `lib/storage.ts`                  |
| Sync and change counts         | `lib/sync.ts`, `lib/syncLogic.ts` |
| Cached reads and stale refresh | `lib/dataset.ts`                  |
| Protected sync endpoint        | `app/api/sync/route.ts`           |
| Interactive interface          | `components/`                     |
| Profile, footer and logos      | `data/researcher.json`, `components/ResearcherAffiliations.tsx`, `public/logos/` |

## Why one stored JSON snapshot?

Serverless function memory and local files do not persist reliably on Vercel. A cache also is not a permanent record of which papers were previously discovered. Without durable storage, a cold start followed by a partial API outage could lose papers added after the bundled import, and new/updated counts would be unreliable.

This application uses **one private Vercel Blob object**, not a database. It retains the merged publication history across deployments and outages. Next.js caches reads for five minutes using compressed JSON to stay within its per-item cache limit as affiliation metadata grows. Blob writes use conditional ETags to reject conflicting concurrent writes. Source failures retain known papers; reviewed exclusions still remove known incorrect records. An all-source failure keeps the previous publications and records the failed attempt. Outside Vercel, both development and local production runs use ignored `.cache/publications.json` unless Blob credentials are configured. On reads, stored records are combined with the bundled import, deduplicated, checked against exclusions and given the current author-location overrides.

## Deploy to Vercel

1. Push this folder to a GitHub repository. Include `package-lock.json`, `data/publications.json`, and the other source files. Never commit `.env.local` or credentials.
2. In Vercel, select **Add New → Project**, import the repository, and accept the Next.js preset. Use Node.js 22 or newer. To use the verified Webpack build, set the build command to `npm run build -- --webpack`.
3. In the project's **Storage** area, create a **private Blob store** and connect it to the Production environment. Use a separate store for Preview if needed. Connecting a store supplies the SDK's managed credentials (`BLOB_STORE_ID` and OIDC), or the supported `BLOB_READ_WRITE_TOKEN` fallback. Do not manually copy the short-lived OIDC token.
4. Add `CRON_SECRET` to the Production environment. Generate a long random value with a password manager, or run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Store that value securely.
5. Add an activated `OPENALEX_API_KEY` for full OpenAlex synchronization. [OpenAlex requires a key for cursor paging beyond the first page](https://help.openalex.org/api/authentication/); bundled browsing still works without one. `OPENALEX_EMAIL` is optional contact information and does not replace the key. No ORCID client secret is used by the public works adapter.
6. Deploy. If you add environment variables after a deployment, redeploy once so that deployment receives them.
7. Open the site and inspect source status. Call the sync endpoint once using the instructions below, then verify **Settings → Cron Jobs** and the function logs.

No redeployment is needed for normal new publications after this setup. Changing application code or checked-in location overrides does require deploying those changes.

### Environment variables

Copy `.env.example` to `.env.local` for local settings. Local browsing needs none of these.

| Variable                | When needed                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `CRON_SECRET`           | Required for daily cron and manual sync requests. Requests fail closed if unset.                      |
| Blob project connection | Required for durable updates on Vercel. SDK uses the connected store's managed credentials.           |
| `BLOB_READ_WRITE_TOKEN` | Alternative Blob authentication, especially outside Vercel. Leave all Blob credentials unset to use the local cache file. |
| `OPENALEX_API_KEY`      | Needed for a full OpenAlex harvest using cursor pagination; not needed to browse the saved collection. |
| `OPENALEX_EMAIL`        | Optional contact email for polite academic API access.                                                |

All credentials are server-only. None should use a `NEXT_PUBLIC_` prefix. A Vercel deployment without Blob can display the bundled import, but **cannot persist automatic updates** and shows a configuration warning.

## Daily updates and recovery

`vercel.json` requests a daily GET to `/api/sync` at **04:00 UTC**. Vercel sends `Authorization: Bearer <CRON_SECRET>`; the route verifies it using a constant-time hash comparison. On Hobby, execution can occur anywhere within the scheduled hour. Cron runs on Production, not a local development server.

A run reads the previous snapshot, attempts to harvest all discovery pages, deduplicates, enriches bounded batches of known DOIs, derives topics and locations, and stores the result before invalidating the Next.js cache. It returns `total`, `newPublications`, `updatedPublications`, `timestamp`, and per-source outcomes. Timestamp-only differences do not count as publication updates.

The server checks the dataset age when a page is requested. At 24 hours old, a stale visit schedules a background refresh using Next.js `after()`, so the visitor receives existing data promptly while an update runs. On Vercel this requires Blob storage; local runs can use the cache file. Failed attempts back off for 15 minutes. This provides another refresh attempt after a missed cron when the site next receives a visitor. An already-open tab does not poll for updates; reload it to fetch the latest collection.

Sources are requested independently with `Promise.allSettled`, timeouts and limited retries. An unavailable provider does not prevent successful sources from updating the collection. Crossref enriches up to 40 eligible known DOIs per run, within a 45-second budget; remaining records are queued for later runs. Provider errors are logged server-side; visitors receive readable source status. The checked date records the latest successful collection sync, which can include partial source failures.

### Manually synchronize

With the server running and `CRON_SECRET` configured, call:

```sh
curl --fail-with-body -X POST https://YOUR-PROJECT.vercel.app/api/sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

PowerShell 7 or newer:

```powershell
$syncSecret = Read-Host 'Cron secret' -MaskInput
Invoke-RestMethod -Method Post -Uri 'https://YOUR-PROJECT.vercel.app/api/sync' -Headers @{ Authorization = "Bearer $syncSecret" }
```

Use `http://localhost:3000/api/sync` locally. Never put the secret in a URL or a browser-side fetch. The GET method exists for Vercel Cron; POST is convenient for manual use. A `401` means the secret is incorrect; `503` means authorization/storage is unconfigured or the refresh could not complete. Check server logs and source availability, then retry. Concurrent writes may be rejected safely; the successful snapshot remains intact.

### Rebuild the bundled import

```sh
npm run import
```

This maintenance command merges fetched records with the existing `data/publications.json` and writes that file. It does not update `data/provenance.json` or replace the local/Blob snapshot. Review the resulting dataset and source statuses before committing and deploying. Running the live `/api/sync` route updates snapshot storage rather than modifying repository files; it is the normal way to discover new papers after deployment.

## How author locations are determined

OpenAlex authorships attach each author to the institutions they listed on that particular work. The importer retains those author–institution relationships and country codes. It uses institution geographic records to resolve city, country and coordinates. It does not use an author's current profile affiliations or places mentioned in research titles and abstracts.

Crossref can fill missing paper-specific author affiliations for already-known DOIs. Its free-text affiliation adapter recognizes a country only when an explicit comma-separated country name matches the reviewed gazetteer. ORCID and Ktisis discover bibliographic records but their current adapters do not extract author–institution links. There is no automatic PDF affiliation extraction or general address-geocoding service.

The checked-in institution cache makes the initial affiliation locations available without an academic API call. OpenStreetMap tiles still need network access. During sync, OpenAlex resolves up to 250 uncached institution IDs in batches of 50 with a shared 45-second budget, retaining resolved coordinates in the stored publication snapshot. An institution lookup failure leaves a country-level fallback where the paper supplies a country; otherwise the affiliation remains unmapped.

Country-only affiliations use representative gazetteer points where available and are labelled separately from institution locations. A named country without coordinates can be shown in publication details without a map pin. The institution record may identify an organisation's main location rather than a particular campus. OpenAlex affiliation matches can be incomplete or incorrect. Missing author–institution links and truncated author lists are labelled incomplete. Missing affiliations never become study-area or publisher-address pins.

Papers may have multiple author locations. Country totals and marker counts cannot be added to obtain the total number of papers. Each marker and cluster counts distinct publications, even when multiple coauthors share a location. Global research can still have author institution locations. The legacy `studyLocations` field and text extractor remain for compatibility with historical data; the UI exclusively uses `authorLocations`.

## Correcting an author location

Edit **`data/author-location-overrides.json`**. It is a JSON object keyed by a real DOI, or by the publication's internal `id` when no DOI exists. DOI matching ignores case and accepts a `https://doi.org/` prefix. An override always wins over affiliation metadata, including an intentionally empty list. Historical study overrides in `data/location-overrides.json` do not affect the author map.

The following is a **format illustration**. Replace the key with the paper's real DOI and use the place only after checking the paper; do not paste it as a factual correction without evidence:

```json
{
  "PASTE_REAL_DOI_HERE": {
    "note": "Author affiliation block: verified institution in Limassol.",
    "locations": [
      {
        "name": "Limassol",
        "country": "Cyprus",
        "city": "Limassol",
        "confidence": "high",
        "manuallyVerified": true
      }
    ]
  }
}
```

Coordinates for known places can be omitted; the reviewed gazetteer fills them. For an institution or new city, copy verified latitude/longitude from a reliable geographic source and cite it in `note`. Check the affiliation block on the paper being corrected.

To suppress an incorrect location, use `"locations": []` with `"geographyStatus": "unknown"`. For multiple author locations, add multiple objects to `locations`. JSON does not allow comments or trailing commas.

Run `npm test` and `npm run build -- --webpack`, commit the correction, and deploy. Overrides apply when data is read, so they also correct an older stored snapshot immediately after deployment; no full re-import is needed.

## Troubleshooting

- **A paper is missing:** clear filters first. Check its DOI and author record in the verified OpenAlex, ORCID and institutional profiles. Look at `/api/sync` source outcomes and server logs. Indexing delays cannot be fixed by scraping Scholar. Check that the paper is attached to the verified identities, and that repository entries have Publication entity type.
- **A paper has no pin:** open its details and check the reported affiliations. Missing institution countries or coordinates can leave it unmapped. Add a verified author-location override after checking the paper's affiliation block.
- **An incorrect pin:** correct the author-location override file; for a repeated derivation bug, add a failing test under `tests/` and update `lib/authorLocations.ts`.
- **No automatic updates on Vercel:** confirm the private Blob connection, Production `CRON_SECRET`, cron schedule and function logs. Preview deployments do not receive normal production cron invocations. Credentials added after deployment need a redeploy.
- **An old checked date or update warning:** the date is the latest successful collection check, not the date the page was opened. The badge reports missing storage/schedule configuration, overdue refreshes, saved fallback data or unavailable sources. Expand **Sources & author-location methodology** for details. A new deployment alone does not make an old import current.
- **Upstream API returns 429/403:** check provider policies/quota. For OpenAlex, configure an activated API key for cursor pagination; an email alone is insufficient. Existing publications remain available during a failure.
- **Map tiles fail:** the list and timeline still work. Check network access to the OpenStreetMap tile host and do not remove attribution.
- **Unexpected duplicate:** check the DOI, author evidence and version rules described above. Add a verified DOI/source-URL group to `data/publication-versions.json` for a title change that automatic matching cannot establish. Similar titles alone are insufficient evidence; corrections and distinct follow-up studies should remain separate.
- **Type check reports missing `.next/types` files:** run `npx next typegen`, then `npm run typecheck`. Keep it separate from a concurrently running build.
- **Localhost still shows an earlier interface:** rebuild and restart a production server, then reload every open localhost tab. `npm start` does not hot-reload source edits.

## References

- [OpenAlex paper-specific authorships](https://help.openalex.org/data/authorships/)
- [OpenAlex institution geography](https://help.openalex.org/data/institutions/)
- [Next.js Data Cache and revalidation](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)
- [Next.js background work with after](https://nextjs.org/docs/app/api-reference/functions/after)
- [Vercel Cron authentication and scheduling](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Vercel Blob SDK and conditional writes](https://vercel.com/docs/vercel-blob/using-blob-sdk)
- [OpenAlex authentication](https://help.openalex.org/api/authentication/)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
