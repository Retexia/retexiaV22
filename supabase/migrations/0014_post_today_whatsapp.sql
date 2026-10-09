-- =====================================================================
-- 0014: Post playlist follow-ups.
--
--   * Publish automatically for every business type (on until the owner turns
--     it off). Businesses that were held back by their type are switched on.
--   * The daily planning time is a setting (settings.playlist.plan_time,
--     default 06:00), and every run also fills today's empty slots.
--   * WhatsApp messages to the owner: each post/story with its caption when it
--     is ready, when it is published, and when something needs them. The
--     columns below remember what was sent so nothing is sent twice.
-- Safe to run again. Run after 0013.
-- =====================================================================

update post.businesses
   set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{auto_publish}', 'true'::jsonb)
 where category in ('Health and wellness', 'Supplements', 'Alcohol', 'Finance and insurance')
   and coalesce((settings ->> 'auto_publish')::boolean, true) = false;

alter table post.posts add column if not exists wa_media_id uuid;
alter table post.posts add column if not exists wa_published_at timestamptz;
alter table post.posts add column if not exists wa_alert text;
comment on column post.posts.wa_media_id is 'Picture last sent to the owner on WhatsApp (a redo sends the new one).';
comment on column post.posts.wa_published_at is 'When the owner was told on WhatsApp that this went out.';
comment on column post.posts.wa_alert is 'Status the owner was last alerted about on WhatsApp (needs_manual, failed, blocked).';

-- The daily run, due at settings.playlist.plan_time (default 06:00): writes
-- tomorrow's playlist and fills today's empty slots.
create or replace function post.claim_planning_businesses(p_limit int default 5)
returns table (business_id uuid, plan_date date, today date, plan_today boolean)
language plpgsql volatile security definer set search_path = post, public as $$
begin
  if exists (select 1 from post.system_settings s where s.id = 1 and s.generation_paused) then
    return;
  end if;
  return query
  with due as (
    select b.id, (now() at time zone b.timezone)::date as d
      from post.businesses b
     where b.onboarding_done
       and b.subscription_status in ('trialing', 'active')
       and coalesce((b.settings ->> 'paused')::boolean, false) = false
       and (now() at time zone b.timezone)::time >=
           (case when b.settings -> 'playlist' ->> 'plan_time' ~ '^([01]\d|2[0-3]):[0-5]\d$'
                 then (b.settings -> 'playlist' ->> 'plan_time')::time else time '06:00' end)
       and b.last_plan_date is distinct from (now() at time zone b.timezone)::date
     order by b.last_plan_date nulls first
     limit p_limit
     for update of b skip locked
  ), upd as (
    update post.businesses b set last_plan_date = due.d from due where b.id = due.id returning b.id, due.d
  )
  select upd.id, upd.d + 1, upd.d, true from upd;
end $$;

revoke execute on function post.claim_planning_businesses(int) from public, anon, authenticated;
grant execute on function post.claim_planning_businesses(int) to service_role, post_n8n;
