# ARCHITECTURE.md — IRCC Tracker

Working name: **Maple Tracker**. Express Entry draw history, IRCC news, and a CRS calculator that tells you where you sit against the cut-off line.

This file is the durable reference: schema, data sources, scoring rules, trust and legal constraints. It changes rarely. `CLAUDE.md` covers how we work and is read alongside it.

---

## 1. The shape of the problem

IRCC publishes everything you need, but none of it as a first-class API. The real engineering work is a reliable ingestion layer that turns published JSON and HTML into a clean table, plus a diffing step that decides when something has actually changed. Every client on top is a thin, fast reader over that table.

Three surfaces, eventually:

| Surface | What it answers |
|---|---|
| **Draws** | Where did the cut-off land, and would I have made it? |
| **News** | What policy changed since I last looked? |
| **My score** | What's my CRS, and which lever moves it most? |

Two properties matter more than any feature:

1. **Never silently stale.** A tracker showing three-week-old data as if it were current is worse than one that is visibly down. Every failure mode must be loud.
2. **Rules are data, not code.** IRCC removed arranged-employment points on 25 March 2025, added five category-based streams in February 2026, and has an active consultation on merging the three federal programs with a CRS rewrite. The engine must absorb a rewrite by adding a row, not by editing a function.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Rules engine | TypeScript package, pure, zero I/O | Runs client-side, server-side, or in a batch job with no changes |
| Ingestion | Node script, scheduler-agnostic | Invoked by pg_cron, Actions, or by hand. The code doesn't know or care |
| Data | Supabase (Postgres 15 + RLS) | Draw history is relational; window functions earn their place for trend queries |
| Web client | Next.js on Vercel | Later phase. Rules change often; web ships corrections instantly |
| Mobile client | Expo + React Native | Later phase. Exists for push notifications, which the web can't match |

Deliberately **not** Firebase: "rolling six-round average cut-off by category" is a window function, not a document query.

Deliberately **no ORM**: the schema is small and stable, and `supabase-js` parameterises queries. An ORM would add a dependency and a layer of indirection for no gain.

---

## 3. Data sources

Verify every endpoint before wiring. IRCC moves URLs.

**Rounds of invitations (primary)**
`canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html`

The page renders its table client-side, which means the data arrives as JSON. Open DevTools → Network on that page and grab the JSON URL (historically under `/content/dam/ircc/documents/json/`). **Prefer that JSON** — it is far more stable than parsing HTML. The filename has changed between versions, so treat a 404 as "a human needs to look," never as "fall back silently."

**Round detail** — `.../express-entry-rounds/invitations-{n}.html` carries the tie-break timestamp and exact UTC draw time. Needed for the at-the-cutoff case, where invitation depends on profile submission time rather than score.

**Pool distribution** — the CRS score distribution table is published on the rounds page a few days before each round. Capture it. It is what lets the product say *"1,340 people sit between you and the last cut-off"*, which is the single most useful number nobody else surfaces well.

Note the trap: the counts arrive in the rounds JSON as `dd1`…`dd18`, but **their CRS bucket ranges do not.** The payload's `classes` key is the string `"wb-tables"` — a CSS class, not bucket definitions. The ranges exist only in the HTML page, so `pool_snapshots` needs either a reviewed constant map or an HTML parse. Deferred for now; `dd1`…`dd18` are preserved in each round's `raw`, so it can be backfilled later without re-fetching.

**Newsroom** — canada.ca news filtered to IRCC publishes an RSS/Atom feed. Fall back to the news-listing HTML.

**Processing times** — a form-driven lookup, not a feed. Defer entirely; it is a different data shape and a different scrape.

**Open Government portal** — monthly XLSX extracts of invited-candidate demographics. Rich but lagging. Later, for analysis, never for live draws.

**Rule: official Government of Canada sources only.** Never ingest from a commercial immigration site or aggregator. The entire value proposition is that the numbers are trustworthy, and third-party calculators are riddled with the removed arranged-employment points.

---

## 4. Schema

Plain SQL migration files, timestamp-prefixed. No schema-builder library.

