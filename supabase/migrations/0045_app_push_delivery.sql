-- =====================================================================
-- 0045: app push notifications go out on their own
--   0044 queues pushes in notifications_outbox (channel 'push'), but nothing told the server to
--   send them when the database itself added one (Lingo Feeder "Call them", new orders, number
--   problems). Now:
--   * a new push row asks feeder.retexia.com/api/push/tick to send it at once (pg_net, async: the
--     insert never waits for it);
--   * every minute, while push rows are still waiting (Expo or the server was down), it asks again.
--   The URL is the Vault secret push_tick_url; the key is the existing post_cron_key (POST_CRON_KEY).
-- Safe to run again. Run after 0044.
-- =====================================================================

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'vault')
     and not exists (select 1 from vault.decrypted_secrets where name = 'push_tick_url') then
    perform vault.create_secret('https://feeder.retexia.com/api/push/tick', 'push_tick_url');
  end if;
end $$;

-- Ask the panels to send (no-op when pg_net or the Vault secrets are missing, e.g. in tests).
create or replace function public.kick_push_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null or not exists (select 1 from pg_namespace where nspname = 'vault') then
    return;
  end if;
  execute $q$select (select decrypted_secret from vault.decrypted_secrets where name = 'push_tick_url'),
                    (select decrypted_secret from vault.decrypted_secrets where name = 'post_cron_key')$q$
    into v_url, v_key;
  if v_url is null or v_key is null then
    return;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 30000)'
    using v_url, jsonb_build_object('Content-Type', 'application/json', 'X-Retexia-Key', v_key), '{}'::jsonb;
end;
$$;
revoke execute on function public.kick_push_dispatch() from public, anon, authenticated;
grant execute on function public.kick_push_dispatch() to service_role;

-- New push rows: ask once per statement (a change that queues several pushes asks once).
create or replace function public.push_rows_added() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from added where channel = 'push') then
    perform public.kick_push_dispatch();
  end if;
  return null;
end;
$$;
revoke execute on function public.push_rows_added() from public, anon, authenticated;

drop trigger if exists push_rows_added on public.notifications_outbox;
create trigger push_rows_added after insert on public.notifications_outbox
  referencing new table as added
  for each statement execute function public.push_rows_added();

-- Every minute while pushes are still waiting (Expo or the server was down): ask again.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('retexia-push-retry', '* * * * *', $c$
      select public.kick_push_dispatch()
       where exists (select 1 from public.notifications_outbox
                      where channel = 'push' and status = 'pending' and attempts < 5
                        and created_at > now() - interval '1 day');
    $c$);
  else
    raise notice 'pg_cron not enabled: pushes still go out at once, but failed ones are not retried.';
  end if;
end $$;
