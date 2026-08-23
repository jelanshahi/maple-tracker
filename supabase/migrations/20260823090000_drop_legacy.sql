-- Drop the schema left by the earlier abandoned attempt at this app.
--
-- Row counts were verified with an actual count(*) immediately before writing
-- this migration, not with a planner estimate: draws, pool_snapshots and
-- profiles all held 0 rows. pool_snapshots is recreated with a different shape
-- in the next migration.
--
-- news_items is deliberately NOT dropped. It holds 100 real IRCC news items
-- spanning November 2024 to July 2026, harvested by the earlier attempt.
-- News ingestion is out of scope for build steps 1 and 2, so nothing here reads
-- or writes it, but re-scraping that history later may not be possible. It stays
-- until step 6 decides what to do with it.

drop table if exists public.draws          cascade;
drop table if exists public.profiles       cascade;
drop table if exists public.pool_snapshots cascade;
