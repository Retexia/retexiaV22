-- =====================================================================
-- 0005: Retexia Post inside the main Retexia project, in its own schema.
--
-- Same tables and rules as the original Retexia Post project schema,
-- with three changes:
--   * everything lives in schema "post" (no clash with Retexia's public.*);
--   * businesses.owner_id is the customer's Retexia login (one auth.users);
--   * staff (support/admin/owner) can read everything for support.
-- Safe to run again. Parts that need Supabase extensions (pgvector, pg_cron,
-- pg_net, Vault) are skipped when the extension is not available.
-- After running: Settings → API → Exposed schemas → add "post".
-- =====================================================================

create schema if not exists post;
grant usage on schema post to anon, authenticated, service_role;

do $$ begin
  begin create extension if not exists vector with schema extensions; exception when others then raise notice 'pgvector not available: %', sqlerrm; end;
  begin create extension if not exists pgcrypto with schema extensions; exception when others then raise notice 'pgcrypto: %', sqlerrm; end;
end $$;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'post' and t.typname = 'plan_tier') then
    create type post.plan_tier as enum ('trial', 'starter', 'growth', 'pro');
    create type post.platform as enum ('facebook', 'instagram');
    create type post.post_format as enum ('photo', 'carousel', 'reel', 'story_photo', 'story_video');
    create type post.post_status as enum ('generating', 'safety_review', 'ready', 'approved', 'publishing', 'published',
                                          'denied', 'needs_manual', 'blocked', 'expired', 'failed');
    create type post.pub_status as enum ('pending', 'publishing', 'published', 'retrying', 'failed');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists post.businesses (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users (id) on delete cascade,
  name                text not null,
  category            text,
  country             text not null default 'LK',
  timezone            text not null default 'Asia/Colombo',
  languages           text[] not null default '{en}',
  plan                post.plan_tier not null default 'trial',
  subscription_status text not null default 'trialing' check (subscription_status in ('trialing', 'active', 'past_due', 'canceled')),
  billing_customer_id text,
  brand               jsonb not null default '{}'::jsonb,
  brand_brief         text,
  settings            jsonb not null default '{
    "auto_publish": true, "week_plan_enabled": false, "slots": ["09:00", "13:00", "19:00"],
    "content_mix": {"photo": 2, "reel": 1}, "stories_per_day": 3, "paused": false,
    "whatsapp": {"enabled": false, "number": null, "opted_in_at": null,
                 "types": ["morning", "evening", "alerts"], "quiet_hours": ["22:00", "07:00"]}
  }'::jsonb,
  onboarding_done     boolean not null default false,
  last_batch_date     date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists businesses_owner_idx on post.businesses (owner_id);

create table if not exists post.social_accounts (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references post.businesses (id) on delete cascade,
  platform         post.platform not null,
  external_id      text not null,
  display_name     text,
  avatar_url       text,
  ig_account_type  text check (ig_account_type in ('business', 'creator')),
  meta_user_id     text,
  enabled          boolean not null default true,
  status           text not null default 'connected' check (status in ('connected', 'reconnect_needed', 'disconnected')),
  token_secret_id  uuid,
  token_expires_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (business_id, platform, external_id)
);
create index if not exists social_accounts_meta_user_idx on post.social_accounts (meta_user_id);

