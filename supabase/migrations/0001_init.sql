-- =============================================================================
-- Retexia base website — initial schema
-- -----------------------------------------------------------------------------
-- Safe to run more than once: tables use "if not exists", functions use
-- "create or replace", and policies/triggers are dropped before they are made.
--
-- The Supabase table editor is the CMS. Every table and non-obvious column has
-- a comment so the editor explains itself.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Shared helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
comment on function public.set_updated_at() is 'Keeps updated_at current on every row update.';

-- Which role the API request is made with (anon, authenticated, service_role).
-- Returns 'service_role' when there is no API request at all (SQL editor,
-- table editor, migrations), because those are trusted owner sessions.
create or replace function public.request_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'service_role'
  );
$$;
comment on function public.request_role() is 'Role of the current API request; service_role when called from the dashboard or SQL editor.';

-- -----------------------------------------------------------------------------
-- 1. Customers: profiles (needed early by is_admin)
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  whatsapp text,
  business_name text,
  avatar_url text,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per signed-up person. Created automatically on sign-up. Set role = admin to make someone an admin.';
comment on column public.profiles.role is 'customer or admin. Admins can edit content through the API and see all orders. Only admins (or the dashboard) can change this.';
comment on column public.profiles.email is 'Copied from the login email. Change it through the account Security page, not here.';
comment on column public.profiles.whatsapp is 'WhatsApp number in international format, e.g. +94771234567.';
comment on column public.profiles.marketing_opt_in is 'True when the person agreed to receive product news by email.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;
comment on function public.is_admin() is 'True when the signed-in user has profiles.role = admin.';

-- True for trusted callers: the dashboard, the SQL editor, service role, or an admin.
create or replace function public.is_privileged()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.request_role() not in ('anon', 'authenticated') or public.is_admin();
$$;
comment on function public.is_privileged() is 'True for the dashboard, SQL editor, service role and admins.';

-- -----------------------------------------------------------------------------
-- 2. Site-wide content
-- -----------------------------------------------------------------------------

create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  site_name text not null default 'Retexia',
  tagline text,
  logo_url text,
  logo_dark_url text,
  favicon_url text,
  seo_title_template text not null default '%s · Retexia',
  seo_default_title text,
  seo_default_description text,
  og_image_url text,
  contact_email text,
  contact_phone text,
  whatsapp_number text,
  whatsapp_default_message text,
  address text,
  business_hours text,
  social_links jsonb not null default '[]'::jsonb,
  footer_text text,
  copyright_text text,
  announcement_enabled boolean not null default false,
  announcement_text text,
  announcement_href text,
  theme jsonb not null default '{}'::jsonb,
  default_theme text not null default 'system' check (default_theme in ('light', 'dark', 'system')),
  currency_code text not null default 'LKR',
  currency_locale text not null default 'en-LK',
  auth_google_enabled boolean not null default false,
  auth_magic_link_enabled boolean not null default true,
  maintenance_mode boolean not null default false,
  maintenance_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.site_settings is 'Exactly one row (id = 1) with site-wide settings: name, logo, contact details, theme, currency and switches.';
comment on column public.site_settings.logo_url is 'Public URL of the logo image (upload to the site-assets bucket). Empty = the site name is shown as text.';
comment on column public.site_settings.logo_dark_url is 'Optional logo for dark mode. Falls back to logo_url.';
comment on column public.site_settings.seo_title_template is 'Browser tab title pattern. %s is replaced with the page title, e.g. "%s · Retexia".';
comment on column public.site_settings.whatsapp_number is 'WhatsApp number in E.164 format, e.g. +94771234567. Used for all "Message us" buttons.';
comment on column public.site_settings.whatsapp_default_message is 'Text pre-filled when someone taps a WhatsApp button.';
comment on column public.site_settings.social_links is 'List of social links: [{"platform": "facebook", "url": "https://..."}]. Platforms: facebook, instagram, linkedin, youtube, tiktok, x.';
comment on column public.site_settings.announcement_enabled is 'Show the thin announcement bar above the navigation.';
comment on column public.site_settings.theme is 'Design token overrides, e.g. {"brand": {"light": "#2a68d9", "dark": "#7aaeff"}, "radius-lg": "20px"}. Invalid values are ignored.';
comment on column public.site_settings.default_theme is 'light, dark or system. Visitors can still switch.';
comment on column public.site_settings.currency_code is 'ISO currency code used when a package has no own currency, e.g. LKR.';
comment on column public.site_settings.currency_locale is 'Locale used to format prices, e.g. en-LK.';
comment on column public.site_settings.auth_google_enabled is 'Show "Continue with Google" on sign-in. Enable the Google provider in Supabase Auth first.';
comment on column public.site_settings.auth_magic_link_enabled is 'Allow sign-in with an email link (no password).';
comment on column public.site_settings.maintenance_mode is 'When true, everyone except admins sees the maintenance page. Takes up to a minute to apply.';

