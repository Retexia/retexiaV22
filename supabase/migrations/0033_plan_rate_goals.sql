-- =====================================================================
-- 0033: Retexia Plan: two kinds of target.
--
--   total : a total by the end            "150 orders this month"
--   rate  : a daily / weekly / monthly    "100 orders a day by 30 Nov"
--           level to reach by the end      (grain = per day / week / month;
--                                           values in the same day add up)
--   value : a level (each value replaces the last: weight, balance)
--
-- baseline = where a rate starts ("40 a day now"); empty = the first day logged.
-- Safe to run again.
-- =====================================================================

alter table plan.charts drop constraint if exists charts_mode_check;
alter table plan.charts add constraint charts_mode_check check (mode in ('total', 'value', 'rate'));

alter table plan.charts add column if not exists baseline numeric;

-- A rate is per day / week / month, so it is always on a time axis.
alter table plan.charts drop constraint if exists charts_rate_time_check;
alter table plan.charts add constraint charts_rate_time_check check (mode <> 'rate' or x_mode = 'time');

comment on column plan.charts.mode is 'total = values add up to a total by the end; rate = values add up per grain (day/week/month) and the target is that per-grain level by the end; value = each value is the new level.';
comment on column plan.charts.baseline is 'Rate charts: the level at the start (e.g. 40 orders a day). Empty: the first day/week/month logged.';
