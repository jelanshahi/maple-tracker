# Maple Tracker

Express Entry draw tracking and a Comprehensive Ranking System calculator, for people
navigating Canadian permanent residence.

**Not affiliated with, endorsed by, or connected to Immigration, Refugees and Citizenship
Canada or the Government of Canada.** This is an independent personal project. Nothing here
is immigration advice. For anything that matters, use the official sources linked below.

---

## If you are here from our User-Agent

You have probably seen this in your logs:

```
MapleTracker/0.1 (+https://github.com/jelanshahi/maple-tracker)
```

That is this project. Here is what it does, so you do not have to guess.

**What it reads.** One file, the published Express Entry rounds-of-invitations dataset:

```
https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json
```

That is the whole footprint. No crawling, no link-following, no scraping of HTML pages, and
no other host. The URL is a constant in the source — it is never built from anything the
project reads back, so it cannot be pointed anywhere else by bad data.

**How often.** One request per run. Runs are intended for business hours, not a loop. A run
whose response is byte-identical to the last one stops there and writes nothing.

**How it behaves.**

| | |
|---|---|
| Requests per run | 1 |
| Timeout | 15 seconds |
| Response size cap | 10 MB, stream abandoned past it |
| Retries | at most 3, on 5xx and network errors only |
| Backoff | exponential with jitter, from 1 second |
| On a 4xx | stops immediately and waits for a human — never retried |
| Redirects | not followed; an unexpected one fails the run |
| Hosts contacted | `www.canada.ca`, and nothing else |

A 4xx is never retried on purpose. If the URL moves, the right response is for a person to
look at it, not for a script to keep asking.

**If this is a problem, say so and it stops.** Open an issue on this repository, or contact
the account that owns it. If you would prefer it fetch less often, at a different time, or
not at all, that is a reasonable thing to ask for and it will be honoured — a note asking
it to stop is enough, no explanation needed.

---

## What it does

Rounds of invitations are published by IRCC as a JSON dataset. This project keeps a copy so
draw history can be queried, charted and compared against a candidate's own score, and
scores that history against the CRS rules in force at the time.

Two pieces exist today:

- **`packages/ingester`** — fetches the rounds dataset, validates it, and stores it. Writes
  are idempotent: running twice in a row changes nothing and records a `no_change` run. Rows
  that fail validation are quarantined for review rather than dropped or forced through, and
  a bad row never blocks the good ones.
- **`packages/crs-rules`** — a pure CRS scoring engine with no I/O of any kind. Rule sets are
  data, not code, so the scoring rules for a given date are a versioned file rather than a
  branch in a function. Points values are transcribed from IRCC's published criteria and
  checked against IRCC's own calculator.

There is no website yet, no API, and no accounts.

## Data and privacy

The ingester reads a public dataset and stores public information: draw dates, cut-off
scores, invitation counts, and round categories. It collects nothing about anybody.

The CRS engine scores a profile in memory and returns a number. It has no network access, no
storage, and no analytics — it cannot phone home because it has nothing to phone home with.
No profile is currently persisted anywhere.

## Sources

Everything comes from official Government of Canada pages. Third-party immigration sites and
calculators are not used as sources — many still show the arranged-employment points that
were removed on 25 March 2025.

- [Rounds of invitations](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html)
- [CRS criteria](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/check-score/crs-criteria.html)
- [Official CRS calculator](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/check-score.html)

Where a number is historical and no longer published, the source is an Internet Archive
capture of the original page, cited in the rule set that uses it.

## Contact

Open an issue on this repository. That is the fastest route, and it is monitored.

## Running it

Requires Node 20+ and pnpm.

```
pnpm install
pnpm test        # unit tests, then a dependency audit
pnpm typecheck
pnpm ingest      # one ingestion run
```

`pnpm ingest` needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `INGEST_CONTACT_URL` in
`.env` — see `.env.example`. The tests themselves never touch the network; they run against
recorded fixtures committed to the repository. `pnpm test` then finishes with `pnpm audit`,
which does query the registry, so that step needs a connection.
