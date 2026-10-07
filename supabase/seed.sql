-- =============================================================================
-- Retexia seed content
-- -----------------------------------------------------------------------------
-- Real, finished content for the site. Safe to run again: every insert uses
-- "on conflict do update". Rows without a natural key use stable ids made with
-- md5('retexia:<name>')::uuid so re-running updates the same rows.
--
-- REPLACE ME before launch: contact_email, contact_phone, whatsapp_number and
-- address in site_settings (see docs/DEPLOY.md).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Site settings
-- -----------------------------------------------------------------------------

insert into public.site_settings (
  id, site_name, tagline, seo_title_template, seo_default_title, seo_default_description,
  contact_email, contact_phone, whatsapp_number, whatsapp_default_message, address, business_hours,
  social_links, footer_text, copyright_text, announcement_enabled, announcement_text,
  announcement_href, theme, default_theme, currency_code, currency_locale, auth_google_enabled,
  auth_magic_link_enabled, maintenance_mode, maintenance_message
) values (
  1,
  'Retexia',
  'Simple tools that run your business busywork',
  '%s · Retexia',
  'Retexia · Simple tools for busy businesses',
  'Ready-made tools for Sri Lankan small businesses, set up for you. Your WhatsApp answers customers by itself, and we build websites, apps and automations too.',
  'hello@retexia.com',
  '+94 70 000 0000',
  '+94700000000',
  'Hi Retexia, I would like to know more.',
  'Colombo, Sri Lanka',
  'Monday to Saturday, 9.00 am to 6.00 pm',
  '[]'::jsonb,
  'Simple tools that run your business busywork. Made in Sri Lanka.',
  '© {year} Retexia. All rights reserved.',
  false,
  'Retexia Lingo is open for early customers. Setup by our team is included.',
  '/lingo#pricing',
  '{}'::jsonb,
  'system',
  'LKR',
  'en-LK',
  false,
  true,
  false,
  'We are making a few improvements. Please check back in a little while.'
)
on conflict (id) do update set
  site_name = excluded.site_name,
  tagline = excluded.tagline,
  seo_title_template = excluded.seo_title_template,
  seo_default_title = excluded.seo_default_title,
  seo_default_description = excluded.seo_default_description,
  contact_email = excluded.contact_email,
  contact_phone = excluded.contact_phone,
  whatsapp_number = excluded.whatsapp_number,
  whatsapp_default_message = excluded.whatsapp_default_message,
  address = excluded.address,
  business_hours = excluded.business_hours,
  social_links = excluded.social_links,
  footer_text = excluded.footer_text,
  copyright_text = excluded.copyright_text,
  announcement_enabled = excluded.announcement_enabled,
  announcement_text = excluded.announcement_text,
  announcement_href = excluded.announcement_href,
  theme = excluded.theme,
  default_theme = excluded.default_theme,
  currency_code = excluded.currency_code,
  currency_locale = excluded.currency_locale,
  auth_google_enabled = excluded.auth_google_enabled,
  auth_magic_link_enabled = excluded.auth_magic_link_enabled,
  maintenance_mode = excluded.maintenance_mode,
  maintenance_message = excluded.maintenance_message;

-- -----------------------------------------------------------------------------
-- Order statuses
-- -----------------------------------------------------------------------------

insert into public.order_statuses (key, label, description, tone, is_final, customer_can_cancel, sort_order) values
  ('submitted', 'Submitted', 'We received your request. We will review it within one working day.', 'brand', false, true, 1),
  ('reviewing', 'Reviewing', 'We are reviewing your details and may message you with a quick question.', 'brand', false, true, 2),
  ('awaiting_payment', 'Awaiting payment', 'Pay to start setup. We have sent the payment details to your email and WhatsApp.', 'warning', false, true, 3),
  ('setting_up', 'Setting up', 'We are building and testing your setup. We will message you when it is ready.', 'brand', false, false, 4),
  ('active', 'Active', 'Live. Everything is running.', 'success', false, false, 5),
  ('paused', 'Paused', 'Paused for now. Message us when you want to start again.', 'warning', false, false, 6),
  ('cancelled', 'Cancelled', 'This request was cancelled.', 'neutral', true, false, 7),
  ('rejected', 'Not accepted', 'We could not take this request. We have emailed you the reason.', 'danger', true, false, 8)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  tone = excluded.tone,
  is_final = excluded.is_final,
  customer_can_cancel = excluded.customer_can_cancel,
  sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------

insert into public.products (
  slug, code, name, short_name, tagline, description, icon, color_light, color_dark,
  color_soft_light, color_soft_dark, status, page_slug, panel_url, panel_live, sort_order
) values
  (
    'lingo', 'LNG', 'Retexia Lingo', 'Lingo',
    'Your WhatsApp answers customers in seconds',
    'Lingo answers your customers on WhatsApp, day and night. It knows your prices, stock and opening hours, speaks English, Sinhala, Tamil and Singlish, and hands the chat to you when a person is needed.',
    'message-circle', '#0b7565', '#3fd3bc', '#d7f1ec', '#0f2f2a',
    'live', 'lingo', 'https://lingo.retexia.com/account', false, 1
  ),
  (
    'post', 'PST', 'Retexia Post', 'Post',
    'Your social media posts, planned and published for you',
    'Post publishes your Facebook and Instagram posts on time, from a plan you make once a month. Your page stays active while you run the shop.',
    'calendar-clock', '#ad2a5e', '#ff7fae', '#f8dde8', '#3a1424',
    'coming_soon', 'post', 'https://post.retexia.com/account', false, 2
  )
on conflict (slug) do update set
  code = excluded.code,
  name = excluded.name,
  short_name = excluded.short_name,
  tagline = excluded.tagline,
  description = excluded.description,
  icon = excluded.icon,
  color_light = excluded.color_light,
  color_dark = excluded.color_dark,
  color_soft_light = excluded.color_soft_light,
  color_soft_dark = excluded.color_soft_dark,
  status = excluded.status,
  page_slug = excluded.page_slug,
  panel_url = excluded.panel_url,
  panel_live = excluded.panel_live,
  sort_order = excluded.sort_order;

insert into public.product_features (id, product_id, icon, title, description, sort_order)
select md5('retexia:feature:' || p.slug || ':' || f.n)::uuid, p.id, f.icon, f.title, f.description, f.n
from public.products p
join (values
  ('lingo', 1, 'tags', 'Answers prices, stock and hours', 'Customers ask "price ekka?" and get the right answer in seconds, straight from your product list.'),
  ('lingo', 2, 'languages', 'Speaks your customers'' language', 'English, Sinhala, Tamil and Singlish. Lingo replies in the language the customer writes in.'),
  ('lingo', 3, 'hand-helping', 'Hands hard chats to you', 'When a chat needs a person, Lingo lets the customer know and passes it to you.'),
  ('lingo', 4, 'clock', 'Works 24/7', 'Late-night questions get answered too, so you wake up to orders instead of unread messages.'),
  ('lingo', 5, 'clipboard-list', 'Captures orders and leads', 'Names, numbers and what each customer wants are saved for you to follow up.'),
  ('lingo', 6, 'wrench', 'Set up by us', 'Tell us about your business. We build it, test it and switch it on. No tech skills needed.'),
  ('post', 1, 'calendar-clock', 'Plan a month in one sitting', 'Line up your Facebook and Instagram posts once, and they go out on time.'),
  ('post', 2, 'images', 'Posts that look like you', 'Your logo, colours and products in ready-made templates for offers and new stock.'),
  ('post', 3, 'chart-line', 'See what works', 'A simple monthly report of which posts brought messages and sales.')
) as f (slug, n, icon, title, description) on f.slug = p.slug
on conflict (id) do update set
  icon = excluded.icon,
  title = excluded.title,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Lingo packages and their features
-- -----------------------------------------------------------------------------

insert into public.packages (
  product_id, slug, name, tagline, price_monthly, price_yearly, setup_fee, badge, is_featured,
  cta_label, fine_print, is_active, sort_order
)
select p.id, v.slug, v.name, v.tagline, v.monthly, v.yearly, v.setup, v.badge, v.featured, v.cta,
       'WhatsApp marketing message fees charged by Meta are billed at cost. Yearly plans include 2 months free.',
       true, v.sort_order
from public.products p
join (values
  ('core', 'Lingo Core', 'Your WhatsApp, answering by itself', 6900.00, 69000.00, 9900.00, null, false, 'Choose Core', 1),
  ('pro', 'Lingo Pro', 'Your own assistant, with automations', 14900.00, 149000.00, 19900.00, 'Most popular', true, 'Choose Pro', 2),
  ('supreme', 'Lingo Supreme', 'Fully custom, for growing businesses', 34900.00, 349000.00, 49900.00, null, false, 'Choose Supreme', 3)
) as v (slug, name, tagline, monthly, yearly, setup, badge, featured, cta, sort_order) on true
where p.slug = 'lingo'
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

