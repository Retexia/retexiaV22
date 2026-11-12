-- =====================================================================
-- 0032: Retexia Plan: goals with their own length.
--
-- Besides a calendar year, month or week, a goal can run for a number of
-- days, weeks, months or years from the day it starts ("90 days from
-- 12 Nov", "6 months", "2 years"). period = 'custom' with length_n and
-- length_unit; starts_on/ends_on hold the real dates as before.
-- Safe to run again.
-- =====================================================================

alter table plan.goals drop constraint if exists goals_period_check;
alter table plan.goals add constraint goals_period_check check (period in ('year', 'month', 'week', 'custom'));

alter table plan.goals add column if not exists length_n int;
alter table plan.goals add column if not exists length_unit text;

alter table plan.goals drop constraint if exists goals_length_check;
alter table plan.goals add constraint goals_length_check check (
  case when period = 'custom'
       then coalesce(length_n between 1 and 999 and length_unit in ('day', 'week', 'month', 'year'), false)
       else length_n is null and length_unit is null
  end
);

-- At most 10 years: a goal has to end some day.
alter table plan.goals drop constraint if exists goals_span_check;
alter table plan.goals add constraint goals_span_check check (ends_on - starts_on <= 3660);

comment on column plan.goals.period is 'year / month / week = a calendar period; custom = length_n length_unit from starts_on.';
comment on column plan.goals.length_n is 'Custom goals: how many length_units the goal runs (e.g. 90).';
comment on column plan.goals.length_unit is 'Custom goals: day, week, month or year.';
