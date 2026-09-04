# Step 7 — the what-if panel on `/calculator`

## Context

The calculator tells you your score. `/categories` tells you where the cut-offs
landed. Nothing connects the two: a reader sitting 19 points under the French
cut-off has no way to find out that French is what the 19 points are made of,
short of re-entering the whole form by hand and watching the number move.

This adds a panel under the existing cut-off table showing **the same profile
scored again with one answer changed** — French at CLB 7, one more year of
Canadian work, a higher English result — so the reader can see which inputs the
points actually hang on.

**The line this feature must not cross.** `CLAUDE.md` forbids immigration advice
and cites IRPA s.91 as a legal boundary rather than an editorial preference.
`CutoffGap.tsx` already states the voice: *"state facts, show gaps, link to IRCC
— never a prediction, never a recommendation about anybody's case."* So this
panel does arithmetic and stops. It reports what the rule set produces for a
changed input. It never says a change is advisable, never ranks changes as
"best", never says a change would qualify anyone for anything, and never claims
a change would clear a cut-off. The reader draws their own conclusion from two
tables sitting next to each other.

Decisions the owner made while planning:
- **What-if arithmetic only** — no gap-closing flags, no suggestions.
- **This becomes step 7**, ahead of email alerts. `ARCHITECTURE.md` §9 gets
  amended rather than quietly ignored.
- **All plausible levers**, not a curated few.
- **Provincial nomination is included but pinned last**, never sorted by size,
  carrying a caveat.
- **Age is excluded** — see "What is not a lever".

---

## Before anything else

`pnpm ingest` has not run since 2026-08-29 and the site is showing "Possibly out
of date" on every page. Run it first; it is unrelated to this feature and it is
a live problem.

---

## Design

### Where the logic lives

New pure module **`apps/web/src/whatIf.ts`**, sibling to `gap.ts`.

Not in `packages/crs-rules`: that package is a scoring *interpreter*, and which
levers to show a reader is a product decision, not a scoring rule. Keeping it out
also keeps crs-rules free of anything user-facing. `whatIf.ts` imports `score`
and the `Profile`/`RuleSet` types from `@maple/crs-rules`, which `apps/web` has
been allowed to do since step 4.

### The catalogue is data

```ts
type LeverGroup = 'language' | 'work' | 'education' | 'nomination';

type Lever = {
  key: string;
  group: LeverGroup;
  label: string;
  apply: (profile: Profile) => Profile;
  /** Rendered beside the row where the change needs qualifying. */
  note?: string;
};

export type LeverResult = {
  key: string;
  group: LeverGroup;
  label: string;
  /** Always positive; rows that do not raise the total are dropped. */
  delta: number;
  total: number;
  note?: string;
};

export function leversFor(profile: Profile, ruleSet: RuleSet): LeverResult[];
```

`leversFor` scores the baseline once, then scores `lever.apply(profile)` for each
entry and takes the difference. **No points value is ever written down** — every
number in the panel comes out of `score()`, which is what keeps `CLAUDE.md`'s
"never hardcode a points value" rule true here. It also means section caps and
the skill-transferability grids are handled for free: a lever whose raw worth is
50 but which lands against the core cap shows its real net delta, not its
headline one.

`score()` is pure, synchronous, non-mutating and deterministic (crs-rules tests
prove all four), so ~27 extra calls per render is negligible — `CalculatorForm`
already re-scores on every keystroke with no memoisation, and this changes that
by a constant factor. Do not add `useMemo` up front.

### The levers

| Group | Entries |
|---|---|
| Language | French at CLB 5, 7, 9 (all four abilities); English at CLB 7, 9, 10 |
| Work | Canadian work at 1, 3, 5 years; foreign work at 1, 2, 3 years |
| Education | every level in `educationLevels` above the current one; Canadian study credential at one-or-two-years and three-years-or-more; certificate of qualification |
| Spouse (only when a spouse accompanies and has details) | spouse English CLB 7/9, spouse education levels above current, spouse Canadian work 1/3 years |
| Nomination | provincial nomination — pinned last |