insert into public.package_features (id, package_id, label, included, sort_order)
select md5('retexia:package-feature:lingo:' || f.pkg || ':' || f.n)::uuid, pk.id, f.label, f.included, f.n
from public.packages pk
join public.products p on p.id = pk.product_id and p.slug = 'lingo'
join (values
  ('core', 1, '1 WhatsApp Business number', true),
  ('core', 2, 'Answers prices, stock, opening hours and delivery questions', true),
  ('core', 3, 'Up to 50 products or 15 services', true),
  ('core', 4, 'Replies in English, Sinhala, Tamil and Singlish', true),
  ('core', 5, 'Up to 1,000 customer chats a month', true),
  ('core', 6, 'Hands tricky chats over to you', true),
  ('core', 7, 'Monthly chat report', true),
  ('core', 8, 'Email support', true),
  ('core', 9, 'Custom name and tone', false),
  ('core', 10, 'Automations', false),
  ('pro', 1, 'Everything in Core', true),
  ('pro', 2, 'Custom name, tone and greeting', true),
  ('pro', 3, 'Up to 300 products or 50 services', true),
  ('pro', 4, 'Product list synced from Google Sheets', true),
  ('pro', 5, '2 automations of your choice, like orders to Google Sheets or appointment booking', true),
  ('pro', 6, 'Up to 3,000 chats a month', true),
  ('pro', 7, 'Chat history in your Lingo panel', true),
  ('pro', 8, 'Priority WhatsApp support', true),
  ('supreme', 1, 'Everything in Pro', true),
  ('supreme', 2, 'Fully custom replies, flows and rules', true),
  ('supreme', 3, 'Unlimited products and services (fair use)', true),
  ('supreme', 4, '10 automations: orders, bookings, payment reminders, follow-ups and more', true),
  ('supreme', 5, 'Connect your website, POS or online store', true),
  ('supreme', 6, 'Up to 3 WhatsApp numbers', true),
  ('supreme', 7, 'Up to 10,000 chats a month', true),
  ('supreme', 8, 'Monthly review call', true),
  ('supreme', 9, 'Same-day support', true)
) as f (pkg, n, label, included) on f.pkg = pk.slug
on conflict (id) do update set
  label = excluded.label,
  included = excluded.included,
  sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Lingo onboarding form
-- -----------------------------------------------------------------------------

insert into public.forms (slug, product_id, title, description, submit_label, success_title, success_message, version)
select 'lingo-onboarding', p.id,
  'Set up your Lingo',
  'Tell us about your business. It takes about ten minutes. Your answers are saved on this device, so you can come back later.',
  'Submit request',
  'Request received',
  'Thank you. We will review your details and message you within one working day.',
  1
from public.products p where p.slug = 'lingo'
on conflict (slug) do update set
  product_id = excluded.product_id,
  title = excluded.title,
  description = excluded.description,
  submit_label = excluded.submit_label,
  success_title = excluded.success_title,
  success_message = excluded.success_message;

update public.products
   set onboarding_form_id = (select id from public.forms where slug = 'lingo-onboarding')
 where slug = 'lingo';

insert into public.form_steps (id, form_id, step_number, title, description, sort_order)
select md5('retexia:form:lingo-onboarding:step:' || s.n)::uuid, f.id, s.n, s.title, s.description, s.n
from public.forms f
join (values
  (1, 'About your business', 'The basics, so we know who Lingo is talking for.'),
  (2, 'What Lingo will talk about', 'What you sell and what customers usually ask.'),
  (3, 'WhatsApp and contact', 'Your number, and how we reach you during setup.')
) as s (n, title, description) on true
where f.slug = 'lingo-onboarding'
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
  md5('retexia:form:lingo-onboarding:field:' || v.key)::uuid,
  md5('retexia:form:lingo-onboarding:step:' || v.step)::uuid,
  f.id, v.key, v.label, v.type, v.placeholder, v.help_text, v.options::jsonb, v.required,
  v.min, v.max, v.default_value, v.show_if::jsonb, v.width, v.prefill_from, v.sort_order
from public.forms f
join (values
  -- Step 1: About your business
  (1, 'business_name', 'Business name', 'text', 'Nimali Fashion', null, '[]', true, 2, 120, null, null, 'full', 'profile.business_name', 1),
  (1, 'business_type', 'What does your business do?', 'radio_cards', null, null,
    '[{"value":"products","label":"We sell products","description":"Clothes, food, electronics, anything you deliver or hand over."},{"value":"services","label":"We offer services","description":"Appointments, classes, repairs, tours and the like."},{"value":"both","label":"Both","description":"You sell products and offer services."}]',
    true, null, null, null, null, 'full', null, 2),
  (1, 'industry', 'Industry', 'select', 'Choose one', null,
    '[{"value":"clothing","label":"Clothing and fashion"},{"value":"food","label":"Food and restaurants"},{"value":"electronics","label":"Electronics and mobile"},{"value":"beauty","label":"Beauty and salon"},{"value":"health","label":"Health and clinics"},{"value":"education","label":"Education and tuition"},{"value":"travel","label":"Travel and tourism"},{"value":"real_estate","label":"Real estate"},{"value":"hardware","label":"Hardware and building"},{"value":"other","label":"Other"}]',
    true, null, null, null, null, 'half', null, 3),
  (1, 'industry_other', 'Your industry', 'text', 'Pet shop', null, '[]', true, 2, 80, null, '{"field":"industry","equals":"other"}', 'half', null, 4),
  (1, 'city', 'City', 'text', 'Colombo', 'Where your business is based.', '[]', true, 2, 80, null, null, 'half', null, 5),
  (1, 'online_link', 'Website or social page', 'url', 'https://facebook.com/yourpage', 'Website, Facebook or Instagram page, so we can learn your business faster.', '[]', false, null, 300, null, null, 'half', null, 6),

  -- Step 2: What Lingo will talk about
  (2, 'products_description', 'What do you sell?', 'textarea', 'Women''s dresses, sarees and accessories', null, '[]', true, 5, 1000, null, '{"field":"business_type","in":["products","both"]}', 'full', null, 1),
  (2, 'product_count', 'How many products?', 'select', 'Choose one', null,
    '[{"value":"1-20","label":"1–20"},{"value":"21-50","label":"21–50"},{"value":"51-300","label":"51–300"},{"value":"300+","label":"More than 300"}]',
    true, null, null, null, '{"field":"business_type","in":["products","both"]}', 'half', null, 2),
  (2, 'product_info_location', 'Where is your product list today?', 'select', 'Choose one', null,
    '[{"value":"sheet","label":"Google Sheet or Excel"},{"value":"website","label":"My website"},{"value":"social","label":"Facebook or Instagram"},{"value":"memory","label":"Only in my head"},{"value":"other","label":"Other"}]',
    false, null, null, null, '{"field":"business_type","in":["products","both"]}', 'half', null, 3),
  (2, 'delivery', 'Delivery', 'radio', null, null,
    '[{"value":"island_wide","label":"Island-wide delivery"},{"value":"local","label":"Only in my area"},{"value":"pickup","label":"Pickup only"}]',
    false, null, null, null, '{"field":"business_type","in":["products","both"]}', 'full', null, 4),
  (2, 'services_description', 'What services do you offer?', 'textarea', 'Haircuts, bridal dressing, facials', null, '[]', true, 5, 1000, null, '{"field":"business_type","in":["services","both"]}', 'full', null, 5),
  (2, 'service_count', 'How many services?', 'select', 'Choose one', null,
    '[{"value":"1-5","label":"1–5"},{"value":"6-15","label":"6–15"},{"value":"16-50","label":"16–50"},{"value":"50+","label":"More than 50"}]',
    true, null, null, null, '{"field":"business_type","in":["services","both"]}', 'half', null, 6),
  (2, 'takes_bookings', 'Do customers book appointments?', 'toggle', null, 'Turn on if customers book a time with you.', '[]', false, null, null, 'false', '{"field":"business_type","in":["services","both"]}', 'half', null, 7),
  (2, 'languages', 'Which languages do your customers write in?', 'checkbox_group', null, 'Pick all that apply.',
    '[{"value":"english","label":"English"},{"value":"sinhala","label":"Sinhala"},{"value":"tamil","label":"Tamil"},{"value":"singlish","label":"Singlish"}]',
    true, 1, null, null, null, 'full', null, 8),
  (2, 'daily_messages', 'How many messages do you get a day?', 'select', 'Choose one', null,
    '[{"value":"lt20","label":"Fewer than 20"},{"value":"20-100","label":"20–100"},{"value":"100-500","label":"100–500"},{"value":"gt500","label":"More than 500"}]',
    true, null, null, null, null, 'half', null, 9),
  (2, 'top_questions', 'What do customers ask most?', 'textarea', 'Price ekka? Delivery thiyenawada? Size M available da?', 'Write them the way customers do. This helps us most.', '[]', true, 5, 2000, null, null, 'full', null, 10),

  -- Step 3: WhatsApp and contact
  (3, 'whatsapp_number', 'WhatsApp number', 'phone', '+94 77 123 4567', 'The number your customers message today.', '[]', true, null, null, null, null, 'half', 'profile.whatsapp', 1),
  (3, 'whatsapp_type', 'Which WhatsApp is it on?', 'radio_cards', null, null,
    '[{"value":"business_app","label":"WhatsApp Business app","description":"The green app with the B icon."},{"value":"personal","label":"Normal WhatsApp","description":"The regular WhatsApp app."},{"value":"new","label":"I will get a new number","description":"We will help you set it up."}]',
    true, null, null, null, null, 'full', null, 2),
  (3, 'handover', 'When should Lingo hand the chat to you?', 'select', 'Choose one', null,
    '[{"value":"order","label":"When the customer wants to order"},{"value":"unknown","label":"When it can''t answer"},{"value":"person","label":"When the customer asks for a person"},{"value":"never","label":"Never, Lingo handles everything"}]',
    true, null, null, null, null, 'full', null, 3),
  (3, 'contact_name', 'Your name', 'text', 'Nimali Perera', null, '[]', true, 2, 120, null, null, 'half', 'profile.full_name', 4),
  (3, 'contact_phone', 'Your phone number', 'phone', '+94 77 123 4567', 'We call or message you here during setup.', '[]', true, null, null, null, null, 'half', 'profile.phone', 5),
  (3, 'best_time', 'Best time to reach you', 'select', 'Choose one', null,
    '[{"value":"morning","label":"Morning"},{"value":"afternoon","label":"Afternoon"},{"value":"evening","label":"Evening"},{"value":"any","label":"Any time"}]',
    false, null, null, null, null, 'half', null, 6),
  (3, 'notes', 'Anything else we should know?', 'textarea', 'Special offers, busy seasons, anything that helps.', null, '[]', false, null, 2000, null, null, 'full', null, 7),
  (3, 'agree', 'I agree to the [Terms](/terms) and [Privacy policy](/privacy)', 'checkbox', null, null, '[]', true, null, null, null, null, 'full', null, 8)
) as v (step, key, label, type, placeholder, help_text, options, required, min, max, default_value, show_if, width, prefill_from, sort_order) on true
where f.slug = 'lingo-onboarding'
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