create table if not exists post.products (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references post.businesses (id) on delete cascade,
  name        text not null,
  price       numeric(12, 2),
  currency    text not null default 'LKR',
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists products_business_idx on post.products (business_id);

create table if not exists post.media (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references post.businesses (id) on delete cascade,
  product_id   uuid references post.products (id) on delete set null,
  kind         text not null check (kind in ('photo', 'video')),
  source       text not null check (source in ('upload', 'ai', 'render')),
  storage_path text not null,
  thumb_path   text,
  width        int,
  height       int,
  duration_s   numeric(6, 2),
  bytes        int,
  description  text,
  tags         text[] not null default '{}',
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists media_business_product_idx on post.media (business_id, product_id);

-- Embeddings need pgvector (halfvec, pgvector >= 0.7).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'vector')
     and not exists (select 1 from information_schema.columns where table_schema = 'post' and table_name = 'media' and column_name = 'embedding') then
    execute 'alter table post.media add column embedding extensions.halfvec(512)';
    execute 'create index if not exists media_embedding_idx on post.media using hnsw (embedding extensions.halfvec_cosine_ops)';
  end if;
end $$;

create table if not exists post.plan_items (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references post.businesses (id) on delete cascade,
  type          text not null check (type in ('week_note', 'offer')),
  start_date    date not null,
  end_date      date not null,
  slot          smallint check (slot between 1 and 3),
  slots_per_day smallint default 1 check (slots_per_day between 1 and 3),
  format        post.post_format,
  note          text,
  media_id      uuid references post.media (id) on delete set null,
  details       jsonb not null default '{}'::jsonb,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists plan_items_lookup_idx on post.plan_items (business_id, start_date, end_date) where active;

create table if not exists post.posts (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references post.businesses (id) on delete cascade,
  local_date   date not null,
  slot         smallint not null check (slot between 1 and 3),
  format       post.post_format not null,
  is_story     boolean generated always as (format in ('story_photo', 'story_video')) stored,
  scheduled_at timestamptz not null,
  status       post.post_status not null default 'generating',
  source       text not null default 'ai' check (source in ('ai', 'week_plan', 'offer', 'manual')),
  plan_item_id uuid references post.plan_items (id) on delete set null,
  brief        jsonb not null default '{}'::jsonb,
  caption      text,
  variants     jsonb not null default '{}'::jsonb,
  media_id     uuid references post.media (id) on delete set null,
  extra_media  uuid[] not null default '{}',
  regen_count  smallint not null default 0 check (regen_count between 0 and 10),
  deny_reason  text,
  safety       jsonb not null default '{}'::jsonb,
  approved_at  timestamptz,
  approved_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, local_date, slot, is_story)
);
create index if not exists posts_status_time_idx on post.posts (status, scheduled_at);
create index if not exists posts_business_date_idx on post.posts (business_id, local_date desc);

create table if not exists post.publications (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references post.posts (id) on delete cascade,
  social_account_id uuid not null references post.social_accounts (id) on delete cascade,
  status            post.pub_status not null default 'pending',
  attempts          smallint not null default 0,
  next_retry_at     timestamptz,
  container_id      text,
  external_id       text,
  permalink         text,
  error_kind        text check (error_kind in ('temporary', 'needs_user', 'content')),
  last_error        text,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (post_id, social_account_id)
);
create index if not exists publications_retry_idx on post.publications (status, next_retry_at);

create table if not exists post.usage_monthly (
  business_id   uuid not null references post.businesses (id) on delete cascade,
  period        date not null,
  images        int not null default 0,
  videos        int not null default 0,
  ai_videos     int not null default 0,
  regenerations int not null default 0,
  text_calls    int not null default 0,
  est_cost_usd  numeric(10, 4) not null default 0,
  primary key (business_id, period)
);

create table if not exists post.events (
  id           bigint generated always as identity primary key,
  business_id  uuid references post.businesses (id) on delete set null,
  type         text not null,
  payload      jsonb not null default '{}'::jsonb,
  notified_via text[] not null default '{}',
  created_at   timestamptz not null default now()
);
create index if not exists events_business_idx on post.events (business_id, created_at desc);
create index if not exists events_deletion_idx on post.events ((payload ->> 'confirmation_code')) where type = 'data_deletion';

-- updated_at (Retexia's shared trigger function)
drop trigger if exists businesses_updated on post.businesses;
create trigger businesses_updated before update on post.businesses for each row execute function public.set_updated_at();
drop trigger if exists social_accounts_updated on post.social_accounts;
create trigger social_accounts_updated before update on post.social_accounts for each row execute function public.set_updated_at();
drop trigger if exists posts_updated on post.posts;
create trigger posts_updated before update on post.posts for each row execute function public.set_updated_at();

-- A browser edit (caption, variants or media) sends the post back through the
-- safety check and counts as approval; edits are refused after the lock point.
create or replace function post.posts_on_user_edit() returns trigger
language plpgsql set search_path = post, public as $$
begin
  if current_user = 'authenticated' then
    if now() >= old.scheduled_at - interval '15 minutes' then
      raise exception 'This post is locked for publishing';
    end if;
    if new.caption is distinct from old.caption or new.variants is distinct from old.variants
       or new.media_id is distinct from old.media_id or new.extra_media is distinct from old.extra_media then
      new.status := 'safety_review';
      new.approved_at := now();
      new.approved_by := auth.uid();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists posts_user_edit on post.posts;
create trigger posts_user_edit before update on post.posts for each row execute function post.posts_on_user_edit();

-- ---------------------------------------------------------------------
-- Row Level Security: owners see their own business; the Retexia team
-- (support/admin/owner roles) can read everything. n8n and the panels'
-- server code use the service role.
-- ---------------------------------------------------------------------
create or replace function post.is_owner(bid uuid) returns boolean
language sql stable security definer set search_path = post, public as $$
  select exists (select 1 from post.businesses where id = bid and owner_id = auth.uid());
$$;

do $$
declare t text;
begin
  foreach t in array array['businesses', 'social_accounts', 'products', 'media', 'plan_items', 'posts', 'publications', 'usage_monthly', 'events'] loop
    execute format('alter table post.%I enable row level security', t);
  end loop;
end $$;

drop policy if exists own_business on post.businesses;
create policy own_business on post.businesses for all to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_privileged()))
  with check (owner_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['social_accounts', 'products', 'media', 'plan_items', 'posts'] loop
    execute format('drop policy if exists own_rows on post.%I', t);
    execute format('create policy own_rows on post.%I for all to authenticated using (post.is_owner(business_id) or (select public.is_privileged())) with check (post.is_owner(business_id))', t);
  end loop;
  foreach t in array array['usage_monthly', 'events'] loop
    execute format('drop policy if exists own_read on post.%I', t);
    execute format('create policy own_read on post.%I for select to authenticated using (post.is_owner(business_id) or (select public.is_privileged()))', t);
  end loop;
end $$;
drop policy if exists own_read on post.publications;
create policy own_read on post.publications for select to authenticated using (
  exists (select 1 from post.posts p where p.id = post_id and (post.is_owner(p.business_id) or (select public.is_privileged())))
);

-- Grants: nothing for visitors; owners change only the columns below.
revoke all on all tables in schema post from anon;
grant select, delete on all tables in schema post to authenticated;
grant insert, update, delete on post.products, post.media, post.plan_items to authenticated;
grant insert (owner_id, name, category, country, timezone, languages, brand, settings) on post.businesses to authenticated;
grant update (name, category, country, timezone, languages, brand, brand_brief, settings, onboarding_done) on post.businesses to authenticated;
grant update (enabled) on post.social_accounts to authenticated;
grant update (caption, variants, media_id, extra_media) on post.posts to authenticated;
revoke delete on post.businesses, post.social_accounts, post.posts, post.publications, post.usage_monthly, post.events from authenticated;
grant all on all tables in schema post to service_role;
grant usage, select on all sequences in schema post to service_role;

-- ---------------------------------------------------------------------
-- RPCs for the owner (approve / deny)
-- ---------------------------------------------------------------------
create or replace function post.approve_post(p_post uuid) returns post.post_status
language plpgsql security definer set search_path = post, public as $$
declare v post.posts;
begin
  select * into v from post.posts where id = p_post for update;
  if not found or not post.is_owner(v.business_id) then raise exception 'Post not found'; end if;
  if now() >= v.scheduled_at - interval '15 minutes' then raise exception 'Post is locked'; end if;
  if v.status <> 'ready' then raise exception 'Only ready posts can be approved (now: %)', v.status; end if;
  update post.posts set status = 'approved', approved_at = now(), approved_by = auth.uid() where id = p_post;
  return 'approved';
end $$;

create or replace function post.deny_post(p_post uuid, p_reason text default 'both') returns post.post_status
language plpgsql security definer set search_path = post, public as $$
declare v post.posts;
begin
  if p_reason not in ('caption', 'image', 'both', 'wrong_product') then raise exception 'Unknown reason %', p_reason; end if;
  select * into v from post.posts where id = p_post for update;
  if not found or not post.is_owner(v.business_id) then raise exception 'Post not found'; end if;
  if now() >= v.scheduled_at - interval '15 minutes' then raise exception 'Post is locked'; end if;
  if v.status not in ('ready', 'approved') then raise exception 'Cannot deny a post in status %', v.status; end if;
  if v.regen_count >= 10 then
    update post.posts set status = 'needs_manual' where id = p_post;
    return 'needs_manual';
  end if;
  update post.posts set status = 'denied', regen_count = regen_count + 1, deny_reason = p_reason, approved_at = null, approved_by = null
   where id = p_post;
  return 'denied';
end $$;

-- ---------------------------------------------------------------------
-- Scheduler and n8n functions (service role only)
-- ---------------------------------------------------------------------
create or replace function post.claim_batch_businesses()
returns table (business_id uuid, local_date date)
language sql volatile set search_path = post, public as $$
  update post.businesses b
     set last_batch_date = (now() at time zone b.timezone)::date
   where b.onboarding_done
     and b.subscription_status in ('trialing', 'active')
     and coalesce((b.settings ->> 'paused')::boolean, false) = false
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
       and (p.status = 'approved' or (p.status = 'ready' and coalesce((b.settings ->> 'auto_publish')::boolean, true)))
     order by p.scheduled_at
     limit p_limit
     for update of p skip locked
  )
  update post.posts p set status = 'publishing' from due where p.id = due.id
  returning p.*;
