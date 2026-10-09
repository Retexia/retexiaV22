-- =====================================================================
-- 0013: Retexia Post — the daily playlist.
--
-- Every day, in the business's own time zone:
--   06:00  tomorrow's playlist is written: N posts + M stories (plan limits),
--          each a prompt with its time, format and languages ("planned");
--          the owner can edit, add, delete or move items all day;
--   00:00  the day's planned items are designed (picture + captions), so the
--          whole day is ready by 06:00; they publish at their times.
-- Playlist items use slots 1–5 (posts and stories separately); posts made by
-- hand use slots 6–10. Published posts can be removed from Facebook/Instagram
-- (status "removed").
--
-- Functions used by post.retexia.com (service role) and the n8n workflow
-- "Retexia — Post (plan + design)" (role post_n8n or the service role):
--   plan_context, design_context, add_planned_items, claim_planning_businesses,
--   claim_design_items, finish_design, design_failed, item_time.
-- Safe to run again. Run after 0005–0012.
-- =====================================================================

-- New statuses (used only inside plpgsql bodies below, so this file can run in one transaction).
alter type post.post_status add value if not exists 'planned';
alter type post.post_status add value if not exists 'removed';
alter type post.pub_status add value if not exists 'removed';

-- Slots: 1–5 playlist, 6–10 made by hand.
alter table post.posts drop constraint if exists posts_slot_check;
alter table post.posts add constraint posts_slot_check check (slot between 1 and 10);
alter table post.plan_items drop constraint if exists plan_items_slot_check;
alter table post.plan_items add constraint plan_items_slot_check check (slot between 1 and 10);
alter table post.plan_items drop constraint if exists plan_items_slots_per_day_check;
alter table post.plan_items add constraint plan_items_slots_per_day_check check (slots_per_day between 1 and 10);

alter table post.businesses add column if not exists last_plan_date date;
comment on column post.businesses.last_plan_date is 'Local date whose 06:00 playlist run has happened (it writes the next day''s playlist).';

-- The old workflow's draft trigger is replaced by finish_design().
drop trigger if exists posts_align_draft_time on post.posts;

-- ---------------------------------------------------------------------
-- Times
-- ---------------------------------------------------------------------
-- Default publish times for n items a day (posts or stories), spread over the day.
create or replace function post.default_times(p_count int, p_story boolean) returns text[]
language sql immutable as $$
  select case greatest(1, least(5, p_count))
    when 1 then case when p_story then array['10:00'] else array['12:00'] end
    when 2 then case when p_story then array['10:00', '20:30'] else array['09:00', '18:00'] end
    when 3 then case when p_story then array['10:00', '15:00', '20:30'] else array['09:00', '13:00', '19:00'] end
    when 4 then case when p_story then array['09:30', '13:00', '16:30', '20:30'] else array['08:00', '12:00', '16:00', '20:00'] end
    else case when p_story then array['09:30', '12:30', '15:30', '18:30', '21:30'] else array['08:00', '11:00', '14:00', '17:00', '20:00'] end
  end;
$$;

-- When playlist item n (1–5) of a day goes out, from settings.playlist (or the defaults).
create or replace function post.item_time(p_business uuid, p_date date, p_slot int, p_story boolean) returns timestamptz
language plpgsql stable set search_path = post, public as $$
declare
  b post.businesses%rowtype;
  v_times jsonb;
  v_count int;
  v_time text;
begin
  select * into b from post.businesses where id = p_business;
  if not found then return null; end if;
  v_times := b.settings -> 'playlist' -> (case when p_story then 'story_times' else 'post_times' end);
  v_count := coalesce((b.settings -> 'playlist' ->> (case when p_story then 'stories' else 'posts' end))::int, 3);
  v_time := coalesce(
    nullif(v_times ->> (p_slot - 1), ''),
    (post.default_times(greatest(v_count, p_slot), p_story))[least(p_slot, 5)],
    '12:00');
  return (p_date + v_time::time) at time zone b.timezone;
end $$;

-- Kept for older callers: feed post n of a day.
create or replace function post.slot_time(p_business uuid, p_date date, p_slot int) returns timestamptz
language sql stable set search_path = post, public as $$
  select post.item_time(p_business, p_date, p_slot, false);
$$;

