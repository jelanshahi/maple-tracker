-- Seed the category-based selection streams.
--
-- draw_rounds.category_code is a foreign key, so an unseeded category makes
-- Postgres reject an otherwise valid round. Without this seed the entire
-- historical backfill quarantines.
--
-- Codes are our own stable identifiers, not IRCC's - IRCC only publishes display
-- names, and it has renamed and re-versioned streams repeatedly ("Healthcare
-- occupations (Version 1)" became "Healthcare and Social Services Occupations,
-- 2026-Version 3"). The parser normalises names onto these codes.
--
-- active_from is the date of the FIRST OBSERVED draw for the stream in IRCC's
-- rounds payload, not an official start date - IRCC does not publish one.
-- active_to is left null for every row: IRCC does not publish retirement dates
-- either, and streams get re-introduced. Filling it in would be inventing a fact.

insert into categories (code, label, active_from, active_to) values
  ('healthcare',      'Healthcare and social services occupations',    '2023-06-28', null),
  ('stem',            'STEM occupations',                              '2023-07-05', null),
  ('french',          'French-language proficiency',                   '2023-07-07', null),
  ('trades',          'Trades occupations',                            '2023-08-03', null),
  ('transport',       'Transport occupations',                         '2023-09-20', null),
  ('agriculture',     'Agriculture and agri-food occupations',         '2023-09-28', null),
  ('education',       'Education occupations',                         '2025-05-01', null),
  ('physicians',      'Physicians with Canadian work experience',      '2026-02-19', null),
  ('senior-managers', 'Senior managers with Canadian work experience', '2026-03-05', null),
  ('military',        'Skilled military recruits',                     '2026-07-23', null);