$$;

create or replace function post.expire_stale_posts() returns void
language sql volatile set search_path = post, public as $$
  update post.posts p set status = 'expired'
    from post.businesses b
   where b.id = p.business_id
     and ((p.status = 'ready' and not coalesce((b.settings ->> 'auto_publish')::boolean, true) and now() >= p.scheduled_at - interval '15 minutes')
       or (p.status = 'needs_manual' and now() >= p.scheduled_at - interval '15 minutes')
       or (p.status in ('generating', 'safety_review', 'denied') and now() >= p.scheduled_at + interval '30 minutes'));
  update post.posts p set status = 'approved'
   where p.status = 'publishing' and p.updated_at < now() - interval '20 minutes'
     and not exists (select 1 from post.publications x where x.post_id = p.id);
$$;

create or replace function post.bump_usage(p_business uuid, p_field text, p_amount int default 1, p_cost numeric default 0)
returns void language plpgsql set search_path = post, public as $$
declare v_period date := date_trunc('month', now())::date;
begin
  if p_field not in ('images', 'videos', 'ai_videos', 'regenerations', 'text_calls') then
    raise exception 'Unknown usage field %', p_field;
  end if;
  insert into post.usage_monthly (business_id, period) values (p_business, v_period) on conflict do nothing;
  execute format('update post.usage_monthly set %1$I = %1$I + $1, est_cost_usd = est_cost_usd + $2 where business_id = $3 and period = $4', p_field)
  using p_amount, p_cost, p_business, v_period;
