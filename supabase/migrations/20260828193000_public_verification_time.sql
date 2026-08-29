-- Let a client answer "is this data current?" without widening anything else.
--
-- ARCHITECTURE.md section 5 requires every client to surface "last verified at"
-- and to say so plainly when that is over 24 hours old. That timestamp lives in
-- ingestion_runs, which 20260823090200_rls.sql deliberately left with no
-- policies at all - service role only - and which asks for a written reason
-- before any policy is added. This is that reason.
--
-- What anon gets is ONE column, finished_at, on successful runs only. Not the
-- error text, not the row counts, not the run id, not even the existence of a
-- failed run. The column-level grant is what enforces that: a policy widened by
-- accident later still cannot expose the other columns, because the privilege
-- to read them was never granted.
--
-- Two alternatives were considered and rejected:
--
--   max(draw_rounds.ingested_at) - wrong. A no_change run writes no rows, so
--   this timestamp freezes while ingestion is working perfectly, and the UI
--   would announce staleness that does not exist. That is the false alarm
--   section 5 warns about in its own fetchRecent note.
--
--   A view over ingestion_runs - rejected. A Postgres view runs with its
--   owner's privileges by default, so it would bypass RLS silently rather than
--   visibly. A policy plus a column grant does the same job with the mechanism
--   in plain sight.
--
-- Failed runs are excluded on purpose. If ingestion has been failing for a week
-- the newest visible finished_at is a week old, so the staleness banner fires -
-- which is exactly the behaviour we want. A broken run must never be able to
-- pass itself off as a successful check.

create policy "public read verification time"
  on ingestion_runs
  for select
  to anon, authenticated
  using (status in ('ok', 'no_change'));

-- Supabase grants table-wide select to anon and authenticated by default.
-- Take that back first, then hand back exactly one column.
revoke select on ingestion_runs from anon, authenticated;
grant select (finished_at) on ingestion_runs to anon, authenticated;
