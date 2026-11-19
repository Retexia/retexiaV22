-- =====================================================================
-- 0036: Retexia Feeder → Autopublish (free).
--
-- feeder.retexia.com/autopublish: a customer drops 1–10 videos or images,
-- picks one of their Feeder products and a template, sees exactly what will
-- be created, and presses Launch. Retexia builds the campaigns, ad sets, ads
-- and the Instant Form on Meta (Facebook / Instagram) and TikTok, everything
-- PAUSED until the last step, then watches the platform review.
--
-- Every lead form is named after the product's form name (My products), so
-- Bulk create v2 puts every lead on the right product.
--
--   feeder.ad_accounts      the customer's ad account, Page, Instagram, Pixel,
--                           TikTok advertiser; connected only after Retexia
--                           confirms the access (admin → Feeder → Ad accounts)
--   feeder.ad_templates     reusable launch settings (structure is data)
--   feeder.ad_launches      one launch: frozen snapshot + state
--   feeder.ad_creatives     its files (Storage bucket "autopublish")
--   feeder.ad_nodes         the plan tree per platform: media, form,
--                           campaign, ad set, creative, ad (one small,
--                           idempotent step each; IDs saved at once)
--   feeder.ad_slots         evergreen campaigns reused by daily launches
--   feeder.ad_lead_forms    forms used per product (made by Retexia or picked)
--   feeder.ad_events        the timeline shown on each launch
--   feeder.ad_error_catalog platform errors → plain messages and what to do
--
-- Platform calls go through the n8n workflow "Retexia — Feeder Autopublish"
-- (n8n/feeder-autopublish.json); the Meta and TikTok tokens live only in
-- n8n credentials. The panel decides; pg_cron wakes it every minute when
-- something is due. Customers read their own rows; all writes go through
-- feeder.retexia.com (service role). Safe to run again. Run after 0028.
-- =====================================================================

create schema if not exists feeder;

-- ---------------------------------------------------------------------
-- The package: Autopublish, free for every Retexia account.
-- ---------------------------------------------------------------------
insert into public.packages (product_id, slug, name, tagline, description, price_monthly, price_yearly, setup_fee, badge, cta_label, is_active, is_visible, sort_order)
select p.id, 'autopublish', 'Autopublish',
       'Your product ads on Facebook, Instagram and TikTok in one click',
       'Drop your videos or images, pick a product and a template, check the preview and press Launch. Retexia builds the campaign, ad sets, ads and the lead form, named after your product''s form name, so every lead lands on the right product in Bulk create.',
       0, null, 0, 'Free', 'Open Autopublish', true, true,
       coalesce((select max(sort_order) + 1 from public.packages where product_id = p.id), 1)
  from public.products p
 where p.slug = 'feeder'
on conflict (product_id, slug) do update
   set name = excluded.name, tagline = excluded.tagline, description = excluded.description,
       price_monthly = 0, price_yearly = null, setup_fee = 0, badge = excluded.badge, cta_label = excluded.cta_label,
       is_active = true, is_visible = true, updated_at = now();

delete from public.package_features
 where package_id = (select k.id from public.packages k join public.products p on p.id = k.product_id where p.slug = 'feeder' and k.slug = 'autopublish');
insert into public.package_features (package_id, label, sort_order)
select k.id, f.label, f.n
  from public.packages k
  join public.products p on p.id = k.product_id and p.slug = 'feeder'
  cross join (values
    (1, 'Facebook, Instagram and TikTok ads from 1–10 videos or images'),
    (2, 'Templates: one ad set, an ad set per creative, per audience, evergreen campaigns and more'),
    (3, 'A preview of exactly what will be made, with the total daily budget'),
    (4, 'Lead forms named after your product, so Bulk create matches every lead'),
    (5, 'Checks before anything is created; everything starts paused'),
    (6, 'Review watched for you: plain reasons and Fix & resubmit')
  ) as f(n, label)
 where k.slug = 'autopublish';

