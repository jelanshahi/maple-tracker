-- Narrow what a reviewer may write on news_items, from "every column" to the
-- four a review decision actually consists of.
--
-- 20260901020000_news_review.sql gave editors this:
--
--   create policy "editors review news items"
--     on news_items for update to authenticated
--     using (...) with check (...);
--
-- An RLS policy chooses WHICH ROWS, never which columns, and Supabase's default
-- grants hand `authenticated` table-wide UPDATE on every column. So the policy
-- that was meant to say "an editor may decide an item" in fact said "an editor
-- may rewrite an item", and the only thing standing between an editor and an
-- edited headline was that ReviewItem.tsx renders no input for one. That file
-- states the invariant plainly - "There is deliberately no way to edit the title
-- or the summary" - and a comment in a React component is not an access control.
--
-- Two concrete consequences, both reachable with a PATCH straight to PostgREST:
--
--   1. title, summary and url are writable. Rewording a summary while leaving
--      IRCC's link attached misrepresents the department, which is the exact
--      thing CLAUDE.md forbids ("Don't reword an IRCC headline or summary").
--   2. external_id is writable. Change it on a rejected row and the next
--      `pnpm ingest:news` no longer recognises that release as known, so it
--      inserts a fresh draft of it - breaking step 6's "a rejected item does not
--      come back on the next run".
--
-- The fix is a column-level grant, which is the only thing in Postgres that
-- answers "which columns", RLS having no opinion on the question.

revoke insert, update on news_items from anon, authenticated;

-- Rows arrive only from the ingester, which holds the service role and bypasses
-- RLS entirely. 20260901020000 already said "No insert or delete policy on
-- news_items for anyone" - this is that sentence made true at the grant level
-- too, rather than resting on the absence of a policy.

grant update (status, reviewed_at, reviewed_by, tags) on news_items to authenticated;

-- Exactly the four columns recordDecision writes. An editor still decides every
-- item they can already see; they can no longer restate what IRCC said, and
-- they can no longer make a rejected item eligible for re-ingestion.
--
-- anon keeps SELECT and nothing else. Its reads were already confined to
-- published rows by "news_items published are public"; this removes the
-- write grants that RLS was silently carrying the whole weight of.