```sql
create table categories (
  code        text primary key,
  label       text not null,
  active_from date not null,
  active_to   date
);

create table draw_rounds (
  round_number  text        primary key,       -- '437', '91a', '91b'
  drawn_at      timestamptz not null,
  round_type    text        not null,          -- general | program | category
  category_code text        references categories(code),
  cutoff_crs    integer     not null,
  invitations   integer     not null,
  tie_break_at  timestamptz,
  source_url    text        not null,
  raw           jsonb       not null,
  ingested_at   timestamptz not null default now(),
  constraint cutoff_plausible      check (cutoff_crs  between 0 and 1200),
  constraint invitations_plausible check (invitations between 1 and 200000)
);
create index draw_rounds_drawn_at_idx  on draw_rounds (drawn_at desc);
create index draw_rounds_category_idx  on draw_rounds (category_code, drawn_at desc);

create table pool_snapshots (
  id          bigserial primary key,
  captured_on date    not null,
  bucket_low  integer not null,
  bucket_high integer not null,
  candidates  integer not null,
  source_url  text    not null,
  unique (captured_on, bucket_low)
);

create table rule_sets (
  id             text primary key,               -- 'crs-current', 'crs-2024'
  label          text not null,
  effective_from date not null,
  effective_to   date,
  status         text not null check (status in ('active','superseded','proposed')),
  gazette_ref    text,
  source_url     text not null,
  params         jsonb not null,
  created_at     timestamptz not null default now()
);

create table source_snapshots (
  id           bigserial primary key,
  url          text not null,
  fetched_at   timestamptz not null default now(),
  content_hash text not null,
  body         text not null
);
create index source_snapshots_url_idx on source_snapshots (url, fetched_at desc);

create table ingestion_runs (
  id           bigserial primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null check (status in ('running','ok','no_change','failed','quarantined')),
  rows_seen    integer,
  rows_written integer,
  error        text
);
create index ingestion_runs_started_idx on ingestion_runs (started_at desc);

create table quarantined_rows (
  id          bigserial primary key,
  run_id      bigint references ingestion_runs(id),
  reason      text  not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
```

Choices to not "improve":

- `round_number` is the natural primary key. IRCC assigns it and it makes re-ingestion idempotent for free. No surrogate UUID. It is **`text`, not `integer`, and not monotonic**: IRCC has published rounds `91a` and `91b`, which `parseInt` collapses onto `91`, silently destroying one of them and leaving a backfill one row short. Order by `drawn_at`, never by `round_number`.
- `cutoff_crs` floors at **0, not 100**. Round 176 (Canadian Experience Class, 13 February 2021) had a cut-off of 75. The observed range across all published rounds is 75–902.
- `category_code` is **nullable**. General rounds have no category. A `not null` column here cannot represent the data.
- `raw` keeps the original payload for every row. Non-negotiable — it's how a parser bug gets fixed without re-fetching history.
- The `check` constraints sit *behind* application validation, not instead of it. Both exist.
- `categories.active_to` is nullable because categories are retired and re-introduced. Not a boolean.
- `rule_sets.params` holds a whole rule set as one document. Do not normalise it into a key-value table — it is read whole, versioned whole, never partially updated.

### Row Level Security

Enable RLS on **every** table, including ones nothing reads yet. Turning it on after a client exists is how data leaks.

```sql
alter table draw_rounds      enable row level security;
alter table categories       enable row level security;
alter table pool_snapshots   enable row level security;
alter table rule_sets        enable row level security;
-- Operational tables: RLS on, no policies at all. Service role only.
alter table source_snapshots enable row level security;
alter table ingestion_runs   enable row level security;
alter table quarantined_rows enable row level security;

create policy "public read draws"      on draw_rounds    for select to anon, authenticated using (true);
create policy "public read categories" on categories     for select to anon, authenticated using (true);
create policy "public read pool"       on pool_snapshots for select to anon, authenticated using (true);
create policy "public read rulesets"   on rule_sets      for select to anon, authenticated using (status <> 'proposed');
```

`source_snapshots`, `ingestion_runs`, `quarantined_rows`: RLS enabled, **no policies at all**. Service role only. Operational data is not public.

Note the `rule_sets` policy — proposed rule sets stay server-side until launch. Do not add a public policy for them.

---

## 5. Ingestion

```
run()
  1. open an ingestion_runs row (status = running)
  2. fetch the rounds payload
  3. hash the body; if it matches the newest snapshot for this URL
     -> mark no_change, exit 0. Do not parse, do not write.
  4. write a source_snapshot
  5. parse into candidate rows
  6. validate each row: schema, then business guards
  7. valid -> upsert. invalid -> quarantined_rows, run continues
  8. close the run with counts
  9. run health checks; any failure -> exit non-zero
```

Step 3 is the cost model. On a quiet day the whole run is one request, one hash comparison, one small insert.

