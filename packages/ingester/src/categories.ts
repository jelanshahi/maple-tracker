/**
 * Map IRCC's free-text `drawName` onto a round type and a stable category code.
 *
 * IRCC publishes only display names, and renames and re-versions its streams:
 * "Healthcare occupations (Version 1)" became "Healthcare and social services
 * occupations (Version 2)" and then "Healthcare and Social Services
 * Occupations, 2026-Version 3". Case, pluralisation and hyphenation all drift
 * ("Trade occupations" vs "Trades Occupations", "French language proficiency"
 * vs "French-Language proficiency"). Codes here are ours and stable; they must
 * stay in step with the categories seed migration.
 */

export type RoundClassification = {
  roundType: 'general' | 'program' | 'category';
  categoryCode: string | null;
  programCode: string | null;
};

/**
 * Rounds that name a program or no program at all, rather than a category.
 * Program codes here match the seed rows in
 * supabase/migrations/20260828210000_programs.sql — they must stay in step.
 */
const NON_CATEGORY_NAMES = new Map<string, { roundType: 'general' | 'program'; programCode: string | null }>([
  ['no program specified', { roundType: 'general', programCode: null }],
  ['general', { roundType: 'general', programCode: null }],
  ['canadian experience class', { roundType: 'program', programCode: 'cec' }],
  ['provincial nominee program', { roundType: 'program', programCode: 'pnp' }],
  ['federal skilled worker', { roundType: 'program', programCode: 'fsw' }],
  ['federal skilled trades', { roundType: 'program', programCode: 'fst' }],
]);

/**
 * Substring probes against the version-stripped name, in order. First match
 * wins, so these must stay disjoint enough not to collide - note that the
 * program names above are matched exactly and removed first, which is what
 * stops "Federal Skilled Trades" reaching the 'trade' probe.
 */
const CATEGORY_PROBES: ReadonlyArray<readonly [string, string]> = [
  ['french', 'french'],
  ['healthcare', 'healthcare'],
  ['stem', 'stem'],
  ['trade', 'trades'],
  ['transport', 'transport'],
  ['agriculture', 'agriculture'],
  ['education', 'education'],
  ['physician', 'physicians'],
  ['senior manager', 'senior-managers'],
  ['military', 'military'],
];

/**
 * Strip the version marker IRCC appends, in each of the three shapes it uses:
 * ", 2026-Version 2" | " (Version 1)" | " 2026-Version 2"
 */
function stripVersion(drawName: string): string {
  return drawName
    .replace(/[,]?\s*\(?\s*\d{4}-version\s*\d+\s*\)?\s*$/i, '')
    .replace(/[,]?\s*\(\s*version\s*\d+\s*\)\s*$/i, '')
    .replace(/[,]?\s*version\s*\d+\s*$/i, '')
    .trim();
}

/**
 * Returns null when the name matches no known category, which is the signal to
 * quarantine the row. That is deliberate: five new streams appeared in February
 * 2026 alone, and an unrecognised one must be loud rather than guessed at or
 * silently dropped.
 */
export function classifyRound(drawName: string): RoundClassification | null {
  const stripped = stripVersion(drawName);
  const normalised = stripped.toLowerCase().replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();

  const nonCategory = NON_CATEGORY_NAMES.get(normalised);
  if (nonCategory !== undefined) {
    return { roundType: nonCategory.roundType, categoryCode: null, programCode: nonCategory.programCode };
  }

  for (const [probe, code] of CATEGORY_PROBES) {
    if (normalised.includes(probe)) {
      return { roundType: 'category', categoryCode: code, programCode: null };
    }
  }

  return null;
}
