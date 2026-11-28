-- =====================================================================
-- 0050: Only the customer-dependent credentials travel with each call.
--
-- 0049 moved every key out of the n8n gateway. Only Meta and TikTok depend on
-- the customer, so OpenAI and Evolution go back to being n8n credentials:
--   * admin → Settings → Integrations keeps two keys: Retexia's own Meta
--     System User token and TikTok token, used only for sellers on the older
--     partner way (shared with Retexia's business / Business Center).
--   * Each seller's own TikTok access token (Connections → TikTok) is kept in
--     Vault like their Meta token; ad_accounts.tiktok_via = 'token' means it
--     was checked with their own token, so it doesn't wait for Retexia.
-- Safe to run again. Run after 0049.
-- =====================================================================

-- Admin keys: Meta and TikTok only.
create or replace function public.admin_set_gateway_key(p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text; v_id uuid; v_value text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if not public.has_role(array['owner']) then
    raise exception 'Only an owner can change integrations' using errcode = '42501';
  end if;
  if p_key not in ('meta', 'tiktok') then
    raise exception 'Unknown key' using errcode = '22023';
  end if;
  if v_value is not null and char_length(v_value) > 2000 then raise exception 'Too long' using errcode = '22001'; end if;
  v_name := 'feeder_gateway_' || p_key;
  select id into v_id from vault.secrets where name = v_name;
  if v_value is null then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
  elsif v_id is null then
    perform vault.create_secret(v_value, v_name, 'Feeder gateway: Retexia''s own ' || p_key || ' token');
  else
    perform vault.update_secret(v_id, v_value);
  end if;
  perform public._audit('secret.set', 'feeder_gateway', p_key, case when v_value is null then 'Removed' else 'Changed' end || ' Retexia''s own ' || p_key || ' token (Feeder gateway)');
end $$;

create or replace function public.admin_gateway_keys() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_role(array['owner']) then
    raise exception 'Only an owner can see integrations' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(replace(name, 'feeder_gateway_', ''), '••••' || right(decrypted_secret, 4))
      from vault.decrypted_secrets where name in ('feeder_gateway_meta', 'feeder_gateway_tiktok')
  ), '{}'::jsonb);
end $$;

create or replace function feeder.gateway_keys() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(replace(name, 'feeder_gateway_', ''), decrypted_secret), '{}'::jsonb)
    from vault.decrypted_secrets where name in ('feeder_gateway_meta', 'feeder_gateway_tiktok');
$$;

-- Keys 0049 allowed that now live in n8n again are no longer kept here.
delete from vault.secrets where name in ('feeder_gateway_openai', 'feeder_gateway_evolution_url', 'feeder_gateway_evolution_instance', 'feeder_gateway_evolution_key');

-- ---------------------------------------------------------------------
-- The seller's own TikTok token
-- ---------------------------------------------------------------------
alter table feeder.ad_accounts add column if not exists tiktok_via text not null default 'partner' check (tiktok_via in ('partner', 'token'));
alter table feeder.ad_accounts add column if not exists tiktok_token_secret_id uuid;
alter table feeder.ad_accounts add column if not exists tiktok_token_last4 text check (char_length(tiktok_token_last4) <= 4);
comment on column feeder.ad_accounts.tiktok_via is 'partner = shared with Retexia''s Business Center (Retexia confirms); token = the seller''s own TikTok access token (Vault), checked by feeder.retexia.com.';

create or replace function feeder.save_tiktok_token(p_user uuid, p_token text) returns void
language plpgsql security definer set search_path = feeder, public as $$
declare v_id uuid; v_token text := nullif(btrim(coalesce(p_token, '')), '');
begin
  select tiktok_token_secret_id into v_id from feeder.ad_accounts where user_id = p_user;
  if v_token is null then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
    -- Back to the partner way: the guard sets the status (waits for Retexia, or none without an advertiser).
    update feeder.ad_accounts set tiktok_token_secret_id = null, tiktok_token_last4 = null, tiktok_via = 'partner'
     where user_id = p_user;
    return;
  end if;
  if char_length(v_token) < 20 or v_token ~ '\s' then raise exception 'token'; end if;
  if v_id is null then
    v_id := vault.create_secret(v_token, 'feeder_tiktok_' || replace(gen_random_uuid()::text, '-', ''), 'Feeder: a seller''s TikTok access token');
  else
    perform vault.update_secret(v_id, v_token);
  end if;
  insert into feeder.ad_accounts (user_id, tiktok_via, tiktok_token_secret_id, tiktok_token_last4)
  values (p_user, 'token', v_id, right(v_token, 4))
  on conflict (user_id) do update
     set tiktok_via = 'token', tiktok_token_secret_id = v_id, tiktok_token_last4 = right(v_token, 4);
end $$;

create or replace function feeder.tiktok_token(p_user uuid) returns text
language sql stable security definer set search_path = feeder, public as $$
  select s.decrypted_secret from feeder.ad_accounts a join vault.decrypted_secrets s on s.id = a.tiktok_token_secret_id where a.user_id = p_user;
$$;

revoke execute on function feeder.save_tiktok_token(uuid, text), feeder.tiktok_token(uuid) from public, anon, authenticated;
grant execute on function feeder.save_tiktok_token(uuid, text), feeder.tiktok_token(uuid) to service_role;

-- Same as 0048, plus: with their own TikTok token the server sets the TikTok status itself.
create or replace function feeder.ad_accounts_guard() returns trigger
language plpgsql set search_path = feeder, public as $$
begin
  if tg_op = 'INSERT' then
    if new.meta_via = 'token' then null;
    elsif new.meta_ad_account_id is null then new.meta_status := 'none';
    elsif new.meta_status in ('none', 'connected') then new.meta_status := 'requested'; end if;
    if new.tiktok_via = 'token' then null;
    elsif new.tiktok_advertiser_id is null then new.tiktok_status := 'none';
    elsif new.tiktok_status in ('none', 'connected') then new.tiktok_status := 'requested'; end if;
    return new;
  end if;
  if new.meta_via = 'token' then
    null;
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
  if new.tiktok_via = 'token' then
    if new.tiktok_advertiser_id is null then new.tiktok_status := 'none';
    elsif new.tiktok_advertiser_id is distinct from old.tiktok_advertiser_id then new.tiktok_info := '{}'::jsonb; new.tiktok_status := 'problem'; end if;
  elsif (new.tiktok_advertiser_id, new.tiktok_identity_id) is distinct from (old.tiktok_advertiser_id, old.tiktok_identity_id) or old.tiktok_via = 'token' then
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
