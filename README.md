# Makris Scientific Research Map

A responsive publication atlas for **Professor Konstantinos C. Makris, Cyprus University of Technology**. Explore the same dataset through an interactive author-location map, a chronological timeline, and a searchable publication list. Filters are shareable in the URL.

Map points represent **the institutions of all available authors listed on each publication**. Institution coordinates are used when available; country-level markers are labelled as approximate. Papers without usable affiliations remain in the list and timeline as **Author locations unavailable**. Publication details show authors, institutions and incomplete affiliation coverage.

## Quick start

Install Node.js 22 LTS or newer, open a terminal in this folder, and run:

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). A real, checked-in initial import makes the website usable immediately, without credentials or successful academic API calls. Do not delete `data/publications.json`.

For a production build and the data-logic checks:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`npm start` serves the production build. It is separate from `npm run dev`. The lockfile fixes the versions used by this project; CI can use `npm ci`.

## Verified researcher identity

The supplied [Google Scholar profile](https://scholar.google.com/citations?user=iCd8LKAAAAAJ) is an external link, not a scraper target.

- ORCID: [0000-0001-5251-8619](https://orcid.org/0000-0001-5251-8619).
- Primary OpenAlex profile: [A5059194195](https://openalex.org/A5059194195).
- Additional verified OpenAlex profile: [A5129952756](https://openalex.org/A5129952756).
- [Ktisis institutional person record](https://ktisis.cut.ac.cy/entities/person/d526a7a1-3a1b-4b46-aed8-d3276a929152) links the same Scholar account and ORCID.

The two OpenAlex identities have the same verified ORCID and Cyprus affiliation. Both are queried to recover split author records. The secondary profile also contained unrelated physics records, so each of its works must supply a matching raw ORCID, work-level Cyprus affiliation, or at least two independently corroborated coauthors. `data/publication-exclusions.json` records known misattributions and supplementary files; exclusions also apply to older snapshots. See `data/researcher.json` and `data/provenance.json` for identification and DOI cross-checks. Do not replace these identifiers with results of a name-only search: there are other researchers called Konstantinos Makris.

“Complete” here means all pages available from the verified source identities at import/sync time. Metadata providers have indexing delays, omissions, duplicates, and occasional misattributions. This project cannot promise that a provider already contains every paper a researcher has written.

## How the application fits together

The application uses Next.js 16 App Router, strict TypeScript, React, Tailwind CSS, Leaflet/React Leaflet, Leaflet marker clustering, and OpenStreetMap tiles. Leaflet is imported dynamically in a client component with server rendering disabled. No map API key is needed. OpenStreetMap attribution remains visible; use an appropriate tile provider if traffic exceeds the public tile service's usage policy.

```text
OpenAlex + ORCID + author-linked Ktisis records
                  ↓
      normalize / deduplicate by DOI
                  ↓
       Crossref enriches known DOIs
                  ↓
       topics + author institution locations
                  ↓
 private Blob JSON snapshot (local .cache file during development)
                  ↓
      compressed Next.js Data Cache
                  ↓
        Map / Timeline / Publications
```

Important files:

| Area                           | Files                             |
| ------------------------------ | --------------------------------- |
| Shared data contract           | `types/publication.ts`            |
| Source requests and merging    | `lib/publications/`               |
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

## Why one stored JSON snapshot?

Serverless function memory and local files do not persist reliably on Vercel. A cache also is not a permanent record of which papers were previously discovered. Without durable storage, a cold start followed by a partial API outage could lose papers added after the bundled import, and new/updated counts would be unreliable.

This application uses **one private Vercel Blob object**, not a database. It retains the merged publication history across deployments and outages. Next.js caches reads for five minutes using compressed JSON to stay within its per-item cache limit as affiliation metadata grows. Blob writes use conditional ETags to reject conflicting concurrent writes. A failed source never causes known papers to be deleted; an all-source failure keeps the previous dataset. Local development writes to ignored `.cache/publications.json` instead, unless you explicitly configure Blob credentials.

## Deploy to Vercel

1. Push this folder to a GitHub repository. Include `package-lock.json`, `data/publications.json`, and the other source files. Never commit `.env.local` or credentials.
2. In Vercel, select **Add New → Project**, import the repository, and accept the Next.js preset. Use Node.js 22 or newer. The build command is `npm run build`.
3. In the project's **Storage** area, create a **private Blob store** and connect it to the Production environment. Use a separate store for Preview if needed. Connecting a store supplies the SDK's managed credentials (`BLOB_STORE_ID` and OIDC), or the supported `BLOB_READ_WRITE_TOKEN` fallback. Do not manually copy the short-lived OIDC token.
4. Add `CRON_SECRET` to the Production environment. Generate a long random value with a password manager, or run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Store that value securely.
5. Optionally add `OPENALEX_API_KEY` and `OPENALEX_EMAIL` for provider quota/identification. No ORCID client secret is needed for the public works endpoint.
6. Deploy. If you add environment variables after a deployment, redeploy once so that deployment receives them.
7. Open the site and inspect source status. Call the sync endpoint once using the instructions below, then verify **Settings → Cron Jobs** and the function logs.

No redeployment is needed for normal new publications after this setup. Changing application code or checked-in location overrides does require deploying those changes.

### Environment variables

Copy `.env.example` to `.env.local` for local settings. Local browsing needs none of these.

| Variable                | When needed                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `CRON_SECRET`           | Required for daily cron and manual sync requests. Requests fail closed if unset.                      |
| Blob project connection | Required for durable updates on Vercel. SDK uses the connected store's managed credentials.           |
| `BLOB_READ_WRITE_TOKEN` | Alternative Blob authentication, especially outside Vercel. Omit locally to use the local cache file. |
| `OPENALEX_API_KEY`      | Optional OpenAlex key for greater API access/quota.                                                   |
| `OPENALEX_EMAIL`        | Optional contact email for polite academic API access.                                                |

All credentials are server-only. None should use a `NEXT_PUBLIC_` prefix. A Vercel deployment without Blob can display the bundled import, but **cannot persist automatic updates** and shows a configuration warning.

## Daily updates and recovery

`vercel.json` requests a daily GET to `/api/sync` at **04:00 UTC**. Vercel sends `Authorization: Bearer <CRON_SECRET>`; the route verifies it using a constant-time hash comparison. On Hobby, execution can occur anywhere within the scheduled hour. Cron runs on Production, not a local development server.

A run reads the previous snapshot, fetches every source page, deduplicates, enriches bounded batches of known DOIs, derives topics and locations, and stores the result before invalidating the Next.js cache. It returns `total`, `newPublications`, `updatedPublications`, `timestamp`, and per-source outcomes. Timestamp-only differences do not count as publication updates.

The interface also checks whether its dataset is more than 24 hours old. A stale visit schedules a background refresh using Next.js `after()`, so the visitor receives existing data promptly while an update runs. Failed attempts back off for 15 minutes. This recovers from a missed cron when the site next receives a visitor. Existing open browser tabs update when reloaded.

Sources are requested independently with `Promise.allSettled`, timeouts and limited retries. An unavailable ORCID or repository does not prevent OpenAlex updates. Crossref enrichment is bounded to fit serverless execution limits and catches up over subsequent runs. Provider errors are logged server-side; visitors receive readable status, not stack traces or credentials.

### Manually synchronize

With the server running and `CRON_SECRET` configured, call:

```sh
curl --fail-with-body -X POST https://YOUR-PROJECT.vercel.app/api/sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

PowerShell:

```powershell
$syncSecret = Read-Host 'Cron secret' -MaskInput
Invoke-RestMethod -Method Post -Uri 'https://YOUR-PROJECT.vercel.app/api/sync' -Headers @{ Authorization = "Bearer $syncSecret" }
```

Use `http://localhost:3000/api/sync` locally. Never put the secret in a URL or a browser-side fetch. The GET method exists for Vercel Cron; POST is convenient for manual use. A `401` means the secret is incorrect; `503` means authorization/storage is unconfigured or the refresh could not complete. Check server logs and source availability, then retry. Concurrent writes may be rejected safely; the successful snapshot remains intact.

### Rebuild the bundled import

```sh
npm run import
```

This is a maintenance command for refreshing the committed starting snapshot, not a step required for every new paper. Review the resulting JSON and provenance changes before committing. Running the live `/api/sync` route updates persistent storage rather than modifying repository files.

## How author locations are determined

OpenAlex authorships attach each author to the institutions they listed on that particular work. The importer retains those author–institution relationships and country codes. It uses institution geographic records to resolve city, country and coordinates. It does not use an author's current profile affiliations or places mentioned in research titles and abstracts.

The checked-in institution cache makes initial browsing independent of network access. Daily sync resolves newly encountered institution IDs in batches with a 45-second budget, retaining resolved coordinates in the stored publication snapshot. An institution lookup failure leaves a country-level fallback where the paper supplies a country; otherwise the affiliation remains unmapped.

Country-only affiliations use representative gazetteer points and are labelled separately from institution locations. The institution record may identify an organisation's main location rather than a particular campus. OpenAlex affiliation matches can be incomplete or incorrect. Its author list is capped at 100, so large collaborations are labelled incomplete. Missing affiliations never become study-area or publisher-address pins.

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

Run `npm test` and `npm run build`, commit the correction, and deploy. Overrides apply when data is read, so they also correct an older stored snapshot immediately after deployment; no full re-import is needed.

## Troubleshooting

- **A paper is missing:** clear filters first. Check its DOI and author record in the verified OpenAlex, ORCID and institutional profiles. Look at `/api/sync` source outcomes and server logs. Indexing delays cannot be fixed by scraping Scholar. Check that the paper is attached to the verified identities, and that repository entries have Publication entity type.
- **A paper has no pin:** open its details and check the reported affiliations. Missing institution countries or coordinates can leave it unmapped. Add a verified author-location override after checking the paper's affiliation block.
- **An incorrect pin:** correct the author-location override file; for a repeated derivation bug, add a failing test under `tests/` and update `lib/authorLocations.ts`.
- **No automatic updates on Vercel:** confirm the private Blob connection, Production `CRON_SECRET`, cron schedule and function logs. Preview deployments do not receive normal production cron invocations. Credentials added after deployment need a redeploy.
- **Upstream API returns 429/403:** wait and check provider policies/quota. Configure an optional OpenAlex key. Existing publications remain available during a failure.
- **Map tiles fail:** the list and timeline still work. Check network access to the OpenStreetMap tile host and do not remove attribution.
- **Unexpected duplicate:** DOI is the primary key. Without DOI, normalized title, year and first author identify the work. Different DOIs are kept distinct, including preprints and final versions. Inspect the source metadata before changing merge rules.

## References

- [OpenAlex paper-specific authorships](https://help.openalex.org/data/authorships/)
- [OpenAlex institution geography](https://help.openalex.org/data/institutions/)

- [Next.js Data Cache and revalidation](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)
- [Next.js background work with after](https://nextjs.org/docs/app/api-reference/functions/after)
- [Vercel Cron authentication and scheduling](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Vercel Blob SDK and conditional writes](https://vercel.com/docs/vercel-blob/using-blob-sdk)
- [OpenAlex authentication](https://help.openalex.org/api/authentication/)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
