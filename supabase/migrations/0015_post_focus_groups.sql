-- =====================================================================
-- 0015: What a post is about (its focus).
--
--   * post.product_groups: groups of products the owner makes (e.g. "Cakes").
--   * Every post can be about one product, a group, or the whole business
--     (its "About your business" summary): posts.brief.focus =
--       {"type": "product" | "group" | "business", "id"?: uuid, "name"?: text}.
--     The daily playlist picks one product or the whole business at random.
--   * post.design_context(business, focus): the AI only sees the product(s)
--     of the focus, so it can't feature another product by mistake.
-- Safe to run again. Run after 0014.
-- =====================================================================

create table if not exists post.product_groups (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references post.businesses (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  product_ids uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, name)
);
create index if not exists product_groups_business_idx on post.product_groups (business_id);
comment on table post.product_groups is 'Groups of products a post can be about (e.g. "Cakes", "Party packs").';

alter table post.product_groups enable row level security;
drop policy if exists own_rows on post.product_groups;
create policy own_rows on post.product_groups for all to authenticated
  using (post.is_owner(business_id) or (select public.is_privileged()))
  with check (post.is_owner(business_id));
grant select, insert, update, delete on post.product_groups to authenticated;
grant all on post.product_groups to service_role;
grant select on post.product_groups to post_n8n;

-- A deleted product leaves its groups.
create or replace function post.product_left_groups() returns trigger
language plpgsql security definer set search_path = post, public as $$
begin
  update post.product_groups set product_ids = array_remove(product_ids, old.id), updated_at = now()
   where business_id = old.business_id and old.id = any(product_ids);
  return old;
end $$;
drop trigger if exists products_leave_groups on post.products;
create trigger products_leave_groups after delete on post.products for each row execute function post.product_left_groups();

-- ---------------------------------------------------------------------
-- What the AI sees for one design: the business, and the product(s) of the focus.
-- p_focus: {"type": "product", "id"} | {"type": "group", "id"} | {"type": "business"} | null (= all products).
-- ---------------------------------------------------------------------
drop function if exists post.design_context(uuid);
create or replace function post.design_context(p_business uuid, p_focus jsonb default null) returns jsonb
language plpgsql stable security definer set search_path = post, public as $$
declare
  v_type text := coalesce(p_focus ->> 'type', 'all');
  v_id uuid := case when p_focus ->> 'id' ~ '^[0-9a-f-]{36}$' then (p_focus ->> 'id')::uuid end;
  v_ids uuid[];
  v_name text;
  b post.businesses%rowtype;
begin
  select * into b from post.businesses where id = p_business;
  if not found then return null; end if;
  if v_type = 'product' then
    select array[id], name into v_ids, v_name from post.products where id = v_id and business_id = p_business;
  elsif v_type = 'group' then
    select product_ids, name into v_ids, v_name from post.product_groups where id = v_id and business_id = p_business;
  end if;
  -- An unknown or deleted product/group: the post is about the whole business.
  if v_type in ('product', 'group') and v_ids is null then
    v_type := 'business';
  end if;
  return jsonb_build_object(
    'business', jsonb_build_object('id', b.id, 'name', b.name, 'category', b.category, 'country', b.country,
                                   'languages', b.languages, 'brand', b.brand, 'brand_brief', b.brand_brief,
                                   'caption_language', coalesce(b.settings ->> 'caption_language', 'en'),
                                   'design_language', coalesce(b.settings ->> 'design_language', 'en')),
    'focus', jsonb_strip_nulls(jsonb_build_object('type', v_type, 'id', v_id, 'name', v_name)),
    'products', coalesce((select jsonb_agg(x) from (
        select name, price, currency, left(description, 200) as description
          from post.products
         where business_id = b.id
           and (case when v_type in ('product', 'group') then id = any(v_ids) else active end)
         order by created_at desc limit 20) x), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(left(r.caption, 140)) from (
        select caption from post.posts
         where business_id = b.id and caption is not null
         order by created_at desc limit 5) r), '[]'::jsonb));
end $$;

revoke execute on function post.design_context(uuid, jsonb) from public, anon, authenticated;
grant execute on function post.design_context(uuid, jsonb) to service_role, post_n8n;

-- Playlist items keep their focus in brief.focus.
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
grant execute on function post.add_planned_items(uuid, date, jsonb) to service_role, post_n8n;
