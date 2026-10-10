-- =====================================================================
-- 0016: n8n is the worker, post.retexia.com decides (final design).
--
--   * The website decides what happens and when (it already plans and
--     schedules everything). n8n only runs short jobs it is asked to do:
--       plan · design · publish · delete · edit_text · whatsapp
--     Nothing waits or polls inside n8n, so it stays light with many customers.
--   * Customers' Facebook / Instagram access lives in Supabase only (Vault),
--     entered by Retexia with post.admin_connect_page(); the website needs no
--     Meta app keys. n8n reads the right customer's token for each job.
--   * Publishing clock: Supabase checks every minute (in the database) and calls
--     post.retexia.com only when a post is due; the website hands it to n8n.
--
-- Safe to run again, also over the earlier drafts of this file (they are removed).
-- Run after 0015.
-- =====================================================================

-- Earlier drafts (polling n8n, then database → n8n events with long waits): removed.
drop trigger if exists posts_n8n_event on post.posts;
drop trigger if exists businesses_n8n_event on post.businesses;
drop function if exists post._post_event();
drop function if exists post._business_event();
drop function if exists post._n8n_send(jsonb);
drop function if exists post.n8n_publish_post(uuid, timestamptz);
drop function if exists post.n8n_publish_jobs(int);
drop function if exists post.n8n_whatsapp_outbox(int);
drop function if exists post.n8n_whatsapp_message(uuid, text);
drop function if exists post.n8n_whatsapp_sent(jsonb);
drop function if exists post.n8n_missed_events();
drop function if exists post._wa_quiet(time, jsonb);

-- ---------------------------------------------------------------------
-- Customers' Facebook Page / Instagram, entered by Retexia (SQL Editor):
--
--   select post.admin_connect_page(
--     (select id from post.businesses where name = 'Amaya Cakes'),   -- the customer's business
--     '1046597695204235',            -- Facebook Page id
--     'EAAG…',                       -- Page access token (long-lived)
--     '17841444731611565',           -- Instagram business account id (or null)
--     'Amaya Cakes',                 -- Page name shown in the panel (optional)
--     'amayacakes');                 -- Instagram username (optional)
--
-- Run it again with a new token to replace it (e.g. after "Reconnect needed").
-- ---------------------------------------------------------------------
create or replace function post.admin_connect_page(
  p_business uuid, p_page_id text, p_token text, p_instagram_id text default null,
  p_page_name text default null, p_instagram_name text default null)
returns table (platform text, account_id uuid, status text)
language plpgsql volatile security definer set search_path = post, public as $$
#variable_conflict use_column
declare
  v_secret uuid;
  v_old uuid;
  v_id uuid;
begin
  if not exists (select 1 from post.businesses where id = p_business) then
    raise exception 'Business % not found', p_business;
  end if;
  if coalesce(btrim(p_page_id), '') = '' or coalesce(btrim(p_token), '') = '' then
    raise exception 'Give the Facebook Page id and its access token';
  end if;

  -- One Vault secret per business page token (reused by its Instagram account).
  select token_secret_id into v_old from post.social_accounts
   where business_id = p_business and platform = 'facebook' and external_id = btrim(p_page_id);
  v_secret := post.save_secret(v_old, btrim(p_token));

  insert into post.social_accounts as s (business_id, platform, external_id, display_name, token_secret_id, status, enabled)
  values (p_business, 'facebook', btrim(p_page_id), coalesce(p_page_name, 'Facebook Page'), v_secret, 'connected', true)
  on conflict (business_id, platform, external_id) do update
    set token_secret_id = excluded.token_secret_id, status = 'connected',
        display_name = coalesce(p_page_name, s.display_name), updated_at = now()
  returning id into v_id;
  platform := 'facebook'; account_id := v_id; status := 'connected';
  return next;

  if coalesce(btrim(p_instagram_id), '') <> '' then
    insert into post.social_accounts as s (business_id, platform, external_id, display_name, token_secret_id, status, enabled, ig_account_type)
    values (p_business, 'instagram', btrim(p_instagram_id), coalesce(p_instagram_name, 'Instagram'), v_secret, 'connected', true, 'business')
    on conflict (business_id, platform, external_id) do update
      set token_secret_id = excluded.token_secret_id, status = 'connected',
          display_name = coalesce(p_instagram_name, s.display_name), updated_at = now()
    returning id into v_id;
    platform := 'instagram'; account_id := v_id; status := 'connected';
    return next;
  end if;