create table if not exists public.site_strings (
  key text primary key,
  value text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.site_strings is 'All small UI texts (buttons, form messages, errors, empty states). Edit value to change the text on the site. Missing keys fall back to the text in the code.';
comment on column public.site_strings.key is 'Where the text is used, e.g. auth.login.title. Do not rename keys.';
comment on column public.site_strings.value is 'The text shown. {name}-style placeholders are filled in by the site.';

-- -----------------------------------------------------------------------------
-- 3. Products and packages
-- -----------------------------------------------------------------------------

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  code text not null unique check (code ~ '^[A-Z]{3}$'),
  name text not null,
  short_name text not null,
  tagline text,
  description text,
  icon text,
  color_light text not null default '#2a68d9',
  color_dark text not null default '#7aaeff',
  color_soft_light text not null default '#eaf1fd',
  color_soft_dark text not null default '#14254a',
  status text not null default 'hidden' check (status in ('live', 'coming_soon', 'hidden')),
  page_slug text,
  panel_url text,
  panel_live boolean not null default false,
  onboarding_form_id uuid,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.products is 'Every product Retexia sells (Lingo, Post, ...). Adding a row here (plus packages, a page and a form) adds a product to the site.';
comment on column public.products.slug is 'Short lowercase id used in URLs and CSS, e.g. lingo.';
comment on column public.products.code is 'Three capital letters used in order references, e.g. LNG → LNG-2026-0001.';
comment on column public.products.name is 'Full name, e.g. Retexia Lingo.';
comment on column public.products.short_name is 'Short name used inside the account area, e.g. Lingo.';
comment on column public.products.description is 'Longer description (markdown).';
comment on column public.products.icon is 'Lucide icon name, e.g. message-circle. See lucide.dev/icons.';
comment on column public.products.color_light is 'Product colour on light backgrounds. Needs 4.5:1 contrast on white and on color_soft_light.';
comment on column public.products.color_dark is 'Product colour on dark backgrounds.';
comment on column public.products.color_soft_light is 'Soft tint behind product-coloured text (light mode).';
comment on column public.products.color_soft_dark is 'Soft tint behind product-coloured text (dark mode).';
comment on column public.products.status is 'live = can be ordered, coming_soon = shown with a waitlist, hidden = not shown anywhere.';
comment on column public.products.page_slug is 'Slug of the marketing page in pages (usually the same as slug). Also used for /<page_slug>/get-started.';
comment on column public.products.panel_url is 'Where the product''s own panel lives, e.g. https://lingo.retexia.com/account.';
comment on column public.products.panel_live is 'Turn on when the product panel is ready. Until then customers see "Your panel opens when setup is finished".';
comment on column public.products.onboarding_form_id is 'The form customers fill in after choosing a package (forms.id).';
comment on column public.products.is_visible is 'Extra on/off switch. status = hidden does the same.';

create table if not exists public.product_features (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  icon text,
  title text not null,
  description text,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.product_features is 'Feature list of a product. Shown by a "features" page section with content.source = "product".';
comment on column public.product_features.icon is 'Lucide icon name, e.g. clock.';

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name text not null,
  tagline text,
  description text,
  price_monthly numeric(12, 2) not null default 0 check (price_monthly >= 0),
  price_yearly numeric(12, 2) check (price_yearly >= 0),
  setup_fee numeric(12, 2) not null default 0 check (setup_fee >= 0),
  currency text,
  price_note text,
  badge text,
  is_featured boolean not null default false,
  cta_label text,
  fine_print text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, slug)
);
comment on table public.packages is 'Price plans of a product (e.g. Lingo Core, Pro, Supreme). Prices here are copied into each order when it is placed.';
comment on column public.packages.slug is 'Short id used in links, e.g. pro → /lingo/get-started?package=pro.';
comment on column public.packages.price_yearly is 'Price for a full year. Empty = yearly billing not offered.';
comment on column public.packages.setup_fee is 'One-time setup fee. 0 = none.';
comment on column public.packages.currency is 'ISO code like LKR or USD. Empty = site_settings.currency_code.';
comment on column public.packages.price_note is 'Small text after the price, e.g. "per month".';
comment on column public.packages.badge is 'Small label on the card, e.g. "Most popular".';
comment on column public.packages.is_featured is 'Highlights the card (brand border and soft background).';
comment on column public.packages.fine_print is 'Small print shown under the pricing cards.';
comment on column public.packages.is_active is 'false = shown but cannot be ordered (button disabled).';
comment on column public.packages.is_visible is 'false = hidden from the pricing table.';

