/**
 * Which colour a stream gets, everywhere it appears.
 *
 * Pure, and it returns a CSS variable rather than a hex: the same hue has to
 * work as a chart line on cream paper and as a chart label on the dark ground,
 * and only globals.css knows both. See the --stream-* tokens there.
 *
 * Assignments are explicit for every seeded category and program so that a
 * stream keeps its colour when IRCC adds another one. Codes are ours, not
 * IRCC's - see supabase/migrations/20260823090300_categories_seed.sql.
 */

/** The number of colour slots globals.css defines, excluding --stream-none. */
const SLOT_COUNT = 15;

const SLOTS: Record<string, number> = {
  // Round types and programs.
  general: 1,
  cec: 2,
  pnp: 3,
  fsw: 11,
  fst: 14,
  // Category-based selection streams.
  french: 4,
  healthcare: 5,
  stem: 6,
  trades: 7,
  education: 8,
  agriculture: 9,
  transport: 10,
  physicians: 12,
  'senior-managers': 13,
  military: 15,
};

/**
 * A code with no assigned slot still has to render, and has to render the same
 * colour on every page and every reload. IRCC adds streams faster than the seed
 * migrations do, so this is reached in practice rather than defensively.
 */
function fallbackSlot(key: string): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 100_000;
  }
  return (hash % SLOT_COUNT) + 1;
}

/**
 * The generic 'program' bucket mixes streams whose cut-offs are hundreds of
 * points apart, which is why the ladder refuses to show it any movement. It
 * gets grey rather than a colour for the same reason: it is the absence of a
 * known stream, and should not look like one more of them.
 */
export const UNCODED_STREAM_KEY = 'program';

export function streamColour(key: string): string {
  if (key === UNCODED_STREAM_KEY) return 'var(--stream-none)';
  return `var(--stream-${SLOTS[key] ?? fallbackSlot(key)})`;
}
