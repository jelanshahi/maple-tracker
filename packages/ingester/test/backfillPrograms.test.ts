import { describe, expect, it } from 'vitest';
import { planProgramCodeBackfill } from '../src/backfillPrograms.ts';

describe('planProgramCodeBackfill', () => {
  it("derives the program code from each row's stored raw payload", () => {
    const plan = planProgramCodeBackfill([
      { round_number: '436', raw: { drawName: 'Canadian Experience Class' } },
      { round_number: '435', raw: { drawName: 'Provincial Nominee Program' } },
      { round_number: '91a', raw: { drawName: 'Federal Skilled Trades' } },
      { round_number: '240', raw: { drawName: 'Federal Skilled Worker' } },
    ]);
    expect(plan.updates).toEqual([
      { round_number: '436', program_code: 'cec' },
      { round_number: '435', program_code: 'pnp' },
      { round_number: '91a', program_code: 'fst' },
      { round_number: '240', program_code: 'fsw' },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('skips a row whose raw payload has no drawName rather than guessing', () => {
    const plan = planProgramCodeBackfill([{ round_number: '999', raw: { foo: 'bar' } }]);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ round_number: '999', reason: 'raw payload has no drawName' }]);
  });

  it('skips a row that does not classify to a program, rather than writing a guess', () => {
    const plan = planProgramCodeBackfill([{ round_number: '1', raw: { drawName: 'No Program Specified' } }]);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped[0]?.reason).toMatch(/did not classify to a program/);
  });

  it('returns nothing for no rows', () => {
    expect(planProgramCodeBackfill([])).toEqual({ updates: [], skipped: [] });
  });
});