create table if not exists public.package_features (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id) on delete cascade,
  label text not null,
  included boolean not null default true,
  tooltip text,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.package_features is 'The checklist on each pricing card.';
comment on column public.package_features.included is 'false renders the row muted with a cross ("not included").';
comment on column public.package_features.tooltip is 'Optional extra explanation shown on hover/focus.';

-- -----------------------------------------------------------------------------
-- 4. Pages and sections (the page builder)
-- -----------------------------------------------------------------------------

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug = '' or slug ~ '^[a-z0-9][a-z0-9-]*$')
    check (slug not in ('account', 'login', 'signup', 'auth', 'api', 'forgot-password', 'reset-password', 'maintenance', 'styleguide', '_styleguide', 'sitemap.xml', 'robots.txt', 'opengraph-image')),
  title text not null,
  seo_title text,
  seo_description text,
  og_image_url text,
  product_id uuid references public.products (id) on delete set null,
  is_published boolean not null default true,
  show_in_sitemap boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.pages is 'Every page on the site. slug '''' is the home page; slug lingo is /lingo. Content lives in page_sections.';
comment on column public.pages.slug is 'URL path without slashes. Empty = home page. Reserved words like account or login are not allowed.';
comment on column public.pages.seo_title is 'Browser tab / Google title. Empty = title.';
comment on column public.pages.product_id is 'Set this to make it a product page: the product colour becomes the accent.';
comment on column public.pages.is_published is 'false = the page returns 404.';

create table if not exists public.page_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  type text not null check (type in ('hero', 'features', 'products', 'services', 'steps', 'about', 'pricing', 'faq', 'testimonials', 'cta', 'contact', 'waitlist', 'rich_text', 'image_text')),
  anchor text check (anchor is null or anchor ~ '^[a-z0-9][a-z0-9-]*$'),
  background text not null default 'surface' check (background in ('surface', 'sunk')),
  eyebrow text,
  title text,
  highlight text,
  subtitle text,
  content jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.page_sections is 'The blocks a page is made of, top to bottom by sort_order. See docs/EDITING_CONTENT.md for every type and its content JSON.';
comment on column public.page_sections.type is 'hero, features, products, services, steps, about, pricing, faq, testimonials, cta, contact, waitlist, rich_text or image_text.';
comment on column public.page_sections.anchor is 'Optional id for links like /#about (write just: about).';
comment on column public.page_sections.background is 'surface (white) or sunk (soft grey-blue band).';
comment on column public.page_sections.eyebrow is 'Small uppercase line above the title.';
comment on column public.page_sections.highlight is 'Word(s) of the title shown in the accent colour. Must appear exactly in the title.';
comment on column public.page_sections.content is 'Type-specific settings as JSON. Invalid JSON for the type hides the section (it never breaks the page).';

-- -----------------------------------------------------------------------------
-- 5. Other content lists
-- -----------------------------------------------------------------------------

create table if not exists public.navigation_items (
  id uuid primary key default gen_random_uuid(),
  location text not null check (location in ('header', 'footer_products', 'footer_company', 'footer_legal')),
  label text not null,
  href text,
  kind text not null default 'link' check (kind in ('link', 'products_menu', 'button')),
  open_in_new_tab boolean not null default false,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.navigation_items is 'Links in the header and footer.';
comment on column public.navigation_items.location is 'header, footer_products, footer_company or footer_legal.';
comment on column public.navigation_items.kind is 'link = normal link, button = pill button (header), products_menu = dropdown of all visible products (href not needed).';

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  icon text,
  href text,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.services is 'Custom services shown in the "services" section on the home page.';
comment on column public.services.icon is 'Lucide icon name, e.g. globe.';
comment on column public.services.href is 'Optional link for the card.';

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text not null,
  author_name text not null,
  author_role text,
  company text,
  avatar_url text,
  product_id uuid references public.products (id) on delete set null,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.testimonials is 'Real customer quotes only. The testimonials section hides itself while this table is empty.';
comment on column public.testimonials.product_id is 'Optional: show this quote on that product''s page.';

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.faqs is 'Questions and answers. product_id empty = general FAQ (home page).';
comment on column public.faqs.answer is 'Answer text (markdown allowed: **bold**, links, lists).';

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  phone text check (phone is null or char_length(phone) <= 40),
  business_name text check (business_name is null or char_length(business_name) <= 200),
  subject text check (subject is null or char_length(subject) <= 200),
  message text not null check (char_length(message) between 1 and 5000),
  product_id uuid references public.products (id) on delete set null,
  source_path text,
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'read', 'replied', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.contact_messages is 'Messages sent through the contact forms. Change status as you handle them.';
comment on column public.contact_messages.source_path is 'Page the message was sent from.';
comment on column public.contact_messages.status is 'new, read, replied or archived.';

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, email)
);
comment on table public.waitlist is 'People who asked to hear when a coming-soon product launches.';

-- -----------------------------------------------------------------------------
-- 6. Onboarding forms (generic, reused by every product)
-- -----------------------------------------------------------------------------

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  product_id uuid references public.products (id) on delete cascade,
  title text not null,
  description text,
  submit_label text,
  success_title text,
  success_message text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.forms is 'Onboarding forms. A product points to its form with products.onboarding_form_id.';
comment on column public.forms.version is 'Bump this number when you change the questions. Each order remembers the version it was made with.';

create table if not exists public.form_steps (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  step_number int not null default 1,
  title text not null,
  description text,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.form_steps is 'Steps of a form (shown in the progress bar).';

create table if not exists public.form_fields (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.form_steps (id) on delete cascade,
  form_id uuid references public.forms (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  type text not null check (type in ('text', 'textarea', 'email', 'phone', 'number', 'url', 'select', 'radio', 'radio_cards', 'checkbox_group', 'checkbox', 'toggle')),
  placeholder text,
  help_text text,
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  min numeric,
  max numeric,
  default_value text,
  show_if jsonb,
  width text not null default 'full' check (width in ('full', 'half')),
  prefill_from text check (prefill_from is null or prefill_from in ('profile.full_name', 'profile.phone', 'profile.whatsapp', 'profile.business_name', 'user.email')),
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_id, key)
);
comment on table public.form_fields is 'Questions of a form step. Changing them changes the form on the site.';
comment on column public.form_fields.form_id is 'Filled in automatically from the step. Leave empty.';
comment on column public.form_fields.key is 'Stable id of the answer, lowercase_with_underscores. Unique within a form.';
comment on column public.form_fields.type is 'text, textarea, email, phone, number, url, select, radio, radio_cards, checkbox_group, checkbox or toggle.';
comment on column public.form_fields.options is 'Choices for select/radio/radio_cards/checkbox_group: [{"value": "a", "label": "A", "description": "optional"}].';
comment on column public.form_fields.min is 'number: lowest value. text: fewest characters. checkbox_group: fewest choices.';
comment on column public.form_fields.max is 'number: highest value. text: most characters. checkbox_group: most choices.';
comment on column public.form_fields.default_value is 'Starting value. checkbox_group: comma separated values. checkbox/toggle: true or false.';
comment on column public.form_fields.show_if is 'Only show when another answer matches: {"field": "business_type", "in": ["products", "both"]} or {"field": "industry", "equals": "other"}.';
comment on column public.form_fields.width is 'full or half (two half fields sit side by side on wide screens).';
comment on column public.form_fields.prefill_from is 'Fill in from the customer''s profile: profile.full_name, profile.phone, profile.whatsapp, profile.business_name or user.email.';

-- products.onboarding_form_id → forms.id (added here because forms comes after products)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_onboarding_form_id_fkey') then
    alter table public.products
      add constraint products_onboarding_form_id_fkey
      foreign key (onboarding_form_id) references public.forms (id) on delete set null;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Orders
-- -----------------------------------------------------------------------------

create table if not exists public.order_statuses (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  description text,
  tone text not null default 'neutral' check (tone in ('neutral', 'brand', 'success', 'warning', 'danger')),
  is_final boolean not null default false,
  customer_can_cancel boolean not null default false,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.order_statuses is 'The steps an order goes through. Labels and descriptions are shown to customers.';
comment on column public.order_statuses.tone is 'Badge colour: neutral, brand, success, warning or danger.';
comment on column public.order_statuses.is_final is 'true = the order is closed (no more steps).';
comment on column public.order_statuses.customer_can_cancel is 'true = the customer may cancel while the order has this status.';

create table if not exists public.order_counters (
  product_id uuid not null references public.products (id) on delete cascade,
  year int not null,
  last_value int not null default 0,
  primary key (product_id, year)
);
comment on table public.order_counters is 'Internal: last order number per product per year (for refs like LNG-2026-0001). Do not edit.';

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  ref text unique,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  package_id uuid not null references public.packages (id) on delete restrict,
  status text not null default 'submitted' references public.order_statuses (key) on update cascade,
  status_note text,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  package_name text,
  price_amount numeric(12, 2),
  setup_fee numeric(12, 2),
  currency text,
  answers jsonb not null default '[]'::jsonb,
  form_id uuid references public.forms (id) on delete set null,
  form_version int,
  customer_note text check (customer_note is null or char_length(customer_note) <= 2000),
  admin_note text,
  starts_at timestamptz,
  renews_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.orders is 'Customer requests and subscriptions. Change status here to move an order forward; the customer sees each change on their timeline.';
comment on column public.orders.ref is 'Order reference, generated automatically (e.g. LNG-2026-0001).';
comment on column public.orders.status is 'Current status (see order_statuses).';
comment on column public.orders.status_note is 'Optional message to the customer. Set it in the same edit as a status change and it appears on their timeline.';
comment on column public.orders.package_name is 'Snapshot of the package name when ordered (filled automatically).';
comment on column public.orders.price_amount is 'Snapshot of the monthly or yearly price when ordered (filled automatically).';
comment on column public.orders.setup_fee is 'Snapshot of the setup fee when ordered (filled automatically).';
comment on column public.orders.answers is 'The onboarding answers: [{"key", "label", "value", "display_value", "step"}]. Kept readable even if the form changes later.';
comment on column public.orders.form_version is 'forms.version at the time of ordering.';
comment on column public.orders.admin_note is 'Private note for the Retexia team. Never shown to the customer.';

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.order_events is 'Order timeline, written automatically when an order status changes. You can edit note (shown to the customer).';
comment on column public.order_events.note is 'Shown to the customer on their timeline.';

-- -----------------------------------------------------------------------------
-- 8. Indexes
-- -----------------------------------------------------------------------------

create index if not exists product_features_product_id_idx on public.product_features (product_id, sort_order);
create index if not exists packages_product_id_idx on public.packages (product_id, sort_order);
create index if not exists package_features_package_id_idx on public.package_features (package_id, sort_order);
create index if not exists products_onboarding_form_id_idx on public.products (onboarding_form_id);
create index if not exists products_slug_idx on public.products (slug);
create index if not exists products_page_slug_idx on public.products (page_slug);
create index if not exists pages_slug_idx on public.pages (slug);
create index if not exists pages_product_id_idx on public.pages (product_id);
create index if not exists page_sections_page_id_sort_idx on public.page_sections (page_id, sort_order);
create index if not exists navigation_items_location_idx on public.navigation_items (location, sort_order);
create index if not exists testimonials_product_id_idx on public.testimonials (product_id);
create index if not exists faqs_product_id_idx on public.faqs (product_id, sort_order);
create index if not exists contact_messages_product_id_idx on public.contact_messages (product_id);
create index if not exists contact_messages_user_id_idx on public.contact_messages (user_id);
create index if not exists contact_messages_status_idx on public.contact_messages (status, created_at desc);
create index if not exists waitlist_product_id_idx on public.waitlist (product_id);
create index if not exists waitlist_user_id_idx on public.waitlist (user_id);
create index if not exists forms_product_id_idx on public.forms (product_id);
create index if not exists form_steps_form_id_idx on public.form_steps (form_id, sort_order);
create index if not exists form_fields_step_id_idx on public.form_fields (step_id, sort_order);
create index if not exists form_fields_form_id_idx on public.form_fields (form_id);
create index if not exists order_counters_product_id_idx on public.order_counters (product_id);
create index if not exists orders_user_id_created_idx on public.orders (user_id, created_at desc);
create index if not exists orders_product_id_idx on public.orders (product_id);
create index if not exists orders_package_id_idx on public.orders (package_id);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_form_id_idx on public.orders (form_id);
create index if not exists order_events_order_id_idx on public.order_events (order_id, created_at);
create index if not exists order_events_created_by_idx on public.order_events (created_by);

-- -----------------------------------------------------------------------------
-- 9. Triggers and functions
-- -----------------------------------------------------------------------------

-- updated_at on every table that has the column
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'site_settings', 'site_strings', 'products', 'product_features', 'packages',
    'package_features', 'pages', 'page_sections', 'navigation_items', 'services', 'testimonials',
    'faqs', 'contact_messages', 'waitlist', 'forms', 'form_steps', 'form_fields', 'order_statuses',
    'orders', 'order_events'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- New auth user → profile row
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
comment on function public.handle_new_user() is 'Creates a profiles row for every new sign-up.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Login email changed → keep profiles.email in sync
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Customers can edit their profile, but never their role or login email.
-- Security invoker on purpose: current_user is the API role for customer requests.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'You cannot change your role' using errcode = '42501';
    end if;
    new.id := old.id;
    new.email := old.email;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- form_fields.form_id follows its step
create or replace function public.set_form_field_form_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select form_id into new.form_id from public.form_steps where id = new.step_id;
  return new;
end;
$$;

drop trigger if exists set_form_field_form_id on public.form_fields;
create trigger set_form_field_form_id
  before insert or update of step_id, form_id on public.form_fields
  for each row execute function public.set_form_field_form_id();

-- Waitlist emails are stored lowercase so duplicates are caught
create or replace function public.normalize_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists normalize_email on public.waitlist;
create trigger normalize_email
  before insert or update of email on public.waitlist
  for each row execute function public.normalize_email();

drop trigger if exists normalize_email on public.contact_messages;
create trigger normalize_email
  before insert or update of email on public.contact_messages
  for each row execute function public.normalize_email();

-- Before an order is inserted: fix ownership and status, snapshot the price,
-- generate the reference. Security definer so it can read inactive packages and
-- bump order_counters, which customers cannot touch.
create or replace function public.prepare_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_privileged boolean := public.is_privileged();
  v_package public.packages%rowtype;
  v_product public.products%rowtype;
  v_year int := extract(year from now())::int;
  v_number int;
  v_price numeric(12, 2);
begin
  if not v_privileged then
    new.user_id := auth.uid();
    if new.user_id is null then
      raise exception 'Please sign in first' using errcode = '42501';
    end if;
    new.status := 'submitted';
    new.status_note := null;
    new.admin_note := null;
    new.starts_at := null;
    new.renews_at := null;
    new.cancelled_at := null;
    new.price_amount := null;
    new.setup_fee := null;
    new.currency := null;
    new.package_name := null;
  end if;

  new.status := coalesce(new.status, 'submitted');
  new.billing_cycle := coalesce(new.billing_cycle, 'monthly');

  select * into v_package from public.packages where id = new.package_id;
  if not found or v_package.product_id is distinct from new.product_id then
    raise exception 'That package does not belong to this product' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = new.product_id;
  if not v_privileged then
    if v_product.status <> 'live' or not v_product.is_visible then
      raise exception 'This product cannot be ordered yet' using errcode = '22023';
    end if;
    if not v_package.is_active or not v_package.is_visible then
      raise exception 'This package cannot be ordered right now' using errcode = '22023';
    end if;
  end if;

  if new.billing_cycle = 'yearly' then
    if v_package.price_yearly is null then
      raise exception 'Yearly billing is not available for this package' using errcode = '22023';
    end if;
    v_price := v_package.price_yearly;
  else
    v_price := v_package.price_monthly;
  end if;

  new.package_name := coalesce(new.package_name, v_package.name);
  new.price_amount := coalesce(new.price_amount, v_price);
  new.setup_fee := coalesce(new.setup_fee, v_package.setup_fee);
  new.currency := coalesce(
    new.currency,
    v_package.currency,
    (select currency_code from public.site_settings where id = 1),
    'LKR'
  );

  if new.form_id is not null then
    new.form_version := (select version from public.forms where id = new.form_id);
  end if;

  insert into public.order_counters (product_id, year, last_value)
  values (new.product_id, v_year, 1)
  on conflict (product_id, year)
  do update set last_value = public.order_counters.last_value + 1
  returning last_value into v_number;

  new.ref := v_product.code || '-' || v_year || '-' || lpad(v_number::text, 4, '0');
  return new;
end;
$$;
comment on function public.prepare_order() is 'Sets owner, status, price snapshot and reference on every new order. The browser can never choose these.';

drop trigger if exists prepare_order on public.orders;
create trigger prepare_order
  before insert on public.orders
  for each row execute function public.prepare_order();

-- Customers can never update orders directly (cancel_order() is the only way).
-- Security invoker on purpose: inside cancel_order() current_user is the owner.
create or replace function public.guard_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'Orders can only be changed by the Retexia team' using errcode = '42501';
  end if;
  new.id := old.id;
  new.ref := old.ref;
  new.created_at := old.created_at;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists guard_order_update on public.orders;
create trigger guard_order_update
  before update on public.orders
  for each row execute function public.guard_order_update();

-- Write a timeline event for every new order and every status change
create or replace function public.log_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, from_status, to_status, note, created_by)
    values (new.id, null, new.status, new.status_note, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.order_events (order_id, from_status, to_status, note, created_by)
    values (
      new.id,
      old.status,
      new.status,
      case when new.status_note is distinct from old.status_note then new.status_note end,
      auth.uid()
    );
  end if;
  return null;
end;
$$;

drop trigger if exists log_order_event on public.orders;
create trigger log_order_event
  after insert or update of status on public.orders
  for each row execute function public.log_order_event();

-- Customer cancels their own order, only while the status allows it
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_can_cancel boolean;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
begin
  if auth.uid() is null then
    raise exception 'Please sign in first' using errcode = '42501';
  end if;

  select o.status, s.customer_can_cancel
    into v_status, v_can_cancel
    from public.orders o
    join public.order_statuses s on s.key = o.status
   where o.id = p_order_id and o.user_id = auth.uid()
   for update of o;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if not v_can_cancel then
    raise exception 'This request can no longer be cancelled' using errcode = 'P0001';
  end if;

  update public.orders
     set status = 'cancelled',
         cancelled_at = now(),
         status_note = 'Cancelled by you' || coalesce(': ' || v_reason, '')
   where id = p_order_id;

  return 'cancelled';
end;
$$;
comment on function public.cancel_order(uuid, text) is 'Lets a customer cancel their own order while order_statuses.customer_can_cancel is true.';

revoke execute on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Row Level Security
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'site_settings', 'site_strings', 'products', 'product_features', 'packages',
    'package_features', 'pages', 'page_sections', 'navigation_items', 'services', 'testimonials',
    'faqs', 'contact_messages', 'waitlist', 'forms', 'form_steps', 'form_fields', 'order_statuses',
    'order_counters', 'orders', 'order_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Content tables: everyone reads what is visible; only admins write.
-- (The dashboard uses the service role and bypasses RLS.)
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('site_settings', 'true'),
      ('site_strings', 'true'),
      ('navigation_items', 'is_visible'),
      ('pages', 'is_published'),
      ('page_sections', 'is_visible and exists (select 1 from public.pages p where p.id = page_id and p.is_published)'),
      ('services', 'is_visible'),
      ('testimonials', 'is_visible'),
      ('faqs', 'is_visible'),
      ('products', 'is_visible and status <> ''hidden'''),
      ('product_features', 'is_visible'),
      ('packages', 'is_visible'),
      ('package_features', 'is_visible'),
      ('forms', 'true'),
      ('form_steps', 'is_visible'),
      ('form_fields', 'is_visible'),
      ('order_statuses', 'true')
    ) as v (tbl, cond)
  loop
    execute format('drop policy if exists "Public can read" on public.%I', r.tbl);
    execute format(
      'create policy "Public can read" on public.%I for select to anon, authenticated using (%s or (select public.is_admin()))',
      r.tbl, r.cond
    );
    execute format('drop policy if exists "Admins can write" on public.%I', r.tbl);
    execute format(
      'create policy "Admins can write" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      r.tbl
    );
  end loop;