end $$;

-- Who is ready to post: each business with its accounts (no tokens shown).
create or replace view post.admin_accounts as
  select b.id as business_id, b.name as business, u.email as owner_email, b.plan, b.subscription_status,
         a.platform, a.external_id, a.display_name, a.status, a.enabled,
         (a.token_secret_id is not null) as has_token, a.updated_at
    from post.businesses b
    left join auth.users u on u.id = b.owner_id
    left join post.social_accounts a on a.business_id = b.id
   order by b.name, a.platform;
revoke all on post.admin_accounts from public, anon, authenticated;
grant select on post.admin_accounts to service_role;

-- ---------------------------------------------------------------------
-- Publishing (the website claims the post, n8n posts it)
-- ---------------------------------------------------------------------
-- Settles a post once none of its accounts is still being published.
create or replace function post._settle_publishing(p_post uuid) returns text
language plpgsql security definer set search_path = post, public as $$
declare
  p post.posts%rowtype;
  v_total int;
  v_ok int;
  v_busy int;
  v_retry timestamptz;
  v_results jsonb;
begin
  select * into p from post.posts where id = p_post for update;
  if not found then return null; end if;
  select count(*), count(*) filter (where x.status::text = 'published'), count(*) filter (where x.status::text in ('publishing', 'pending')),
         min(x.next_retry_at) filter (where x.status::text = 'retrying'),
         coalesce(jsonb_agg(jsonb_build_object('platform', a.platform, 'ok', x.status::text = 'published', 'error', x.last_error, 'kind', x.error_kind)), '[]'::jsonb)
    into v_total, v_ok, v_busy, v_retry, v_results
    from post.publications x join post.social_accounts a on a.id = x.social_account_id
   where x.post_id = p_post;
  if v_busy > 0 then return 'publishing'; end if;

  if v_total = 0 then
    update post.posts set status = 'failed'::post.post_status,
           deny_reason = 'No Facebook or Instagram account is connected yet. Retexia connects them for you.' where id = p_post;
    insert into post.events (business_id, type, payload)
    values (p.business_id, 'publish_failed', jsonb_build_object('post_id', p_post, 'reason', 'No Facebook or Instagram account is connected.'));
    return 'failed';
  elsif v_retry is not null then
    -- Back to "approved" at the retry time: the publishing clock picks it up then.
    update post.posts set status = 'approved'::post.post_status, scheduled_at = v_retry where id = p_post;
    insert into post.events (business_id, type, payload) values (p.business_id, 'publish_retry', jsonb_build_object('post_id', p_post, 'results', v_results));
    return 'retrying';
  elsif v_ok = v_total then
    update post.posts set status = 'published'::post.post_status where id = p_post;
    insert into post.events (business_id, type, payload) values (p.business_id, 'published', jsonb_build_object('post_id', p_post, 'results', v_results));
  elsif v_ok > 0 then
    update post.posts set status = 'published'::post.post_status where id = p_post;
    insert into post.events (business_id, type, payload) values (p.business_id, 'publish_partial', jsonb_build_object('post_id', p_post, 'results', v_results));
  else
    update post.posts set status = 'failed'::post.post_status,
           deny_reason = left((select string_agg(distinct x.last_error, '; ') from post.publications x where x.post_id = p_post), 300)
     where id = p_post;
    insert into post.events (business_id, type, payload) values (p.business_id, 'publish_failed', jsonb_build_object('post_id', p_post, 'results', v_results));
    return 'failed';
  end if;
  if p.media_id is not null then update post.media set last_used_at = now() where id = p.media_id; end if;
  return 'published';
end $$;

-- n8n "publish": the accounts to post a claimed post to, one row each, with that
-- customer's own token. Nothing if the post isn't being published (already done, deleted).
create or replace function post.worker_publish_rows(p_post uuid)
returns table (publication_id uuid, post_id uuid, business_id uuid, platform text, external_id text, token text,
               is_story boolean, storage_path text, caption text, attempt int)
language plpgsql volatile security definer set search_path = post, public as $$
#variable_conflict use_column
declare
  p post.posts%rowtype;
  a post.social_accounts%rowtype;
  v_pub post.publications%rowtype;
  v_path text;
  v_kind text;
  v_rows int := 0;
