-- =============================================================================
-- Template: add a new product (product #3, #4, ...)
-- -----------------------------------------------------------------------------
-- 1. Copy this file. Search and replace:
--      example            → your product slug (lowercase, e.g. books)
--      EXP                → a 3-letter order code (e.g. BKS)
--      Retexia Example    → full name (e.g. Retexia Books)
--      Example            → short name (e.g. Books)
-- 2. Change the colours, texts, packages, prices and form questions below.
-- 3. Run it in the Supabase SQL editor. It is safe to run again after edits.
-- 4. The product starts hidden. When everything looks right:
--      update products set status = 'live' where slug = 'example';
--    (or 'coming_soon' to show it with a waitlist instead of pricing).
--
-- The navigation dropdown, the home page product cards, /example and
-- /example/get-started all appear automatically. No code change is needed.
-- See docs/ADDING_A_PRODUCT.md for the full guide.
-- =============================================================================

-- 1. Product ------------------------------------------------------------------
insert into public.products (
  slug, code, name, short_name, tagline, description, icon,
  color_light, color_dark, color_soft_light, color_soft_dark,
  status, page_slug, panel_url, panel_live, sort_order
) values (
  'example', 'EXP', 'Retexia Example', 'Example',
  'One line about what the customer gets',
  'Two or three plain sentences about what this product does for a business.',
  'sparkle',            -- Lucide icon name (lucide.dev/icons)
  '#6d3fc0',            -- colour on white: needs 4.5:1 contrast on white and on the soft colour
  '#c4a8ff',            -- colour on the dark background
  '#ece4fa',            -- soft tint behind product text (light)
  '#2a1a4a',            -- soft tint behind product text (dark)
  'hidden',             -- hidden → coming_soon → live
  'example',
  'https://example.retexia.com/account',
  false,                -- turn on when the product panel app is deployed
  10
)
on conflict (slug) do update set
  code = excluded.code, name = excluded.name, short_name = excluded.short_name,
  tagline = excluded.tagline, description = excluded.description, icon = excluded.icon,
  color_light = excluded.color_light, color_dark = excluded.color_dark,
  color_soft_light = excluded.color_soft_light, color_soft_dark = excluded.color_soft_dark,
  page_slug = excluded.page_slug, panel_url = excluded.panel_url, sort_order = excluded.sort_order;

-- 2. Features (shown by the "features" section) --------------------------------
insert into public.product_features (id, product_id, icon, title, description, sort_order)
select md5('retexia:feature:example:' || f.n)::uuid, p.id, f.icon, f.title, f.description, f.n
from public.products p
join (values
  (1, 'clock', 'First benefit', 'One plain sentence about what the customer gets.'),
  (2, 'shield-check', 'Second benefit', 'One plain sentence about what the customer gets.'),
  (3, 'wrench', 'Set up by us', 'Tell us about your business. We build it, test it and switch it on.')
) as f (n, icon, title, description) on true
where p.slug = 'example'
on conflict (id) do update set icon = excluded.icon, title = excluded.title, description = excluded.description, sort_order = excluded.sort_order;

-- 3. Packages and what each includes -------------------------------------------
insert into public.packages (product_id, slug, name, tagline, price_monthly, price_yearly, setup_fee, badge, is_featured, cta_label, fine_print, sort_order)
select p.id, v.slug, v.name, v.tagline, v.monthly, v.yearly, v.setup, v.badge, v.featured, v.cta, v.fine_print, v.sort_order
from public.products p
join (values
  ('starter', 'Example Starter', 'For small shops getting started', 4900.00, 49000.00, 4900.00, null, false, 'Choose Starter', 'Yearly plans include 2 months free.', 1),
  ('growth', 'Example Growth', 'For busy, growing businesses', 9900.00, 99000.00, 9900.00, 'Most popular', true, 'Choose Growth', 'Yearly plans include 2 months free.', 2)
) as v (slug, name, tagline, monthly, yearly, setup, badge, featured, cta, fine_print, sort_order) on true
where p.slug = 'example'
on conflict (product_id, slug) do update set
  name = excluded.name, tagline = excluded.tagline, price_monthly = excluded.price_monthly,
  price_yearly = excluded.price_yearly, setup_fee = excluded.setup_fee, badge = excluded.badge,
  is_featured = excluded.is_featured, cta_label = excluded.cta_label, fine_print = excluded.fine_print,
  sort_order = excluded.sort_order;

insert into public.package_features (id, package_id, label, included, sort_order)
select md5('retexia:package-feature:example:' || f.pkg || ':' || f.n)::uuid, k.id, f.label, f.included, f.n
from public.packages k
join public.products p on p.id = k.product_id and p.slug = 'example'
join (values
  ('starter', 1, 'First thing included', true),
  ('starter', 2, 'Second thing included', true),
  ('starter', 3, 'Something only in Growth', false),
  ('growth', 1, 'Everything in Starter', true),
  ('growth', 2, 'Something only in Growth', true),
  ('growth', 3, 'Priority WhatsApp support', true)
) as f (pkg, n, label, included) on f.pkg = k.slug
on conflict (id) do update set label = excluded.label, included = excluded.included, sort_order = excluded.sort_order;

-- 4. Onboarding form (copy more fields from the Lingo form in seed.sql) --------
insert into public.forms (slug, product_id, title, description, submit_label, success_title, success_message)
select 'example-onboarding', p.id, 'Set up your Example',
  'A few questions so we can set things up for you.',
  'Submit request', 'Request received',
  'Thank you. We will review your details and message you within one working day.'
from public.products p where p.slug = 'example'
on conflict (slug) do update set
  product_id = excluded.product_id, title = excluded.title, description = excluded.description,
  submit_label = excluded.submit_label, success_title = excluded.success_title, success_message = excluded.success_message;

update public.products
   set onboarding_form_id = (select id from public.forms where slug = 'example-onboarding')
 where slug = 'example';

insert into public.form_steps (id, form_id, step_number, title, description, sort_order)
select md5('retexia:form:example-onboarding:step:' || s.n)::uuid, f.id, s.n, s.title, s.description, s.n
from public.forms f
join (values
  (1, 'About your business', 'The basics.'),
  (2, 'Contact', 'How we reach you during setup.')
) as s (n, title, description) on true
where f.slug = 'example-onboarding'
on conflict (id) do update set title = excluded.title, description = excluded.description, step_number = excluded.step_number, sort_order = excluded.sort_order;

insert into public.form_fields (id, step_id, form_id, key, label, type, placeholder, help_text, options, required, min, max, show_if, width, prefill_from, sort_order)
select md5('retexia:form:example-onboarding:field:' || v.key)::uuid,
       md5('retexia:form:example-onboarding:step:' || v.step)::uuid,
       f.id, v.key, v.label, v.type, v.placeholder, v.help_text, v.options::jsonb, v.required, v.min, v.max, v.show_if::jsonb, v.width, v.prefill_from, v.sort_order
from public.forms f
join (values
  (1, 'business_name', 'Business name', 'text', 'Your business', null, '[]', true, 2, 120, null, 'full', 'profile.business_name', 1),
  (1, 'what_you_do', 'What does your business do?', 'textarea', 'We sell ...', null, '[]', true, 5, 1000, null, 'full', null, 2),
  (2, 'contact_name', 'Your name', 'text', null, null, '[]', true, 2, 120, null, 'half', 'profile.full_name', 1),
  (2, 'contact_phone', 'Your phone number', 'phone', '+94 77 123 4567', null, '[]', true, null, null, null, 'half', 'profile.phone', 2),
  (2, 'agree', 'I agree to the [Terms](/terms) and [Privacy policy](/privacy)', 'checkbox', null, null, '[]', true, null, null, null, 'full', null, 3)
) as v (step, key, label, type, placeholder, help_text, options, required, min, max, show_if, width, prefill_from, sort_order) on true
where f.slug = 'example-onboarding'
on conflict (id) do update set
  step_id = excluded.step_id, key = excluded.key, label = excluded.label, type = excluded.type,
  placeholder = excluded.placeholder, help_text = excluded.help_text, options = excluded.options,
  required = excluded.required, min = excluded.min, max = excluded.max, show_if = excluded.show_if,
  width = excluded.width, prefill_from = excluded.prefill_from, sort_order = excluded.sort_order;

-- 5. FAQs ------------------------------------------------------------------------
insert into public.faqs (id, product_id, question, answer, sort_order)
select md5('retexia:faq:example:' || v.n)::uuid, p.id, v.question, v.answer, v.n
from public.products p
join (values
  (1, 'How long does setup take?', 'Most businesses are live within a few working days after payment.'),
  (2, 'Can I cancel?', 'Yes. You can cancel a request from your account before setup starts.')
) as v (n, question, answer) on true
where p.slug = 'example'
on conflict (id) do update set question = excluded.question, answer = excluded.answer, sort_order = excluded.sort_order;

-- 6. Marketing page and its sections --------------------------------------------
insert into public.pages (slug, title, seo_title, seo_description, product_id, is_published)
select 'example', 'Retexia Example', 'Retexia Example · One line about what the customer gets',
       'One or two sentences for Google and link previews.', p.id, true
from public.products p where p.slug = 'example'
on conflict (slug) do update set
  title = excluded.title, seo_title = excluded.seo_title, seo_description = excluded.seo_description,
  product_id = excluded.product_id;

insert into public.page_sections (id, page_id, type, anchor, background, eyebrow, title, highlight, subtitle, content, sort_order)
select md5('retexia:section:example:' || v.n)::uuid,
       (select id from public.pages where slug = 'example'),
       v.type, v.anchor, v.background, v.eyebrow, v.title, v.highlight, v.subtitle, v.content::jsonb, v.n
from (values
  (1, 'hero', null, 'surface', 'Retexia Example', 'A headline about what they get', 'what they get',
      'One or two sentences that explain the benefit in plain words.',
      '{"primary_cta": {"label": "See plans", "href": "#pricing"}, "secondary_cta": {"label": "Talk to us", "href": "/contact"}, "visual": "none", "show_halo": true}'),
  (2, 'features', 'features', 'surface', 'What you get', 'Everything you need, nothing you do not', 'nothing you do not', null,
      '{"source": "product", "columns": 3}'),
  (3, 'steps', 'setup', 'sunk', 'Setup', 'Live in three simple steps', 'three simple steps', null,
      '{"items": [{"icon": "clipboard-list", "title": "Tell us about you", "text": "A short form, about ten minutes."}, {"icon": "wrench", "title": "We set it up", "text": "We build and test it for you."}, {"icon": "circle-check", "title": "Switch on", "text": "It runs. You relax."}]}'),
  (4, 'pricing', 'pricing', 'surface', 'Pricing', 'Simple plans, no surprises', 'no surprises', 'Every plan includes setup by our team.',
      '{"product_slug": "example", "show_yearly_toggle": true}'),
  (5, 'faq', 'faq', 'sunk', 'Questions', 'Good to know', 'know', null,
      '{"product_slug": "example"}'),
  (6, 'cta', null, 'surface', null, 'Ready when you are', 'you are', 'Pick a plan and we will be in touch within one working day.',
      '{"primary_cta": {"label": "Choose a plan", "href": "#pricing"}, "secondary_cta": {"label": "Talk to us", "href": "/contact"}}')
) as v (n, type, anchor, background, eyebrow, title, highlight, subtitle, content)
on conflict (id) do update set
  type = excluded.type, anchor = excluded.anchor, background = excluded.background, eyebrow = excluded.eyebrow,
  title = excluded.title, highlight = excluded.highlight, subtitle = excluded.subtitle,
  content = excluded.content, sort_order = excluded.sort_order;

-- For a coming-soon product, swap the pricing section for a waitlist section:
--   type 'waitlist', anchor 'waitlist', content '{"product_slug": "example"}'
