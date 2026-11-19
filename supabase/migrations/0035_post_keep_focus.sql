-- =====================================================================
-- 0035: Retexia Post: playlist items keep what they are about (repair).
--
-- "What the posts are about" (only products, a mix…) is decided by the panel
-- per item and saved in posts.brief.focus by post.add_planned_items(). The
-- 0013 version of that function does NOT save it; if 0013 was run again
-- after 0015, every item looks like "The whole business" and is designed
-- that way (no product, no exact product photo). This puts the right
-- version back (same as 0015) and repairs upcoming items.
-- Safe to run again.
-- =====================================================================

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
              'focus', case when jsonb_typeof(it -> 'focus') = 'object' then it -> 'focus' end,
              'caption_language', coalesce(nullif(it ->> 'caption_language', ''), b.settings ->> 'caption_language', 'en'),
              'design_language', coalesce(nullif(it ->> 'design_language', ''), b.settings ->> 'design_language', 'en'))))
    on conflict (business_id, local_date, slot, is_story) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;
revoke execute on function post.add_planned_items(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function post.add_planned_items(uuid, date, jsonb) to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'post_n8n') then
    grant execute on function post.add_planned_items(uuid, date, jsonb) to post_n8n;
  end if;
end $$;

-- Repair: upcoming AI items not designed yet that name a product but lost the
-- focus get it back (matched by name within the same business).
update post.posts p
   set brief = p.brief || jsonb_build_object('focus', jsonb_build_object('type', 'product', 'id', pr.id, 'name', pr.name))
  from post.products pr
 where pr.business_id = p.business_id
   and p.source = 'ai'
   and p.status::text = 'planned'
   and p.scheduled_at > now()
   and p.brief ? 'product'
   and not (p.brief ? 'focus')
   and lower(btrim(p.brief ->> 'product')) = lower(btrim(pr.name));