end $$;

-- Meta data-deletion callback (Vault holds the tokens).
create or replace function post.handle_meta_deletion(p_meta_user_id text) returns text
language plpgsql security definer set search_path = post, public, extensions as $$
declare v_code text := encode(gen_random_bytes(8), 'hex');
begin
  delete from vault.secrets where id in (select token_secret_id from post.social_accounts where meta_user_id = p_meta_user_id and token_secret_id is not null);
  delete from post.social_accounts where meta_user_id = p_meta_user_id;
  insert into post.events (type, payload)
  values ('data_deletion', jsonb_build_object('meta_user_id_hash', encode(digest(p_meta_user_id, 'sha256'), 'hex'), 'confirmation_code', v_code, 'status', 'completed'));
  return v_code;
end $$;

-- Real-photo search (needs pgvector).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    execute $f$
      create or replace function post.match_media(p_business uuid, p_query extensions.halfvec(512), p_product uuid default null, p_limit int default 5)
      returns table (id uuid, storage_path text, thumb_path text, product_id uuid, similarity float)
      language sql stable set search_path = post, public, extensions as $q$
        select m.id, m.storage_path, m.thumb_path, m.product_id, 1 - (m.embedding <=> p_query) as similarity
          from post.media m
         where m.business_id = p_business and m.kind = 'photo' and m.embedding is not null
           and (p_product is null or m.product_id = p_product)
           and (m.last_used_at is null or m.last_used_at < now() - interval '3 days')
         order by m.embedding <=> p_query
         limit p_limit;
      $q$;
    $f$;
  end if;
