-- =====================================================================
-- 0008: Launch Retexia Post and finish Lingo/Post automation.
--
-- Website (retexia.com/post): Post is live with the plans from the product
-- spec (Starter, Growth, Pro), its features, FAQs, a short order form and a
-- new page. Panel addresses are fixed (https://lingo.retexia.com, no /account).
--
-- Post automation:
--   * orders → Post business: plan and subscription follow the customer's
--     Retexia order (active, paused, cancelled), so posting stops when they stop paying;
--   * Facebook/Instagram tokens live in Supabase Vault (save/read helpers for the
--     server only) and a short-lived table for the "Connect with Facebook" step;
--   * slot helpers (post.slot_time, post.next_free_slot) used by the panel and n8n;
--   * the scheduler calls post.retexia.com (publisher and nightly batch).
-- Lingo: a cancelled or paused order switches the bot off.
--
-- Safe to run again. Run after 0001–0007.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Products: panel addresses, Post goes live
-- ---------------------------------------------------------------------
update public.products set panel_url = 'https://lingo.retexia.com', panel_live = true where slug = 'lingo';
update public.products
   set panel_url = 'https://post.retexia.com',
       panel_live = true,
       status = 'live',
       tagline = 'Your social media runs itself',
       description = 'Every day Post prepares posts in your brand for Facebook and Instagram. Edit or skip anything you like; the rest is published on time.',
       icon = 'calendar-clock'
 where slug = 'post';

-- Features (retexia.com/post "What you get")
delete from public.product_features
 where product_id = (select id from public.products where slug = 'post')
   and id not in (select md5('retexia:feature:post:' || n)::uuid from generate_series(1, 6) n);
insert into public.product_features (id, product_id, icon, title, description, sort_order)
select md5('retexia:feature:post:' || f.n)::uuid, p.id, f.icon, f.title, f.description, f.n
from public.products p
join (values
  (1, 'sparkles', 'Posts made for you, every day', 'Post writes the caption and hashtags and designs the image in your colours, with your logo and your real prices.'),
  (2, 'shield-check', 'You stay in control', 'See each post before it goes out. Approve, edit or deny it; deny and Post makes a new one, up to 10 times.'),
  (3, 'calendar-days', 'Week plan and offers', 'Tell Post about new stock, a weekend sale or a holiday, and it plans your posts around it.'),
  (4, 'share-2', 'Facebook and Instagram', 'Connect your Page and Instagram Business account once. Post publishes to both at the times you choose.'),
  (5, 'languages', 'In your language and tone', 'Captions in English, Sinhala or Tamil, in your brand''s tone, with the words you like and none you don''t.'),
  (6, 'badge-check', 'Checked before it posts', 'Prices, offers and phone numbers come from your own details, so Post never invents a discount.')
) as f (n, icon, title, description) on true
where p.slug = 'post'
on conflict (id) do update set
  icon = excluded.icon,
  title = excluded.title,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- 2. Post plans (from the product spec; LKR at about Rs. 300 = US$1)
-- ---------------------------------------------------------------------
insert into public.packages (
  product_id, slug, name, tagline, price_monthly, price_yearly, setup_fee, badge, is_featured,
  cta_label, fine_print, is_active, sort_order
)
select p.id, v.slug, v.name, v.tagline, v.monthly, v.yearly, 0, v.badge, v.featured, v.cta,
       'Prices in LKR. Yearly plans include 2 months free. AI allowances reset every month; when one runs out, Post keeps posting with your own photos.',
       true, v.sort_order
from public.products p
join (values
  ('starter', 'Post Starter', 'Your page, posting every day', 5900.00, 59000.00, null, false, 'Choose Starter', 1),
  ('growth', 'Post Growth', 'More posts, more control', 14900.00, 149000.00, 'Most popular', true, 'Choose Growth', 2),
  ('pro', 'Post Pro', 'For several brands or branches', 29900.00, 299000.00, null, false, 'Choose Pro', 3)
) as v (slug, name, tagline, monthly, yearly, badge, featured, cta, sort_order) on true
where p.slug = 'post'
on conflict (product_id, slug) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  price_monthly = excluded.price_monthly,
  price_yearly = excluded.price_yearly,
  setup_fee = excluded.setup_fee,
  badge = excluded.badge,
  is_featured = excluded.is_featured,
  cta_label = excluded.cta_label,
  fine_print = excluded.fine_print,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;

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
  ('starter', 3, 'Up to 3 posts a day, prepared for you', true),
  ('starter', 4, '40 AI-designed images a month', true),
  ('starter', 5, '60 redos a month (up to 10 per post)', true),
  ('starter', 6, 'Unlimited caption edits', true),
  ('starter', 7, 'Offers and special days', true),
  ('starter', 8, '1 GB photo library', true),
  ('starter', 9, 'Week plan', false),
  ('growth', 1, 'Everything in Starter', true),
  ('growth', 2, '4 connected accounts', true),
  ('growth', 3, '150 AI-designed images a month', true),
  ('growth', 4, '200 redos a month', true),
  ('growth', 5, 'Week plan: choose what goes out each day', true),
  ('growth', 6, '5 GB photo library', true),
  ('growth', 7, 'Priority WhatsApp support', true),
  ('pro', 1, 'Everything in Growth', true),
  ('pro', 2, 'Up to 3 businesses or branches', true),
  ('pro', 3, '10 connected accounts', true),
  ('pro', 4, '400 AI-designed images a month', true),
  ('pro', 5, '500 redos a month', true),
  ('pro', 6, '20 GB photo library', true),
  ('pro', 7, 'Same-day support', true)
) as f (pkg, n, label, included) on f.pkg = pk.slug
on conflict (id) do update set
  label = excluded.label,
  included = excluded.included,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- 3. Post order form (short: the brand profile is filled in the panel)
