# HANDOFF

Written 2026-09-02, end of the session that closed out step 6 verification.

Read `CLAUDE.md` first — it is how we work. This file is only what a fresh agent
cannot reconstruct from the repo: what just changed, what is verified, and the
things that will waste your afternoon if nobody warns you.

---

## Where the project is

**Step 6 (news and the review console) is complete, code and verification both.**
The code was committed on 2026-08-31 (`a714965` and earlier); this session closed
the one gap noted at the time — the review flow had never actually been exercised
end-to-end, because Supabase had no working SMTP provider to send magic links.

Every item in `CLAUDE.md`'s definition of done for step 6 is now checked with
evidence:

| Requirement | State |
|---|---|
| `pnpm ingest:news` fills the queue; running twice inserts nothing the second time | verified in the 2026-08-31 session |
| A rejected item does not come back on the next run | insert-only store, verified in the 2026-08-31 session |
| Drafts are invisible to anon and to signed-in non-editors | RLS policies in place; `/review` 404s for a non-editor |
| `/review` 404s for anyone who is not an editor | confirmed this session — an editor sees the queue, not a 404 |
| Published items render on `/news` in IRCC's own words, linking to the release | confirmed this session — see below |
| `pnpm typecheck`, `pnpm test` and `pnpm build` all clean | 390 tests, clean as of `b7b4c3e` |

**Steps 1–6 are now all complete and verified.** Step 7 followed on 2026-09-03:
the what-if panel on `/calculator`, built and verified against the running page.
`ARCHITECTURE.md` §9 was renumbered to make room for it, so **email alerts are
now step 8 and mobile step 9** — a reference to "step 7 email work" written
before that date means step 8.

A code review after that verification found six things, all fixed in `6267d9c`
and `b7b4c3e` — see "What the code review found" below. Two of them were holes
the verification could not have caught by clicking through the console, which is
the argument for running the review even when the feature demonstrably works.

---

## What this session did

It picked up from the 2026-08-31 session's stated blocker: Supabase's built-in
email sender is rate-limited and unsuitable for real verification, and the plan
left behind was to wire in Resend as custom SMTP, then run the full review flow
by hand.

1. **Resend account created**, API key generated (by the user — account creation
   and pasting API keys into forms are both things this assistant does not do on
   a user's behalf, by design).
2. **Supabase custom SMTP configured** at Authentication → Emails → SMTP Settings:
   sender `onboarding@resend.dev` ("Maple Tracker"), host `smtp.resend.com`, port
   465, username `resend`, password = the Resend API key. Saved successfully.
   **Note:** a stale SMTP config already existed here from an earlier attempt,
   with a Gmail address as the username — that's wrong for Resend (username must
   be the literal string `resend`) and was overwritten.
3. **Magic-link sign-in verified** — user confirmed this manually.
4. **Editor grant** — inserted `9c854980-fcbb-40b1-b4a2-abd35d3e2f08`
   (`jelanshahi6@gmail.com`) into `editors`. Per the schema comment, this table
   deliberately has no self-service insert path; it's a manual database write
   every time, by design.
5. **`/review` verified** — signed-in editor sees the queue (104 drafts at the
   time), not a 404.
6. **One item published** — "Minister Miller celebrates National Francophone
   Immigration Week" (Nov 4, 2024) — and confirmed it renders on `/news` in
   IRCC's own wording with a working source link. Queue dropped to 103.
7. **The user then reviewed ~30 items by hand**, which is why the queue is in the
   seventies rather than at 103.
8. **A code review, and its six fixes.** Below.

---

## What the code review found

All six are fixed, in `6267d9c` (the four substantive) and `b7b4c3e` (the two
smaller). Recorded here because each one is a rule this project already held and
had not actually enforced — the kind of thing that comes back if nobody says why
the code looks the way it does now.

**1. The feed's `link` became an `href` with nothing checking it.**
`entrySchema` accepted `z.string()`, and both `/news` and `/review` rendered it
as `<a href>`. A `data:text/html;base64,…` link under a plausible Express Entry
headline would have passed review — a reviewer reads the headline, not the URL
behind it — and landed clickable on the public page. `parseEntry` now requires
the origin to be exactly `https://www.canada.ca`. This is the one value in the
project that a payload turns into a URL; everything else builds URLs from module
constants, which is why the rule reads as absolute in `CLAUDE.md` and needed a
stated exception here rather than a silent one.