Cadence target: every 15 minutes, 08:00–20:00 ET, weekdays. In 2026 there were 42 rounds between 5 January and 23 July — roughly one every 4–5 days, but clustered, then long gaps. Six-hourly is too slow for a "new draw" alert to feel live. **Cadence is deployment config, not code.**

Non-negotiables:

- **Idempotent.** Re-running must be a no-op. Upsert on `round_number`, never append.
- **Zero parsed rows from a changed body is a failure**, not an empty result. Throw.
- **Snapshot raw before parsing.** Always.
- **Quarantine, don't abort.** One unmappable row must not cost you nine good rounds. Five new category codes appeared in February 2026 alone.
- **Rate-limit** to one request per second against canada.ca. Cache-bust with a query string; it sits behind a CDN.
- **Identify yourself** in the User-Agent with a contact URL. Be a good citizen of a government site.

### Health checks

The failure to design against is not downtime, it's silent staleness.

| Check | Fails when |
|---|---|
| `parseProducedRows` | zero rows parsed from a changed body |
| `fetchRecent` | no `ok` or `no_change` run within the configured window |
| `drawRecent` | no new round in 21 days |
| `nothingQuarantined` | unresolved rows in `quarantined_rows` |

`fetchRecent`'s window is **a parameter, not a fixed 6 hours**. The cadence above runs weekdays
08:00–20:00 ET, so a 6-hour window fails every night and all weekend by design, and a check that cries
wolf is one everyone learns to ignore. It defaults to 72 hours, which spans a weekend plus a margin;
set it to match whatever cadence is actually deployed.

`drawRecent` covers the case the others miss: IRCC paused rounds, or the parser is quietly returning an empty-but-valid structure.

Every client surfaces `last verified at`. If it's over 24h old, the UI says so. A tracker that admits it might be stale beats one that quietly lies.

---

## 6. CRS engine

### Contract

```ts
score(profile: Profile, ruleSet: RuleSet): ScoreResult
```

Pure. No `Date.now()`, no network, no database, no env vars, no randomness. Same inputs, same output, forever. This is what makes historical assessments reproducible and tests meaningful.

```ts
type ScoreResult = {
  total: number;
  ruleSetId: string;
  sections: SectionScore[];   // { key, label, points, cap, capReached }
  factors: FactorScore[];     // { key, label, points, explanation }
  warnings: string[];
};
```

A bare number is useless to a user and unauditable to us. Every factor reports its points and a one-line explanation.

### Rules as data

A rule set is one JSON document, structured along IRCC's own sections — core / spouse / skill transferability / additional — because that's how the rules get amended and how tests get written.

```ts
type RuleSet = {
  id: string;
  label: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'active' | 'superseded' | 'proposed';
  sourceUrl: string;
  maxTotal: number;
  sections: {
    core:          { cap: number; factors: Record<string, FactorTable> };
    spouse:        { cap: number; factors: Record<string, FactorTable> };
    skillTransfer: { cap: number; subCaps: Record<string, number>; combinations: Combination[] };
    additional:    { cap: number; factors: Record<string, FactorTable> };
  };
};
```

`FactorTable` is a lookup: `{ when, points }` entries where `when` is equality, a numeric range, or boolean-present. **Keep the condition language deliberately tiny. Never `eval`, never `new Function`.** A rule that can't be expressed in it belongs in a named factor function that reads its numbers from the rule set.

Each factor gets its own file, is pure, takes `(profile, ruleSet)`, returns `FactorScore[]`. `score.ts` composes them and applies caps — section caps first, then `maxTotal`.

### Domain facts to verify against

**Source every number from IRCC's own CRS criteria page and check totals against IRCC's own calculator.**
The criteria page lives at `.../express-entry/check-score/crs-criteria.html`. The older
`.../criteria-comprehensive-ranking-system/grid.html` now 301-redirects there — and since fetching uses
`redirect: 'manual'`, a stale constant is a hard failure, not a silent follow. Do not take numbers from training data or from third-party calculator sites. The facts below are what you should *expect to find* — if a source disagrees with one of them, stop and flag it rather than picking a side.

- **Arranged employment is zero.** Removed 25 March 2025. Do not add a job-offer field that awards points, however plausible it looks in an older tutorial. This is the most likely correctness failure in the whole project.
- **Section caps apply after summing, not per item.** Core is capped at 500, or 460 with an accompanying spouse. The spouse section itself caps at 40 (education 10, language 20, Canadian work 10).
- **Skill transferability caps at 100 overall**, over **three** sub-sections of 50 each, not two: the education pair, the foreign-work pair, and the **certificate of qualification** pair for trade occupations. The certificate pair is the one most often missed — note its language thresholds are CLB 5/CLB 7, not the CLB 7/CLB 9 used by the other two.
- **CLB 9 is a cliff.** Skill transferability roughly doubles at CLB 9 across all four abilities.
- **French bonus is 25 or 50**, keyed on NCLC 7+ in French and whether English is CLB 5+.
- **Provincial nomination is 600** and swamps everything else. It is its own path in the UI, not a checkbox at the bottom.