-- ---------------------------------------------------------------------
insert into public.forms (slug, product_id, title, description, submit_label, success_title, success_message, version)
select 'post-onboarding', p.id,
  'Start Retexia Post',
  'A few questions about your business. After payment you set up your brand and connect Facebook and Instagram in your Post panel.',
  'Submit request',
  'Request received',
  'Thank you. We will send the payment details within one working day. Then your Post panel opens at post.retexia.com.',
  1
from public.products p where p.slug = 'post'
on conflict (slug) do update set
  product_id = excluded.product_id,
  title = excluded.title,
  description = excluded.description,
  submit_label = excluded.submit_label,
  success_title = excluded.success_title,
  success_message = excluded.success_message;

update public.products set onboarding_form_id = (select id from public.forms where slug = 'post-onboarding') where slug = 'post';

insert into public.form_steps (id, form_id, step_number, title, description, sort_order)
select md5('retexia:form:post-onboarding:step:' || s.n)::uuid, f.id, s.n, s.title, s.description, s.n
from public.forms f
join (values
  (1, 'Your business', 'So Post knows who it is posting for.'),
  (2, 'Your pages and contact', 'Where Post will publish, and how we reach you.')
) as s (n, title, description) on true
where f.slug = 'post-onboarding'
on conflict (id) do update set
  form_id = excluded.form_id,
  step_number = excluded.step_number,
  title = excluded.title,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.form_fields (
  id, step_id, form_id, key, label, type, placeholder, help_text, options, required, min, max,
  default_value, show_if, width, prefill_from, sort_order
)
select
  md5('retexia:form:post-onboarding:field:' || v.key)::uuid,
  md5('retexia:form:post-onboarding:step:' || v.step)::uuid,
  f.id, v.key, v.label, v.type, v.placeholder, v.help_text, v.options::jsonb, v.required,
  v.min, v.max, v.default_value, v.show_if::jsonb, v.width, v.prefill_from, v.sort_order
