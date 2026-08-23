# CLAUDE.md

Maple Tracker — Express Entry draw tracking, IRCC news, and a CRS calculator.

`ARCHITECTURE.md` is the source of truth for schema, data sources, and scoring rules. Read it before making any structural decision. This file is how we work together.

**Current scope: steps 1 and 2 of the build order only** — the ingester and the CRS rules package. No UI, no clients, no accounts.

---

## Rules of engagement

These override any general instinct about how a project "should" be structured.

**Build only what is asked for.** If `ARCHITECTURE.md` §9 doesn't list it in the current step, it's out of scope. Do not add it "for later." Explicitly out of scope right now: any UI, any HTTP API, auth, alerts, email, news ingestion, provincial data, processing times, admin tooling, Docker, monorepo tooling (turbo/nx), CI beyond `test` + `typecheck`.

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

Node 20+ · TypeScript 5 strict · ESM · `zod` for validation · `vitest` for tests · `@supabase/supabase-js` · pnpm workspaces.

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

supabase/migrations/         timestamped .sql, never edited after commit
```

`crs-rules` must never import from `ingester`, and must never import Supabase.

---

## Commands

```
pnpm ingest       one-off ingestion run
pnpm test         vitest
pnpm typecheck    tsc --noEmit
pnpm types        supabase gen types typescript --linked > packages/ingester/src/database.types.ts
```

Run `pnpm test` after any change under `packages/`. Run `pnpm types` after any migration.

---

## Code quality

A junior developer must be able to open any file and understand it without chasing four layers of indirection.

- **Functions do one thing**, under ~40 lines. Longer means it's doing two things — split it.
- **Files under ~150 lines.** If one grows past that, it has a second responsibility.
- **Pure by default.** I/O lives at the edges in clearly named functions (`fetchRoundsPayload`, `writeRounds`). Logic in the middle takes data and returns data. This is what makes it testable without mocks.
- **`type` over `interface`.** No `any` — use `unknown` and narrow. No non-null `!`. No `as` casts except immediately after a validator has confirmed the shape.
- **Named exports only.** No `export default`. No barrel `index.ts` that re-exports — import from the real path. (`crs-rules/src/index.ts` is the one exception: it's the package's public surface and lists exports explicitly.)
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
- The anon key is for future client code and is subject to RLS.
- The service role key bypasses RLS and is imported only inside `packages/ingester`. Nothing else may touch it.

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

---

## Don't

- Don't scaffold anything outside the current build-order step without flagging it first.
- Don't add analytics, ad SDKs, or third-party trackers.
- Don't commit `.env`, service-role keys, or any credential.
- Don't edit a committed migration.
- Don't use the Canada wordmark, the flag symbol, or IRCC branding anywhere.
- Don't add a dependency without asking.
- Don't write a network call in a test. Ingester tests use recorded fixture payloads checked into the repo.

---

## Working agreement

One step at a time. Finish step 1 completely, tests included, before starting step 2. Commit in small logical units with plain-English messages.
