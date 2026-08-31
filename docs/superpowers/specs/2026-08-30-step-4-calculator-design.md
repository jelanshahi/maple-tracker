# Step 4 — The CRS calculator, client-side

Date: 2026-08-30
Status: built

`ARCHITECTURE.md` §9 step 4: *"Calculator. Rules package wired into the web app,
client-side, still no accounts."*

Step 3 shipped a site that reads `draw_rounds`. `packages/crs-rules` has been
finished and tested since step 2, and until this step nothing imported it —
`apps/web` did not even list it as a dependency. This step is that wiring.

---

## 1. What this builds

One route.

| Route | Answers |
|---|---|
| `/calculator` | What is my estimated CRS score, what is it made of, what did I leave out, and where does it sit against the rounds IRCC has already held? |

No accounts, no saved profiles, no `assessments` table, no HTTP API, no new
dependency. Those are step 5 and later.

**Out of scope, and worth naming:** the page does not assess eligibility for any
program or category. That depends on occupation and work history the form does
not collect, and inferring it would break §6's *never infer a missing input* and
§7.3's *no immigration advice* at the same time. The page says so and links to
IRCC.

## 2. Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Language input | CLB/NCLC, four abilities, per language | It is what the engine consumes. Converting IELTS/CELPIP/TEF/TCF means transcribing four more IRCC tables — a second body of sourced numbers to verify and keep current. The page links to IRCC's conversion charts instead. |
| Cut-off comparison | Yes, as historical fact | §7.3 says state facts, show gaps, link to IRCC. This is the reason the tracker and the calculator are one product. Past tense throughout; never a forecast. |
| Persistence | None | State lives in React. A refresh clears it. A privacy claim that is trivially true cannot be broken by a later bug. Saved profiles need accounts. |
| Rule set | `crs-current` only, no picker | `crs-2024` stays in the package as the proof the interpreter is data-driven. Offering a superseded rule set invites someone to score themselves under rules that no longer apply. |
| Where scoring runs | The browser | See §3. |

## 3. Why client-side is the design, not an implementation detail

A `Profile` is personal information under PIPEDA, Quebec Law 25 and GDPR.

`score()` is pure and synchronous, so running it in the browser costs nothing.
The profile therefore never crosses the network, never reaches a server log,
never reaches Supabase, and never touches a disk. The page says exactly that.

A claim like that is only worth making if it is structurally true, so
`apps/web/test/boundaries.test.ts` reads the source and asserts that no file
carrying `'use client'` imports `queries.ts`, `supabase.ts`, `env.ts` or
`@supabase/supabase-js`, calls `fetch(`, or touches `localStorage`,
`sessionStorage` or `indexedDB`. That is the step-4 counterpart of the
service-role assertion already in that file.

The server half of the page reads the published cut-offs with the anon key, as
every other route does, and passes down only the handful of public fields the
comparison table renders.

## 4. Structure

```
apps/web/app/calculator/
  page.tsx                 server: reads cut-offs, renders the intro and the form
  CalculatorForm.tsx       'use client': holds the state, runs score()
  ApplicantFieldsets.tsx   'use client': the applicant's questions
  SpouseFieldset.tsx       'use client': the accompanying spouse's questions
  LanguageFieldset.tsx     'use client': four abilities, used four times
  FormFields.tsx           'use client': NumberField, YesNoField, ChoiceField
  ScoreBreakdown.tsx       'use client': total, sections, factors, warnings
  CutoffGap.tsx            'use client': the comparison table

apps/web/src/
  profile.ts               pure: labels for the codes crs-rules works in
  profileForm.ts           pure: the form's state, and the mapping to a Profile
  gap.ts                   pure: CutoffMark, toCutoffMarks, gapsFor
```

Reused rather than rebuilt: `buildLadder` already computes the most recent round
per stream with its `comparable` flag, which is exactly what the comparison
table needs — `toCutoffMarks` only narrows it. `fetchRounds` / `fetchCategories`
/ `fetchPrograms`, `formatDate` and `formatInteger` are unchanged.

`FormFields.tsx` exists because its three controls are used four, three and five
times. That is past CLAUDE.md's third-occurrence line; the alternative is the
same label-and-select markup written twelve times.