from public.forms f
join (values
  (1, 'business_name', 'Business name', 'text', 'Kandy Cakes', null, '[]', true, 2, 120, null, null, 'full', 'profile.business_name', 1),
  (1, 'industry', 'Industry', 'select', 'Choose one', null,
    '[{"value":"clothing","label":"Clothing and fashion"},{"value":"food","label":"Food and restaurants"},{"value":"electronics","label":"Electronics and mobile"},{"value":"beauty","label":"Beauty and salon"},{"value":"health","label":"Health and clinics"},{"value":"education","label":"Education and tuition"},{"value":"travel","label":"Travel and tourism"},{"value":"real_estate","label":"Real estate"},{"value":"hardware","label":"Hardware and building"},{"value":"other","label":"Other"}]',
    true, null, null, null, null, 'half', null, 2),
  (1, 'city', 'City', 'text', 'Kandy', null, '[]', true, 2, 80, null, null, 'half', null, 3),
  (1, 'languages', 'Caption languages', 'checkbox_group', null, 'Pick all that apply.',
    '[{"value":"en","label":"English"},{"value":"si","label":"Sinhala"},{"value":"ta","label":"Tamil"}]',
    true, 1, null, null, null, 'full', null, 4),
  (1, 'goal', 'What should your posts do most?', 'radio_cards', null, null,
    '[{"value":"sales","label":"Bring messages and sales","description":"Offers, prices and new stock."},{"value":"awareness","label":"Keep my page active","description":"Regular, good-looking posts so people remember you."},{"value":"both","label":"Both","description":"A mix of selling and staying visible."}]',
    true, null, null, null, null, 'full', null, 5),
  (2, 'facebook_page', 'Facebook Page link', 'url', 'https://facebook.com/kandycakes', 'Leave empty if you don''t have one yet; we help you create it.', '[]', false, null, 300, null, null, 'half', null, 1),
  (2, 'instagram_handle', 'Instagram username', 'text', '@kandycakes', 'Must be a Business or Creator account. We help you switch, free.', '[]', false, null, 60, null, null, 'half', null, 2),
  (2, 'contact_name', 'Your name', 'text', 'Amaya Perera', null, '[]', true, 2, 120, null, null, 'half', 'profile.full_name', 3),
  (2, 'contact_phone', 'Your WhatsApp number', 'phone', '+94 77 123 4567', 'We message you here about payment and setup.', '[]', true, null, null, null, null, 'half', 'profile.whatsapp', 4),
  (2, 'notes', 'Anything else we should know?', 'textarea', 'Busy seasons, offers you run often, things you never want posted.', null, '[]', false, null, 2000, null, null, 'full', null, 5),
  (2, 'agree', 'I agree to the [Terms](/terms) and [Privacy policy](/privacy), and understand that posts I don''t deny are published automatically', 'checkbox', null, null, '[]', true, null, null, null, null, 'full', null, 6)
) as v (step, key, label, type, placeholder, help_text, options, required, min, max, default_value, show_if, width, prefill_from, sort_order) on true
where f.slug = 'post-onboarding'
on conflict (id) do update set
  step_id = excluded.step_id,
  key = excluded.key,
  label = excluded.label,
  type = excluded.type,
  placeholder = excluded.placeholder,
  help_text = excluded.help_text,
  options = excluded.options,
  required = excluded.required,
  min = excluded.min,
  max = excluded.max,
  default_value = excluded.default_value,
  show_if = excluded.show_if,
  width = excluded.width,
  prefill_from = excluded.prefill_from,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- 4. Post FAQs and page
-- ---------------------------------------------------------------------
insert into public.faqs (id, product_id, question, answer, sort_order)
select md5('retexia:faq:post:' || v.n)::uuid, (select id from public.products where slug = 'post'), v.question, v.answer, v.n
from (values
  (1, 'Will Post publish something I didn''t approve?', 'Only if you leave **auto-publish** on (the default): posts you don''t edit or deny go out at their time. Turn auto-publish off in your Post settings and nothing goes out until you tap Approve.'),
  (2, 'What do I need to start?', 'A Facebook Page, and if you want Instagram too, an Instagram **Business** or **Creator** account linked to that Page. You connect them yourself with "Continue with Facebook" in your panel. We help you switch accounts for free.'),
  (3, 'Where do the pictures come from?', 'Post designs an image for each post with AI, in your colours and with your logo. You can also upload your own product photos to your library and use them instead.'),
  (4, 'Can Post get prices or offers wrong?', 'Post only uses prices, offers and contact details from your own product list and settings. If a number on a design can''t be found there, Post leaves it out.'),
  (5, 'What happens when my AI images run out?', 'Your page keeps posting. Post uses photos from your library until the allowance resets next month, or you can move to a bigger plan any time.'),
  (6, 'Can I cancel?', 'Yes. Message us and we stop your plan before the next billing date. Your posts stay on Facebook and Instagram.')
) as v (n, question, answer)
where exists (select 1 from public.products where slug = 'post')
on conflict (id) do update set
  product_id = excluded.product_id,
  question = excluded.question,
  answer = excluded.answer,
  sort_order = excluded.sort_order;

