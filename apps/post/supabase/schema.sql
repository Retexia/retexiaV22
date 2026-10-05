-- =====================================================================
-- Retexia Post — Supabase schema (v1)
-- 9 tables · Row Level Security · storage buckets · scheduler functions
-- Run in the Supabase SQL editor on a fresh project.
-- =====================================================================

create extension if not exists vector   with schema extensions;  -- pgvector >= 0.7 for halfvec
create extension if not exists pgcrypto with schema extensions;  -- gen_random_bytes, digest
create extension if not exists pg_cron;
create extension if not exists pg_net;          -- lets pg_cron call n8n webhooks
create extension if not exists supabase_vault;  -- secrets (social tokens, webhook keys)

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type plan_tier   as enum ('trial', 'starter', 'growth', 'pro');
create type platform    as enum ('facebook', 'instagram');
create type post_format as enum ('photo', 'carousel', 'reel', 'story_photo', 'story_video');
create type post_status as enum (
  'generating', 'safety_review', 'ready', 'approved', 'publishing', 'published',
  'denied', 'needs_manual', 'blocked', 'expired', 'failed'
);
create type pub_status  as enum ('pending', 'publishing', 'published', 'retrying', 'failed');

-- ---------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =====================================================================
-- 1. businesses — one row per client business
-- =====================================================================
create table public.businesses (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  category            text,                       -- used for sensitive-industry rules
  country             text not null default 'LK',
  timezone            text not null default 'Asia/Colombo',
  languages           text[] not null default '{en}',
  plan                plan_tier not null default 'trial',
  subscription_status text not null default 'trialing'
                      check (subscription_status in ('trialing','active','past_due','canceled')),
  billing_customer_id text,
  brand               jsonb not null default '{}'::jsonb,
  -- brand: {logo_path, colors:[], font, template, tone:{formal_casual, calm_energetic},
  --         emoji:bool, always_words:[], never_words:[], sample_posts:[]}
  brand_brief         text,                       -- ~300-word summary sent with every prompt
  settings            jsonb not null default '{
    "auto_publish": true,
    "week_plan_enabled": false,
    "slots": ["09:00", "13:00", "19:00"],
    "content_mix": {"photo": 2, "reel": 1},
    "stories_per_day": 3,
    "paused": false,
    "whatsapp": {"enabled": false, "number": null, "opted_in_at": null,
                 "types": ["morning", "evening", "alerts"], "quiet_hours": ["22:00", "07:00"]}
  }'::jsonb,
  onboarding_done     boolean not null default false,
  last_batch_date     date,                       -- local date of the last nightly batch
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index businesses_owner_idx on businesses(owner_id);
create trigger businesses_updated before update on businesses
  for each row execute function set_updated_at();

-- =====================================================================
-- 2. social_accounts — connected Facebook Pages and Instagram accounts
-- =====================================================================
create table public.social_accounts (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses(id) on delete cascade,
  platform         platform not null,
  external_id      text not null,               -- Page id or IG user id
  display_name     text,
  avatar_url       text,
  ig_account_type  text check (ig_account_type in ('business','creator')), -- stories need 'business'
  meta_user_id     text,                         -- app-scoped FB user id, for deletion callbacks
  enabled          boolean not null default true, -- user on/off switch
  status           text not null default 'connected'
                   check (status in ('connected','reconnect_needed','disconnected')),
  token_secret_id  uuid,                         -- id in vault.secrets; token never stored here
  token_expires_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (business_id, platform, external_id)
);
create index social_accounts_meta_user_idx on social_accounts(meta_user_id);
create trigger social_accounts_updated before update on social_accounts
  for each row execute function set_updated_at();

-- =====================================================================
-- 3. products — products or services the AI can promote
-- =====================================================================
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  price       numeric(12,2),
  currency    text not null default 'LKR',
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index products_business_idx on products(business_id);

