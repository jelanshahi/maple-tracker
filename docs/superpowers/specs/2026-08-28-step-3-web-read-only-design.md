# Step 3 — Web, read-only

Date: 2026-08-28
Status: design, awaiting approval to implement

`ARCHITECTURE.md` §9 step 3: *"Web read-only. Latest draw, history, cut-off ladder. No accounts."*

This document is the spec. It does not authorise implementation on its own.

---

## 1. What this builds

A small Next.js site that reads `draw_rounds` and `categories` and renders four things:

| Route | Answers |
|---|---|
| `/` | What was the last draw, and is this data current? |
| `/rounds` | The full published history. |
| `/rounds/[roundNumber]` | This one round, and the one comparison that is fair to make about it. |
| `/categories` | The cut-off ladder — where each stream's line currently sits. |

*(This route was cut from an earlier draft of this section on the grounds that every row already
links to IRCC directly, and then built anyway on 2026-08-30 — the cut was recorded here and nowhere
else, while §4, §5, §10 and `CLAUDE.md`'s definition of done all still required it. It earns its
place on the argument the cut missed: movement against the previous round **of the same stream** is
not derivable from any table on the other three routes, and after the `program_code` split it is a
real number for program rounds rather than a withheld one.)*

No accounts, no calculator, no news, no charts, no alerts. Those are steps 4 and later.

## 2. Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Cut-off ladder means | Latest cut-off per category, with movement | Reads `draw_rounds` alone. The pool-distribution reading is not buildable — see §6. |
| Read path | Server components + ISR | Anon key stays server-side; output is cacheable, which is what §8 asks for. |
| Styling | Plain CSS Modules | Ships with Next.js. Zero new dependencies for a site that is a header and some tables. |
| Deployment | Local only this step | `pnpm dev` / `pnpm build`. No hosting account, no credentials handed to a third party yet. |

## 3. The blocker, and what to do about it

**`ARCHITECTURE.md` §5 and §4 contradict each other, and §5 cannot be satisfied as written.**

§5 ends: *"Every client surfaces `last verified at`. If it's over 24h old, the UI says so."*
That timestamp lives in `ingestion_runs`. But `20260823090200_rls.sql:15` enables RLS on
`ingestion_runs` with **no policies at all**, and comments: *"Service role only. Do not add a
policy to these without a reason written down."*

So the web client, holding only the anon key, cannot read the number §5 requires it to display.

Three ways out:

1. **Derive it from `max(draw_rounds.ingested_at)`.** Rejected, and it is worth saying why: a
   `no_change` run writes nothing, so this timestamp freezes while ingestion is working
   perfectly. It would announce staleness that does not exist — the exact false alarm §5's own
   `fetchRecent` note warns against.
2. **Give anon a policy on `ingestion_runs`.** Rejected. It exposes `error` text and row counts
   — operational detail, and `error` is the one column most likely to leak internals.
3. **A view exposing exactly one aggregate.** *Rejected on review, before implementation.* A
   Postgres view runs with its owner's privileges by default, so it bypasses RLS **silently**.
   Supabase warns about exactly this. The mechanism should be visible, not incidental.

4. **A narrow policy plus a column-level grant.** *Implemented.*

```sql
create policy "public read verification time"
  on ingestion_runs for select to anon, authenticated
  using (status in ('ok', 'no_change'));

revoke select on ingestion_runs from anon, authenticated;
grant select (finished_at) on ingestion_runs to anon, authenticated;
```

Nothing hidden: anon may read one column, on successful runs only. No error text, no counts, no
run ids, no failure history. Failed runs are excluded so a broken run cannot masquerade as a
successful check, and the column grant means a policy widened by accident later still cannot
reach the other columns.

**Both halves were verified against the live database on a scratch table before being written**,
rather than assumed: with the grant in place anon read `finished_at` and saw 1 of 2 rows (the
policy filtering correctly, despite anon holding no privilege on the `status` column the policy
tests), and selecting `error` returned `permission denied for table`.

**If you would rather not widen RLS at all, the alternative is to drop the staleness banner from
step 3 and carry it to step 4.** That is a real option. It costs §1's "never silently stale"
property for one step, which is why it is not the recommendation.

## 4. Structure

```
apps/web/
  app/
    layout.tsx                     shell: header, staleness banner, footer disclaimer
    page.tsx                       latest draw + recent rounds
    rounds/page.tsx                full history
    rounds/[roundNumber]/page.tsx  one round
    categories/page.tsx            the ladder
  src/
    env.ts                         zod-validated SUPABASE_URL + SUPABASE_ANON_KEY
    supabase.ts                    anon client, server-only            (I/O edge)
    queries.ts                     the reads, returning validated rows (I/O edge)
    ladder.ts                      pure: rounds -> ladder rows
    history.ts                     pure: filtering, grouping, deltas
    format.ts                      pure: dates, timezone labels, movement arrows
  test/
```

Pure logic in `ladder.ts` / `history.ts` / `format.ts`; every I/O call in `supabase.ts` /
`queries.ts`. This is what makes the page logic testable without a database or a mock, matching
how `packages/ingester` already splits `parse.ts` from `fetch.ts`.