begin
  select * into p from post.posts where id = p_post for update;
  if not found or p.status::text <> 'publishing' then return; end if;

  if p.format::text not in ('photo', 'story_photo') then
    update post.posts set status = 'failed'::post.post_status, deny_reason = 'This kind of post can''t be published automatically yet. Download it and post it yourself.' where id = p.id;
    return;
  end if;
  select m.storage_path, m.kind into v_path, v_kind from post.media m where m.id = p.media_id and m.business_id = p.business_id;
  if v_path is null or v_kind <> 'photo' then
    update post.posts set status = 'failed'::post.post_status, deny_reason = 'This post has no picture.' where id = p.id;
    return;
  end if;

  for a in select * from post.social_accounts s where s.business_id = p.business_id and s.enabled and s.status = 'connected' order by s.platform loop
    -- Done already (published / failed / deleted) or being posted right now: skip.
    select * into v_pub from post.publications x where x.post_id = p.id and x.social_account_id = a.id;
    if found then
      continue when v_pub.status::text in ('published', 'failed', 'removed', 'publishing');
      update post.publications x set status = 'publishing'::post.pub_status where x.id = v_pub.id returning x.* into v_pub;
    else
      insert into post.publications (post_id, social_account_id, status, attempts)
      values (p.id, a.id, 'publishing', 0)
      returning * into v_pub;
    end if;
    v_rows := v_rows + 1;
    publication_id := v_pub.id;
    post_id := p.id;
    business_id := p.business_id;
    platform := a.platform::text;
    external_id := a.external_id;
    token := case when a.token_secret_id is not null then post.read_secret(a.token_secret_id) end;
    is_story := p.is_story;
    storage_path := v_path;
    caption := case when p.is_story then ''
                    when a.platform::text = 'facebook' then coalesce(p.variants -> 'facebook' ->> 'caption', p.caption, '')
                    else coalesce(p.variants -> 'instagram' ->> 'caption', p.caption, '') end;
    attempt := v_pub.attempts + 1;
    return next;
  end loop;
  if v_rows = 0 then
    perform post._settle_publishing(p.id);
  end if;
end $$;