**2. A run where every entry failed validation exited 0.**
The guard tested `outcomes.length` (entries *attempted*), so renaming one field
upstream would reject all 50 while the count stayed at 50. The run logged
`{rejected: 50, inserted: 0}` and exited clean — indistinguishable to a cron from
a quiet night, so the queue would have stopped filling silently. Now guarded on
`items.length` as well.

**3. Both news reads truncated silently at their row limit.**
Every other bounded read here throws when it hits its cap (`queries.ts`,
`store.ts`); these two returned a short list. The queue orders *oldest first*, so
the rows a truncation drops are the newest — exactly the ones an editor needs.
The queue reaches 500 by doing nothing: 100 legacy drafts plus up to 50 a night.

**4. The editor UPDATE policy chose rows but never columns.**
`using (public.is_editor())` says which rows; Postgres grants said which columns,
and the default grant was every column. So an editor could PATCH `title`,
`summary` or `url` — defeating the invariant `ReviewItem.tsx` states in prose
("There is deliberately no way to edit the title or the summary") and
`CLAUDE.md` states as a rule. `external_id` was writable too, which would have
made a rejected item eligible for re-ingestion, breaking step 6's own acceptance
criterion. Migration `20260903003000_news_items_column_grants.sql` revokes and
re-grants only `status, reviewed_at, reviewed_by, tags`.

The review found this on `authenticated`; checking the live grants found `anon`
also held table-wide INSERT and UPDATE, blocked only by the absence of a policy.
Both are revoked now, so `20260901020000`'s comment — "No insert or delete policy
on news_items for anyone" — is true at the grant level and not resting on RLS
alone. **Verified with `has_column_privilege`, not by reading the migration:**
title/summary/url/external_id all false, status/tags true, insert false for both
roles.

**5. A lost race between two editors was reported as success.**
`recordDecision` never checked that a row matched. Two editors with the queue
open both see item 42; the first publishes, the second clicks Reject and was told
"Rejected, and it will not come back" about an item live on `/news`. The update
now matches `status = 'draft'` and returns `'recorded' | 'already-decided'`; the
action reports the race instead of lying. A genuine failure still throws.

**6. `/news` dated releases a day later than IRCC did.**
`news.ts` converts Ottawa-local publication times to UTC and `formatDate` renders
UTC, so an evening release rendered as the following day beside a link to a page
IRCC dates the day before. **5 of 104 rows are affected and three of those were
already published**, so this was live. New `formatNewsDate` renders
`America/Toronto`, used by `/news` and `/review` both.

**This last one deliberately departs from `CLAUDE.md`.** That file says
"Timestamps render in UTC and say 'UTC'." The stated reason is that ISR-cached
server renders cannot know a viewer's timezone and must not guess — and a news
date guesses nobody's timezone. It reproduces a date IRCC already fixed and
already printed on the release each item links to, so UTC does not make it more
precise, it makes it disagree with the source. A UTC *label* would not have
helped; the number itself was the problem. **Settled 2026-09-03 in favour of the
code:** `CLAUDE.md`'s web-client rules now carry the exception, and
`ARCHITECTURE.md` §7 carries it with a corrections-log row. The carve-out is one
function wide and does not reach a round's tie-break time.

---

## Things that will waste your time

**1. A stale `next dev` process can survive a session.**

This bit again — see the pattern already noted from earlier sessions. This
session found a leftover dev server (PID 37352) still holding port 3000 from a
previous session that never shut it down cleanly. A fresh `pnpm dev` just moved
to port 3001 instead of failing, which would have meant testing against
possibly-stale code without noticing. Check for and kill orphaned `next dev`
processes before trusting what a running server shows you; don't just accept
the next available port.

**2. Never enter secrets through browser automation.**