-- -----------------------------------------------------------------------------
-- Services (home page)
-- -----------------------------------------------------------------------------

insert into public.services (id, title, description, icon, sort_order)
select md5('retexia:service:' || v.n)::uuid, v.title, v.description, v.icon, v.n
from (values
  (1, 'WhatsApp chatbots', 'Your customers get answers on WhatsApp any time, even while you sleep.', 'message-circle'),
  (2, 'Social media automation', 'Your posts go out on time, every time, without you opening the app.', 'calendar-clock'),
  (3, 'Business automations', 'Orders, bookings and reminders move by themselves, so you stop copying and pasting.', 'workflow'),
  (4, 'Websites', 'A fast, clear website that tells people what you do and how to buy.', 'globe'),
  (5, 'Mobile apps', 'An app your customers keep on their phone to order, book or check in.', 'smartphone'),
  (6, 'Digital marketing', 'Ads and content that bring the right people to your shop, online and off.', 'megaphone')
) as v (n, title, description, icon)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Navigation
-- -----------------------------------------------------------------------------

insert into public.navigation_items (id, location, label, href, kind, open_in_new_tab, sort_order)
select md5('retexia:nav:' || v.location || ':' || v.n)::uuid, v.location, v.label, v.href, v.kind, false, v.n
from (values
  ('header', 1, 'Products', null, 'products_menu'),
  ('header', 2, 'Services', '/#services', 'link'),
  ('header', 3, 'About', '/#about', 'link'),
  ('header', 4, 'Contact', '/contact', 'link'),
  ('header', 5, 'Get started', '/lingo#pricing', 'button'),
  ('footer_products', 1, 'Products', null, 'products_menu'),
  ('footer_products', 2, 'All products', '/products', 'link'),
  ('footer_company', 1, 'About', '/#about', 'link'),
  ('footer_company', 2, 'Services', '/#services', 'link'),
  ('footer_company', 3, 'Contact', '/contact', 'link'),
  ('footer_legal', 1, 'Privacy policy', '/privacy', 'link'),
  ('footer_legal', 2, 'Terms of service', '/terms', 'link')
) as v (location, n, label, href, kind)
on conflict (id) do update set
  location = excluded.location,
  label = excluded.label,
  href = excluded.href,
  kind = excluded.kind,
  sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- FAQs
-- -----------------------------------------------------------------------------

insert into public.faqs (id, product_id, question, answer, sort_order)
select md5('retexia:faq:' || v.scope || ':' || v.n)::uuid,
       (select id from public.products where slug = v.scope),
       v.question, v.answer, v.n
from (values
  ('general', 1, 'Who is Retexia for?', 'Small and growing businesses in Sri Lanka that sell or take bookings through WhatsApp and social media: shops, salons, clinics, tutors, restaurants and many more.'),
  ('general', 2, 'Do I need technical skills?', 'No. We set everything up for you, test it and show you how it works. If you can use WhatsApp, you can use Retexia.'),
  ('general', 3, 'How do I pay?', 'Once we have reviewed your details, we send you a quote and payment details. Setup starts when the first payment is received.'),
  ('general', 4, 'Can you build something custom?', 'Yes. Tell us what you need on the [contact page](/contact) or on WhatsApp, and we will suggest the simplest way to do it.'),
  ('general', 5, 'Where is my data kept?', 'Your account and business details are stored securely with Supabase, a trusted cloud database. We only use your data to run the service. Read our [privacy policy](/privacy) for the details.'),
  ('lingo', 1, 'Do I need a new WhatsApp number?', 'Usually not. You can keep the number your customers already know. We move it to the official WhatsApp Business Platform during setup and explain every step first. You can also start with a new number if you prefer.'),
  ('lingo', 2, 'What happens when Lingo cannot answer?', 'It tells the customer that a person will reply soon and alerts you, so you can take over the chat.'),
  ('lingo', 3, 'Can Lingo take orders?', 'Yes. Lingo collects the customer''s name, address, phone number and what they want, then passes the order to you. With **Pro** and **Supreme**, orders can go straight into a Google Sheet or your own system.'),
  ('lingo', 4, 'How long does setup take?', 'Most businesses are live within one to three working days after payment, depending on how many products or services you have.'),
  ('lingo', 5, 'What are the Meta fees?', 'Meta, the company behind WhatsApp, charges small fees for some messages, such as marketing messages you send first. Replies to customers who message you are usually free. Any Meta fees are billed at cost, with no markup.'),
  ('lingo', 6, 'Can I change my plan later?', 'Yes. Move up or down at any time. Message us and we will switch it from your next billing date.'),
  ('lingo', 7, 'Can I cancel?', 'Yes. You can cancel a request any time before setup starts from your account. After that, message us and we will stop it before your next billing date.')
) as v (scope, n, question, answer)
on conflict (id) do update set
  product_id = excluded.product_id,
  question = excluded.question,
  answer = excluded.answer,
  sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Pages
-- -----------------------------------------------------------------------------

insert into public.pages (slug, title, seo_title, seo_description, product_id, is_published, show_in_sitemap) values
  ('', 'Home', 'Retexia · Simple tools for busy businesses', 'Ready-made tools for Sri Lankan small businesses, set up for you. Your WhatsApp answers customers by itself, and we build websites, apps and automations too.', null, true, true),
  ('lingo', 'Retexia Lingo', 'Retexia Lingo · Your WhatsApp answers customers in seconds', 'Lingo answers your customers on WhatsApp, day and night, in English, Sinhala, Tamil and Singlish. Set up for you. Plans from LKR 6,900 a month.', (select id from public.products where slug = 'lingo'), true, true),
  ('post', 'Retexia Post', 'Retexia Post · Your social media, posted for you', 'Plan your Facebook and Instagram posts once a month and let Post publish them on time. Coming soon. Join the waitlist.', (select id from public.products where slug = 'post'), true, true),
  ('products', 'Products', null, 'Ready-made tools for small businesses, set up by the Retexia team.', null, true, true),
  ('contact', 'Contact', null, 'Talk to the Retexia team about a product, a custom project or a quote. We reply within one working day.', null, true, true),
  ('privacy', 'Privacy policy', null, 'How Retexia collects, uses and protects your information.', null, true, true),
  ('terms', 'Terms of service', null, 'The terms for using the Retexia website and services.', null, true, true)
on conflict (slug) do update set
  title = excluded.title,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  product_id = excluded.product_id,
  is_published = excluded.is_published,
  show_in_sitemap = excluded.show_in_sitemap;

-- -----------------------------------------------------------------------------
-- Page sections
-- -----------------------------------------------------------------------------

insert into public.page_sections (id, page_id, type, anchor, background, eyebrow, title, highlight, subtitle, content, sort_order)
select md5('retexia:section:' || v.page || ':' || v.n)::uuid,
       (select id from public.pages where slug = v.page),
       v.type, v.anchor, v.background, v.eyebrow, v.title, v.highlight, v.subtitle, v.content::jsonb, v.n