Set a whole language to one CLB across all four abilities rather than enumerating
per-ability combinations: the rule set bands on the *lowest* ability, so uneven
abilities are what a real test produces but not what a useful what-if row is.
Three steps per language, not eleven.

Reuse `EDUCATION_LABELS`, `CANADIAN_EDUCATION_LABELS` and `clbLabel` from
`apps/web/src/profile.ts` for row labels rather than writing new strings.

### What is not a lever

**Age** and **sibling in Canada** are excluded, on one principle: *a lever is
something that is a matter of degree and could be pursued.* A birthday is not,
and neither is having a sibling. Age is additionally forward-looking about the
reader's own case — "you will lose 5 points next year" is exactly the register
IRPA s.91 wording avoids.

An unanswered sibling question is already handled: `score()` emits a warning and
`ScoreBreakdown` renders it under "What is missing".

### Which rows are suppressed

- **`delta <= 0`.** A lever the reader has already met or exceeded produces no
  row. This is what makes "all plausible levers" tractable — a maxed profile
  shows an empty panel rather than 27 rows of zeroes.
- The whole section renders `null` when no rows survive, matching `CutoffGap`'s
  `if (gaps.length === 0) return null`.

Deliberately **not** suppressed: rows on a near-empty profile. If the reader has
answered almost nothing, most levers do move the number, and those rows are
honest arithmetic. `ScoreBreakdown`'s "What is missing" block already tells them
the baseline is low because answers are blank.

### Sorting

Non-pinned rows by `delta` descending within their group; groups in the order
above; **the nomination row always last**, never sorted by size. It is worth 600
points and would otherwise sit at the top of every reader's panel forever, which
reads as "go get a nomination" — advice, and misleading, since a nomination is a
separate competitive application to a province rather than a score adjustment.

Its note, in the register `gap.ts` already uses for the same fact:

> A nomination is granted by a province under its own programme and its own
> criteria. It is not a score adjustment; it is a separate application.

---

## Files

**New — `apps/web/src/whatIf.ts`** (~130 lines, pure, no I/O)
The types above, the `LEVERS` catalogue, and `leversFor`. Header comment states
the IRPA s.91 boundary and the no-hardcoded-points rule, the way `gap.ts` does.

