-- =====================================================================
-- 0007: Admin controls for the Lingo and Post panels.
--   * lingo.messages: unique (lingo_user_id, wa_message_id), which the Lingo v6
--     workflow's "Save Incoming" step needs (ON CONFLICT ... DO NOTHING);
--   * post.system_settings: global switches to stop all AI generation or all
--     publishing at once (national mourning day, Meta outage, bad model);
--   * admin overview functions (service role only) for the Retexia admin.
-- Safe to run again. Run after 0005 and 0006.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lingo: duplicate WhatsApp deliveries are ignored by the bot
-- ---------------------------------------------------------------------
delete from lingo.messages m
 using lingo.messages k
 where m.wa_message_id is not null
   and m.lingo_user_id = k.lingo_user_id
   and m.wa_message_id = k.wa_message_id
   and m.id > k.id;
create unique index if not exists messages_wa_unique on lingo.messages (lingo_user_id, wa_message_id);

-- Per-account overview for the admin (customers, activity, sales).
create or replace function lingo.admin_overview()
returns table (lingo_user_id bigint, customers bigint, new_customers_30d bigint, messages_30d bigint,
               orders_30d bigint, open_orders bigint, sales_30d numeric, products bigint, last_message_at timestamptz)
language sql stable set search_path = lingo, public as $$
  select l.id,
    (select count(*) from lingo.customers c where c.lingo_user_id = l.id),
    (select count(*) from lingo.customers c where c.lingo_user_id = l.id and c.created_at > now() - interval '30 days'),
    (select count(*) from lingo.messages m where m.lingo_user_id = l.id and m.role = 'user' and m.created_at > now() - interval '30 days'),
    (select count(*) from lingo.orders o where o.lingo_user_id = l.id and o.status <> 'draft' and o.created_at > now() - interval '30 days'),
    (select count(*) from lingo.orders o where o.lingo_user_id = l.id and o.status in ('confirmed', 'processing')),
    (select coalesce(sum(o.total_price), 0) from lingo.orders o
      where o.lingo_user_id = l.id and o.status in ('confirmed', 'processing', 'shipped', 'delivered') and o.created_at > now() - interval '30 days'),
    (select count(*) from lingo.products p where p.lingo_user_id = l.id and p.active),
    (select max(m.created_at) from lingo.messages m where m.lingo_user_id = l.id and m.role = 'user')
  from lingo.lingo_users l;
$$;
revoke execute on function lingo.admin_overview() from public, anon, authenticated;
grant execute on function lingo.admin_overview() to service_role;

-- ---------------------------------------------------------------------
-- Post: global switches
-- ---------------------------------------------------------------------
create table if not exists post.system_settings (
  id                smallint primary key default 1 check (id = 1),
  generation_paused boolean not null default false,
  publishing_paused boolean not null default false,
  note              text,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null
);
insert into post.system_settings (id) values (1) on conflict (id) do nothing;
alter table post.system_settings enable row level security;
revoke all on post.system_settings from anon, authenticated;
grant all on post.system_settings to service_role;
grant select on post.system_settings to post_n8n;

create or replace function post.claim_batch_businesses()
returns table (business_id uuid, local_date date)
language sql volatile set search_path = post, public as $$
  update post.businesses b
     set last_batch_date = (now() at time zone b.timezone)::date
   where b.onboarding_done
     and b.subscription_status in ('trialing', 'active')
     and coalesce((b.settings ->> 'paused')::boolean, false) = false
     and not exists (select 1 from post.system_settings s where s.id = 1 and s.generation_paused)
     and extract(hour from now() at time zone b.timezone) = 1
     and extract(minute from now() at time zone b.timezone) >= abs(hashtext(b.id::text)) % 50
     and b.last_batch_date is distinct from (now() at time zone b.timezone)::date
  returning b.id, b.last_batch_date;
$$;

create or replace function post.claim_due_posts(p_limit int default 50)
returns setof post.posts
language sql volatile set search_path = post, public as $$
  with due as (
    select p.id from post.posts p join post.businesses b on b.id = p.business_id
     where p.scheduled_at <= now()
       and coalesce((b.settings ->> 'paused')::boolean, false) = false
       and b.subscription_status in ('trialing', 'active')
       and not exists (select 1 from post.system_settings s where s.id = 1 and s.publishing_paused)
       and (p.status = 'approved' or (p.status = 'ready' and coalesce((b.settings ->> 'auto_publish')::boolean, true)))
     order by p.scheduled_at
     limit p_limit
     for update of p skip locked
  )
  update post.posts p set status = 'publishing' from due where p.id = due.id
  returning p.*;
$$;
revoke execute on function post.claim_batch_businesses(), post.claim_due_posts(int) from public, anon, authenticated;
grant execute on function post.claim_batch_businesses(), post.claim_due_posts(int) to service_role, post_n8n;

-- Per-business overview for the admin: accounts, publishing health, this month's usage.
create or replace function post.admin_overview()
returns table (business_id uuid, accounts_connected bigint, accounts_reconnect bigint, tokens_expiring bigint,
               posts_upcoming bigint, published_7d bigint, failed_7d bigint, blocked_7d bigint, needs_manual bigint,
               images bigint, videos bigint, regenerations bigint, est_cost_usd numeric, last_published_at timestamptz)
language sql stable set search_path = post, public as $$
  select b.id,
    (select count(*) from post.social_accounts a where a.business_id = b.id and a.status = 'connected' and a.enabled),
    (select count(*) from post.social_accounts a where a.business_id = b.id and a.status = 'reconnect_needed'),
    (select count(*) from post.social_accounts a where a.business_id = b.id and a.status = 'connected'
       and a.token_expires_at is not null and a.token_expires_at < now() + interval '7 days'),
    (select count(*) from post.posts p where p.business_id = b.id and p.scheduled_at > now()
       and p.status in ('generating', 'safety_review', 'ready', 'approved')),
    (select count(*) from post.posts p where p.business_id = b.id and p.status = 'published' and p.scheduled_at > now() - interval '7 days'),
    (select count(*) from post.posts p where p.business_id = b.id and p.status = 'failed' and p.scheduled_at > now() - interval '7 days'),
    (select count(*) from post.posts p where p.business_id = b.id and p.status = 'blocked' and p.scheduled_at > now() - interval '7 days'),
    (select count(*) from post.posts p where p.business_id = b.id and p.status = 'needs_manual'),
    coalesce(u.images, 0)::bigint, coalesce(u.videos, 0)::bigint, coalesce(u.regenerations, 0)::bigint, coalesce(u.est_cost_usd, 0),
    (select max(x.published_at) from post.publications x join post.posts p on p.id = x.post_id where p.business_id = b.id)
  from post.businesses b
  left join post.usage_monthly u on u.business_id = b.id and u.period = date_trunc('month', now())::date;
$$;
revoke execute on function post.admin_overview() from public, anon, authenticated;
grant execute on function post.admin_overview() to service_role;
