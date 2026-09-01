# Step 5 — Accounts and saved profiles

Date: 2026-08-31
Status: built and verified end to end against the live project on 2026-09-01

`ARCHITECTURE.md` §9 step 5: *"Accounts + saved profiles. Score-over-time falls
out of this for free."*

---

## 1. What this builds

| Route | Answers |
|---|---|
| `/account` | Sign in, see what this account holds, sign out, delete it. |
| `/auth/confirm` | Where a magic link lands. Not a page. |
| `/history` | Every score I have saved, dated, with movement. |
| `/calculator` | Gains a save/load panel. Otherwise unchanged. |

## 2. The thing that makes this step different

**This is the first step that stores personal data.** A CRS `Profile` is
personal information under PIPEDA, Quebec Law 25 and GDPR. Step 4 deliberately
scored in the browser so the project never had to hold one, and this step gives
that up on purpose. Three consequences run through every decision below: store
the minimum, scope every row to its owner, and make erasure real.

## 3. Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Sign-in | Magic link by email | No password is created, stored, reset or typed. The smallest surface available. |
| Key boundary | Auth runs server-side | See §4. |
| Saved profiles | One per account | Save overwrites, load restores. Several named profiles is a real request to take with evidence. |
| History | Total and rule set only | Data minimisation — see §5. |
| Scoring | Still in the browser | Unchanged from step 4. Only saving sends anything. |

## 4. The blocker, and how it was resolved

**`CLAUDE.md`:** *"The anon key is never `NEXT_PUBLIC_`-prefixed. It is read
server-side, in server components, so no key reaches the browser at all."*
Supabase Auth's ordinary browser flow requires exactly that key in the bundle.
Both could not hold.

**The requirement won.** The browser never talks to Supabase: sign-in, sign-out,
save, load and delete all run in Server Actions, and the magic link lands on one
Route Handler. The session lives in httpOnly cookies that `@supabase/ssr` reads
and writes server-side, which no script on the page can reach — strictly safer
than a browser-held session, not merely equivalent.

Verified rather than assumed: a scan of the 16 built client chunks finds zero
occurrences of the anon key, the service role key, or the project URL.

