# CLAUDE.md

Maple Tracker — Express Entry draw tracking, IRCC news, and a CRS calculator.

`ARCHITECTURE.md` is the source of truth for schema, data sources, and scoring rules. Read it before making any structural decision. This file is how we work together.

**Current scope: step 3 of the build order** — the read-only web client: latest draw, history, cut-off ladder. Steps 1 (ingester) and 2 (CRS rules) are complete. No accounts, and no calculator UI — wiring `crs-rules` into the web app is step 4.

The design for this step is `docs/superpowers/specs/2026-08-28-step-3-web-read-only-design.md`.

---

## Rules of engagement

These override any general instinct about how a project "should" be structured.

**Build only what is asked for.** If `ARCHITECTURE.md` §9 doesn't list it in the current step, it's out of scope. Do not add it "for later." Explicitly out of scope right now: the CRS calculator UI (step 4), accounts, any HTTP API, auth, alerts, email, news ingestion, provincial data, processing times, pool-distribution charts, admin tooling, Docker, deployment and hosting config, monorepo tooling (turbo/nx), CI beyond `test` + `typecheck`.

**No speculative abstraction.** Do not write an interface, base class, factory, adapter, or generic helper until the same shape appears a **third** time. Two similar functions are fine. A `BaseSource` class with one subclass is not. A `utils.ts` of one-off helpers is not.

**Delete rather than comment out.** Git remembers. Dead code in the file is noise.

**If a requirement here turns out to be wrong** — the JSON endpoint doesn't exist, a guard is unworkable, a rule can't be expressed as data — **stop and say so.** Do not work around it silently. A wrong assumption caught early is cheap; one buried in code is not.

---

## Environment

Dev machine is **Windows**.

- Never emit bash-only scripts in `package.json`. Use `cross-env` for env vars, Node scripts over shell one-liners.
- Paths use `path.join` / `path.resolve`, never string concatenation with `/`.
- No `&&`-chained shell commands in npm scripts; use `npm-run-all` or a Node script.

---

## Stack

Node 20+ · TypeScript 5 strict · ESM · `zod` for validation · `vitest` for tests · `@supabase/supabase-js` · pnpm workspaces · **Next.js (App Router) + React** for the web client.

Styling is **plain CSS Modules** — they ship with Next.js. No Tailwind, no CSS-in-JS, no component library, no icon package. The site is a header and some tables; that does not earn a framework.

Nothing else without asking. Every dependency is a supply-chain surface, and this project reads from a government website and writes to a database with a key that bypasses RLS. Keep the surface small. Before adding a dependency, ask whether 20 lines of your own code would do.

---

## Layout

```
packages/crs-rules/          pure, zero I/O, zero deps except zod
  src/types.ts               Profile, RuleSet, ScoreResult
  src/score.ts               the interpreter
  src/factors/               one file per CRS section
  src/rulesets/              versioned JSON rule sets
  src/index.ts               explicit public exports only
  test/

packages/ingester/           all I/O lives here
  src/fetch.ts               HTTP: allowlist, timeouts, size caps
  src/parse.ts               raw payload -> candidate rows (pure)
  src/validate.ts            zod schemas + business guards (pure)
  src/store.ts               Supabase writes
  src/health.ts              staleness checks (pure)
  src/run.ts                 orchestration + top-level error handling
  bin/ingest.ts              thin entrypoint
  test/

apps/web/                    Next.js App Router, read-only, anon key only
  app/                       routes: /, /rounds, /rounds/[roundNumber], /categories
  src/env.ts                 zod-validated SUPABASE_URL + SUPABASE_ANON_KEY
  src/supabase.ts            anon client, server-only            (I/O edge)
  src/queries.ts             the reads, returning validated rows  (I/O edge)
  src/ladder.ts              pure: rounds -> cut-off ladder
  src/history.ts             pure: filtering, grouping, deltas
  src/format.ts              pure: dates, timezone labels, movement
  test/

supabase/migrations/         timestamped .sql, never edited after commit
```

`crs-rules` must never import from `ingester`, and must never import Supabase.

`apps/web` must never import from `ingester`. It reads the database directly with the anon key,
through the public-read RLS policies. It may import `crs-rules` — but not until step 4.

---

## Commands

```
pnpm ingest       one-off ingestion run
pnpm dev          web client, local dev server
pnpm build        web client, production build
pnpm test         vitest, then pnpm audit
pnpm typecheck    tsc --noEmit
pnpm types        supabase gen types typescript --linked > packages/ingester/src/database.types.ts
```

Run `pnpm test` after any change under `packages/` or `apps/`. Run `pnpm types` after any
migration. `pnpm test` needs a network connection for the audit step; the tests themselves do not.

---

## Code quality

A junior developer must be able to open any file and understand it without chasing four layers of indirection.

