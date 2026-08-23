import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRoundsPayload } from '../src/parse.ts';
import type { CandidateRound } from '../src/parse.ts';

// A recorded slice of the live IRCC payload: 36 rounds chosen to cover every
// awkward case in the real data. No test in this package touches the network.
const FIXTURE = readFileSync(
  fileURLToPath(new URL('./fixtures/rounds-sample.json', import.meta.url)),
  'utf8',
);

const outcomes = parseRoundsPayload(FIXTURE);
const good = outcomes.flatMap((o) => (o.ok ? [o.round] : []));
const byNumber = new Map(good.map((r) => [r.round_number, r]));
const find = (n: string): CandidateRound => {
  const round = byNumber.get(n);
  if (round === undefined) throw new Error(`round ${n} did not parse`);
  return round;
};

describe('parseRoundsPayload', () => {
  it('parses every round in the fixture', () => {
    const rejected = outcomes.flatMap((o) => (o.ok ? [] : [o.reason]));
    expect(rejected).toEqual([]);
    expect(good).toHaveLength(36);
  });

  // The defect that motivated making round_number text. parseInt maps both of
  // these to 91, silently destroying one of them.
  it('keeps 91a and 91b as two distinct rounds', () => {
    expect(byNumber.has('91a')).toBe(true);
    expect(byNumber.has('91b')).toBe(true);
    expect(find('91a').round_number).not.toBe(find('91b').round_number);
  });

  // The defect that motivated dropping the cutoff floor from 100 to 0.
  it('accepts round 176 with its cut-off of 75', () => {
    expect(find('176').cutoff_crs).toBe(75);
    expect(find('176').round_type).toBe('program');
  });

  it('strips comma separators from large draw sizes', () => {
    const largest = good.reduce((a, b) => (a.invitations > b.invitations ? a : b));
    expect(largest.invitations).toBe(27332);
  });

  it('leaves tie_break_at null where IRCC publishes none', () => {
    expect(find('1').tie_break_at).toBeNull();
    expect(find('1').drawn_at).toBe('2015-01-31T11:59:48.000Z');
  });

  it('leaves tie_break_at null rather than inferring a missing year', () => {
    expect(find('208').tie_break_at).toBeNull();
  });

  it('classifies rounds and only gives category rounds a category', () => {
    expect(find('437')).toMatchObject({ round_type: 'category', category_code: 'french' });
    expect(find('436')).toMatchObject({ round_type: 'program', category_code: null });
    expect(find('294')).toMatchObject({ round_type: 'general', category_code: null });
  });

  it('maps a renamed stream onto one stable code', () => {
    expect(find('327').category_code).toBe('healthcare');
    expect(find('422').category_code).toBe('healthcare');
  });

  it('builds source_url from a constant plus the checked round number', () => {
    expect(find('91a').source_url).toBe(
      'https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/' +
      'policies-operational-instructions-agreements/ministerial-instructions/' +
      'express-entry-rounds/invitations.html?q=91a',
    );
  });

  it('keeps the untouched original payload in raw', () => {
    expect(find('437').raw).toMatchObject({ drawNumber: '437' });
  });

  it('is deterministic', () => {
    expect(parseRoundsPayload(FIXTURE)).toEqual(outcomes);
  });
});

describe('parseRoundsPayload rejections', () => {
  it('throws when the body is not JSON', () => {
    expect(() => parseRoundsPayload('<html>404</html>')).toThrow(/not valid JSON/);
  });

  it('throws when the rounds array is gone, rather than returning nothing', () => {
    expect(() => parseRoundsPayload('{"classes":"wb-tables"}')).toThrow(/endpoint shape changed/);
  });

  it.each([
    [{ drawNumber: '9!!' }, /unusable round number/],
    [{ drawName: 'Underwater Basket Weaving occupations' }, /unknown draw name/],
    [{ drawCRS: 'five hundred' }, /unparseable CRS/],
    [{ drawSize: '' }, /unparseable draw size/],
    [{ drawDate: 'August 19, 2026' }, /unparseable draw date/],
  ])('quarantines a bad row instead of aborting: %o', (override, expected) => {
    const base = JSON.parse(FIXTURE) as { rounds: Record<string, unknown>[] };
    const corrupted = { ...base, rounds: [{ ...base.rounds[0], ...override }, base.rounds[1]] };
    const result = parseRoundsPayload(JSON.stringify(corrupted));
    expect(result[0]).toMatchObject({ ok: false });
    if (result[0]?.ok === false) expect(result[0].reason).toMatch(expected);
    // the good row beside it still lands
    expect(result[1]).toMatchObject({ ok: true });
  });

  it('drops a row missing a required field rather than coercing it', () => {
    const result = parseRoundsPayload('{"rounds":[{"drawNumber":"1"}]}');
    expect(result[0]).toMatchObject({ ok: false });
  });
});