`proxy.ts` (Next 16's name for what was `middleware.ts`) refreshes the session
cookie. It has to exist because server components cannot set cookies, so a
refreshed token would otherwise be computed and thrown away.

One new dependency, `@supabase/ssr`, pinned exactly. It requires
`@supabase/supabase-js` ≥ 2.112.4, so both packages moved 2.112.3 → 2.112.4 in
lockstep.

## 5. Schema

`supabase/migrations/20260830233000_accounts.sql`.

```sql
saved_profiles  (user_id pk -> auth.users on delete cascade, profile jsonb, updated_at)
assessments     (id, user_id -> auth.users on delete cascade, rule_set_id, total, created_at)
```

- `saved_profiles`, not `profiles`: the Supabase convention reserves the latter
  for account metadata.
- **`assessments` holds no profile snapshot.** A copy of the answers per save
  would multiply the personal data held, for a page that renders a date, a score
  and a movement. The index is §8's `(user_id, created_at desc)`.
- `rule_set_id` is text, not a foreign key: `rule_sets` is unpopulated because
  both rule sets live in code, so the constraint would reject every insert.

RLS is on, every policy is scoped to `auth.uid()`, and **there is no `anon`
policy on either table** — the first tables in this schema that are not
public-read. Table-wide privileges are revoked from `anon` as well, so a policy
someone widens later still cannot reach them.

No `update` policy on `assessments`: a recorded estimate is a fact about a
moment, and editing one would make the history a record of nothing. Delete is
allowed, because erasure is a right; rewriting is not the same thing.

**Deleting an account without the service role key.** `apps/web` holds only the
anon key, so it cannot call the admin API. `public.delete_own_account()` is a
`security definer` function that deletes `auth.users where id = auth.uid()`; the
two foreign keys cascade. Its `set search_path = ''` and fully-qualified table
name are load-bearing — without them a `security definer` function is a
privilege escalation waiting for someone to create a table with the right name.

## 6. The promise step 4 made

`/calculator` said, in bold: *"Nothing you type here is sent anywhere or saved."*
That stops being true the moment a save button exists, so it now reads:

> **Your answers stay in your browser while you work.** The calculation runs
> entirely on this page. Nothing is sent anywhere unless you choose to save it to
> an account, and without one this page has nowhere to send it at all — close the
> tab and your answers are gone.

Recorded in `ARCHITECTURE.md` §11. A promise that quietly stops being true is
worse than one that was never made.

**`/calculator` stays statically rendered.** Detecting sign-in there would have
made the app's busiest page dynamic for every anonymous visitor, against §8's
"keep the read path cacheable". The save panel renders for everyone and the
Server Action says "you are signed out" if it needs to. `/account` and
`/history` are `force-dynamic`, and say so in a comment so nobody copies a
`revalidate` onto them later and serves one person's page to the next.

## 7. Testing

No live database, as always. The auth flow is the part automated tests cannot
reach; §8 records what was exercised by hand instead.

- `scoreHistory.test.ts` — ordering, deltas, the same-second tie-break, and the
  withheld movement across a rule-set change.
- `profileMapping.test.ts` — `toProfile(toForm(p))` round-trips unchanged and
  scores the same, across three profiles. A saved profile that came back subtly
  different would be the worst bug this app could have: silent, personal, and
  about immigration.
- `savedRows.test.ts` — a malformed stored profile is rejected rather than
  rendered, and `assessments` carries no profile column.
- `boundaries.test.ts` — `authClient.ts` and `accountQueries.ts` join the list no
  client component may import, and a new block asserts that **nothing anywhere in
  `apps/web` logs a profile, logs form state, or calls `console` at all**.

361 tests across 22 files.

## 8. Verified against the live project, 2026-09-01

Migration applied with `supabase db push` — 9 local files, 9 ledger rows, all
timestamps matching. Never the MCP `apply_migration` tool, which stamps its own
timestamp and breaks the ledger.

| Check | Result |
|---|---|
| Magic link → signed in | works, with Supabase's **stock** email template |
| Calculator total | 379, matching the `single, 29, bachelor, CLB 9` fixture |
| Save | one `saved_profiles` row (14 keys), one `assessments` row |
| History | `391 (+12)` over `379 (—)`, newest first |
| Load | same answers, same score, on a fresh page load |
| Sign out | session cleared; `/history` shows a prompt and no data |
| Load while signed out | reports it, changes nothing |
| RLS isolation | owner sees 1 profile / 2 assessments; **another signed-in user sees 0 / 0** |
| `anon` against both tables | read, insert and rpc all refused |
| Delete account | `auth.users` 1 → 0, and both tables cascaded to 0 |

### One correction the testing forced

The email link arrives as `/auth/v1/verify?token=pkce_…&redirect_to=/auth/confirm`,
which bounces back with **`?code=`**, not `?token_hash=`. That is what the stock
template produces, and `@supabase/ssr` uses PKCE by default. The route now
accepts both — see its header comment — so **no email template needs editing**,
which removes the configuration step this document originally demanded.

### Still unexercised

- **The delete button itself.** Deletion was driven by calling
  `delete_own_account()` as the authenticated user, which is exactly what the
  button does, but the typed-confirmation UI was not clicked: the built-in email
  sender hit its rate limit before a session could be re-established.
- **Email delivery at any volume.** Custom SMTP is off, so Supabase's built-in
  sender applies: a couple of messages an hour, only to project members. Enough
  for testing and useless for real users. A provider is a deployment decision.

## 9. Done when

- A magic link signs you in, and no password exists anywhere in the system
- The anon key still never reaches the browser (asserted against the built bundle)
- Save stores the profile and records one assessment; load restores the answers
  and the same score
- `/history` shows dated scores with movement, withheld across a rule-set change
- Deleting an account removes the profile and the history
- One account cannot see another's rows, verified by signing in as each in turn
- Signed out, `/calculator` behaves exactly as it did in step 4
- `pnpm typecheck`, `pnpm test` and `pnpm build` all clean
