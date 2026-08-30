# Program Code Split Implementation Plan

> **Status: complete, merged to `main` 2026-08-30.** All 12 tasks done. Kept as a record of
> what was intended; where the finished code differs, the code is right and this file is not.
>
> Three deviations worth knowing about:
>
> - **Task 7** was implemented more widely than written — `loadProgramRoundsMissingCode` ended up
>   selecting nine columns including `raw`, and `writeProgramCodeBackfill` upserting whole rows, to
>   satisfy supabase-js's upsert typing. Review caught that this makes a one-column backfill a
>   read-modify-write over live history, able to silently revert a concurrent ingest correction. It
>   is now a narrow `update()` per row, plus a row limit that throws — PostgREST truncates an
>   unbounded select at 1000 rows in silence, and a truncated backfill reports success right up
>   until the not-null constraint aborts.
> - **Task 11** did not use the nested ternary this plan specifies. That shape appears twice, in two
>   server components with no tests, and the plan's only new test was one that already passed. The
>   lookup is a pure `streamLabel` helper in `format.ts` instead, with real coverage. The merged
>   label map was later extracted as `mergeStreamLabels` once it reached three call sites — it had
>   also been letting programs win a code collision while `streamLabel` preferred categories.
> - **Tasks 5 and 8** applied their migrations through the Supabase MCP tool, which stamps its own
>   version. That left the migration ledger disagreeing with every local filename and broke
>   `supabase db push` for the whole repo, not just these two files. Reconciled separately on
>   2026-08-30; see `ARCHITECTURE.md` §11.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each Express Entry program (CEC, PNP, FST, FSW) its own identity in `draw_rounds`, so the cut-off ladder and round tables can show real movement for program-specific rounds instead of withholding the number.

**Architecture:** `classifyRound` already parses which program a round belongs to (it has to, to know the round is `round_type = 'program'` at all) — it just discards that information. Extend it to also return a `programCode`, carry that through parsing/validation/storage as `draw_rounds.program_code`, backfill the 186 existing program rows from their own already-stored `raw.drawName` (no re-fetch), lock the column down with a not-null-iff-program check once backfilled, then have the web client group and label streams by `program_code` the same way it already does by `category_code`.

**Tech Stack:** TypeScript 5 strict, zod, vitest, `@supabase/supabase-js`, Next.js App Router — matching every existing file this plan touches.

## Global Constraints

- No speculative abstraction: reuse `classifyRound`, the existing category-label merge pattern, and the existing upsert/backfill shapes rather than inventing new ones.
- `program_code` values are exactly `'cec' | 'pnp' | 'fst' | 'fsw'`, matching the seed rows in `supabase/migrations/20260828210000_programs.sql`.
- The backfill never re-fetches canada.ca. It reads `raw` already stored in `draw_rounds` and re-derives from that, per ARCHITECTURE.md §11 row 410 and the precedent at ARCHITECTURE.md line 57 (`dd1`…`dd18` backfill).
- The not-null constraint on `program_code` is added only in a follow-up migration, after the backfill is verified complete — mirroring the comment already in `20260828210000_programs.sql`.
- `apps/web` never imports from `packages/ingester`. Both packages independently validate the same `programs` table shape with their own schema, matching how `categories` is already handled.
- Run `pnpm typecheck` and the relevant `vitest run` after every task; run the full `pnpm test` and `pnpm build` at the end.

---

### Task 1: `classifyRound` returns a program code

**Files:**
- Modify: `packages/ingester/src/categories.ts`
- Test: `packages/ingester/test/categories.test.ts`

**Interfaces:**
- Produces: `RoundClassification = { roundType: 'general' | 'program' | 'category'; categoryCode: string | null; programCode: string | null }`, exported from `categories.ts`. Every later task that touches classification reads `.programCode` from this type.

- [x] **Step 1: Write the failing test**

Replace the first `it.each` block in `packages/ingester/test/categories.test.ts` (lines 5–14):

```ts
  it.each([
    ['No Program Specified',       'general', null],
    ['General',                    'general', null],
    ['Canadian Experience Class',  'program', 'cec'],
    ['Provincial Nominee Program', 'program', 'pnp'],
    ['Federal Skilled Worker',     'program', 'fsw'],
    ['Federal Skilled Trades',     'program', 'fst'],
  ])('classifies %s as a %s round with program code %s', (drawName, roundType, programCode) => {
    expect(classifyRound(drawName)).toEqual({ roundType, categoryCode: null, programCode });
  });
```

And update every other `classifyRound(...)` assertion in the same file to include `programCode: null` (the category block at lines 23–42, and the "does not mistake" test at line 19 stays as-is since it only reads `.categoryCode`):

```ts
  ])('maps %s to the %s category', (drawName, categoryCode) => {
    expect(classifyRound(drawName)).toEqual({ roundType: 'category', categoryCode, programCode: null });
  });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @maple/ingester exec vitest run test/categories.test.ts`
Expected: FAIL — actual value is missing the `programCode` key.

- [x] **Step 3: Implement**

In `packages/ingester/src/categories.ts`, replace lines 13–26:

```ts
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
```

Replace the body of `classifyRound` (lines 65–81):

```ts
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
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @maple/ingester exec vitest run test/categories.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ingester/src/categories.ts packages/ingester/test/categories.test.ts
git commit -m "Have classifyRound name the program it already recognises"
```

---

### Task 2: Carry `program_code` through parsing

**Files:**
- Modify: `packages/ingester/src/parse.ts`
- Test: `packages/ingester/test/parse.test.ts`

**Interfaces:**
- Consumes: `RoundClassification` from Task 1 (`.programCode`).
- Produces: `CandidateRound.program_code: string | null`. Every later task reading or writing a `CandidateRound` includes this field.

- [x] **Step 1: Write the failing test**

In `packages/ingester/test/parse.test.ts`, replace lines 58–62:

```ts
  it('classifies rounds and only gives category rounds a category', () => {
    expect(find('437')).toMatchObject({ round_type: 'category', category_code: 'french', program_code: null });
    expect(find('436')).toMatchObject({ round_type: 'program', category_code: null, program_code: 'cec' });
    expect(find('294')).toMatchObject({ round_type: 'general', category_code: null, program_code: null });
  });

  it('names each of the four programs from its own drawName', () => {
    expect(find('436').program_code).toBe('cec');  // Canadian Experience Class
    expect(find('435').program_code).toBe('pnp');  // Provincial Nominee Program
    expect(find('91a').program_code).toBe('fst');  // Federal Skilled Trades
    expect(find('240').program_code).toBe('fsw');  // Federal Skilled Worker
  });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @maple/ingester exec vitest run test/parse.test.ts`
Expected: FAIL — `program_code` is `undefined` on the parsed candidate.

- [x] **Step 3: Implement**

