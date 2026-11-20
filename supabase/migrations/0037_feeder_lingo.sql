-- =====================================================================
-- 0037: Retexia Feeder → Lingo (feeder.retexia.com/lingo), the WhatsApp
-- sales bot for Feeder sellers, on the official WhatsApp Cloud API.
--
--   * Package "Lingo" under Feeder: LKR 4,900 / month (49,000 / year),
--     no setup fee, 7-day free trial. Each seller has a monthly AI allowance
--     (bot_sellers.ai_monthly_budget_usd, default US$8 ≈ 2,000 chats). When it
--     is used up the bot keeps working without the reply AI (fixed answers,
--     FAQs and saved answers; anything else goes to the seller's Inbox), so
--     the price never changes and Retexia's cost per seller has a ceiling.
--   * A seller is a lingo.lingo_users row (owner_id = their Retexia login),
--     plus lingo.bot_sellers (bot settings). The seller's products are the
--     existing lingo.products rows; lingo.lingo_products resolves each field:
--     seller value → shared content (lingo.product_content, per Feeder
--     product) → Feeder catalogue (name, price, delivery fee).
--   * WhatsApp numbers: lingo.wa_numbers. Tokens and app secrets are in
--     Supabase Vault; only the service role reads them (bot_number()).
--   * Chats, orders, FAQs, quick rules, fixed texts, the answer cache, AI
--     usage and prices: lingo.bot_* tables (the old Evolution bot's
--     lingo.customers / orders / messages / fixed_messages are not touched).
--   * The n8n workflows (n8n/feeder-lingo*.json) call the bot_* functions
--     with the service role; feeder.retexia.com calls the panel_* ones.
-- Customers read their own rows; every write goes through the service role.
-- Safe to run again. Run after 0036.
-- =====================================================================

create schema if not exists lingo;
create schema if not exists feeder;

-- ---------------------------------------------------------------------
-- The package
-- ---------------------------------------------------------------------
insert into public.packages (product_id, slug, name, tagline, description, price_monthly, price_yearly, setup_fee, badge, cta_label, is_active, is_visible, sort_order)
select p.id, 'lingo', 'Lingo',
       'A WhatsApp salesperson for your Click-to-WhatsApp ads',
       'Customers tap your ad and Lingo answers on your WhatsApp number in Sinhala, Singlish or English: it sends the product photo, answers questions, takes the name, address and phone number and confirms the order. Confirmed orders go into your courier file. Anything it isn''t sure about comes to your Inbox.',
       4900, 49000, 0, '7 days free', 'Start free trial', true, true,
       coalesce((select max(sort_order) + 1 from public.packages where product_id = p.id), 1)
  from public.products p
 where p.slug = 'feeder'
on conflict (product_id, slug) do update
   set name = excluded.name, tagline = excluded.tagline, description = excluded.description,
       price_monthly = excluded.price_monthly, price_yearly = excluded.price_yearly, setup_fee = 0,
       badge = excluded.badge, cta_label = excluded.cta_label, is_active = true, is_visible = true, updated_at = now();

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'packages' and column_name = 'trial_days') then
    update public.packages k set trial_days = 7 from public.products p where p.id = k.product_id and p.slug = 'feeder' and k.slug = 'lingo';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'packages' and column_name = 'fine_print') then
    update public.packages k
       set fine_print = 'Prices in Sri Lankan rupees (LKR). The price stays the same however many chats you get; it includes a monthly AI allowance of about 2,000 chats. After that Lingo keeps answering with your fixed texts and FAQs and sends other questions to your Inbox. Any WhatsApp fees are charged by Meta to your own WhatsApp account (chats from Click-to-WhatsApp ads are free).'
      from public.products p where p.id = k.product_id and p.slug = 'feeder' and k.slug = 'lingo';
  end if;
end $$;

delete from public.package_features
 where package_id = (select k.id from public.packages k join public.products p on p.id = k.product_id where p.slug = 'feeder' and k.slug = 'lingo');
insert into public.package_features (package_id, label, sort_order)
select k.id, f.label, f.n
  from public.packages k
  join public.products p on p.id = k.product_id and p.slug = 'feeder'
  cross join (values
    (1, 'Your own WhatsApp number on the official WhatsApp Cloud API'),
    (2, 'Answers in Sinhala, Singlish or English, typed, voice notes and photos'),
    (3, 'Product photo and details from your Feeder products, prices from your price list'),
    (4, 'Takes name, address and phone number and confirms the order with buttons'),
    (5, 'Confirmed orders go straight into your courier CSV'),
    (6, 'Inbox for anything unclear, FAQs it learns from your corrections, follow-ups after 5 hours'),
    (7, 'One fixed monthly price, no per-message charges')
  ) as f(n, label)
 where k.slug = 'lingo';

-- ---------------------------------------------------------------------
-- Sellers
-- ---------------------------------------------------------------------
-- Cloud API sellers have no Evolution instance.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'lingo' and table_name = 'lingo_users' and column_name = 'evolution_instance' and is_nullable = 'NO') then
    alter table lingo.lingo_users alter column evolution_instance drop not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'lingo' and table_name = 'lingo_users' and column_name = 'evolution_base_url' and is_nullable = 'NO') then
    alter table lingo.lingo_users alter column evolution_base_url drop not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'lingo' and table_name = 'lingo_users' and column_name = 'evolution_apikey' and is_nullable = 'NO') then
    alter table lingo.lingo_users alter column evolution_apikey drop not null;
  end if;
end $$;

