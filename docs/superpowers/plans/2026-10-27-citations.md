# Publication citations implementation plan

**Goal:** Show citations per unique paper, overall, and by the calendar year in which citations were received.

**Architecture:** Keep DOI/work-scoped OpenAlex citation snapshots alongside publication metadata. Refresh known papers during the existing daily sync, and supply a checked-in citation baseline for immediate availability with older stored snapshots. Use existing React components and CSS without another chart dependency.

**Constraints:** Counts are OpenAlex figures, which can differ from Google Scholar. Unknown counts remain unavailable. Citation years and publication years are independent. Do not sum alternate versions or stale snapshots. OpenAlex annual coverage starts in 2012; lifetime totals can exceed the annual sum. No credentials belong in client code or the repository.

- [ ] Add and test citation parsing, identity-scoped newest-snapshot selection, and aggregation. Cover invalid numbers, missing history, zero counts, corrected totals, alternate DOIs, duplicate records, and citations before the journal issue year.
- [ ] Add bounded exact-identifier OpenAlex enrichment and include annual counts in discovery. Test mismatched responses, normal missing works, request failures, and preserving the existing publication set.
- [ ] Integrate canonical merge, cache reads, daily refresh, and change detection. Exclude citation-check timestamps from publication changes.
- [ ] Backfill the current collection through public exact-identifier lookups, without accessing production secrets. Check the resulting citation totals and coverage.
- [ ] Add per-paper badges and details, plus a responsive Citations view with calendar-year selection, annual and lifetime totals, coverage, and filtered-cohort scope.
- [ ] Update README; run tests, lint, type checks, production build, independent review, and browser verification. Push the authorized change and verify the live deployment.

**Review focus:** Canonical DOI versus preprint identity; downward source corrections; unavailable versus zero; year coverage gaps; filtered totals versus overall totals; source failures retaining older data; browser navigation and mobile layout.