**New — `apps/web/app/calculator/WhatIf.tsx`** (~110 lines, `'use client'`)
Takes `{ profile, ruleSet }`, calls `leversFor` inside (mirroring how `CutoffGap`
takes `total`/`cutoffs` and calls `gapsFor` inside). Renders one table grouped by
lever group: **Change | Points | Score**. Reuses `styles.card`, `styles.tableWrap`,
`styles.table`, `styles.numeric`, `styles.muted`, `styles.hint` and `styles.fall`
(the token `CutoffGap` already uses for "good news from the candidate's point of
view"). Returns `null` when there are no rows.

**Modified — `apps/web/app/calculator/CalculatorForm.tsx`**
Hoist the profile so both consumers share one value, and add the panel below the
cut-off table:

```tsx
const profile = toProfile(form);
const result = score(profile, crsCurrent);
...
<CutoffGap total={result.total} cutoffs={cutoffs} />
<WhatIf profile={profile} ruleSet={crsCurrent} />
```

**Modified — `apps/web/app/ui.module.css`**
One class for the pinned nomination row's separator rule. Nothing else.

**Modified — `ARCHITECTURE.md`**
§9: insert this as step 7, renumber email alerts to 8 and mobile to 9. Add a §7
subsection recording the arithmetic-not-advice boundary for this panel.

**Modified — `CLAUDE.md`**
Current-scope line to step 7; `whatIf.ts` and `WhatIf.tsx` in Layout; a step 7
definition of done; and one line making explicit that a what-if panel is **not**
the "eligibility assessment" that remains out of scope — they are easy to
confuse and the distinction is the legal one.

**Also fold in the outstanding carve-out** from the last code review: `CLAUDE.md`
still says "Timestamps render in UTC and say 'UTC'" while `formatNewsDate` now
renders `America/Toronto`. That disagreement is already logged in `HANDOFF.md`
as a loose end; close it in the same commit rather than leaving it.

---

## Copy

Heading: **The same profile with one answer changed**

Lede:
> Each row is this profile scored again under {ruleSet.label}, with one answer
> different and everything else left as it is. These are arithmetic on IRCC's
> published criteria — not a route through the system, and not a statement about
> anybody's case.

Muted, below:
> Whether any of these is open to you depends on your circumstances, and this
> page cannot know that. [IRCC sets out who qualifies](…).

Reuse the `IRCC_ELIGIBILITY` URL constant already in `CutoffGap.tsx`; lift it to
a shared spot only if a third user appears, per the rule of three.

Note the phrasings deliberately avoided: no "boost", "improve", "maximise",
"best option", "you should", "you could reach", and nothing comparing a changed
total to a cut-off.

---

## Tests — `apps/web/test/whatIf.test.ts` (new)

Follow `test/gap.test.ts`'s factory-and-override style and reuse
`packages/crs-rules/test/fixtures.ts` (`blank`, `clb`, `complete`).

1. **Every delta equals a real re-score.** For each returned row, assert
   `row.delta === score(lever.apply(profile), rules).total - score(profile, rules).total`.
   This is the property that keeps points out of the source.
2. **One hand-verified case.** A concrete profile where the French CLB 7 row's
   delta is checked against a number worked out by hand from the published
   criteria — otherwise test 1 is circular.
3. **Caps are respected.** The `'theoretical maximum, single'` fixture returns an
   **empty** list: every lever is already maxed, nothing can raise 1200.
4. **Only positive deltas.** No row with `delta <= 0`, using a profile that
   already exceeds several levers.
5. **The nomination row is always last**, including when its delta is the
   largest (it always is).
6. **No label leaks an internal input name** — mirror
   `packages/crs-rules/test/explanations.test.ts`: no label or note may contain
   `firstOfficial`, `secondOfficial`, `canadianWorkYears`, `foreignWorkYears`,
   `skillTransfer`, etc., nor `null`/`undefined`/`NaN`.
7. **No row claims to close a gap** — assert no label or note contains
   "cut-off", "qualify", "eligible", "should", or "recommend". A wording test,
   because the wording is the legal boundary.
8. **A blank profile does not throw** and returns rows whose totals are all
   `>= 0`.
9. **Spouse levers appear only when a spouse accompanies** and are absent
   otherwise.

`apps/web/test/boundaries.test.ts` needs no change but must still pass: `WhatIf.tsx`
is a client component and so may not import `supabase`/`queries`/`env`/
`authClient`/`accountQueries`/`newsQueries`, may not call `fetch`, may not touch
browser storage, and **no file may call `console.*` at all**.

---

## Verification

1. `pnpm ingest` — clears the staleness banner (do this first, it is independent).
2. `pnpm test` — 390 existing plus the new file; audit clean.
3. `pnpm typecheck`.
4. `pnpm build`.
5. `pnpm dev`, then on `/calculator`:
   - empty form → panel is absent or rows are honest; "What is missing" still shows.
   - enter the `'theoretical maximum, single'` fixture → **panel disappears entirely**.
   - enter a mid profile with no French → French rows appear with real deltas;
     confirm one delta by hand against IRCC's published criteria.
   - tick an accompanying spouse with details → spouse rows appear.
   - confirm the nomination row is last and carries its note.
   - **Drive the page with `javascript_tool`, not screen coordinates** — clicking
     this form by coordinate is unreliable, and the extension's injected
     `data-has-listeners` attributes make React report a hydration mismatch that
     is not an app bug (both recorded in `HANDOFF.md`).
6. Confirm `/calculator` is still statically prerendered in the build output —
   the panel is client-side and must not make the page dynamic.
7. `git diff` the built client bundle check still holds: no anon key, no profile
   leaving the browser.

---

## Commits

1. `pnpm ingest` run (no code change; note the run in the commit that follows if
   anything about freshness is recorded).
2. `whatIf.ts` plus its tests — pure logic, red then green.
3. `WhatIf.tsx` and the `CalculatorForm` wiring plus the CSS class.
4. Docs: `ARCHITECTURE.md` §9 renumber, `CLAUDE.md` scope/layout/done, and the
   `formatNewsDate` carve-out.