-- ---------------------------------------------------------------------
-- Ad accounts (one row per customer)
-- ---------------------------------------------------------------------
create table if not exists feeder.ad_accounts (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  meta_ad_account_id    text check (meta_ad_account_id ~ '^[0-9]{5,25}$'),
  meta_page_id          text check (meta_page_id ~ '^[0-9]{5,25}$'),
  meta_instagram_id     text check (meta_instagram_id ~ '^[0-9]{5,25}$'),
  meta_pixel_id         text check (meta_pixel_id ~ '^[0-9]{5,25}$'),
  meta_whatsapp         text check (meta_whatsapp ~ '^[0-9]{9,15}$'),
  meta_status           text not null default 'none' check (meta_status in ('none', 'requested', 'connected', 'problem')),
  meta_info             jsonb not null default '{}'::jsonb,
  tiktok_advertiser_id  text check (tiktok_advertiser_id ~ '^[0-9]{5,25}$'),
  tiktok_identity_id    text check (char_length(tiktok_identity_id) between 1 and 100),
  tiktok_identity_type  text check (tiktok_identity_type in ('TT_USER', 'BC_AUTH_TT', 'CUSTOMIZED_USER', 'AUTH_CODE')),
  tiktok_status         text not null default 'none' check (tiktok_status in ('none', 'requested', 'connected', 'problem')),
  tiktok_info           jsonb not null default '{}'::jsonb,
  currency              text not null default 'LKR' check (currency ~ '^[A-Z]{3}$'),
  timezone              text not null default 'Asia/Colombo' check (char_length(timezone) between 3 and 60),
  max_daily_spend       numeric(14, 2) check (max_daily_spend > 0),
  privacy_policy_url    text check (char_length(privacy_policy_url) <= 500 and privacy_policy_url ~ '^https://[^[:space:]]{4,}$'),
  approval_required     boolean not null default false,
  approver_whatsapp     text[] not null default '{}' check (cardinality(approver_whatsapp) <= 5),
  notify_whatsapp       text[] not null default '{}' check (cardinality(notify_whatsapp) <= 5),
  review_note           text check (char_length(review_note) <= 500),
  reviewed_by           uuid references auth.users (id) on delete set null,
  reviewed_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table feeder.ad_accounts is 'Autopublish: a customer''s Meta ad account / Page / Instagram / Pixel and TikTok advertiser. Shared with Retexia''s Business Manager / Business Center as a partner; usable only after Retexia confirms (status connected).';

-- One ad account / advertiser belongs to one Retexia customer.
create unique index if not exists ad_accounts_meta_unique on feeder.ad_accounts (meta_ad_account_id)
  where meta_ad_account_id is not null and meta_status <> 'none';
create unique index if not exists ad_accounts_tiktok_unique on feeder.ad_accounts (tiktok_advertiser_id)
  where tiktok_advertiser_id is not null and tiktok_status <> 'none';

-- Changing which account, Page, Instagram or Pixel is used always needs Retexia to confirm again.
create or replace function feeder.ad_accounts_guard() returns trigger
language plpgsql set search_path = feeder, public as $$
begin
  if tg_op = 'INSERT' then
    -- A new account is never connected straight away: Retexia confirms first.
    if new.meta_ad_account_id is null then new.meta_status := 'none'; elsif new.meta_status in ('none', 'connected') then new.meta_status := 'requested'; end if;
    if new.tiktok_advertiser_id is null then new.tiktok_status := 'none'; elsif new.tiktok_status in ('none', 'connected') then new.tiktok_status := 'requested'; end if;
    return new;
  end if;
  if (new.meta_ad_account_id, new.meta_page_id, new.meta_instagram_id, new.meta_pixel_id)
     is distinct from (old.meta_ad_account_id, old.meta_page_id, old.meta_instagram_id, old.meta_pixel_id) then
    new.meta_status := case when new.meta_ad_account_id is null then 'none' else 'requested' end;
    new.meta_info := '{}'::jsonb;
  elsif new.meta_ad_account_id is null then
    new.meta_status := 'none';
  elsif new.meta_status = 'none' then
    new.meta_status := 'requested';
  end if;
  if (new.tiktok_advertiser_id, new.tiktok_identity_id) is distinct from (old.tiktok_advertiser_id, old.tiktok_identity_id) then
    new.tiktok_status := case when new.tiktok_advertiser_id is null then 'none' else 'requested' end;
    new.tiktok_info := '{}'::jsonb;
  elsif new.tiktok_advertiser_id is null then
    new.tiktok_status := 'none';
  elsif new.tiktok_status = 'none' then
    new.tiktok_status := 'requested';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ad_accounts_guard on feeder.ad_accounts;
create trigger ad_accounts_guard before insert or update on feeder.ad_accounts
  for each row execute function feeder.ad_accounts_guard();

-- ---------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------
create table if not exists feeder.ad_templates (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  name                   text not null check (char_length(btrim(name)) between 1 and 80),
  is_active              boolean not null default true,
  version                int not null default 1 check (version >= 1),
  platforms              text[] not null check (cardinality(platforms) between 1 and 2 and platforms <@ array['meta', 'tiktok']),
  objective              text not null check (objective in ('leads', 'messages', 'traffic', 'sales')),
  structure              jsonb not null check (jsonb_typeof(structure) = 'object'),
  audiences              jsonb not null check (jsonb_typeof(audiences) = 'array' and jsonb_array_length(audiences) between 1 and 5),
  schedule               jsonb not null default '{"start": "immediate"}'::jsonb,
  copy                   jsonb not null default '{}'::jsonb,
  destination            jsonb not null default '{}'::jsonb,
  rules                  jsonb not null default '{}'::jsonb,
  target_cost_per_result numeric(14, 2) check (target_cost_per_result > 0),
  require_approval       boolean,
  launch_as              text not null default 'active' check (launch_as in ('active', 'paused')),
  image_on_tiktok        text not null default 'skip_tiktok' check (image_on_tiktok in ('skip_tiktok', 'reject')),
  overridable            text[] not null default '{budget,start,copy}' check (overridable <@ array['budget', 'start', 'copy']),
  validation             jsonb,
  last_validated_at      timestamptz,
  deleted_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists ad_templates_user_idx on feeder.ad_templates (user_id, created_at desc) where deleted_at is null;
comment on table feeder.ad_templates is 'Autopublish templates. structure = campaign / ad set / ad layout and budget (data, compiled into plan nodes per launch).';

-- ---------------------------------------------------------------------
-- Evergreen ("slot") campaigns: one per customer × platform × objective × product × budget level.
-- The row is reserved first (campaign_id empty), so two launches never make two.
-- ---------------------------------------------------------------------
create table if not exists feeder.ad_slots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  platform     text not null check (platform in ('meta', 'tiktok')),
  objective    text not null check (objective in ('leads', 'messages', 'traffic', 'sales')),
  product_key  text not null check (char_length(product_key) between 1 and 200),
  budget_level text not null check (budget_level in ('campaign', 'adset')),
  campaign_id  text,
  launches     int not null default 0,
  status       text not null default 'active' check (status in ('active', 'retired')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, platform, objective, product_key, budget_level)
);

-- ---------------------------------------------------------------------
-- Launches, creatives, plan nodes, events
-- ---------------------------------------------------------------------
create table if not exists feeder.ad_launches (
  ref                   text primary key check (ref ~ '^AP-[A-Z2-9]{6}$'),
  user_id               uuid not null references auth.users (id) on delete cascade,
  template_id           uuid references feeder.ad_templates (id) on delete set null,
  template_version      int,
  template_name         text,
  product_id            int references feeder.products (product_id) on delete set null,
  product_name          text not null,
  form_name             text not null check (char_length(btrim(form_name)) between 1 and 120),
  snapshot              jsonb not null,
  overrides             jsonb not null default '{}'::jsonb,
  summary               text not null default '',
  totals                jsonb not null default '{}'::jsonb,
  warnings              jsonb not null default '[]'::jsonb,
  state                 text not null default 'queued' check (state in (
                          'awaiting_approval', 'rejected', 'expired', 'queued', 'building', 'activating',
                          'in_review', 'live', 'partly_live', 'needs_attention', 'paused', 'blocked', 'failed', 'cancelled')),
  platform_state        jsonb not null default '{}'::jsonb,
  approval_code         text check (approval_code ~ '^[A-HJ-NP-Z2-9]{4}$'),
  approval_requested_at timestamptz,
  approval_expires_at   timestamptz,
  approved_by           uuid references auth.users (id) on delete set null,
  approved_at           timestamptz,
  reject_reason         text check (char_length(reject_reason) <= 300),
  problem               jsonb,
  next_run_at           timestamptz default now(),
  locked_until          timestamptz,
  locked_by             text,
  activated_at          timestamptz,
  last_notified_at      timestamptz,
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists ad_launches_due_idx on feeder.ad_launches (next_run_at) where next_run_at is not null;
create index if not exists ad_launches_user_idx on feeder.ad_launches (user_id, created_at desc);
create index if not exists ad_launches_state_idx on feeder.ad_launches (state, next_run_at);
create index if not exists ad_launches_code_idx on feeder.ad_launches (approval_code) where approval_code is not null;
comment on table feeder.ad_launches is 'Autopublish launches. snapshot = template + overrides, frozen at submit (later template edits never change it).';

create table if not exists feeder.ad_creatives (
  launch_ref   text not null references feeder.ad_launches (ref) on delete cascade,
  position     int not null check (position between 1 and 10),
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  storage_path text not null check (char_length(storage_path) between 3 and 400),
  kind         text not null check (kind in ('video', 'image')),
  mime         text,
  size_bytes   bigint check (size_bytes >= 0),
  width        int check (width > 0),
  height       int check (height > 0),
  duration_s   numeric(8, 2) check (duration_s >= 0),
  approved     boolean not null default true,
  primary key (launch_ref, position)
);

create table if not exists feeder.ad_nodes (
  id                 uuid primary key default gen_random_uuid(),
  launch_ref         text not null references feeder.ad_launches (ref) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  platform           text not null check (platform in ('meta', 'tiktok')),
  key                text not null check (key ~ '^[a-z0-9.]{1,40}$'),
  level              text not null check (level in ('media', 'form', 'campaign', 'adset', 'creative', 'ad')),
  parent_key         text,
  depends_on         text[] not null default '{}',
  action             text not null default 'create' check (action in ('create', 'reuse', 'slot')),
  existing_id        text,
  creative_positions int[] not null default '{}',
  audience_index     int check (audience_index between 0 and 4),
  name               text not null,
  budget_daily       numeric(14, 2) check (budget_daily >= 0),
  budget_lifetime    numeric(14, 2) check (budget_lifetime >= 0),
  spec               jsonb not null default '{}'::jsonb,
  state              text not null default 'pending' check (state in (
                       'pending', 'processing_media', 'done', 'skipped', 'retry_wait', 'needs_fix', 'blocked', 'failed',
                       'in_review', 'live', 'scheduled', 'disapproved', 'with_issues', 'paused', 'archived')),
  platform_id        text,
  platform_extra     jsonb not null default '{}'::jsonb,
  review             jsonb,
  resubmits          int not null default 0 check (resubmits between 0 and 5),
  error_code         text,
  error_category     text,
  error_message      text,
  fix_field          text,
  error_detail       jsonb,
  attempts           int not null default 0 check (attempts >= 0),
  next_run_at        timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (launch_ref, platform, key)
);
create index if not exists ad_nodes_platform_id_idx on feeder.ad_nodes (platform, platform_id) where platform_id is not null;
create index if not exists ad_nodes_user_idx on feeder.ad_nodes (user_id, state);
comment on table feeder.ad_nodes is 'Autopublish plan tree. key: m1 media | f1 form | c1 campaign | c1.s2 ad set | k3 creative (Meta) | c1.s2.a3 ad. Created PAUSED; switched on last.';

create table if not exists feeder.ad_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  launch_ref text references feeder.ad_launches (ref) on delete cascade,
  node_id    uuid,
  type       text not null check (char_length(type) between 1 and 60),
  actor      text not null default 'system' check (actor in ('system', 'customer', 'approver', 'admin', 'rule')),
  message    text not null check (char_length(message) between 1 and 600),
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ad_events_launch_idx on feeder.ad_events (launch_ref, created_at desc);
create index if not exists ad_events_user_idx on feeder.ad_events (user_id, created_at desc);

create table if not exists feeder.ad_lead_forms (
  user_id    uuid not null references auth.users (id) on delete cascade,
  platform   text not null check (platform in ('meta', 'tiktok')),
  page_id    text not null,
  form_id    text not null,
  name       text not null,
  product_id int references feeder.products (product_id) on delete set null,
  made_by_retexia boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, platform, form_id)
);
create index if not exists ad_lead_forms_name_idx on feeder.ad_lead_forms (user_id, platform, page_id, feeder.alias_key(name));

-- ---------------------------------------------------------------------
-- Error catalog: platform error → category, what to do, plain message.
-- Unknown errors are added as drafts (is_draft) for Retexia to fill in.
-- ---------------------------------------------------------------------
create table if not exists feeder.ad_error_catalog (
  id             serial primary key,
  slug           text unique,
  platform       text not null check (platform in ('meta', 'tiktok', 'any')),
  code           text,
  subcode        text,
  match_regex    text,          -- case-insensitive; tested against the code, the subcode and the message
  category       text not null check (category in ('TRANSIENT', 'RATE_LIMIT', 'AUTH', 'PERMISSION', 'ACCOUNT', 'BILLING', 'VALIDATION', 'CREATIVE', 'POLICY', 'LIMIT', 'UNKNOWN')),
  action         text not null check (action ~ '^(retry|wait_rate_limit|needs_client|needs_admin|auto_fix:[a-z_]+)$'),
  client_message text,
  fix_field      text,
  admin_note     text,
  is_draft       boolean not null default false,
  sort           int not null default 100,
  hits           int not null default 0,
  last_seen      timestamptz,
  created_at     timestamptz not null default now()
);
comment on table feeder.ad_error_catalog is 'Autopublish: platform errors → plain client messages and the action (retry, wait, auto-fix, ask the customer, ask Retexia). {user_msg} / {message} are filled in from the platform''s text.';

insert into feeder.ad_error_catalog (slug, platform, code, subcode, match_regex, category, action, client_message, fix_field, sort) values
  ('meta-transient',      'meta',   '1',    null, null, 'TRANSIENT',  'retry',           'Meta had a temporary problem. We''ll try again automatically.', null, 10),
  ('meta-transient-2',    'meta',   '2',    null, null, 'TRANSIENT',  'retry',           'Meta had a temporary problem. We''ll try again automatically.', null, 10),
  ('meta-rate-4',         'meta',   '4',    null, null, 'RATE_LIMIT', 'wait_rate_limit', null, null, 10),
  ('meta-rate-17',        'meta',   '17',   null, null, 'RATE_LIMIT', 'wait_rate_limit', null, null, 10),
  ('meta-rate-32',        'meta',   '32',   null, null, 'RATE_LIMIT', 'wait_rate_limit', null, null, 10),
  ('meta-rate-613',       'meta',   '613',  null, null, 'RATE_LIMIT', 'wait_rate_limit', null, null, 10),
  ('meta-rate-80000',     'meta',   null,   null, '^8000[0-9]$|^8001[0-4]$', 'RATE_LIMIT', 'wait_rate_limit', null, null, 11),
  ('meta-auth',           'meta',   '190',  null, null, 'AUTH',       'needs_admin',     'We''re reconnecting to Meta. Your launch is safe and will continue.', null, 10),
  ('meta-permission-10',  'meta',   '10',   null, null, 'PERMISSION', 'needs_admin',     'We lost permission to your ad account or Page. Check that Retexia''s business still has access (Autopublish → Accounts).', null, 10),
  ('meta-permission-2xx', 'meta',   null,   null, '^2[0-9][0-9]$', 'PERMISSION', 'needs_admin', 'We lost permission to your ad account or Page. Check that Retexia''s business still has access (Autopublish → Accounts).', null, 11),
  ('meta-policy-368',     'meta',   '368',  null, null, 'POLICY',     'needs_admin',     'Meta blocked this action for now for policy reasons. We''re checking it.', null, 10),
  ('meta-billing',        'meta',   null,   null, 'spend(ing)? (cap|limit)|payment|billing|funding', 'BILLING', 'needs_client', 'Your ad account''s payment method or spending limit needs attention in Meta Billing.', null, 20),
  ('meta-account',        'meta',   null,   null, 'account.*(disabled|restricted|closed)|account_status', 'ACCOUNT', 'needs_admin', 'Your ad account is restricted by Meta. We''re on it.', null, 20),
  ('meta-lead-form',      'meta',   null,   null, 'lead ?(gen)? ?form|leadgen|terms of service|lead ads terms', 'VALIDATION', 'needs_client', 'The lead form isn''t active, or the Lead Ads Terms haven''t been accepted for your Page (facebook.com/ads/leadgen/tos).', 'destination.lead_form', 20),
  ('meta-privacy-url',    'meta',   null,   null, 'privacy polic', 'VALIDATION', 'needs_client', 'Meta needs a working privacy policy link for your lead form. Add it in Autopublish → Accounts.', 'account.privacy_policy_url', 21),
  ('meta-video',          'meta',   null,   null, 'video.*(process|encod|corrupt|invalid|format)', 'CREATIVE', 'needs_client', 'Meta couldn''t process this video. Export it again as MP4 (H.264) and replace it.', 'creative', 20),
  ('meta-text-long',      'meta',   null,   null, '(text|title|body|message).*too long', 'CREATIVE', 'auto_fix:truncate_text', 'The ad text was too long, so we shortened it.', 'copy', 20),
  ('meta-max-ads',        'meta',   null,   null, 'maximum number of ads|too many ads', 'LIMIT', 'needs_client', 'This ad set already has the most ads Meta allows (50). Use a new ad set, or archive old ads.', 'structure', 20),
  ('meta-budget-low',     'meta',   null,   null, 'budget.*(too low|at least|minimum)|minimum.*budget', 'VALIDATION', 'needs_client', 'The daily budget is below Meta''s minimum for this account: {user_msg}', 'budget', 20),
  ('meta-lpv',            'meta',   null,   null, 'landing_page_views|LANDING_PAGE_VIEWS', 'VALIDATION', 'auto_fix:use_link_clicks_goal', 'Landing page views aren''t available here, so we optimise for link clicks.', null, 20),
  ('meta-invalid-param',  'meta',   '100',  null, null, 'VALIDATION', 'needs_client', 'Meta didn''t accept a setting in this template: {user_msg}', 'template', 90),
  ('tiktok-rate',         'tiktok', null,   null, '^(40100|40133|51021|61000)$|too many requests|rate limit|qps', 'RATE_LIMIT', 'wait_rate_limit', null, null, 10),
  ('tiktok-auth',         'tiktok', null,   null, '^(40001|40102|40104|40105)$|access token.*(invalid|expired)', 'AUTH', 'needs_admin', 'We''re reconnecting to TikTok. Your launch is safe and will continue.', null, 10),
  ('tiktok-permission',   'tiktok', null,   null, '^(40002|40003)$|no permission|not authori[sz]ed', 'PERMISSION', 'needs_admin', 'We lost permission to your TikTok ad account. Check it is still shared with Retexia''s Business Center.', null, 11),
  ('tiktok-balance',      'tiktok', null,   null, 'balance|insufficient', 'BILLING', 'needs_client', 'Your TikTok ad account balance is too low. Add funds in TikTok Ads Manager.', null, 20),
  ('tiktok-video',        'tiktok', null,   null, 'video.*(ratio|resolution|duration|size|format)', 'CREATIVE', 'needs_client', 'This video doesn''t meet TikTok''s size or length rules: {message}', 'creative', 20),
  ('tiktok-budget-low',   'tiktok', null,   null, 'budget.*(less than|lower than|minimum|at least)', 'VALIDATION', 'needs_client', 'The budget is below TikTok''s minimum: {message}', 'budget', 20),
  ('tiktok-temp',         'tiktok', null,   null, '^(50000|50002|51000)$|system (error|busy)|internal error', 'TRANSIENT', 'retry', 'TikTok had a temporary problem. We''ll try again automatically.', null, 30),
  ('tiktok-param',        'tiktok', null,   null, '^400[0-9]{2}$', 'VALIDATION', 'needs_client', 'TikTok didn''t accept: {message}', 'template', 90),
  ('any-network',         'any',    null,   null, '^(gateway|network|timeout)', 'TRANSIENT', 'retry', 'We couldn''t reach the ad platform. We''ll try again automatically.', null, 5)
on conflict (slug) do update
   set platform = excluded.platform, code = excluded.code, subcode = excluded.subcode, match_regex = excluded.match_regex,
       category = excluded.category, action = excluded.action, client_message = excluded.client_message,
       fix_field = excluded.fix_field, sort = excluded.sort;

-- ---------------------------------------------------------------------
-- The runner claims due launches: one per customer at a time (fair), locked
-- for 5 minutes, skipping rows another run holds.
-- ---------------------------------------------------------------------
create or replace function feeder.ad_claim_launches(p_limit int default 5, p_worker text default 'panel', p_ref text default null)
returns setof feeder.ad_launches
language plpgsql volatile security definer set search_path = feeder, public as $$
begin
  return query
  with ranked as (
    select l.ref, l.next_run_at,
           row_number() over (partition by l.user_id order by l.next_run_at, l.created_at) as rn
      from feeder.ad_launches l
     where l.next_run_at is not null and l.next_run_at <= now()
       and l.state in ('awaiting_approval', 'queued', 'building', 'activating', 'in_review', 'live', 'partly_live', 'needs_attention', 'blocked')
       and (l.locked_until is null or l.locked_until < now())
       and (p_ref is null or l.ref = p_ref)
       -- one launch per customer at a time (their evergreen campaigns and spend limit are shared)
       and not exists (select 1 from feeder.ad_launches o where o.user_id = l.user_id and o.ref <> l.ref and o.locked_until > now())
  ), pick as (
    select l.ref
      from feeder.ad_launches l
      join ranked r on r.ref = l.ref
     where r.rn = 1
     order by r.next_run_at
     limit greatest(1, least(coalesce(p_limit, 5), 20))
       for update of l skip locked
  )
  update feeder.ad_launches l
     set locked_until = now() + interval '5 minutes', locked_by = left(coalesce(p_worker, 'panel'), 60)
    from pick
   where l.ref = pick.ref
  returning l.*;
end $$;

-- An error the catalog hasn't seen: one draft row per platform + code + message start.
create or replace function feeder.ad_error_seen(p_id int) returns void
language sql volatile security definer set search_path = feeder, public as $$
  update feeder.ad_error_catalog set hits = hits + 1, last_seen = now() where id = p_id;
$$;

-- ---------------------------------------------------------------------
-- Access: customers read their own rows; every write goes through
-- feeder.retexia.com (service role), which checks the account first.
-- ---------------------------------------------------------------------
alter table feeder.ad_accounts enable row level security;
alter table feeder.ad_templates enable row level security;
alter table feeder.ad_slots enable row level security;
alter table feeder.ad_launches enable row level security;
alter table feeder.ad_creatives enable row level security;
alter table feeder.ad_nodes enable row level security;
alter table feeder.ad_events enable row level security;
alter table feeder.ad_lead_forms enable row level security;
alter table feeder.ad_error_catalog enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ad_accounts', 'ad_templates', 'ad_slots', 'ad_launches', 'ad_nodes', 'ad_events', 'ad_lead_forms'] loop
    execute format('drop policy if exists own_read on feeder.%I', t);
    execute format('create policy own_read on feeder.%I for select to authenticated using (user_id = (select auth.uid()) or (select public.is_privileged()))', t);
  end loop;
end $$;
drop policy if exists own_read on feeder.ad_creatives;
create policy own_read on feeder.ad_creatives for select to authenticated
  using (exists (select 1 from feeder.ad_launches l where l.ref = launch_ref and (l.user_id = (select auth.uid()) or (select public.is_privileged()))));
drop policy if exists staff_read on feeder.ad_error_catalog;
create policy staff_read on feeder.ad_error_catalog for select to authenticated using ((select public.is_privileged()));

revoke insert, update, delete on feeder.ad_accounts, feeder.ad_templates, feeder.ad_slots, feeder.ad_launches, feeder.ad_creatives,
  feeder.ad_nodes, feeder.ad_events, feeder.ad_lead_forms, feeder.ad_error_catalog from anon, authenticated;
grant select on feeder.ad_accounts, feeder.ad_templates, feeder.ad_slots, feeder.ad_launches, feeder.ad_creatives,
  feeder.ad_nodes, feeder.ad_events, feeder.ad_lead_forms, feeder.ad_error_catalog to authenticated;
grant all on all tables in schema feeder to service_role;
grant usage, select on all sequences in schema feeder to service_role;

revoke execute on function feeder.ad_claim_launches(int, text, text), feeder.ad_error_seen(int) from public, anon, authenticated;
grant execute on function feeder.ad_claim_launches(int, text, text), feeder.ad_error_seen(int) to service_role;

-- ---------------------------------------------------------------------
-- Storage: creatives, private. Uploaded and read through short signed links
-- from feeder.retexia.com (paths {user_id}/{uuid}-{file}); Meta and TikTok
-- fetch them by signed link. No direct browser access.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('autopublish', 'autopublish', false, 209715200, array['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png'])
on conflict (id) do update
   set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- Clock: every minute, only when a launch is due, the database wakes
-- feeder.retexia.com/api/feeder/autopublish/tick (X-Retexia-Key = POST_CRON_KEY).
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'vault')
     and not exists (select 1 from vault.decrypted_secrets where name = 'feeder_ads_tick_url') then
    perform vault.create_secret('https://feeder.retexia.com/api/feeder/autopublish/tick', 'feeder_ads_tick_url');
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('retexia-feeder-ads-tick', '* * * * *', $c$
      select net.http_post(
        url := s.url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Retexia-Key', k.key),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000)
      from (select decrypted_secret as url from vault.decrypted_secrets where name = 'feeder_ads_tick_url') s,
           (select decrypted_secret as key from vault.decrypted_secrets where name = 'post_cron_key') k
      where exists (
        select 1 from feeder.ad_launches l
         where l.next_run_at <= now()
           and l.state in ('awaiting_approval', 'queued', 'building', 'activating', 'in_review', 'live', 'partly_live', 'needs_attention', 'blocked')
           and (l.locked_until is null or l.locked_until < now()));
    $c$);
  else
    raise notice 'pg_cron / pg_net not enabled: enable them (Database → Extensions) and run this file again for Autopublish.';
  end if;
end $$;