-- ---------------------------------------------------------------------
-- Context for the AI (n8n reads it in one query)
-- ---------------------------------------------------------------------
create or replace function post.design_context(p_business uuid) returns jsonb
language sql stable security definer set search_path = post, public as $$
  select jsonb_build_object(
    'business', jsonb_build_object('id', b.id, 'name', b.name, 'category', b.category, 'country', b.country,
                                   'languages', b.languages, 'brand', b.brand, 'brand_brief', b.brand_brief,
                                   'caption_language', coalesce(b.settings ->> 'caption_language', 'en'),
                                   'design_language', coalesce(b.settings ->> 'design_language', 'en')),
    'products', coalesce((select jsonb_agg(x) from (
        select name, price, currency, left(description, 120) as description
          from post.products where business_id = b.id and active
         order by created_at desc limit 20) x), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(left(r.caption, 140)) from (
        select caption from post.posts
         where business_id = b.id and caption is not null
         order by created_at desc limit 5) r), '[]'::jsonb))
  from post.businesses b where b.id = p_business;
$$;

create or replace function post.plan_context(p_business uuid, p_date date) returns jsonb
language sql stable security definer set search_path = post, public as $$
  select post.design_context(p_business) || jsonb_build_object(
    'offers', coalesce((select jsonb_agg(jsonb_build_object('title', i.details ->> 'title', 'details', i.note,
                                 'price', i.details ->> 'price', 'discount', i.details ->> 'discount', 'ends', i.end_date))
                          from post.plan_items i
                         where i.business_id = p_business and i.type = 'offer' and i.active
                           and p_date between i.start_date and i.end_date), '[]'::jsonb),
    'recent_prompts', coalesce((select jsonb_agg(x.p) from (
        select left(brief ->> 'prompt', 160) as p from post.posts
         where business_id = p_business and brief ? 'prompt'
         order by created_at desc limit 20) x), '[]'::jsonb));
$$;

-- ---------------------------------------------------------------------
-- Playlist
-- ---------------------------------------------------------------------
-- Adds planned items for a day. Items: [{format: "post"|"story", slot: 1-5, time?: "HH:MM", title, prompt,
-- caption_language?, design_language?, source?, plan_item_id?, angle?, product?}]. Existing slots are kept.
create or replace function post.add_planned_items(p_business uuid, p_date date, p_items jsonb) returns int
language plpgsql security definer set search_path = post, public as $$
declare
  b post.businesses%rowtype;
  it jsonb;
  v_story boolean;
  v_slot int;
  v_at timestamptz;
  v_count int := 0;
begin
  select * into b from post.businesses where id = p_business;
  if not found then raise exception 'Business not found'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_story := coalesce(it ->> 'format', 'post') = 'story';
    v_slot := greatest(1, least(10, coalesce((it ->> 'slot')::int, 1)));
    v_at := case when it ->> 'time' ~ '^\d{2}:\d{2}$'
                 then (p_date + (it ->> 'time')::time) at time zone b.timezone
                 else post.item_time(p_business, p_date, v_slot, v_story) end;
    insert into post.posts (business_id, local_date, slot, format, scheduled_at, status, source, plan_item_id, brief)
    values (p_business, p_date, v_slot, (case when v_story then 'story_photo' else 'photo' end)::post.post_format, v_at,
            'planned'::post.post_status,
            coalesce(nullif(it ->> 'source', ''), 'ai'),
            case when it ->> 'plan_item_id' ~ '^[0-9a-f-]{36}$' then (it ->> 'plan_item_id')::uuid end,
            jsonb_strip_nulls(jsonb_build_object(
              'title', left(it ->> 'title', 120),
              'prompt', left(coalesce(it ->> 'prompt', ''), 1500),
              'angle', left(it ->> 'angle', 60),
              'product', left(it ->> 'product', 120),
              'caption_language', coalesce(nullif(it ->> 'caption_language', ''), b.settings ->> 'caption_language', 'en'),
              'design_language', coalesce(nullif(it ->> 'design_language', ''), b.settings ->> 'design_language', 'en'))))
    on conflict (business_id, local_date, slot, is_story) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;

-- Businesses whose 06:00 run is due: writes tomorrow's playlist (and today's, on the first day).
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
       and (now() at time zone b.timezone)::time >= time '06:00'
       and b.last_plan_date is distinct from (now() at time zone b.timezone)::date
     order by b.last_plan_date nulls first
     limit p_limit
     for update of b skip locked
  ), upd as (
    update post.businesses b set last_plan_date = due.d from due where b.id = due.id returning b.id, due.d
  )
  select upd.id, upd.d + 1, upd.d,
         not exists (select 1 from post.posts p where p.business_id = upd.id and p.local_date = upd.d and p.slot <= 5)
    from upd;
end $$;

