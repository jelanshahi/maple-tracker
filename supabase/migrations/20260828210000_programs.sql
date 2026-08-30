-- Give program rounds the identity the schema lost.
--
-- round_type 'program' collapses four different programs into one value. Their
-- cut-offs are not on the same scale: Provincial Nominee Program rounds run
-- 663-902 because a nomination is worth 600 points by itself, while Canadian
-- Experience Class rounds run 75-808. Differencing consecutive 'program' rounds
-- to show movement produced -237 points between a PNP round and a CEC round,
-- a confident number describing nothing. See ARCHITECTURE.md section 11.
--
-- The distinction was never lost from the data - it sits in raw.drawName on
-- every row - but nothing could query it without re-parsing free text, which is
-- the ingester's job and not the reader's.
--
-- A lookup table rather than a check constraint, mirroring categories: the
-- foreign key makes an unrecognised program fail loudly instead of landing as a
-- typo, and the label lives here rather than being hardcoded by every reader.
--
-- Programs are not categories and do not go in that table. A category is a
-- selection stream IRCC invents and retires at will; a program is defined in the
-- immigration regulations. Overloading category_code would have made the ladder
-- work without any code change, which is exactly why it was tempting.

create table programs (
  code        text primary key,
  label       text not null,
  active_from date not null,
  active_to   date
);

alter table programs enable row level security;
create policy "public read programs" on programs for select to anon, authenticated using (true);

-- active_from is the first observed round for the program in IRCC's payload, not
-- an official start date - IRCC does not publish one. active_to stays null for
-- the same reason it does on categories: a program going quiet is not a
-- retirement, and inventing an end date would be inventing a fact. Federal
-- Skilled Trades last drew in 2020 and Federal Skilled Worker has exactly one
-- named round, both of which are observations rather than conclusions.
insert into programs (code, label, active_from, active_to) values
  ('cec', 'Canadian Experience Class',   '2015-02-20', null),
  ('pnp', 'Provincial Nominee Program',  '2016-11-30', null),
  ('fst', 'Federal Skilled Trades',      '2017-05-26', null),
  ('fsw', 'Federal Skilled Worker',      '2023-02-02', null);

alter table draw_rounds add column program_code text references programs(code);

create index draw_rounds_program_idx on draw_rounds (program_code, drawn_at desc);

-- Deliberately no constraint yet tying program_code to round_type. The 186
-- existing program rounds are null until the ingester re-derives them from the
-- raw payload it already stored, and a constraint added here would reject the
-- table it is meant to protect. It arrives in a follow-up migration once the
-- backfill has run, which is also the only way to prove the backfill worked.