from (values
  -- Home ------------------------------------------------------------------
  ('', 1, 'hero', null, 'surface',
    'Simple tools for busy businesses',
    'Your business answers by itself', 'itself',
    'Retexia builds simple tools that take care of the busywork. Start with Retexia Lingo: your WhatsApp replies to customers in seconds, day and night.',
    $json${
      "primary_cta": {"label": "See Retexia Lingo", "href": "/lingo"},
      "secondary_cta": {"label": "Talk to us", "href": "/contact"},
      "visual": "lingo_chat",
      "show_halo": true,
      "chat": {
        "name": "Nimali Fashion",
        "status": "Replies instantly",
        "messages": [
          {"from": "customer", "text": "Hi, me floral dress eka M size thiyenawada?", "time": "9:41 pm"},
          {"from": "business", "text": "Ow, thiyenawa. Floral midi dress, size M, Rs. 4,850. Colombo delivery Rs. 350, next day.", "time": "9:41 pm"},
          {"from": "customer", "text": "Kohomada order karanne?", "time": "9:42 pm"},
          {"from": "business", "text": "Your name, address and phone number ewanna. Cash on delivery okay.", "time": "9:42 pm"},
          {"from": "customer", "text": "ස්තූතියි", "time": "9:43 pm"},
          {"from": "business", "text": "ඔබට ස්තූතියි. We will confirm your order in the morning.", "time": "9:43 pm"}
        ]
      }
    }$json$),
  ('', 2, 'products', 'products', 'surface',
    'Products',
    'Ready-made tools, set up for you', 'set up for you',
    'Pick a tool, tell us about your business, and we switch it on. More tools are on the way.',
    '{"include_coming_soon": true, "show_status": true}'),
  ('', 3, 'services', 'services', 'sunk',
    'Services',
    'Need something made just for you?', 'just for you',
    'We also build custom websites, apps and automations for businesses with their own way of working.',
    '{"layout": "grid"}'),
  ('', 4, 'steps', 'how-we-work', 'surface',
    'How we work',
    'Three steps, then you relax', 'relax',
    null,
    $json${"items": [
      {"icon": "message-square-text", "title": "Tell us about your business", "text": "Fill in a short form or message us. It takes about ten minutes."},
      {"icon": "wrench", "title": "We set it up for you", "text": "We build it, test it with real questions and show you before it goes live."},
      {"icon": "coffee", "title": "It runs, you relax", "text": "Your tool works every day. We keep an eye on it and help when you need a change."}
    ]}$json$),
  ('', 5, 'about', 'about', 'sunk',
    'About us',
    'A Sri Lankan team that hates busywork', 'hates busywork',
    null,
    $json${
      "body": "Retexia started in Colombo with a simple idea: small businesses should not lose sales because nobody had time to reply.\n\nWe build ready-made tools that do the repetitive work for you, and we set them up ourselves, so you do not have to learn anything new. When you need something special, we build that too.",
      "stats": [
        {"value": "24/7", "label": "Replies, day and night"},
        {"value": "3", "label": "Languages, plus Singlish"},
        {"value": "1 day", "label": "Average setup time"}
      ]
    }$json$),
  ('', 6, 'testimonials', null, 'surface',
    'Customers',
    'What business owners say', 'say',
    null,
    '{}'),
  ('', 7, 'faq', 'faq', 'surface',
    'Questions',
    'Good to know', 'know',
    null,
    '{}'),
  ('', 8, 'cta', null, 'sunk',
    null,
    'Ready to stop answering the same questions?', 'same questions',
    'Tell us about your business and we will have your WhatsApp answering customers within days.',
    '{"primary_cta": {"label": "See plans and prices", "href": "/lingo#pricing"}, "secondary_cta": {"label": "Talk to us", "href": "/contact"}}'),
  ('', 9, 'contact', 'contact', 'surface',
    'Contact',
    'Talk to a real person', 'real person',
    'Ask anything. We reply within one working day, usually much sooner.',
    '{"show_form": true, "show_details": true, "show_whatsapp": true}'),

  -- Lingo -----------------------------------------------------------------
  ('lingo', 1, 'hero', null, 'surface',
    'Retexia Lingo',
    'Your WhatsApp answers customers in seconds', 'in seconds',
    'Lingo replies to your customers on WhatsApp, day and night, in English, Sinhala, Tamil or Singlish. You only step in when it matters.',
    $json${
      "primary_cta": {"label": "See plans", "href": "#pricing"},
      "secondary_cta": {"label": "Talk to us", "href": "/contact"},
      "visual": "lingo_chat",
      "show_halo": true,
      "chat": {
        "name": "Kandy Cakes",
        "status": "Replies instantly",
        "messages": [
          {"from": "customer", "text": "Hi, chocolate cake 1kg price ekka?", "time": "10:12 pm"},
          {"from": "business", "text": "Chocolate fudge 1kg is Rs. 3,900. Kandy town delivery is free for orders above Rs. 3,000.", "time": "10:12 pm"},
          {"from": "customer", "text": "Sunday ta ganna puluwanda?", "time": "10:13 pm"},
          {"from": "business", "text": "Ow. Sunday 10 am to 6 pm pickup or delivery. Name eka saha time eka ewanna, mama order eka save karannam.", "time": "10:13 pm"},
          {"from": "customer", "text": "Amaya, 4 pm. Thank you", "time": "10:14 pm"},
          {"from": "business", "text": "Done, Amaya. Chocolate fudge 1kg for Sunday 4 pm. The owner will confirm by morning.", "time": "10:14 pm"}
        ]
      }
    }$json$),
  ('lingo', 2, 'features', 'features', 'surface',
    'What you get',
    'Answers, orders and leads, all by itself', 'by itself',
    null,
    '{"source": "product", "columns": 3}'),
  ('lingo', 3, 'steps', 'setup', 'sunk',
    'Setup',
    'Live in three simple steps', 'three simple steps',
    null,
    $json${"items": [
      {"icon": "clipboard-list", "title": "Choose a plan and tell us about you", "text": "A short form about what you sell and what customers ask. About ten minutes."},
      {"icon": "wrench", "title": "We build and test your Lingo", "text": "We load your products and prices, teach it your answers and test it with real questions."},
      {"icon": "circle-check", "title": "Switch on and relax", "text": "We connect your WhatsApp number. Lingo starts answering, and you get a monthly report."}
    ]}$json$),
  ('lingo', 4, 'pricing', 'pricing', 'surface',
    'Pricing',
    'Simple plans, no surprises', 'no surprises',
    'Pay monthly, or pay yearly and get two months free. Every plan includes setup by our team.',
    '{"product_slug": "lingo", "show_yearly_toggle": true}'),
  ('lingo', 5, 'testimonials', null, 'surface',
    'Customers',
    'What Lingo customers say', 'say',
    null,
    '{"product_slug": "lingo"}'),
  ('lingo', 6, 'faq', 'faq', 'sunk',
    'Questions',
    'Questions about Lingo', 'Lingo',
    null,
    '{"product_slug": "lingo"}'),
  ('lingo', 7, 'cta', null, 'surface',
    null,
    'Let your WhatsApp do the talking', 'do the talking',
    'Pick a plan today. We will be in touch within one working day.',
    '{"primary_cta": {"label": "Choose a plan", "href": "#pricing"}, "secondary_cta": {"label": "Message us on WhatsApp", "href": "whatsapp:"}}'),

  -- Post ------------------------------------------------------------------
  ('post', 1, 'hero', null, 'surface',
    'Retexia Post',
    'Your social media, posted for you', 'posted for you',
    'Plan your Facebook and Instagram posts once a month. Post publishes them on time, so your page never goes quiet.',
    '{"badge": "Coming soon", "visual": "none", "show_halo": false, "primary_cta": {"label": "Join the waitlist", "href": "#waitlist"}, "secondary_cta": {"label": "Talk to us", "href": "/contact"}}'),
  ('post', 2, 'features', 'features', 'surface',
    'What you will get',
    'Less posting, more selling', 'more selling',
    null,
    '{"source": "product", "columns": 3}'),
  ('post', 3, 'waitlist', 'waitlist', 'sunk',
    'Waitlist',
    'Be the first to try Post', 'first',
    'Leave your email. We will write once, when it opens.',
    '{"product_slug": "post"}'),
  ('post', 4, 'cta', null, 'surface',
    null,
    'Need it sooner?', 'sooner',
    'We already set up social media automations for businesses as a custom service. Tell us what you need.',
    '{"primary_cta": {"label": "Talk to us", "href": "/contact"}}'),

  -- Products --------------------------------------------------------------
  ('products', 1, 'hero', null, 'surface',
    'Products',
    'Tools that take work off your plate', 'off your plate',
    'Ready-made, set up by our team, and priced for small businesses.',
    '{"visual": "none", "size": "small", "show_halo": false}'),
  ('products', 2, 'products', null, 'surface',
    null, null, null, null,
    '{"include_coming_soon": true, "show_status": true}'),
  ('products', 3, 'cta', null, 'sunk',
    null,
    'Need something that is not here?', 'not here',
    'We build custom websites, apps and automations too.',
    '{"primary_cta": {"label": "Talk to us", "href": "/contact"}}'),

  -- Contact ---------------------------------------------------------------
  ('contact', 1, 'contact', null, 'surface',
    'Contact',
    'Talk to a real person', 'real person',
    'Questions about a product, a custom project or a quote. We reply within one working day.',
    '{"show_form": true, "show_details": true, "show_whatsapp": true}'),

  -- Privacy ---------------------------------------------------------------
  ('privacy', 1, 'rich_text', null, 'surface',
    'Legal',
    'Privacy policy', null,
    'Last updated: 2 October 2026',
    $json${"body": "This policy explains what information Retexia collects, why we collect it and how we keep it safe. If anything is unclear, email us at hello@retexia.com.\n\n## Who we are\n\nRetexia is a Sri Lankan business that sells ready-made digital tools, such as Retexia Lingo, and builds custom websites, apps and automations. In this policy, \"we\" and \"us\" mean Retexia.\n\n## What we collect\n\n- **Account details:** your name, email address and password (stored only in encrypted form).\n- **Profile and business details:** phone and WhatsApp numbers, business name, and the answers you give in our onboarding forms.\n- **Messages you send us:** through the contact form, the waitlist, email or WhatsApp.\n- **WhatsApp messages processed for the service:** when a product like Retexia Lingo runs on your WhatsApp number, the messages your customers send and the replies are processed so the service can work, and kept for reports and chat history as described in your plan.\n- **Basic technical data:** such as browser type and pages visited, to keep the site secure and working.\n\n## How we use it\n\n- To create and manage your account.\n- To set up, run and support the products you order.\n- To reply to your questions and send you updates about your orders.\n- To send product news, only if you agreed to it. You can stop these at any time.\n- To keep our services secure and to meet legal duties.\n\nWe do not sell your information.\n\n## Where it is stored\n\nYour data is stored with Supabase, a cloud database provider, and our website is hosted by Vercel. These providers may store data outside Sri Lanka. We choose providers with strong security and only share what they need to run the service. WhatsApp messages also pass through Meta's WhatsApp Business Platform.\n\n## How long we keep it\n\nWe keep account and order information while your account is open and for as long as the law requires afterwards (for example, for tax records). Chat data for a product is deleted within 90 days after the service ends, unless you ask us to delete it sooner.\n\n## Your choices and rights\n\nYou can see and update your profile in your account. You can ask us for a copy of your data, to correct it, or to delete it, by emailing hello@retexia.com. We will reply within 30 days.\n\n## Security\n\nWe use encrypted connections, access controls and row-level security in our database so each customer can only see their own information.\n\n## Changes\n\nIf we change this policy in a way that matters, we will tell you by email or on this page before the change takes effect.\n\n## Contact\n\nRetexia, Colombo, Sri Lanka. Email: hello@retexia.com"}$json$),

  -- Terms -----------------------------------------------------------------
  ('terms', 1, 'rich_text', null, 'surface',
    'Legal',
    'Terms of service', null,
    'Last updated: 2 October 2026',
    $json${"body": "These terms apply when you use the Retexia website or any Retexia product. By creating an account or placing an order, you agree to them.\n\n## Your account\n\nYou need an account to order a product. Keep your login details safe and tell us straight away if you think someone else has used your account. You are responsible for what happens in your account.\n\n## Orders and setup\n\nWhen you submit a request, we review it and may ask you questions. We can accept or decline a request. Once accepted, we send you the price and payment details. Setup starts after the first payment is received.\n\n## Prices and payment\n\nPrices are shown in Sri Lankan rupees (LKR) unless stated otherwise. Monthly plans are billed every month, yearly plans every year. The setup fee is paid once. Fees charged by third parties, such as Meta for WhatsApp messages, are billed at cost. We will tell you at least 30 days before we change the price of an active plan.\n\n## Cancelling\n\nYou can cancel a request from your account before setup starts. After that, message us and we will stop the service before your next billing date. Setup fees are not refundable once setup has started. Amounts already paid for the current billing period are not refunded.\n\n## Using the products fairly\n\nYou agree not to use Retexia products to send spam, to mislead people, or to break the law or WhatsApp's and Meta's rules. We may pause a service that is used this way.\n\n## Your content\n\nYou keep ownership of your business information, product lists and messages. You allow us to use them only to provide the service to you.\n\n## Availability\n\nWe work hard to keep every product running, but we cannot promise it will never be interrupted, for example when WhatsApp or another provider has a problem. We will tell you about planned maintenance in advance.\n\n## Limits of our responsibility\n\nAs far as the law allows, our total responsibility to you is limited to the amount you paid us in the three months before the problem happened. We are not responsible for lost profits or indirect losses.\n\n## Changes to these terms\n\nWe may update these terms. If a change matters, we will tell you by email or on this page before it takes effect.\n\n## Law\n\nThese terms are governed by the laws of Sri Lanka.\n\n## Contact\n\nQuestions about these terms? Email hello@retexia.com."}$json$)
) as v (page, n, type, anchor, background, eyebrow, title, highlight, subtitle, content)
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
  sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- UI strings (site_strings). Generated from the t(key, fallback) calls in the