- **Functions do one thing**, under ~40 lines. Longer means it's doing two things — split it.
- **Files under ~150 lines.** If one grows past that, it has a second responsibility.
- **Pure by default.** I/O lives at the edges in clearly named functions (`fetchRoundsPayload`, `writeRounds`). Logic in the middle takes data and returns data. This is what makes it testable without mocks.
- **`type` over `interface`.** No `any` — use `unknown` and narrow. No non-null `!`. No `as` casts except immediately after a validator has confirmed the shape.
- **Named exports only.** No `export default`. No barrel `index.ts` that re-exports — import from the real path. Two exceptions, both structural rather than stylistic: `crs-rules/src/index.ts` is the package's public surface and lists its exports explicitly, and Next's App Router files (`layout.tsx`, `page.tsx`, `next.config.ts`) are required by the framework to default-export. Everything under `apps/web/src/` follows the normal rule.
- **No classes** unless there's genuine per-instance state. There isn't, in this scope.
- **Descriptive names.** `cutoffCrs` not `c`. `roundsSinceLastMatch` not `n`.
- **Comments explain *why*.** The code says what. Keep comments where a rule is non-obvious or a workaround exists — those are load-bearing. A comment restating the line below it is not.
- **Errors are explicit.** No empty `catch {}`. No `catch (e) { console.log(e) }` then continuing as if nothing happened. Either handle it meaningfully or let it propagate to the top-level handler, which decides between quarantine-and-alert and crash.

---

## Security

Requirements, not suggestions.

**Secrets**
- Service role key and database URL come from `process.env`, validated at startup with zod so a missing key fails immediately rather than at 3 a.m.
- `.env` is gitignored. `.env.example` is committed with empty values.
- Never log a key, never send one to a client, never embed one in an error message.

**Two keys, two boundaries**
- The anon key is subject to RLS and is used by `apps/web`, and only by `apps/web`.
- The service role key bypasses RLS and is imported only inside `packages/ingester`. Nothing else may touch it — `apps/web` least of all.
- **The anon key is never `NEXT_PUBLIC_`-prefixed.** It is read server-side, in server components, so no key reaches the browser at all. The public-read policies would make an exposed anon key survivable; not shipping it is still strictly better.

**Reading the database from the web client**
- **Select explicit columns. Never `select('*')`.** `draw_rounds.raw` holds the entire source payload — the last one was 796 KB — and `*` drags all of it into every page render.
- Validate query results with zod before use, exactly as the ingester validates at its boundary. The database is trusted, but its shape can drift under the app during a migration, and that should fail loudly rather than render `undefined`.
- Order by `drawn_at`, never by `round_number`, and never `parseInt` it. IRCC publishes `91a` and `91b`.

**Fetching — this is where a mistake becomes an incident**
- **Host allowlist.** Module-level `const ALLOWED_HOSTS`. Every URL parsed with `new URL()` and its hostname checked before any request. Reject anything else, including unlisted subdomains.
- **`redirect: 'manual'`.** An off-allowlist redirect target fails the run. Never follow blindly.
- **Timeout** 15s via `AbortSignal.timeout(15_000)`.
- **Response size cap** — read the stream, abort past 10 MB. A malformed or hostile response must not exhaust memory.
- **Content-type check** before parsing.
- **Retry on 5xx and network errors only**: 3 attempts, exponential backoff with jitter from 1s. Never retry a 4xx — that means the URL moved and a human needs to look.
- **URLs are constants in the codebase.** Never construct a fetch URL from database content or from a parsed response. That rule alone closes the SSRF surface.

**Untrusted input**
- Everything off the network is untrusted, including a `.gc.ca` domain. Validate before use.
- Never interpolate parsed values into SQL. `supabase-js` parameterises — do not hand-build query strings.
- Never write parsed content into a filesystem path or a URL.

**Injection**
- No `eval`, no `new Function`, no dynamic `import()` of a computed path, no shelling out.
- The rule-set condition language exists precisely so rules can be data without being code. Keep it tiny.

**Personal data**
- Nothing in the current scope stores personal data, but `Profile` describes it and it will be persisted later.
- Never log a `Profile`. Never include one in an error message or exception. No analytics in `crs-rules`.

**Dependencies**
- Pin exact versions — no `^`. Commit the lockfile. `pnpm audit` runs in the test script.

**Migrations**
- Reviewed SQL files. Never generate and execute SQL at runtime. Never edit a committed migration — write a new one.

---

## CRS scoring rules

- `packages/crs-rules` is pure and dependency-free apart from zod. No fetches, no side effects, no `Date.now()`.
- **Never hardcode a points value.** Every number comes from the rule set. If you're typing a number into `score.ts`, something is wrong.
- **Source numbers from IRCC's own pages**, cite the URL in the rule set's `sourceUrl`, and verify totals against IRCC's own calculator. Never take numbers from training data or from third-party calculator sites — they are full of the removed arranged-employment points.
- **Arranged employment is zero** under `crs-current`. Removed 25 March 2025. Do not add a job-offer field that awards points, however plausible it looks in an older tutorial.
- **Section caps apply after summing**, not per item. Core 500, or 460 with an accompanying spouse. Skill transferability 100 overall, 50 on the education pair, 50 on the foreign-work pair.
- **Language is four abilities per language**, not one aggregate. See `ARCHITECTURE.md` §6.
- **Never infer a missing input.** Score zero, emit a warning.
- Never change a rule-set value without adding a fixture to the test table first.

