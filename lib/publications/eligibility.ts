import exclusions from "../../data/publication-exclusions.json";
import researcher from "../../data/researcher.json";
import type { Publication } from "../../types/publication";
import {
  array,
  canonicalAuthor,
  nested,
  normalizeDoi,
  record,
  text,
} from "./normalize";

const nonPublicationTypes = new Set([
  "dataset",
  "supplementary-materials",
  "supplementary-material",
  "paratext",
  "grant",
  "peer-review",
  "software",
]);
const supplementalTitle =
  /^(?:additional (?:file|table|figure)|supplementary(?: materials?| information| data| files?)?(?:\s|$)|supporting information)/i;

export function isPublicationContent(title: string, type?: string): boolean {
  return (
    !supplementalTitle.test(title) &&
    !nonPublicationTypes.has((type ?? "").toLowerCase())
  );
}

export function isExcludedPublication(
  publication: Pick<Publication, "title" | "doi" | "source">,
): boolean {
  return (
    !isPublicationContent(publication.title) ||
    exclusions.some(
      (exclusion) =>
        normalizeDoi(publication.doi) === exclusion.doi ||
        publication.source.openAlex?.endsWith(`/${exclusion.openAlexId}`),
    )
  );
}

/** An ORCID copied onto a split OpenAlex author entity is not work-level proof. */
export function hasCorroboratedOpenAlexAuthorship(
  value: unknown,
  verifiedAuthorIds: string[] = researcher.openAlexAuthorIds,
): boolean {
  const work = record(value);
  const authorships = array(work.authorships).map(record);
  const matching = authorships.filter((authorship) =>
    verifiedAuthorIds.includes(
      text(nested(authorship, "author", "id"))
        ?.split("/")
        .at(-1) ?? "",
    ),
  );
  const secondaryOnly =
    matching.length > 0 &&
    matching.every(
      (authorship) =>
        !text(nested(authorship, "author", "id"))?.endsWith(
          researcher.openAlexId,
        ),
    );
  if (!secondaryOnly) {
    // Primary-profile consortium records may truncate the author list at 100.
    // Still reject direct work-level evidence of the known namesake.
    return !matching.some(
      (authorship) =>
        /0000-0002-0626-0589/.test(String(authorship.raw_orcid)) ||
        /Konstantinos\s+G\.?\s+Makris/i.test(
          String(authorship.raw_author_name),
        ),
    );
  }
  if (
    matching.some(
      (authorship) =>
        text(authorship.raw_orcid)?.endsWith(researcher.orcid) ||
        array(authorship.institutions).some((institution) =>
          text(record(institution).id)?.endsWith(
            researcher.openAlexInstitutionId,
          ),
        ) ||
        array(authorship.raw_affiliation_strings).some((value) =>
          /Cyprus University of Technology|Cyprus International Institute for Environmental/i.test(
            String(value),
          ),
        ),
    )
  )
    return true;
  // These coauthors are independently present in authority-linked Ktisis papers.
  // Two matches are required when the work itself supplies no affiliation/ORCID.
  const corroboratedCoauthors = new Set([
    "jeddi m",
    "galea k",
    "andra s",
    "charisiadis p",
  ]);
  const coauthorKeys = authorships.map((author) =>
    canonicalAuthor(
      text(nested(author, "author", "display_name")) ??
        text(author.raw_author_name),
    ),
  );
  const matches = new Set(
    coauthorKeys.filter((key) => corroboratedCoauthors.has(key)),
  );
  return matches.size >= 2;
}
