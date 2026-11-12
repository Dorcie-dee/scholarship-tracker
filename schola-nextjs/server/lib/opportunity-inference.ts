import { OpportunityType, StudyLevel } from './enums';

export interface OpportunityFieldSuggestions {
  suggestedOpportunityType: OpportunityType | null;
  suggestedStudyLevel: StudyLevel | null;
  suggestedCountry: string | null;
}

/**
 * Best-effort, deterministic cues pulled from a fetched page's title/excerpt
 * (and, for country, its hostname) — never an LLM call. Nothing here is
 * authoritative: every suggestion is pre-filled into the create-opportunity
 * form as an ordinary editable value, exactly like the title/summary
 * already were, so a wrong guess costs the user one correction, not a
 * silently-wrong record. See `add-opportunity-panel.tsx`'s consumption of
 * this for the "only fill what's still empty" rule.
 */
export function inferOpportunityFields(input: {
  title: string | null;
  text: string;
  finalUrl: string;
}): OpportunityFieldSuggestions {
  const haystack = `${input.title ?? ''}\n${input.text}`.toLowerCase();

  return {
    suggestedOpportunityType: inferOpportunityType(haystack),
    suggestedStudyLevel: inferStudyLevel(haystack),
    suggestedCountry: inferCountry(haystack, input.finalUrl),
  };
}

function countOccurrences(haystack: string, keyword: string): number {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = haystack.match(new RegExp(`\\b${escaped}\\b`, 'g'));
  return matches?.length ?? 0;
}

/** Highest-scoring entry in `candidates`, ties broken by list order. `null` if every score is 0. */
function pickHighestScoring<T>(candidates: Array<{ value: T; score: number }>): T | null {
  let best: { value: T; score: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.score > 0 && (!best || candidate.score > best.score)) {
      best = candidate;
    }
  }
  return best?.value ?? null;
}

const SPECIFIC_OPPORTUNITY_TYPES: Array<{ type: OpportunityType; keywords: string[] }> = [
  { type: OpportunityType.SCHOLARSHIP, keywords: ['scholarship', 'scholarships'] },
  { type: OpportunityType.FELLOWSHIP, keywords: ['fellowship', 'fellowships'] },
  { type: OpportunityType.GRANT, keywords: ['grant', 'grants'] },
];
/** Checked only when none of the three specific types above matched anything — "funding" is generic enough that it almost always co-occurs with a more specific word, so it's a fallback, not a fourth equal candidate. */
const FUNDING_KEYWORDS = ['funding', 'financial aid', 'bursary', 'bursaries', 'stipend'];

function inferOpportunityType(haystack: string): OpportunityType | null {
  const specific = pickHighestScoring(
    SPECIFIC_OPPORTUNITY_TYPES.map(({ type, keywords }) => ({
      value: type,
      score: keywords.reduce((sum, kw) => sum + countOccurrences(haystack, kw), 0),
    })),
  );
  if (specific) return specific;

  const fundingScore = FUNDING_KEYWORDS.reduce((sum, kw) => sum + countOccurrences(haystack, kw), 0);
  return fundingScore > 0 ? OpportunityType.FUNDING : null;
}

const STUDY_LEVEL_KEYWORDS: Array<{ level: StudyLevel; keywords: string[] }> = [
  { level: StudyLevel.POSTDOC, keywords: ['postdoc', 'postdocs', 'post-doc', 'post-docs', 'postdoctoral', 'post-doctoral'] },
  { level: StudyLevel.PHD, keywords: ['phd', 'ph.d', 'doctoral', 'doctorate'] },
  { level: StudyLevel.MASTERS, keywords: ["master's", 'masters', 'master', 'msc', 'mba', 'graduate programme', 'graduate program'] },
  { level: StudyLevel.UNDERGRADUATE, keywords: ['undergraduate', "bachelor's", 'bachelors', 'bachelor'] },
];

function inferStudyLevel(haystack: string): StudyLevel | null {
  // Word-boundary matching already keeps "postdoctoral" from also counting
  // as a bare "doctoral" match (no `\b` sits between "post" and "doctoral"
  // with no separator) — but a hyphenated "post-doctoral" DOES have a
  // boundary there, so postdoc keywords are stripped before PHD is scored,
  // to keep a postdoc posting from also registering as a PhD one.
  let phdScanText = haystack;
  for (const kw of STUDY_LEVEL_KEYWORDS[0].keywords) {
    phdScanText = phdScanText.replace(new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), ' ');
  }

  return pickHighestScoring(
    STUDY_LEVEL_KEYWORDS.map(({ level, keywords }, index) => ({
      value: level,
      score: keywords.reduce((sum, kw) => sum + countOccurrences(index === 1 ? phdScanText : haystack, kw), 0),
    })),
  );
}