update public.pages
   set seo_title = 'Retexia Post · Your social media runs itself',
       seo_description = 'Post prepares posts in your brand for Facebook and Instagram every day and publishes them on time. Plans from LKR 5,900 a month.',
       is_published = true,
       show_in_sitemap = true
 where slug = 'post';

-- Replace the "coming soon" sections with the launch page.
delete from public.page_sections
 where page_id = (select id from public.pages where slug = 'post')
   and id not in (select md5('retexia:section:post:' || n)::uuid from generate_series(1, 6) n);
insert into public.page_sections (id, page_id, type, anchor, background, eyebrow, title, highlight, subtitle, content, sort_order, is_visible)
select md5('retexia:section:post:' || v.n)::uuid, (select id from public.pages where slug = 'post'),
       v.type, v.anchor, v.background, v.eyebrow, v.title, v.highlight, v.subtitle, v.content::jsonb, v.n, true
from (values
  (1, 'hero', null, 'surface', 'Retexia Post',
    'Your social media runs itself', 'runs itself',
    'Every day Post prepares posts in your brand for Facebook and Instagram. Edit or skip anything you like; the rest goes out on time.',
    '{"visual": "none", "show_halo": true, "primary_cta": {"label": "See plans", "href": "#pricing"}, "secondary_cta": {"label": "How it works", "href": "#how"}}'),
  (2, 'features', 'features', 'surface', 'What you get',
    'Posts every day, in your brand', 'in your brand', null,
    '{"source": "product", "columns": 3}'),
  (3, 'steps', 'how', 'sunk', 'How it works',
    'Set it up once, then relax', 'then relax', null,
    $json${"items": [
      {"icon": "clipboard-list", "title": "Choose a plan", "text": "Pick a plan and answer a few questions about your business."},
      {"icon": "palette", "title": "Set up your brand", "text": "Add your logo, colours, products and the tone you like. About ten minutes."},
      {"icon": "share-2", "title": "Connect Facebook and Instagram", "text": "Continue with Facebook and choose your Page and Instagram account."},
      {"icon": "circle-check", "title": "Approve, or just relax", "text": "Each day's posts are ready in your panel. Edit, deny or let them go out on time."}
    ]}$json$),
  (4, 'pricing', 'pricing', 'surface', 'Pricing',
    'Plans that grow with you', 'grow with you',
    'Pay monthly, or pay yearly and get two months free. No setup fee.',
    '{"product_slug": "post", "show_yearly_toggle": true}'),
  (5, 'faq', 'faq', 'sunk', 'Questions',
    'Questions about Post', 'Post', null,
    '{"product_slug": "post"}'),
  (6, 'cta', null, 'surface', null,
    'Let your page post itself', 'post itself',
    'Choose a plan today. Once your brand is set up, Post starts preparing your posts.',
    '{"primary_cta": {"label": "Choose a plan", "href": "#pricing"}, "secondary_cta": {"label": "Talk to us", "href": "/contact"}}')
) as v (n, type, anchor, background, eyebrow, title, highlight, subtitle, content)
where exists (select 1 from public.pages where slug = 'post')
on conflict (id) do update set
  page_id = excluded.page_id,
  type = excluded.type,
  anchor = excluded.anchor,
  background = excluded.background,
  eyebrow = excluded.eyebrow,
  title = excluded.title,
  highlight = excluded.highlight,
  subtitle = excluded.subtitle,
  content = excluded.content,
  sort_order = excluded.sort_order,
  is_visible = excluded.is_visible;

