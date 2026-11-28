-- =====================================================================
-- 0049: The Feeder n8n gateway holds no credentials.
--
-- The keys the gateway workflow ("Retexia — Feeder Autopublish (gateway)")
-- needs are entered once in admin.retexia.com → Settings → Integrations and
-- kept in Supabase Vault. feeder.retexia.com sends only the key a call needs
-- with that call, so the workflow can be imported anywhere and published
-- without setting up a single n8n credential.
--   openai           OpenAI API key (Auto comment's AI)
--   meta             Retexia's Meta System User token (sellers on the older
--                    partner way; sellers with their own Business portfolio
--                    use their own token from Connections)
--   tiktok           TikTok Business API long-term access token
--   evolution_url / evolution_instance / evolution_key
--                    Evolution API, for Autopublish's WhatsApp notices
-- Owners set them (audited); the browser only ever sees "••••last4".
-- Safe to run again. Run after 0048.
-- =====================================================================

create or replace function public.admin_set_gateway_key(p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text; v_id uuid; v_value text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if not public.has_role(array['owner']) then
    raise exception 'Only an owner can change integrations' using errcode = '42501';
  end if;
  if p_key not in ('openai', 'meta', 'tiktok', 'evolution_url', 'evolution_instance', 'evolution_key') then
    raise exception 'Unknown key' using errcode = '22023';
  end if;
  if v_value is not null and char_length(v_value) > 2000 then raise exception 'Too long' using errcode = '22001'; end if;
  if p_key = 'evolution_url' and v_value is not null and v_value !~ '^https://[^[:space:]]+$' then
    raise exception 'The Evolution URL must start with https://' using errcode = '22023';
  end if;
  v_name := 'feeder_gateway_' || p_key;
  select id into v_id from vault.secrets where name = v_name;
  if v_value is null then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
  elsif v_id is null then
    perform vault.create_secret(v_value, v_name, 'Feeder gateway: ' || p_key);
  else
    perform vault.update_secret(v_id, v_value);
  end if;
  perform public._audit('secret.set', 'feeder_gateway', p_key, case when v_value is null then 'Removed' else 'Changed' end || ' the Feeder gateway key: ' || p_key);
end $$;

create or replace function public.admin_gateway_keys() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_role(array['owner']) then
    raise exception 'Only an owner can see integrations' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(replace(name, 'feeder_gateway_', ''),
             case when name in ('feeder_gateway_evolution_url', 'feeder_gateway_evolution_instance') then decrypted_secret
                  else '••••' || right(decrypted_secret, 4) end)
      from vault.decrypted_secrets where name like 'feeder\_gateway\_%'
  ), '{}'::jsonb);
end $$;

-- feeder.retexia.com's server (service role) reads them to send with each call.
create or replace function feeder.gateway_keys() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(replace(name, 'feeder_gateway_', ''), decrypted_secret), '{}'::jsonb)
    from vault.decrypted_secrets where name like 'feeder\_gateway\_%';
$$;

revoke execute on function public.admin_set_gateway_key(text, text), public.admin_gateway_keys() from public, anon;
grant execute on function public.admin_set_gateway_key(text, text), public.admin_gateway_keys() to authenticated;
revoke execute on function feeder.gateway_keys() from public, anon, authenticated;
grant execute on function feeder.gateway_keys() to service_role;
