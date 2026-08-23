-- Core schema. See ARCHITECTURE.md section 4.
--
-- Two deliberate departures from the schema as first written in that document,
-- both forced by the live IRCC payload and verified against it on 2026-08-23:
--
--   1. round_number is text, not integer. IRCC publishes rounds '91a' and '91b'.
--      parseInt maps both to 91, which collapses two distinct rounds into one row
--      and makes a full backfill land 437 rows instead of 438. Storing IRCC's
--      identifier verbatim keeps the upsert idempotent and lossless. Ordering is
--      by drawn_at, which is indexed below - never by round_number.
--
--   2. cutoff_crs floor is 0, not 100. Round 176 (Canadian Experience Class,
--      13 February 2021) had a cut-off of 75. A floor of 100 quarantines a
--      legitimate historical round and then fails the nothingQuarantined health
--      check forever. Observed range across all 438 rounds is 75..902.

create table categories (
  code        text primary key,
  label       text not null,
  active_from date not null,
  active_to   date
);

create table draw_rounds (
  round_number  text        primary key,
  drawn_at      timestamptz not null,
  round_type    text        not null check (round_type in ('general','program','category')),
  category_code text        references categories(code),
  cutoff_crs    integer     not null,
  invitations   integer     not null,
  tie_break_at  timestamptz,
  source_url    text        not null,
  raw           jsonb       not null,
  ingested_at   timestamptz not null default now(),
  constraint cutoff_plausible      check (cutoff_crs  between 0 and 1200),
  constraint invitations_plausible check (invitations between 1 and 200000),
  -- A category round must name its category; general and program rounds must not.
  constraint category_iff_category_round check (
    (round_type = 'category' and category_code is not null) or
    (round_type in ('general','program') and category_code is null)
  )
);
create index draw_rounds_drawn_at_idx on draw_rounds (drawn_at desc);
create index draw_rounds_category_idx on draw_rounds (category_code, drawn_at desc);

create table pool_snapshots (
  id          bigserial primary key,
  captured_on date    not null,
  bucket_low  integer not null,
  bucket_high integer not null,
  candidates  integer not null,
  source_url  text    not null,
  unique (captured_on, bucket_low)
);

create table rule_sets (
  id             text primary key,
  label          text not null,
  effective_from date not null,
  effective_to   date,
  status         text not null check (status in ('active','superseded','proposed')),
  gazette_ref    text,
  source_url     text not null,
  params         jsonb not null,
  created_at     timestamptz not null default now()
);

-- Retention: keep 90 days, plus every snapshot that produced writes.
-- Noted per ARCHITECTURE.md section 8; deliberately NOT implemented yet.
create table source_snapshots (
  id           bigserial primary key,
  url          text not null,
  fetched_at   timestamptz not null default now(),
  content_hash text not null,
  body         text not null
);
create index source_snapshots_url_idx on source_snapshots (url, fetched_at desc);

create table ingestion_runs (
  id           bigserial primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null check (status in ('running','ok','no_change','failed','quarantined')),
  rows_seen    integer,
  rows_written integer,
  error        text
);
create index ingestion_runs_started_idx on ingestion_runs (started_at desc);

create table quarantined_rows (
  id          bigserial primary key,
  run_id      bigint references ingestion_runs(id),
  reason      text  not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index quarantined_rows_unresolved_idx on quarantined_rows (created_at desc) where resolved_at is null;