-- ---------------------------------------------------------------------
-- 5. Orders drive Post plans and the Lingo bot
-- ---------------------------------------------------------------------
create or replace function public.sync_product_from_order() returns trigger
language plpgsql security definer set search_path = public, post, lingo as $$
declare
  v_slug text;
  v_plan text;
  v_sub text;
begin
  select p.slug into v_slug from public.products p where p.id = new.product_id;
  if v_slug = 'post' then
    select pk.slug into v_plan from public.packages pk where pk.id = new.package_id;
    v_sub := case new.status
               when 'active' then 'active'
               when 'setting_up' then 'trialing'
               when 'paused' then 'past_due'
               when 'cancelled' then 'canceled'
               when 'rejected' then 'canceled'
               else null end;
    update post.businesses b
       set plan = case when v_plan in ('starter', 'growth', 'pro') then v_plan::post.plan_tier else b.plan end,
           subscription_status = coalesce(v_sub, b.subscription_status)
     where b.owner_id = new.user_id;
  elsif v_slug = 'lingo' then
    if new.status in ('paused', 'cancelled', 'rejected') then
      update lingo.lingo_users set active = false, updated_at = now() where owner_id = new.user_id and active;
    elsif new.status = 'active' and tg_op = 'UPDATE' and old.status = 'paused' then
      update lingo.lingo_users set active = true, updated_at = now() where owner_id = new.user_id;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.sync_product_from_order() from public, anon, authenticated;

drop trigger if exists orders_sync_products on public.orders;
create trigger orders_sync_products after insert or update of status, package_id on public.orders
  for each row execute function public.sync_product_from_order();

-- Plan for a business created in the panel: the owner's latest Post order.
create or replace function post.plan_for_owner(p_owner uuid)
returns table (plan post.plan_tier, subscription_status text)
language sql stable security definer set search_path = public, post as $$
  select case when pk.slug in ('starter', 'growth', 'pro') then pk.slug::post.plan_tier else 'trial'::post.plan_tier end,
         case o.status when 'active' then 'active' when 'paused' then 'past_due' when 'cancelled' then 'canceled' else 'trialing' end
    from public.orders o
    join public.products p on p.id = o.product_id and p.slug = 'post'
    join public.packages pk on pk.id = o.package_id
   where o.user_id = p_owner and o.status in ('setting_up', 'active', 'paused')
   order by o.created_at desc
   limit 1;
