-- Accounts: a saved CRS profile per user, and the score history that falls out
-- of saving one. ARCHITECTURE.md section 9, step 5.
--
-- READ THIS FIRST. Every other table in this schema is public-read: draw_rounds,
-- categories, programs, pool_snapshots, rule_sets, news_items all carry a
-- "public read" policy for anon and authenticated. These two are the first that
-- do not, and the difference is the whole point of the file.
--
-- A CRS profile is personal information under PIPEDA, Quebec Law 25 and GDPR.
-- Until this migration the project never stored one - step 4 scores in the
-- browser precisely so it never had to. There is deliberately NO policy for
-- anon on either table, and the policies that do exist are scoped to
-- auth.uid(), so a row is reachable only by the account that owns it.

create table saved_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  profile    jsonb       not null,
  updated_at timestamptz not null default now()
);

-- Named saved_profiles rather than profiles: the Supabase convention reserves
-- `profiles` for account metadata, and this holds a CRS profile. One row per
-- user - saving overwrites. Several named profiles is a real feature request to
-- take with evidence, not a guess made now.

comment on table saved_profiles is
  'One CRS profile per account. Personal information - never log it, never expose it to anon.';

create table assessments (
  id          bigserial   primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  rule_set_id text        not null,
  total       integer     not null,
  created_at  timestamptz not null default now(),
  constraint assessment_total_plausible check (total between 0 and 1200)
);

-- The total and the rule set that produced it. NOT a snapshot of the answers:
-- a copy of the profile per save would multiply the personal data held, for a
-- page that only ever renders a date, a score and a movement. Data
-- minimisation is an obligation here rather than a preference.
--
-- rule_set_id is text and deliberately not a foreign key to rule_sets. That
-- table is not yet populated - crs-current and crs-2024 live in code, in
-- packages/crs-rules - and a constraint pointing at an empty table would reject
-- every insert. Revisit when rule sets are actually stored.

comment on table assessments is
  'A user''s own past CRS estimates. Not IRCC scores. Personal information.';

-- ARCHITECTURE.md section 8 names this index: assessments is the only table
-- here that genuinely grows, and it is always read newest-first for one user.
create index assessments_user_created_idx on assessments (user_id, created_at desc);

alter table saved_profiles enable row level security;
alter table assessments    enable row level security;

create policy "own saved profile"
  on saved_profiles for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own assessments read"
  on assessments for select to authenticated
  using (auth.uid() = user_id);

create policy "own assessments write"
  on assessments for insert to authenticated
  with check (auth.uid() = user_id);

create policy "own assessments delete"
  on assessments for delete to authenticated
  using (auth.uid() = user_id);

-- No update policy on assessments. A recorded estimate is a fact about a moment
-- and editing one would make the history a record of nothing. Deleting is
-- allowed because erasure is a right; rewriting is not the same thing.

-- Supabase grants table-wide privileges to anon by default. Take them back:
-- the absence of a policy already denies access, but a privilege that was never
-- granted cannot be re-opened by a policy someone widens by accident later.
-- This is the same belt-and-braces reasoning as the ingestion_runs column grant
-- in 20260828193000_public_verification_time.sql.
revoke all on saved_profiles from anon;
revoke all on assessments    from anon;

-- Deleting an account without the service role key.
--
-- apps/web holds only the anon key - CLAUDE.md is explicit that the service
-- role key never goes near it - so it cannot call the admin API to remove a
-- user. A security definer function lets a caller delete their own auth.users
-- row and nothing else, and the two foreign keys above cascade, so the saved
-- profile and the whole history go with it.
--
-- `set search_path = ''` and the fully qualified auth.users are load-bearing,
-- not style. A security definer function without them resolves its names
-- against the caller's search_path, which is a privilege escalation waiting for
-- someone to create a table with the right name. The where clause is what
-- scopes this to the caller: auth.uid() is null when unauthenticated, and
-- `id = null` matches no rows.
create function public.delete_own_account() returns void
  language sql
  security definer
  set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_own_account() from anon, public;
grant  execute on function public.delete_own_account() to authenticated;