In `packages/ingester/src/parse.ts`, add the field to `CandidateRound` (after line 17):

```ts
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
```

And set it in `toCandidate`'s return (lines 84–98):

```ts
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
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @maple/ingester exec vitest run test/parse.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ingester/src/parse.ts packages/ingester/test/parse.test.ts
git commit -m "Carry program_code from classification onto the candidate round"
```

---

### Task 3: Guard `program_code` at the validation boundary

**Files:**
- Modify: `packages/ingester/src/validate.ts`
- Test: `packages/ingester/test/validate.test.ts`, `packages/ingester/test/sift.test.ts`

**Interfaces:**
- Consumes: `CandidateRound.program_code` from Task 2.
- Produces: `guardCandidate` rejects a `program_code`/`round_type` mismatch, mirroring the existing `category_code` guard.

- [x] **Step 1: Write the failing test**

In `packages/ingester/test/validate.test.ts`, add `program_code: null` to the base `round` fixture (line 5–15):

```ts
const round: CandidateRound = {
  round_number: '437',
  drawn_at: '2026-08-19T12:35:37.000Z',
  round_type: 'category',
  category_code: 'french',
  program_code: null,
  cutoff_crs: 382,
  invitations: 5000,
  tie_break_at: '2026-03-01T18:34:05.000Z',
  source_url: 'https://www.canada.ca/x',
  raw: {},
};
```

Update the cut-off-of-75 test (line 23–25) to keep `program_code` consistent with the overridden `round_type`:

```ts
  it('accepts a cut-off of 75', () => {
    expect(guardCandidate({ ...round, cutoff_crs: 75, round_type: 'program', category_code: null, program_code: 'cec' })).toBeNull();
  });
```

Add two new tests after the existing category-guard tests (after line 42):

```ts
  it('rejects a program round with no program code', () => {
    expect(guardCandidate({ ...round, round_type: 'program', category_code: null, program_code: null }))
      .toMatch(/program round with no program code/);
  });

  it('rejects a category round carrying a program code', () => {
    expect(guardCandidate({ ...round, program_code: 'cec' })).toMatch(/carries a program code/);
  });
```

In `packages/ingester/test/sift.test.ts`, add `program_code: null` to the `round` factory's defaults (line 5–16):

```ts
const round = (over: Partial<CandidateRound> = {}): CandidateRound => ({
  round_number: '437',
  drawn_at: '2026-08-19T12:35:37.000Z',
  round_type: 'category',
  category_code: 'french',
  program_code: null,
  cutoff_crs: 382,
  invitations: 5000,
  tie_break_at: null,
  source_url: 'https://www.canada.ca/x',
  raw: {},
  ...over,
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @maple/ingester exec vitest run test/validate.test.ts test/sift.test.ts`
Expected: FAIL — the two new `validate.test.ts` assertions fail (no such rejection yet); `sift.test.ts` should still pass since it doesn't yet exercise the new guard, but the fixture edit keeps it from breaking once the guard lands.

- [x] **Step 3: Implement**

In `packages/ingester/src/validate.ts`, add to `guardCandidate` after the existing category checks (after line 61, before the tie-break check):

```ts
  if (candidate.round_type === 'program' && candidate.program_code === null) {
    return 'program round with no program code';
  }
  if (candidate.round_type !== 'program' && candidate.program_code !== null) {
    return `${candidate.round_type} round carries a program code`;
  }
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @maple/ingester exec vitest run test/validate.test.ts test/sift.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ingester/src/validate.ts packages/ingester/test/validate.test.ts packages/ingester/test/sift.test.ts
git commit -m "Guard program_code against round_type the same way category_code already is"
```

---

### Task 4: Update `store.ts` test fixtures and the generated database types

**Files:**
- Modify: `packages/ingester/test/store.test.ts`
- Modify: `packages/ingester/src/database.types.ts`

**Interfaces:**
- Consumes: `CandidateRound.program_code` from Task 2.
- Produces: `Database['public']['Tables']['programs']` and `draw_rounds.program_code` in the generated types, so `Store` (`SupabaseClient<Database>`) accepts the new column and table.

- [x] **Step 1: Fix the now-broken fixture**

In `packages/ingester/test/store.test.ts`, add `program_code: null` to the `round` factory (lines 43–53):

```ts
const round = (roundNumber: string): CandidateRound => ({
  round_number: roundNumber,
  drawn_at: '2026-08-19T12:35:37.000Z',
  round_type: 'general',
  category_code: null,
  program_code: null,
  cutoff_crs: 500,
  invitations: 1000,
  tie_break_at: null,
  source_url: 'https://www.canada.ca/example.html',
  raw: {},
});
```

- [x] **Step 2: Run typecheck to see the current gap**

Run: `pnpm --filter @maple/ingester run typecheck`
Expected: FAIL — `store.ts`'s `upsertRounds` passes `CandidateRound[]` (now carrying `program_code`) into `.upsert()`, typed against `Database['public']['Tables']['draw_rounds']['Insert']`, which has no such key.

- [x] **Step 3: Regenerate the types, or hand-edit if generation isn't available**

Try the generator first (this is what `pnpm types` runs, and matches how the project keeps this file in sync with the schema):

```bash
pnpm types
```

If that fails (no linked Supabase CLI session in this environment), apply this exact hand-edit to `packages/ingester/src/database.types.ts` instead — it is what the generator would produce from `supabase/migrations/20260828210000_programs.sql`.

Insert a new `programs` table block between `pool_snapshots` (ends at line 171) and `quarantined_rows` (starts at line 172) — alphabetical order, matching the rest of the file:

```ts
      programs: {
        Row: {
          active_from: string
          active_to: string | null
          code: string
          label: string
        }
        Insert: {
          active_from: string
          active_to?: string | null
          code: string
          label: string
        }
        Update: {
          active_from?: string
          active_to?: string | null
          code?: string
          label?: string
        }
        Relationships: []
      }
```

Replace the `draw_rounds` block (lines 38–84) to add `program_code` and its relationship:

```ts
      draw_rounds: {
        Row: {
          category_code: string | null
          cutoff_crs: number
          drawn_at: string
          ingested_at: string
          invitations: number
          program_code: string | null
          raw: Json
          round_number: string
          round_type: string
          source_url: string
          tie_break_at: string | null
        }
        Insert: {
          category_code?: string | null
          cutoff_crs: number
          drawn_at: string
          ingested_at?: string
          invitations: number
          program_code?: string | null
          raw: Json
          round_number: string
          round_type: string
          source_url: string
          tie_break_at?: string | null
        }
        Update: {
          category_code?: string | null
          cutoff_crs?: number
          drawn_at?: string
          ingested_at?: string
          invitations?: number
          program_code?: string | null
          raw?: Json
          round_number?: string
          round_type?: string
          source_url?: string
          tie_break_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "draw_rounds_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "draw_rounds_program_code_fkey"
            columns: ["program_code"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["code"]
          },
        ]
      }
```

