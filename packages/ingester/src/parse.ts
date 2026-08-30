/**
 * Raw rounds payload -> candidate rows. Pure: no I/O, no clock, no randomness.
 *
 * Every row is reported individually as an outcome rather than thrown on, so
 * one unmappable round cannot cost the run nine good ones.
 */

import { classifyRound } from './categories.ts';
import { parseDrawnAt, parseTieBreakAt } from './dates.ts';
import { rawPayloadSchema, rawRoundSchema } from './validate.ts';
import type { Json } from './database.types.ts';

export type CandidateRound = {
  round_number: string;
  drawn_at: string;
  round_type: 'general' | 'program' | 'category';
  category_code: string | null;
  program_code: string | null;
  cutoff_crs: number;
  invitations: number;
  tie_break_at: string | null;
  source_url: string;
  raw: Json;
};

export type ParseOutcome =
  | { ok: true; round: CandidateRound }
  | { ok: false; reason: string; payload: Json };

/**
 * Base of the per-round ministerial instruction page.
 *
 * A constant, with only a round number appended after it has been checked
 * against ROUND_NUMBER. Nothing derived from the payload is ever interpolated
 * into a URL that gets fetched - this value is stored and displayed only.
 */
const ROUND_URL_BASE =
  'https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/' +
  'policies-operational-instructions-agreements/ministerial-instructions/' +
  'express-entry-rounds/invitations.html?q=';

/** IRCC's round identifiers: digits, optionally with a single letter suffix (91a, 91b). */
const ROUND_NUMBER = /^[0-9]+[a-z]?$/;

/** IRCC publishes numbers as strings, comma-separated above a thousand. */
function parseCount(value: string): number | null {
  const digits = value.replace(/,/g, '').trim();
  if (!/^\d+$/.test(digits)) return null;
  return Number(digits);
}

function toCandidate(raw: unknown): ParseOutcome {
  const asJson = raw as Json;
  const parsed = rawRoundSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: `row failed schema: ${parsed.error.issues[0]?.message ?? 'unknown'}`, payload: asJson };
  }
  const row = parsed.data;

  const roundNumber = row.drawNumber.trim().toLowerCase();
  if (!ROUND_NUMBER.test(roundNumber)) {
    return { ok: false, reason: `unusable round number ${JSON.stringify(row.drawNumber)}`, payload: asJson };
  }

  const classification = classifyRound(row.drawName);
  if (classification === null) {
    return { ok: false, reason: `unknown draw name ${JSON.stringify(row.drawName)}`, payload: asJson };
  }

  const drawnAt = parseDrawnAt(row.drawDate, row.drawDateTime);
  if (drawnAt === null) {
    return { ok: false, reason: `unparseable draw date ${JSON.stringify(row.drawDate)} / ${JSON.stringify(row.drawDateTime)}`, payload: asJson };
  }

  const cutoffCrs = parseCount(row.drawCRS);
  if (cutoffCrs === null) {
    return { ok: false, reason: `unparseable CRS ${JSON.stringify(row.drawCRS)}`, payload: asJson };
  }

  const invitations = parseCount(row.drawSize);
  if (invitations === null) {
    return { ok: false, reason: `unparseable draw size ${JSON.stringify(row.drawSize)}`, payload: asJson };
  }

  return {
    ok: true,
    round: {
      round_number: roundNumber,
      drawn_at: drawnAt,
      round_type: classification.roundType,
      category_code: classification.categoryCode,
      program_code: classification.programCode,
      cutoff_crs: cutoffCrs,
      invitations,
      // Null when IRCC publishes no tie-break, or publishes one without a year.
      tie_break_at: parseTieBreakAt(row.drawCutOff),
      source_url: `${ROUND_URL_BASE}${roundNumber}`,
      raw: asJson,
    },
  };
}

/**
 * Throws on schema drift at the top level - a body that is not JSON, or has no
 * rounds array, means the endpoint moved or changed and a human needs to look.
 * Per-row problems are returned as outcomes instead.
 */
export function parseRoundsPayload(body: string): ParseOutcome[] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(body);
  } catch (cause) {
    throw new Error('rounds payload is not valid JSON', { cause });
  }

  const payload = rawPayloadSchema.safeParse(decoded);
  if (!payload.success) {
    throw new Error('rounds payload has no rounds array; the endpoint shape changed');
  }

  return payload.data.rounds.map(toCandidate);
}