-- app; edit value in the table editor to change the text on the site.
-- -----------------------------------------------------------------------------

-- @strings:start
insert into public.site_strings (key, value, description) values
  ('account.email_changed', 'Your email address was updated.', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('account.empty.action', 'Browse products', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('account.empty.text', 'Pick a tool and we will set it up for you. It takes about ten minutes to get started.', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('account.empty.title', 'You have no products yet', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('account.filter.active', 'Active', 'Used in apps/web/components/account/orders-filter.tsx'),
  ('account.filter.all', 'All', 'Used in apps/web/components/account/orders-filter.tsx'),
  ('account.filter.closed', 'Closed', 'Used in apps/web/components/account/orders-filter.tsx'),
  ('account.filter.empty', 'Nothing here right now.', 'Used in apps/web/app/(site)/account/products/page.tsx'),
  ('account.filter.in_progress', 'In progress', 'Used in apps/web/components/account/orders-filter.tsx'),
  ('account.filter.label', 'Filter requests', 'Used in apps/web/components/account/orders-filter.tsx'),
  ('account.help.text', 'Message us any time. A real person will reply.', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('account.help.title', 'Need a hand?', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('account.nav.browse', 'Browse products', 'Used in apps/web/components/account/account-nav.tsx'),
  ('account.nav.label', 'Account', 'Used in apps/web/components/account/account-nav.tsx'),
  ('account.nav.overview', 'Overview', 'Used in apps/web/components/account/account-nav.tsx'),
  ('account.nav.products', 'My products', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('account.nav.profile', 'Profile', 'Used in apps/web/components/account/account-nav.tsx'),
  ('account.nav.security', 'Security', 'Used in apps/web/components/account/account-nav.tsx'),
  ('account.overview.explore', 'Explore more products', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('account.overview.greeting', 'Hello, {name}', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('account.overview.subtitle', 'Your products, requests and details in one place.', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('account.overview.title', 'Your account', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('account.overview.your_products', 'Your products', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('account.password_updated', 'Your password was updated.', 'Used in apps/web/app/(site)/account/actions.ts'),
  ('account.products.subtitle', 'Every request and subscription, grouped by product.', 'Used in apps/web/app/(site)/account/products/page.tsx'),
  ('account.products.title', 'My products', 'Used in apps/web/app/(site)/account/products/page.tsx'),
  ('account.profile_incomplete.action', 'Add details', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('account.profile_incomplete.text', 'Add your phone number and business name so we can set things up faster.', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('account.profile_incomplete.title', 'Complete your profile', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('account.profile.avatar_hint', 'Your initials are used as your avatar.', 'Used in apps/web/components/account/profile-form.tsx'),
  ('account.profile.change_email', 'Change email', 'Used in apps/web/app/(site)/account/profile/page.tsx'),
  ('account.profile.email_note', 'You sign in with {email}.', 'Used in apps/web/app/(site)/account/profile/page.tsx'),
  ('account.profile.marketing', 'Email me about new products and offers', 'Used in apps/web/components/account/profile-form.tsx'),
  ('account.profile.marketing_hint', 'A few emails a year. Unsubscribe any time.', 'Used in apps/web/components/account/profile-form.tsx'),
  ('account.profile.save', 'Save changes', 'Used in apps/web/components/account/profile-form.tsx'),
  ('account.profile.saved', 'Your profile is saved.', 'Used in apps/web/app/(site)/account/actions.ts'),
  ('account.profile.subtitle', 'We use these details to set up your products and reach you.', 'Used in apps/web/app/(site)/account/profile/page.tsx'),
  ('account.profile.title', 'Profile', 'Used in apps/web/app/(site)/account/profile/page.tsx'),
  ('account.profile.whatsapp', 'WhatsApp number', 'Used in apps/web/components/account/profile-form.tsx'),
  ('account.security.change_email', 'Change email', 'Used in apps/web/components/account/security-forms.tsx'),
  ('account.security.change_password', 'Change password', 'Used in apps/web/components/account/security-forms.tsx'),
  ('account.security.email_current', 'You sign in with {email}.', 'Used in apps/web/components/account/security-forms.tsx'),
  ('account.security.email_sent', 'Check both your old and new inbox. Open the links we sent to confirm the change.', 'Used in apps/web/app/(site)/account/actions.ts'),
  ('account.security.email_taken', 'That email is already used by another account.', 'Used in apps/web/app/(site)/account/actions.ts'),
  ('account.security.email_title', 'Email address', 'Used in apps/web/components/account/security-forms.tsx'),
  ('account.security.new_email', 'New email', 'Used in apps/web/components/account/security-forms.tsx'),
  ('account.security.password_title', 'Password', 'Used in apps/web/components/account/security-forms.tsx'),
  ('account.security.reauth', 'For your safety, sign out and sign in again, then change your password.', 'Used in apps/web/app/(site)/account/actions.ts'),
  ('account.security.same_email', 'That is already your email address', 'Used in apps/web/components/account/security-forms.tsx'),
  ('account.security.sessions_text', 'Signed in on a shared or lost device? Sign out everywhere, including here.', 'Used in apps/web/components/account/security-forms.tsx'),
  ('account.security.sessions_title', 'Devices', 'Used in apps/web/components/account/security-forms.tsx'),
  ('account.security.sign_out_all', 'Sign out everywhere', 'Used in apps/web/components/account/security-forms.tsx'),
  ('account.security.sign_out_all_text', 'You will need to sign in again on each device, including this one.', 'Used in apps/web/components/account/security-forms.tsx'),
  ('account.security.sign_out_all_title', 'Sign out on every device?', 'Used in apps/web/components/account/security-forms.tsx'),
  ('account.security.signed_out', 'You are signed out on every device.', 'Used in apps/web/app/(site)/account/actions.ts'),
  ('account.security.subtitle', 'Your sign-in details and devices.', 'Used in apps/web/app/(site)/account/security/page.tsx'),
  ('account.security.title', 'Security', 'Used in apps/web/app/(site)/account/security/page.tsx'),
  ('auth.back_to_site', 'Back to site', 'Used in apps/web/app/(auth)/layout.tsx'),
  ('auth.confirm_password', 'Confirm password', 'Used in apps/web/components/account/security-forms.tsx'),
  ('auth.email', 'Email', 'Used in apps/web/components/auth/login-form.tsx'),
  ('auth.error.email_not_confirmed', 'Please confirm your email first. Check your inbox for our link.', 'Used in apps/web/app/(auth)/actions.ts'),
  ('auth.error.generic', 'Something went wrong. Please try again.', 'Used in apps/web/app/(auth)/actions.ts'),
  ('auth.error.invalid_credentials', 'That email or password doesn''t match. Try again or reset your password.', 'Used in apps/web/app/(auth)/actions.ts'),
  ('auth.error.link_expired', 'That link has expired. Ask for a new one.', 'Used in apps/web/app/(auth)/actions.ts'),
  ('auth.error.link_invalid', 'That link has expired or was already used. Please try again.', 'Used in apps/web/app/(auth)/login/page.tsx'),
  ('auth.error.name', 'Enter your full name', 'Used in apps/web/components/account/profile-form.tsx'),
  ('auth.error.password_letters', 'Use letters and numbers', 'Used in apps/web/components/account/security-forms.tsx'),
  ('auth.error.password_mismatch', 'The passwords don''t match', 'Used in apps/web/components/account/security-forms.tsx'),
  ('auth.error.password_required', 'Enter your password', 'Used in apps/web/components/auth/login-form.tsx'),
  ('auth.error.password_short', 'Use at least 8 characters', 'Used in apps/web/app/(site)/account/actions.ts'),
  ('auth.error.rate_limited', 'Too many attempts. Please wait a minute and try again.', 'Used in apps/web/app/(auth)/actions.ts'),
  ('auth.error.same_password', 'Your new password must be different from the old one.', 'Used in apps/web/app/(auth)/actions.ts'),
  ('auth.error.signup_disabled', 'New sign-ups are paused right now. Please contact us.', 'Used in apps/web/app/(auth)/actions.ts'),
  ('auth.error.user_exists', 'An account with this email already exists. Sign in instead.', 'Used in apps/web/app/(auth)/actions.ts'),
  ('auth.error.weak_password', 'Choose a stronger password: at least 8 characters, with letters and numbers.', 'Used in apps/web/app/(auth)/actions.ts'),
  ('auth.forgot.back', 'Back to sign in', 'Used in apps/web/app/(auth)/forgot-password/page.tsx'),
  ('auth.forgot.sent', 'If that email has an account, we have sent a link to reset your password.', 'Used in apps/web/app/(auth)/actions.ts'),
  ('auth.forgot.submit', 'Send reset link', 'Used in apps/web/components/auth/password-forms.tsx'),
  ('auth.forgot.subtitle', 'Enter your email and we will send you a link to choose a new password.', 'Used in apps/web/app/(auth)/forgot-password/page.tsx'),
  ('auth.forgot.title', 'Reset your password', 'Used in apps/web/app/(auth)/forgot-password/page.tsx'),
  ('auth.full_name', 'Full name', 'Used in apps/web/components/account/profile-form.tsx'),
  ('auth.google', 'Continue with Google', 'Used in apps/web/components/auth/google-button.tsx'),
  ('auth.login.create_account', 'Create an account', 'Used in apps/web/app/(auth)/login/page.tsx'),
  ('auth.login.forgot', 'Forgot your password?', 'Used in apps/web/components/auth/login-form.tsx'),
  ('auth.login.no_account', 'New to {site}?', 'Used in apps/web/app/(auth)/login/page.tsx'),
  ('auth.login.setup_note', 'Sign in to set up {name}', 'Used in apps/web/components/auth/auth-context.ts'),
  ('auth.login.submit', 'Sign in', 'Used in apps/web/components/auth/login-form.tsx'),
  ('auth.login.subtitle', 'Welcome back. Sign in to see your products and requests.', 'Used in apps/web/app/(auth)/login/page.tsx'),
  ('auth.login.title', 'Sign in', 'Used in apps/web/app/(auth)/login/page.tsx'),
  ('auth.magic.back', 'Use a different email', 'Used in apps/web/components/auth/login-form.tsx'),
  ('auth.magic.sent', 'If that email has an account, a sign-in link is on its way. It works once and expires in an hour.', 'Used in apps/web/app/(auth)/actions.ts'),
  ('auth.magic.sent_title', 'Check your email', 'Used in apps/web/components/auth/login-form.tsx'),
  ('auth.magic.submit', 'Email me a sign-in link', 'Used in apps/web/components/auth/login-form.tsx'),
  ('auth.magic.switch', 'Email me a sign-in link instead', 'Used in apps/web/components/auth/login-form.tsx'),
  ('auth.magic.switch_back', 'Sign in with a password instead', 'Used in apps/web/components/auth/login-form.tsx'),
  ('auth.new_password', 'New password', 'Used in apps/web/components/account/security-forms.tsx'),
  ('auth.or', 'or', 'Used in apps/web/components/auth/login-form.tsx'),
  ('auth.password', 'Password', 'Used in apps/web/components/auth/login-form.tsx'),
  ('auth.password_hint', 'At least 8 characters, with letters and numbers.', 'Used in apps/web/components/account/security-forms.tsx'),
  ('auth.reset.expired', 'Your reset link has expired. Ask for a new one.', 'Used in apps/web/app/(auth)/actions.ts'),
  ('auth.reset.request_new', 'Send a new link', 'Used in apps/web/app/(auth)/reset-password/page.tsx'),
  ('auth.reset.submit', 'Save new password', 'Used in apps/web/components/auth/password-forms.tsx'),
  ('auth.reset.subtitle', 'For {email}', 'Used in apps/web/app/(auth)/reset-password/page.tsx'),
  ('auth.reset.title', 'Choose a new password', 'Used in apps/web/app/(auth)/reset-password/page.tsx'),
  ('auth.signup.and', 'and', 'Used in apps/web/components/auth/signup-form.tsx'),
  ('auth.signup.check_email', 'Check your email', 'Used in apps/web/components/auth/signup-form.tsx'),
  ('auth.signup.check_email_text', 'We sent a confirmation link to {email}. Open it to finish creating your account.', 'Used in apps/web/components/auth/signup-form.tsx'),
  ('auth.signup.have_account', 'Already have an account?', 'Used in apps/web/app/(auth)/signup/page.tsx'),
  ('auth.signup.privacy', 'Privacy policy', 'Used in apps/web/components/auth/signup-form.tsx'),
  ('auth.signup.setup_note', 'Create an account to set up {name}', 'Used in apps/web/components/auth/auth-context.ts'),
  ('auth.signup.sign_in', 'Sign in', 'Used in apps/web/app/(auth)/signup/page.tsx'),
  ('auth.signup.spam_hint', 'No email after a few minutes? Check your spam folder.', 'Used in apps/web/components/auth/signup-form.tsx'),
  ('auth.signup.submit', 'Create account', 'Used in apps/web/components/auth/signup-form.tsx'),
  ('auth.signup.subtitle', 'One account for every {site} product.', 'Used in apps/web/app/(auth)/signup/page.tsx'),
  ('auth.signup.terms', 'Terms', 'Used in apps/web/components/auth/signup-form.tsx'),
  ('auth.signup.terms_prefix', 'By creating an account you agree to our', 'Used in apps/web/components/auth/signup-form.tsx'),
  ('auth.signup.title', 'Create your account', 'Used in apps/web/app/(auth)/signup/page.tsx'),
  ('common.cancel', 'Cancel', 'Used in apps/web/components/account/security-forms.tsx'),
  ('common.close', 'Close', 'Used in apps/web/components/account/cancel-order.tsx'),
  ('common.no', 'No', 'Used in apps/web/app/(site)/[slug]/get-started/actions.ts'),
  ('common.yes', 'Yes', 'Used in apps/web/app/(site)/[slug]/get-started/actions.ts'),
  ('contact.address', 'Address', 'Used in apps/web/components/sections/form-sections.tsx'),
  ('contact.business', 'Business name', 'Used in apps/web/components/account/profile-form.tsx'),
  ('contact.details', 'Contact details', 'Used in apps/web/components/sections/form-sections.tsx'),
  ('contact.email', 'Email', 'Used in apps/web/components/sections/contact-form.tsx'),
  ('contact.error.message', 'Tell us a little more (at least 5 characters)', 'Used in apps/web/app/(site)/actions.ts'),
  ('contact.hours', 'Hours', 'Used in apps/web/components/sections/form-sections.tsx'),
  ('contact.message', 'How can we help?', 'Used in apps/web/components/sections/contact-form.tsx'),
  ('contact.name', 'Your name', 'Used in apps/web/components/sections/contact-form.tsx'),
  ('contact.phone', 'Phone', 'Used in apps/web/components/account/profile-form.tsx'),
  ('contact.reply_time', 'We reply within one working day.', 'Used in apps/web/components/sections/contact-form.tsx'),
  ('contact.send_another', 'Send another message', 'Used in apps/web/components/sections/contact-form.tsx'),
  ('contact.sent_title', 'Message sent', 'Used in apps/web/components/sections/contact-form.tsx'),
  ('contact.submit', 'Send message', 'Used in apps/web/components/sections/contact-form.tsx'),
  ('contact.success', 'Thank you. We will reply within one working day.', 'Used in apps/web/app/(site)/actions.ts'),
  ('contact.whatsapp_button', 'Message us on WhatsApp', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('contact.whatsapp_text', 'Message us and a real person will reply.', 'Used in apps/web/components/sections/form-sections.tsx'),
  ('contact.whatsapp_title', 'Prefer WhatsApp?', 'Used in apps/web/components/sections/form-sections.tsx'),
  ('error.404.contact', 'Contact us', 'Used in apps/web/components/not-found-content.tsx'),
  ('error.404.eyebrow', 'Page not found', 'Used in apps/web/components/not-found-content.tsx'),
  ('error.404.home', 'Go to the home page', 'Used in apps/web/app/error.tsx'),
  ('error.404.text', 'The link may be old or mistyped. Let''s get you back on track.', 'Used in apps/web/components/not-found-content.tsx'),
  ('error.404.title_highlight', 'day off', 'Used in apps/web/components/not-found-content.tsx'),
  ('error.404.title_start', 'This page took a', 'Used in apps/web/components/not-found-content.tsx'),
  ('error.500.eyebrow', 'Something went wrong', 'Used in apps/web/app/error.tsx'),
  ('error.500.retry', 'Try again', 'Used in apps/web/app/error.tsx'),
  ('error.500.text', 'Please try again. If it keeps happening, message us and we will sort it out.', 'Used in apps/web/app/error.tsx'),
  ('error.500.title', 'We hit a small bump', 'Used in apps/web/app/error.tsx'),
  ('faq.contact_link', 'Talk to us', 'Used in apps/web/app/(site)/[slug]/get-started/page.tsx'),
  ('faq.more_questions', 'Still have a question?', 'Used in apps/web/components/sections/content-sections.tsx'),
  ('footer.company', 'Company', 'Used in apps/web/components/site/site-footer.tsx'),
  ('footer.label', 'Footer', 'Used in apps/web/components/site/site-footer.tsx'),
  ('footer.legal', 'Legal', 'Used in apps/web/components/site/site-footer.tsx'),
  ('footer.products', 'Products', 'Used in apps/web/components/site/site-footer.tsx'),
  ('form.back', 'Back', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('form.choose', 'Choose one', 'Used in packages/forms/src/form-field.tsx'),
  ('form.edit', 'Edit', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('form.error.choose_at_least', 'Choose at least {n}', 'Used in packages/forms/src/messages.ts'),
  ('form.error.choose_at_most', 'Choose at most {n}', 'Used in packages/forms/src/messages.ts'),
  ('form.error.email', 'Enter a valid email address', 'Used in apps/web/app/(auth)/actions.ts'),
  ('form.error.fix_fields', 'Please check the highlighted fields', 'Used in apps/web/app/(auth)/actions.ts'),
  ('form.error.generic', 'Something went wrong. Please try again, or message us on WhatsApp.', 'Used in apps/web/app/(site)/[slug]/get-started/actions.ts'),
  ('form.error.invalid_option', 'Choose one of the options', 'Used in packages/forms/src/messages.ts'),
  ('form.error.number', 'Enter a number', 'Used in packages/forms/src/messages.ts'),
  ('form.error.phone', 'Enter a valid phone number, like +94 77 123 4567', 'Used in apps/web/components/account/profile-form.tsx'),
  ('form.error.rate_limited', 'Too many messages. Please wait a few minutes and try again.', 'Used in apps/web/app/(site)/actions.ts'),
  ('form.error.required', 'Please fill this in', 'Used in apps/web/app/(site)/actions.ts'),
  ('form.error.too_large', 'Enter {n} or less', 'Used in packages/forms/src/messages.ts'),
  ('form.error.too_long', 'Use at most {n} characters', 'Used in packages/forms/src/messages.ts'),
  ('form.error.too_short', 'Use at least {n} characters', 'Used in packages/forms/src/messages.ts'),
  ('form.error.too_small', 'Enter {n} or more', 'Used in packages/forms/src/messages.ts'),
  ('form.error.url', 'Enter a full link, like https://example.com', 'Used in packages/forms/src/messages.ts'),
  ('form.next', 'Next', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('form.optional', 'Optional', 'Used in apps/web/components/account/cancel-order.tsx'),
  ('form.review', 'Review answers', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('hero.chat_customer', 'Customer', 'Used in apps/web/components/sections/content-sections.tsx'),
  ('hero.chat_label', 'Example WhatsApp conversation', 'Used in apps/web/components/sections/content-sections.tsx'),
  ('maintenance.text', 'We are making a few improvements. Please check back soon.', 'Used in apps/web/app/maintenance/page.tsx'),
  ('maintenance.title', 'We''ll be right back', 'Used in apps/web/app/maintenance/page.tsx'),
  ('nav.account', 'Account', 'Used in apps/web/components/site/user-menu.tsx'),
  ('nav.account_menu', 'Account menu', 'Used in apps/web/components/site/user-menu.tsx'),
  ('nav.all_products', 'All products', 'Used in apps/web/components/site/site-header.tsx'),
  ('nav.close_menu', 'Close menu', 'Used in apps/web/components/site/site-header.tsx'),
  ('nav.home', '{site} home', 'Used in apps/web/app/(auth)/layout.tsx'),
  ('nav.main', 'Main', 'Used in apps/web/components/site/site-header.tsx'),
  ('nav.my_products', 'My products', 'Used in apps/web/components/site/user-menu.tsx'),
  ('nav.open_menu', 'Open menu', 'Used in apps/web/components/site/site-header.tsx'),
  ('nav.profile', 'Profile', 'Used in apps/web/components/site/user-menu.tsx'),
  ('nav.sign_in', 'Sign in', 'Used in apps/web/components/site/user-menu.tsx'),
  ('nav.sign_out', 'Sign out', 'Used in apps/web/components/account/account-nav.tsx'),
  ('nav.skip', 'Skip to content', 'Used in apps/web/app/(site)/layout.tsx'),
  ('onboarding.billed_monthly', 'Billed monthly', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.billed_yearly', 'Billed yearly', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.change_package', 'Change package', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.change_package_text', 'Your answers stay as they are.', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.error.cycle', 'Yearly billing is not available for this package.', 'Used in apps/web/app/(site)/[slug]/get-started/actions.ts'),
  ('onboarding.error.package', 'That package is not available. Please choose another.', 'Used in apps/web/app/(site)/[slug]/get-started/actions.ts'),
  ('onboarding.error.signed_out', 'Your session has ended. Please sign in again.', 'Used in apps/web/app/(site)/[slug]/get-started/actions.ts'),
  ('onboarding.error.unavailable', 'This product cannot be ordered right now.', 'Used in apps/web/app/(site)/[slug]/get-started/actions.ts'),
  ('onboarding.existing_text', 'Request {ref} is still open. You can view it, or continue below to start another.', 'Used in apps/web/app/(site)/[slug]/get-started/page.tsx'),
  ('onboarding.existing_title', 'You already have a {name} request', 'Used in apps/web/app/(site)/[slug]/get-started/page.tsx'),
  ('onboarding.existing_view', 'View it', 'Used in apps/web/app/(site)/[slug]/get-started/page.tsx'),
  ('onboarding.meta_title', 'Set up {name}', 'Used in apps/web/app/(site)/[slug]/get-started/page.tsx'),
  ('onboarding.no_payment_now', 'No payment now. We review your request first and send you the payment details.', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.not_answered', 'Not answered', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.not_ready_text', 'Online sign-up for {name} opens soon. Talk to us and we will set it up for you.', 'Used in apps/web/app/(site)/[slug]/get-started/page.tsx'),
  ('onboarding.not_ready_title', 'Almost ready', 'Used in apps/web/app/(site)/[slug]/get-started/page.tsx'),
  ('onboarding.package_changed', 'Package updated', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.pay_yearly', 'Pay yearly', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.progress', 'Form progress', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.restored_text', 'We restored the answers you saved on this device.', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.restored_title', 'Welcome back', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.review_step', 'Review and submit', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.review_text', 'Make sure everything is right, then send your request.', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.review_title', 'Check your answers', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.selected_package', 'Selected package', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.start_over', 'Start over', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.step_of', 'Step {n} of {total}', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.submit', 'Submit request', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.summary', 'Your package', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('onboarding.use_package', 'Use this package', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('order.answers', 'Your answers', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.billing', 'Billing', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.cancel.button', 'Cancel request', 'Used in apps/web/components/account/cancel-order.tsx'),
  ('order.cancel.confirm', 'Request {ref} will be closed. You can always start a new one.', 'Used in apps/web/components/account/cancel-order.tsx'),
  ('order.cancel.done', 'Your request was cancelled.', 'Used in apps/web/app/(site)/account/actions.ts'),
  ('order.cancel.keep', 'Keep request', 'Used in apps/web/components/account/cancel-order.tsx'),
  ('order.cancel.not_allowed', 'This request can no longer be cancelled. Message us and we will help.', 'Used in apps/web/app/(site)/account/actions.ts'),
  ('order.cancel.reason', 'Reason', 'Used in apps/web/components/account/cancel-order.tsx'),
  ('order.cancel.submit', 'Yes, cancel it', 'Used in apps/web/components/account/cancel-order.tsx'),
  ('order.cancel.title', 'Cancel this request?', 'Used in apps/web/components/account/cancel-order.tsx'),
  ('order.closed_note', 'Message from the team', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.none', 'None', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.open_panel', 'Open {name} panel', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.package', 'Package', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.panel_pending', 'Your panel opens when setup is finished.', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.paused_note', 'Why it is paused', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.paused_since', 'Paused since', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.pay.amount', 'Amount due now: {amount} (setup fee and first period).', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.pay.no_instructions', 'We have sent the payment details to your email and WhatsApp.', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.pay.title', 'How to pay', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.payment.confirmed', 'Paid', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.payment.other', 'Payment', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('order.payment.pending', 'Being checked', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.payment.receipt', 'Receipt {number}', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.payment.refund', 'Refund', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('order.payment.refunded', 'Refunded', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.payment.setup', 'Setup and first period', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('order.payment.subscription', 'Subscription', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('order.payments', 'Payments', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.price', 'Price', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.proof.change', 'Choose another file', 'Used in apps/web/components/account/payment-proof-form.tsx'),
  ('order.proof.checking', 'Thank you. We are checking your payment from {date} and will confirm it soon.', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.proof.choose', 'Choose a photo or PDF of your payment slip.', 'Used in apps/web/components/account/payment-proof-form.tsx'),
  ('order.proof.done', 'Thank you. We will check your payment and confirm it soon.', 'Used in apps/web/app/(site)/account/actions.ts'),
  ('order.proof.file', 'Payment slip or screenshot', 'Used in apps/web/components/account/payment-proof-form.tsx'),
  ('order.proof.hint', 'JPG, PNG, WebP, HEIC or PDF, up to 5 MB.', 'Used in apps/web/components/account/payment-proof-form.tsx'),
  ('order.proof.none', 'No file chosen', 'Used in apps/web/components/account/payment-proof-form.tsx'),
  ('order.proof.not_waiting', 'This request is not waiting for a payment any more.', 'Used in apps/web/app/(site)/account/actions.ts'),
  ('order.proof.note', 'Note for us', 'Used in apps/web/components/account/payment-proof-form.tsx'),
  ('order.proof.pick', 'Choose file', 'Used in apps/web/components/account/payment-proof-form.tsx'),
  ('order.proof.received', 'Payment proof received', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.proof.reference', 'Payment reference', 'Used in apps/web/components/account/payment-proof-form.tsx'),
  ('order.proof.size', 'The file must be 5 MB or smaller.', 'Used in apps/web/app/(site)/account/actions.ts'),
  ('order.proof.submit', 'Send payment proof', 'Used in apps/web/components/account/payment-proof-form.tsx'),
  ('order.proof.title', 'Already paid? Send us the slip', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.proof.too_many', 'Too many uploads. Please try again later.', 'Used in apps/web/app/(site)/account/actions.ts'),
  ('order.proof.type', 'Upload a photo (JPG, PNG, WebP, HEIC) or a PDF.', 'Used in apps/web/app/(site)/account/actions.ts'),
  ('order.ref', 'Ref', 'Used in apps/web/components/account/order-card.tsx'),
  ('order.renews', 'Next payment due', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.setup', 'Your setup', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.setup_fee', 'Setup fee', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.started', 'Live since', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.submitted', 'Submitted', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.success.next', 'What happens next', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.success.ref', 'Your reference is', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.success.text', 'Thank you. We will review your details and message you within one working day.', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.success.title', 'Request received', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.success.whatsapp', 'Message us about {ref}', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.summary', 'Summary', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.timeline', 'Timeline', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('order.view_details', 'View details', 'Used in apps/web/components/account/order-card.tsx'),
  ('order.whatsapp_message', 'Hi, I have a question about my request {ref}.', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('pricing.billing', 'Billing', 'Used in apps/web/components/sections/pricing-table.tsx'),
  ('pricing.choose', 'Choose {name}', 'Used in apps/web/components/sections/form-sections.tsx'),
  ('pricing.included', 'Included:', 'Used in apps/web/components/sections/pricing-table.tsx'),
  ('pricing.monthly', 'Monthly', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('pricing.monthly_only', 'Monthly billing only', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('pricing.no_setup_fee', 'No setup fee', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('pricing.not_included', 'Not included:', 'Used in apps/web/components/sections/pricing-table.tsx'),
  ('pricing.per_month', '/ month', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('pricing.per_year', '/ year', 'Used in apps/web/app/(site)/account/products/[ref]/page.tsx'),
  ('pricing.plans', 'Plans', 'Used in apps/web/components/sections/pricing-table.tsx'),
  ('pricing.setup_fee', '+ {amount} one-time setup', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('pricing.unavailable', 'Not available right now', 'Used in apps/web/components/sections/pricing-table.tsx'),
  ('pricing.yearly', 'Yearly', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('pricing.yearly_badge', '2 months free', 'Used in apps/web/components/onboarding/onboarding-flow.tsx'),
  ('pricing.yearly_saving', 'You save {amount} a year', 'Used in apps/web/components/sections/form-sections.tsx'),
  ('product.from_price', 'From {price} a month', 'Used in apps/web/components/sections/content-sections.tsx'),
  ('product.join_waitlist', 'Join the waitlist', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('product.learn_more', 'Learn more', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('product.status.coming_soon', 'Coming soon', 'Used in apps/web/app/(site)/account/page.tsx'),
  ('product.status.live', 'Available now', 'Used in apps/web/components/sections/content-sections.tsx'),
  ('receipt.amount', 'Amount', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('receipt.back', 'Back to {ref}', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('receipt.billed_to', 'Billed to', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('receipt.date', 'Date paid', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('receipt.item', 'Description', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('receipt.method', 'Payment method', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('receipt.number', 'Receipt number', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('receipt.paid', 'Paid', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('receipt.print', 'Print or save as PDF', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('receipt.reference', 'Reference', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('receipt.refunded', 'Refunded', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('receipt.request', 'Request', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('receipt.title', 'Receipt', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('receipt.total', 'Total paid', 'Used in apps/web/app/(print)/account/receipts/[id]/page.tsx'),
  ('services.cta_link', 'Tell us about it', 'Used in apps/web/components/sections/content-sections.tsx'),
  ('services.cta_text', 'Have something in mind?', 'Used in apps/web/components/sections/content-sections.tsx'),
  ('theme.dark', 'Dark theme', 'Used in apps/web/app/(auth)/layout.tsx'),
  ('theme.light', 'Light theme', 'Used in apps/web/app/(auth)/layout.tsx'),
  ('theme.switch', 'Switch theme', 'Used in apps/web/app/(auth)/layout.tsx'),
  ('theme.system', 'System theme', 'Used in apps/web/app/(auth)/layout.tsx'),
  ('waitlist.already', 'You''re already on the list. We will email you when it opens.', 'Used in apps/web/app/(site)/actions.ts'),
  ('waitlist.email_label', 'Email address', 'Used in apps/web/components/sections/waitlist-form.tsx'),
  ('waitlist.placeholder', 'you@business.lk', 'Used in apps/web/components/sections/waitlist-form.tsx'),
  ('waitlist.privacy', 'One email when it launches. No spam.', 'Used in apps/web/components/sections/waitlist-form.tsx'),
  ('waitlist.submit', 'Join the waitlist', 'Used in apps/web/components/sections/waitlist-form.tsx'),
  ('waitlist.success', 'You''re on the list. We will email you when it opens.', 'Used in apps/web/app/(site)/actions.ts')
on conflict (key) do update set
  value = excluded.value,
  description = excluded.description;
-- @strings:end

-- Lingo: setup fields the team fills in, and the n8n setup action (off until a webhook is saved).
-- 0003_admin.sql adds the same rows when Lingo already exists; edits made in the admin are kept.
insert into public.product_service_fields
  (product_id, key, label, type, help_text, visible_to_customer, required_for_status, sort_order)
select p.id, v.key, v.label, v.type, v.help, v.visible, v.required_for, v.sort_order
from public.products p
join (values
  ('bot_name', 'Bot name', 'text', 'The name customers see in replies.', false, null, 1),
  ('whatsapp_phone_number_id', 'WhatsApp phone number ID', 'text', 'From Meta → WhatsApp → API setup.', false, 'active', 2),
  ('waba_id', 'WhatsApp Business Account ID', 'text', null, false, null, 3),
  ('meta_access_token', 'Meta access token', 'secret', 'Permanent system user token. Stored privately.', false, null, 4),
  ('n8n_workflow_id', 'n8n workflow ID', 'text', null, false, null, 5),
  ('go_live_date', 'Go-live date', 'date', 'Shown to the customer.', true, null, 6)
) as v (key, label, type, help, visible, required_for, sort_order) on true
where p.slug = 'lingo'
on conflict (product_id, key) do nothing;

insert into public.product_actions
  (product_id, key, label, description, allowed_statuses, min_roles, confirm_text, payload_fields, is_enabled, sort_order)
select p.id, 'start_setup', 'Start setup in n8n',
       'Sends the request, answers and setup fields to the Lingo setup workflow.',
       array['setting_up'], array['support', 'admin', 'owner'],
       'This sends the request details to the Lingo setup workflow in n8n.', '{}', false, 1
from public.products p
where p.slug = 'lingo'
on conflict (product_id, key) do nothing;

-- Lingo: link to the bot account for the customer panel (see 0004_lingo_panel.sql).
insert into public.product_service_fields
  (product_id, key, label, type, help_text, visible_to_customer, required_for_status, sort_order)
select p.id, 'lingo_account_id', 'Lingo account ID', 'number',
       'lingo_users.id of this business in the Lingo database. Links the customer''s panel (lingo.retexia.com) to their bot.',
       true, null, 0
from public.products p
where p.slug = 'lingo'
on conflict (product_id, key) do nothing;