end;
$$;

-- profiles
drop policy if exists "Owner can read own profile" on public.profiles;
create policy "Owner can read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Owner can update own profile" on public.profiles;
create policy "Owner can update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Admins can manage profiles" on public.profiles;
create policy "Admins can manage profiles" on public.profiles
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- orders
drop policy if exists "Owner can read own orders" on public.orders;
create policy "Owner can read own orders" on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Owner can place orders" on public.orders;
create policy "Owner can place orders" on public.orders
  for insert to authenticated
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Admins can manage orders" on public.orders;
create policy "Admins can manage orders" on public.orders
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Customers must never see admin_note: only these columns are readable/insertable
-- through the API. (Dashboard and admins with the service role still see all.)
revoke all on public.orders from anon, authenticated;
grant select (
  id, ref, user_id, product_id, package_id, status, status_note, billing_cycle, package_name,
  price_amount, setup_fee, currency, answers, form_id, form_version, customer_note, starts_at,
  renews_at, cancelled_at, created_at, updated_at
) on public.orders to authenticated;
grant insert (product_id, package_id, billing_cycle, answers, form_id, customer_note)
  on public.orders to authenticated;
grant update (status, status_note, starts_at, renews_at, cancelled_at, admin_note, customer_note)
  on public.orders to authenticated; -- only admins pass RLS + the guard trigger