`apps/web` requires adding `apps/*` to `pnpm-workspace.yaml`.

### Query rules

- **Select explicit columns. Never `select('*')`.** `draw_rounds.raw` holds the entire source
  payload — the last fetch was 796 KB — and `*` would drag all of it into every page render.
  This is a performance rule and a data-minimisation rule at once.
- One query for rounds, then compute the ladder purely from those rows. Not one query per
  category.
- Validate query results with zod before use, the same as the ingester does at its boundary. The
  database is a trusted source, but the schema can drift under the app during a migration, and a
  silent shape change should fail loudly rather than render `undefined`.

## 5. Security

The security boundary is the whole point of this step, because it is the first code that is not
the ingester.

- **`apps/web` uses the anon key and only the anon key.** It must never import
  `SUPABASE_SERVICE_ROLE_KEY`. CLAUDE.md already says the service role key is imported only
  inside `packages/ingester`; this step is the first time that rule has a second party to
  constrain.
- **The anon key must not be `NEXT_PUBLIC_`-prefixed.** Naming it `SUPABASE_ANON_KEY` keeps it
  server-side, so no key reaches the browser at all. The public-read RLS policies would make an
  exposed anon key survivable, but not shipping it is strictly better.
- `.env.example` gains `SUPABASE_ANON_KEY` with an empty value and a comment on the boundary.
- Env validated with zod at startup, so a missing key fails the build rather than a page render.
- No user input reaches a query in this step. `[roundNumber]` is the one dynamic segment; it goes
  through `supabase-js` parameterisation, never string interpolation, and a miss renders 404.
- No analytics, no third-party scripts, no fonts from a CDN. The site makes no outbound requests.

### Dependencies

New, pinned exact, no `^`: `next`, `react`, `react-dom`. Plus `@supabase/supabase-js` and `zod`,
both already approved in the stack.

Being honest about this: Next.js is a large transitive tree, and it is the single biggest
supply-chain expansion this project has made. It is `ARCHITECTURE.md` §2's stated choice, so this
spec follows it rather than relitigating it. `pnpm audit` already gates `pnpm test`, so the new
tree is covered by the existing quality gate from the first commit.

## 6. Not buildable, and why

The pool-distribution reading of "cut-off ladder" — *"1,340 people sit between you and the last
cut-off"* — cannot be built in this step. `pool_snapshots` has no rows, and per §3 of
ARCHITECTURE the `dd1`…`dd18` bucket ranges are not in the JSON at all; they exist only in the
HTML page. The counts are preserved in each round's `raw`, so this is a backfill plus an HTML
parse later, not a data loss. Flagging it because it is the most interesting number the product
could eventually show, and its absence should be a known gap rather than a surprise.

## 7. Trust and legal obligations this step inherits

From §7 and §10, these are requirements, not polish:

- **Every number links to its source.** Each round renders its `source_url` to the IRCC page.
  §7.1: a number without provenance does not render.
- **Dates are stored UTC, displayed local, and labelled.** Tie-break times especially — a
  tie-break timestamp without a timezone is actively misleading.
- **No immigration advice.** The site states facts and links to IRCC. No phrasing that predicts
  or recommends. There is no calculator this step, which keeps this easy.
- **Not-affiliated disclaimer** in the footer, in the README's existing wording.
- **No Canada wordmark, no flag symbol, no IRCC branding.** Attribute under the Open Government
  Licence.
- The `91a` / `91b` trap: order by `drawn_at`, never by `round_number`, and never `parseInt` it.

## 8. Testing

Vitest, consistent with the existing 203 tests. No network, no database.

- `ladder.ts`: latest-per-category from a fixture round set; a category with no rounds; movement
  up, down, and unchanged; a category whose most recent round is old.
- `history.ts`: filtering by category and round type; `91a`/`91b` ordering; empty results.
- `format.ts`: UTC to local with label; a null `tie_break_at`; the 24h staleness threshold on both
  sides of the line.
- Query modules get their zod schemas tested against recorded row fixtures, not a live database.

Page components are not unit-tested. They are thin, and the logic worth testing has been moved out
of them by design.

## 9. Phases

1. Migration for `public_ingestion_status`, then `pnpm types`.
2. Workspace scaffolding: `apps/web`, `pnpm-workspace.yaml`, `.env.example`, CLAUDE.md.
3. Data layer: `env.ts`, `supabase.ts`, `queries.ts` with zod validation.
4. Pure logic and its tests: `ladder.ts`, `history.ts`, `format.ts`.
5. Pages and shell.
6. Verification: `pnpm typecheck`, `pnpm test`, `pnpm build`.

Phase 1 depends on a decision in §3. Phases 3 and 4 are independent of each other.

## 10. Done when

- `pnpm dev` serves all four routes against live Supabase data.
- The latest draw on `/` matches the newest row in `draw_rounds`.
- The ladder shows all ten seeded categories, including ones with no recent round.
- Every rendered round links to its IRCC source.
- The staleness banner appears when the last verified time is over 24h old, and is verified by
  moving the threshold rather than by waiting a day.
- No service role key is reachable from `apps/web`, asserted by a test, not by inspection.
- `pnpm typecheck` clean, `pnpm test` clean including audit, `pnpm build` exit 0.
