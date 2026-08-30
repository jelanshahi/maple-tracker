# HANDOFF

Written 2026-08-30, end of the session that finished step 3.

Read `CLAUDE.md` first — it is how we work. This file is only what a fresh agent
cannot reconstruct from the repo: what just changed, what is verified, and the
three things that will waste your afternoon if nobody warns you.

---

## Where the project is

**Step 3 (web, read-only) is complete.** Every item in `CLAUDE.md`'s definition
of done for step 3 was checked with evidence, not assertion:

| Requirement | State |
|---|---|
| `/`, `/rounds`, `/rounds/[roundNumber]`, `/categories` serve live data | done |
| Latest draw on `/` matches the newest row | verified against the database |
| Ladder shows all ten seeded categories | 10 categories + 4 programs + general = 15 rows |
| Every rendered round links to its IRCC source | 882 links on `/rounds` |
| Staleness banner past 24h, threshold moved rather than waited | `layout.tsx`, tested in `format.test.ts` |
| No service role key reachable from `apps/web`, asserted by a test | `apps/web/test/boundaries.test.ts` |
| `pnpm typecheck`, `pnpm test`, `pnpm build` clean | 266 tests, 15 files |

**Next is step 4: the calculator** — wire `packages/crs-rules` into the web app,
client-side, still no accounts. `apps/web` may import `crs-rules` from step 4
onward; it still must never import from `packages/ingester`.

**`main` is 1 commit ahead of `origin/main`.** `bba0305` is unpushed. Nothing is
wrong with it; the session ended before pushing.

---

## What this session did

It began as "finish tasks 11 and 12 of the program-code-split plan" and grew
three times, each because a check turned up something real.

1. **Tasks 11 and 12** — `/` and `/rounds` now name the specific program
   ("Canadian Experience Class") instead of a generic "Program-specific".
2. **Code review** — 7 findings, 4 fixed. The significant one: the program-code
   backfill read whole rows including `raw` and wrote them back, making a
   one-column update a read-modify-write that could silently revert a concurrent
   ingest correction. It is now a narrow `update()` per row with a bounded read
   that throws rather than truncating.
3. **Documentation** — the review flagged one doc drift; checking every claim
   against the live database found three more it missed. See below.
4. **Migration ledger** — turned out to be broken repo-wide and had nothing to do
   with this feature. See below.
5. **`/rounds/[roundNumber]`** — the last missing piece of step 3.

The plan that drove most of it, with its deviations annotated, is
`docs/superpowers/plans/2026-08-29-program-code-split.md`. It is marked complete.
Where the finished code differs from that plan, **the code is right and the plan
is not** — it says so at the top.

---

## Three things that will waste your time

**1. Never apply a migration through the Supabase MCP tool.**

This is the lesson of the session. `mcp__claude_ai_Supabase__apply_migration`
stamps its own timestamp, so the version recorded remotely never matches the
local filename. Two migrations applied that way left the ledger disagreeing with
*every* local file, plus one migration applied but never recorded and one
recorded but with no local file. `supabase db push` would have died on
`create table programs`.

It is fixed — 8 ledger rows, 8 local files, `db push --dry-run` reports "Remote
database is up to date" — and the CLI is now linked to project
`ubzmpejcooniohccuqbs`. **Use `supabase db push`.** If you ever must repair the
ledger again, `supabase migration repair --status applied|reverted <version>`
is the tool, and take a backup table first.

**2. `vitest` must run from the repo root.**

The root `vitest.config.ts` defines projects as `packages/*` and `apps/*`.
Running `pnpm --filter @maple/web exec vitest` fails with "No projects were
found" — it is not a broken test, it is the wrong working directory. Use:

```
npx vitest run                                   # everything
npx vitest run apps/web/test/ladder.test.ts      # one file, by path from root
pnpm test                                        # vitest + pnpm audit
```

**3. The dev machine is Windows and the shell is PowerShell.**

`CLAUDE.md` says this and it still bit twice. Bash line continuations (`\`) are
not continuations in PowerShell — they get read as part of the next argument, so
a multi-line `supabase migration repair` command failed with "invalid version
number". Write commands on one line, or use a backtick. Same for heredocs: the
Bash tool takes `<<'EOF'`, and PowerShell here-strings (`@'...'@`) silently
produce a commit message with a literal `@` as its subject line.

---

## Verified facts — do not re-derive these

Checked against the live database on 2026-08-30:

- 438 draw rounds. 186 program, 178 general, 74 category.
- Program split: 111 PNP, 67 CEC, 7 FST, 1 FSW. **Zero** program rounds without a
  `program_code`, enforced by the `program_iff_program_round` constraint.
- 10 categories, 4 programs, 100 `news_items` rows.
- 9 tables. Category codes and program codes are **disjoint** — categories are
  words (`french`, `stem`), programs are `cec`/`pnp`/`fst`/`fsw`. `format.ts`'s
  `mergeStreamLabels` depends on this and states it.
- `raw` is ~1.4 KB per row, 251 KB across all program rounds. The "796 KB" in
  older comments is the whole fetched payload, not one row.

---

## Documentation drift found this session

`ARCHITECTURE.md` had gone stale in ways nobody would notice by reading it. All
four are fixed and recorded in its §11 corrections log:

- The `programs` table and `draw_rounds.program_code` were absent from §4 entirely.
- §4 said `ingestion_runs` has "no policies at all". Untrue since the staleness
  banner shipped — anon has `select (finished_at)` on successful runs only.
- `news_items` existed in the database with a public-read policy and appeared in
  no migration and no schema block. It now has both.
- §7 still said "display in device local time" long after §11 recorded that very
  correction to UTC.

§11's preamble now says the document records *intended design* and loses to the
running system. That framing matters: the previous "this document is the source
of truth" is what let four drifts sit unnoticed. **Verify doc claims against the
database before relying on them**, and correct the doc when it is wrong rather
than coding to it.

Note `CLAUDE.md`'s Layout still lists `apps/web/src/history.ts`, which has never
existed. Nothing needs it yet — do not create it speculatively.

---

## Loose ends

- **Push `bba0305`.**
- **`pnpm types`** now works (it needs `--linked`, which previously failed).
  `packages/ingester/src/database.types.ts` currently carries a hand-edit from
  the plan's Task 4 fallback. Running `pnpm types` would confirm the hand-edit
  matches what the generator actually produces.
- **The merged worktree** at `.claude/worktrees/program-code-split` is redundant.
  `git worktree remove` reclaims its `node_modules` and `.next`. `.claude/` is
  now gitignored — it holds full checkouts, so `git add .` used to be one
  keystroke from committing the repo into itself.
- **`packages/ingester/bin/backfill-program-codes.ts`** is a one-off that has
  already run. It is inert now (the constraint guarantees no rows match) but is
  kept for a restored snapshot. Command is in `CLAUDE.md`.

---

## Useful shape of the web app

Pure logic is in `apps/web/src/` and is where the tests are. The `app/` files are
thin server components.

- `format.ts` — dates (UTC, always labelled), integers, movement, and the stream
  label helpers `mergeStreamLabels` / `streamLabel` / `describeRoundType`.
- `ladder.ts` — `streamKey`, `buildLadder`, and `previousInStream`. A "stream" is
  the category if a round has one, else the program, else the round type.
- `queries.ts` / `rows.ts` — the only I/O, and the zod schemas that prove every
  row's shape at the boundary.

Two rules that are load-bearing rather than stylistic: order by `drawn_at` and
never by `round_number` (IRCC publishes `91a` and `91b`, and `parseInt` collapses
them), and never `select('*')` from `draw_rounds`.