end $$;

revoke execute on all functions in schema post from public, anon;
grant execute on function post.is_owner(uuid), post.approve_post(uuid), post.deny_post(uuid, text) to authenticated;
revoke execute on function post.claim_batch_businesses(), post.claim_due_posts(int), post.expire_stale_posts(),
  post.bump_usage(uuid, text, int, numeric), post.handle_meta_deletion(text) from authenticated;
grant execute on all functions in schema post to service_role;

-- ---------------------------------------------------------------------
-- Database role for the n8n Post workflows: its unqualified table names
-- (businesses, posts, media…) resolve to post.*. Set a password, then use
-- "post_n8n.<project-ref>" as the Postgres user in n8n (see docs).
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'post_n8n') then create role post_n8n nologin; end if;
end $$;
alter role post_n8n set search_path = post, public, extensions;
grant usage on schema post, public to post_n8n;
grant select, insert, update, delete on all tables in schema post to post_n8n;
grant usage, select on all sequences in schema post to post_n8n;
grant execute on all functions in schema post to post_n8n;
alter default privileges in schema post grant select, insert, update, delete on tables to post_n8n;

-- ---------------------------------------------------------------------
-- Storage: private buckets, paths start with {business_id}/
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('media', 'media', false, 104857600, array['image/webp', 'image/jpeg', 'image/png', 'video/mp4', 'video/quicktime']),
  ('thumbs', 'thumbs', false, 1048576, array['image/webp'])
on conflict (id) do nothing;

drop policy if exists "post media: owner read" on storage.objects;
drop policy if exists "post media: owner upload" on storage.objects;
drop policy if exists "post media: owner delete" on storage.objects;
create policy "post media: owner read" on storage.objects for select to authenticated
  using (bucket_id in ('media', 'thumbs') and post.is_owner(((storage.foldername(name))[1])::uuid));
create policy "post media: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and post.is_owner(((storage.foldername(name))[1])::uuid));
create policy "post media: owner delete" on storage.objects for delete to authenticated
  using (bucket_id in ('media', 'thumbs') and post.is_owner(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------
-- pg_cron ticks (only when pg_cron + pg_net exist). Store the n8n URLs and
-- key in Vault first: n8n_batch_url, n8n_publish_url, n8n_key.
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('retexia-post-batch-tick', '*/5 * * * *', $c$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'n8n_batch_url'),
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Retexia-Key', (select decrypted_secret from vault.decrypted_secrets where name = 'n8n_key')),
        body := jsonb_build_object('businesses', c.items))
      from (select jsonb_agg(to_jsonb(x)) as items from post.claim_batch_businesses() x
             where exists (select 1 from vault.decrypted_secrets where name = 'n8n_batch_url')) c
      where c.items is not null;
    $c$);
    perform cron.schedule('retexia-post-publish-tick', '* * * * *', $c$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'n8n_publish_url'),
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Retexia-Key', (select decrypted_secret from vault.decrypted_secrets where name = 'n8n_key')),
        body := jsonb_build_object('post_ids', c.ids))
      from (select jsonb_agg(p.id) as ids from post.claim_due_posts() p
             where exists (select 1 from vault.decrypted_secrets where name = 'n8n_publish_url')) c
      where c.ids is not null;
    $c$);
    perform cron.schedule('retexia-post-expire', '* * * * *', 'select post.expire_stale_posts();');
  else
    raise notice 'pg_cron / pg_net not enabled: enable them (Database → Extensions) and run this file again to schedule the Post jobs.';
  end if;
end $$;