### Language input

The engine takes **four abilities** — reading, writing, listening, speaking — for each official language. Not one aggregate number.

Skill-transferability thresholds are min-based, so "lowest of four" is an honest simplification *at the input UI*. But core language points are awarded per ability, so 9/9/9/7 and 7/7/7/7 score differently. The UI may offer a "same for all four" shortcut; the engine must never accept it as its only input.

### Missing inputs

Never infer, never default. A missing field scores zero for that factor and emits a warning. Never guess education level, never assume Canadian experience.

### Rule sets to author

1. **`crs-current`** — status `active`, verified against IRCC's calculator.
2. **`crs-2024`** — status `superseded`, `effectiveTo` 2025-03-24. Identical except it includes the arranged-employment points.

The second exists to prove the interpreter is genuinely data-driven. **If adding it requires touching `score.ts`, the abstraction has failed** — say so rather than patching around it.

**`crs-2024` sources its numbers from an archived page, and that is deliberate.** IRCC removed the
arranged-employment rows from the live criteria page when the points were withdrawn on 25 March 2025,
so there is no live URL that states them. `sourceUrl` therefore cites an Internet Archive capture of
IRCC's own grid page ([13 December 2024](https://web.archive.org/web/20241213161303/https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/criteria-comprehensive-ranking-system/grid.html),
"Date modified: 2024-06-13"), which is the only remaining first-party record. Every other value in
that capture was compared against `crs-current` line by line and matched, so the two rule sets differ
by exactly the two arranged-employment rows — a test asserts this over the whole grid, not just over
scored profiles. **This exception applies to superseded rule sets only.** An active rule set must
still cite a live IRCC page, and a third-party calculator is never an acceptable source.

### Tests

- ≥15 fixture profiles with hand-verified totals: single vs. married, spouse accompanying vs. not, each education tier, the CLB 7 and CLB 9 thresholds, age-curve boundaries, max and min profiles.
- Cap tests per section, asserting `capReached`.
- Determinism: same profile 100 times, identical output.
- Cross-ruleset: one profile with a job offer scores higher under `crs-2024`, and the delta equals exactly the arranged-employment points.

---

## 7. Correctness and trust

This influences decisions that cost people years and thousands of dollars.

1. **Every number links to its source.** Round detail links to the IRCC ministerial instruction. A number without provenance does not render.
2. **The calculator is an estimate and says so** — once, clearly, on the score screen. Not a wall of legalese, not hidden. Point to IRCC's own tool as the authority.
3. **No immigration advice.** State facts, show gaps, link to IRCC. Never phrase output as a prediction or a recommendation about someone's case. No lead-gen for consultants.
4. **Dates from IRCC are UTC.** Store UTC, display in device local time, label the timezone wherever a tie-break time appears.

Point 3 is a legal boundary as well as an editorial one: IRPA s.91 restricts giving immigration advice for consideration to authorized representatives.

---

## 8. Scale

Be honest about the shape: the entire Express Entry pool is roughly 234,000 profiles nationally, and `draw_rounds` gains about 60 rows a year. **This is not a scale problem.** Do not add caching layers, connection pooling libraries, queues, sharding, read replicas, or worker pools — they'd be pure complexity today.

What is cheap now and expensive later, so do it now:

- Index for the queries that will exist — already in §4.
- Keep the read path cacheable. `draw_rounds` is identical for every user and changes a few times a month. Never mix per-user data into a draw query.
- Batch writes. One upsert call per run, not one per row — this matters on a 400-row backfill.
- Keep `score()` pure and synchronous. That's the real scalability story: the expensive operation costs nothing because it never touches a database.
- `source_snapshots` will need a retention policy (keep 90 days, plus every snapshot that produced writes). Note it in a migration comment; don't implement it yet.
- The only table that genuinely grows is `assessments`, which doesn't exist yet. When it does: `(user_id, created_at desc)`, eventually monthly partitioning.

The thing that would actually break at scale is alert fan-out, and that's a later phase.

---

## 9. Build order

