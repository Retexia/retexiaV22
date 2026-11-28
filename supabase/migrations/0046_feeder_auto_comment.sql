-- =====================================================================
-- 0046: Retexia Feeder → Auto comment (free).
--
-- feeder.retexia.com/auto-comment looks after the comments on the customer's
-- Facebook ads and Page posts (the Page they connected in Autopublish →
-- Accounts):
--   * replies under a comment: keyword rules first ("price", "ganan",
--     "delivery" …), otherwise one of their default replies;
--   * sends the commenter a private message (Messenger private reply);
--   * posts the Page's own first comment on a new ad or post;
--   * hides comments with phone numbers, links or words they choose.
-- Only comments written after Auto comment was switched on are touched.
--
--   feeder.comment_settings  one row per customer: on/off, replies, rules,
--                            private message, first comment, hiding
--   feeder.comment_log       what was done to each comment (and each first
--                            comment), shown as the activity list
--
-- Facebook calls go through the n8n gateway "Retexia — Feeder Autopublish"
-- with the Page's own token (it never leaves n8n). pg_cron wakes
-- feeder.retexia.com/api/feeder/auto-comment/tick every minute while anyone
-- has it switched on. Customers read their own rows; all writes go through
-- feeder.retexia.com (service role). Safe to run again. Run after 0036.
-- =====================================================================

create schema if not exists feeder;

-- ---------------------------------------------------------------------
-- The package: Auto comment, free for every Retexia account.
-- ---------------------------------------------------------------------
insert into public.packages (product_id, slug, name, tagline, description, price_monthly, price_yearly, setup_fee, badge, cta_label, is_active, is_visible, sort_order)
select p.id, 'auto-comment', 'Auto comment',
       'Replies to the comments on your ads and posts, and hides the bad ones',
       'Every comment on your Facebook ads and Page posts gets a reply within a minute: your own answers for price and delivery questions, a private message with the details, the Page''s first comment on every new ad, and phone numbers, links and bad words hidden.',
       0, null, 0, 'Free', 'Open Auto comment', true, true,
       coalesce((select max(sort_order) + 1 from public.packages where product_id = p.id), 1)
  from public.products p
 where p.slug = 'feeder'
on conflict (product_id, slug) do update
   set name = excluded.name, tagline = excluded.tagline, description = excluded.description,
       price_monthly = 0, price_yearly = null, setup_fee = 0, badge = excluded.badge, cta_label = excluded.cta_label,
       is_active = true, is_visible = true, updated_at = now();

delete from public.package_features
 where package_id = (select k.id from public.packages k join public.products p on p.id = k.product_id where p.slug = 'feeder' and k.slug = 'auto-comment');
insert into public.package_features (package_id, label, sort_order)
select k.id, f.label, f.n
  from public.packages k
  join public.products p on p.id = k.product_id and p.slug = 'feeder'
  cross join (values
    (1, 'Replies to comments on your Facebook ads and Page posts within a minute'),
    (2, 'Your own answers for price, delivery and other questions (Sinhala, Singlish, English)'),
    (3, 'A private message to every commenter with the details'),
    (4, 'The Page''s first comment on every new ad or post'),
    (5, 'Hides phone numbers, links and words you choose'),
    (6, 'Everything it did, comment by comment')
  ) as f(n, label)
 where k.slug = 'auto-comment';