-- =====================================================================
-- 4. media — uploaded and generated photos/videos (files live in Storage)
-- =====================================================================
create table public.media (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  product_id   uuid references products(id) on delete set null,
  kind         text not null check (kind in ('photo','video')),
  source       text not null check (source in ('upload','ai','render')),
  storage_path text not null,                   -- bucket 'media': {business_id}/...
  thumb_path   text,                            -- bucket 'thumbs': {business_id}/...
  width        int,
  height       int,
  duration_s   numeric(6,2),
  bytes        int,
  description  text,                            -- 1-line vision-model description
  tags         text[] not null default '{}',
  embedding    halfvec(512),                    -- ~1 KB per item
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
create index media_business_product_idx on media(business_id, product_id);
create index media_embedding_idx on media using hnsw (embedding halfvec_cosine_ops);

-- =====================================================================
-- 5. plan_items — week-plan notes and offers in one table
-- =====================================================================
create table public.plan_items (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  type        text not null check (type in ('week_note','offer')),
  start_date  date not null,
  end_date    date not null,
  slot        smallint check (slot between 1 and 3),   -- null = any slot
  slots_per_day smallint default 1 check (slots_per_day between 1 and 3), -- offers
  format      post_format,                              -- null = let the router decide
  note        text,
  media_id    uuid references media(id) on delete set null,
  details     jsonb not null default '{}'::jsonb,       -- {title, price, discount, ends_text}
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index plan_items_lookup_idx on plan_items(business_id, start_date, end_date) where active;

-- =====================================================================
-- 6. posts — one content item in one slot (shared across platforms)
-- =====================================================================
create table public.posts (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  local_date    date not null,
  slot          smallint not null check (slot between 1 and 3),
  format        post_format not null,
  is_story      boolean generated always as (format in ('story_photo','story_video')) stored,
  scheduled_at  timestamptz not null,           -- lock point = scheduled_at - 15 min
  status        post_status not null default 'generating',
  source        text not null default 'ai' check (source in ('ai','week_plan','offer','manual')),
  plan_item_id  uuid references plan_items(id) on delete set null,
  brief         jsonb not null default '{}'::jsonb,
  caption       text,
  variants      jsonb not null default '{}'::jsonb,
  -- variants: {"facebook": {"caption": "..."}, "instagram": {"caption": "...", "hashtags": []}}
  media_id      uuid references media(id) on delete set null,
  extra_media   uuid[] not null default '{}',   -- carousel items
  regen_count   smallint not null default 0 check (regen_count between 0 and 10),
  deny_reason   text,                           -- caption | image | both | wrong_product
  safety        jsonb not null default '{}'::jsonb, -- {result, flags:[], blocks:int, checked_at}
  approved_at   timestamptz,
  approved_by   uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id, local_date, slot, is_story)
);
create index posts_status_time_idx on posts(status, scheduled_at);
create index posts_business_date_idx on posts(business_id, local_date desc);
create trigger posts_updated before update on posts
  for each row execute function set_updated_at();

-- A user edit (caption, variants or media) sends the post back through the safety check,
-- and edits are refused after the lock point.
create or replace function posts_on_user_edit() returns trigger
language plpgsql as $$
begin
  -- Only direct edits from the browser. cron, n8n (service_role) and the
  -- security-definer RPCs run as other roles and are not affected.
  if current_user = 'authenticated' then
    if now() >= old.scheduled_at - interval '15 minutes' then
      raise exception 'This post is locked for publishing';
    end if;
    if new.caption    is distinct from old.caption
    or new.variants   is distinct from old.variants
    or new.media_id   is distinct from old.media_id
    or new.extra_media is distinct from old.extra_media then
      new.status      := 'safety_review';
      new.approved_at := now();               -- a user edit counts as approval
      new.approved_by := auth.uid();
    end if;
  end if;
  return new;
end $$;
create trigger posts_user_edit before update on posts
  for each row execute function posts_on_user_edit();

-- =====================================================================
-- 7. publications — one post on one account, with retry state
-- =====================================================================
create table public.publications (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references posts(id) on delete cascade,
  social_account_id uuid not null references social_accounts(id) on delete cascade,
  status            pub_status not null default 'pending',
  attempts          smallint not null default 0,
  next_retry_at     timestamptz,
  container_id      text,          -- IG container id; checked before any retry (no double posts)
  external_id       text,          -- published media id
  permalink         text,
  error_kind        text check (error_kind in ('temporary','needs_user','content')),
  last_error        text,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (post_id, social_account_id)
);
create index publications_retry_idx on publications(status, next_retry_at);

-- =====================================================================
-- 8. usage_monthly — allowance counters per business per month
-- =====================================================================
create table public.usage_monthly (
  business_id   uuid not null references businesses(id) on delete cascade,
  period        date not null,               -- first day of the month
  images        int not null default 0,
  videos        int not null default 0,
  ai_videos     int not null default 0,
  regenerations int not null default 0,
  text_calls    int not null default 0,
  est_cost_usd  numeric(10,4) not null default 0,
  primary key (business_id, period)
);

-- =====================================================================
-- 9. events — notifications, audit trail, data-deletion requests
-- =====================================================================
create table public.events (
  id           bigint generated always as identity primary key,
  business_id  uuid references businesses(id) on delete set null,
  type         text not null,  -- batch_ready, published, publish_failed, reconnect_needed,
                               -- allowance_80, needs_manual, data_deletion, ...
  payload      jsonb not null default '{}'::jsonb,
  notified_via text[] not null default '{}',  -- {'whatsapp','email'}
  created_at   timestamptz not null default now()
);
create index events_business_idx on events(business_id, created_at desc);
create index events_deletion_idx on events((payload ->> 'confirmation_code')) where type = 'data_deletion';

-- =====================================================================
-- Row Level Security
-- The browser uses the anon/authenticated key; n8n uses the service-role
-- key, which bypasses RLS. Owners can read their data and change only
-- the columns granted below.
-- =====================================================================
create or replace function is_owner(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from businesses where id = bid and owner_id = auth.uid());
$$;

alter table businesses      enable row level security;
alter table social_accounts enable row level security;
alter table products        enable row level security;
alter table media           enable row level security;
alter table plan_items      enable row level security;
alter table posts           enable row level security;
alter table publications    enable row level security;
alter table usage_monthly   enable row level security;
alter table events          enable row level security;

create policy own_business on businesses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy own_rows on social_accounts for all using (is_owner(business_id)) with check (is_owner(business_id));
create policy own_rows on products        for all using (is_owner(business_id)) with check (is_owner(business_id));
create policy own_rows on media           for all using (is_owner(business_id)) with check (is_owner(business_id));
create policy own_rows on plan_items      for all using (is_owner(business_id)) with check (is_owner(business_id));
create policy own_rows on posts           for all using (is_owner(business_id)) with check (is_owner(business_id));
create policy own_read on usage_monthly   for select using (is_owner(business_id));
create policy own_read on events          for select using (is_owner(business_id));
create policy own_read on publications    for select using (
  exists (select 1 from posts p where p.id = post_id and is_owner(p.business_id))
);

-- Column-level limits: owners cannot change their plan, statuses, counters or tokens.
revoke insert, update on businesses from authenticated;
grant  insert (owner_id, name, category, country, timezone, languages, brand, settings)
       on businesses to authenticated;
grant  update (name, category, country, timezone, languages, brand, settings, onboarding_done)
       on businesses to authenticated;

revoke insert, update on social_accounts from authenticated;   -- created by the OAuth callback (server)
grant  update (enabled) on social_accounts to authenticated;

revoke insert, update on posts from authenticated;
grant  update (caption, variants, media_id, extra_media) on posts to authenticated;
-- approve / deny go through the RPCs below

revoke insert, update, delete on publications, usage_monthly, events from authenticated;

-- =====================================================================
-- RPCs called from the web app
-- =====================================================================

-- Approve a ready post (manual mode, or early approval in auto mode).
create or replace function approve_post(p_post uuid) returns post_status
language plpgsql security definer set search_path = public as $$
declare v posts;
begin
  select * into v from posts where id = p_post for update;
  if not found or not is_owner(v.business_id) then raise exception 'Post not found'; end if;
  if now() >= v.scheduled_at - interval '15 minutes' then raise exception 'Post is locked'; end if;
  if v.status <> 'ready' then raise exception 'Only ready posts can be approved (now: %)', v.status; end if;
  update posts set status = 'approved', approved_at = now(), approved_by = auth.uid() where id = p_post;
  return 'approved';
end $$;

-- Deny a post: up to 10 regenerations, then it needs manual action.
-- n8n picks up status 'denied' (Database Webhook on posts) and regenerates only the denied part.
create or replace function deny_post(p_post uuid, p_reason text default 'both') returns post_status
language plpgsql security definer set search_path = public as $$
declare v posts;
begin
  if p_reason not in ('caption','image','both','wrong_product') then
    raise exception 'Unknown reason %', p_reason;
  end if;
  select * into v from posts where id = p_post for update;
  if not found or not is_owner(v.business_id) then raise exception 'Post not found'; end if;
  if now() >= v.scheduled_at - interval '15 minutes' then raise exception 'Post is locked'; end if;
  if v.status not in ('ready','approved') then raise exception 'Cannot deny a post in status %', v.status; end if;

  if v.regen_count >= 10 then
    update posts set status = 'needs_manual' where id = p_post;
    return 'needs_manual';
  end if;

  update posts
     set status = 'denied', regen_count = regen_count + 1, deny_reason = p_reason,
         approved_at = null, approved_by = null
   where id = p_post;
  return 'denied';
end $$;

-- Find the best real photo for a brief (RLS applies: security invoker).
create or replace function match_media(
  p_business uuid, p_query halfvec(512), p_product uuid default null, p_limit int default 5
) returns table (id uuid, storage_path text, thumb_path text, product_id uuid, similarity float)
language sql stable as $$
  select m.id, m.storage_path, m.thumb_path, m.product_id,
         1 - (m.embedding <=> p_query) as similarity
    from media m
   where m.business_id = p_business
     and m.kind = 'photo'
     and m.embedding is not null
     and (p_product is null or m.product_id = p_product)
     and (m.last_used_at is null or m.last_used_at < now() - interval '3 days') -- rotate photos
   order by m.embedding <=> p_query
   limit p_limit;
$$;

-- =====================================================================
-- Scheduler functions (service role only)
-- =====================================================================

-- Businesses whose local time is 1 AM, each at its own random minute (0-49),
-- claimed atomically so a business is never batched twice in one day.
create or replace function claim_batch_businesses()
returns table (business_id uuid, local_date date)
language sql volatile as $$
  update businesses b
     set last_batch_date = (now() at time zone b.timezone)::date
   where b.onboarding_done
     and b.subscription_status in ('trialing','active')
     and coalesce((b.settings ->> 'paused')::boolean, false) = false
     and extract(hour   from now() at time zone b.timezone) = 1
     and extract(minute from now() at time zone b.timezone) >= abs(hashtext(b.id::text)) % 50
     and b.last_batch_date is distinct from (now() at time zone b.timezone)::date
  returning b.id, b.last_batch_date;
$$;

-- Posts whose slot has arrived: approved, or ready with auto-publish on.
-- Marks them 'publishing' so no other run can take them.
create or replace function claim_due_posts(p_limit int default 50)
returns setof posts
language sql volatile as $$
  with due as (
    select p.id
      from posts p
      join businesses b on b.id = p.business_id
     where p.scheduled_at <= now()
       and coalesce((b.settings ->> 'paused')::boolean, false) = false
       and (p.status = 'approved'
            or (p.status = 'ready' and coalesce((b.settings ->> 'auto_publish')::boolean, true)))
     order by p.scheduled_at
     limit p_limit
     for update of p skip locked
  )
  update posts p set status = 'publishing'
    from due
   where p.id = due.id
  returning p.*;
$$;

-- Housekeeping every minute:
--  * manual-mode posts not approved by the lock point -> expired
--  * needs_manual posts past the lock point -> expired
--  * regenerations still running 30 min after the slot -> expired (the one-time push)
--  * posts stuck in 'publishing' with no publication rows for 20 min -> back to approved
create or replace function expire_stale_posts() returns void
language sql volatile as $$
  update posts p set status = 'expired'
    from businesses b
   where b.id = p.business_id
     and (
       (p.status = 'ready' and not coalesce((b.settings ->> 'auto_publish')::boolean, true)
          and now() >= p.scheduled_at - interval '15 minutes')
       or (p.status = 'needs_manual' and now() >= p.scheduled_at - interval '15 minutes')
       or (p.status in ('generating','safety_review','denied')
          and now() >= p.scheduled_at + interval '30 minutes')
     );

  update posts p set status = 'approved'
   where p.status = 'publishing'
     and p.updated_at < now() - interval '20 minutes'
     and not exists (select 1 from publications x where x.post_id = p.id);
$$;

-- Add to a usage counter (call only after the AI call succeeded).
create or replace function bump_usage(
  p_business uuid, p_field text, p_amount int default 1, p_cost numeric default 0
) returns void
language plpgsql as $$
declare v_period date := date_trunc('month', now())::date;
begin
  if p_field not in ('images','videos','ai_videos','regenerations','text_calls') then
    raise exception 'Unknown usage field %', p_field;
  end if;
  insert into usage_monthly (business_id, period) values (p_business, v_period)
  on conflict do nothing;
  execute format(
    'update usage_monthly set %1$I = %1$I + $1, est_cost_usd = est_cost_usd + $2
      where business_id = $3 and period = $4', p_field)
  using p_amount, p_cost, p_business, v_period;
end $$;

-- Meta data-deletion callback: remove everything obtained from Meta for this
-- app-scoped user, log the request, return the confirmation code.
-- (Storage files must be deleted by the API route through the Storage API.)
create or replace function handle_meta_deletion(p_meta_user_id text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_code text := encode(gen_random_bytes(8), 'hex');
begin
  delete from vault.secrets
   where id in (select token_secret_id from social_accounts
                 where meta_user_id = p_meta_user_id and token_secret_id is not null);
  delete from social_accounts where meta_user_id = p_meta_user_id;
  insert into events (type, payload)
  values ('data_deletion', jsonb_build_object(
    'meta_user_id_hash', encode(digest(p_meta_user_id, 'sha256'), 'hex'),
    'confirmation_code', v_code, 'status', 'completed'));
  return v_code;
end $$;

revoke execute on function claim_batch_businesses(), claim_due_posts(int), expire_stale_posts(),
  bump_usage(uuid, text, int, numeric), handle_meta_deletion(text)
  from public, anon, authenticated;

-- =====================================================================
-- Storage: private buckets, paths start with {business_id}/
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('media',  'media',  false, 104857600, array['image/webp','image/jpeg','image/png','video/mp4','video/quicktime']),
  ('thumbs', 'thumbs', false, 1048576,   array['image/webp'])
on conflict (id) do nothing;

create policy owner_read on storage.objects for select
  using (bucket_id in ('media','thumbs') and is_owner(((storage.foldername(name))[1])::uuid));
create policy owner_upload on storage.objects for insert
  with check (bucket_id = 'media' and is_owner(((storage.foldername(name))[1])::uuid));
create policy owner_delete on storage.objects for delete
  using (bucket_id in ('media','thumbs') and is_owner(((storage.foldername(name))[1])::uuid));

-- =====================================================================
-- pg_cron jobs. Store the n8n webhook URLs and shared key in Vault first:
--   select vault.create_secret('https://n8n.yourdomain.com/webhook/batch',   'n8n_batch_url');
--   select vault.create_secret('https://n8n.yourdomain.com/webhook/publish', 'n8n_publish_url');
--   select vault.create_secret('<long random string>',                       'n8n_key');
-- =====================================================================
select cron.schedule('retexia-batch-tick', '*/5 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'n8n_batch_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
               'X-Retexia-Key', (select decrypted_secret from vault.decrypted_secrets where name = 'n8n_key')),
    body    := jsonb_build_object('businesses', c.items))
  from (select jsonb_agg(to_jsonb(x)) as items from claim_batch_businesses() x) c
  where c.items is not null;
$$);

select cron.schedule('retexia-publish-tick', '* * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'n8n_publish_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
               'X-Retexia-Key', (select decrypted_secret from vault.decrypted_secrets where name = 'n8n_key')),
    body    := jsonb_build_object('post_ids', c.ids))
  from (select jsonb_agg(p.id) as ids from claim_due_posts() p) c
  where c.ids is not null;
$$);

select cron.schedule('retexia-expire', '* * * * *', $$ select expire_stale_posts(); $$);

-- Retries: n8n's own schedule (every 2 min) picks
--   publications where status = 'retrying' and next_retry_at <= now()
-- Regenerate / re-check: add Supabase Database Webhooks on posts UPDATE
--   where status in ('denied','safety_review') -> n8n.