---

## Ingestion rules

- **Idempotent or it doesn't ship.** Upsert on `round_number`. Running twice must change nothing and must record a `no_change` run.
- **Hash before parsing.** Unchanged body means no parse, no write.
- **Validate with zod at the boundary**, then run business guards. On schema drift, throw — do not coerce, do not silently skip.
- **Zero parsed rows from a changed body is a failure**, not an empty result.
- **Quarantine bad rows, don't abort the run.** Good rows still land.
- **Snapshot the raw response before parsing.** Always.
- **Rate-limit** to one request per second against canada.ca. Cache-bust with a query string.
- **Descriptive User-Agent with a contact URL.**
- **Official IRCC and Government of Canada sources only.** Never a commercial immigration site or aggregator.

---

## Web client rules

These come from `ARCHITECTURE.md` §7 and §10. They are requirements, not polish.

- **Every number links to its source.** Each round renders its `source_url` to the IRCC page it came from. A number without provenance does not render.
- **Never silently stale.** The site shows when the data was last verified, and says so plainly when that is over 24 hours old. A tracker that admits it might be stale beats one that quietly lies.
- **Dates are stored UTC, displayed in local time, and labelled with the timezone.** Tie-break timestamps especially — an unlabelled tie-break time is actively misleading.
- **No immigration advice.** State facts, show gaps, link to IRCC. Never phrase anything as a prediction or a recommendation about someone's case. IRPA s.91 is a legal boundary, not an editorial preference.
- **Carry the not-affiliated disclaimer**, in the wording already in `README.md`.
- **No Canada wordmark, no flag symbol, no IRCC branding.** Attribute under the Open Government Licence.
- **No outbound requests from the browser.** No analytics, no third-party scripts, no CDN fonts.
- **Never present a comparison that is not like for like.** Withholding a number and saying why beats printing a confident wrong one. `round_type = 'program'` mixes CEC and PNP rounds whose cut-offs are hundreds of points apart, so the ladder shows no movement for it — see `ARCHITECTURE.md` §11.
- **Timestamps render in UTC and say "UTC".** Not device-local: pages are ISR-cached server renders, so the server does not know the viewer's timezone and must not guess it.

---

## Logging

`console.log` with a single-line JSON object per event: `{ event, runId, ...fields }`. No logging library.

Never log: the service role key, full response bodies, or profile data.

No stray `console.log` left in committed code — if it's worth keeping it's a structured event with a name.

---

## Definition of done

**Step 1 — ingester**
- `pnpm ingest` populates `draw_rounds` from live IRCC data
- Running twice in a row produces a `no_change` run and zero writes
- A corrupted fixture (out-of-range cut-off, unknown category, mutated existing round) lands in `quarantined_rows` without aborting the run or touching good data
- All four health checks pass on healthy data and fail correctly on synthetic bad data
- A full historical backfill completes and the row count matches IRCC's published total
- `pnpm typecheck` and `pnpm test` clean

**Step 2 — rules package**
- All 15+ fixture profiles score exactly as verified against IRCC's calculator
- `crs-2024` was added **without editing `score.ts`**
- No arranged-employment points anywhere under `crs-current`
- `crs-rules` has zero runtime dependencies except zod and imports nothing from `ingester`

**Step 3 — web, read-only**
- `pnpm dev` serves `/`, `/rounds`, `/rounds/[roundNumber]` and `/categories` against live data
- The latest draw on `/` matches the newest row in `draw_rounds`
- The cut-off ladder shows all ten seeded categories, including ones with no recent round
- Every rendered round links to its IRCC source
- The staleness banner appears past 24h, verified by moving the threshold rather than waiting a day
- No service role key is reachable from `apps/web`, asserted by a test rather than by inspection
- `pnpm typecheck`, `pnpm test` and `pnpm build` all clean

---

## Don't

- Don't scaffold anything outside the current build-order step without flagging it first.
- Don't add analytics, ad SDKs, or third-party trackers.
- Don't commit `.env`, service-role keys, or any credential.
- Don't edit a committed migration.
- Don't use the Canada wordmark, the flag symbol, or IRCC branding anywhere.
- Don't add a dependency without asking.
- Don't write a network call in a test. Ingester tests use recorded fixture payloads checked into the repo, and web tests use recorded row fixtures — never a live database.
- Don't import the service role key, or anything from `packages/ingester`, into `apps/web`.
- Don't `select('*')` from `draw_rounds`. The `raw` column is the whole source payload.

---

## Working agreement

One step at a time. Finish the current step completely, tests included, before starting the next. Steps 1 and 2 are done. Commit in small logical units with plain-English messages.