-- ---------------------------------------------------------------------
-- Settings (one row per customer)
-- ---------------------------------------------------------------------
create table if not exists feeder.comment_settings (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  enabled         boolean not null default false,
  started_at      timestamptz,
  reply_on        boolean not null default true,
  replies         text[] not null default '{}' check (cardinality(replies) <= 5),
  rules           jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array' and jsonb_array_length(rules) <= 15),
  private_on      boolean not null default false,
  private_text    text check (char_length(private_text) <= 1000),
  first_on        boolean not null default false,
  first_text      text check (char_length(first_text) <= 1000),
  first_on_ads    boolean not null default true,
  first_on_posts  boolean not null default false,
  hide_on         boolean not null default true,
  hide_phones     boolean not null default true,
  hide_links      boolean not null default true,
  hide_words      text[] not null default '{}' check (cardinality(hide_words) <= 50),
  next_check_at   timestamptz not null default now(),
  locked_until    timestamptz,
  last_checked_at timestamptz,
  problem         text check (char_length(problem) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table feeder.comment_settings is 'Auto comment: what to do with comments on the customer''s Facebook ads and Page posts (the Page from Autopublish → Accounts). started_at = only comments after this time are touched.';
comment on column feeder.comment_settings.rules is 'Keyword rules, first match wins: [{"words": ["price", "ganan"], "reply": "…", "private": "…"}].';
comment on column feeder.comment_settings.problem is 'Why the last check could not read the Page (shown to the customer), or empty.';

-- Switching it on starts the clock: older comments are never touched.
create or replace function feeder.comment_settings_guard() returns trigger
language plpgsql set search_path = feeder, public as $$
begin
  if new.enabled and (tg_op = 'INSERT' or not old.enabled or new.started_at is null) then
    new.started_at := now();
    new.next_check_at := now();
    new.problem := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists comment_settings_guard on feeder.comment_settings;
create trigger comment_settings_guard before insert or update on feeder.comment_settings
  for each row execute function feeder.comment_settings_guard();

-- ---------------------------------------------------------------------
-- What was done (one row per comment, and one per first comment)
-- ---------------------------------------------------------------------
create table if not exists feeder.comment_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  page_id      text not null,
  post_id      text not null,
  post_kind    text not null default 'post' check (post_kind in ('ad', 'post')),
  kind         text not null default 'comment' check (kind in ('comment', 'first_comment')),
  dedupe       text not null check (char_length(dedupe) between 1 and 200),
  comment_id   text,
  author       text check (char_length(author) <= 120),
  message      text check (char_length(message) <= 2000),
  rule         text check (char_length(rule) <= 120),
  done         text[] not null default '{}',
  reply        text check (char_length(reply) <= 1000),
  private_text text check (char_length(private_text) <= 1000),
  hidden_why   text check (char_length(hidden_why) <= 120),
  error        text check (char_length(error) <= 500),
  status       text not null default 'pending' check (status in ('pending', 'done', 'partly', 'failed', 'skipped')),
  commented_at timestamptz,
  created_at   timestamptz not null default now(),
  -- Each comment (and each post's first comment) is handled once: the row is written
  -- BEFORE anything is sent to Facebook, so a crash can never make it answer twice.
  unique (user_id, dedupe)
);
comment on table feeder.comment_log is 'Auto comment: each comment Retexia handled (replied / private message / hidden), and each first comment it posted. done = what worked. dedupe = "c:<comment id>" or "first:<post id>".';
create index if not exists comment_log_recent on feeder.comment_log (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Fair claiming: each customer at most once a minute, never twice at once.
-- ---------------------------------------------------------------------
create or replace function feeder.comment_claim(p_limit int default 20, p_user uuid default null)
returns setof feeder.comment_settings
language plpgsql security definer set search_path = feeder, public as $$
begin
  return query
  update feeder.comment_settings s
     set locked_until = now() + interval '3 minutes',
         next_check_at = now() + interval '1 minute'
   where s.user_id in (
     select c.user_id from feeder.comment_settings c
      where c.enabled
        and (p_user is null or c.user_id = p_user)
        and (p_user is not null or c.next_check_at <= now())
        and (c.locked_until is null or c.locked_until < now())
      order by c.next_check_at
      limit greatest(1, least(p_limit, 100))
      for update skip locked)
  returning s.*;
end $$;

create or replace function feeder.comment_release(p_user uuid, p_problem text default null) returns void
language sql security definer set search_path = feeder, public as $$
  update feeder.comment_settings
     set locked_until = null, last_checked_at = now(), problem = nullif(left(p_problem, 500), '')
   where user_id = p_user;
$$;

-- ---------------------------------------------------------------------
-- Security: customers read their own rows; feeder.retexia.com writes.
-- ---------------------------------------------------------------------
alter table feeder.comment_settings enable row level security;
alter table feeder.comment_log enable row level security;
drop policy if exists own_read on feeder.comment_settings;
drop policy if exists own_read on feeder.comment_log;
create policy own_read on feeder.comment_settings for select to authenticated using (user_id = (select auth.uid()) or (select public.is_privileged()));
create policy own_read on feeder.comment_log for select to authenticated using (user_id = (select auth.uid()) or (select public.is_privileged()));
revoke insert, update, delete on feeder.comment_settings, feeder.comment_log from anon, authenticated;
grant usage on schema feeder to authenticated, service_role;
grant select on feeder.comment_settings, feeder.comment_log to authenticated;
grant all on feeder.comment_settings, feeder.comment_log to service_role;
grant usage, select on all sequences in schema feeder to service_role;
revoke execute on function feeder.comment_claim(int, uuid), feeder.comment_release(uuid, text) from public, anon, authenticated;
grant execute on function feeder.comment_claim(int, uuid), feeder.comment_release(uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- Clock: every minute, only while someone has Auto comment on, the database
-- wakes feeder.retexia.com/api/feeder/auto-comment/tick (X-Retexia-Key = POST_CRON_KEY).
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'vault')
     and not exists (select 1 from vault.decrypted_secrets where name = 'feeder_comments_tick_url') then
    perform vault.create_secret('https://feeder.retexia.com/api/feeder/auto-comment/tick', 'feeder_comments_tick_url');
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('retexia-feeder-comments-tick', '* * * * *', $c$
      select net.http_post(
        url := s.url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Retexia-Key', k.key),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000)
      from (select decrypted_secret as url from vault.decrypted_secrets where name = 'feeder_comments_tick_url') s,
           (select decrypted_secret as key from vault.decrypted_secrets where name = 'post_cron_key') k
      where exists (
        select 1 from feeder.comment_settings c
         where c.enabled and c.next_check_at <= now()
           and (c.locked_until is null or c.locked_until < now()));
    $c$);
  else
    raise notice 'pg_cron / pg_net not enabled: enable them (Database → Extensions) and run this file again for Auto comment.';
  end if;
end $$;