### The form cannot hold a Profile directly

A `LanguageTest` needs all four abilities at once, and a half-filled test is a
real state a user passes through. So `ProfileForm` keeps four independent
nullable abilities and `toProfile` collapses them — all four or `null`, never
scoring the blanks as zero. The upshot is that the entire form-to-Profile
mapping is a pure function, tested without a DOM.

Two mappings are load-bearing rather than mechanical:

- **Unticking the spouse box drops the details.** They must not keep scoring in
  the background.
- **A ticked box with nothing filled in maps to `spouse: null`**, not to an
  object of nulls. `score()` distinguishes them: `null` earns the one warning
  that matters — that core has dropped to the lower with-spouse scale and the
  spouse section is paying nothing back — while an object of nulls earns four
  ordinary "not answered" warnings that never mention the points already lost.

## 5. Trust and legal obligations this step inherits

- **The estimate disclaimer appears once, clearly**, on the screen showing the
  score, and points at IRCC's own calculator as the authority (§7.2).
- **Every number links to its source**: the rule set's `label`,
  `effectiveFrom` and IRCC `sourceUrl` render under the breakdown, and every row
  of the comparison table links to the IRCC page for that round (§7.1).
- **Warnings are rendered above the breakdown, not below it.** A blank field
  scores zero, and a user who does not know that reads a wrongly low total as a
  fact about themselves.
- **Every comparison is like for like** (§7.5). A stream whose rounds are not
  comparable shows its cut-off and no difference, with the reason. The PNP row
  carries a note that those rounds invite only candidates who already hold a
  nomination, worth 600 points by itself — without it the arithmetic is correct
  and misleading.
- **No advice.** Past tense throughout, and a plain statement that future
  cut-offs are set by IRCC and are not predictable.
- No job-offer control anywhere. Arranged employment was removed on 25 March
  2025 and `crs-current` awards it nothing, so the field would look like it
  mattered and do nothing.

## 6. One change inside `packages/crs-rules`

Warnings and factor explanations turned out to be written for whoever was
debugging a failure rather than for a reader: *"scored 0 because firstOfficial
was not supplied"*, *"siblingInCanada true scores 15"*, and — for an unanswered
skill-transferability pair — *"null with null scores 0"*.

These are presentation strings, not points values, so they were fixed at source
in `tables.ts` and `score.ts` rather than translated in `apps/web`. Three tests
that had used the input name as a handle now match on the factor label instead,
which is what a user actually sees. `test/explanations.test.ts` asserts that no
warning or explanation names an internal input, across five profiles and both
rule sets, so the jargon cannot come back.

No points value and no rule-set data changed.

## 7. Testing

No DOM testing library, no `jsdom`, no new dependency — the pure functions carry
the logic and vitest tests them directly, as in step 3.

- `profile.test.ts` — the label maps cover every code crs-rules defines, and
  `parseCount` refuses negatives, fractions and text rather than coercing them.
- `profileForm.test.ts` — `toProfile(emptyForm())` supplies nothing at all and
  parses under `profileSchema`; the full mapping; the two spouse rules above;
  never a job offer.
- `gap.test.ts` — sign and magnitude, the withheld comparison, the ordering.
- `boundaries.test.ts` — the client-component assertions in §3.
- `explanations.test.ts` (crs-rules) — §6.

**The check that matters most is end-to-end**: enter the *theoretical maximum,
single* fixture from `packages/crs-rules/test/fixtures.ts` into the live form.
It must render 1200. The engine is already proven against IRCC's calculator, so
a disagreement means the form is mis-mapping a field. Done on 2026-08-30: 1200,
with age 110 and education 150 matching the fixture's workings factor by factor.

## 8. Done when

- `pnpm dev` serves `/calculator` against live data
- The maximum fixture scores 1200 through the form
- An empty profile scores 0 and warns for every unanswered factor
- Declaring a spouse with no details raises the with-spouse-scale warning
- No client component can reach the network, the database or browser storage,
  asserted by a test rather than by inspection
- No warning or explanation names an internal input, asserted by a test
- `pnpm typecheck`, `pnpm test` and `pnpm build` all clean