- [x] **Step 4: Run typecheck and the store tests to verify they pass**

Run: `pnpm --filter @maple/ingester run typecheck && pnpm --filter @maple/ingester exec vitest run test/store.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ingester/test/store.test.ts packages/ingester/src/database.types.ts
git commit -m "Regenerate database types for the programs table and draw_rounds.program_code"
```

---

### Task 5: Apply and commit the `programs` table migration

**Files:**
- Commit (already written, untracked): `supabase/migrations/20260828210000_programs.sql`

This file already exists in the working tree from prior work and needs no changes — it was reviewed as part of scoping this plan. It creates `programs`, seeds the four rows, adds the nullable `draw_rounds.program_code` column and its index, and deliberately leaves out the not-null constraint (that's Task 8, after the backfill).

- [x] **Step 1: Apply the migration to the live `maple-tracker` project**

Use the `mcp__claude_ai_Supabase__apply_migration` tool (the same path last session used for `20260828193000_public_verification_time.sql`) with:
- `project_id`: the `maple-tracker` project id (`ubzmpejcooniohccuqbs`, confirmed active in the prior session)
- `name`: `programs`
- `query`: the full contents of `supabase/migrations/20260828210000_programs.sql`

- [x] **Step 2: Verify it applied cleanly**

Use `mcp__claude_ai_Supabase__list_migrations` and confirm `20260828210000` appears, then a read query (`mcp__claude_ai_Supabase__execute_sql` with `select count(*) from programs;`) returns `4`.

- [x] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/20260828210000_programs.sql
git commit -m "Add the programs table and a nullable draw_rounds.program_code column"
```

---

### Task 6: Pure backfill planner

**Files:**
- Create: `packages/ingester/src/backfillPrograms.ts`
- Test: `packages/ingester/test/backfillPrograms.test.ts`

**Interfaces:**
- Consumes: `classifyRound` from Task 1.
- Produces: `planProgramCodeBackfill(rows: BackfillRow[]): BackfillPlan`, where `BackfillRow = { round_number: string; raw: Json }` and `BackfillPlan = { updates: { round_number: string; program_code: string }[]; skipped: { round_number: string; reason: string }[] }`. Task 7's orchestration and Task 8's verification both read `BackfillPlan`.

- [x] **Step 1: Write the failing test**

Create `packages/ingester/test/backfillPrograms.test.ts`:

```ts
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
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @maple/ingester exec vitest run test/backfillPrograms.test.ts`
Expected: FAIL — `src/backfillPrograms.ts` does not exist yet.

- [x] **Step 3: Implement**

Create `packages/ingester/src/backfillPrograms.ts`:

```ts
/**
 * Backfill program_code on existing draw_rounds from their own stored raw
 * payload. A one-off, run once after 20260828210000_programs.sql lands and
 * before its follow-up not-null constraint. Never re-fetches: every row's
 * raw.drawName is already in the database, so classifyRound can re-derive the
 * program without touching canada.ca. See ARCHITECTURE.md section 11.
 */
import { z } from 'zod';
import { classifyRound } from './categories.ts';
import type { Json } from './database.types.ts';

export type BackfillRow = { round_number: string; raw: Json };

export type BackfillPlan = {
  updates: { round_number: string; program_code: string }[];
  skipped: { round_number: string; reason: string }[];
};

const rawDrawName = z.object({ drawName: z.string() });

/**
 * Pure: takes rows that need a program_code and returns what to write. A row
 * skips rather than throws when its raw payload does not classify as a
 * program - that would mean the row was misclassified before this feature
 * existed, and it needs a human, not a silent write.
 */
export function planProgramCodeBackfill(rows: readonly BackfillRow[]): BackfillPlan {
  const updates: BackfillPlan['updates'] = [];
  const skipped: BackfillPlan['skipped'] = [];

  for (const row of rows) {
    const parsed = rawDrawName.safeParse(row.raw);
    if (!parsed.success) {
      skipped.push({ round_number: row.round_number, reason: 'raw payload has no drawName' });
      continue;
    }
    const classification = classifyRound(parsed.data.drawName);
    if (classification === null || classification.programCode === null) {
      skipped.push({
        round_number: row.round_number,
        reason: `drawName ${JSON.stringify(parsed.data.drawName)} did not classify to a program`,
      });
      continue;
    }
    updates.push({ round_number: row.round_number, program_code: classification.programCode });
  }

  return { updates, skipped };
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @maple/ingester exec vitest run test/backfillPrograms.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ingester/src/backfillPrograms.ts packages/ingester/test/backfillPrograms.test.ts
git commit -m "Add the pure planner for the program_code backfill"
```

---

### Task 7: Backfill I/O, orchestration, and entrypoint

**Files:**
- Modify: `packages/ingester/src/store.ts`
- Test: `packages/ingester/test/store.test.ts`
- Create: `packages/ingester/src/runBackfillPrograms.ts`
- Create: `packages/ingester/bin/backfill-program-codes.ts`
- Modify: `packages/ingester/package.json`

**Interfaces:**
- Consumes: `BackfillRow`, `planProgramCodeBackfill` from Task 6.
- Produces: `loadProgramRoundsMissingCode(store): Promise<BackfillRow[]>`, `writeProgramCodeBackfill(store, updates): Promise<number>` in `store.ts`; `runProgramCodeBackfill(store): Promise<{ updated: number; skipped: number }>` in `runBackfillPrograms.ts`. Task 8 runs the compiled entrypoint against the live database.

- [x] **Step 1: Write the failing tests**

In `packages/ingester/test/store.test.ts`, add `'is'` to the recorded method list in `fakeStore` (line 33):

```ts
  for (const method of ['insert', 'update', 'select', 'eq', 'is', 'order', 'limit', 'upsert', 'single']) {
```

Add two new `describe` blocks after the `closeRun` block (after line 204):

```ts
describe('loadProgramRoundsMissingCode', () => {
  it('selects program rounds with no program code yet', async () => {
    const { store, calls } = fakeStore({
      data: [{ round_number: '436', raw: { drawName: 'Canadian Experience Class' } }],
      error: null,
    });
    const rows = await loadProgramRoundsMissingCode(store);

    expect(rows).toEqual([{ round_number: '436', raw: { drawName: 'Canadian Experience Class' } }]);
    const select = calls.find((call) => call.method === 'select');
    expect(select?.table).toBe('draw_rounds');
    expect(select?.args).toEqual(['round_number, raw']);
    expect(calls.find((call) => call.method === 'eq')?.args).toEqual(['round_type', 'program']);
    expect(calls.find((call) => call.method === 'is')?.args).toEqual(['program_code', null]);
  });
});

describe('writeProgramCodeBackfill', () => {
  it('writes program codes in one batched upsert, keyed on round_number', async () => {
    const { store, calls } = fakeStore({ data: [{ round_number: '436' }], error: null });
    const written = await writeProgramCodeBackfill(store, [
      { round_number: '436', program_code: 'cec' },
      { round_number: '435', program_code: 'pnp' },
    ]);

    expect(written).toBe(2);
    const upsert = calls.find((call) => call.method === 'upsert');
    expect(upsert?.table).toBe('draw_rounds');
    expect(upsert?.args[1]).toEqual({ onConflict: 'round_number' });
    expect(upsert?.args[0]).toEqual([
      { round_number: '436', program_code: 'cec' },
      { round_number: '435', program_code: 'pnp' },
    ]);
  });

  it('writes nothing for an empty batch', async () => {
    const { store, calls } = fakeStore({ data: [], error: null });
    expect(await writeProgramCodeBackfill(store, [])).toBe(0);
    expect(calls).toEqual([]);
  });
});
```

Update the import line at the top of the file (line 15) to include the two new functions:

```ts
import {
  closeRun, latestSnapshotHash, loadConfig, loadProgramRoundsMissingCode,
  quarantine, upsertRounds, writeProgramCodeBackfill,
} from '../src/store.ts';
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @maple/ingester exec vitest run test/store.test.ts`
Expected: FAIL — `loadProgramRoundsMissingCode` and `writeProgramCodeBackfill` don't exist yet.

- [x] **Step 3: Implement `store.ts`**

Add to `packages/ingester/src/store.ts`, after `upsertRounds` (after line 135):

```ts
import type { BackfillRow } from './backfillPrograms.ts';

/** Program rounds that still need a program_code, for the one-off backfill. */
export async function loadProgramRoundsMissingCode(store: Store): Promise<BackfillRow[]> {
  const rows = must(
    await store.from('draw_rounds').select('round_number, raw')
      .eq('round_type', 'program').is('program_code', null),
    'read program rounds missing a program code',
  );
  return rows;
}

/** One call for the whole batch, same shape as upsertRounds. */
export async function writeProgramCodeBackfill(
  store: Store,
  updates: readonly { round_number: string; program_code: string }[],
): Promise<number> {
  if (updates.length === 0) return 0;
  must(
    await store.from('draw_rounds').upsert([...updates], { onConflict: 'round_number' }).select('round_number'),
    'write program code backfill',
  );
  return updates.length;
}
```

Place the `import type { BackfillRow } from './backfillPrograms.ts';` line with the other imports at the top of the file instead of inline — add it next to the existing `import type { CandidateRound } from './parse.ts';` line (line 16).

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @maple/ingester exec vitest run test/store.test.ts`
Expected: PASS

- [x] **Step 5: Add the orchestration and entrypoint (no new test — this is thin wiring over already-tested pieces, matching how `bin/ingest.ts` has none either)**

Create `packages/ingester/src/runBackfillPrograms.ts`:

```ts
/**
 * Orchestrates the one-off program_code backfill: read, derive, write, log.
 */
import { logEvent } from './log.ts';
import { loadProgramRoundsMissingCode, writeProgramCodeBackfill } from './store.ts';
import type { Store } from './store.ts';
import { planProgramCodeBackfill } from './backfillPrograms.ts';

export type BackfillResult = { updated: number; skipped: number };

export async function runProgramCodeBackfill(store: Store): Promise<BackfillResult> {
  const rows = await loadProgramRoundsMissingCode(store);
  const { updates, skipped } = planProgramCodeBackfill(rows);

  for (const skip of skipped) {
    logEvent('backfill.program_code.skipped', null, { roundNumber: skip.round_number, reason: skip.reason });
  }

  const updated = await writeProgramCodeBackfill(store, updates);
  logEvent('backfill.program_code.finished', null, { rowsSeen: rows.length, updated, skipped: skipped.length });
  return { updated, skipped: skipped.length };
}
```

Create `packages/ingester/bin/backfill-program-codes.ts`:

```ts
/**
 * Entrypoint for the one-off program_code backfill. Thin on purpose.
 */
import { logEvent } from '../src/log.ts';
import { createStore, loadConfig } from '../src/store.ts';
import { runProgramCodeBackfill } from '../src/runBackfillPrograms.ts';

try {
  const config = loadConfig(process.env);
  const store = createStore(config);
  const result = await runProgramCodeBackfill(store);
  logEvent('backfill.program_code.done', null, result);
  // A skip means a row needs a human, not a silent partial success.
  process.exit(result.skipped > 0 ? 1 : 0);
} catch (error) {
  logEvent('backfill.program_code.crashed', null, { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
}
```

Add a script to `packages/ingester/package.json`, next to `"ingest"`:

```json
    "backfill:program-codes": "node --env-file-if-exists=../../.env bin/backfill-program-codes.ts"
```

- [x] **Step 6: Typecheck**

Run: `pnpm --filter @maple/ingester run typecheck`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add packages/ingester/src/store.ts packages/ingester/test/store.test.ts packages/ingester/src/runBackfillPrograms.ts packages/ingester/bin/backfill-program-codes.ts packages/ingester/package.json
git commit -m "Add the program_code backfill's I/O, orchestration, and entrypoint"
```

---

### Task 8: Run the backfill, verify it, and lock the column down

This task performs real writes against the live `maple-tracker` database. Confirm with the user before running Step 1 if anything about Tasks 1–7 changed since they approved "finish it fully."

**Files:**
- Create: `supabase/migrations/20260829220000_programs_not_null.sql`

- [x] **Step 1: Run the backfill against the live database**

```bash
pnpm --filter @maple/ingester run backfill:program-codes
```

Expected: exit code 0, and a `backfill.program_code.finished` log line with `skipped: 0`. If `skipped` is greater than 0, stop — those rows have a `drawName` that doesn't classify as a program, which means either a bad historical row or a gap in `classifyRound`, and either needs a human before the constraint in Step 3 can be added safely.

- [x] **Step 2: Verify zero remaining nulls**

Use `mcp__claude_ai_Supabase__execute_sql` against the `maple-tracker` project:

```sql
select count(*) from draw_rounds where round_type = 'program' and program_code is null;
```

Expected: `0`.

- [x] **Step 3: Write the follow-up constraint migration**

Create `supabase/migrations/20260829220000_programs_not_null.sql`:

```sql
-- Tie program_code to round_type now that every program round carries one.
--
-- 20260828210000_programs.sql deliberately left this out: 186 existing program
-- rounds were null until packages/ingester/bin/backfill-program-codes.ts
-- re-derived them from each round's own stored raw.drawName, without
-- re-fetching canada.ca. A constraint added before that ran would have
-- rejected the table it was meant to protect. The backfill has run and
-- verified zero remaining nulls.
--
-- Mirrors category_iff_category_round in 20260823090100_core_schema.sql.

alter table draw_rounds add constraint program_iff_program_round check (
  (round_type = 'program' and program_code is not null) or
  (round_type in ('general','category') and program_code is null)
);
```

- [x] **Step 4: Apply it to the live database**

Use `mcp__claude_ai_Supabase__apply_migration` with `name: "programs_not_null"` and the query above.

- [x] **Step 5: Verify it's enforced**

Use `mcp__claude_ai_Supabase__execute_sql`:

```sql
select conname from pg_constraint where conname = 'program_iff_program_round';
```

Expected: one row.

- [x] **Step 6: Commit**

```bash
git add supabase/migrations/20260829220000_programs_not_null.sql
git commit -m "Tie program_code to round_type once every program round carries one"
```

---

### Task 9: Web client reads `program_code` and the `programs` table

**Files:**
- Modify: `apps/web/src/rows.ts`
- Modify: `apps/web/src/queries.ts`

**Interfaces:**
- Produces: `DrawRound.program_code: string | null`; `Program = { code: string; label: string }` and `programSchema`; `fetchPrograms(client): Promise<Program[]>`. Tasks 10–11 consume all three.

- [x] **Step 1: Implement `rows.ts`**

In `apps/web/src/rows.ts`, add `program_code` to `drawRoundSchema` (after line 28):

```ts
export const drawRoundSchema = z.object({
  round_number: z.string(),
  drawn_at: z.string(),
  round_type: z.enum(roundTypes),
  category_code: z.string().nullable(),
  program_code: z.string().nullable(),
  cutoff_crs: z.number().int(),
  invitations: z.number().int(),
  tie_break_at: z.string().nullable(),
  source_url: z.string(),
});
```

Add a `Program` schema and type after `Category` (after line 42):

```ts
export const programSchema = z.object({
  code: z.string(),
  label: z.string(),
});

export type Program = z.infer<typeof programSchema>;
```

- [x] **Step 2: Implement `queries.ts`**

In `apps/web/src/queries.ts`, add `program_code` to `ROUND_COLUMNS` (line 13):

```ts
const ROUND_COLUMNS =
  'round_number, drawn_at, round_type, category_code, program_code, cutoff_crs, invitations, tie_break_at, source_url';
```

Update the import line (line 8) to add `Program` and `programSchema`:

```ts
import { categorySchema, drawRoundSchema, programSchema } from './rows.ts';
import type { Category, DrawRound, Program } from './rows.ts';
```

Add `fetchPrograms`, next to `fetchCategories` (after line 49):

```ts
export async function fetchPrograms(client: ReadClient): Promise<Program[]> {
  const rows = must(await client.from('programs').select('code, label'), 'read programs');
  return z.array(programSchema).parse(rows);
}
```

- [x] **Step 3: Typecheck**

Run: `pnpm --filter @maple/web run typecheck`
Expected: PASS (no behavior changed yet — nothing calls `fetchPrograms` or reads `program_code` until Task 10, so nothing to test here beyond the type checking that the new schema and column select are well-formed).

- [x] **Step 4: Commit**

```bash
git add apps/web/src/rows.ts apps/web/src/queries.ts
git commit -m "Read program_code and the programs table from the database"
```

---

### Task 10: Split the cut-off ladder by program

**Files:**
- Modify: `apps/web/src/ladder.ts`
- Test: `apps/web/test/ladder.test.ts`
- Modify: `apps/web/app/categories/page.tsx`

**Interfaces:**
- Consumes: `Program`, `fetchPrograms` from Task 9.
- Produces: `buildLadder(rounds, categories, programs)` — third parameter added. `streamKey` now falls back to `program_code` before `round_type`.

- [x] **Step 1: Write the failing tests**

Rewrite `apps/web/test/ladder.test.ts` in full:

```ts
import { describe, expect, it } from 'vitest';
import { buildLadder, streamKey } from '../src/ladder.ts';
import type { Category, DrawRound, Program } from '../src/rows.ts';

function round(overrides: Partial<DrawRound> & Pick<DrawRound, 'round_number' | 'drawn_at'>): DrawRound {
  return {
    round_type: 'category',
    category_code: 'french',
    program_code: null,
    cutoff_crs: 400,
    invitations: 5000,
    tie_break_at: null,
    source_url: 'https://www.canada.ca/example',
    ...overrides,
  };
}

const categories: Category[] = [
  { code: 'french', label: 'French-language proficiency' },
  { code: 'trades', label: 'Trades occupations' },
];

const programs: Program[] = [
  { code: 'cec', label: 'Canadian Experience Class' },
  { code: 'pnp', label: 'Provincial Nominee Program' },
];

describe('streamKey', () => {
  it('uses the category when a round has one', () => {
    expect(streamKey(round({ round_number: '1', drawn_at: '2026-01-01T00:00:00Z' }))).toBe('french');
  });

  it('uses the program code when a round has one and no category', () => {
    const programRound = round({
      round_number: '2',
      drawn_at: '2026-01-01T00:00:00Z',
      round_type: 'program',
      category_code: null,
      program_code: 'cec',
    });
    expect(streamKey(programRound)).toBe('cec');
  });

  it('falls back to the round type when neither a category nor a program code is known', () => {
    const programRound = round({
      round_number: '3',
      drawn_at: '2026-01-01T00:00:00Z',
      round_type: 'program',
      category_code: null,
      program_code: null,
    });
    expect(streamKey(programRound)).toBe('program');
  });
});

describe('buildLadder', () => {
  it('keeps uncategorised rounds instead of dropping them', () => {
    const ladder = buildLadder(
      [
        round({ round_number: '437', drawn_at: '2026-08-19T12:35:37Z' }),
        round({
          round_number: '436',
          drawn_at: '2026-08-18T10:13:44Z',
          round_type: 'program',
          category_code: null,
          program_code: null,
          cutoff_crs: 523,
        }),
      ],
      categories,
      [],
    );
    expect(ladder.map((entry) => entry.key)).toStrictEqual(['french', 'program']);
    expect(ladder[1]?.label).toBe('Program-specific (uncategorised)');
  });

  it('computes movement against the previous round of the same stream', () => {
    const ladder = buildLadder(
      [
        round({ round_number: '437', drawn_at: '2026-08-19T12:35:37Z', cutoff_crs: 382 }),
        round({ round_number: '433', drawn_at: '2026-08-06T11:29:10Z', cutoff_crs: 391 }),
      ],
      categories,
      [],
    );
    expect(ladder[0]?.change).toBe(-9);
    expect(ladder[0]?.previous?.round_number).toBe('433');
    expect(ladder[0]?.roundCount).toBe(2);
  });

  it('reports no movement for a stream with a single round', () => {
    const ladder = buildLadder([round({ round_number: '1', drawn_at: '2026-07-23T10:19:47Z' })], categories, []);
    expect(ladder[0]?.change).toBeNull();
    expect(ladder[0]?.previous).toBeNull();
  });

  it('sorts unsorted input rather than trusting the caller', () => {
    const ladder = buildLadder(
      [
        round({ round_number: 'old', drawn_at: '2025-01-01T00:00:00Z', cutoff_crs: 500 }),
        round({ round_number: 'new', drawn_at: '2026-08-19T12:35:37Z', cutoff_crs: 382 }),
        round({ round_number: 'mid', drawn_at: '2026-01-01T00:00:00Z', cutoff_crs: 450 }),
      ],
      categories,
      [],
    );
    expect(ladder[0]?.latest.round_number).toBe('new');
    expect(ladder[0]?.previous?.round_number).toBe('mid');
  });

  it('orders streams by their most recent round', () => {
    const ladder = buildLadder(
      [
        round({ round_number: 'a', drawn_at: '2024-02-16T15:18:05Z', category_code: 'trades' }),
        round({ round_number: 'b', drawn_at: '2026-08-19T12:35:37Z', category_code: 'french' }),
      ],
      categories,
      [],
    );
    expect(ladder.map((entry) => entry.key)).toStrictEqual(['french', 'trades']);
  });

  it('renders an unseeded category code as itself rather than inventing a label', () => {
    const ladder = buildLadder(
      [round({ round_number: '1', drawn_at: '2026-08-19T12:35:37Z', category_code: 'brand-new-stream' })],
      categories,
      [],
    );
    expect(ladder[0]?.label).toBe('brand-new-stream');
  });

  it('returns nothing for no rounds', () => {
    expect(buildLadder([], categories, [])).toStrictEqual([]);
  });

  it('does not confuse 91a and 91b, which parseInt would collapse', () => {
    const ladder = buildLadder(
      [
        round({ round_number: '91a', drawn_at: '2019-02-20T00:00:00Z', cutoff_crs: 457 }),
        round({ round_number: '91b', drawn_at: '2019-02-20T01:00:00Z', cutoff_crs: 332 }),
      ],
      categories,
      [],
    );
    expect(ladder[0]?.roundCount).toBe(2);
    expect(ladder[0]?.latest.round_number).toBe('91b');
  });
});

describe('program streams split by program code', () => {
  // Round 436 was a Canadian Experience Class draw at 523 and round 435 a
  // Provincial Nominee Program draw at 760 - both round_type 'program', now
  // carrying distinct program_code values. They must land in separate,
  // comparable streams rather than being differenced against each other.
  const rounds: DrawRound[] = [
    round({
      round_number: '436',
      drawn_at: '2026-08-18T10:13:44Z',
      round_type: 'program',
      category_code: null,
      program_code: 'cec',
      cutoff_crs: 523,
    }),
    round({
      round_number: '435',
      drawn_at: '2026-08-17T12:33:42Z',
      round_type: 'program',
      category_code: null,
      program_code: 'pnp',
      cutoff_crs: 760,
    }),
  ];

  it('keeps each program as its own comparable stream', () => {
    const ladder = buildLadder(rounds, categories, programs);
    expect(ladder.map((entry) => entry.key)).toStrictEqual(['cec', 'pnp']);
    expect(ladder.every((entry) => entry.comparable)).toBe(true);
  });

  it('labels each program stream from the programs table', () => {
    const ladder = buildLadder(rounds, categories, programs);
    expect(ladder.find((entry) => entry.key === 'cec')?.label).toBe('Canadian Experience Class');
    expect(ladder.find((entry) => entry.key === 'pnp')?.label).toBe('Provincial Nominee Program');
  });

  it('computes real movement within one program across two of its rounds', () => {
    const ladder = buildLadder(
      [
        ...rounds,
        round({
          round_number: '297',
          drawn_at: '2026-06-01T00:00:00Z',
          round_type: 'program',
          category_code: null,
          program_code: 'cec',
          cutoff_crs: 500,
        }),
      ],
      categories,
      programs,
    );
    const cec = ladder.find((entry) => entry.key === 'cec');
    expect(cec?.change).toBe(23);
    expect(cec?.comparable).toBe(true);
  });
});

describe('program rounds without a program code yet', () => {
  it('falls back to the generic, non-comparable program bucket', () => {
    const rounds: DrawRound[] = [
      round({
        round_number: '1', drawn_at: '2026-08-18T10:13:44Z',
        round_type: 'program', category_code: null, program_code: null, cutoff_crs: 523,
      }),
      round({
        round_number: '2', drawn_at: '2026-08-17T12:33:42Z',
        round_type: 'program', category_code: null, program_code: null, cutoff_crs: 760,
      }),
    ];
    const entry = buildLadder(rounds, categories, [])[0];
    expect(entry?.key).toBe('program');
    expect(entry?.comparable).toBe(false);
    expect(entry?.change).toBeNull();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @maple/web exec vitest run test/ladder.test.ts`
Expected: FAIL — `buildLadder` doesn't accept a third argument yet, and `streamKey` doesn't fall back to `program_code`.

- [x] **Step 3: Implement `ladder.ts`**

Replace `apps/web/src/ladder.ts` in full:

```ts
/**
 * The cut-off ladder: where each stream's line currently sits, and which way it
 * last moved.
 *
 * A "stream" is the category when a round has one, the program when it names
 * one, and the round type when it has neither. Keying the ladder on categories
 * alone was the obvious reading of ARCHITECTURE.md section 9 and it is wrong:
 * 186 program rounds and 178 general rounds carry no category_code at all, and
 * the most recent program round is newer than eight of the ten categories. A
 * ladder that omitted it would hide the largest group of draws from the page
 * whose job is to show the lines.
 */
import type { Category, DrawRound, Program } from './rows.ts';

export type LadderEntry = {
  key: string;
  label: string;
  latest: DrawRound;
  previous: DrawRound | null;
  /** Points the cut-off moved since the previous round of this stream, where that means anything. */
  change: number | null;
  /** False where consecutive rounds are not like for like. See HETEROGENEOUS_STREAMS. */
  comparable: boolean;
  roundCount: number;
};

/**
 * A round not yet carrying a program_code falls back to the generic 'program'
 * bucket, which mixes programs whose cut-offs are not on the same scale (a
 * provincial nomination is worth 600 points by itself). That bucket is empty
 * once the ingester backfill and its not-null constraint (see
 * supabase/migrations/20260829220000_programs_not_null.sql) have run; this
 * stays as the honest fallback rather than an assumption that they always
 * have.
 */
const HETEROGENEOUS_STREAMS = new Set(['program']);

export function streamKey(round: DrawRound): string {
  return round.category_code ?? round.program_code ?? round.round_type;
}

const UNCATEGORISED_LABELS: Record<string, string> = {
  general: 'General (all programs)',
  program: 'Program-specific (uncategorised)',
};

/**
 * An unknown code renders as itself rather than as a guess. Categories and
 * programs both get added by IRCC faster than seeds do, and inventing a label
 * would be inventing a fact.
 */
function labelFor(key: string, streamLabels: ReadonlyMap<string, string>): string {
  return streamLabels.get(key) ?? UNCATEGORISED_LABELS[key] ?? key;
}

function byDrawnAtDescending(a: DrawRound, b: DrawRound): number {
  return b.drawn_at.localeCompare(a.drawn_at);
}

function groupByStream(rounds: readonly DrawRound[]): Map<string, DrawRound[]> {
  const groups = new Map<string, DrawRound[]>();
  for (const round of rounds) {
    const key = streamKey(round);
    const existing = groups.get(key);
    if (existing === undefined) groups.set(key, [round]);
    else existing.push(round);
  }
  return groups;
}

/**
 * Newest stream first. Sorts defensively rather than trusting the caller's
 * order, so a fixture does not have to be pre-sorted to be a fair test.
 */
export function buildLadder(
  rounds: readonly DrawRound[],
  categories: readonly Category[],
  programs: readonly Program[],
): LadderEntry[] {
  const streamLabels = new Map<string, string>([
    ...categories.map((category) => [category.code, category.label] as const),
    ...programs.map((program) => [program.code, program.label] as const),
  ]);
  const entries: LadderEntry[] = [];

  for (const [key, group] of groupByStream(rounds)) {
    const sorted = [...group].sort(byDrawnAtDescending);
    const latest = sorted[0];
    if (latest === undefined) continue;
    const previous = sorted[1] ?? null;
    const comparable = !HETEROGENEOUS_STREAMS.has(key);
    entries.push({
      key,
      label: labelFor(key, streamLabels),
      latest,
      previous,
      change: previous === null || !comparable ? null : latest.cutoff_crs - previous.cutoff_crs,
      comparable,
      roundCount: sorted.length,
    });
  }

  return entries.sort((a, b) => byDrawnAtDescending(a.latest, b.latest));
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @maple/web exec vitest run test/ladder.test.ts`
Expected: PASS

- [x] **Step 5: Update the categories page**

Replace `apps/web/app/categories/page.tsx` in full:

```tsx
import { formatChange, formatDate, formatInteger } from '../../src/format.ts';
import { buildLadder } from '../../src/ladder.ts';
import { fetchCategories, fetchPrograms, fetchRounds } from '../../src/queries.ts';
import { createReadClient } from '../../src/supabase.ts';
import styles from '../ui.module.css';

export const revalidate = 900;

export const metadata = {
  title: 'Cut-off ladder — Maple Tracker',
};

function changeClass(change: number | null): string | undefined {
  if (change === null || change === 0) return undefined;
  return change > 0 ? styles.rise : styles.fall;
}

function changeCell(entry: { comparable: boolean; change: number | null }): string {
  return entry.comparable ? formatChange(entry.change) : 'not comparable';
}

export default async function CategoriesPage() {
  const client = createReadClient();
  const [rounds, categories, programs] = await Promise.all([
    fetchRounds(client),
    fetchCategories(client),
    fetchPrograms(client),
  ]);
  const ladder = buildLadder(rounds, categories, programs);

  return (
    <>
      <h1>Cut-off ladder</h1>
      <p className={styles.lede}>
        Where each stream&rsquo;s line last landed, most recently drawn first. Movement compares a
        stream&rsquo;s latest round against its own previous round, never against another stream
        &mdash; a category cut-off and a program cut-off are not comparable numbers. Streams that
        have not been drawn in a long time still appear, with the date they last ran.
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Stream</th>
              <th scope="col" className={styles.numeric}>Latest cut-off</th>
              <th scope="col" className={styles.numeric}>Movement</th>
              <th scope="col">Last drawn (UTC)</th>
              <th scope="col" className={styles.numeric}>Invitations</th>
              <th scope="col" className={styles.numeric}>Rounds</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {ladder.map((entry) => (
              <tr key={entry.key}>
                <th scope="row">{entry.label}</th>
                <td className={styles.numeric}>{formatInteger(entry.latest.cutoff_crs)}</td>
                <td className={`${styles.numeric} ${changeClass(entry.change) ?? styles.muted}`}>
                  {changeCell(entry)}
                </td>
                <td>{formatDate(entry.latest.drawn_at)}</td>
                <td className={styles.numeric}>{formatInteger(entry.latest.invitations)}</td>
                <td className={styles.numeric}>{formatInteger(entry.roundCount)}</td>
                <td>
                  <a href={entry.latest.source_url}>Round {entry.latest.round_number}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

(This drops the second `<p>` about program movement being suppressed — it's no longer generally true once programs are split. The first paragraph, about within-stream comparison, still holds.)

- [x] **Step 6: Typecheck**

Run: `pnpm --filter @maple/web run typecheck`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add apps/web/src/ladder.ts apps/web/test/ladder.test.ts apps/web/app/categories/page.tsx
git commit -m "Split program-specific rounds into their own comparable ladder streams"
```

---

### Task 11: Name the program on the latest-draw card and the full round history

**Files:**
- Modify: `apps/web/src/format.ts`
- Test: `apps/web/test/format.test.ts`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/RoundsTable.tsx`

This closes the same gap Task 10 closed on `/categories`, on the two other views that show a round's stream: the latest-draw card on `/` and the full history table on `/rounds`. `describeRoundType` already accepts any label string, so nothing in it changes — only its callers, which currently only ever look up a category label.

**Interfaces:**
- Consumes: `Program`, `fetchPrograms` from Task 9.

- [x] **Step 1: Write the failing test**

In `apps/web/test/format.test.ts`, add a test to the `describeRoundType` block (after line 87):

```ts
  it('renders a program label the same way it renders a category label', () => {
    expect(describeRoundType('program', 'Canadian Experience Class')).toBe('Canadian Experience Class');
  });
```

- [x] **Step 2: Run the test to verify it passes already**

Run: `pnpm --filter @maple/web exec vitest run test/format.test.ts`
Expected: PASS — `describeRoundType`'s signature already takes any nullable label string; this test documents that a program label works the same way a category label does. No implementation change needed in `format.ts`.

- [x] **Step 3: Implement `page.tsx`**

Replace `apps/web/app/page.tsx` in full:

```tsx
import { describeRoundType, formatDate, formatDateTime, formatInteger } from '../src/format.ts';
import { fetchCategories, fetchPrograms, fetchRounds } from '../src/queries.ts';
import { createReadClient } from '../src/supabase.ts';
import { RoundsTable } from './RoundsTable.tsx';
import styles from './ui.module.css';

export const revalidate = 900;

const RECENT_COUNT = 12;

export default async function LatestPage() {
  const client = createReadClient();
  const [rounds, categories, programs] = await Promise.all([
    fetchRounds(client),
    fetchCategories(client),
    fetchPrograms(client),
  ]);
  const categoryLabels = new Map(categories.map((category) => [category.code, category.label]));
  const programLabels = new Map(programs.map((program) => [program.code, program.label]));
  const latest = rounds[0];

  if (latest === undefined) {
    return <p>No rounds have been ingested yet.</p>;
  }

  const streamLabel =
    latest.category_code !== null
      ? categoryLabels.get(latest.category_code) ?? latest.category_code
      : latest.program_code !== null
        ? programLabels.get(latest.program_code) ?? latest.program_code
        : null;

  return (
    <>
      <h1>Latest round</h1>
      <p className={styles.lede}>
        Express Entry rounds of invitations, as published by IRCC. {formatInteger(rounds.length)} rounds
        recorded.
      </p>

      <section className={styles.card} aria-labelledby="latest-heading">
        <h2 id="latest-heading">
          Round {latest.round_number} &middot; {describeRoundType(latest.round_type, streamLabel)}
        </h2>
        <div className={styles.headline}>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{formatInteger(latest.cutoff_crs)}</span>
            <span className={styles.metricLabel}>Cut-off CRS</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{formatInteger(latest.invitations)}</span>
            <span className={styles.metricLabel}>Invitations</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{formatDate(latest.drawn_at)}</span>
            <span className={styles.metricLabel}>Drawn (UTC)</span>
          </div>
        </div>
        <p className={styles.muted}>
          {latest.tie_break_at === null
            ? 'No tie-break timestamp published for this round.'
            : `Tie-break: ${formatDateTime(latest.tie_break_at)}. Candidates at the cut-off score were invited only if their profile was submitted before this time.`}
        </p>
        <p>
          <a href={latest.source_url}>Read this round on IRCC&rsquo;s site</a>
        </p>
      </section>

      <h2>Recent rounds</h2>
      <RoundsTable rounds={rounds.slice(0, RECENT_COUNT)} categoryLabels={categoryLabels} programLabels={programLabels} />
    </>
  );
}
```

- [x] **Step 4: Implement `RoundsTable.tsx`**

Replace `apps/web/app/RoundsTable.tsx` in full:

```tsx
import { describeRoundType, formatDate, formatDateTime, formatInteger } from '../src/format.ts';
import type { DrawRound } from '../src/rows.ts';
import styles from './ui.module.css';

/**
 * Used by both the latest-draw page and the full history. Two callers of one
 * table is composition, not the speculative abstraction CLAUDE.md warns about -
 * the alternative is the same thirty lines of markup written twice.
 *
 * Every row carries its source link. ARCHITECTURE.md section 7: a number
 * without provenance does not render.
 */
export function RoundsTable({
  rounds,
  categoryLabels,
  programLabels,
}: {
  rounds: readonly DrawRound[];
  categoryLabels: ReadonlyMap<string, string>;
  programLabels: ReadonlyMap<string, string>;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Round</th>
            <th scope="col">Drawn (UTC)</th>
            <th scope="col">Stream</th>
            <th scope="col" className={styles.numeric}>Cut-off CRS</th>
            <th scope="col" className={styles.numeric}>Invitations</th>
            <th scope="col">Tie-break (UTC)</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((round) => {
            const label =
              round.category_code !== null
                ? categoryLabels.get(round.category_code) ?? round.category_code
                : round.program_code !== null
                  ? programLabels.get(round.program_code) ?? round.program_code
                  : null;
            return (
              <tr key={round.round_number}>
                <td>{round.round_number}</td>
                <td>{formatDate(round.drawn_at)}</td>
                <td>{describeRoundType(round.round_type, label)}</td>
                <td className={styles.numeric}>{formatInteger(round.cutoff_crs)}</td>
                <td className={styles.numeric}>{formatInteger(round.invitations)}</td>
                <td className={styles.muted}>
                  {round.tie_break_at === null ? '—' : formatDateTime(round.tie_break_at)}
                </td>
                <td>
                  <a href={round.source_url}>IRCC</a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [x] **Step 5: Update `/rounds`, the other caller of `RoundsTable`**

Replace `apps/web/app/rounds/page.tsx` in full:

```tsx
import { formatDate, formatInteger } from '../../src/format.ts';
import { fetchCategories, fetchPrograms, fetchRounds } from '../../src/queries.ts';
import { createReadClient } from '../../src/supabase.ts';
import { RoundsTable } from '../RoundsTable.tsx';
import styles from '../ui.module.css';

export const revalidate = 900;

export const metadata = {
  title: 'Round history — Maple Tracker',
};

export default async function RoundsPage() {
  const client = createReadClient();
  const [rounds, categories, programs] = await Promise.all([
    fetchRounds(client),
    fetchCategories(client),
    fetchPrograms(client),
  ]);
  const categoryLabels = new Map(categories.map((category) => [category.code, category.label]));
  const programLabels = new Map(programs.map((program) => [program.code, program.label]));
  const oldest = rounds.at(-1);

  return (
    <>
      <h1>Round history</h1>
      <p className={styles.lede}>
        Every round of invitations IRCC has published
        {oldest === undefined ? '' : `, back to ${formatDate(oldest.drawn_at)}`}.{' '}
        {formatInteger(rounds.length)} rounds, newest first. Ordered by draw date rather than round
        number, because IRCC has published rounds numbered 91a and 91b.
      </p>
      <RoundsTable rounds={rounds} categoryLabels={categoryLabels} programLabels={programLabels} />
    </>
  );
}
```

- [x] **Step 6: Typecheck and run the web test suite**

Run: `pnpm --filter @maple/web run typecheck && pnpm --filter @maple/web exec vitest run`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add apps/web/test/format.test.ts apps/web/app/page.tsx apps/web/app/RoundsTable.tsx apps/web/app/rounds/page.tsx
git commit -m "Name the specific program on the latest-draw card and round history"
```

---

### Task 12: Full verification

**Files:** none — this task only runs commands.

- [x] **Step 1: Full test suite**

Run: `pnpm test`
Expected: PASS (vitest across both packages, then `pnpm audit`)

- [x] **Step 2: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [x] **Step 3: Build**

Run: `pnpm build`
Expected: PASS

- [x] **Step 4: Manual check in the browser**

Run: `pnpm dev`, open `/categories`, and confirm:
- CEC and PNP (and FST, FSW if either has drawn recently) appear as separate rows with their own labels and their own "Movement" figures, no longer merged under one "Program-specific" row with movement withheld.
- `/` and `/rounds` show the specific program name (e.g. "Canadian Experience Class") in the Stream column for program rounds, not the generic "Program-specific".
- Every row still links to its IRCC source.

Stop the dev server when done.
