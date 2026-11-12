-- =====================================================================
-- 0030: Retexia Plan (plan.retexia.com, free for every Retexia account).
--
-- Schema "plan":
--   settings     one row per person: time zone, WhatsApp morning reminder,
--                weekly email, coach language
--   goals        year / month / week goals (optionally inside a bigger goal)
--   charts       a goal's charts: X = time (day / week / month) or own labels,
--                Y = what the person tracks (unit, adds up or latest value,
--                optional target)
--   points       the values entered on a chart
--   tasks        daily goals: a to-do that can repeat (every day, every N
--                days, chosen weekdays), optionally for a goal
--   completions  a task done on a day (streaks come from these)
--   members      people invited to one goal (viewer or editor)
--   messages     each goal's live chat (people + the Retexia AI coach)
--
-- Goals are private; the owner can invite people per goal. Tasks are
-- personal. post.retexia.com's panels app reads and writes with the service
-- role after its own checks; these RLS rules guard everything else (the live
-- chat in the browser reads plan.messages through Realtime).
-- Scheduler: every 15 minutes Supabase calls the panel (/api/plan/tick) for
-- morning WhatsApp reminders and the weekly email (Vault: plan_tick_url,
-- post_cron_key).
-- Then: Supabase → Project Settings → Data API → Exposed schemas → add "plan".
-- Safe to run again. Run after 0029.
-- =====================================================================

create schema if not exists plan;
grant usage on schema plan to authenticated, service_role;

