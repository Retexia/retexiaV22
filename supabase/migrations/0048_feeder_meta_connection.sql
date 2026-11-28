-- =====================================================================
-- 0048: Feeder → Connections: the seller's own Meta Business portfolio.
--
-- Instead of sharing ad accounts and Pages with Retexia's business (and
-- waiting for Retexia to confirm), a seller connects their own Business
-- portfolio once: its ID and a System User token made in that portfolio.
--   * The token goes to Supabase Vault; only feeder.retexia.com's server
--     reads it (service role) and calls Facebook with it. Only its last 4
--     characters are kept here.
--   * Retexia lists the ad accounts and Pages the token can reach and keeps
--     only those owned by that portfolio (feeder.meta_assets).
--   * Autopublish: any number of the portfolio's ad accounts (picked per
--     launch, one is the default) and one Page for the ads.
--   * Auto comment: up to 2 of the portfolio's Pages. A token with only Page
--     permissions is enough for it.
--   * feeder.ad_accounts.meta_via = 'token': the connection was checked with
--     the seller's own token, so it doesn't wait for Retexia's confirmation.
--     The older way (partner sharing, meta_via = 'partner') keeps working.
-- Safe to run again. Run after 0047.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The connection (one per seller)
-- ---------------------------------------------------------------------
create table if not exists feeder.meta_connections (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  business_id     text not null check (business_id ~ '^[0-9]{5,25}$'),
  business_name   text check (char_length(business_name) <= 200),
  token_secret_id uuid,
  token_last4     text check (char_length(token_last4) <= 4),
  token_user      text check (char_length(token_user) <= 200),
  scopes          text[] not null default '{}',
  status          text not null default 'pending' check (status in ('pending', 'connected', 'problem')),
  problem         text check (char_length(problem) <= 1000),
  checked_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table feeder.meta_connections is 'A seller''s own Meta Business portfolio (ID) and System User token (in Vault; token_secret_id). Used by Autopublish (ad accounts) and Auto comment (Pages) instead of partner sharing.';
comment on column feeder.meta_connections.scopes is 'The token''s granted permissions, from Facebook (/me/permissions), e.g. ads_management, pages_manage_engagement.';

-- ---------------------------------------------------------------------
-- The portfolio's ad accounts and Pages the token can reach
-- ---------------------------------------------------------------------
create table if not exists feeder.meta_assets (
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('ad_account', 'page')),
  asset_id        text not null check (asset_id ~ '^[0-9]{5,25}$'),
  name            text check (char_length(name) <= 200),
  info            jsonb not null default '{}'::jsonb,
  for_autopublish boolean not null default false,
  for_comments    boolean not null default false,
  is_default      boolean not null default false,
  status          text not null default 'ok' check (status in ('ok', 'problem', 'gone')),
  problem         text check (char_length(problem) <= 500),
  checked_at      timestamptz not null default now(),
  primary key (user_id, kind, asset_id),
  check (kind = 'page' or not for_comments)
);
comment on table feeder.meta_assets is 'Ad accounts and Pages in the seller''s Business portfolio that their token reaches. for_autopublish / for_comments = the seller chose it for that tool; is_default = Autopublish''s default ad account, or the Page its ads run from.';
-- One Retexia account answers a Page's comments (two would reply twice).
create unique index if not exists meta_assets_comment_page on feeder.meta_assets (asset_id) where kind = 'page' and for_comments;
create unique index if not exists meta_assets_one_default on feeder.meta_assets (user_id, kind) where is_default;

-- At most 2 Pages for Auto comment, 25 ad accounts.
create or replace function feeder.meta_assets_limits() returns trigger
language plpgsql set search_path = feeder, public as $$
begin
  if new.kind = 'page' and new.for_comments
     and (select count(*) from feeder.meta_assets where user_id = new.user_id and kind = 'page' and for_comments and asset_id <> new.asset_id) >= 2 then
    raise exception 'Auto comment works on at most 2 Pages' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and new.kind = 'ad_account'
     and (select count(*) from feeder.meta_assets where user_id = new.user_id and kind = 'ad_account') >= 25 then
    raise exception 'At most 25 ad accounts' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists meta_assets_limits on feeder.meta_assets;
create trigger meta_assets_limits before insert or update on feeder.meta_assets
  for each row execute function feeder.meta_assets_limits();

-- ---------------------------------------------------------------------
-- Token in Vault (service role only)
-- ---------------------------------------------------------------------
create or replace function feeder.save_meta_token(p_user uuid, p_business text, p_token text) returns void
language plpgsql security definer set search_path = feeder, public as $$
declare v_id uuid;
begin
  if p_business !~ '^[0-9]{5,25}$' then raise exception 'business id'; end if;
  if p_token is null or char_length(btrim(p_token)) < 40 then raise exception 'token'; end if;
  select token_secret_id into v_id from feeder.meta_connections where user_id = p_user;
  if v_id is null then
    v_id := vault.create_secret(btrim(p_token), 'feeder_meta_' || replace(gen_random_uuid()::text, '-', ''), 'Feeder: a seller''s Meta System User token');
  else
    perform vault.update_secret(v_id, btrim(p_token));
  end if;
  insert into feeder.meta_connections (user_id, business_id, token_secret_id, token_last4, status, problem)
  values (p_user, p_business, v_id, right(btrim(p_token), 4), 'pending', null)
  on conflict (user_id) do update
     set business_id = excluded.business_id, token_secret_id = excluded.token_secret_id, token_last4 = excluded.token_last4,
         status = 'pending', problem = null, updated_at = now();