-- order_events
drop policy if exists "Owner can read own order events" on public.order_events;
create policy "Owner can read own order events" on public.order_events
  for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
    or (select public.is_admin())
  );

drop policy if exists "Admins can manage order events" on public.order_events;
create policy "Admins can manage order events" on public.order_events
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- order_counters: no policies → only security definer functions can use it
revoke all on public.order_counters from anon, authenticated;

-- contact_messages and waitlist: anyone may add, only admins read
drop policy if exists "Anyone can send a message" on public.contact_messages;
create policy "Anyone can send a message" on public.contact_messages
  for insert to anon, authenticated
  with check (status = 'new' and (user_id is null or user_id = (select auth.uid())));

drop policy if exists "Admins can manage messages" on public.contact_messages;
create policy "Admins can manage messages" on public.contact_messages
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Anyone can join a waitlist" on public.waitlist;
create policy "Anyone can join a waitlist" on public.waitlist
  for insert to anon, authenticated
  with check (
    (user_id is null or user_id = (select auth.uid()))
    and exists (select 1 from public.products p where p.id = product_id and p.status = 'coming_soon')
  );

drop policy if exists "Admins can manage waitlist" on public.waitlist;
create policy "Admins can manage waitlist" on public.waitlist
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- 11. Storage: public bucket for logos, images and OG images
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "site-assets: public read" on storage.objects;
create policy "site-assets: public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'site-assets');

drop policy if exists "site-assets: admin insert" on storage.objects;
create policy "site-assets: admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-assets' and (select public.is_admin()));

drop policy if exists "site-assets: admin update" on storage.objects;
create policy "site-assets: admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-assets' and (select public.is_admin()))
  with check (bucket_id = 'site-assets' and (select public.is_admin()));

drop policy if exists "site-assets: admin delete" on storage.objects;
create policy "site-assets: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-assets' and (select public.is_admin()));