-- Planned items to design now: their day has started (00:00), or they are under 3 hours away.
-- Items stuck in "generating" for 20 minutes are tried again (3 tries in all).
create or replace function post.claim_design_items(p_limit int default 20)
returns setof post.posts
language plpgsql volatile security definer set search_path = post, public as $$
begin
  if exists (select 1 from post.system_settings s where s.id = 1 and s.generation_paused) then
    return;
  end if;
  return query
  with due as (
    select p.id from post.posts p
      join post.businesses b on b.id = p.business_id
     where b.subscription_status in ('trialing', 'active')
       and coalesce((b.settings ->> 'paused')::boolean, false) = false
       and p.scheduled_at > now()
       and (
         (p.status::text = 'planned' and (now() >= (p.local_date::timestamp at time zone b.timezone) or p.scheduled_at <= now() + interval '3 hours'))
         or (p.status::text = 'generating' and p.updated_at < now() - interval '20 minutes' and coalesce((p.brief ->> 'design_attempts')::int, 0) < 3)
       )
     order by p.scheduled_at
     limit p_limit
     for update of p skip locked
  )
  update post.posts p
     set status = 'generating'::post.post_status,
         brief = p.brief || jsonb_build_object('design_attempts', coalesce((p.brief ->> 'design_attempts')::int, 0) + 1,
                                               'design_started_at', now())
    from due where p.id = due.id
  returning p.*;
end $$;

-- n8n's last step: the design is saved. With post_id: that playlist item becomes "ready" (or "approved"
-- when it should go out now). Without: a post made by hand, in a free slot 6–10 of its day.
-- p: {post_id?, business_id, format: post|story, storage_path, bytes, alt_text, caption, variants, brief,
--     publish, scheduled_at?, image_cost, text_cost}
create or replace function post.finish_design(p jsonb) returns jsonb
language plpgsql security definer set search_path = post, public as $$
declare
  v_business uuid := (p ->> 'business_id')::uuid;
  v_story boolean := coalesce(p ->> 'format', 'post') = 'story';
  v_media uuid;
  v_post post.posts%rowtype;
  v_publish boolean := coalesce((p ->> 'publish')::boolean, false);
  b post.businesses%rowtype;
  v_at timestamptz;
  v_date date;
  v_slot int;
begin
  select * into b from post.businesses where id = v_business;
  if not found then raise exception 'Business not found'; end if;

  insert into post.media (business_id, kind, source, storage_path, bytes, description, width, height)
  values (v_business, 'photo', 'ai', p ->> 'storage_path', nullif(p ->> 'bytes', '')::int, left(p ->> 'alt_text', 500),
          case when v_story then 1088 else 1088 end, case when v_story then 1920 else 1360 end)
  returning id into v_media;
  perform post.bump_usage(v_business, 'images', 1, coalesce(nullif(p ->> 'image_cost', '')::numeric, 0));
  perform post.bump_usage(v_business, 'text_calls', 1, coalesce(nullif(p ->> 'text_cost', '')::numeric, 0));

  if nullif(p ->> 'post_id', '') is not null then
    update post.posts x
       set status = (case when v_publish then 'approved' else 'ready' end)::post.post_status,
           media_id = v_media,
           caption = nullif(p ->> 'caption', ''),
           variants = coalesce(p -> 'variants', '{}'::jsonb),
           brief = x.brief || coalesce(p -> 'brief', '{}'::jsonb),
           scheduled_at = case when v_publish then now() else x.scheduled_at end,
           approved_at = case when v_publish then now() else null end
     where x.id = (p ->> 'post_id')::uuid and x.business_id = v_business
       and x.status::text in ('planned', 'generating', 'denied', 'needs_manual')
    returning x.* into v_post;
    if not found then
      -- Deleted or changed meanwhile: keep the picture in the library, change nothing else.
      return jsonb_build_object('post_id', p ->> 'post_id', 'status', 'gone', 'media_id', v_media);
    end if;
    return jsonb_build_object('post_id', v_post.id, 'status', v_post.status::text, 'media_id', v_media);
  end if;

  v_at := case when v_publish then now() else coalesce(nullif(p ->> 'scheduled_at', '')::timestamptz, now() + interval '1 hour') end;
  v_date := (v_at at time zone b.timezone)::date;
  select s into v_slot from generate_series(6, 10) s
   where not exists (select 1 from post.posts x where x.business_id = v_business and x.local_date = v_date and x.slot = s and x.is_story = v_story)
   order by s limit 1;
  if v_slot is null then raise exception 'No free slot for % on %', case when v_story then 'stories' else 'posts' end, v_date; end if;
  insert into post.posts (business_id, local_date, slot, format, scheduled_at, status, source, brief, caption, variants, media_id, approved_at)
  values (v_business, v_date, v_slot, (case when v_story then 'story_photo' else 'photo' end)::post.post_format, v_at,
          (case when v_publish then 'approved' else 'ready' end)::post.post_status, 'manual',
          coalesce(p -> 'brief', '{}'::jsonb), nullif(p ->> 'caption', ''), coalesce(p -> 'variants', '{}'::jsonb), v_media,
          case when v_publish then now() end)
  returning * into v_post;
  return jsonb_build_object('post_id', v_post.id, 'status', v_post.status::text, 'media_id', v_media);
