# Step 6 — News and the review console

Date: 2026-09-01
Status: built; ingestion and the security boundary verified against the live project.
The console UI itself is unexercised — see §7.

`ARCHITECTURE.md` §9 step 6: *"News + review console. Nightly diff, draft queue,
human approval before publish."*

---

## 1. The finding that shapes the whole step

**IRCC's newsroom is not an Express Entry feed.** The most recent items are
Canada Child Benefit payments, online passport renewal, Francophone minority
community projects, and a Northwest Territories agreement. IRCC publishes
everything the department does.

A news feature that republished that wholesale would add noise to a tracker whose
entire value is signal. That is why §9 puts a human before publish: **the review
console is the relevance filter, not ceremony.** Every other decision here
follows from it.

## 2. What this builds

| Route / command | Does |
|---|---|
| `pnpm ingest:news` | Fetch the newsroom; anything unseen becomes a draft |
| `/review` | Editors only: the queue, oldest first, approve / reject / tag |
| `/news` | Public: what was approved, in IRCC's own words |

## 3. Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Console access | An `editors` table, enforced by RLS | The database refuses drafts to non-editors, not just the UI. |
| The 100 legacy rows | All became unreviewed drafts | Nobody reviewed them. `default 'draft'` made that true without a data migration. |
| Editing | Approve, reject, tag — never reword | A rewritten summary under an IRCC link misrepresents the department, on a site about immigration. |
| Tags | A fixed four-value vocabulary | Free text becomes forty spellings of one idea, and then nothing can filter on it. |
| Scheduling | Out of scope | "Nightly" is a cron's job and CLAUDE.md rules out deployment config. This ships a command. |

## 4. Verified before wiring, per §3

- **There is a JSON endpoint**, so no XML parser and no new dependency:
  `api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&…&format=json`,
  entries shaped `{ link, teaser, publishedDate, title }`.
- **`external_id` is `sha256(url)`** — reproduced exactly against a live legacy
  row, and pinned by a test. This is what makes a re-ingest *recognise* the 100
  existing rows instead of duplicating them. The first live run proved it: 50
  entries seen, 4 inserted, **46 already known**.
- **The news API must not be cache-busted.** Appending `_=<timestamp>` makes it
  return zero entries rather than an error, because it reads unknown query
  parameters as filters. The rounds JSON still needs busting, so `fetchDocument`
  takes an explicit `cacheBust` flag and the two callers differ deliberately.

## 5. Structure

```
packages/ingester/
  src/fetch.ts        one implementation, two callers (see below)
  src/news.ts         pure: feed JSON -> candidate rows
  src/newsStore.ts    insert-only
  src/runNews.ts      orchestration
  bin/ingest-news.ts  entrypoint

apps/web/
  app/news/           public page
  app/review/         queue, server action, per-item client component
  src/newsQueries.ts  the reads and the reviewer's writes
  src/newsRows.ts     zod row schemas
  src/tags.ts         pure: the vocabulary
```

**`fetch.ts` was refactored rather than duplicated.** CLAUDE.md allows two
similar functions instead of a helper — but it permits duplication, it does not
require it, and this is the host allowlist, the 10 MB cap, the timeout and the
retry policy. Two copies of security code means a fix to one silently misses the
other. `fetchRoundsPayload` and `fetchNewsPayload` are now four lines each over a
shared `fetchDocument`.

**Insert-only, deliberately.** `on conflict (external_id) do nothing`. An upsert
would refresh a title IRCC edited — and would also resurrect an item a reviewer
already rejected, on every run. A rejected item has to stay rejected without
anyone rejecting it twice. The cost is that an upstream correction never lands,
which is the right trade for a queue whose purpose is a recorded human decision.

**News ingestion writes nothing to `ingestion_runs`.** That table feeds the
staleness banner, which reads the newest `finished_at` of a successful run to say
"last confirmed against IRCC". A news run landing there would refresh that claim
without anyone having checked the *draw* data — the banner would report a
freshness nobody verified, the precise failure §1 exists to prevent.

## 6. The two security corrections

**`using (true)` had to go.** `news_items` carried a public-read policy allowing
everything, harmless while every row was a published IRCC item nothing read. The
moment drafts existed it published every unreviewed item. Replaced, not added
alongside — RLS policies are ORed, so leaving it would have defeated the new one.

**The editor check recursed.** Written inline as
`using (exists (select 1 from editors where user_id = auth.uid()))` **on
`editors` itself**, reading the table runs the policy, which reads the table:
`infinite recursion detected in policy for relation "editors"`. Because the
`news_items` editor policies evaluated the same subquery, *every* editor path
failed, not just the roster read.

It survived the anon checks because anon has no privileges on `editors` and the
public news policy is a plain status comparison, so neither ever evaluated the
recursive rule. Simulating a signed-in non-editor found it in one query. Fixed
forward in `20260901021500_editors_no_recursion.sql` with a `security definer`
`public.is_editor()`, which runs as its owner and so is not subject to the policy
it is being used to evaluate.

## 7. Verified, and not

| Check | Result |
|---|---|
| `pnpm ingest:news` | 50 seen, 0 rejected, 4 inserted, 46 already known |
| Run it again | 0 inserted, 50 already known — idempotent |
| Anon reads `news_items` | 0 rows; every legacy row is a draft |
| Anon reads `editors` | permission denied |
| Signed-in non-editor | `is_editor()` false, 0 news, 0 drafts, 0 editors |
| `/review` signed out | plain 404, no hint the console exists |
| `/news` | renders the empty state with OGL attribution |
| Public draw pages | unaffected; banner still reflects the last *rounds* run |
| 380 tests, typecheck, build | clean |

**Not verified.** The console UI and a published item rendering on `/news` are
both unexercised, for one reason: reviewing needs an editor, an editor needs an
account, and the built-in email sender was rate-limited. Publishing a test item
directly was refused by the environment's write guard, which is the correct
behaviour for an unattended write to a live database. Both resolve together the
moment an account exists — approving one item through the console exercises the
queue, the decision write and the public render at once.

## 8. Adding the first editor

There is no self-service path and there should not be: every bootstrap that lets
an account grant itself review rights is a privilege-escalation path. After
signing in, one statement:

```sql
insert into editors (user_id)
select id from auth.users where email = 'you@example.com';
```