/** Common study-abroad destinations only — this is a best-effort cue, not a gazetteer. Order is the tie-break when counts are equal. */
const COUNTRY_KEYWORDS: Array<{ country: string; keywords: string[] }> = [
  { country: 'United States', keywords: ['united states', 'usa', 'u.s.a', 'american university'] },
  { country: 'United Kingdom', keywords: ['united kingdom', 'britain', 'british', 'england', 'scotland', 'wales'] },
  { country: 'Canada', keywords: ['canada', 'canadian'] },
  { country: 'Australia', keywords: ['australia', 'australian'] },
  { country: 'Germany', keywords: ['germany', 'german'] },
  { country: 'Netherlands', keywords: ['netherlands', 'dutch', 'holland'] },
  { country: 'France', keywords: ['france', 'french'] },
  { country: 'Ireland', keywords: ['ireland', 'irish'] },
  { country: 'New Zealand', keywords: ['new zealand'] },
  { country: 'Sweden', keywords: ['sweden', 'swedish'] },
  { country: 'Norway', keywords: ['norway', 'norwegian'] },
  { country: 'Denmark', keywords: ['denmark', 'danish'] },
  { country: 'Finland', keywords: ['finland', 'finnish'] },
  { country: 'Switzerland', keywords: ['switzerland', 'swiss'] },
  { country: 'Italy', keywords: ['italy', 'italian'] },
  { country: 'Spain', keywords: ['spain', 'spanish'] },
  { country: 'Japan', keywords: ['japan', 'japanese'] },
  { country: 'South Korea', keywords: ['south korea', 'korean'] },
  { country: 'Singapore', keywords: ['singapore', 'singaporean'] },
  { country: 'China', keywords: ['china', 'chinese'] },
  { country: 'India', keywords: ['india', 'indian'] },
  { country: 'Ghana', keywords: ['ghana', 'ghanaian'] },
  { country: 'Nigeria', keywords: ['nigeria', 'nigerian'] },
  { country: 'South Africa', keywords: ['south africa', 'south african'] },
  { country: 'Kenya', keywords: ['kenya', 'kenyan'] },
  { country: 'Belgium', keywords: ['belgium', 'belgian'] },
  { country: 'Austria', keywords: ['austria', 'austrian'] },
  { country: 'Portugal', keywords: ['portugal', 'portuguese'] },
  { country: 'Poland', keywords: ['poland', 'polish'] },
  { country: 'Czech Republic', keywords: ['czech republic', 'czechia', 'czech'] },
  { country: 'Hungary', keywords: ['hungary', 'hungarian'] },
  { country: 'Greece', keywords: ['greece', 'greek'] },
  { country: 'Turkey', keywords: ['turkey', 'turkish'] },
  { country: 'United Arab Emirates', keywords: ['united arab emirates', 'uae', 'dubai', 'abu dhabi'] },
  { country: 'Qatar', keywords: ['qatar', 'qatari'] },
  { country: 'Brazil', keywords: ['brazil', 'brazilian'] },
  { country: 'Mexico', keywords: ['mexico', 'mexican'] },
  { country: 'Malaysia', keywords: ['malaysia', 'malaysian'] },
  { country: 'Hong Kong', keywords: ['hong kong'] },
];

/** Country-code TLD fallback, used only when no keyword matched any country name/demonym in the text. */
const TLD_COUNTRY_MAP: Record<string, string> = {
  uk: 'United Kingdom',
  ca: 'Canada',
  au: 'Australia',
  de: 'Germany',
  nl: 'Netherlands',
  fr: 'France',
  ie: 'Ireland',
  nz: 'New Zealand',
  se: 'Sweden',
  no: 'Norway',
  dk: 'Denmark',
  fi: 'Finland',
  ch: 'Switzerland',
  it: 'Italy',
  es: 'Spain',
  jp: 'Japan',
  kr: 'South Korea',
  sg: 'Singapore',
  cn: 'China',
  in: 'India',
  gh: 'Ghana',
  ng: 'Nigeria',
  za: 'South Africa',
  ke: 'Kenya',
  be: 'Belgium',
  at: 'Austria',
  pt: 'Portugal',
  pl: 'Poland',
  cz: 'Czech Republic',
  hu: 'Hungary',
  gr: 'Greece',
  tr: 'Turkey',
  ae: 'United Arab Emirates',
  qa: 'Qatar',
  br: 'Brazil',
  mx: 'Mexico',
  my: 'Malaysia',
  hk: 'Hong Kong',
};

function inferCountry(haystack: string, finalUrl: string): string | null {
  const fromText = pickHighestScoring(
    COUNTRY_KEYWORDS.map(({ country, keywords }) => ({
      value: country,
      score: keywords.reduce((sum, kw) => sum + countOccurrences(haystack, kw), 0),
    })),
  );
  if (fromText) return fromText;

  return guessCountryFromHostname(finalUrl);
}

function guessCountryFromHostname(rawUrl: string): string | null {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (hostname.endsWith('.edu')) return 'United States';
  const tld = hostname.split('.').pop();
  return (tld && TLD_COUNTRY_MAP[tld]) ?? null;
}