-- What Meta answered for one account. p: {publication_id, ok, external_id?, permalink?, container_id?,
-- error_kind?: temporary|needs_user|content, error?}. Returns the post's status.
create or replace function post.n8n_publish_result(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = post, public as $$
declare
  x post.publications%rowtype;
  a post.social_accounts%rowtype;
  v_ok boolean := coalesce((p ->> 'ok')::boolean, false);
  v_kind text := case when p ->> 'error_kind' in ('temporary', 'needs_user', 'content') then p ->> 'error_kind' else 'temporary' end;
  v_attempts int;
  v_retry boolean;
  v_at timestamptz;
begin
  select * into x from post.publications where id = (p ->> 'publication_id')::uuid for update;
  if not found then raise exception 'Publication not found'; end if;
  if x.status::text = 'published' then
    return jsonb_build_object('post_status', post._settle_publishing(x.post_id));
  end if;
  v_attempts := x.attempts + 1;
  if v_ok then
    update post.publications
       set status = 'published'::post.pub_status, attempts = v_attempts, external_id = nullif(p ->> 'external_id', ''),
           permalink = nullif(p ->> 'permalink', ''), container_id = coalesce(nullif(p ->> 'container_id', ''), container_id),
           published_at = now(), last_error = null, error_kind = null, next_retry_at = null
     where id = x.id;
  else
    v_retry := v_kind = 'temporary' and v_attempts <= 4;
    v_at := case when v_retry then now() + make_interval(mins => (array[2, 5, 15, 30])[v_attempts]) end;
    update post.publications
       set status = (case when v_retry then 'retrying' else 'failed' end)::post.pub_status, attempts = v_attempts,
           error_kind = v_kind, last_error = left(coalesce(p ->> 'error', 'Meta did not accept the post'), 500),
           container_id = coalesce(nullif(p ->> 'container_id', ''), container_id), next_retry_at = v_at
     where id = x.id;
    if v_kind = 'needs_user' then
      select * into a from post.social_accounts where id = x.social_account_id;
      update post.social_accounts set status = 'reconnect_needed' where id = a.id;
      insert into post.events (business_id, type, payload)
      values (a.business_id, 'reconnect_needed', jsonb_build_object('account_id', a.id, 'platform', a.platform, 'error', left(p ->> 'error', 300)));
    end if;
  end if;
  return jsonb_build_object('post_status', post._settle_publishing(x.post_id));
end $$;

-- A publish that never came back (n8n restarted mid-way): tried again now.
create or replace function post.recover_publishing() returns int
language plpgsql volatile security definer set search_path = post, public as $$
declare
  v_n int;
begin
  update post.publications x set status = 'retrying'::post.pub_status, next_retry_at = now()
    from post.posts q
   where q.id = x.post_id and q.status::text = 'publishing' and q.updated_at < now() - interval '15 minutes'
     and x.status::text = 'publishing';
  update post.posts set status = 'approved'::post.post_status, scheduled_at = now()
   where status::text = 'publishing' and updated_at < now() - interval '15 minutes';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- Deleting a published post / changing its Facebook text (n8n does the Meta calls)
-- ---------------------------------------------------------------------
create or replace function post.worker_delete_rows(p_post uuid)
returns table (publication_id uuid, platform text, external_id text, token text)
language sql stable security definer set search_path = post, public as $$
  select x.id, a.platform::text, x.external_id, case when a.token_secret_id is not null then post.read_secret(a.token_secret_id) end
    from post.publications x join post.social_accounts a on a.id = x.social_account_id
   where x.post_id = p_post and x.status::text = 'published' and x.external_id is not null;
$$;

-- p: {publication_id, ok, error?}. When nothing is left online, the post is "removed".
create or replace function post.worker_delete_result(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = post, public as $$
declare
  x post.publications%rowtype;
begin
  select * into x from post.publications where id = (p ->> 'publication_id')::uuid for update;
  if not found then return jsonb_build_object('ok', false); end if;
  if coalesce((p ->> 'ok')::boolean, false) then
    update post.publications set status = 'removed'::post.pub_status where id = x.id;
  else
    update post.publications set last_error = left(coalesce(p ->> 'error', 'Meta did not delete it'), 500) where id = x.id;
  end if;
  if not exists (select 1 from post.publications where post_id = x.post_id and status::text = 'published') then
    update post.posts set status = 'removed'::post.post_status where id = x.post_id;
  end if;
  return jsonb_build_object('ok', coalesce((p ->> 'ok')::boolean, false));
end $$;

create or replace function post.worker_edit_rows(p_post uuid)
returns table (publication_id uuid, external_id text, token text)
language sql stable security definer set search_path = post, public as $$
  select x.id, x.external_id, case when a.token_secret_id is not null then post.read_secret(a.token_secret_id) end
    from post.publications x join post.social_accounts a on a.id = x.social_account_id
   where x.post_id = p_post and x.status::text = 'published' and x.external_id is not null and a.platform::text = 'facebook';
$$;

revoke execute on function post.admin_connect_page(uuid, text, text, text, text, text), post._settle_publishing(uuid),
  post.worker_publish_rows(uuid), post.n8n_publish_result(jsonb), post.recover_publishing(),
  post.worker_delete_rows(uuid), post.worker_delete_result(jsonb), post.worker_edit_rows(uuid)
  from public, anon, authenticated;
grant execute on function post.admin_connect_page(uuid, text, text, text, text, text), post.recover_publishing() to service_role;
grant execute on function post.worker_publish_rows(uuid), post.n8n_publish_result(jsonb),
  post.worker_delete_rows(uuid), post.worker_delete_result(jsonb), post.worker_edit_rows(uuid) to service_role, post_n8n;

-- ---------------------------------------------------------------------
-- Publishing clock: every minute the database checks (a tiny query) and
-- calls post.retexia.com only when a post is due or a publish got stuck.
-- (Restores the 0008 job if an earlier draft of this file removed it.)
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    if exists (select 1 from cron.job where jobname = 'retexia-post-missed-events') then
      perform cron.unschedule('retexia-post-missed-events');
    end if;
    perform cron.schedule('retexia-post-publish-tick', '* * * * *', $c$
      select net.http_post(
        url := s.url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Retexia-Key', k.key),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000)
      from (select decrypted_secret as url from vault.decrypted_secrets where name = 'post_publish_url') s,
           (select decrypted_secret as key from vault.decrypted_secrets where name = 'post_cron_key') k
      where exists (select 1 from post.posts p where p.scheduled_at <= now() and p.status::text in ('approved', 'ready'))
         or exists (select 1 from post.posts p where p.status::text = 'publishing' and p.updated_at < now() - interval '15 minutes');
    $c$);
  end if;
end $$;