create table if not exists plan.settings (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  timezone        text not null default 'Asia/Colombo',
  whatsapp        text check (whatsapp is null or whatsapp ~ '^\+?[0-9]{9,15}$'),
  morning_on      boolean not null default false,
  morning_time    time not null default '07:00',
  weekly_on       boolean not null default true,
  coach_language  text not null default 'en' check (coach_language in ('en', 'si', 'singlish', 'ta')),
  last_morning_on date,
  last_weekly_on  date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists plan.goals (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  parent_id  uuid references plan.goals (id) on delete set null,
  title      text not null check (char_length(btrim(title)) between 1 and 140),
  why        text check (why is null or char_length(why) <= 1000),
  period     text not null check (period in ('year', 'month', 'week')),
  starts_on  date not null,
  ends_on    date not null,
  category   text not null default 'custom' check (category in ('income', 'savings', 'business', 'health', 'learning', 'habit', 'custom')),
  status     text not null default 'active' check (status in ('active', 'done', 'dropped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists goals_owner_idx on plan.goals (owner_id, starts_on desc);

create table if not exists plan.charts (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references plan.goals (id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 1 and 80),
  unit       text not null default '' check (char_length(unit) <= 20),
  x_mode     text not null default 'time' check (x_mode in ('time', 'labels')),
  grain      text not null default 'day' check (grain in ('day', 'week', 'month')),
  mode       text not null default 'total' check (mode in ('total', 'value')),
  kind       text not null default 'line' check (kind in ('line', 'bar')),
  target     numeric,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists charts_goal_idx on plan.charts (goal_id, sort);
comment on column plan.charts.mode is 'total: every value adds up (income, savings); value: each value is the new level (weight, balance).';

create table if not exists plan.points (
  id         uuid primary key default gen_random_uuid(),
  chart_id   uuid not null references plan.charts (id) on delete cascade,
  at         timestamptz not null default now(),
  label      text check (label is null or char_length(label) <= 60),
  value      numeric not null,
  note       text check (note is null or char_length(note) <= 280),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists points_chart_idx on plan.points (chart_id, at);

create table if not exists plan.tasks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  goal_id    uuid references plan.goals (id) on delete set null,
  title      text not null check (char_length(btrim(title)) between 1 and 140),
  repeat     text not null default 'none' check (repeat in ('none', 'daily', 'every', 'weekdays')),
  every_n    int not null default 1 check (every_n between 1 and 30),
  weekdays   int[] not null default '{}',
  starts_on  date not null,
  ends_on    date,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists tasks_owner_idx on plan.tasks (owner_id) where not archived;
comment on column plan.tasks.weekdays is 'For repeat = weekdays: 0 = Sunday … 6 = Saturday.';

create table if not exists plan.completions (
  task_id uuid not null references plan.tasks (id) on delete cascade,
  day     date not null,
  done_at timestamptz not null default now(),
  primary key (task_id, day)
);

create table if not exists plan.members (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references plan.goals (id) on delete cascade,
  email      text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id    uuid references auth.users (id) on delete cascade,
  role       text not null default 'viewer' check (role in ('viewer', 'editor')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (goal_id, email)
);
create index if not exists members_user_idx on plan.members (user_id);

create table if not exists plan.messages (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references plan.goals (id) on delete cascade,
  author_id  uuid references auth.users (id) on delete set null,
  kind       text not null default 'user' check (kind in ('user', 'coach')),
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists messages_goal_idx on plan.messages (goal_id, created_at);

-- An invited email that already has a Retexia account is linked at once (otherwise when they first open Plan).
create or replace function plan.link_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.email := lower(btrim(new.email));
  if new.user_id is null then
    select id into new.user_id from auth.users where lower(email) = new.email limit 1;
  end if;
  return new;
end $$;
drop trigger if exists link_member on plan.members;
create trigger link_member before insert or update of email on plan.members for each row execute function plan.link_member();

-- ---------------------------------------------------------------------
-- Who can see / change a goal
-- ---------------------------------------------------------------------
create or replace function plan.can_view(p_goal uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from plan.goals g where g.id = p_goal and g.owner_id = (select auth.uid()))
      or exists (select 1 from plan.members m where m.goal_id = p_goal and m.user_id = (select auth.uid()));
$$;
create or replace function plan.can_edit(p_goal uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from plan.goals g where g.id = p_goal and g.owner_id = (select auth.uid()))
      or exists (select 1 from plan.members m where m.goal_id = p_goal and m.user_id = (select auth.uid()) and m.role = 'editor');
$$;
create or replace function plan.is_owner(p_goal uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from plan.goals g where g.id = p_goal and g.owner_id = (select auth.uid()));
$$;
grant execute on function plan.can_view(uuid), plan.can_edit(uuid), plan.is_owner(uuid) to authenticated, service_role;

alter table plan.settings enable row level security;
alter table plan.goals enable row level security;
alter table plan.charts enable row level security;
alter table plan.points enable row level security;
alter table plan.tasks enable row level security;
alter table plan.completions enable row level security;
alter table plan.members enable row level security;
alter table plan.messages enable row level security;

drop policy if exists own on plan.settings;
create policy own on plan.settings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists read on plan.goals;
create policy read on plan.goals for select to authenticated using (plan.can_view(id));
drop policy if exists own on plan.goals;
create policy own on plan.goals for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists read on plan.charts;
create policy read on plan.charts for select to authenticated using (plan.can_view(goal_id));
drop policy if exists own on plan.charts;
create policy own on plan.charts for all to authenticated using (plan.is_owner(goal_id)) with check (plan.is_owner(goal_id));

drop policy if exists read on plan.points;
create policy read on plan.points for select to authenticated using (plan.can_view((select c.goal_id from plan.charts c where c.id = chart_id)));
drop policy if exists add on plan.points;
create policy add on plan.points for insert to authenticated
  with check (created_by = (select auth.uid()) and plan.can_edit((select c.goal_id from plan.charts c where c.id = chart_id)));
drop policy if exists remove on plan.points;
create policy remove on plan.points for delete to authenticated
  using (created_by = (select auth.uid()) or plan.is_owner((select c.goal_id from plan.charts c where c.id = chart_id)));

drop policy if exists own on plan.tasks;
create policy own on plan.tasks for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists own on plan.completions;
create policy own on plan.completions for all to authenticated
  using (exists (select 1 from plan.tasks t where t.id = task_id and t.owner_id = (select auth.uid())))
  with check (exists (select 1 from plan.tasks t where t.id = task_id and t.owner_id = (select auth.uid())));

drop policy if exists read on plan.members;
create policy read on plan.members for select to authenticated using (plan.can_view(goal_id));
drop policy if exists manage on plan.members;
create policy manage on plan.members for all to authenticated using (plan.is_owner(goal_id)) with check (plan.is_owner(goal_id));
drop policy if exists leave on plan.members;
create policy leave on plan.members for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists read on plan.messages;
create policy read on plan.messages for select to authenticated using (plan.can_view(goal_id));
drop policy if exists post on plan.messages;
create policy post on plan.messages for insert to authenticated
  with check (kind = 'user' and author_id = (select auth.uid()) and plan.can_view(goal_id));

grant select, insert, update, delete on all tables in schema plan to authenticated;
grant all on all tables in schema plan to service_role;

-- Live chat: new messages reach the browser through Realtime (RLS decides who gets them).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'plan' and tablename = 'messages') then
    execute 'alter publication supabase_realtime add table plan.messages';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Emails from Plan (weekly report, goal invitations) go through the outbox.
-- ---------------------------------------------------------------------
create or replace function plan.queue_email(p_event text, p_recipient text, p_user uuid, p_subject text, p_body text, p_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if coalesce(btrim(p_recipient), '') = '' then return null; end if;
  insert into public.notifications_outbox (event, channel, recipient, user_id, subject, body, payload)
  values (p_event, 'email', lower(btrim(p_recipient)), p_user, left(p_subject, 200), left(p_body, 8000), coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function plan.queue_email(text, text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function plan.queue_email(text, text, uuid, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- Scheduler: every 15 minutes the panel sends what is due (morning
-- reminders, weekly emails). Vault: plan_tick_url = https://plan.retexia.com/api/plan/tick
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('retexia-plan-tick', '*/15 * * * *', $c$
      select net.http_post(
        url := s.url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Retexia-Key', k.key),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000)
      from (select decrypted_secret as url from vault.decrypted_secrets where name = 'plan_tick_url') s,
           (select decrypted_secret as key from vault.decrypted_secrets where name = 'post_cron_key') k;
    $c$);
  else
    raise notice 'pg_cron / pg_net not enabled: enable them (Database → Extensions) and run this file again for Plan reminders.';
  end if;
end $$;
