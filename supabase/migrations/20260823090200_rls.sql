-- Row Level Security. See ARCHITECTURE.md section 4.
--
-- RLS is enabled on EVERY table, including ones nothing reads yet. Turning it on
-- after a client exists is how data leaks. The section 4 SQL block listed only
-- four tables while its prose required all of them; all seven are covered here.

alter table categories       enable row level security;
alter table draw_rounds      enable row level security;
alter table pool_snapshots   enable row level security;
alter table rule_sets        enable row level security;

-- Operational tables: RLS on, deliberately NO policies at all. Service role only.
-- Do not add a policy to these without a reason written down.
alter table source_snapshots enable row level security;
alter table ingestion_runs   enable row level security;
alter table quarantined_rows enable row level security;

create policy "public read draws"      on draw_rounds    for select to anon, authenticated using (true);
create policy "public read categories" on categories     for select to anon, authenticated using (true);
create policy "public read pool"       on pool_snapshots for select to anon, authenticated using (true);

-- Proposed rule sets stay server-side until launch. Do not widen this.
create policy "public read rulesets"   on rule_sets      for select to anon, authenticated using (status <> 'proposed');