1. **Ingestion + schema.** Run locally against Supabase. Verify the parser survives three consecutive runs and a full historical backfill.
2. **CRS rules package + tests.** Both rule sets.
3. **Web read-only.** Latest draw, history, cut-off ladder. No accounts.
4. **Calculator.** Rules package wired into the web app, client-side, still no accounts.
5. **Accounts + saved profiles.** Score-over-time falls out of this for free.
6. **News + review console.** Nightly diff, draft queue, human approval before publish.
7. **Email alerts.** A fifth of the work of push, and it tells you whether anyone wants alerts at all.
8. **Mobile.** Only if email alerts show real engagement.

Steps 1–4 are the actual product. Stopping after 4 leaves something genuinely useful.

Later: pool-distribution charts, processing times, PNP streams by province.

---

## 10. Legal

Government of Canada web content is generally reusable under the Open Government Licence – Canada, with attribution and without implying endorsement. Read the terms on canada.ca before shipping and attribute in-app.

**Do not use the Canada wordmark, the flag symbol, or any IRCC branding** in the app icon, splash screen, store listing, or marketing. Those are protected. Name and iconography must be clearly yours.

Personal data: profile inputs are personal information under PIPEDA and Quebec's Law 25, and a meaningful share of users will be in GDPR territory. Never log a profile, never include one in an error message.

---

## 11. Corrections log

This document is the source of truth, so when reality contradicts it the document changes and the
change is recorded here. Every entry below was verified against live IRCC data on **2026-08-23**, not
recalled, and each is a defect that would have caused silent data loss or a permanently failing check.

| § | Was | Is | Evidence |
|---|---|---|---|
| 4 | `round_number integer primary key` | `text primary key` | IRCC publishes `91a` and `91b`. `parseInt` maps both to `91`, collapsing two rounds into one row; a full backfill lands 437 instead of 438. |
| 4 | `cutoff_crs between 100 and 1200` | `between 0 and 1200` | Round 176 (CEC, 13 Feb 2021) had a cut-off of **75**. The floor of 100 quarantined a legitimate round, which then fails `nothingQuarantined` forever. Observed range 75–902. |
| 4 | RLS block covered 4 tables | covers all 7 | The prose already required every table; the SQL omitted `source_snapshots`, `ingestion_runs`, `quarantined_rows`. |
| 5 | `fetchRecent` fails after 6 hours | configurable, default 72h | The cadence is weekdays 08:00–20:00 ET, so a fixed 6-hour window fails every night and all weekend. |
| 6 | `RuleSet` had no `effectiveTo` | added | §6 requires `crs-2024` to set `effectiveTo` 2025-03-24, and `rule_sets` has the column. |
| 6 | Skill transferability had two pairs | three | IRCC's grid has a **certificate of qualification** pair (max 50), on CLB 5/7 thresholds rather than CLB 7/9. |
| 6 | CRS grid at `.../grid.html` | `.../check-score/crs-criteria.html` | The old URL 301-redirects. With `redirect: 'manual'` a stale constant is a hard failure. |
| 3 | `classes` implied pool bucket definitions | it is the string `"wb-tables"` | The dd1–dd18 CRS ranges are not in the JSON at all; they exist only in the HTML. |
| 6 | Spouse scored on the applicant's first official language | spouse declares their own | IRCC asks which test the **spouse** took as its own question. Deriving it scored a spouse with a perfect test in the other language 0 of 20, and blamed them for not supplying it. |
| 6 | Rule sets validated for shape only | references checked at load | A `subCap` naming an undeclared group inherited no cap (skill transferability 50 → 100); an `input` with a typo scored the factor 0 (136 points) and reported it as the candidate's omission. Both are one character and neither was visible in the output. |

Confirmed **correct** as written, having been checked rather than assumed:

- **Arranged employment is zero.** The current criteria page contains no mention of it; the only
  "job offer" text on the page describes its removal. §6's warning stands.
- Core caps of 500, or 460 with an accompanying spouse, match the published grid exactly
  (110+150+160+80 = 500; 100+140+150+70 = 460).
- French bonus is 25 or 50, keyed on NCLC 7+ and whether English is CLB 5+.
- Provincial nomination is 600.
- `invitations between 1 and 200000` holds: the observed range is 4–27,332.

One data-quality note that is IRCC's, not ours: `drawDate` and `drawDateTime` disagree on 11 rounds —
usually by under a day, which is the Ottawa timezone boundary, but once by ten days. `drawDateTime` is
free text in 11 different formats and `new Date()` fails on 418 of 438 rounds, while `drawDate` is
clean ISO in all of them. See `packages/ingester/src/dates.ts` for how the two are reconciled.
