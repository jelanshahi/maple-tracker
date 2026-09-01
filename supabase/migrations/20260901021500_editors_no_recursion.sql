-- Fix: the editors policy in 20260901020000_news_review.sql recurses.
--
-- That migration gave `editors` this policy:
--
--   using (exists (select 1 from editors where editors.user_id = auth.uid()))
--
-- Reading `editors` runs the policy, which reads `editors`, which runs the
-- policy. Postgres stops it with "infinite recursion detected in policy for
-- relation editors" - and because the two news_items editor policies evaluate
-- that same subquery, every editor path failed, not just the roster read.
--
-- It went unnoticed by the anon checks because anon has no privileges on
-- editors at all and the public news policy is a plain status comparison, so
-- neither ever evaluates the recursive rule. It surfaced the moment a signed-in
-- non-editor was simulated.
--
-- The fix is the standard one: ask the question in a security definer function,
-- which runs as its owner and so is not subject to the policy it is being used
-- to evaluate. `set search_path = ''` and the schema-qualified table are
-- load-bearing here for the same reason they are on delete_own_account.

create function public.is_editor() returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (select 1 from public.editors where user_id = (select auth.uid()));
$$;

revoke execute on function public.is_editor() from anon, public;
grant  execute on function public.is_editor() to authenticated;

-- The function only ever reports on the caller: it takes no argument and reads
-- auth.uid() itself, so an editor cannot use it to ask about anybody else.

drop policy "editors see the roster" on editors;

-- An editor needs to know they are one; nobody needs the whole roster. This is
-- non-recursive on its own terms - it compares a column to auth.uid() rather
-- than querying the table again - and it is all isEditor() in the web app asks.
create policy "editors see their own row"
  on editors for select to authenticated
  using (user_id = (select auth.uid()));

drop policy "editors read every news item" on news_items;
drop policy "editors review news items" on news_items;

create policy "editors read every news item"
  on news_items for select to authenticated
  using (public.is_editor());

create policy "editors review news items"
  on news_items for update to authenticated
  using (public.is_editor())
  with check (public.is_editor());
