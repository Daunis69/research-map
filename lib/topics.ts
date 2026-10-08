export interface TopicInput {
  title: string;
  abstract?: string;
  keywords?: readonly string[];
  topics?: readonly string[];
}

const TOPIC_ALIASES: ReadonlyArray<readonly [string, RegExp]> = [
  ["Environmental Health", /\benvironmental health\b/i],
  ["Exposomics", /\bexposom(?:e|es|ics|ic)\b/i],
  [
    "Pesticides",
    /\b(?:pesticid\w*|herbicid\w*|insecticid\w*|glyphosate|chlorpyrifos|pyrethroid\w*)\b/i,
  ],
  [
    "Climate Change",
    /\b(?:climate change|global warming|heat waves?|heatwaves?|heat stress|thermal stress)\b/i,
  ],
  ["Water", /\b(?:water|groundwater|wastewater|drinking-water|aquatic)\b/i],
  [
    "Air Pollution",
    /\b(?:air pollution|particulate matter|airborne|PM2[.,]5|PM10|air quality)\b/i,
  ],
  [
    "Children's Health",
    /\b(?:children|childhood|child|pediatric|paediatric|adolescents?|infants?)\b/i,
  ],
  ["Biomonitoring", /\b(?:biomonitoring|biomarkers?|urinary metabolites?)\b/i],
  [
    "Epidemiology",
    /\b(?:epidemiolog\w*|cohort|case-control|cross-sectional)\b/i,
  ],
  ["Public Health", /\bpublic health\b/i],
  [
    "Chemical Exposure",
    /\b(?:chemical exposure|endocrine disrupt\w*|bisphenol\w*|phthalate\w*|PFAS|perfluoro\w*)\b/i,
  ],
  [
    "Metals & Metalloids",
    /\b(?:arsenic|cadmium|mercury|heavy metals?|metalloids?)\b/i,
  ],
  [
    "Soil & Remediation",
    /\b(?:soil|remediation|sorption|adsorption|biochar)\b/i,
  ],
  ["Oxidative Stress", /\boxidative stress\b/i],
];

/** Preserve source metadata topics, then add labels supported by text/keywords. */
export function deriveTopics(input: TopicInput): string[] {
  const text = [
    input.title,
    input.abstract ?? "",
    ...(input.keywords ?? []),
    ...(input.topics ?? []),
  ].join(" ");
  const topics = new Map<string, string>();
  for (const [label, pattern] of TOPIC_ALIASES) {
    if (pattern.test(text)) topics.set(label.toLocaleLowerCase("en"), label);
  }
  for (const topic of input.topics ?? []) {
    const clean = topic.replace(/<[^>]*>/g, "").trim();
    if (!clean || clean.length > 100 || /^https?:/i.test(clean)) continue;
    const canonical =
      TOPIC_ALIASES.find(
        ([label]) =>
          label.toLocaleLowerCase("en") === clean.toLocaleLowerCase("en"),
      )?.[0] ?? clean;
    topics.set(canonical.toLocaleLowerCase("en"), canonical);
  }
  return [...topics.values()];
}
