-- Tie program_code to round_type now that every program round carries one.
--
-- 20260828210000_programs.sql deliberately left this out: 186 existing program
-- rounds were null until packages/ingester/bin/backfill-program-codes.ts
-- re-derived them from each round's own stored raw.drawName, without
-- re-fetching canada.ca. A constraint added before that ran would have
-- rejected the table it was meant to protect. The backfill has run and
-- verified zero remaining nulls (67 cec, 111 pnp, 7 fst, 1 fsw = 186).
--
-- Mirrors category_iff_category_round in 20260823090100_core_schema.sql.

alter table draw_rounds add constraint program_iff_program_round check (
  (round_type = 'program' and program_code is not null) or
  (round_type in ('general','category') and program_code is null)
);
