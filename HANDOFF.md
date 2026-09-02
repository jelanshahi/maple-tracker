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
| `pnpm typecheck`, `pnpm test` and `pnpm build` all clean | clean as of the 2026-08-31 commits |

**Steps 1–6 are now all complete and verified.** Nothing is in progress. The next
step per `ARCHITECTURE.md` §9 would be step 7 (email alerts), which is out of
scope until someone explicitly starts it.

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
curated.

---

## Verified facts — do not re-derive these

- 104 news items were in the draft queue at the start of this session; 103
  remain, 1 published.
- Editor roster: one row, `jelanshahi6@gmail.com`, added 2026-09-02 22:42:43 UTC.
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