create table if not exists lingo.bot_sellers (
  lingo_user_id         bigint primary key references lingo.lingo_users (id) on delete cascade,
  user_id               uuid not null unique references auth.users (id) on delete cascade,
  status                text not null default 'setup' check (status in ('setup', 'live', 'paused', 'blocked')),
  timezone              text not null default 'Asia/Colombo',
  default_lang          text not null default 'si' check (default_lang in ('si', 'sg', 'en')),
  reply_to_non_ad       boolean not null default false,
  order_fields          text[] not null default '{name,address,contact}' check (order_fields <@ array['name', 'address', 'contact']::text[]),
  batch_seconds         int not null default 12 check (batch_seconds between 2 and 30),
  followups             jsonb not null default '{"hours": 5, "from": 8, "to": 21, "confirmed": true, "cancelled": true, "no_order": true}',
  handoff_pause_hours   int not null default 12 check (handoff_pause_hours between 1 and 168),
  banned_claims         text[] not null default '{"100% cure","guaranteed cure","permanent cure","cures diabetes","stop your medicine","සම්පූර්ණයෙන්ම සුව"}' check (cardinality(banned_claims) <= 50),
  notify_emails         text[] not null default '{}' check (cardinality(notify_emails) <= 5),
  shop_phone            text check (shop_phone is null or char_length(shop_phone) <= 40),
  shop_address          text check (shop_address is null or char_length(shop_address) <= 300),
  delivery_days         int not null default 3 check (delivery_days between 1 and 30),
  disabled_rules        bigint[] not null default '{}',
  hidden_faqs           bigint[] not null default '{}',
  ai_monthly_budget_usd numeric(10, 2) not null default 8 check (ai_monthly_budget_usd >= 0),
  ai_models             jsonb not null default '{}',
  budget_warned_at      timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table lingo.bot_sellers is 'Feeder → Lingo sellers (WhatsApp Cloud API bot): one per Retexia account (user_id), linked to its lingo_users row. ai_models and ai_monthly_budget_usd are set by Retexia only.';

create table if not exists lingo.wa_numbers (
  phone_number_id text primary key check (phone_number_id ~ '^[0-9]{6,25}$'),
  lingo_user_id   bigint not null unique references lingo.bot_sellers (lingo_user_id) on delete cascade,
  waba_id         text check (waba_id is null or waba_id ~ '^[0-9]{6,25}$'),
  display_phone   text,
  verified_name   text,
  connect_mode    text not null default 'manual' check (connect_mode in ('manual', 'embedded')),
  status          text not null default 'pending' check (status in ('pending', 'connected', 'problem', 'disabled')),
  quality_rating  text,
  verify_token    text not null default replace(gen_random_uuid()::text, '-', ''),
  token_secret_id uuid,
  app_secret_id   uuid,
  token_last4     text,
  problem         text,
  last_webhook_at timestamptz,
  last_check_at   timestamptz,
  last_check      jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table lingo.wa_numbers is 'Each seller''s WhatsApp Cloud API number. token_secret_id / app_secret_id point to Supabase Vault; nobody but the service role reads them.';

-- ---------------------------------------------------------------------
-- Products: shared content per Feeder product, and the resolved view
-- ---------------------------------------------------------------------
create table if not exists lingo.product_content (
  product_id_feeder int primary key check (product_id_feeder > 0),
  short_description text,
  long_description  text check (long_description is null or char_length(long_description) <= 4000),
  ingredients       text,
  application       text,
  precautions       text,
  symptoms          text,
  aliases           text,
  word_description  text,
  picture_url       text check (picture_url is null or picture_url ~ '^https://'),
  updated_by        uuid,
  updated_at        timestamptz not null default now()
);
comment on table lingo.product_content is 'Shared Lingo content for a Feeder product (Retexia writes it). A seller''s own lingo.products value wins when it is not empty.';

create or replace view lingo.lingo_products with (security_invoker = true) as
select p.id, p.lingo_user_id, r.name, r.aliases, r.symptoms, r.price, r.delivery_fee, r.short_info, r.long_description,
       r.image_url, r.ingredients, r.usage, r.precautions, p.product_id_feeder as feeder_id,
       md5(concat_ws('|', r.name, r.price, r.delivery_fee, r.short_info, r.long_description, r.ingredients, r.usage, r.precautions, r.symptoms)) as facts_hash,
       (p.active and coalesce(fp.active, true)) as active
  from lingo.products p
  left join lingo.product_content c on c.product_id_feeder = p.product_id_feeder
  left join lingo.lingo_users u on u.id = p.lingo_user_id
  left join feeder.products fp on fp.product_id = p.product_id_feeder
  left join feeder.customer_products cp on cp.product_id = p.product_id_feeder and cp.user_id = u.owner_id
 cross join lateral (select
       coalesce(nullif(btrim(p.product_name), ''), fp.product_name, 'Product') as name,
       coalesce(nullif(btrim(p.aliases), ''), nullif(btrim(c.aliases), ''), '') as aliases,
       coalesce(nullif(btrim(p.symptoms), ''), nullif(btrim(c.symptoms), ''), '') as symptoms,
       (case when coalesce(p.price, 0) > 0 then p.price else coalesce(cp.price, fp.price, p.price, 0) end)::numeric(12, 2) as price,
       coalesce(p.delivery_fee, fp.delivery_fee, 0)::numeric(12, 2) as delivery_fee,
       coalesce(nullif(btrim(p.short_description), ''), nullif(btrim(c.short_description), ''), '') as short_info,
       coalesce(nullif(btrim(p.long_description), ''), nullif(btrim(c.long_description), ''), '') as long_description,
       coalesce(nullif(btrim(p.picture_url), ''), nullif(btrim(c.picture_url), '')) as image_url,
       coalesce(nullif(btrim(p.ingredients), ''), nullif(btrim(c.ingredients), ''), '') as ingredients,
       coalesce(nullif(btrim(p.application), ''), nullif(btrim(c.application), ''), '') as usage,
       coalesce(nullif(btrim(p.precautions), ''), nullif(btrim(c.precautions), ''), '') as precautions) r;
comment on view lingo.lingo_products is 'What the Lingo bot knows about each seller product: seller value → shared content → Feeder catalogue. facts_hash changes whenever a fact changes (the answer cache uses it).';

create or replace function lingo.seller_products(p_seller bigint) returns setof lingo.lingo_products
language sql stable set search_path = lingo, public as $$
  select * from lingo.lingo_products where lingo_user_id = p_seller and active;
$$;

-- ---------------------------------------------------------------------
-- FAQs, quick rules, fixed texts
-- ---------------------------------------------------------------------
create table if not exists lingo.product_faqs (
  id                bigint generated by default as identity primary key,
  lingo_user_id     bigint references lingo.lingo_users (id) on delete cascade,
  product_id_feeder int,
  product_id        bigint references lingo.products (id) on delete cascade,
  question_en       text not null check (char_length(btrim(question_en)) between 3 and 200),
  variants          text[] not null default '{}' check (cardinality(variants) <= 20),
  answer_si         text check (answer_si is null or char_length(answer_si) <= 1000),
  answer_en         text check (answer_en is null or char_length(answer_en) <= 1000),
  hits              int not null default 0,
  source            text not null default 'manual' check (source in ('manual', 'correction', 'import', 'cache', 'starter')),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (product_id_feeder is not null or product_id is not null),
  check (nullif(btrim(coalesce(answer_si, '')), '') is not null or nullif(btrim(coalesce(answer_en, '')), '') is not null)
);
create index if not exists product_faqs_feeder_idx on lingo.product_faqs (product_id_feeder) where active;
create index if not exists product_faqs_product_idx on lingo.product_faqs (product_id) where active;
comment on table lingo.product_faqs is 'Lingo FAQs: shared (lingo_user_id null, per Feeder product) or a seller''s own. The middle AI picks one by id; the answer is sent as written.';

create table if not exists lingo.quick_rules (
  id            bigint generated by default as identity primary key,
  lingo_user_id bigint references lingo.lingo_users (id) on delete cascade,
  pattern       text not null check (char_length(pattern) between 2 and 400),
  stage_in      text[] not null default '{}',
  k             text not null check (k in ('details', 'confirm', 'change', 'cancel', 'question', 'other_product', 'complaint', 'human', 'chat')),
  t             text check (t is null or t in ('price', 'delivery', 'payment', 'usage', 'ingredients', 'safety', 'results', 'stock', 'contact', 'shop', 'other')),
  priority      int not null default 100,
  enabled       boolean not null default true,
  hits          int not null default 0,
  note          text,
  created_at    timestamptz not null default now()
);
comment on table lingo.quick_rules is 'Level-0 rules (no AI): a case-insensitive JavaScript regex matched against the whole batched message (punctuation and emojis removed). Global (lingo_user_id null) or a seller''s own; sellers switch global ones off with bot_sellers.disabled_rules.';

create table if not exists lingo.bot_fixed_messages (
  id            bigint generated by default as identity primary key,
  key           text not null check (key ~ '^[a-z_]{2,40}$'),
  lingo_user_id bigint references lingo.lingo_users (id) on delete cascade,
  text_si       text not null default '' check (char_length(text_si) <= 1024),
  text_en       text not null default '' check (char_length(text_en) <= 1024),
  note          text,
  updated_at    timestamptz not null default now(),
  unique nulls not distinct (key, lingo_user_id)
);
comment on table lingo.bot_fixed_messages is 'Every fixed text and button label (Sinhala and English; Singlish customers get the Sinhala one). Defaults have lingo_user_id null; a seller''s row overrides them field by field.';

-- ---------------------------------------------------------------------
-- Ads, customers, messages, orders
-- ---------------------------------------------------------------------
create table if not exists lingo.bot_ads (
  lingo_user_id bigint not null references lingo.bot_sellers (lingo_user_id) on delete cascade,
  ad_id         text not null check (char_length(ad_id) <= 300),
  product_id    bigint references lingo.products (id) on delete set null,
  headline      text,
  body          text,
  source_url    text,
  auto_matched  boolean not null default false,
  match_tried   boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (lingo_user_id, ad_id)
);

create table if not exists lingo.bot_customers (
  lingo_user_id     bigint not null references lingo.bot_sellers (lingo_user_id) on delete cascade,
  phone             text not null check (phone ~ '^([0-9]{6,20}|test-[a-z0-9-]{1,60})$'),
  name              text,
  lang              text not null default 'si' check (lang in ('si', 'sg', 'en')),
  product_id        bigint,
  seen_products     bigint[] not null default '{}',
  stage             text not null default 'new' check (stage in ('new', 'browsing', 'collecting', 'confirming', 'ordered', 'cancelled', 'handoff')),
  ad_id             text,
  free_window_until timestamptz,
  last_in_at        timestamptz,
  last_msg_at       timestamptz,
  notified_at       timestamptz,
  paused_until      timestamptz,
  unsure_streak     int not null default 0,
  needs_seller      boolean not null default false,
  handoff_reason    text,
  summary           text,
  summary_upto      bigint not null default 0,
  test              boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (lingo_user_id, phone)
);
create index if not exists bot_customers_recent_idx on lingo.bot_customers (lingo_user_id, last_msg_at desc);
create index if not exists bot_customers_due_idx on lingo.bot_customers (last_msg_at) where not test;

create table if not exists lingo.bot_messages (
  id               bigint generated by default as identity primary key,
  lingo_user_id    bigint not null,
  phone            text not null,
  role             text not null check (role in ('c', 'b', 'seller')),
  content          text not null,
  note             text,
  meta             jsonb,
  wa_id            text,
  status           text,
  billable         boolean,
  pricing_category text,
  route            text check (route is null or route in ('rule', 'tap', 'fixed', 'faq', 'cache', 'ai', 'human')),
  rating           smallint check (rating is null or rating in (-1, 1)),
  correction       text,
  created_at       timestamptz not null default now(),
  foreign key (lingo_user_id, phone) references lingo.bot_customers (lingo_user_id, phone) on delete cascade
);
create index if not exists bot_messages_chat_idx on lingo.bot_messages (lingo_user_id, phone, id);
create index if not exists bot_messages_wa_idx on lingo.bot_messages (wa_id) where wa_id is not null;
create index if not exists bot_messages_route_idx on lingo.bot_messages (lingo_user_id, created_at) where route is not null;
comment on column lingo.bot_messages.note is 'Short log of a bot turn for the AI''s chat history ("[sent order summary]"); '''' = not part of the history (2nd, 3rd message of the same turn).';
comment on column lingo.bot_messages.route is 'How the turn was answered: rule | tap | fixed | faq | cache | ai | human (first message of each bot turn).';

create table if not exists lingo.bot_buffer (
  id            bigint generated by default as identity primary key,
  lingo_user_id bigint not null,
  phone         text not null,
  wa_id         text,
  content       text not null,
  quoted_id     text,
  tap           text,
  wa_ts         bigint,
  created_at    timestamptz not null default now()
);
create index if not exists bot_buffer_chat_idx on lingo.bot_buffer (lingo_user_id, phone, id);

create table if not exists lingo.bot_seen (
  wa_id text primary key,
  at    timestamptz not null default now()
);
create index if not exists bot_seen_at_idx on lingo.bot_seen (at);

create table if not exists lingo.bot_product_msgs (
  wa_id         text primary key,
  lingo_user_id bigint not null,
  phone         text not null,
  product_id    bigint not null,
  created_at    timestamptz not null default now()
);

create table if not exists lingo.bot_orders (
  id                bigint generated by default as identity primary key,
  lingo_user_id     bigint not null,
  phone             text not null,
  product_id        bigint,
  product_id_feeder int,
  product_name      text,
  qty               int not null default 1 check (qty between 1 and 99),
  name              text,
  address           text,
  contact           text,
  unit_price        numeric(12, 2),
  delivery_fee      numeric(12, 2),
  total             numeric(12, 2),
  status            text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  delivery_status   text check (delivery_status is null or delivery_status in ('dispatched', 'delivered', 'returned')),
  feeder_sync       text not null default 'pending' check (feeder_sync in ('pending', 'done', 'failed')),
  feeder_order_id   text,
  exported_at       timestamptz,
  cancel_reason     text,
  ad_id             text,
  test              boolean not null default false,
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (lingo_user_id, phone) references lingo.bot_customers (lingo_user_id, phone) on delete cascade
);
create index if not exists bot_orders_chat_idx on lingo.bot_orders (lingo_user_id, phone, id desc);
create index if not exists bot_orders_seller_idx on lingo.bot_orders (lingo_user_id, status, created_at desc);
comment on column lingo.bot_orders.feeder_sync is 'pending = not in a courier file yet; done = downloaded in a courier CSV (exported_at) for Feeder.';

-- ---------------------------------------------------------------------
-- Cost engine: answer cache, AI usage, model prices
-- ---------------------------------------------------------------------
create table if not exists lingo.answer_cache (
  key               text primary key,
  product_id_feeder int,
  product_id        bigint,
  facts_hash        text not null,
  t                 text not null,
  lang              text not null,
  q                 text not null,
  answer            text not null,
  hits              int not null default 0,
  promoted          boolean not null default false,
  created_at        timestamptz not null default now(),
  last_hit_at       timestamptz
);
comment on table lingo.answer_cache is 'Reply-AI answers, keyed by sha256(product facts_hash | topic | lang | normalised English question). New facts = new key, so changed products never get old answers.';

create table if not exists lingo.model_prices (
  model           text primary key,
  in_per_m        numeric(10, 4) not null check (in_per_m >= 0),
  out_per_m       numeric(10, 4) not null check (out_per_m >= 0),
  audio_in_per_m  numeric(10, 4) not null check (audio_in_per_m >= 0),
  cached_in_per_m numeric(10, 4) not null check (cached_in_per_m >= 0),
  updated_at      timestamptz not null default now()
);
insert into lingo.model_prices (model, in_per_m, out_per_m, audio_in_per_m, cached_in_per_m) values
  ('gemini-3.5-flash-lite', 0.30, 2.50, 0.30, 0.03),
  ('gemini-3.6-flash', 0.75, 3.75, 0.75, 0.075),
  ('gemini-3.8-flash', 0.75, 3.75, 0.75, 0.075)
on conflict (model) do nothing;
comment on table lingo.model_prices is 'US$ per 1M tokens (Gemini API paid tier). Retexia keeps these current; every AI call''s cost is worked out from them.';

create table if not exists lingo.ai_usage (
  id             bigint generated by default as identity primary key,
  lingo_user_id  bigint,
  phone          text,
  stage          text not null check (stage in ('media', 'classify', 'reply', 'summary', 'ad_match', 'import', 'eval')),
  model          text not null,
  tokens_in      int not null default 0,
  tokens_out     int not null default 0,
  tokens_thought int not null default 0,
  tokens_cached  int not null default 0,
  tokens_audio   int not null default 0,
  cost_usd       numeric(14, 8) not null default 0,
  latency_ms     int,
  ok             boolean not null default true,
  test           boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists ai_usage_seller_idx on lingo.ai_usage (lingo_user_id, created_at);

create table if not exists lingo.eval_cases (
  id            bigint generated by default as identity primary key,
  lingo_user_id bigint references lingo.lingo_users (id) on delete cascade,
  input         jsonb not null,
  expected      jsonb not null,
  source        text not null default 'manual' check (source in ('manual', 'correction', 'import')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists lingo.eval_runs (
  id             bigint generated by default as identity primary key,
  prompt_version text not null,
  model          text not null,
  total          int not null,
  passed         int not null,
  details        jsonb,
  cost_usd       numeric(14, 8),
  created_at     timestamptz not null default now()
);

create table if not exists lingo.bot_events (
  id            bigint generated by default as identity primary key,
  lingo_user_id bigint,
  phone         text,
  type          text not null,
  detail        jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists bot_events_seller_idx on lingo.bot_events (lingo_user_id, created_at desc);

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['bot_sellers', 'wa_numbers', 'product_content', 'product_faqs', 'bot_fixed_messages', 'bot_customers', 'bot_orders'] loop
    execute format('drop trigger if exists set_updated_at on lingo.%I', t);
    execute format('create trigger set_updated_at before update on lingo.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security: sellers read their own rows; writes = service role
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['bot_sellers', 'wa_numbers', 'product_content', 'product_faqs', 'quick_rules', 'bot_fixed_messages', 'bot_ads',
                           'bot_customers', 'bot_messages', 'bot_buffer', 'bot_seen', 'bot_product_msgs', 'bot_orders', 'answer_cache',
                           'model_prices', 'ai_usage', 'eval_cases', 'eval_runs', 'bot_events'] loop
    execute format('alter table lingo.%I enable row level security', t);
    execute format('revoke all on lingo.%I from anon, authenticated', t);
    execute format('grant all on lingo.%I to service_role', t);
    if exists (select 1 from pg_roles where rolname = 'lingo_n8n') then
      execute format('revoke all on lingo.%I from lingo_n8n', t);
    end if;
  end loop;
  foreach t in array array['bot_sellers', 'bot_ads', 'bot_customers', 'bot_messages', 'bot_orders', 'ai_usage', 'bot_events'] loop
    execute format('drop policy if exists own_read on lingo.%I', t);
    execute format('create policy own_read on lingo.%I for select to authenticated using (lingo.owns(lingo_user_id) or (select public.is_privileged()))', t);
    execute format('grant select on lingo.%I to authenticated', t);
  end loop;
  foreach t in array array['product_faqs', 'quick_rules', 'bot_fixed_messages'] loop
    execute format('drop policy if exists own_or_shared on lingo.%I', t);
    execute format('create policy own_or_shared on lingo.%I for select to authenticated using (lingo_user_id is null or lingo.owns(lingo_user_id) or (select public.is_privileged()))', t);
    execute format('grant select on lingo.%I to authenticated', t);
  end loop;
end $$;
drop policy if exists everyone_read on lingo.product_content;
create policy everyone_read on lingo.product_content for select to authenticated using (true);
grant select on lingo.product_content to authenticated;
drop policy if exists everyone_read on lingo.model_prices;
create policy everyone_read on lingo.model_prices for select to authenticated using (true);
grant select on lingo.model_prices to authenticated;
-- WhatsApp numbers: never the Vault ids.
drop policy if exists own_read on lingo.wa_numbers;
create policy own_read on lingo.wa_numbers for select to authenticated using (lingo.owns(lingo_user_id) or (select public.is_privileged()));
grant select (phone_number_id, lingo_user_id, waba_id, display_phone, verified_name, connect_mode, status, quality_rating, token_last4,
              problem, last_webhook_at, last_check_at, created_at, updated_at) on lingo.wa_numbers to authenticated;
grant select on lingo.lingo_products to authenticated, service_role;
grant usage, select on all sequences in schema lingo to service_role;

-- =====================================================================
-- Helpers
-- =====================================================================
create or replace function lingo.seller_settings(p_seller bigint) returns jsonb
language sql stable security definer set search_path = lingo, public as $$
  select jsonb_build_object(
    'business', u.business_name, 'status', s.status, 'timezone', s.timezone, 'default_lang', s.default_lang,
    'reply_to_non_ad', s.reply_to_non_ad, 'order_fields', to_jsonb(s.order_fields), 'batch_seconds', s.batch_seconds,
    'handoff_pause_hours', s.handoff_pause_hours, 'banned_claims', to_jsonb(s.banned_claims),
    'shop_phone', coalesce(s.shop_phone, ''), 'shop_address', coalesce(s.shop_address, ''), 'delivery_days', s.delivery_days,
    'ai_models', s.ai_models)
  from lingo.bot_sellers s join lingo.lingo_users u on u.id = s.lingo_user_id
  where s.lingo_user_id = p_seller;
$$;

create or replace function lingo.fixed_for(p_seller bigint) returns jsonb
language sql stable security definer set search_path = lingo, public as $$
  select coalesce(jsonb_object_agg(d.key, jsonb_build_object(
           'si', coalesce(nullif(btrim(s.text_si), ''), d.text_si),
           'en', coalesce(nullif(btrim(s.text_en), ''), d.text_en))), '{}'::jsonb)
    from lingo.bot_fixed_messages d
    left join lingo.bot_fixed_messages s on s.key = d.key and s.lingo_user_id = p_seller
   where d.lingo_user_id is null;
$$;

-- AI spend this month (seller's time zone) against the allowance.
create or replace function lingo.seller_budget(p_seller bigint) returns jsonb
language sql stable security definer set search_path = lingo, public as $$
  with s as (select ai_monthly_budget_usd as lim, timezone as tz from lingo.bot_sellers where lingo_user_id = p_seller),
       u as (select coalesce(sum(a.cost_usd), 0) as used from lingo.ai_usage a, s
              where a.lingo_user_id = p_seller and a.created_at >= (date_trunc('month', now() at time zone s.tz) at time zone s.tz))
  select jsonb_build_object('used', round(u.used, 6), 'limit', s.lim,
                            'warn', u.used >= s.lim * 0.8, 'degrade', u.used >= s.lim)
    from s, u;
$$;

-- Gemini usageMetadata → tokens and US$ cost.
create or replace function lingo.log_usage(p_seller bigint, p_phone text, p_items jsonb, p_test boolean default false)
returns numeric language plpgsql security definer set search_path = lingo, public as $$
declare
  it jsonb; u jsonb; v_in int; v_out int; v_th int; v_ca int; v_au int; pr lingo.model_prices; v_cost numeric; v_total numeric := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if coalesce(it->>'stage', '') not in ('media', 'classify', 'reply', 'summary', 'ad_match', 'import', 'eval') then continue; end if;
    u := coalesce(it->'usage', '{}'::jsonb);
    v_in := coalesce((u->>'promptTokenCount')::int, 0);
    v_out := coalesce((u->>'candidatesTokenCount')::int, 0);
    v_th := coalesce((u->>'thoughtsTokenCount')::int, 0);
    v_ca := coalesce((u->>'cachedContentTokenCount')::int, 0);
    v_au := coalesce((select sum((d->>'tokenCount')::int) from jsonb_array_elements(coalesce(u->'promptTokensDetails', '[]'::jsonb)) d
                        where d->>'modality' = 'AUDIO'), 0);
    select * into pr from lingo.model_prices where model = coalesce(it->>'model', '');
    if pr.model is null then select * into pr from lingo.model_prices where model = 'gemini-3.5-flash-lite'; end if;
    v_cost := (greatest(v_in - v_ca - v_au, 0) * coalesce(pr.in_per_m, 0) + v_au * coalesce(pr.audio_in_per_m, 0)
               + v_ca * coalesce(pr.cached_in_per_m, 0) + (v_out + v_th) * coalesce(pr.out_per_m, 0)) / 1000000.0;
    insert into lingo.ai_usage (lingo_user_id, phone, stage, model, tokens_in, tokens_out, tokens_thought, tokens_cached, tokens_audio, cost_usd, latency_ms, ok, test)
    values (p_seller, p_phone, it->>'stage', coalesce(nullif(it->>'model', ''), 'unknown'), v_in, v_out, v_th, v_ca, v_au, v_cost,
            nullif(it->>'ms', '')::int, coalesce((it->>'ok')::boolean, true), coalesce(p_test, false));
    v_total := v_total + v_cost;
  end loop;
  return v_total;
end $$;

create or replace function lingo.cache_key(p_facts text, p_t text, p_lang text, p_q text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(coalesce(p_facts, '') || '|' || coalesce(p_t, '') || '|' || coalesce(p_lang, '') || '|' ||
         btrim(regexp_replace(regexp_replace(lower(coalesce(p_q, '')), '[^a-z0-9 ]+', ' ', 'g'), '\s+', ' ', 'g')), 'UTF8')), 'hex');
$$;

-- =====================================================================
-- Bot functions (n8n, service role)
-- =====================================================================

-- The number a webhook came to (or a seller, for panel calls) → seller, token and app secret from Vault.
create or replace function lingo.bot_number(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare
  n lingo.wa_numbers; s lingo.bot_sellers; v_token text; v_secret text;
begin
  if coalesce(p->>'phone_number_id', '') <> '' then
    select * into n from lingo.wa_numbers where phone_number_id = p->>'phone_number_id';
    if n.phone_number_id is null then
      if random() < 0.2 or not exists (select 1 from lingo.bot_events where type = 'unknown_number' and detail->>'phone_number_id' = p->>'phone_number_id' and created_at > now() - interval '1 hour') then
        insert into lingo.bot_events (type, detail) values ('unknown_number', jsonb_build_object('phone_number_id', left(p->>'phone_number_id', 40)));
      end if;
      return jsonb_build_object('ok', false, 'why', 'unknown number');
    end if;
    select * into s from lingo.bot_sellers where lingo_user_id = n.lingo_user_id;
  else
    select * into s from lingo.bot_sellers where lingo_user_id = nullif(p->>'lingo_user_id', '')::bigint;
    if s.lingo_user_id is null then return jsonb_build_object('ok', false, 'why', 'unknown seller'); end if;
    select * into n from lingo.wa_numbers where lingo_user_id = s.lingo_user_id;
  end if;
  if n.phone_number_id is not null and n.status = 'disabled' and coalesce(p->>'phone_number_id', '') <> '' then
    return jsonb_build_object('ok', false, 'why', 'number disabled');
  end if;
  if n.token_secret_id is not null then select decrypted_secret into v_token from vault.decrypted_secrets where id = n.token_secret_id; end if;
  if n.app_secret_id is not null then select decrypted_secret into v_secret from vault.decrypted_secrets where id = n.app_secret_id; end if;
  return jsonb_build_object(
    'ok', true, 'lingo_user_id', s.lingo_user_id, 'phone_number_id', n.phone_number_id, 'waba_id', n.waba_id,
    'connect_mode', coalesce(n.connect_mode, 'manual'), 'number_status', n.status,
    'token', v_token, 'app_secret', v_secret, 'settings', lingo.seller_settings(s.lingo_user_id));
end $$;

-- Meta's GET webhook check: the verify token of any number.
create or replace function lingo.bot_verify_token(p jsonb) returns jsonb
language sql stable security definer set search_path = lingo, public as $$
  select jsonb_build_object('ok', coalesce(p->>'token', '') <> '' and exists (select 1 from lingo.wa_numbers where verify_token = p->>'token'));
$$;

-- First stop for every message: duplicates, senders who didn't come from an ad, paused chats, ad → product.
create or replace function lingo.bot_gate(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare
  v_seller bigint := nullif(p->>'lingo_user_id', '')::bigint;
  v_phone  text := p->>'phone';
  v_test   boolean := coalesce((p->>'test')::boolean, false);
  v_ref    jsonb := p->'referral';
  v_ad     text;
  v_ad_row lingo.bot_ads;
  v_cust   lingo.bot_customers;
  v_s      lingo.bot_sellers;
  v_rows   int;
  v_start  bigint := nullif(p->>'start_product', '')::bigint;
begin
  select * into v_s from lingo.bot_sellers where lingo_user_id = v_seller;
  if v_s.lingo_user_id is null then return jsonb_build_object('status', 'unknown'); end if;
  if v_test <> (v_phone like 'test-%') then return jsonb_build_object('status', 'refused'); end if;

  if not v_test then
    update lingo.wa_numbers set last_webhook_at = now() where lingo_user_id = v_seller;
    insert into lingo.bot_seen (wa_id) values (p->>'wa_id') on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then return jsonb_build_object('status', 'dup'); end if;
    if random() < 0.02 then delete from lingo.bot_seen where at < now() - interval '3 days'; end if;
  end if;

  if jsonb_typeof(v_ref) = 'object' then
    v_ad := left(coalesce(nullif(v_ref->>'source_id', ''), nullif(v_ref->>'source_url', '')), 300);
  end if;

  select * into v_cust from lingo.bot_customers where lingo_user_id = v_seller and phone = v_phone;
  if v_cust.phone is null and v_ad is null and not v_test and not v_s.reply_to_non_ad then
    return jsonb_build_object('status', 'ignored');
  end if;

  insert into lingo.bot_customers (lingo_user_id, phone, name, lang, last_in_at, test, free_window_until)
  values (v_seller, v_phone, nullif(left(p->>'name', 80), ''), v_s.default_lang, now(), v_test,
          case when v_ad is not null then now() + interval '72 hours' end)
  on conflict (lingo_user_id, phone) do update
     set last_in_at = now(),
         name = coalesce(lingo.bot_customers.name, excluded.name),
         free_window_until = coalesce(excluded.free_window_until, lingo.bot_customers.free_window_until)
  returning * into v_cust;

  if v_ad is not null then
    insert into lingo.bot_ads (lingo_user_id, ad_id, headline, body, source_url)
    values (v_seller, v_ad, left(v_ref->>'headline', 300), left(v_ref->>'body', 1000), left(v_ref->>'source_url', 500))
    on conflict (lingo_user_id, ad_id) do nothing;
    select * into v_ad_row from lingo.bot_ads where lingo_user_id = v_seller and ad_id = v_ad;
    update lingo.bot_customers set ad_id = v_ad, product_id = coalesce(v_ad_row.product_id, product_id)
     where lingo_user_id = v_seller and phone = v_phone;
  end if;
  if v_test and v_start is not null and exists (select 1 from lingo.products where id = v_start and lingo_user_id = v_seller) then
    update lingo.bot_customers set product_id = v_start where lingo_user_id = v_seller and phone = v_phone;
  end if;

  -- Bot off, or this chat was handed to the seller: keep the message for the Inbox and stop.
  if (v_cust.paused_until is not null and v_cust.paused_until > now()) or (v_s.status <> 'live' and not v_test) then
    insert into lingo.bot_messages (lingo_user_id, phone, role, content, wa_id)
    values (v_seller, v_phone, 'c', left(coalesce(nullif(p->>'text', ''), '[media]'), 2000), nullif(p->>'wa_id', ''));
    update lingo.bot_customers set needs_seller = true, last_msg_at = now() where lingo_user_id = v_seller and phone = v_phone;
    return jsonb_build_object('status', 'paused');
  end if;

  if v_ad is not null and v_ad_row.product_id is null and not v_ad_row.match_tried then
    return jsonb_build_object(
      'status', 'ok', 'need_ad_match', true,
      'ad', jsonb_build_object('id', v_ad, 'headline', v_ad_row.headline, 'body', v_ad_row.body),
      'products', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'n', name, 'k', left(aliases, 80)) order by id)
                              from lingo.seller_products(v_seller)), '[]'::jsonb));
  end if;
  return jsonb_build_object('status', 'ok', 'need_ad_match', false);
end $$;

-- The AI's one-time "this ad = this product" answer (0 = none fits: the seller picks it in Ads).
create or replace function lingo.bot_set_ad(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare
  v_seller bigint := nullif(p->>'lingo_user_id', '')::bigint;
  v_pid bigint := nullif(p->>'product_id', '')::bigint;
begin
  update lingo.bot_ads set match_tried = true where lingo_user_id = v_seller and ad_id = p->>'ad_id';
  if v_pid is not null and exists (select 1 from lingo.seller_products(v_seller) where id = v_pid) then
    update lingo.bot_ads set product_id = v_pid, auto_matched = true
     where lingo_user_id = v_seller and ad_id = p->>'ad_id' and product_id is null;
    update lingo.bot_customers set product_id = v_pid where lingo_user_id = v_seller and phone = p->>'phone';
    return jsonb_build_object('ok', true, 'product_id', v_pid);
  end if;
  return jsonb_build_object('ok', false);
end $$;

-- One message into the batching buffer (+ the AI usage of its voice note / image / ad match).
create or replace function lingo.bot_buffer_add(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare v_id bigint;
begin
  insert into lingo.bot_buffer (lingo_user_id, phone, wa_id, content, quoted_id, tap, wa_ts)
  values ((p->>'lingo_user_id')::bigint, p->>'phone', p->>'wa_id', left(coalesce(p->>'content', ''), 2000),
          nullif(p->>'quoted_id', ''), nullif(p->>'tap', ''), nullif(p->>'wa_ts', '')::bigint)
  returning id into v_id;
  perform lingo.log_usage((p->>'lingo_user_id')::bigint, p->>'phone', p->'usage', coalesce((p->>'test')::boolean, false));
  return jsonb_build_object('id', v_id);
end $$;

-- After the wait: if this is the newest message, take the batch and everything the turn needs.
-- Only the CURRENT product (+ at most 4 the database matched in the text), never the catalogue.
create or replace function lingo.bot_claim(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare
  v_seller bigint := (p->>'lingo_user_id')::bigint;
  v_phone  text := p->>'phone';
  v_buf    bigint := (p->>'buffer_id')::bigint;
  v_msgs   jsonb;
  v_text   text;
  v_taps   bigint[];
  v_cust   lingo.bot_customers;
  v_s      lingo.bot_sellers;
  v_prod   lingo.lingo_products;
begin
  perform pg_advisory_xact_lock(hashtext('lingo-bot:' || v_seller || ':' || v_phone));
  if exists (select 1 from lingo.bot_buffer where lingo_user_id = v_seller and phone = v_phone and id > v_buf) then
    return jsonb_build_object('ok', false, 'why', 'newer message is waiting');
  end if;

  with d as (delete from lingo.bot_buffer where lingo_user_id = v_seller and phone = v_phone and id <= v_buf returning *)
  select jsonb_agg(jsonb_build_object('t', content, 'qid', quoted_id, 'tap', tap, 'wa_id', wa_id) order by coalesce(wa_ts, 0), id),
         string_agg(content, ' ' order by coalesce(wa_ts, 0), id),
         array_agg(substring(tap from '^P_([0-9]+)$')::bigint) filter (where tap ~ '^P_[0-9]+$')
    into v_msgs, v_text, v_taps
    from d;
  if v_msgs is null then return jsonb_build_object('ok', false, 'why', 'already handled'); end if;

  select * into v_cust from lingo.bot_customers where lingo_user_id = v_seller and phone = v_phone;
  select * into v_s from lingo.bot_sellers where lingo_user_id = v_seller;
  select * into v_prod from lingo.seller_products(v_seller) where id = v_cust.product_id;
  v_text := lower(coalesce(v_text, ''));

  return jsonb_build_object(
    'ok', true,
    'msgs', v_msgs,
    'customer', to_jsonb(v_cust) - 'summary',
    'summary', v_cust.summary,
    'history', coalesce((
        select jsonb_agg(jsonb_build_object('id', m.id, 'r', case m.role when 'seller' then 'b' else m.role end,
                                            'c', left(coalesce(nullif(m.note, ''), m.content), 300)) order by m.id)
          from (select * from lingo.bot_messages
                 where lingo_user_id = v_seller and phone = v_phone and id > v_cust.summary_upto
                   and not (role = 'b' and note = '')
                 order by id desc limit 30) m), '[]'::jsonb),
    'product', case when v_prod.id is null then null else to_jsonb(v_prod) end,
    'matches', coalesce((
        with sp as (select * from lingo.seller_products(v_seller)),
        hits as (
          -- aliases / symptoms / full name written in the message
          select sp.id, length(btrim(a)) as score
            from sp, unnest(string_to_array(sp.name || ',' || sp.aliases || ',' || sp.symptoms, ',')) a
           where length(btrim(a)) >= 4 and position(lower(btrim(a)) in v_text) > 0
          union all
          -- distinctive words of product names (words used in 3+ names are ignored)
          select w.id, length(w.w) from (
            select sp.id, regexp_replace(lower(x), 's$', '') as w
              from sp, regexp_split_to_table(sp.name, '\s+') x where length(x) >= 4) w
           where w.w not in (select regexp_replace(lower(x), 's$', '') from sp sp2, regexp_split_to_table(sp2.name, '\s+') x
                              group by 1 having count(distinct sp2.id) >= 3)
             and position(w.w in v_text) > 0
          union all
          select unnest(coalesce(v_taps, '{}'::bigint[])), 1000
          union all
          select pm.product_id, 900 from lingo.bot_product_msgs pm
           where pm.lingo_user_id = v_seller
             and pm.wa_id in (select x->>'qid' from jsonb_array_elements(v_msgs) x where x->>'qid' is not null)
        ),
        top as (
          select id, max(score) as score from hits
           where id is distinct from v_cust.product_id and id in (select id from sp)
           group by id order by max(score) desc limit 4
        )
        select jsonb_agg(to_jsonb(sp) order by top.score desc) from top join sp on sp.id = top.id), '[]'::jsonb),
    'faqs', coalesce((
        select jsonb_agg(jsonb_build_object('id', f.id, 'q', f.question_en, 'v', to_jsonb(f.variants), 'si', f.answer_si, 'en', f.answer_en)
                         order by (f.lingo_user_id is null), f.hits desc, f.id)
          from (select * from lingo.product_faqs f
                 where f.active and v_prod.id is not null
                   and not (f.id = any (v_s.hidden_faqs))
                   and (f.product_id = v_prod.id
                        or (f.product_id is null and f.product_id_feeder = v_prod.feeder_id
                            and (f.lingo_user_id is null or f.lingo_user_id = v_seller)))
                 order by (f.lingo_user_id is null), f.hits desc, f.id limit 15) f), '[]'::jsonb),
    'rules', coalesce((
        select jsonb_agg(jsonb_build_object('id', r.id, 're', r.pattern, 'st', to_jsonb(r.stage_in), 'k', r.k, 't', r.t)
                         order by (r.lingo_user_id is null), r.priority, r.id)
          from lingo.quick_rules r
         where r.enabled and (r.lingo_user_id = v_seller or (r.lingo_user_id is null and not (r.id = any (v_s.disabled_rules))))), '[]'::jsonb),
    'fixed', lingo.fixed_for(v_seller),
    'settings', lingo.seller_settings(v_seller),
    'budget', lingo.seller_budget(v_seller),
    'order', (select to_jsonb(o) from lingo.bot_orders o
               where o.lingo_user_id = v_seller and o.phone = v_phone and o.updated_at > now() - interval '14 days'
               order by o.id desc limit 1),
    'quoted_pids', coalesce((
        select jsonb_object_agg(pm.wa_id, pm.product_id) from lingo.bot_product_msgs pm
         where pm.lingo_user_id = v_seller
           and pm.wa_id in (select x->>'qid' from jsonb_array_elements(v_msgs) x where x->>'qid' is not null)), '{}'::jsonb)
  );
end $$;

-- Older messages → one short summary (the messages stay for the Inbox; the AI only sees the summary + newer ones).
create or replace function lingo.bot_compact(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare
  v_seller bigint := (p->>'lingo_user_id')::bigint;
  v_phone text := p->>'phone';
  v_upto bigint := nullif(p->>'upto', '')::bigint;
  v_cust lingo.bot_customers;
begin
  if coalesce(btrim(p->>'summary'), '') <> '' and v_upto is not null then
    update lingo.bot_customers set summary = left(btrim(p->>'summary'), 400), summary_upto = greatest(summary_upto, v_upto)
     where lingo_user_id = v_seller and phone = v_phone;
  end if;
  select * into v_cust from lingo.bot_customers where lingo_user_id = v_seller and phone = v_phone;
  return jsonb_build_object('summary', v_cust.summary, 'history', coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'r', case m.role when 'seller' then 'b' else m.role end,
                                        'c', left(coalesce(nullif(m.note, ''), m.content), 300)) order by m.id)
      from (select * from lingo.bot_messages
             where lingo_user_id = v_seller and phone = v_phone and id > v_cust.summary_upto and not (role = 'b' and note = '')
             order by id desc limit 30) m), '[]'::jsonb));
end $$;

-- A saved reply-AI answer for these facts, topic, language and question.
create or replace function lingo.bot_cache_get(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare v_key text := lingo.cache_key(p->>'facts_hash', p->>'t', p->>'lang', p->>'q'); v_answer text;
begin
  select answer into v_answer from lingo.answer_cache where key = v_key;
  return jsonb_build_object('hit', v_answer is not null, 'key', v_key, 'answer', v_answer);
end $$;

-- Save one finished turn. Prices and totals come from the product row, never from the AI.
create or replace function lingo.bot_save_turn(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare
  v_seller   bigint := (p->>'lingo_user_id')::bigint;
  v_phone    text := p->>'phone';
  v_test     boolean := coalesce((p->>'test')::boolean, false);
  v_order    jsonb := p->'order';
  v_ho       jsonb := p->'handoff';
  v_order_id bigint;
  v_old      lingo.bot_orders;
  v_seen     bigint[];
  v_pid      bigint;
  v_qty      int;
  v_prod     lingo.lingo_products;
  v_status   text;
  v_first    boolean := true;
  v_s        lingo.bot_sellers;
  v_cost     numeric := 0;
  x          jsonb;
begin
  select * into v_s from lingo.bot_sellers where lingo_user_id = v_seller;
  if v_s.lingo_user_id is null or not exists (select 1 from lingo.bot_customers where lingo_user_id = v_seller and phone = v_phone) then
    return jsonb_build_object('ok', false, 'why', 'unknown chat');
  end if;

  -- The customer's messages (one row each), then what we sent (one row per WhatsApp message).
  for x in select * from jsonb_array_elements(coalesce(p->'msgs', '[]'::jsonb)) loop
    insert into lingo.bot_messages (lingo_user_id, phone, role, content, wa_id)
    values (v_seller, v_phone, 'c', left(coalesce(nullif(x->>'t', ''), '[media]'), 2000), nullif(x->>'wa_id', ''));
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'sent', '[]'::jsonb)) loop
    insert into lingo.bot_messages (lingo_user_id, phone, role, content, note, meta, wa_id, status, route)
    values (v_seller, v_phone, 'b', left(coalesce(nullif(x->>'text', ''), '…'), 4096),
            case when v_first then left(coalesce(p->>'log', ''), 600) else '' end,
            case when v_first then p->'meta' end, nullif(x->>'wa_id', ''),
            case when x->>'error' is not null then 'failed' when nullif(x->>'wa_id', '') is not null then 'sent' end,
            case when v_first then nullif(p->>'route', '') end);
    if x->>'error' is not null then
      insert into lingo.bot_events (lingo_user_id, phone, type, detail) values (v_seller, v_phone, 'send_failed', jsonb_build_object('error', left(x->>'error', 500)));
    end if;
    v_first := false;
  end loop;

  select coalesce(array_agg(v::bigint), '{}') into v_seen from jsonb_array_elements_text(coalesce(p->'seen_add', '[]'::jsonb)) v;
  update lingo.bot_customers c set
    product_id    = coalesce(nullif(p->>'product_id', '')::bigint, c.product_id),
    seen_products = (select coalesce(array_agg(distinct s), '{}') from unnest(c.seen_products || v_seen) s),
    lang          = coalesce(nullif(p->>'lang', ''), c.lang),
    stage         = coalesce(nullif(p->>'stage', ''), c.stage),
    unsure_streak = case when coalesce((p->>'unsure')::boolean, false) then c.unsure_streak + 1 else 0 end,
    last_msg_at   = now()
  where c.lingo_user_id = v_seller and c.phone = v_phone;

  if jsonb_typeof(v_ho) = 'object' then
    update lingo.bot_customers
       set stage = 'handoff', needs_seller = true, handoff_reason = left(v_ho->>'reason', 200),
           paused_until = now() + make_interval(hours => v_s.handoff_pause_hours), unsure_streak = 0
     where lingo_user_id = v_seller and phone = v_phone;
    insert into lingo.bot_events (lingo_user_id, phone, type, detail) values (v_seller, v_phone, 'handoff', v_ho);
  end if;

  if jsonb_typeof(v_order) = 'object' then
    v_pid := nullif(v_order->>'product_id', '')::bigint;
    v_qty := least(greatest(coalesce(nullif(v_order->>'qty', '')::int, 1), 1), 99);
    v_status := coalesce(nullif(v_order->>'status', ''), 'draft');
    if v_status not in ('draft', 'confirmed', 'cancelled') then v_status := 'draft'; end if;
    select * into v_prod from lingo.seller_products(v_seller) where id = v_pid;
    if nullif(v_order->>'id', '') is not null then
      select * into v_old from lingo.bot_orders where id = (v_order->>'id')::bigint and lingo_user_id = v_seller and phone = v_phone for update;
    end if;
    if v_old.id is not null then
      update lingo.bot_orders set
        product_id = coalesce(v_prod.id, product_id), product_id_feeder = coalesce(v_prod.feeder_id, product_id_feeder),
        product_name = coalesce(v_prod.name, product_name), qty = v_qty,
        name = left(v_order->>'name', 80), address = left(v_order->>'address', 300), contact = left(v_order->>'contact', 40),
        unit_price = coalesce(v_prod.price, unit_price), delivery_fee = coalesce(v_prod.delivery_fee, delivery_fee),
        total = coalesce(v_prod.price, unit_price) * v_qty + coalesce(v_prod.delivery_fee, delivery_fee, 0),
        status = v_status,
        confirmed_at = case when v_status = 'confirmed' and v_old.status <> 'confirmed' then now() else confirmed_at end,
        feeder_sync = case when v_status = 'confirmed' and v_old.status <> 'confirmed' then 'pending' else feeder_sync end
       where id = v_old.id
      returning id into v_order_id;
    else
      insert into lingo.bot_orders (lingo_user_id, phone, product_id, product_id_feeder, product_name, qty, name, address, contact,
                                    unit_price, delivery_fee, total, status, ad_id, test, confirmed_at)
      values (v_seller, v_phone, v_prod.id, v_prod.feeder_id, v_prod.name, v_qty, left(v_order->>'name', 80), left(v_order->>'address', 300),
              left(v_order->>'contact', 40), v_prod.price, v_prod.delivery_fee, v_prod.price * v_qty + coalesce(v_prod.delivery_fee, 0),
              v_status, (select ad_id from lingo.bot_customers where lingo_user_id = v_seller and phone = v_phone), v_test,
              case when v_status = 'confirmed' then now() end)
      returning id into v_order_id;
    end if;
    if v_status = 'confirmed' and coalesce(v_old.status, '') <> 'confirmed' then
      insert into lingo.bot_events (lingo_user_id, phone, type, detail) values (v_seller, v_phone, 'order_confirmed', jsonb_build_object('order_id', v_order_id));
    elsif v_status = 'cancelled' and coalesce(v_old.status, '') <> 'cancelled' then
      insert into lingo.bot_events (lingo_user_id, phone, type, detail) values (v_seller, v_phone, 'order_cancelled', jsonb_build_object('order_id', v_order_id));
    end if;
  end if;

  insert into lingo.bot_product_msgs (wa_id, lingo_user_id, phone, product_id)
  select x2->>'wa_id', v_seller, v_phone, (x2->>'product_id')::bigint
    from jsonb_array_elements(coalesce(p->'product_msgs', '[]'::jsonb)) x2
   where coalesce(x2->>'wa_id', '') <> '' and coalesce(x2->>'product_id', '') <> ''
  on conflict (wa_id) do nothing;

  if nullif(p->>'faq_id', '') is not null then
    update lingo.product_faqs set hits = hits + 1 where id = (p->>'faq_id')::bigint;
  end if;
  if nullif(p->>'rule_id', '') is not null then
    update lingo.quick_rules set hits = hits + 1 where id = (p->>'rule_id')::bigint;
  end if;
  if nullif(p->>'cache_key', '') is not null then
    update lingo.answer_cache set hits = hits + 1, last_hit_at = now() where key = p->>'cache_key';
  end if;
  if jsonb_typeof(p->'cache_put') = 'object' and coalesce(p->'cache_put'->>'answer', '') <> '' then
    insert into lingo.answer_cache (key, product_id_feeder, product_id, facts_hash, t, lang, q, answer)
    values (lingo.cache_key(p->'cache_put'->>'facts_hash', p->'cache_put'->>'t', p->'cache_put'->>'lang', p->'cache_put'->>'q'),
            nullif(p->'cache_put'->>'product_id_feeder', '')::int, nullif(p->'cache_put'->>'product_id', '')::bigint,
            p->'cache_put'->>'facts_hash', p->'cache_put'->>'t', p->'cache_put'->>'lang', left(p->'cache_put'->>'q', 200),
            left(p->'cache_put'->>'answer', 1000))
    on conflict (key) do nothing;
  end if;

  v_cost := lingo.log_usage(v_seller, v_phone, p->'usage', v_test);
  if not v_test and (v_s.budget_warned_at is null or v_s.budget_warned_at < date_trunc('month', now())) then
    if (lingo.seller_budget(v_seller)->>'warn')::boolean then
      update lingo.bot_sellers set budget_warned_at = now() where lingo_user_id = v_seller;
      insert into lingo.bot_events (lingo_user_id, type, detail) values (v_seller, 'budget_warning', lingo.seller_budget(v_seller));
    end if;
  end if;
  return jsonb_build_object('ok', true, 'order_id', v_order_id, 'cost_usd', v_cost);
end $$;

-- Hand a chat to the seller (errors, guard failures).
create or replace function lingo.bot_handoff(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare v_seller bigint := (p->>'lingo_user_id')::bigint; v_hours int;
begin
  select handoff_pause_hours into v_hours from lingo.bot_sellers where lingo_user_id = v_seller;
  update lingo.bot_customers
     set stage = 'handoff', needs_seller = true, handoff_reason = left(coalesce(p->>'reason', 'error'), 200),
         paused_until = now() + make_interval(hours => coalesce(v_hours, 12))
   where lingo_user_id = v_seller and phone = p->>'phone';
  insert into lingo.bot_events (lingo_user_id, phone, type, detail) values (v_seller, p->>'phone', 'handoff', p - 'lingo_user_id' - 'phone');
  return jsonb_build_object('ok', found);
end $$;

-- Delivery statuses (sent / delivered / read / failed) and Meta's pricing for each message.
create or replace function lingo.bot_statuses(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare v_seller bigint := (p->>'lingo_user_id')::bigint; x jsonb; v_n int := 0;
begin
  update lingo.wa_numbers set last_webhook_at = now() where lingo_user_id = v_seller;
  for x in select * from jsonb_array_elements(coalesce(p->'statuses', '[]'::jsonb)) loop
    update lingo.bot_messages
       set status = case when status = 'read' and x->>'status' in ('sent', 'delivered') then status
                         when status = 'delivered' and x->>'status' = 'sent' then status else left(x->>'status', 20) end,
           billable = coalesce((x->>'billable')::boolean, billable),
           pricing_category = coalesce(nullif(x->>'category', ''), pricing_category)
     where lingo_user_id = v_seller and wa_id = x->>'id';
    v_n := v_n + 1;
    if x->>'status' = 'failed' then
      insert into lingo.bot_events (lingo_user_id, phone, type, detail)
      values (v_seller, x->>'recipient', 'send_failed', jsonb_build_object('wa_id', x->>'id', 'error', left(x->>'error', 500)));
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'n', v_n);
end $$;

-- The seller answered from the WhatsApp Business app (coexistence): keep it and pause the bot for that chat.
create or replace function lingo.bot_echo(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare v_seller bigint := (p->>'lingo_user_id')::bigint; x jsonb; v_hours int;
begin
  select handoff_pause_hours into v_hours from lingo.bot_sellers where lingo_user_id = v_seller;
  update lingo.wa_numbers set last_webhook_at = now() where lingo_user_id = v_seller;
  for x in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    if exists (select 1 from lingo.bot_customers where lingo_user_id = v_seller and phone = x->>'to') then
      insert into lingo.bot_messages (lingo_user_id, phone, role, content, wa_id, status)
      values (v_seller, x->>'to', 'seller', left(coalesce(nullif(x->>'text', ''), '[media]'), 4096), nullif(x->>'id', ''), 'sent');
      update lingo.bot_customers set paused_until = now() + make_interval(hours => coalesce(v_hours, 12)), needs_seller = false, last_msg_at = now()
       where lingo_user_id = v_seller and phone = x->>'to';
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- Follow-ups: chats quiet for the seller's hours (default 5), once each, inside WhatsApp's 24 h window and the
-- seller's sending hours. The texts are filled in here and saved as bot messages; n8n sends them.
create or replace function lingo.bot_due_followups(p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare v_items jsonb;
begin
  with sellers as (
    select s.*, u.business_name, n.phone_number_id, n.token_secret_id,
           coalesce((s.followups->>'hours')::int, 5) as hrs,
           coalesce((s.followups->>'from')::int, 8) as h_from,
           coalesce((s.followups->>'to')::int, 21) as h_to
      from lingo.bot_sellers s
      join lingo.lingo_users u on u.id = s.lingo_user_id
      join lingo.wa_numbers n on n.lingo_user_id = s.lingo_user_id and n.status in ('connected', 'problem') and n.token_secret_id is not null
     where s.status = 'live'
  ),
  due as (
    select c.lingo_user_id, c.phone, c.name, c.lang, c.product_id, c.notified_at as prev_notified, s.hrs
      from lingo.bot_customers c
      join sellers s on s.lingo_user_id = c.lingo_user_id
     where not c.test
       and c.stage <> 'handoff'
       and (c.paused_until is null or c.paused_until < now())
       and c.last_msg_at < now() - make_interval(hours => s.hrs)
       and c.last_in_at > now() - interval '23 hours'
       and (c.notified_at is null or c.notified_at < c.last_msg_at)
       and extract(hour from now() at time zone s.timezone) >= s.h_from
       and extract(hour from now() at time zone s.timezone) < s.h_to
     order by c.last_msg_at
     limit least(coalesce((p->>'limit')::int, 50), 200)
     for update of c skip locked
  ),
  marked as (
    update lingo.bot_customers c set notified_at = now() from due where c.lingo_user_id = due.lingo_user_id and c.phone = due.phone returning c.phone
  ),
  info as (
    select due.*, o.status as o_status, o.updated_at as o_updated, o.name as o_name, o.product_id as o_pid
      from due
      left join lateral (select * from lingo.bot_orders o where o.lingo_user_id = due.lingo_user_id and o.phone = due.phone order by o.id desc limit 1) o on true
  ),
  kinds as (
    select i.*, s.business_name, s.phone_number_id, s.token_secret_id, s.delivery_days, s.shop_phone, s.followups,
           case
             when i.o_updated is not null and i.o_updated > coalesce(i.prev_notified, '-infinity'::timestamptz) then
               case i.o_status when 'confirmed' then 'notify_confirmed' when 'cancelled' then 'notify_cancelled' else 'notify_no_order' end
             when i.o_status = 'confirmed' and i.o_updated > now() - interval '7 days' then 'skip'
             else 'notify_no_order' end as kind
      from info i join sellers s on s.lingo_user_id = i.lingo_user_id
  ),
  wanted as (
    select k.*, lingo.fixed_for(k.lingo_user_id) as fx,
           (select p2.name from lingo.lingo_products p2 where p2.id = coalesce(k.o_pid, k.product_id)) as product
      from kinds k
     where k.kind <> 'skip'
       and coalesce((k.followups->>(case k.kind when 'notify_confirmed' then 'confirmed' when 'notify_cancelled' then 'cancelled' else 'no_order' end))::boolean, true)
  ),
  rendered as (
    select w.*, btrim(regexp_replace(
             replace(replace(replace(replace(replace(
               coalesce(case when w.lang = 'en' then nullif(w.fx->w.kind->>'en', '') end, w.fx->w.kind->>'si', ''),
               '{name}', coalesce(w.o_name, w.name, '')), '{product}', coalesce(w.product, case when w.lang = 'en' then 'our products' else 'අපේ products' end)),
               '{business}', coalesce(w.business_name, '')), '{delivery_days}', w.delivery_days::text), '{shop_phone}', coalesce(w.shop_phone, '')),
             '[ \t]{2,}', ' ', 'g')) as body,
           coalesce(case when w.lang = 'en' then nullif(w.fx->'btn_order'->>'en', '') end, w.fx->'btn_order'->>'si', 'Order') as btn
      from wanted w
  ),
  saved as (
    insert into lingo.bot_messages (lingo_user_id, phone, role, content, note, route)
    select r.lingo_user_id, r.phone, 'b', r.body, '[follow-up: ' || r.kind || ']', 'fixed' from rendered r where r.body <> ''
    returning id, lingo_user_id, phone
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'msg_id', sv.id, 'lingo_user_id', r.lingo_user_id, 'phone_number_id', r.phone_number_id,
           'token', (select decrypted_secret from vault.decrypted_secrets where id = r.token_secret_id),
           'to', r.phone, 'kind', r.kind, 'text', r.body, 'button', left(r.btn, 20))), '[]'::jsonb)
    into v_items
    from rendered r join saved sv on sv.lingo_user_id = r.lingo_user_id and sv.phone = r.phone;
  return jsonb_build_object('items', v_items);
end $$;

-- WhatsApp ids of messages sent after they were saved (follow-ups), for delivery statuses.
create or replace function lingo.bot_set_wa_ids(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare x jsonb;
begin
  for x in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    update lingo.bot_messages
       set wa_id = coalesce(nullif(x->>'wa_id', ''), wa_id),
           status = case when x->>'error' is not null then 'failed' when nullif(x->>'wa_id', '') is not null then 'sent' else status end
     where id = (x->>'msg_id')::bigint;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- Number health (every 6 h from n8n, and "Test connection" in the panel).
create or replace function lingo.bot_numbers_to_check(p jsonb default '{}') returns jsonb
language sql stable security definer set search_path = lingo, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('phone_number_id', n.phone_number_id, 'waba_id', n.waba_id,
           'token', (select decrypted_secret from vault.decrypted_secrets where id = n.token_secret_id))), '[]'::jsonb)
    from lingo.wa_numbers n
   where n.status in ('connected', 'problem') and n.token_secret_id is not null;
$$;

create or replace function lingo.bot_save_check(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare v_ok boolean := coalesce((p->>'ok')::boolean, false); i jsonb := coalesce(p->'info', '{}'::jsonb); v_prev text;
begin
  select status into v_prev from lingo.wa_numbers where phone_number_id = p->>'phone_number_id';
  update lingo.wa_numbers set
    status = case when status = 'disabled' then status when v_ok then 'connected' else 'problem' end,
    display_phone = coalesce(nullif(i->>'display_phone_number', ''), display_phone),
    verified_name = coalesce(nullif(i->>'verified_name', ''), verified_name),
    quality_rating = coalesce(nullif(i->>'quality_rating', ''), quality_rating),
    problem = case when v_ok then null else left(coalesce(p->>'error', 'WhatsApp did not answer'), 300) end,
    last_check_at = now(), last_check = i
  where phone_number_id = p->>'phone_number_id';
  if v_prev is distinct from (case when v_ok then 'connected' else 'problem' end) and v_prev is not null then
    insert into lingo.bot_events (lingo_user_id, type, detail)
    select lingo_user_id, case when v_ok then 'number_ok' else 'number_problem' end, jsonb_build_object('error', left(p->>'error', 300))
      from lingo.wa_numbers where phone_number_id = p->>'phone_number_id';
  end if;
  return jsonb_build_object('ok', found);
end $$;

-- =====================================================================
-- Panel functions (feeder.retexia.com, service role)
-- =====================================================================

-- The seller account of a Retexia login: their existing Lingo account, or a new one.
create or replace function lingo.ensure_seller(p_user uuid, p_name text default null) returns bigint
language plpgsql security definer set search_path = lingo, public as $$
declare v_id bigint;
begin
  select lingo_user_id into v_id from lingo.bot_sellers where user_id = p_user;
  if v_id is not null then return v_id; end if;
  select id into v_id from lingo.lingo_users u
   where u.owner_id = p_user and not exists (select 1 from lingo.bot_sellers s where s.lingo_user_id = u.id)
   order by id limit 1;
  if v_id is null then
    insert into lingo.lingo_users (owner_id, business_name, default_language, content_language)
    values (p_user, coalesce(nullif(btrim(p_name), ''), 'My shop'), 'si', 'si') returning id into v_id;
  end if;
  insert into lingo.bot_sellers (lingo_user_id, user_id) values (v_id, p_user) on conflict do nothing;
  return v_id;
end $$;

-- Every Feeder product the seller sells (My products) becomes a Lingo product (fields empty = shared content).
create or replace function lingo.sync_feeder_products(p_seller bigint) returns int
language plpgsql security definer set search_path = lingo, public as $$
declare v_n int;
begin
  insert into lingo.products (lingo_user_id, product_name, price, product_id_feeder, active)
  select p_seller, fp.product_name, 0, fp.product_id, true
    from lingo.bot_sellers s
    join feeder.customer_products cp on cp.user_id = s.user_id
    join feeder.products fp on fp.product_id = cp.product_id and fp.active
   where s.lingo_user_id = p_seller
     and not exists (select 1 from lingo.products p where p.lingo_user_id = p_seller and p.product_id_feeder = fp.product_id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Save the seller's WhatsApp number; tokens and app secrets go to Vault (only the last 4 characters are kept here).
create or replace function lingo.save_wa_number(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare
  v_seller bigint := (p->>'lingo_user_id')::bigint;
  v_pnid text := btrim(coalesce(p->>'phone_number_id', ''));
  v_waba text := nullif(btrim(coalesce(p->>'waba_id', '')), '');
  v_token text := nullif(btrim(coalesce(p->>'token', '')), '');
  v_app text := nullif(btrim(coalesce(p->>'app_secret', '')), '');
  n lingo.wa_numbers;
  v_tid uuid; v_aid uuid; v_changed boolean;
begin
  if v_pnid !~ '^[0-9]{6,25}$' then return jsonb_build_object('ok', false, 'error', 'phone_number_id'); end if;
  if v_waba is not null and v_waba !~ '^[0-9]{6,25}$' then return jsonb_build_object('ok', false, 'error', 'waba_id'); end if;
  if exists (select 1 from lingo.wa_numbers where phone_number_id = v_pnid and lingo_user_id <> v_seller) then
    return jsonb_build_object('ok', false, 'error', 'taken');
  end if;
  select * into n from lingo.wa_numbers where lingo_user_id = v_seller;
  if n.phone_number_id is null and (v_token is null or v_app is null) then
    return jsonb_build_object('ok', false, 'error', 'secrets');
  end if;
  v_tid := n.token_secret_id; v_aid := n.app_secret_id;
  if v_token is not null then
    if v_tid is null then v_tid := vault.create_secret(v_token, 'lingo_wa_token_' || v_seller || '_' || replace(gen_random_uuid()::text, '-', ''), 'Lingo WhatsApp token');
    else perform vault.update_secret(v_tid, v_token); end if;
  end if;
  if v_app is not null then
    if v_aid is null then v_aid := vault.create_secret(v_app, 'lingo_wa_app_' || v_seller || '_' || replace(gen_random_uuid()::text, '-', ''), 'Lingo WhatsApp app secret');
    else perform vault.update_secret(v_aid, v_app); end if;
  end if;
  v_changed := n.phone_number_id is null or n.phone_number_id <> v_pnid or n.waba_id is distinct from v_waba or v_token is not null or v_app is not null;
  if n.phone_number_id is null then
    insert into lingo.wa_numbers (phone_number_id, lingo_user_id, waba_id, token_secret_id, app_secret_id, token_last4)
    values (v_pnid, v_seller, v_waba, v_tid, v_aid, right(v_token, 4))
    returning * into n;
  else
    update lingo.wa_numbers set
      phone_number_id = v_pnid, waba_id = v_waba, token_secret_id = v_tid, app_secret_id = v_aid,
      token_last4 = coalesce(right(v_token, 4), token_last4),
      status = case when v_changed and status <> 'disabled' then 'pending' else status end,
      last_webhook_at = case when n.phone_number_id <> v_pnid then null else last_webhook_at end,
      display_phone = case when n.phone_number_id <> v_pnid then null else display_phone end,
      verified_name = case when n.phone_number_id <> v_pnid then null else verified_name end,
      problem = case when v_changed then null else problem end
    where lingo_user_id = v_seller
    returning * into n;
  end if;
  insert into lingo.bot_events (lingo_user_id, type, detail) values (v_seller, 'number_saved',
    jsonb_build_object('phone_number_id', v_pnid, 'token_replaced', v_token is not null, 'app_secret_replaced', v_app is not null));
  return jsonb_build_object('ok', true, 'phone_number_id', n.phone_number_id, 'status', n.status, 'verify_token', n.verify_token);
end $$;

create or replace function lingo.remove_wa_number(p_seller bigint) returns jsonb
language plpgsql security definer set search_path = lingo, public as $$
declare n lingo.wa_numbers;
begin
  delete from lingo.wa_numbers where lingo_user_id = p_seller returning * into n;
  if n.phone_number_id is not null then
    delete from vault.secrets where id in (n.token_secret_id, n.app_secret_id);
    update lingo.bot_sellers set status = case when status = 'live' then 'setup' else status end where lingo_user_id = p_seller;
    insert into lingo.bot_events (lingo_user_id, type, detail) values (p_seller, 'number_removed', jsonb_build_object('phone_number_id', n.phone_number_id));
  end if;
  return jsonb_build_object('ok', n.phone_number_id is not null);
end $$;

-- Dashboard numbers for one seller (no test chats).
create or replace function lingo.panel_overview(p_seller bigint, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = lingo, public as $$
declare v_tz text; v_today timestamptz; v_from timestamptz; r jsonb;
begin
  select timezone into v_tz from lingo.bot_sellers where lingo_user_id = p_seller;
  v_tz := coalesce(v_tz, 'Asia/Colombo');
  v_today := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_from := now() - make_interval(days => greatest(p_days, 1));
  select jsonb_build_object(
    'chats_today', (select count(*) from lingo.bot_customers c where c.lingo_user_id = p_seller and not c.test and c.last_in_at >= v_today),
    'new_today', (select count(*) from lingo.bot_customers c where c.lingo_user_id = p_seller and not c.test and c.created_at >= v_today),
    'orders_today', (select count(*) from lingo.bot_orders o where o.lingo_user_id = p_seller and not o.test and o.status = 'confirmed' and o.confirmed_at >= v_today),
    'chats_period', (select count(*) from lingo.bot_customers c where c.lingo_user_id = p_seller and not c.test and c.created_at >= v_from),
    'orders_period', (select count(*) from lingo.bot_orders o where o.lingo_user_id = p_seller and not o.test and o.status = 'confirmed' and o.confirmed_at >= v_from),
    'sales_period', (select coalesce(sum(total), 0) from lingo.bot_orders o where o.lingo_user_id = p_seller and not o.test and o.status = 'confirmed' and o.confirmed_at >= v_from),
    'needs_you', (select count(*) from lingo.bot_customers c where c.lingo_user_id = p_seller and not c.test and c.needs_seller),
    'to_export', (select count(*) from lingo.bot_orders o where o.lingo_user_id = p_seller and not o.test and o.status = 'confirmed' and o.feeder_sync = 'pending'),
    'ai_today', (select coalesce(sum(cost_usd), 0) from lingo.ai_usage a where a.lingo_user_id = p_seller and a.created_at >= v_today),
    'budget', lingo.seller_budget(p_seller),
    'routes', coalesce((select jsonb_object_agg(route, n) from (
        select m.route, count(*) as n from lingo.bot_messages m join lingo.bot_customers c on c.lingo_user_id = m.lingo_user_id and c.phone = m.phone
         where m.lingo_user_id = p_seller and not c.test and m.route is not null and m.created_at >= v_from group by m.route) x), '{}'::jsonb),
    'ai_by_stage', coalesce((select jsonb_object_agg(stage, cost) from (
        select stage, round(sum(cost_usd), 6) as cost from lingo.ai_usage a where a.lingo_user_id = p_seller and a.created_at >= v_from group by stage) x), '{}'::jsonb),
    'ai_period', (select coalesce(sum(cost_usd), 0) from lingo.ai_usage a where a.lingo_user_id = p_seller and a.created_at >= v_from and not a.test),
    'billable', (select count(*) from lingo.bot_messages m where m.lingo_user_id = p_seller and m.billable and m.created_at >= v_from),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'messages', d.messages, 'orders', d.orders) order by d.day) from (
        select g.day::date as day,
               (select count(*) from lingo.bot_messages m join lingo.bot_customers c on c.lingo_user_id = m.lingo_user_id and c.phone = m.phone
                 where m.lingo_user_id = p_seller and not c.test and m.role = 'c'
                   and (m.created_at at time zone v_tz)::date = g.day::date) as messages,
               (select count(*) from lingo.bot_orders o where o.lingo_user_id = p_seller and not o.test and o.status = 'confirmed'
                   and (o.confirmed_at at time zone v_tz)::date = g.day::date) as orders
          from generate_series((now() at time zone v_tz)::date - 13, (now() at time zone v_tz)::date, interval '1 day') g(day)) d), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Inbox: chats with their last message, newest first.
create or replace function lingo.panel_inbox(p_seller bigint, p_filter text default 'all', p_limit int default 100) returns jsonb
language sql stable security definer set search_path = lingo, public as $$
  select coalesce(jsonb_agg(x order by x->>'last_msg_at' desc nulls last), '[]'::jsonb) from (
    select jsonb_build_object(
             'phone', c.phone, 'name', c.name, 'stage', c.stage, 'needs_seller', c.needs_seller, 'handoff_reason', c.handoff_reason,
             'paused_until', c.paused_until, 'last_in_at', c.last_in_at, 'last_msg_at', c.last_msg_at, 'lang', c.lang,
             'product', (select p.name from lingo.lingo_products p where p.id = c.product_id),
             'last', (select jsonb_build_object('role', m.role, 'content', left(m.content, 120), 'at', m.created_at)
                        from lingo.bot_messages m where m.lingo_user_id = c.lingo_user_id and m.phone = c.phone order by m.id desc limit 1)) as x
      from lingo.bot_customers c
     where c.lingo_user_id = p_seller and not c.test
       and case p_filter
             when 'needs' then c.needs_seller
             when 'ordering' then c.stage in ('collecting', 'confirming')
             when 'ordered' then c.stage = 'ordered'
             else true end
     order by c.last_msg_at desc nulls last
     limit least(greatest(p_limit, 1), 300)) t;
$$;

-- Admin (admin.retexia.com → Products → Feeder → Lingo): every seller with this month's numbers.
create or replace function lingo.admin_sellers() returns jsonb
language sql stable security definer set search_path = lingo, public as $$
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'lingo_user_id', s.lingo_user_id, 'user_id', s.user_id, 'business', u.business_name, 'status', s.status,
      'budget', s.ai_monthly_budget_usd, 'created_at', s.created_at,
      'number', (select jsonb_build_object('display_phone', n.display_phone, 'phone_number_id', n.phone_number_id, 'status', n.status, 'problem', n.problem,
                                           'last_webhook_at', n.last_webhook_at, 'quality_rating', n.quality_rating)
                   from lingo.wa_numbers n where n.lingo_user_id = s.lingo_user_id),
      'chats_30d', (select count(*) from lingo.bot_customers c where c.lingo_user_id = s.lingo_user_id and not c.test and c.created_at > now() - interval '30 days'),
      'orders_30d', (select count(*) from lingo.bot_orders o where o.lingo_user_id = s.lingo_user_id and not o.test and o.status = 'confirmed' and o.confirmed_at > now() - interval '30 days'),
      'needs_you', (select count(*) from lingo.bot_customers c where c.lingo_user_id = s.lingo_user_id and not c.test and c.needs_seller),
      'ai', lingo.seller_budget(s.lingo_user_id)) as x
      from lingo.bot_sellers s join lingo.lingo_users u on u.id = s.lingo_user_id) t;
$$;

-- Weekly report: AI cost, the questions the reply AI answered most (FAQ ideas), problems.
create or replace function lingo.admin_report(p_days int default 7) returns jsonb
language sql stable security definer set search_path = lingo, public as $$
  select jsonb_build_object(
    'ai_month', (select coalesce(sum(cost_usd), 0) from lingo.ai_usage where created_at >= date_trunc('month', now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo'),
    'ai_period', (select coalesce(sum(cost_usd), 0) from lingo.ai_usage where created_at > now() - make_interval(days => p_days)),
    'by_stage', coalesce((select jsonb_object_agg(stage, c) from (select stage, round(sum(cost_usd), 4) c from lingo.ai_usage where created_at > now() - make_interval(days => p_days) group by stage) x), '{}'::jsonb),
    'routes', coalesce((select jsonb_object_agg(route, n) from (select route, count(*) n from lingo.bot_messages where route is not null and created_at > now() - make_interval(days => p_days) group by route) x), '{}'::jsonb),
    'top_ai_questions', coalesce((select jsonb_agg(jsonb_build_object('q', q, 'n', n) order by n desc) from (
        select lower(meta->>'q') as q, count(*) n from lingo.bot_messages
         where route = 'ai' and coalesce(meta->>'q', '') <> '' and created_at > now() - make_interval(days => p_days)
         group by 1 order by 2 desc limit 20) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', type, 'lingo_user_id', lingo_user_id, 'detail', detail, 'at', created_at) order by created_at desc) from (
        select * from lingo.bot_events where type in ('unknown_number', 'send_failed', 'number_problem', 'budget_warning')
           and created_at > now() - make_interval(days => p_days) order by created_at desc limit 40) e), '[]'::jsonb));
$$;

-- =====================================================================
-- Grants: only the service role runs these
-- =====================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'lingo.seller_products(bigint)', 'lingo.seller_settings(bigint)', 'lingo.fixed_for(bigint)', 'lingo.seller_budget(bigint)',
    'lingo.log_usage(bigint,text,jsonb,boolean)', 'lingo.bot_number(jsonb)', 'lingo.bot_verify_token(jsonb)', 'lingo.bot_gate(jsonb)',
    'lingo.bot_set_ad(jsonb)', 'lingo.bot_buffer_add(jsonb)', 'lingo.bot_claim(jsonb)', 'lingo.bot_compact(jsonb)',
    'lingo.bot_cache_get(jsonb)', 'lingo.bot_save_turn(jsonb)', 'lingo.bot_handoff(jsonb)', 'lingo.bot_statuses(jsonb)',
    'lingo.bot_echo(jsonb)', 'lingo.bot_due_followups(jsonb)', 'lingo.bot_set_wa_ids(jsonb)', 'lingo.bot_numbers_to_check(jsonb)',
    'lingo.bot_save_check(jsonb)', 'lingo.ensure_seller(uuid,text)', 'lingo.sync_feeder_products(bigint)', 'lingo.save_wa_number(jsonb)',
    'lingo.remove_wa_number(bigint)', 'lingo.panel_overview(bigint,int)', 'lingo.panel_inbox(bigint,text,int)',
    'lingo.admin_sellers()', 'lingo.admin_report(int)']
  loop
    execute format('revoke execute on function %s from public', f);
    execute format('revoke execute on function %s from anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
grant execute on function lingo.cache_key(text, text, text, text) to service_role;

-- =====================================================================
-- Seeds
-- =====================================================================

-- Shared content per Feeder product, from the most complete existing Lingo product.
insert into lingo.product_content (product_id_feeder, short_description, long_description, ingredients, application, precautions, symptoms, aliases, word_description, picture_url)
select distinct on (p.product_id_feeder) p.product_id_feeder, p.short_description, left(p.long_description, 4000), p.ingredients, p.application,
       p.precautions, p.symptoms, p.aliases, p.word_description, case when p.picture_url ~ '^https://' then p.picture_url end
  from lingo.products p
 where p.product_id_feeder is not null and p.product_id_feeder > 0 and p.active
 order by p.product_id_feeder,
          (coalesce(length(p.long_description), 0) + coalesce(length(p.application), 0) + coalesce(length(p.precautions), 0) + coalesce(length(p.picture_url), 0) * 10) desc,
          p.id
on conflict (product_id_feeder) do nothing;

-- Starter FAQs: only what the product's usage and precautions say, word for word.
insert into lingo.product_faqs (product_id_feeder, question_en, variants, answer_si, source)
select c.product_id_feeder, q.question, q.variants, left(btrim(q.answer), 1000), 'starter'
  from lingo.product_content c
 cross join lateral (values
   ('How do I use it?', array['use karanne kohomada', 'bonne kohomada', 'ganna widiha', 'පාවිච්චි කරන්නේ කොහොමද', 'බොන්නේ කොහොමද'], c.application),
   ('Can pregnant or breastfeeding women use it?', array['pregnant ayata puluwanda', 'ගැබිණි අයට පුළුවන්ද', 'kiri dena ammala'], c.precautions),
   ('Can I use it with other medicines?', array['wena beheth ekka', 'beheth bonawa', 'වෙනත් බෙහෙත් එක්ක'], c.precautions),
   ('Is it safe for children?', array['lamainta puluwanda', 'ළමයින්ට පුළුවන්ද'], c.precautions)
 ) as q(question, variants, answer)
 where nullif(btrim(coalesce(q.answer, '')), '') is not null
   and not exists (select 1 from lingo.product_faqs f where f.product_id_feeder = c.product_id_feeder and f.source = 'starter' and f.question_en = q.question);

-- Level-0 quick rules (JavaScript regex, case-insensitive, whole message after punctuation and emojis are removed).
insert into lingo.quick_rules (lingo_user_id, pattern, stage_in, k, t, priority, note)
select null, v.pattern, v.stage_in, v.k, v.t, v.priority, v.note
  from (values
    ('^(hi+|hello+|hey+|helo+|hai|ආයුබෝවන්|හායි|හලෝ|good (morning|evening|night|afternoon))$', '{}'::text[], 'chat', null, 10, 'Greeting'),
    ('^(hello )?(can i get|i want|send( me)?) (more )?(info|information|details)( on| about)?( this)?( please)?$', '{}'::text[], 'chat', null, 10, 'Click-to-WhatsApp pre-filled message'),
    ('^(more info|more details|details|wisthara|wistara|විස්තර|විස්තර දෙන්න|wisthara denna)( please| plz)?$', '{}'::text[], 'chat', null, 20, 'Wants details'),
    ('^(ok+|okay|hari+|hari harii|ela+|thanks?|thank you|thank u|thx|tnx|ස්තූතියි|ස්තුතියි|හරි|ok thanks)$', '{new,browsing,collecting,ordered,cancelled}'::text[], 'chat', null, 30, 'Thanks / ok'),
    ('^(ow+|ou|ov|yes|ok+|okay|hari+|confirm|confirmed|ඔව්|ඔව්වා|හරි|correct|ow hari|ow confirm)$', '{confirming}'::text[], 'confirm', null, 5, 'Yes while confirming'),
    ('^(price|price eka|mila|mila kiyada|kiyada|kiyada mila|ganan|ganana|gana|gana kiyada|price kiyada|ගාන|ගාණ|මිල|කීයද|මිල කීයද|ගාන කීයද)$', '{}'::text[], 'question', 'price', 15, 'Price'),
    ('^(delivery|delivery kiyada|delivery charge|delivery charges|deliver karanawada|delivery gana|delivery thiyenawada|ඩිලිවරි)$', '{}'::text[], 'question', 'delivery', 15, 'Delivery'),
    ('^(\+?94|0)7[0-9]{8}$', '{collecting,confirming}'::text[], 'details', null, 5, 'Only a phone number'),
    ('^(cancel|cancel karanna|cancel karanna ona|epa|එපා|ඕන නෑ|ona na|one na)$', '{collecting,confirming}'::text[], 'cancel', null, 5, 'Cancel')
  ) as v(pattern, stage_in, k, t, priority, note)
 where not exists (select 1 from lingo.quick_rules r where r.lingo_user_id is null and r.pattern = v.pattern);

-- Fixed texts and button labels (buttons max 20 characters).
-- Placeholders: {business} {name} {product} {price} {delivery_fee} {total} {qty} {address} {contact} {missing}
--               {shop_phone} {shop_address} {delivery_days}
insert into lingo.bot_fixed_messages (key, lingo_user_id, text_si, text_en, note) values
('ask_details', null,
 E'Order එක දාන්න පහත විස්තර එවන්න 📝\n\n1️⃣ නම\n2️⃣ ලිපිනය\n3️⃣ දුරකථන අංකය',
 E'To place your order, please send 📝\n\n1️⃣ Name\n2️⃣ Address\n3️⃣ Phone number',
 'After the product photo, and when they tap Order'),
('nudge', null,
 'Order කරන්න කැමති නම් ඔබේ නම, ලිපිනය සහ දුරකථන අංකය එවන්න 📝',
 'To order, just send your name, address and phone number 📝',
 'Added after answers while no details yet'),
('ask_missing', null,
 'ස්තූතියි 🙏 Order එක සම්පූර්ණ කරන්න තව {missing} එවන්න 📝',
 'Thank you 🙏 Please also send your {missing} 📝',
 'Some details missing'),
('order_summary', null,
 E'📝 *ඔබේ order එක*\n\n🛍️ {product} x {qty}\n👤 {name}\n📍 {address}\n📞 {contact}\n\n💵 මුළු මුදල: රු. {total} (delivery රු. {delivery_fee} ඇතුළුව)\n\nවිස්තර හරි නම් *Confirm* ඔබන්න 👇',
 E'📝 *Your order*\n\n🛍️ {product} x {qty}\n👤 {name}\n📍 {address}\n📞 {contact}\n\n💵 Total: Rs. {total} (incl. delivery Rs. {delivery_fee})\n\nIf everything is correct, tap *Confirm* 👇',
 'Sent with Confirm / Change / Cancel buttons'),
('ask_change', null,
 'හරි 👍 වෙනස් කරන්න ඕන විස්තරය එවන්න (නම / ලිපිනය / දුරකථන අංකය / ප්‍රමාණය)',
 'Sure 👍 Send the detail you want to change (name / address / phone / quantity)',
 'After Change'),
('order_confirmed', null,
 E'✅ ස්තූතියි {name}! ඔබේ order එක confirm කළා.\n🚚 දින {delivery_days}ක් ඇතුළත ඔබට ලැබෙයි.',
 E'✅ Thank you {name}! Your order is confirmed.\n🚚 It will reach you within {delivery_days} days.',
 'After Confirm'),
('order_cancelled', null,
 'හරි, ඔබේ order එක cancel කළා. ආයෙත් අවශ්‍ය වුණොත් අපිට message එකක් දාන්න 😊',
 'Okay, your order is cancelled. Message us anytime if you need it again 😊',
 'After Cancel'),
('price', null,
 E'💰 *{product}*\nමිල: රු. {price}\n🚚 Delivery: රු. {delivery_fee}\n💵 මුළු මුදල: රු. {total}',
 E'💰 *{product}*\nPrice: Rs. {price}\n🚚 Delivery: Rs. {delivery_fee}\n💵 Total: Rs. {total}',
 'Price question (no AI)'),
('delivery', null,
 '🚚 Delivery ගාස්තුව රු. {delivery_fee} යි. Order එක confirm කළාට පස්සේ දින {delivery_days}ක් ඇතුළත දිවයින පුරා ඕනෑම තැනකට deliver කරනවා.',
 '🚚 Delivery is Rs. {delivery_fee}. We deliver island-wide within {delivery_days} days after your order is confirmed.',
 'Delivery question (no AI)'),
('payment', null,
 '💵 Cash on delivery: භාණ්ඩය ලැබුණාම මුදල් ගෙවන්න පුළුවන්.',
 '💵 Cash on delivery: you pay when you receive it.',
 'Payment question (no AI)'),
('stock', null, '', '', 'Stock question (no AI). Empty = Lingo says it will check and hands the chat to you'),
('contact', null,
 '📞 අපිට {shop_phone} අංකයට call කරන්නත් පුළුවන්.',
 '📞 You can also call us on {shop_phone}.',
 'Wants to call / contact'),
('shop', null,
 E'📍 {business}\n{shop_address}\n📞 {shop_phone}',
 E'📍 {business}\n{shop_address}\n📞 {shop_phone}',
 'Shop details'),
('chat_reply', null,
 'ස්තූතියි 🙏 තව මොනවා හරි දැනගන්න ඕන නම් කියන්න.',
 'Thank you 🙏 Let us know if you need anything else.',
 'Thanks / ok after the order is done'),
('ask_product', null,
 'ආයුබෝවන් 🙏 {business} වෙත සාදරයෙන් පිළිගන්නවා. ඔබට අවශ්‍ය product එක මොකක්ද?',
 'Hello 🙏 Welcome to {business}. Which product are you interested in?',
 'Product unknown'),
('pick_product', null,
 'ඔබ අහන්නේ මේ එකක් ගැනද? 👇',
 'Is it one of these? 👇',
 'Menu of possible products'),
('clarify', null,
 'සමාවෙන්න, මට හරියටම තේරුණේ නෑ 🙏 ඔබට අවශ්‍ය මොකක්ද?',
 'Sorry, I didn''t quite get that 🙏 What would you like to do?',
 'Not sure what they mean (with buttons)'),
('handoff', null,
 'අපේ කණ්ඩායමේ කෙනෙක් ඉක්මනින්ම ඔබට reply කරයි 🙏',
 'A team member will reply to you shortly 🙏',
 'Chat handed to you'),
('will_check', null,
 'පොඩ්ඩක් ඉන්න, අපි check කරලා ඉක්මනින්ම කියන්නම් 🙏',
 'Let me check and get back to you shortly 🙏',
 'Can''t answer safely'),
('btn_order',   null, '🛒 Order කරන්න',  '🛒 Order now',    'Button'),
('btn_confirm', null, '✅ Confirm',       '✅ Confirm',      'Button'),
('btn_change',  null, '✏️ වෙනස් කරන්න',  '✏️ Change',       'Button'),
('btn_cancel',  null, '❌ Cancel',        '❌ Cancel',       'Button'),
('btn_menu',    null, 'Products බලන්න',   'See products',    'List button'),
('btn_info',    null, 'ℹ️ විස්තර',       'ℹ️ More details', 'Button'),
('btn_human',   null, '📞 කතා කරන්න',    '📞 Talk to us',   'Button'),
('notify_confirmed', null,
 'ආයුබෝවන් {name} 🙏 ඔබේ {product} order එක confirm වෙලා තියෙන්නේ. දින {delivery_days}ක් ඇතුළත ඔබට deliver කරනවා 🚚',
 'Hi {name} 🙏 Your {product} order is confirmed and will be delivered within {delivery_days} days 🚚',
 'Follow-up'),
('notify_cancelled', null,
 'ආයුබෝවන් {name} 🙏 ඔබේ order එක cancel කළේ ඇයි කියලා කියන්න පුළුවන්ද? අපේ සේවාව තවත් හොඳ කරගන්න ඒක ගොඩක් උදව් වෙනවා.',
 'Hi {name} 🙏 Could you tell us why you cancelled your order? It really helps us improve.',
 'Follow-up'),
('notify_no_order', null,
 'ආයුබෝවන් {name} 🙏 {product} ගැන තව විස්තර ඕනද, නැත්නම් order එකක් දාන්න කැමතිද? 😊',
 'Hi {name} 🙏 Would you like more details about {product}, or shall we place your order? 😊',
 'Follow-up (with Order button)')
on conflict (key, lingo_user_id) do nothing;

-- Exposed schema reminder: Supabase → Project Settings → Data API → Exposed schemas must include "lingo" (0006) and "feeder".
