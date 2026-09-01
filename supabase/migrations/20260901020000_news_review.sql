-- News review: a draft queue, an approval, and an editors roster.
-- ARCHITECTURE.md section 9, step 6.
--
-- IRCC's newsroom covers everything the department does - Canada Child Benefit
-- payments, passport renewal, Francophone community projects - and only a
-- fraction of it concerns Express Entry. So nothing published by IRCC is
-- published by this site until a human has said it is relevant. That is what
-- the status column is for; the review console is the filter, not ceremony.

alter table news_items
  add column status      text not null default 'draft',
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add constraint news_status_known check (status in ('draft', 'published', 'rejected'));

-- The default is what puts the 100 existing rows into the queue. They were
-- harvested by an earlier abandoned attempt and nobody has ever reviewed them,
-- so 'draft' is simply true. Defaulting them to 'published' would have been a
-- lie the schema told, and would have opened the public news page with a
-- backlog of items about passport renewal.

comment on column news_items.status is
  'draft until a human reviews it. Only published rows are publicly readable.';

-- reviewed_by is `on delete set null`, deliberately not cascade: deleting an
-- editor's account must not delete the news they approved. The decision
-- outlives the account that made it.

create index news_status_published_idx on news_items (status, published_at desc);

create table editors (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

comment on table editors is
  'Who may see and review unpublished news. Add a row by hand; there is deliberately no self-service path.';

alter table editors enable row level security;

-- THE IMPORTANT CHANGE.
--
-- 20260830120000_news_items_legacy.sql granted anon `using (true)` on this
-- table, which was harmless while every row was a published IRCC item and
-- nothing read them. The moment drafts exist, that policy publishes them - it
-- would expose every unreviewed item to the world, which is the exact opposite
-- of what this migration is for. Replace it, do not add alongside it: RLS
-- policies are ORed, so leaving the old one in place would defeat the new one.
drop policy "news_items public read" on news_items;

create policy "news_items published are public"
  on news_items for select to anon, authenticated
  using (status = 'published');

create policy "editors read every news item"
  on news_items for select to authenticated
  using (exists (select 1 from editors where editors.user_id = auth.uid()));

create policy "editors review news items"
  on news_items for update to authenticated
  using (exists (select 1 from editors where editors.user_id = auth.uid()))
  with check (exists (select 1 from editors where editors.user_id = auth.uid()));

-- No insert or delete policy on news_items for anyone. Rows arrive only from
-- the ingester, which holds the service role and bypasses RLS; nothing in the
-- web app may create or destroy a news item.

create policy "editors see the roster"
  on editors for select to authenticated
  using (exists (select 1 from editors where editors.user_id = auth.uid()));

-- No insert, update or delete policy on editors at all. Granting an editor the
-- ability to add editors makes the roster self-extending, and there is no
-- bootstrap path for the first one that is not also a privilege-escalation
-- path. Adding an editor is a deliberate, manual insert against the database.

revoke all on editors from anon;