Account signup and pasting the Resend API key into the Supabase SMTP form were
both left to the user, on purpose — entering passwords or API keys into any
field is off-limits for this assistant regardless of who asks. If a future
session needs another credential entered somewhere, expect the same split:
navigate to the right page, then hand off the actual typing.

**3. The published test item is not really Express Entry news.**

It was chosen deliberately as a quick verification of the publish path, not for
editorial fit. It is Francophone-immigration-week content, not Express Entry.
Nobody has decided whether to leave it, reject it retroactively (not currently
possible — there's no unpublish/re-reject path in the UI, only draft→published
or draft→rejected), or just let it sit as one non-representative item among
future real approvals. Flag this to the user before treating `/news` content as
curated. Note also that everything published before `b7b4c3e` was reviewed while
finding 6 was live, so three of those items carried a date one day later than
IRCC's own. The stored data was always right; only the rendering was wrong.

**4. The Chrome extension makes `/review` report a hydration error.**

The dev overlay shows "1 Issue" on `/review`: a React hydration mismatch, because
the browser-automation extension injects `data-has-listeners="true"` onto the tag
checkboxes after the server render. It is not an app bug and not caused by
anything in this repo. Do not spend an afternoon on it, and do not "fix" the
checkboxes to make it go away.

Related: clicking those checkboxes or the Publish/Reject buttons by screen
coordinate is unreliable — the click lands on the wrong control. Drive `/review`
through `javascript_tool` (find the `li`, then the button by its text) instead.

---

## Verified facts — do not re-derive these

- 104 news items total. At the end of this session the draft queue was in the
  low seventies: the rest were decided by hand during it, plus one published and
  one rejected as verification.
- Editor roster: one row, `jelanshahi6@gmail.com`, added 2026-09-02 22:42:43 UTC.
- `news_items` grants, checked with `has_column_privilege` after
  `20260903003000`: `anon` has SELECT only; `authenticated` has SELECT plus
  UPDATE on exactly `status, reviewed_at, reviewed_by, tags`; neither can INSERT.
- 5 of the 104 rows have a UTC date one day later than their Ottawa date. That is
  what finding 6 was about; `formatNewsDate` is what handles it.
- Resend's test sender (`onboarding@resend.dev`) only delivers to the account
  owner's own verified email — fine for solo verification, not sufficient for
  real users. A real domain-based sender is a step-7-or-later concern if email
  alerts ever ship.
- Supabase project ref: `ubzmpejcooniohccuqbs` (`maple-tracker`, `jelanshahi's
  Org`).

---

## Useful shape of the web app

Unchanged from the step 3 handoff. Pure logic is in `apps/web/src/`, thin server
components in `apps/web/app/`. See `CLAUDE.md`'s Layout section for the full
file map — `newsQueries.ts`, `newsRows.ts`, and `tags.ts` are the step 6
additions worth knowing about if you're touching `/news` or `/review`.

Two rules that are load-bearing rather than stylistic, still true: order by
`drawn_at` and never by `round_number`, and never `select('*')` from
`draw_rounds`.

---

## Loose ends

- ~~**`CLAUDE.md` and `formatNewsDate` disagree.**~~ Closed 2026-09-03: the
  exception is now written into `CLAUDE.md` and `ARCHITECTURE.md` §7, with a
  corrections-log row. See finding 6 above.
- **`must<T>()` is now byte-identical in four files** — `store.ts`, `queries.ts`,
  `accountQueries.ts`, `newsQueries.ts`. `CLAUDE.md`'s rule of three has been
  reached, so extracting it is now permitted rather than speculative. Nobody has
  done it; it is a choice, not an oversight.
- **Two step 6 acceptance criteria say "asserted against the database" and are
  not automated.** "Drafts are invisible to anon and to signed-in non-editors"
  and "running it twice inserts nothing the second time" were both checked by
  hand. The no-network-in-tests rule may be why, but the wording promises more
  than the suite delivers, and `newsStore.ts`, `newsQueries.ts` and the `/review`
  guard have no tests at all.
- **Resend sends only to the account owner.** `onboarding@resend.dev` will not
  deliver to anyone but `jelanshahi6@gmail.com`. The email-alerts step — now
  step 8 — needs a verified domain first. That is a prerequisite, not a detail.