end $$;

-- n8n could not design an item: the owner sees it (needs you) with the reason.
create or replace function post.design_failed(p_post uuid, p_error text) returns void
language plpgsql security definer set search_path = post, public as $$
begin
  update post.posts
     set status = 'needs_manual'::post.post_status, deny_reason = left(coalesce(p_error, 'The design failed'), 300)
   where id = p_post and status::text in ('planned', 'generating', 'denied');
end $$;

-- Planned items never designed and designs still running 30 minutes after their time are skipped.
create or replace function post.expire_stale_posts() returns void
language plpgsql volatile set search_path = post, public as $$
begin
  update post.posts p set status = 'expired'::post.post_status
    from post.businesses b
   where b.id = p.business_id
     and ((p.status::text = 'ready' and not coalesce((b.settings ->> 'auto_publish')::boolean, true) and now() >= p.scheduled_at - interval '15 minutes')
       or (p.status::text = 'needs_manual' and now() >= p.scheduled_at - interval '15 minutes')
       or (p.status::text in ('planned', 'generating', 'safety_review', 'denied') and now() >= p.scheduled_at + interval '30 minutes'));
  update post.posts p set status = 'approved'::post.post_status
   where p.status::text = 'publishing' and p.updated_at < now() - interval '20 minutes'
     and not exists (select 1 from post.publications x where x.post_id = p.id);
end $$;

revoke execute on function post.default_times(int, boolean), post.item_time(uuid, date, int, boolean),
  post.design_context(uuid), post.plan_context(uuid, date), post.add_planned_items(uuid, date, jsonb),
  post.claim_planning_businesses(int), post.claim_design_items(int), post.finish_design(jsonb),
  post.design_failed(uuid, text) from public, anon, authenticated;
grant execute on function post.default_times(int, boolean), post.item_time(uuid, date, int, boolean),
  post.design_context(uuid), post.plan_context(uuid, date), post.add_planned_items(uuid, date, jsonb),
  post.claim_planning_businesses(int), post.claim_design_items(int), post.finish_design(jsonb),
  post.design_failed(uuid, text), post.expire_stale_posts() to service_role, post_n8n;

-- ---------------------------------------------------------------------
-- Website: what each plan includes (posts and stories a day)
-- ---------------------------------------------------------------------
delete from public.package_features
 where package_id in (select pk.id from public.packages pk join public.products p on p.id = pk.product_id where p.slug = 'post')
   and id not in (
     select md5('retexia:package-feature:post:' || k || ':' || n)::uuid
       from unnest(array['starter', 'growth', 'pro']) k, generate_series(1, 12) n);
insert into public.package_features (id, package_id, label, included, sort_order)
select md5('retexia:package-feature:post:' || f.pkg || ':' || f.n)::uuid, pk.id, f.label, f.included, f.n
from public.packages pk
join public.products p on p.id = pk.product_id and p.slug = 'post'
join (values
  ('starter', 1, '1 business', true),
  ('starter', 2, '2 accounts: your Facebook Page and Instagram', true),
  ('starter', 3, 'Up to 2 posts and 2 stories a day, made for you', true),
  ('starter', 4, '130 AI designs a month', true),
  ('starter', 5, 'Captions and designs in Sinhala, English or Tamil', true),
  ('starter', 6, 'Edit, redo or delete any post, even after it is published', true),
  ('starter', 7, 'Offers and special days', true),
  ('starter', 8, '60 redos a month', true),
  ('starter', 9, 'Week plan', false),
  ('growth', 1, 'Everything in Starter', true),
  ('growth', 2, '4 connected accounts', true),
  ('growth', 3, 'Up to 3 posts and 3 stories a day', true),
  ('growth', 4, '200 AI designs a month', true),
  ('growth', 5, '200 redos a month', true),
  ('growth', 6, 'Week plan: choose what goes out each day', true),
  ('growth', 7, 'Priority WhatsApp support', true),
  ('pro', 1, 'Everything in Growth', true),
  ('pro', 2, 'Up to 3 businesses or branches', true),
  ('pro', 3, '10 connected accounts', true),
  ('pro', 4, 'Up to 5 posts and 5 stories a day', true),
  ('pro', 5, '330 AI designs a month', true),
  ('pro', 6, '500 redos a month', true),
  ('pro', 7, 'Same-day support', true)
) as f (pkg, n, label, included) on f.pkg = pk.slug
on conflict (id) do update set
  label = excluded.label,
  included = excluded.included,
  sort_order = excluded.sort_order;
