-- =====================================================================
-- 0024: Product posts are designed with the real product photo.
--
-- post.design_context() also returns "photos": the storage paths (media
-- bucket) of the owner's own photos of the product(s) the post is about:
--   * one product: its photos (up to 3, the product dialog's limit);
--   * a group: the first photo of each product (up to 4);
--   * the whole business: none.
-- The n8n worker signs them and gives them to the image model as the exact
-- product to show (label, shape, colours unchanged). AI designs are never
-- used as a reference, only photos the owner uploaded.
-- Safe to run again. Run after 0023.
-- =====================================================================

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
    'photos', case
      when v_type = 'product' then coalesce((select jsonb_agg(m.storage_path order by m.created_at) from (
          select storage_path, created_at from post.media
           where business_id = b.id and product_id = v_ids[1] and kind = 'photo' and source = 'upload'
           order by created_at limit 3) m), '[]'::jsonb)
      when v_type = 'group' then coalesce((select jsonb_agg(m.storage_path) from (
          select distinct on (product_id) product_id, storage_path, created_at from post.media
           where business_id = b.id and product_id = any(v_ids) and kind = 'photo' and source = 'upload'
           order by product_id, created_at limit 4) m), '[]'::jsonb)
      else '[]'::jsonb end,
    'recent', coalesce((select jsonb_agg(left(r.caption, 140)) from (
        select caption from post.posts
         where business_id = b.id and caption is not null
         order by created_at desc limit 5) r), '[]'::jsonb));
end $$;

revoke execute on function post.design_context(uuid, jsonb) from public, anon, authenticated;
grant execute on function post.design_context(uuid, jsonb) to service_role, post_n8n;