$$;
revoke execute on function post.plan_for_owner(uuid) from public, anon, authenticated;
grant execute on function post.plan_for_owner(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 6. Post: Facebook/Instagram tokens in Vault (server only)
-- ---------------------------------------------------------------------
create or replace function post.save_secret(p_secret uuid, p_value text) returns uuid
language plpgsql security definer set search_path = post, public as $$
begin
  if p_secret is not null and exists (select 1 from vault.secrets where id = p_secret) then
    perform vault.update_secret(p_secret, p_value);
    return p_secret;
  end if;
  return vault.create_secret(p_value);
end $$;

create or replace function post.read_secret(p_secret uuid) returns text
language plpgsql stable security definer set search_path = post, public as $$
begin
  return (select decrypted_secret from vault.decrypted_secrets where id = p_secret);
end $$;

create or replace function post.delete_secret(p_secret uuid) returns void
language plpgsql security definer set search_path = post, public as $$
begin
  delete from vault.secrets where id = p_secret;
end $$;

revoke execute on function post.save_secret(uuid, text), post.read_secret(uuid), post.delete_secret(uuid) from public, anon, authenticated, post_n8n;
grant execute on function post.save_secret(uuid, text), post.read_secret(uuid), post.delete_secret(uuid) to service_role;

-- A "Continue with Facebook" in progress: the owner picks Pages next (rows expire after an hour).
create table if not exists post.meta_connections (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references post.businesses (id) on delete cascade,
  meta_user_id    text not null,
  token_secret_id uuid,
  created_at      timestamptz not null default now()
);
alter table post.meta_connections enable row level security;
revoke all on post.meta_connections from anon, authenticated;
grant all on post.meta_connections to service_role;

-- ---------------------------------------------------------------------
-- 7. Post: slots
-- ---------------------------------------------------------------------
-- When slot 1–3 of a day starts, in the business's time zone.
create or replace function post.slot_time(p_business uuid, p_date date, p_slot int) returns timestamptz
language sql stable set search_path = post, public as $$
  select (p_date + coalesce(nullif(b.settings -> 'slots' ->> (p_slot - 1), ''), (array['09:00', '13:00', '19:00'])[p_slot])::time)
         at time zone b.timezone
    from post.businesses b where b.id = p_business;
$$;

-- The next feed slot with no post yet that is still at least 20 minutes away.
create or replace function post.next_free_slot(p_business uuid)
returns table (local_date date, slot smallint, scheduled_at timestamptz)
language sql stable set search_path = post, public as $$
  select x.day, x.sl::smallint, post.slot_time(p_business, x.day, x.sl)
    from (select (now() at time zone b.timezone)::date + g as day, s as sl
            from post.businesses b, generate_series(0, 60) g, generate_series(1, 3) s
           where b.id = p_business) x
   where post.slot_time(p_business, x.day, x.sl) > now() + interval '20 minutes'
     and not exists (select 1 from post.posts p
                      where p.business_id = p_business and not p.is_story and p.local_date = x.day and p.slot = x.sl)
   order by x.day, x.sl
   limit 1;
$$;
revoke execute on function post.slot_time(uuid, date, int), post.next_free_slot(uuid) from public, anon;
grant execute on function post.slot_time(uuid, date, int), post.next_free_slot(uuid) to service_role, post_n8n, authenticated;

-- The n8n photo workflow saves a draft ("ready") in the first free (date, slot) with
-- scheduled_at = now() + 1 day. Publish it at that slot's own time instead, when that is
-- still ahead (posts saved as "publishing" are published by the workflow itself).
create or replace function post.align_draft_time() returns trigger
language plpgsql set search_path = post, public as $$
declare v_at timestamptz;
begin
  if new.status = 'ready' and new.format not in ('story_photo', 'story_video') then
    v_at := post.slot_time(new.business_id, new.local_date, new.slot);
    if v_at is not null and v_at > now() + interval '20 minutes' then
      new.scheduled_at := v_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists posts_align_draft_time on post.posts;
create trigger posts_align_draft_time before insert on post.posts for each row execute function post.align_draft_time();

-- ---------------------------------------------------------------------
-- 8. Scheduler: post.retexia.com publishes due posts (every minute) and
--    starts the nightly batch (every 5 minutes). Vault secrets:
--      post_publish_url = https://post.retexia.com/api/post/publish
--      post_batch_url   = https://post.retexia.com/api/post/batch
--      post_cron_key    = the panel's POST_CRON_KEY
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('retexia-post-publish-tick', '* * * * *', $c$
      select net.http_post(
        url := s.url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Retexia-Key', k.key),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000)
      from (select decrypted_secret as url from vault.decrypted_secrets where name = 'post_publish_url') s,
           (select decrypted_secret as key from vault.decrypted_secrets where name = 'post_cron_key') k
      where exists (select 1 from post.posts p where p.scheduled_at <= now() and p.status in ('approved', 'ready'));
    $c$);
    perform cron.schedule('retexia-post-batch-tick', '*/5 * * * *', $c$
      select net.http_post(
        url := s.url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Retexia-Key', k.key),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000)
      from (select decrypted_secret as url from vault.decrypted_secrets where name = 'post_batch_url') s,
           (select decrypted_secret as key from vault.decrypted_secrets where name = 'post_cron_key') k;
    $c$);
    perform cron.schedule('retexia-post-expire', '* * * * *', 'select post.expire_stale_posts();');
    perform cron.schedule('retexia-post-meta-cleanup', '17 * * * *', $c$
      select post.delete_secret(token_secret_id) from post.meta_connections where created_at < now() - interval '1 hour' and token_secret_id is not null;
      delete from post.meta_connections where created_at < now() - interval '1 hour';
    $c$);
  else
    raise notice 'pg_cron / pg_net not enabled: enable them (Database → Extensions) and run this file again to schedule publishing.';
  end if;
end $$;