end $$;

create or replace function feeder.meta_token(p_user uuid) returns table (business_id text, token text)
language sql security definer set search_path = feeder, public as $$
  select c.business_id, s.decrypted_secret
    from feeder.meta_connections c
    join vault.decrypted_secrets s on s.id = c.token_secret_id
   where c.user_id = p_user;
$$;

create or replace function feeder.remove_meta_connection(p_user uuid) returns void
language plpgsql security definer set search_path = feeder, public as $$
declare v_id uuid;
begin
  select token_secret_id into v_id from feeder.meta_connections where user_id = p_user;
  if v_id is not null then delete from vault.secrets where id = v_id; end if;
  delete from feeder.meta_assets where user_id = p_user;
  delete from feeder.meta_connections where user_id = p_user;
  update feeder.ad_accounts set meta_via = 'partner', meta_ad_account_id = null, meta_page_id = null, meta_instagram_id = null, meta_status = 'none', meta_info = '{}'::jsonb
   where user_id = p_user and meta_via = 'token';
end $$;

-- ---------------------------------------------------------------------
-- Autopublish's settings row knows how it is connected
-- ---------------------------------------------------------------------
alter table feeder.ad_accounts add column if not exists meta_via text not null default 'partner' check (meta_via in ('partner', 'token'));
comment on column feeder.ad_accounts.meta_via is 'partner = shared with Retexia''s business (Retexia confirms); token = the seller''s own Business portfolio token (checked by feeder.retexia.com, no confirmation needed).';

-- Same as 0036, except that with the seller's own token the server sets the status itself.
create or replace function feeder.ad_accounts_guard() returns trigger
language plpgsql set search_path = feeder, public as $$
begin
  if tg_op = 'INSERT' then
    if new.meta_via = 'token' then null;
    elsif new.meta_ad_account_id is null then new.meta_status := 'none';
    elsif new.meta_status in ('none', 'connected') then new.meta_status := 'requested'; end if;
    if new.tiktok_advertiser_id is null then new.tiktok_status := 'none'; elsif new.tiktok_status in ('none', 'connected') then new.tiktok_status := 'requested'; end if;
    return new;
  end if;
  if new.meta_via = 'token' then
    null; -- checked with the seller's own token by feeder.retexia.com
  elsif (new.meta_ad_account_id, new.meta_page_id, new.meta_instagram_id, new.meta_pixel_id)
     is distinct from (old.meta_ad_account_id, old.meta_page_id, old.meta_instagram_id, old.meta_pixel_id)
     or old.meta_via = 'token' then
    new.meta_status := case when new.meta_ad_account_id is null then 'none' else 'requested' end;
    new.meta_info := '{}'::jsonb;
  elsif new.meta_ad_account_id is null then
    new.meta_status := 'none';
  elsif new.meta_status = 'none' then
    new.meta_status := 'requested';
  end if;
  if (new.tiktok_advertiser_id, new.tiktok_identity_id) is distinct from (old.tiktok_advertiser_id, old.tiktok_identity_id) then
    new.tiktok_status := case when new.tiktok_advertiser_id is null then 'none' else 'requested' end;
    new.tiktok_info := '{}'::jsonb;
  elsif new.tiktok_advertiser_id is null then
    new.tiktok_status := 'none';
  elsif new.tiktok_status = 'none' then
    new.tiktok_status := 'requested';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Security: customers read their own rows (never the token); the server writes.
-- ---------------------------------------------------------------------
alter table feeder.meta_connections enable row level security;
alter table feeder.meta_assets enable row level security;
drop policy if exists own_read on feeder.meta_connections;
drop policy if exists own_read on feeder.meta_assets;
create policy own_read on feeder.meta_connections for select to authenticated using (user_id = (select auth.uid()) or (select public.is_privileged()));
create policy own_read on feeder.meta_assets for select to authenticated using (user_id = (select auth.uid()) or (select public.is_privileged()));
revoke insert, update, delete on feeder.meta_connections, feeder.meta_assets from anon, authenticated;
grant select on feeder.meta_assets to authenticated;
-- The secret's id isn't for customers either.
revoke select on feeder.meta_connections from anon, authenticated;
grant select (user_id, business_id, business_name, token_last4, token_user, scopes, status, problem, checked_at, created_at, updated_at) on feeder.meta_connections to authenticated;
grant all on feeder.meta_connections, feeder.meta_assets to service_role;
revoke execute on function feeder.save_meta_token(uuid, text, text), feeder.meta_token(uuid), feeder.remove_meta_connection(uuid) from public, anon, authenticated;
grant execute on function feeder.save_meta_token(uuid, text, text), feeder.meta_token(uuid), feeder.remove_meta_connection(uuid) to service_role;
