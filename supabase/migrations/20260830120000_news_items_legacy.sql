-- Record news_items, which exists in the database but in no migration.
--
-- This table predates the current schema. It was created by the earlier
-- abandoned attempt at this app and deliberately kept by
-- 20260823090000_drop_legacy.sql, which dropped that attempt's other tables:
-- it holds 100 real IRCC news items spanning November 2024 to July 2026, and
-- re-scraping that history may not be possible. Nothing reads or writes it -
-- news ingestion is build step 6 - but the rows are worth keeping.
--
-- Until now the only record of its shape was the live database. The legacy
-- migration that created it was applied to production and never existed as a
-- file here, so a database rebuilt from this directory came out one table
-- short and nobody would have noticed until step 6 went looking for the
-- history. This file closes that gap: it is a transcription of the table as it
-- actually stands, taken from the live schema on 2026-08-30, not from the
-- legacy migration's SQL - that migration also created draws, profiles and
-- pool_snapshots, which drop_legacy removes one migration later and which have
-- no business reappearing here.
--
-- Written idempotently because production already has all of this. The
-- migration ledger records it as applied, so it will only ever execute against
-- a fresh environment.

create table if not exists news_items (
  id           bigserial   primary key,
  external_id  text        not null unique,
  published_at timestamptz not null,
  title        text        not null,
  summary      text,
  url          text        not null,
  tags         text[]      not null default '{}'
);

create index if not exists news_published_at_idx on news_items (published_at desc);

alter table news_items enable row level security;

-- Public read, matching the other reference tables. create policy has no
-- "if not exists" form, so the drop makes re-running this safe.
drop policy if exists "news_items public read" on news_items;
create policy "news_items public read" on news_items for select to anon, authenticated using (true);
