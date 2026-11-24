-- =====================================================================
-- 0039: Lingo Feeder (feeder.retexia.com/lingo-feeder), the WhatsApp sales
-- assistant for Feeder sellers. Replaces the test version from 0037 ("Feeder →
-- Lingo", lingo.bot_* tables) and gets its own schema so it is never mixed up
-- with the Lingo product (lingo.retexia.com, schema "lingo").
--
--   * lingo_feeder.products: one product catalogue for every seller (the shop
--     knowledge: long description, how to use, precautions, picture…). The
--     data is in 0040_lingo_feeder_catalog.sql. Sellers only add their own
--     business details, and may switch a product off or set their own price.
--   * lingo_feeder.settings: everything sellers don't need to see (AI models,
--     texts, timings, follow-ups, AI allowance, money for the profit report).
--     Edit it in Supabase → Table editor → lingo_feeder.settings.
--   * Chats have a status (only clicked the ad · asking · giving details ·
--     stopped replying · ordered · cancelled · not interested · spam) and a
--     "call them" flag; one customer can have many orders.
--   * AI: OpenAI for the conversation, Gemini for voice notes and photos (and
--     as the fallback when OpenAI fails). Every call is logged with its cost
--     (ai_usage) for the profit report in admin.
--   * Package: "Lingo Feeder", LKR 5,900 / month (59,000 / year), 7 days free.
--
-- 0037's seller accounts and WhatsApp numbers (Vault secrets) move here; its
-- test chats, orders and settings are removed. Run after 0037 / 0038.
-- Supabase → Settings → Data API → Exposed schemas: add "lingo_feeder".
-- =====================================================================

create schema if not exists lingo_feeder;
grant usage on schema lingo_feeder to authenticated, service_role;
comment on schema lingo_feeder is 'Lingo Feeder: the WhatsApp sales assistant for Retexia Feeder sellers (feeder.retexia.com/lingo-feeder). Not the Lingo product (schema lingo).';

-- ---------------------------------------------------------------------
-- The package: "Lingo" under Feeder becomes "Lingo Feeder"
-- ---------------------------------------------------------------------
update public.packages k set slug = 'lingo-feeder'
  from public.products p
 where p.id = k.product_id and p.slug = 'feeder' and k.slug = 'lingo'
   and not exists (select 1 from public.packages k2 where k2.product_id = p.id and k2.slug = 'lingo-feeder');

insert into public.packages (product_id, slug, name, tagline, description, price_monthly, price_yearly, setup_fee, badge, cta_label, is_active, is_visible, sort_order)
select p.id, 'lingo-feeder', 'Lingo Feeder',
       'Lingo answers your WhatsApp ad customers and takes their orders, day and night',
       'Customers who tap your Click-to-WhatsApp ads meet Lingo on your own WhatsApp number: she sends the product photo and details, greets them by name, answers in Sinhala, Singlish or English (typed, voice notes and photos), takes the name, address and phone number with simple buttons and confirms the order. Every chat gets a status, so you see who ordered, who is still asking and who to call.',
       5900, 59000, 0, '7 days free', 'Start free trial', true, true,
       coalesce((select max(sort_order) + 1 from public.packages where product_id = p.id), 1)
  from public.products p
 where p.slug = 'feeder'
on conflict (product_id, slug) do update
   set name = excluded.name, tagline = excluded.tagline, description = excluded.description,
       price_monthly = excluded.price_monthly, price_yearly = excluded.price_yearly, setup_fee = 0,
       badge = excluded.badge, cta_label = excluded.cta_label, is_active = true, is_visible = true, updated_at = now();

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'packages' and column_name = 'trial_days') then
    update public.packages k set trial_days = 7 from public.products p where p.id = k.product_id and p.slug = 'feeder' and k.slug = 'lingo-feeder';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'packages' and column_name = 'fine_print') then
    update public.packages k
       set fine_print = 'Prices in Sri Lankan rupees (LKR). One price however many chats you get (fair use: about 3,000 customer chats a month with full AI; above that Lingo uses a lighter AI). WhatsApp fees, if any, are charged by Meta to your own WhatsApp account; chats that start from Click-to-WhatsApp ads are free.'
      from public.products p where p.id = k.product_id and p.slug = 'feeder' and k.slug = 'lingo-feeder';
  end if;
end $$;

delete from public.package_features
 where package_id = (select k.id from public.packages k join public.products p on p.id = k.product_id where p.slug = 'feeder' and k.slug = 'lingo-feeder');
insert into public.package_features (package_id, label, sort_order)
select k.id, f.label, f.n
  from public.packages k
  join public.products p on p.id = k.product_id and p.slug = 'feeder'
 cross join (values
    (1, 'Lingo answers on your own WhatsApp number (official WhatsApp Cloud API), day and night'),
    (2, 'Finds the product from the ad, sends its photo and full details, then greets the customer by name'),
    (3, 'Speaks like a real Sri Lankan: Sinhala, Singlish or English, typed, voice notes and photos'),
    (4, 'Takes the order with buttons: quantity, name, address, phone, confirm'),
    (5, 'After the order: thank-you message and how to use the product'),
    (6, 'Every chat has a status: ordered, asking, stopped replying, call them…'),
    (7, 'Orders go straight into your Feeder courier file')
  ) as f(n, label)
 where k.slug = 'lingo-feeder';

-- =====================================================================
-- Tables
-- =====================================================================

-- Global settings (sellers never see these). One row per key; value is JSON.
create table if not exists lingo_feeder.settings (
  key        text primary key check (key ~ '^[a-z_]{2,40}$'),
  value      jsonb not null,
  note       text,
  updated_at timestamptz not null default now()
);
comment on table lingo_feeder.settings is 'Lingo Feeder settings for every seller: AI models, texts, timings, AI allowance, money for the profit report. Edit the JSON in value; the next message uses it.';

-- The product catalogue (same for every seller), keyed by the Feeder product ID.
create table if not exists lingo_feeder.products (
  product_id        int primary key check (product_id > 0),
  name              text not null check (char_length(btrim(name)) between 1 and 200),
  short_description text,
  long_description  text check (long_description is null or char_length(long_description) <= 1024),
  price             numeric(12, 2) not null default 0 check (price >= 0),
  delivery_fee      numeric(12, 2) not null default 450 check (delivery_fee >= 0),
  ingredients       text,
  how_to_use        text,
  precautions       text,
  benefits          text,
  aliases           text,
  keywords          text,
  picture_url       text check (picture_url is null or picture_url ~ '^https://'),
  faqs              jsonb not null default '[]' check (jsonb_typeof(faqs) = 'array'),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table lingo_feeder.products is 'What Lingo knows about each product (every seller). long_description is sent with the picture (max 1024 characters, WhatsApp''s caption limit); {price} {delivery_fee} {total} in it become the seller''s own prices. faqs: [{"q": "...", "a": "..."}].';
comment on column lingo_feeder.products.aliases is 'Other names customers and ads use, comma separated (English and Sinhala). Used to find the product.';

create table if not exists lingo_feeder.sellers (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  business_name  text not null default 'My shop' check (char_length(btrim(business_name)) between 1 and 80),
  phone          text check (phone is null or char_length(phone) <= 40),
  location       text check (location is null or char_length(location) <= 120),
  address        text check (address is null or char_length(address) <= 300),
  delivery_days  text not null default '2-3' check (delivery_days ~ '^[0-9]{1,2}(-[0-9]{1,2})?$'),
  call_hours     text not null default '9am - 6pm' check (char_length(call_hours) <= 40),
  about          text check (about is null or char_length(about) <= 300),
  ads_only       boolean not null default false,
  status         text not null default 'setup' check (status in ('setup', 'live', 'paused', 'blocked')),
  ai_budget_usd  numeric(10, 2) check (ai_budget_usd is null or ai_budget_usd >= 0),
  budget_note_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table lingo_feeder.sellers is 'Lingo Feeder sellers (one per Retexia account) and their business details. ai_budget_usd: this seller''s monthly AI allowance (empty = settings.allowance).';

create table if not exists lingo_feeder.seller_products (
  user_id    uuid not null references lingo_feeder.sellers (user_id) on delete cascade,
  product_id int not null references lingo_feeder.products (product_id) on delete cascade,
  enabled    boolean not null default true,
  price      numeric(12, 2) check (price is null or price > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
comment on table lingo_feeder.seller_products is 'A seller''s changes to the catalogue: product switched off, or their own selling price. No row = on, Feeder price.';

create table if not exists lingo_feeder.numbers (
  phone_number_id text primary key check (phone_number_id ~ '^[0-9]{6,25}$'),
  user_id         uuid not null unique references lingo_feeder.sellers (user_id) on delete cascade,
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
comment on table lingo_feeder.numbers is 'Each seller''s WhatsApp Cloud API number. token_secret_id / app_secret_id point to Supabase Vault; only the service role reads them.';

create table if not exists lingo_feeder.ads (
  user_id    uuid not null references lingo_feeder.sellers (user_id) on delete cascade,
  ad_id      text not null check (char_length(ad_id) <= 300),
  product_id int references lingo_feeder.products (product_id) on delete set null,
  headline   text,
  body       text,
  source_url text,
  matched_by text check (matched_by is null or matched_by in ('text', 'ai', 'seller', 'customer')),
  tried      boolean not null default false,
  chats      int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, ad_id)
);
comment on table lingo_feeder.ads is 'Click-to-WhatsApp ads seen on a seller''s number and the product each one sells (found from the ad text, by the AI once, or picked by the seller).';

create table if not exists lingo_feeder.chats (
  user_id        uuid not null references lingo_feeder.sellers (user_id) on delete cascade,
  phone          text not null check (phone ~ '^([0-9]{6,20}|test-[a-z0-9-]{1,60})$'),
  profile_name   text,
  lang           text not null default 'si' check (lang in ('si', 'sg', 'en')),
  product_id     int,
  products_seen  int[] not null default '{}',
  status         text not null default 'new' check (status in ('new', 'asking', 'ordering', 'no_reply', 'ordered', 'cancelled', 'not_interested', 'spam')),
  status_at      timestamptz not null default now(),
  needs_call     boolean not null default false,
  call_reason    text,
  awaiting       text check (awaiting is null or awaiting in ('details', 'qty', 'confirm', 'same', 'field_name', 'field_address', 'field_phone', 'field_qty', 'product')),
  details        jsonb not null default '{}',
  said_something boolean not null default false,
  ad_id          text,
  memo           text,
  unsure         int not null default 0,
  paused_until   timestamptz,
  last_in_at     timestamptz,
  last_out_at    timestamptz,
  last_msg_at    timestamptz,
  followed_up_at timestamptz,
  test           boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, phone)
);
create index if not exists chats_recent_idx on lingo_feeder.chats (user_id, last_msg_at desc);
create index if not exists chats_status_idx on lingo_feeder.chats (user_id, status) where not test;
create index if not exists chats_call_idx on lingo_feeder.chats (user_id) where needs_call and not test;
comment on column lingo_feeder.chats.status is 'new = only clicked the ad (said nothing yet) · asking = asking about the product · ordering = giving order details · no_reply = stopped replying · ordered · cancelled · not_interested · spam.';
comment on column lingo_feeder.chats.needs_call is 'The seller should call this customer (asked for a call, a complaint, or Lingo couldn''t answer). Cleared with "Called" in the panel.';
comment on column lingo_feeder.chats.awaiting is 'What Lingo asked last (details, quantity, confirm, same address, a field to change, which product): a short "ow" or "2" is read against it.';
comment on column lingo_feeder.chats.details is 'The customer''s last order details {name, address, phone, phone2}, offered again for their next order.';

create table if not exists lingo_feeder.messages (
  id         bigint generated by default as identity primary key,
  user_id    uuid not null,
  phone      text not null,
  role       text not null check (role in ('c', 'b', 's')),
  kind       text not null default 'text' check (kind in ('text', 'image', 'buttons', 'list', 'voice', 'media', 'tap')),
  content    text not null,
  note       text,
  meta       jsonb,
  wa_id      text,
  status     text,
  route      text check (route is null or route in ('code', 'tap', 'ai', 'human', 'followup')),
  created_at timestamptz not null default now(),
  foreign key (user_id, phone) references lingo_feeder.chats (user_id, phone) on delete cascade
);
create index if not exists messages_chat_idx on lingo_feeder.messages (user_id, phone, id);
create index if not exists messages_wa_idx on lingo_feeder.messages (wa_id) where wa_id is not null;
comment on column lingo_feeder.messages.role is 'c = customer, b = Lingo, s = the seller (panel or WhatsApp Business app).';
comment on column lingo_feeder.messages.note is 'Short line for the AI''s view of the chat ("[sent order summary]"); '''' = not part of it.';

create table if not exists lingo_feeder.buffer (
  id         bigint generated by default as identity primary key,
  user_id    uuid not null,
  phone      text not null,
  wa_id      text,
  content    text not null,
  kind       text not null default 'text',
  quoted_id  text,
  tap        text,
  wa_ts      bigint,
  created_at timestamptz not null default now()
);
create index if not exists buffer_chat_idx on lingo_feeder.buffer (user_id, phone, id);

create table if not exists lingo_feeder.seen (
  wa_id text primary key,
  at    timestamptz not null default now()
);
create index if not exists seen_at_idx on lingo_feeder.seen (at);

create table if not exists lingo_feeder.product_msgs (
  wa_id      text primary key,
  user_id    uuid not null,
  phone      text not null,
  product_id int not null,
  created_at timestamptz not null default now()
);

create table if not exists lingo_feeder.orders (
  id            bigint generated by default as identity primary key,
  user_id       uuid not null,
  phone         text not null,
  product_id    int,
  product_name  text,
  qty           int not null default 1 check (qty between 1 and 20),
  name          text check (name is null or char_length(name) <= 80),
  address       text check (address is null or char_length(address) <= 300),
  phone1        text check (phone1 is null or char_length(phone1) <= 20),
  phone2        text check (phone2 is null or char_length(phone2) <= 20),
  unit_price    numeric(12, 2),
  delivery_fee  numeric(12, 2),
  total         numeric(12, 2),
  status        text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  exported_at   timestamptz,
  confirmed_at  timestamptz,
  cancelled_at  timestamptz,
  ad_id         text,
  test          boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (user_id, phone) references lingo_feeder.chats (user_id, phone) on delete cascade
);
create index if not exists orders_chat_idx on lingo_feeder.orders (user_id, phone, id desc);
create index if not exists orders_seller_idx on lingo_feeder.orders (user_id, status, created_at desc);
comment on column lingo_feeder.orders.exported_at is 'When it was downloaded in a courier CSV for Feeder (null = not yet).';

create table if not exists lingo_feeder.model_prices (
  model        text primary key,
  provider     text not null check (provider in ('openai', 'gemini')),
  in_per_m     numeric(10, 4) not null check (in_per_m >= 0),
  cached_per_m numeric(10, 4) not null check (cached_per_m >= 0),
  out_per_m    numeric(10, 4) not null check (out_per_m >= 0),
  audio_per_m  numeric(10, 4) check (audio_per_m is null or audio_per_m >= 0),
  updated_at   timestamptz not null default now()
);
comment on table lingo_feeder.model_prices is 'US$ per 1M tokens (standard tier). Every AI call''s cost is worked out from these: keep them current.';

create table if not exists lingo_feeder.ai_usage (
  id               bigint generated by default as identity primary key,
  user_id          uuid,
  phone            text,
  task             text not null check (task in ('brain', 'media', 'ad_match')),
  provider         text not null,
  model            text not null,
  tokens_in        int not null default 0,
  tokens_cached    int not null default 0,
  tokens_out       int not null default 0,
  tokens_reasoning int not null default 0,
  tokens_audio     int not null default 0,
  cost_usd         numeric(14, 8) not null default 0,
  ms               int,
  ok               boolean not null default true,
  test             boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists ai_usage_seller_idx on lingo_feeder.ai_usage (user_id, created_at);
comment on column lingo_feeder.ai_usage.tokens_out is 'All billed output tokens, reasoning / thinking included.';

create table if not exists lingo_feeder.events (
  id         bigint generated by default as identity primary key,
  user_id    uuid,
  phone      text,
  type       text not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_seller_idx on lingo_feeder.events (user_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['settings', 'products', 'sellers', 'seller_products', 'numbers', 'chats', 'orders', 'model_prices'] loop
    execute format('drop trigger if exists set_updated_at on lingo_feeder.%I', t);
    execute format('create trigger set_updated_at before update on lingo_feeder.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security: sellers read their own rows; every write = service role
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['settings', 'products', 'sellers', 'seller_products', 'numbers', 'ads', 'chats', 'messages', 'buffer', 'seen',
                           'product_msgs', 'orders', 'model_prices', 'ai_usage', 'events'] loop
    execute format('alter table lingo_feeder.%I enable row level security', t);
    execute format('revoke all on lingo_feeder.%I from anon, authenticated', t);
    execute format('grant all on lingo_feeder.%I to service_role', t);
  end loop;
  foreach t in array array['sellers', 'seller_products', 'ads', 'chats', 'messages', 'orders'] loop
    execute format('drop policy if exists own_read on lingo_feeder.%I', t);
    execute format('create policy own_read on lingo_feeder.%I for select to authenticated using (user_id = (select auth.uid()) or (select public.is_privileged()))', t);
    execute format('grant select on lingo_feeder.%I to authenticated', t);
  end loop;
end $$;
drop policy if exists everyone_read on lingo_feeder.products;
create policy everyone_read on lingo_feeder.products for select to authenticated using (true);
grant select on lingo_feeder.products to authenticated;
drop policy if exists own_read on lingo_feeder.numbers;
create policy own_read on lingo_feeder.numbers for select to authenticated using (user_id = (select auth.uid()) or (select public.is_privileged()));
grant select (phone_number_id, user_id, waba_id, display_phone, verified_name, connect_mode, status, quality_rating, token_last4,
              problem, last_webhook_at, last_check_at, created_at, updated_at) on lingo_feeder.numbers to authenticated;
grant usage, select on all sequences in schema lingo_feeder to service_role;

-- =====================================================================
-- Helpers
-- =====================================================================
create or replace function lingo_feeder.setting(p_key text) returns jsonb
language sql stable security definer set search_path = lingo_feeder, public as $$
  select value from lingo_feeder.settings where key = p_key;
$$;

-- Every product as one seller sells it: their price (own → My products → Feeder → catalogue) and on/off.
create or replace function lingo_feeder.catalog(p_user uuid)
returns table (id int, name text, price numeric, delivery_fee numeric, total numeric, enabled boolean, own_price numeric,
               short_description text, long_description text, how_to_use text, precautions text, benefits text, ingredients text,
               aliases text, keywords text, picture_url text, faqs jsonb)
language sql stable security definer set search_path = lingo_feeder, public as $$
  select p.product_id, p.name, x.price, x.delivery_fee, (x.price + x.delivery_fee)::numeric(12, 2),
         (p.active and coalesce(fp.active, true) and coalesce(sp.enabled, true)), sp.price,
         p.short_description, p.long_description, p.how_to_use, p.precautions, p.benefits, p.ingredients,
         coalesce(p.aliases, '') || coalesce(', ' || nullif(array_to_string(fp.aliases, ', '), ''), ''), p.keywords, p.picture_url, p.faqs
    from lingo_feeder.products p
    left join lingo_feeder.seller_products sp on sp.user_id = p_user and sp.product_id = p.product_id
    left join feeder.products fp on fp.product_id = p.product_id
    left join feeder.customer_products cp on cp.user_id = p_user and cp.product_id = p.product_id
   cross join lateral (select coalesce(sp.price, cp.price, nullif(fp.price, 0), p.price)::numeric(12, 2) as price,
                              coalesce(fp.delivery_fee, p.delivery_fee)::numeric(12, 2) as delivery_fee) x;
$$;

-- Products a text mentions (full name, an alias, or a word only that product's name has), best first.
create or replace function lingo_feeder.match_products(p_user uuid, p_text text, p_limit int default 5) returns jsonb
language sql stable security definer set search_path = lingo_feeder, public as $$
  with c as (select id, name, aliases from lingo_feeder.catalog(p_user) where enabled),
  t as (select ' ' || regexp_replace(lower(coalesce(p_text, '')), '[\s,.!?:;()"''/|-]+', ' ', 'g') || ' ' as s),
  w as (select c.id, regexp_replace(lower(x), '[^a-z0-9඀-෿]+', '', 'g') as w from c, regexp_split_to_table(c.name, '\s+') x),
  common as (select w.w from w group by w.w having count(distinct w.id) >= 3),
  hits as (
    select c.id, 100 + length(c.name) as score from c, t where position(' ' || lower(c.name) || ' ' in t.s) > 0
    union all
    select c.id, length(a.a) * 2 from c, t, lateral (select lower(btrim(a)) as a from unnest(string_to_array(c.aliases, ',')) a) a
     where length(a.a) >= 4 and position(' ' || a.a in t.s) > 0
    union all
    select w.id, length(w.w) from w, t
     where length(w.w) >= 4 and w.w not in (select common.w from common) and position(' ' || w.w in t.s) > 0
  ),
  top as (select id, sum(score)::int as score from hits group by id order by sum(score) desc, id limit greatest(p_limit, 1))
  select coalesce(jsonb_agg(jsonb_build_object('id', top.id, 'name', c.name, 'score', top.score) order by top.score desc, top.id), '[]'::jsonb)
    from top join c on c.id = top.id;
$$;

-- This month's AI spend (Sri Lanka time) against the allowance: full AI → lighter AI → no AI (fixed texts only).
create or replace function lingo_feeder.budget(p_user uuid) returns jsonb
language sql stable security definer set search_path = lingo_feeder, public as $$
  with lim as (select coalesce(s.ai_budget_usd, (lingo_feeder.setting('allowance')->>'usd')::numeric, 10) as usd,
                      coalesce((lingo_feeder.setting('allowance')->>'cheap_until')::numeric, 2) as x
                 from lingo_feeder.sellers s where s.user_id = p_user),
       u as (select coalesce(sum(cost_usd), 0) as used from lingo_feeder.ai_usage
              where user_id = p_user and created_at >= (date_trunc('month', now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo'))
  select jsonb_build_object('used', round(u.used, 4), 'limit', lim.usd,
           'mode', case when u.used >= lim.usd * lim.x then 'off' when u.used >= lim.usd then 'cheap' else 'full' end)
    from lim, u;
$$;

-- OpenAI (usage) or Gemini (usageMetadata) → tokens and US$ cost, one ai_usage row per call.
create or replace function lingo_feeder.log_usage(p_user uuid, p_phone text, p_items jsonb, p_test boolean default false) returns numeric
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare
  it jsonb; u jsonb; v_prov text; v_in int; v_out int; v_re int; v_ca int; v_au int;
  pr lingo_feeder.model_prices; v_cost numeric; v_total numeric := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if coalesce(it->>'task', '') not in ('brain', 'media', 'ad_match') then continue; end if;
    u := case when jsonb_typeof(it->'usage') = 'object' then it->'usage' else '{}'::jsonb end;
    if u = '{}'::jsonb and coalesce((it->>'ok')::boolean, true) then continue; end if;      -- nothing billed
    if not coalesce((it->>'ok')::boolean, true) then
      insert into lingo_feeder.events (user_id, phone, type, detail)
      values (p_user, p_phone, 'ai_failed', jsonb_build_object('task', it->>'task', 'model', left(it->>'model', 80), 'error', left(it->>'error', 300)));
    end if;
    if coalesce(it->>'provider', '') = 'openai' or u ? 'prompt_tokens' or u ? 'input_tokens' then
      v_prov := 'openai';
      v_in := coalesce((u->>'prompt_tokens')::int, (u->>'input_tokens')::int, 0);
      v_out := coalesce((u->>'completion_tokens')::int, (u->>'output_tokens')::int, 0);          -- includes reasoning
      v_re := coalesce((u#>>'{completion_tokens_details,reasoning_tokens}')::int, (u#>>'{output_tokens_details,reasoning_tokens}')::int, 0);
      v_ca := coalesce((u#>>'{prompt_tokens_details,cached_tokens}')::int, (u#>>'{input_tokens_details,cached_tokens}')::int, 0);
      v_au := coalesce((u#>>'{prompt_tokens_details,audio_tokens}')::int, 0);
    else
      v_prov := 'gemini';
      v_in := coalesce((u->>'promptTokenCount')::int, 0);
      v_re := coalesce((u->>'thoughtsTokenCount')::int, 0);
      v_out := coalesce((u->>'candidatesTokenCount')::int, 0) + v_re;                            -- thinking is billed as output
      v_ca := coalesce((u->>'cachedContentTokenCount')::int, 0);
      v_au := coalesce((select sum((d->>'tokenCount')::int) from jsonb_array_elements(coalesce(u->'promptTokensDetails', '[]'::jsonb)) d
                         where d->>'modality' = 'AUDIO'), 0);
    end if;
    pr := null;
    select * into pr from lingo_feeder.model_prices where model = it->>'model';
    if pr.model is null and u <> '{}'::jsonb then
      select * into pr from lingo_feeder.model_prices where provider = v_prov order by out_per_m desc limit 1;   -- unknown model: the dearest price
      insert into lingo_feeder.events (user_id, type, detail) values (p_user, 'unknown_model_price', jsonb_build_object('model', left(it->>'model', 80)));
    end if;
    v_cost := (greatest(v_in - v_ca - v_au, 0) * coalesce(pr.in_per_m, 0) + v_ca * coalesce(pr.cached_per_m, 0)
               + v_au * coalesce(pr.audio_per_m, pr.in_per_m, 0) + v_out * coalesce(pr.out_per_m, 0)) / 1000000.0;
    insert into lingo_feeder.ai_usage (user_id, phone, task, provider, model, tokens_in, tokens_cached, tokens_out, tokens_reasoning, tokens_audio, cost_usd, ms, ok, test)
    values (p_user, p_phone, it->>'task', v_prov, coalesce(nullif(left(it->>'model', 80), ''), 'unknown'), v_in, v_ca, v_out, v_re, v_au, v_cost,
            nullif(it->>'ms', '')::int, coalesce((it->>'ok')::boolean, true), coalesce(p_test, false));
    v_total := v_total + v_cost;
  end loop;
  return v_total;
end $$;

-- What the engine needs about a seller (business details + the global settings), in one object.
create or replace function lingo_feeder.seller_info(p_user uuid) returns jsonb
language sql stable security definer set search_path = lingo_feeder, public as $$
  select jsonb_build_object(
    'business', s.business_name, 'phone', coalesce(s.phone, ''), 'location', coalesce(s.location, ''), 'address', coalesce(s.address, ''),
    'delivery_days', s.delivery_days, 'call_hours', s.call_hours, 'about', coalesce(s.about, ''), 'ads_only', s.ads_only, 'status', s.status,
    'ai', coalesce(lingo_feeder.setting('ai'), '{}'::jsonb), 'timing', coalesce(lingo_feeder.setting('timing'), '{}'::jsonb))
  from lingo_feeder.sellers s where s.user_id = p_user;
$$;

-- =====================================================================
-- Engine functions (n8n, service role)
-- =====================================================================

-- The number a webhook came to (or a seller, for panel calls) → seller, token and app secret from Vault.
create or replace function lingo_feeder.bot_number(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare n lingo_feeder.numbers; s lingo_feeder.sellers; v_token text; v_secret text;
begin
  if coalesce(p->>'phone_number_id', '') <> '' then
    select * into n from lingo_feeder.numbers where phone_number_id = p->>'phone_number_id';
    if n.phone_number_id is null then
      if not exists (select 1 from lingo_feeder.events where type = 'unknown_number' and detail->>'phone_number_id' = p->>'phone_number_id' and created_at > now() - interval '1 hour') then
        insert into lingo_feeder.events (type, detail) values ('unknown_number', jsonb_build_object('phone_number_id', left(p->>'phone_number_id', 40)));
      end if;
      return jsonb_build_object('ok', false, 'why', 'unknown number');
    end if;
    select * into s from lingo_feeder.sellers where user_id = n.user_id;
    if n.status = 'disabled' then return jsonb_build_object('ok', false, 'why', 'number disabled'); end if;
  else
    select * into s from lingo_feeder.sellers where user_id = nullif(p->>'user_id', '')::uuid;
    if s.user_id is null then return jsonb_build_object('ok', false, 'why', 'unknown seller'); end if;
    select * into n from lingo_feeder.numbers where user_id = s.user_id;
  end if;
  if n.token_secret_id is not null then select decrypted_secret into v_token from vault.decrypted_secrets where id = n.token_secret_id; end if;
  if n.app_secret_id is not null then select decrypted_secret into v_secret from vault.decrypted_secrets where id = n.app_secret_id; end if;
  return jsonb_build_object(
    'ok', true, 'user_id', s.user_id, 'phone_number_id', n.phone_number_id, 'waba_id', n.waba_id,
    'connect_mode', coalesce(n.connect_mode, 'manual'), 'number_status', n.status,
    'token', v_token, 'app_secret', v_secret, 'seller', lingo_feeder.seller_info(s.user_id));
end $$;

-- Meta's GET webhook check: the verify token of any number.
create or replace function lingo_feeder.bot_verify_token(p jsonb) returns jsonb
language sql stable security definer set search_path = lingo_feeder, public as $$
  select jsonb_build_object('ok', coalesce(p->>'token', '') <> '' and exists (select 1 from lingo_feeder.numbers where verify_token = p->>'token'));
$$;

-- First stop for every message: duplicates, ad → product, paused chats, Lingo off.
create or replace function lingo_feeder.bot_gate(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare
  v_user  uuid := nullif(p->>'user_id', '')::uuid;
  v_phone text := p->>'phone';
  v_test  boolean := coalesce((p->>'test')::boolean, false);
  v_ref   jsonb := p->'referral';
  v_ad    text;
  v_adrow lingo_feeder.ads;
  v_chat  lingo_feeder.chats;
  v_s     lingo_feeder.sellers;
  v_rows  int;
  v_start int := nullif(p->>'start_product', '')::int;
  v_m     jsonb;
  v_new   boolean;
begin
  select * into v_s from lingo_feeder.sellers where user_id = v_user;
  if v_s.user_id is null then return jsonb_build_object('status', 'unknown'); end if;
  if v_test <> (v_phone like 'test-%') then return jsonb_build_object('status', 'refused'); end if;

  if not v_test then
    update lingo_feeder.numbers set last_webhook_at = now() where user_id = v_user;
    insert into lingo_feeder.seen (wa_id) values (p->>'wa_id') on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then return jsonb_build_object('status', 'dup'); end if;
    if random() < 0.02 then delete from lingo_feeder.seen where at < now() - interval '3 days'; end if;
  end if;

  if jsonb_typeof(v_ref) = 'object' then
    v_ad := left(coalesce(nullif(v_ref->>'source_id', ''), nullif(v_ref->>'source_url', '')), 300);
  end if;

  select * into v_chat from lingo_feeder.chats where user_id = v_user and phone = v_phone;
  v_new := v_chat.phone is null;
  if v_new and v_ad is null and not v_test and v_s.ads_only then
    return jsonb_build_object('status', 'ignored');
  end if;

  insert into lingo_feeder.chats (user_id, phone, profile_name, last_in_at, test)
  values (v_user, v_phone, nullif(left(btrim(p->>'name'), 80), ''), now(), v_test)
  on conflict (user_id, phone) do update
     set last_in_at = now(), profile_name = coalesce(excluded.profile_name, lingo_feeder.chats.profile_name)
  returning * into v_chat;

  if v_ad is not null then
    insert into lingo_feeder.ads (user_id, ad_id, headline, body, source_url)
    values (v_user, v_ad, left(v_ref->>'headline', 300), left(v_ref->>'body', 1000), left(v_ref->>'source_url', 500))
    on conflict (user_id, ad_id) do update set chats = lingo_feeder.ads.chats + 1;
    select * into v_adrow from lingo_feeder.ads where user_id = v_user and ad_id = v_ad;
    -- A clear match in the ad's own words: no AI needed.
    if v_adrow.product_id is null and not v_adrow.tried then
      v_m := lingo_feeder.match_products(v_user, concat_ws(' ', v_adrow.headline, v_adrow.body, v_adrow.source_url), 2);
      if jsonb_array_length(v_m) >= 1 and (v_m->0->>'score')::int >= 8
         and (jsonb_array_length(v_m) = 1 or (v_m->0->>'score')::int >= (v_m->1->>'score')::int * 2) then
        update lingo_feeder.ads set product_id = (v_m->0->>'id')::int, matched_by = 'text', tried = true
         where user_id = v_user and ad_id = v_ad returning * into v_adrow;
      end if;
    end if;
    -- A new ad click moves the chat to that ad's product (a customer can come back from another ad).
    update lingo_feeder.chats set ad_id = v_ad, product_id = coalesce(v_adrow.product_id, product_id)
     where user_id = v_user and phone = v_phone returning * into v_chat;
  end if;
  if v_test and v_start is not null and exists (select 1 from lingo_feeder.catalog(v_user) c where c.id = v_start and c.enabled) then
    update lingo_feeder.chats set product_id = v_start where user_id = v_user and phone = v_phone returning * into v_chat;
  end if;

  -- Spam stays quiet; a paused chat (the seller is answering) or Lingo off: keep the message for the panel and stop.
  if v_chat.status = 'spam' or (v_chat.paused_until is not null and v_chat.paused_until > now()) or (v_s.status <> 'live' and not v_test) then
    insert into lingo_feeder.messages (user_id, phone, role, kind, content, wa_id)
    values (v_user, v_phone, 'c', coalesce(nullif(p->>'kind', ''), 'text'), left(coalesce(nullif(p->>'text', ''), '[media]'), 2000), nullif(p->>'wa_id', ''));
    update lingo_feeder.chats set last_msg_at = now() where user_id = v_user and phone = v_phone;
    return jsonb_build_object('status', case when v_chat.status = 'spam' then 'spam' when v_s.status <> 'live' and not v_test then 'off' else 'paused' end);
  end if;

  if v_ad is not null and v_adrow.product_id is null and not v_adrow.tried then
    return jsonb_build_object(
      'status', 'ok', 'need_ad_match', true,
      'ad', jsonb_build_object('id', v_ad, 'headline', v_adrow.headline, 'body', v_adrow.body),
      'products', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'n', c.name, 'k', left(c.aliases, 60)) order by c.id)
                              from lingo_feeder.catalog(v_user) c where c.enabled), '[]'::jsonb));
  end if;
  return jsonb_build_object('status', 'ok', 'need_ad_match', false);
end $$;

-- The AI's one-time "this ad = this product" answer (0 = none: the seller picks it in Products).
create or replace function lingo_feeder.bot_set_ad(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare v_user uuid := nullif(p->>'user_id', '')::uuid; v_pid int := nullif(p->>'product_id', '')::int;
begin
  update lingo_feeder.ads set tried = true where user_id = v_user and ad_id = p->>'ad_id';
  if v_pid is not null and exists (select 1 from lingo_feeder.catalog(v_user) c where c.id = v_pid and c.enabled) then
    update lingo_feeder.ads set product_id = v_pid, matched_by = 'ai' where user_id = v_user and ad_id = p->>'ad_id' and product_id is null;
    update lingo_feeder.chats set product_id = v_pid where user_id = v_user and phone = p->>'phone';
    return jsonb_build_object('ok', true, 'product_id', v_pid);
  end if;
  insert into lingo_feeder.events (user_id, type, detail) values (v_user, 'ad_unmatched', jsonb_build_object('ad_id', left(p->>'ad_id', 300)));
  return jsonb_build_object('ok', false);
end $$;

-- One message into the batching buffer (+ the AI usage of its voice note / photo / ad match).
create or replace function lingo_feeder.bot_buffer_add(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare v_id bigint;
begin
  insert into lingo_feeder.buffer (user_id, phone, wa_id, content, kind, quoted_id, tap, wa_ts)
  values ((p->>'user_id')::uuid, p->>'phone', p->>'wa_id', left(coalesce(p->>'content', ''), 2000), coalesce(nullif(p->>'kind', ''), 'text'),
          nullif(p->>'quoted_id', ''), nullif(p->>'tap', ''), nullif(p->>'wa_ts', '')::bigint)
  returning id into v_id;
  perform lingo_feeder.log_usage((p->>'user_id')::uuid, p->>'phone', p->'usage', coalesce((p->>'test')::boolean, false));
  return jsonb_build_object('id', v_id);
end $$;

-- After the wait: if this is the newest message, take the batch and everything the turn needs
-- (this chat's product only, never the whole catalogue).
create or replace function lingo_feeder.bot_claim(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare
  v_user  uuid := (p->>'user_id')::uuid;
  v_phone text := p->>'phone';
  v_buf   bigint := (p->>'buffer_id')::bigint;
  v_msgs  jsonb;
  v_text  text;
  v_chat  lingo_feeder.chats;
  v_quoted int;
begin
  perform pg_advisory_xact_lock(hashtext('lingo-feeder:' || v_user || ':' || v_phone));
  if exists (select 1 from lingo_feeder.buffer where user_id = v_user and phone = v_phone and id > v_buf) then
    return jsonb_build_object('ok', false, 'why', 'newer message is waiting');
  end if;
  with d as (delete from lingo_feeder.buffer where user_id = v_user and phone = v_phone and id <= v_buf returning *)
  select jsonb_agg(jsonb_build_object('t', content, 'kind', kind, 'qid', quoted_id, 'tap', tap, 'wa_id', wa_id) order by coalesce(wa_ts, 0), id),
         string_agg(content, ' ' order by coalesce(wa_ts, 0), id)
    into v_msgs, v_text from d;
  if v_msgs is null then return jsonb_build_object('ok', false, 'why', 'already handled'); end if;

  select * into v_chat from lingo_feeder.chats where user_id = v_user and phone = v_phone;
  select pm.product_id into v_quoted from lingo_feeder.product_msgs pm
   where pm.user_id = v_user and pm.wa_id in (select x->>'qid' from jsonb_array_elements(v_msgs) x where x->>'qid' is not null) limit 1;

  return jsonb_build_object(
    'ok', true,
    'msgs', v_msgs,
    'chat', to_jsonb(v_chat),
    'seller', lingo_feeder.seller_info(v_user),
    'product', (select to_jsonb(c) from lingo_feeder.catalog(v_user) c where c.id = v_chat.product_id),
    'quoted', (select to_jsonb(c) from lingo_feeder.catalog(v_user) c where c.id = v_quoted and c.enabled),
    'matches', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('score', m.score) order by m.score desc)
                           from jsonb_to_recordset(lingo_feeder.match_products(v_user, v_text, 4)) as m(id int, name text, score int)
                           join lingo_feeder.catalog(v_user) c on c.id = m.id), '[]'::jsonb),
    'history', coalesce((
        select jsonb_agg(jsonb_build_object('r', m.role, 'c', left(coalesce(nullif(m.note, ''), m.content), 220)) order by m.id)
          from (select * from lingo_feeder.messages
                 where user_id = v_user and phone = v_phone and not (role = 'b' and note = '')
                 order by id desc limit 8) m), '[]'::jsonb),
    'order', (select to_jsonb(o) from lingo_feeder.orders o
               where o.user_id = v_user and o.phone = v_phone and o.status = 'draft' and o.updated_at > now() - interval '14 days'
               order by o.id desc limit 1),
    'last_order', (select to_jsonb(o) from lingo_feeder.orders o
                    where o.user_id = v_user and o.phone = v_phone and o.status = 'confirmed' order by o.id desc limit 1),
    'texts', coalesce(lingo_feeder.setting('texts'), '{}'::jsonb),
    'banned', coalesce(lingo_feeder.setting('banned'), '[]'::jsonb),
    'style', coalesce(lingo_feeder.setting('lingo_style'), '""'::jsonb),
    'budget', lingo_feeder.budget(v_user)
  );
end $$;

-- Save one finished turn. Prices and totals come from the catalogue, never from the AI.
create or replace function lingo_feeder.bot_save_turn(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare
  v_user   uuid := (p->>'user_id')::uuid;
  v_phone  text := p->>'phone';
  v_test   boolean := coalesce((p->>'test')::boolean, false);
  v_c      jsonb := coalesce(p->'chat', '{}'::jsonb);
  v_o      jsonb := p->'order';
  v_chat   lingo_feeder.chats;
  v_old    lingo_feeder.orders;
  v_order  bigint;
  v_prod   record;
  v_qty    int;
  v_status text;
  v_first  boolean := true;
  v_cost   numeric := 0;
  v_seen   int[];
  v_hours  int;
  x        jsonb;
begin
  select * into v_chat from lingo_feeder.chats where user_id = v_user and phone = v_phone;
  if v_chat.phone is null then return jsonb_build_object('ok', false, 'why', 'unknown chat'); end if;

  for x in select * from jsonb_array_elements(coalesce(p->'msgs', '[]'::jsonb)) loop
    insert into lingo_feeder.messages (user_id, phone, role, kind, content, wa_id)
    values (v_user, v_phone, 'c', case when coalesce(x->>'kind', '') in ('text', 'voice', 'media', 'tap', 'image') then x->>'kind' else 'text' end,
            left(coalesce(nullif(x->>'t', ''), '[media]'), 2000), nullif(x->>'wa_id', ''));
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'sent', '[]'::jsonb)) loop
    insert into lingo_feeder.messages (user_id, phone, role, kind, content, note, meta, wa_id, status, route)
    values (v_user, v_phone, 'b', case when x->>'kind' in ('text', 'image', 'buttons', 'list') then x->>'kind' else 'text' end,
            left(coalesce(nullif(x->>'text', ''), '…'), 4096),
            case when v_first then left(coalesce(p->>'log', ''), 600) else '' end,
            x->'meta', nullif(x->>'wa_id', ''),
            case when x->>'error' is not null then 'failed' when nullif(x->>'wa_id', '') is not null then 'sent' end,
            case when v_first then nullif(p->>'route', '') end);
    if x->>'error' is not null then
      insert into lingo_feeder.events (user_id, phone, type, detail) values (v_user, v_phone, 'send_failed', jsonb_build_object('error', left(x->>'error', 500)));
    end if;
    v_first := false;
  end loop;

  select coalesce(array_agg(distinct v::int), '{}') into v_seen from jsonb_array_elements_text(coalesce(v_c->'seen_add', '[]'::jsonb)) v;
  select coalesce((lingo_feeder.setting('timing')->>'pause_hours')::int, 12) into v_hours;
  update lingo_feeder.chats c set
    product_id     = coalesce(nullif(v_c->>'product_id', '')::int, c.product_id),
    products_seen  = (select coalesce(array_agg(distinct s), '{}') from unnest(c.products_seen || v_seen) s),
    lang           = case when v_c->>'lang' in ('si', 'sg', 'en') then v_c->>'lang' else c.lang end,
    status_at      = case when v_c->>'status' is not null and v_c->>'status' <> c.status then now() else c.status_at end,
    status         = case when v_c->>'status' in ('new', 'asking', 'ordering', 'no_reply', 'ordered', 'cancelled', 'not_interested', 'spam') then v_c->>'status' else c.status end,
    awaiting       = case when v_c ? 'awaiting' then nullif(v_c->>'awaiting', '') else c.awaiting end,
    needs_call     = c.needs_call or coalesce((v_c->>'needs_call')::boolean, false),
    call_reason    = case when coalesce((v_c->>'needs_call')::boolean, false) then left(coalesce(v_c->>'call_reason', 'call them'), 200) else c.call_reason end,
    paused_until   = case when coalesce((v_c->>'pause')::boolean, false) then now() + make_interval(hours => v_hours) else c.paused_until end,
    said_something = c.said_something or coalesce((v_c->>'said_something')::boolean, false),
    memo           = coalesce(nullif(left(btrim(v_c->>'memo'), 300), ''), c.memo),
    unsure         = case when coalesce((v_c->>'unsure')::boolean, false) then c.unsure + 1 else 0 end,
    details        = case when jsonb_typeof(v_c->'details') = 'object' then c.details || (v_c->'details') else c.details end,
    last_out_at    = case when jsonb_array_length(coalesce(p->'sent', '[]'::jsonb)) > 0 then now() else c.last_out_at end,
    last_msg_at    = now()
  where c.user_id = v_user and c.phone = v_phone;
  if coalesce((v_c->>'needs_call')::boolean, false) and not v_chat.needs_call then
    insert into lingo_feeder.events (user_id, phone, type, detail) values (v_user, v_phone, 'needs_call', jsonb_build_object('reason', left(v_c->>'call_reason', 200)));
  end if;

  if jsonb_typeof(v_o) = 'object' then
    v_qty := least(greatest(coalesce(nullif(v_o->>'qty', '')::int, 1), 1), 20);
    v_status := case when v_o->>'status' in ('draft', 'confirmed', 'cancelled') then v_o->>'status' else 'draft' end;
    select c.id, c.name, c.price, c.delivery_fee into v_prod from lingo_feeder.catalog(v_user) c where c.id = nullif(v_o->>'product_id', '')::int;
    if nullif(v_o->>'id', '') is not null then
      select * into v_old from lingo_feeder.orders where id = (v_o->>'id')::bigint and user_id = v_user and phone = v_phone for update;
    end if;
    if v_old.id is not null then
      update lingo_feeder.orders set
        product_id = coalesce(v_prod.id, product_id), product_name = coalesce(v_prod.name, product_name), qty = v_qty,
        name = left(nullif(btrim(v_o->>'name'), ''), 80), address = left(nullif(btrim(v_o->>'address'), ''), 300),
        phone1 = left(nullif(btrim(v_o->>'phone1'), ''), 20), phone2 = left(nullif(btrim(v_o->>'phone2'), ''), 20),
        unit_price = case when status = 'draft' then coalesce(v_prod.price, unit_price) else unit_price end,
        delivery_fee = case when status = 'draft' then coalesce(v_prod.delivery_fee, delivery_fee) else delivery_fee end,
        total = (case when status = 'draft' then coalesce(v_prod.price, unit_price) else unit_price end) * v_qty
                + (case when status = 'draft' then coalesce(v_prod.delivery_fee, delivery_fee, 0) else coalesce(delivery_fee, 0) end),
        status = v_status,
        confirmed_at = case when v_status = 'confirmed' and v_old.status <> 'confirmed' then now() else confirmed_at end,
        cancelled_at = case when v_status = 'cancelled' and v_old.status <> 'cancelled' then now() else cancelled_at end
       where id = v_old.id
      returning id into v_order;
    elsif v_prod.id is not null then
      insert into lingo_feeder.orders (user_id, phone, product_id, product_name, qty, name, address, phone1, phone2,
                                       unit_price, delivery_fee, total, status, ad_id, test, confirmed_at)
      values (v_user, v_phone, v_prod.id, v_prod.name, v_qty, left(nullif(btrim(v_o->>'name'), ''), 80), left(nullif(btrim(v_o->>'address'), ''), 300),
              left(nullif(btrim(v_o->>'phone1'), ''), 20), left(nullif(btrim(v_o->>'phone2'), ''), 20),
              v_prod.price, v_prod.delivery_fee, v_prod.price * v_qty + coalesce(v_prod.delivery_fee, 0), v_status, v_chat.ad_id, v_test,
              case when v_status = 'confirmed' then now() end)
      returning id into v_order;
    end if;
    if v_order is not null and v_status = 'confirmed' and coalesce(v_old.status, '') <> 'confirmed' then
      insert into lingo_feeder.events (user_id, phone, type, detail) values (v_user, v_phone, 'order_confirmed', jsonb_build_object('order_id', v_order));
    elsif v_order is not null and v_status = 'cancelled' and coalesce(v_old.status, '') <> 'cancelled' then
      insert into lingo_feeder.events (user_id, phone, type, detail) values (v_user, v_phone, 'order_cancelled', jsonb_build_object('order_id', v_order));
    end if;
  end if;

  insert into lingo_feeder.product_msgs (wa_id, user_id, phone, product_id)
  select x2->>'wa_id', v_user, v_phone, (x2->>'product_id')::int
    from jsonb_array_elements(coalesce(p->'product_msgs', '[]'::jsonb)) x2
   where coalesce(x2->>'wa_id', '') <> '' and coalesce(x2->>'product_id', '') <> ''
  on conflict (wa_id) do nothing;

  v_cost := lingo_feeder.log_usage(v_user, v_phone, p->'usage', v_test);
  if not v_test and (lingo_feeder.budget(v_user)->>'mode') <> 'full' then
    update lingo_feeder.sellers set budget_note_at = now()
     where user_id = v_user and (budget_note_at is null or budget_note_at < date_trunc('month', now()));
    if found then
      insert into lingo_feeder.events (user_id, type, detail) values (v_user, 'allowance_used', lingo_feeder.budget(v_user));
    end if;
  end if;
  return jsonb_build_object('ok', true, 'order_id', v_order, 'cost_usd', v_cost);
end $$;

-- Delivery statuses (sent / delivered / read / failed) of what Lingo sent.
create or replace function lingo_feeder.bot_statuses(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare v_user uuid := (p->>'user_id')::uuid; x jsonb; v_n int := 0;
begin
  update lingo_feeder.numbers set last_webhook_at = now() where user_id = v_user;
  for x in select * from jsonb_array_elements(coalesce(p->'statuses', '[]'::jsonb)) loop
    update lingo_feeder.messages
       set status = case when status = 'read' and x->>'status' in ('sent', 'delivered') then status
                         when status = 'delivered' and x->>'status' = 'sent' then status else left(x->>'status', 20) end
     where user_id = v_user and wa_id = x->>'id';
    v_n := v_n + 1;
    if x->>'status' = 'failed' then
      insert into lingo_feeder.events (user_id, phone, type, detail)
      values (v_user, x->>'recipient', 'send_failed', jsonb_build_object('wa_id', x->>'id', 'error', left(x->>'error', 500)));
      -- WhatsApp couldn't fetch a product photo: drop the link, so Lingo sends that description as text from now on.
      update lingo_feeder.products pr set picture_url = null
        from lingo_feeder.messages m
       where m.user_id = v_user and m.wa_id = x->>'id' and m.kind = 'image' and pr.picture_url = m.meta->>'image'
         and coalesce(x->>'error', '') ~* '(media|download|image|url|131053|131052)';
      if found then
        insert into lingo_feeder.events (user_id, type, detail) values (v_user, 'photo_broken', jsonb_build_object('error', left(x->>'error', 300)));
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'n', v_n);
end $$;

-- The seller answered from the WhatsApp Business app (coexistence): keep it and pause Lingo for that chat.
create or replace function lingo_feeder.bot_echo(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare v_user uuid := (p->>'user_id')::uuid; x jsonb; v_hours int;
begin
  select coalesce((lingo_feeder.setting('timing')->>'pause_hours')::int, 12) into v_hours;
  update lingo_feeder.numbers set last_webhook_at = now() where user_id = v_user;
  for x in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    if exists (select 1 from lingo_feeder.chats where user_id = v_user and phone = x->>'to') then
      insert into lingo_feeder.messages (user_id, phone, role, content, wa_id, status)
      values (v_user, x->>'to', 's', left(coalesce(nullif(x->>'text', ''), '[media]'), 4096), nullif(x->>'id', ''), 'sent');
      update lingo_feeder.chats set paused_until = now() + make_interval(hours => v_hours), last_msg_at = now(), last_out_at = now()
       where user_id = v_user and phone = x->>'to';
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- Every 15 minutes: chats that went quiet become "stopped replying", and each gets ONE follow-up
-- (only inside WhatsApp's free 24-hour window and the sending hours, Sri Lanka time).
create or replace function lingo_feeder.bot_due_followups(p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare
  t jsonb := coalesce(lingo_feeder.setting('timing'), '{}'::jsonb);
  v_quiet int := coalesce((t->>'no_reply_hours')::int, 3);
  v_after int := coalesce((t->>'followup_hours')::int, 3);
  v_from int := coalesce((t->>'followup_from')::int, 8);
  v_to int := coalesce((t->>'followup_to')::int, 21);
  v_hour int := extract(hour from now() at time zone 'Asia/Colombo');
  v_texts jsonb := coalesce(lingo_feeder.setting('texts'), '{}'::jsonb);
  v_items jsonb;
begin
  -- We spoke last and they went quiet: "stopped replying" ("new" stays "only clicked the ad").
  update lingo_feeder.chats c set status = 'no_reply', status_at = now()
   where not c.test and c.status in ('asking', 'ordering') and c.last_out_at >= c.last_in_at
     and c.last_msg_at < now() - make_interval(hours => v_quiet);

  if v_hour < v_from or v_hour >= v_to then return jsonb_build_object('items', '[]'::jsonb); end if;

  with due as (
    select c.user_id, c.phone, c.profile_name, c.lang, c.product_id, c.details
      from lingo_feeder.chats c
      join lingo_feeder.sellers s on s.user_id = c.user_id and s.status = 'live'
      join lingo_feeder.numbers n on n.user_id = c.user_id and n.status in ('connected', 'problem') and n.token_secret_id is not null
     where not c.test and not c.needs_call
       and c.status in ('new', 'asking', 'ordering', 'no_reply')
       and (c.paused_until is null or c.paused_until < now())
       and c.last_out_at >= c.last_in_at
       and c.last_msg_at < now() - make_interval(hours => v_after)
       and c.last_in_at > now() - interval '23 hours'
       and (c.followed_up_at is null or c.followed_up_at < c.last_in_at)
     order by c.last_msg_at
     limit least(coalesce((p->>'limit')::int, 50), 200)
     for update of c skip locked
  ),
  marked as (
    update lingo_feeder.chats c set followed_up_at = now(), last_out_at = now(), last_msg_at = now()
      from due where c.user_id = due.user_id and c.phone = due.phone returning c.phone
  ),
  rendered as (
    select d.*, n.phone_number_id, n.token_secret_id,
           btrim(regexp_replace(regexp_replace(
             replace(replace(coalesce(nullif(v_texts->'followup'->>d.lang, ''), v_texts->'followup'->>'si', ''),
               '{name}', coalesce(split_part(coalesce(nullif(d.details->>'name', ''), lingo_feeder.first_name(d.profile_name), ''), ' ', 1), '')),
               '{product}', coalesce((select pr.name from lingo_feeder.products pr where pr.product_id = d.product_id), '')),
             '[ \t]{2,}', ' ', 'g'), ' ([!?.,])', '\1', 'g')) as body,
           coalesce(nullif(v_texts->'btn_order'->>d.lang, ''), v_texts->'btn_order'->>'si', 'Order') as btn
      from due d join lingo_feeder.numbers n on n.user_id = d.user_id
  ),
  saved as (
    insert into lingo_feeder.messages (user_id, phone, role, kind, content, note, meta, route)
    select r.user_id, r.phone, 'b', 'buttons', r.body, '[follow-up: asked if they want to order]', jsonb_build_object('buttons', jsonb_build_array(left(r.btn, 20))), 'followup'
      from rendered r where r.body <> ''
    returning id, user_id, phone
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'msg_id', sv.id, 'user_id', r.user_id, 'phone_number_id', r.phone_number_id,
           'token', (select decrypted_secret from vault.decrypted_secrets where id = r.token_secret_id),
           'to', r.phone, 'text', r.body, 'button', left(r.btn, 20))), '[]'::jsonb)
    into v_items
    from rendered r join saved sv on sv.user_id = r.user_id and sv.phone = r.phone;
  return jsonb_build_object('items', v_items);
end $$;

-- A WhatsApp profile name that looks like a person's first name ("Nimal", "නිමල්"), else null.
create or replace function lingo_feeder.first_name(p_name text) returns text
language sql immutable as $$
  select case
    when w ~ '^[A-Za-z]{2,20}$' and lower(w) not in ('shop', 'store', 'stores', 'official', 'online', 'mobile', 'phone', 'user', 'whatsapp', 'business', 'enterprises', 'lk', 'the', 'mr', 'mrs', 'miss', 'dr', 'hi', 'hello')
      then upper(left(w, 1)) || lower(substr(w, 2))
    when w ~ '^[඀-෿]{2,20}$' then w
  end
  from (select split_part(btrim(regexp_replace(coalesce(p_name, ''), '[^A-Za-z඀-෿ ]+', ' ', 'g')), ' ', 1) as w) x;
$$;

create or replace function lingo_feeder.bot_set_wa_ids(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare x jsonb;
begin
  for x in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    update lingo_feeder.messages
       set wa_id = coalesce(nullif(x->>'wa_id', ''), wa_id),
           status = case when x->>'error' is not null then 'failed' when nullif(x->>'wa_id', '') is not null then 'sent' else status end
     where id = (x->>'msg_id')::bigint;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- Number health (every 6 h from n8n, and "Test connection" in the panel).
create or replace function lingo_feeder.bot_numbers_to_check(p jsonb default '{}') returns jsonb
language sql stable security definer set search_path = lingo_feeder, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('phone_number_id', n.phone_number_id, 'waba_id', n.waba_id,
           'token', (select decrypted_secret from vault.decrypted_secrets where id = n.token_secret_id))), '[]'::jsonb)
    from lingo_feeder.numbers n
   where n.status in ('connected', 'problem') and n.token_secret_id is not null;
$$;

create or replace function lingo_feeder.bot_save_check(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare v_ok boolean := coalesce((p->>'ok')::boolean, false); i jsonb := coalesce(p->'info', '{}'::jsonb); v_prev text;
begin
  select status into v_prev from lingo_feeder.numbers where phone_number_id = p->>'phone_number_id';
  update lingo_feeder.numbers set
    status = case when status = 'disabled' then status when v_ok then 'connected' else 'problem' end,
    display_phone = coalesce(nullif(i->>'display_phone_number', ''), display_phone),
    verified_name = coalesce(nullif(i->>'verified_name', ''), verified_name),
    quality_rating = coalesce(nullif(i->>'quality_rating', ''), quality_rating),
    problem = case when v_ok then null else left(coalesce(p->>'error', 'WhatsApp did not answer'), 300) end,
    last_check_at = now(), last_check = i
  where phone_number_id = p->>'phone_number_id';
  if v_prev is distinct from (case when v_ok then 'connected' else 'problem' end) and v_prev is not null then
    insert into lingo_feeder.events (user_id, type, detail)
    select user_id, case when v_ok then 'number_ok' else 'number_problem' end, jsonb_build_object('error', left(p->>'error', 300))
      from lingo_feeder.numbers where phone_number_id = p->>'phone_number_id';
  end if;
  return jsonb_build_object('ok', found);
end $$;

-- =====================================================================
-- Panel functions (feeder.retexia.com, service role)
-- =====================================================================
create or replace function lingo_feeder.ensure_seller(p_user uuid, p_name text default null) returns uuid
language plpgsql security definer set search_path = lingo_feeder, public as $$
begin
  insert into lingo_feeder.sellers (user_id, business_name)
  values (p_user, coalesce(nullif(left(btrim(p_name), 80), ''), 'My shop'))
  on conflict (user_id) do nothing;
  return p_user;
end $$;

-- Save the seller's WhatsApp number; tokens and app secrets go to Vault (only the last 4 characters are kept here).
create or replace function lingo_feeder.save_number(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare
  v_user uuid := (p->>'user_id')::uuid;
  v_pnid text := btrim(coalesce(p->>'phone_number_id', ''));
  v_waba text := nullif(btrim(coalesce(p->>'waba_id', '')), '');
  v_token text := nullif(btrim(coalesce(p->>'token', '')), '');
  v_app text := nullif(btrim(coalesce(p->>'app_secret', '')), '');
  n lingo_feeder.numbers;
  v_tid uuid; v_aid uuid; v_changed boolean;
begin
  if v_pnid !~ '^[0-9]{6,25}$' then return jsonb_build_object('ok', false, 'error', 'phone_number_id'); end if;
  if v_waba is not null and v_waba !~ '^[0-9]{6,25}$' then return jsonb_build_object('ok', false, 'error', 'waba_id'); end if;
  if exists (select 1 from lingo_feeder.numbers where phone_number_id = v_pnid and user_id <> v_user) then
    return jsonb_build_object('ok', false, 'error', 'taken');
  end if;
  select * into n from lingo_feeder.numbers where user_id = v_user;
  if n.phone_number_id is null and (v_token is null or v_app is null) then
    return jsonb_build_object('ok', false, 'error', 'secrets');
  end if;
  v_tid := n.token_secret_id; v_aid := n.app_secret_id;
  if v_token is not null then
    if v_tid is null then v_tid := vault.create_secret(v_token, 'lingo_feeder_token_' || replace(gen_random_uuid()::text, '-', ''), 'Lingo Feeder WhatsApp token');
    else perform vault.update_secret(v_tid, v_token); end if;
  end if;
  if v_app is not null then
    if v_aid is null then v_aid := vault.create_secret(v_app, 'lingo_feeder_app_' || replace(gen_random_uuid()::text, '-', ''), 'Lingo Feeder WhatsApp app secret');
    else perform vault.update_secret(v_aid, v_app); end if;
  end if;
  v_changed := n.phone_number_id is null or n.phone_number_id <> v_pnid or n.waba_id is distinct from v_waba or v_token is not null or v_app is not null;
  if n.phone_number_id is null then
    insert into lingo_feeder.numbers (phone_number_id, user_id, waba_id, token_secret_id, app_secret_id, token_last4)
    values (v_pnid, v_user, v_waba, v_tid, v_aid, right(v_token, 4))
    returning * into n;
  else
    update lingo_feeder.numbers set
      phone_number_id = v_pnid, waba_id = v_waba, token_secret_id = v_tid, app_secret_id = v_aid,
      token_last4 = coalesce(right(v_token, 4), token_last4),
      status = case when v_changed and status <> 'disabled' then 'pending' else status end,
      last_webhook_at = case when n.phone_number_id <> v_pnid then null else last_webhook_at end,
      display_phone = case when n.phone_number_id <> v_pnid then null else display_phone end,
      verified_name = case when n.phone_number_id <> v_pnid then null else verified_name end,
      problem = case when v_changed then null else problem end
    where user_id = v_user
    returning * into n;
  end if;
  insert into lingo_feeder.events (user_id, type, detail) values (v_user, 'number_saved',
    jsonb_build_object('phone_number_id', v_pnid, 'token_replaced', v_token is not null, 'app_secret_replaced', v_app is not null));
  return jsonb_build_object('ok', true, 'phone_number_id', n.phone_number_id, 'status', n.status, 'verify_token', n.verify_token);
end $$;

create or replace function lingo_feeder.remove_number(p_user uuid) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare n lingo_feeder.numbers;
begin
  delete from lingo_feeder.numbers where user_id = p_user returning * into n;
  if n.phone_number_id is not null then
    delete from vault.secrets where id in (n.token_secret_id, n.app_secret_id);
    update lingo_feeder.sellers set status = case when status = 'live' then 'setup' else status end where user_id = p_user;
    insert into lingo_feeder.events (user_id, type, detail) values (p_user, 'number_removed', jsonb_build_object('phone_number_id', n.phone_number_id));
  end if;
  return jsonb_build_object('ok', n.phone_number_id is not null);
end $$;

-- Home: today, this month, and how many chats have each status (no test chats).
create or replace function lingo_feeder.panel_home(p_user uuid) returns jsonb
language sql stable security definer set search_path = lingo_feeder, public as $$
  with b as (select date_trunc('day', now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo' as today,
                    date_trunc('month', now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo' as month)
  select jsonb_build_object(
    'chats_today', (select count(*) from chats c, b where c.user_id = p_user and not c.test and c.created_at >= b.today),
    'orders_today', (select count(*) from orders o, b where o.user_id = p_user and not o.test and o.status = 'confirmed' and o.confirmed_at >= b.today),
    'sales_today', (select coalesce(sum(o.total), 0) from orders o, b where o.user_id = p_user and not o.test and o.status = 'confirmed' and o.confirmed_at >= b.today),
    'chats_month', (select count(*) from chats c, b where c.user_id = p_user and not c.test and c.created_at >= b.month),
    'orders_month', (select count(*) from orders o, b where o.user_id = p_user and not o.test and o.status = 'confirmed' and o.confirmed_at >= b.month),
    'sales_month', (select coalesce(sum(o.total), 0) from orders o, b where o.user_id = p_user and not o.test and o.status = 'confirmed' and o.confirmed_at >= b.month),
    'to_export', (select count(*) from orders o where o.user_id = p_user and not o.test and o.status = 'confirmed' and o.exported_at is null),
    'call', (select count(*) from chats c where c.user_id = p_user and not c.test and c.needs_call),
    'unmatched_ads', (select count(*) from ads a where a.user_id = p_user and a.product_id is null),
    'statuses', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from chats c where c.user_id = p_user and not c.test group by status) x), '{}'::jsonb)
  );
$$;

-- Chats for the panel list: newest first, by status ("call" = needs a call), optional search.
create or replace function lingo_feeder.panel_chats(p_user uuid, p_status text default 'all', p_q text default null, p_limit int default 100) returns jsonb
language sql stable security definer set search_path = lingo_feeder, public as $$
  select coalesce(jsonb_agg(x order by x->>'last_msg_at' desc nulls last), '[]'::jsonb) from (
    select jsonb_build_object(
             'phone', c.phone, 'name', coalesce(nullif(c.details->>'name', ''), c.profile_name), 'status', c.status, 'status_at', c.status_at,
             'needs_call', c.needs_call, 'call_reason', c.call_reason, 'paused_until', c.paused_until, 'last_msg_at', c.last_msg_at,
             'last_in_at', c.last_in_at, 'product', (select pr.name from products pr where pr.product_id = c.product_id),
             'orders', (select count(*) from orders o where o.user_id = c.user_id and o.phone = c.phone and o.status = 'confirmed'),
             'last', (select jsonb_build_object('role', m.role, 'content', left(m.content, 140), 'at', m.created_at)
                        from messages m where m.user_id = c.user_id and m.phone = c.phone order by m.id desc limit 1)) as x
      from chats c
     where c.user_id = p_user and not c.test
       and case when p_status = 'call' then c.needs_call when p_status in ('all', '') then c.status <> 'spam' else c.status = p_status end
       and (coalesce(btrim(p_q), '') = '' or c.phone like '%' || regexp_replace(p_q, '\D', '', 'g') || '%' and regexp_replace(p_q, '\D', '', 'g') <> ''
            or c.profile_name ilike '%' || btrim(p_q) || '%' or c.details->>'name' ilike '%' || btrim(p_q) || '%'
            or exists (select 1 from orders o where o.user_id = c.user_id and o.phone = c.phone and o.name ilike '%' || btrim(p_q) || '%'))
     order by c.last_msg_at desc nulls last
     limit least(greatest(p_limit, 1), 300)) t;
$$;

-- =====================================================================
-- Admin (admin.retexia.com → Products → Feeder → Lingo Feeder)
-- =====================================================================

-- Profit for one month (Sri Lanka time): money in (payments for the Lingo Feeder package), AI cost,
-- fixed costs and payment fees, per seller and in total.
create or replace function lingo_feeder.admin_profit(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = lingo_feeder, public as $$
declare
  v_from timestamptz := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Colombo')::date)::timestamp) at time zone 'Asia/Colombo';
  v_to timestamptz := (date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Colombo')::date)::timestamp) + interval '1 month') at time zone 'Asia/Colombo';
  m jsonb := coalesce(lingo_feeder.setting('money'), '{}'::jsonb);
  v_rate numeric := coalesce((m->>'usd_to_lkr')::numeric, 300);
  v_pkg uuid;
  v_rows jsonb;
begin
  select k.id into v_pkg from public.packages k join public.products p on p.id = k.product_id where p.slug = 'feeder' and k.slug = 'lingo-feeder';
  with s as (
    select s.user_id, s.business_name, s.status, s.ai_budget_usd, s.created_at from lingo_feeder.sellers s
  ),
  ai as (
    select user_id, sum(cost_usd) as usd, sum(cost_usd) filter (where test) as test_usd,
           jsonb_object_agg(task, task_usd) as by_task
      from (select user_id, task, test, cost_usd, sum(cost_usd) over (partition by user_id, task) as task_usd from lingo_feeder.ai_usage
             where created_at >= v_from and created_at < v_to) a
     group by user_id
  ),
  prov as (
    select user_id, jsonb_object_agg(provider, usd) as by_provider
      from (select user_id, provider, sum(cost_usd) as usd from lingo_feeder.ai_usage where created_at >= v_from and created_at < v_to group by 1, 2) x
     group by user_id
  ),
  pay as (
    select o.user_id,
           sum(case when y.kind = 'refund' then -y.amount else y.amount end) as lkr
      from public.payments y join public.orders o on o.id = y.order_id
     where o.package_id = v_pkg and y.status = 'confirmed'
       and coalesce(y.paid_at, y.confirmed_at, y.created_at) >= v_from and coalesce(y.paid_at, y.confirmed_at, y.created_at) < v_to
     group by o.user_id
  ),
  plan as (
    select distinct on (o.user_id) o.user_id, o.status, o.billing_cycle, o.price_amount,
           case when o.billing_cycle = 'yearly' then coalesce(o.price_amount, 0) / 12 else coalesce(o.price_amount, 0) end as mrr
      from public.orders o where o.package_id = v_pkg and o.status in ('setting_up', 'active', 'paused', 'trial')
     order by o.user_id, o.created_at desc
  ),
  act as (
    select c.user_id, count(*) filter (where c.created_at >= v_from and c.created_at < v_to) as chats
      from lingo_feeder.chats c where not c.test group by c.user_id
  ),
  ord as (
    select o.user_id, count(*) as orders, coalesce(sum(o.total), 0) as sales
      from lingo_feeder.orders o where not o.test and o.status = 'confirmed' and o.confirmed_at >= v_from and o.confirmed_at < v_to group by o.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', s.user_id, 'business', s.business_name, 'status', s.status, 'budget', s.ai_budget_usd, 'plan', pl.status, 'billing_cycle', pl.billing_cycle,
           'mrr_lkr', round(coalesce(pl.mrr, 0), 2), 'paid_lkr', round(coalesce(pay.lkr, 0), 2),
           'ai_usd', round(coalesce(ai.usd, 0), 4), 'ai_test_usd', round(coalesce(ai.test_usd, 0), 4),
           'ai_by_task', coalesce(ai.by_task, '{}'::jsonb), 'ai_by_provider', coalesce(prov.by_provider, '{}'::jsonb),
           'chats', coalesce(act.chats, 0), 'orders', coalesce(ord.orders, 0), 'sales_lkr', coalesce(ord.sales, 0))
           order by coalesce(ai.usd, 0) desc), '[]'::jsonb)
    into v_rows
    from s
    left join ai on ai.user_id = s.user_id left join prov on prov.user_id = s.user_id left join pay on pay.user_id = s.user_id
    left join plan pl on pl.user_id = s.user_id left join act on act.user_id = s.user_id left join ord on ord.user_id = s.user_id;
  return jsonb_build_object(
    'from', v_from, 'to', v_to, 'money', m, 'usd_to_lkr', v_rate,
    'allowance', coalesce(lingo_feeder.setting('allowance'), '{}'::jsonb),
    'ai', coalesce(lingo_feeder.setting('ai'), '{}'::jsonb),
    'price', (select jsonb_build_object('monthly', k.price_monthly, 'yearly', k.price_yearly) from public.packages k where k.id = v_pkg),
    'sellers', v_rows,
    'unmatched_ads', (select count(*) from lingo_feeder.ads where product_id is null),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'user_id', e.user_id, 'detail', e.detail, 'at', e.created_at) order by e.created_at desc)
                          from (select * from lingo_feeder.events where type in ('unknown_number', 'send_failed', 'number_problem', 'allowance_used', 'unknown_model_price', 'ai_failed', 'photo_broken', 'ad_unmatched')
                                  and created_at > now() - interval '7 days' order by created_at desc limit 40) e), '[]'::jsonb));
end $$;

-- =====================================================================
-- Grants: only the service role runs these
-- =====================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'lingo_feeder.setting(text)', 'lingo_feeder.catalog(uuid)', 'lingo_feeder.match_products(uuid,text,int)', 'lingo_feeder.budget(uuid)',
    'lingo_feeder.log_usage(uuid,text,jsonb,boolean)', 'lingo_feeder.seller_info(uuid)', 'lingo_feeder.bot_number(jsonb)',
    'lingo_feeder.bot_verify_token(jsonb)', 'lingo_feeder.bot_gate(jsonb)', 'lingo_feeder.bot_set_ad(jsonb)', 'lingo_feeder.bot_buffer_add(jsonb)',
    'lingo_feeder.bot_claim(jsonb)', 'lingo_feeder.bot_save_turn(jsonb)', 'lingo_feeder.bot_statuses(jsonb)', 'lingo_feeder.bot_echo(jsonb)',
    'lingo_feeder.bot_due_followups(jsonb)', 'lingo_feeder.bot_set_wa_ids(jsonb)', 'lingo_feeder.bot_numbers_to_check(jsonb)',
    'lingo_feeder.bot_save_check(jsonb)', 'lingo_feeder.ensure_seller(uuid,text)', 'lingo_feeder.save_number(jsonb)',
    'lingo_feeder.remove_number(uuid)', 'lingo_feeder.panel_home(uuid)', 'lingo_feeder.panel_chats(uuid,text,text,int)',
    'lingo_feeder.admin_profit(date)']
  loop
    execute format('revoke execute on function %s from public', f);
    execute format('revoke execute on function %s from anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
grant execute on function lingo_feeder.first_name(text) to service_role, authenticated;

-- =====================================================================
-- Seeds: model prices and settings (re-running keeps your edits)
-- =====================================================================
insert into lingo_feeder.model_prices (model, provider, in_per_m, cached_per_m, out_per_m, audio_per_m) values
  ('gpt-5.4-mini', 'openai', 0.75, 0.075, 4.50, null),
  ('gpt-5.4-nano', 'openai', 0.20, 0.02, 1.25, null),
  ('gpt-5-mini', 'openai', 0.25, 0.025, 2.00, null),
  ('gemini-3.5-flash-lite', 'gemini', 0.30, 0.03, 2.50, 0.30),
  ('gemini-3.1-flash-lite', 'gemini', 0.25, 0.025, 1.50, 0.50)
on conflict (model) do nothing;

insert into lingo_feeder.settings (key, value, note) values
('ai', '{"brain": "gpt-5.4-mini", "cheap": "gpt-5.4-nano", "ad_match": "gpt-5.4-nano", "media": "gemini-3.5-flash-lite", "fallback": "gemini-3.5-flash-lite", "openai_reasoning": "none", "openai_cache_24h": false, "gemini_thinking": "minimal"}',
 'Models. brain = the conversation (OpenAI gpt-* or Gemini gemini-*); cheap = after a seller''s allowance; ad_match = which product an ad sells (once per ad); media = voice notes and photos (Gemini); fallback = used when OpenAI fails. openai_reasoning: none | minimal | low (none = no hidden reasoning tokens). gemini_thinking: minimal | low.'),
('allowance', '{"usd": 10, "cheap_until": 2}',
 'Each seller''s monthly AI allowance in US$ (a seller''s own ai_budget_usd wins). Over it Lingo uses the cheap model; over cheap_until × the allowance it answers with fixed texts only (unclear questions go to "call them").'),
('money', '{"usd_to_lkr": 300, "fixed_costs_lkr": 9000, "payment_fee_pct": 3, "target_margin_pct": 60}',
 'For the profit report in admin: exchange rate, monthly fixed costs shared by all sellers (n8n server, Supabase share…), card/payment fee %, the margin the price should keep.'),
('timing', '{"batch_seconds": 8, "tap_seconds": 1, "no_reply_hours": 3, "followup_hours": 3, "followup_from": 8, "followup_to": 21, "pause_hours": 12}',
 'batch_seconds: wait for more messages before answering. no_reply_hours: quiet this long after Lingo spoke = "stopped replying". One follow-up after followup_hours, only between followup_from and followup_to (Sri Lanka time) and inside WhatsApp''s 24 h window. pause_hours: Lingo stays quiet in a chat after the seller replies there.'),
('banned', '["100% cure", "guaranteed cure", "permanent cure", "no side effects", "zero side effects", "stop your medicine", "stop taking your medicine", "සම්පූර්ණයෙන්ම සුව", "සුව කරනවා", "අතුරු ආබාධ නෑ", "අතුරු ආබාධයක් නෑ", "athuru abadayak na", "athuruabadayak na", "beheth nawaththanna", "බෙහෙත් නවත්වන්න"]',
 'Never sent: if an AI answer contains one of these, Lingo says she will check and the chat goes to "call them".'),
('lingo_style', '""',
 'Extra lines for Lingo''s way of talking, added to her instructions for every seller (e.g. "Call customers dr in Singlish."). Keep it short.')
on conflict (key) do nothing;

-- Texts. si = Sinhala, sg = Singlish, en = English. Placeholders: {greet} {name} {business} {product} {price}
-- {delivery_fee} {total} {qty} {o_name} {o_address} {o_phones} {missing} {field} {delivery_days} {location}
-- {call_hours} {how_to_use} {precautions}. Buttons max 20 characters, list rows 24.
insert into lingo_feeder.settings (key, value, note) values ('texts', $json${
  "greet_morning":   {"si": "සුභ උදෑසනක්", "sg": "Good morning", "en": "Good morning"},
  "greet_afternoon": {"si": "සුභ දහවලක්", "sg": "Good afternoon", "en": "Good afternoon"},
  "greet_evening":   {"si": "සුභ සන්ධ්‍යාවක්", "sg": "Good evening", "en": "Good evening"},
  "greet_night":     {"si": "ආයුබෝවන්", "sg": "Hi", "en": "Hi"},
  "hello": {
    "si": "{greet} {name} 😊 මම Lingo, {business} එකෙන්.",
    "sg": "{greet} {name} 😊 Mama Lingo, {business} eken.",
    "en": "{greet} {name} 😊 I'm Lingo from {business}."},
  "total_line": {
    "si": "💵 Delivery එක්කම මුළු මුදල රු. {total}/- යි. බඩුව ගෙදරට ආවම ගෙවන්න පුළුවන් (Cash on delivery).",
    "sg": "💵 Delivery ekkama total eka Rs. {total}/- yi. Badu gedarata awama gewanna puluwan (Cash on delivery).",
    "en": "💵 It's Rs. {total}/- with delivery, and you pay when it arrives (cash on delivery)."},
  "details_form": {
    "si": "ඕඩර් එක දාන්න මේ විස්තර ටික එවන්න 👇\n👤 නම :\n🏠 ලිපිනය :\n📞 දුරකථන අංකය :",
    "sg": "Order eka danna me details tika ewanna 👇\n👤 Nama :\n🏠 Address eka :\n📞 Phone number eka :",
    "en": "To order, just send 👇\n👤 Name :\n🏠 Address :\n📞 Phone number :"},
  "got_details": {
    "si": "ඔයාගේ විස්තර ලැබුණා, ස්තූතියි 🙏",
    "sg": "Oyage details labuna, thank you 🙏",
    "en": "Got your details, thank you 🙏"},
  "next_product": {
    "si": "{product} ඕඩර් කරන්න කැමති නම් පහළ button එක ඔබන්න 👇",
    "sg": "{product} order karanna kamathi nam pahala button eka obanna 👇",
    "en": "If you'd like to order {product}, tap the button below 👇"},
  "ask_product": {
    "si": "{greet} {name} 😊 මම Lingo, {business} එකෙන්. ඔයා බැලුවේ මොන product එක ගැනද? නම හරි ad එකේ screenshot එකක් හරි එවන්නකෝ.",
    "sg": "{greet} {name} 😊 Mama Lingo, {business} eken. Oya baluwe mona product eka gena da? Nama hari ad eke screenshot ekak hari ewannako.",
    "en": "{greet} {name} 😊 I'm Lingo from {business}. Which product were you looking at? Send me its name or a screenshot of the ad."},
  "pick_product": {"si": "ඔයා අහන්නේ මේ එකක් ගැනද? 👇", "sg": "Oya ahanne me ekak gena da? 👇", "en": "Is it one of these? 👇"},
  "ask_qty": {
    "si": "හරි {name} 😊 කීයක් ඕනද? 👇\nකීයක් ගත්තත් delivery ගාස්තුව එක පාරයි 🚚",
    "sg": "Hari {name} 😊 Kiyak onada? 👇\nKiyak gaththath delivery eka eka parai 🚚",
    "en": "Sure {name} 😊 How many would you like? 👇\nDelivery is charged only once 🚚"},
  "qty_row": {"si": "{qty}ක්", "sg": "{qty}k", "en": "{qty}"},
  "qty_desc": {"si": "මුළු මුදල රු. {total}/-", "sg": "Total Rs. {total}/-", "en": "Total Rs. {total}/-"},
  "ask_details": {
    "si": "හරි {name} 😊 ඕඩර් එක දාන්න මේ විස්තර ටික එවන්න 👇\n👤 නම :\n🏠 ලිපිනය :\n📞 දුරකථන අංකය :",
    "sg": "Hari {name} 😊 Order eka danna me details tika ewanna 👇\n👤 Nama :\n🏠 Address eka :\n📞 Phone number eka :",
    "en": "Sure {name} 😊 To place your order, send 👇\n👤 Name :\n🏠 Address :\n📞 Phone number :"},
  "ask_missing": {
    "si": "ස්තූතියි 🙏 ඕඩර් එක දාන්න තව {missing} එවන්නකෝ.",
    "sg": "Thank you 🙏 Order eka danna thawa {missing} ewannako.",
    "en": "Thank you 🙏 Please send your {missing} too."},
  "f_name": {"si": "නම", "sg": "nama", "en": "name"},
  "f_address": {"si": "ලිපිනය", "sg": "address eka", "en": "address"},
  "f_phone": {"si": "දුරකථන අංකය", "sg": "phone number eka", "en": "phone number"},
  "f_qty": {"si": "ප්‍රමාණය", "sg": "pramanaya", "en": "quantity"},
  "and": {"si": " සහ ", "sg": " saha ", "en": " and "},
  "same_details": {
    "si": "කලින් දුන්න විස්තරවලටම එවන්නද? 👇\n\n👤 {o_name}\n🏠 {o_address}\n📞 {o_phones}",
    "sg": "Kalin dunna details walatama ewannada? 👇\n\n👤 {o_name}\n🏠 {o_address}\n📞 {o_phones}",
    "en": "Shall we send it to the same details as last time? 👇\n\n👤 {o_name}\n🏠 {o_address}\n📞 {o_phones}"},
  "summary": {
    "si": "📝 *ඔයාගේ ඕඩර් එක*\n\n🛍️ {product} × {qty}\n👤 {o_name}\n🏠 {o_address}\n📞 {o_phones}\n\n💵 මුළු මුදල රු. {total}/- (delivery රු. {delivery_fee} එක්කම)\n💳 බඩුව ලැබුණම ගෙවන්න (Cash on delivery)\n\nහරි නම් *Confirm* ඔබන්න 👇",
    "sg": "📝 *Oyage order eka*\n\n🛍️ {product} × {qty}\n👤 {o_name}\n🏠 {o_address}\n📞 {o_phones}\n\n💵 Total Rs. {total}/- (delivery Rs. {delivery_fee} ekkama)\n💳 Badu labunama gewanna (Cash on delivery)\n\nHari nam *Confirm* obanna 👇",
    "en": "📝 *Your order*\n\n🛍️ {product} × {qty}\n👤 {o_name}\n🏠 {o_address}\n📞 {o_phones}\n\n💵 Total Rs. {total}/- (incl. delivery Rs. {delivery_fee})\n💳 Pay when it arrives (cash on delivery)\n\nIf it's all correct, tap *Confirm* 👇"},
  "confirmed": {
    "si": "❤️ බොහොම ස්තූතියි {o_first}! ඔයාගේ ඕඩර් එක confirm කළා.\n📦 ඉක්මනින්ම pack කරලා courier එකට දෙනවා. දවස් {delivery_days}ක් ඇතුළත ගෙදරටම ලැබෙයි, එන්න කලින් courier එකෙන් call එකක් දෙයි 📞",
    "sg": "❤️ Bohoma sthuthi {o_first}! Oyage order eka confirm kala.\n📦 Ikmanatama pack karala courier ekata denawa. Dawas {delivery_days} athara gedaratama labei, enna kalin courier eken call ekak dei 📞",
    "en": "❤️ Thank you so much {o_first}! Your order is confirmed.\n📦 We'll pack it and hand it to the courier soon. It reaches your door within {delivery_days} days, and the courier will call before delivering 📞"},
  "how_to_use": {
    "si": "📖 *{product}* භාවිතා කරන හැටි\n\n{how_to_use}{precautions}\n\nමොනවා හරි ප්‍රශ්නයක් තියෙනවා නම් අහන්න, මම ඉන්නවා 😊",
    "sg": "📖 *{product}* use karana hati\n\n{how_to_use}{precautions}\n\nMonawa hari prashnayak thiyenawa nam ahanna, mama innawa 😊",
    "en": "📖 How to use *{product}*\n\n{how_to_use}{precautions}\n\nIf you have any questions, just ask, I'm here 😊"},
  "cancelled": {
    "si": "හරි {name}, ඕඩර් එක cancel කළා 👍 ආයෙත් ඕන වුණොත් මට message එකක් දාන්න 😊",
    "sg": "Hari {name}, order eka cancel kala 👍 Ayeth ona unoth mata message ekak danna 😊",
    "en": "Okay {name}, your order is cancelled 👍 Message me anytime if you need it again 😊"},
  "change_pick": {"si": "මොකක්ද වෙනස් කරන්න ඕන? 👇", "sg": "Mokakda wenas karanna one? 👇", "en": "What would you like to change? 👇"},
  "change_ask": {
    "si": "හරි 😊 අලුත් {field} එවන්න.",
    "sg": "Hari 😊 Aluth {field} ewanna.",
    "en": "Sure 😊 Send the new {field}."},
  "price": {
    "si": "💰 *{product}*\nමිල රු. {price}/-\n🚚 Delivery රු. {delivery_fee}/-\n💵 මුළු මුදල රු. {total}/- (බඩුව ලැබුණම ගෙවන්න)",
    "sg": "💰 *{product}*\nPrice eka Rs. {price}/-\n🚚 Delivery Rs. {delivery_fee}/-\n💵 Total Rs. {total}/- (badu labunama gewanna)",
    "en": "💰 *{product}*\nPrice Rs. {price}/-\n🚚 Delivery Rs. {delivery_fee}/-\n💵 Total Rs. {total}/- (pay when it arrives)"},
  "delivery": {
    "si": "🚚 ලංකාවේ ඕනම තැනකට delivery කරනවා, ගාස්තුව රු. {delivery_fee}/- යි. ඕඩර් එක දාලා දවස් {delivery_days}ක් ඇතුළත courier එකෙන් ගෙදරටම ගෙනත් දෙනවා, එන්න කලින් call එකක් දෙයි 📞",
    "sg": "🚚 Lankawe onama thanakata delivery karanawa, charge eka Rs. {delivery_fee}/- yi. Order eka dala dawas {delivery_days} athara courier eken gedaratama genath denawa, enna kalin call ekak dei 📞",
    "en": "🚚 We deliver anywhere in Sri Lanka for Rs. {delivery_fee}/-. It reaches your door by courier within {delivery_days} days of ordering, and they call before delivering 📞"},
  "payment": {
    "si": "💵 බඩුව ගෙදරට ආවම courier එකට සල්ලි දෙන්න පුළුවන් (Cash on delivery) 😊 කලින් ගෙවන්න ඕන නෑ.",
    "sg": "💵 Badu gedarata awama courier ekata salli denna puluwan (Cash on delivery) 😊 Kalin gewanna ona na.",
    "en": "💵 You pay the courier when it arrives (cash on delivery) 😊 Nothing to pay now."},
  "shop": {
    "si": "📍 අපි {business}{location}. Online විතරයි විකුණන්නේ, කඩවල නෑ. ඕඩර් එක දැම්මම ලංකාවේ ඕනම තැනකට courier එකෙන් ගෙදරටම එවනවා 🚚",
    "sg": "📍 Api {business}{location}. Online witharai wikunanne, kadawala na. Order eka dammama Lankawe onama thanakata courier eken gedaratama ewanawa 🚚",
    "en": "📍 We're {business}{location}. We sell online only, not in shops: order here and the courier brings it to your door anywhere in Sri Lanka 🚚"},
  "call_ok": {
    "si": "හරි {name} 😊 අපේ කෙනෙක් ඉක්මනින්ම මේ number එකට call එකක් දෙයි 📞 ({call_hours})",
    "sg": "Hari {name} 😊 Ape kenek ikmanatama me number ekata call ekak dei 📞 ({call_hours})",
    "en": "Sure {name} 😊 Someone from our team will call you on this number soon 📞 ({call_hours})"},
  "complaint": {
    "si": "අයියෝ සමාවෙන්න {name} 🙏 මම මේක දැන්ම අපේ team එකට කිව්වා, ඉක්මනින්ම ඔයාට call කරලා බලනවා 📞",
    "sg": "Ayyo samawenna {name} 🙏 Mama meka danma ape team ekata kiwwa, ikmanatama oyata call karala balanawa 📞",
    "en": "Oh, I'm so sorry {name} 🙏 I've told our team right away, and they'll call you soon 📞"},
  "will_check": {
    "si": "මම මේ ගැන office එකෙන් අහලා ඉක්මනින්ම කියන්නම් {name} 😊",
    "sg": "Mama me gena office eken ahala ikmanatama kiyannam {name} 😊",
    "en": "Let me check this with our team and get back to you soon {name} 😊"},
  "thanks": {
    "si": "ස්තූතියි {name} 😊 තව මොනවා හරි ඕන නම් අහන්න, මම ඉන්නවා.",
    "sg": "Thank you {name} 😊 Thawa monawa hari ona nam ahanna, mama innawa.",
    "en": "Thank you {name} 😊 Just ask if you need anything else."},
  "ok_reply": {
    "si": "හරි {name} 😊 ඕඩර් එක දාන්න කැමති නම් පහළ button එක ඔබන්න, නැත්නම් ඕන දෙයක් අහන්න 👇",
    "sg": "Hari {name} 😊 Order eka danna kamathi nam pahala button eka obanna, nathnam ona deyak ahanna 👇",
    "en": "Sure {name} 😊 Tap the button below to order, or ask me anything 👇"},
  "not_interested": {
    "si": "හරි {name} 😊 කමක් නෑ. ආයෙත් ඕන වුණොත් මට message එකක් දාන්න.",
    "sg": "Hari {name} 😊 Kamak na. Ayeth ona unoth mata message ekak danna.",
    "en": "No problem {name} 😊 Message me anytime if you need it."},
  "unclear": {
    "si": "සමාවෙන්න {name}, මට හරියටම තේරුණේ නෑ 🙏 ඔයාට ඕන මොකක්ද? 👇",
    "sg": "Samawenna {name}, mata hariyatama therune na 🙏 Oyata ona mokakda? 👇",
    "en": "Sorry {name}, I didn't quite get that 🙏 What would you like? 👇"},
  "followup": {
    "si": "{name} 😊 {product} ගැන තව මොනවා හරි දැනගන්න ඕනද? ඕඩර් එකක් දාන්න කැමති නම් පහළ button එක ඔබන්න 👇",
    "sg": "{name} 😊 {product} gena thawa monawa hari dana ganna onada? Order ekak danna kamathi nam pahala button eka obanna 👇",
    "en": "{name} 😊 Anything else you'd like to know about {product}? If you'd like to order, just tap the button below 👇"},
  "btn_order":   {"si": "🛒 ඕඩර් කරන්න", "sg": "🛒 Order karanna", "en": "🛒 Order now"},
  "btn_usage":   {"si": "📖 භාවිතා කරන හැටි", "sg": "📖 Use karana hati", "en": "📖 How to use"},
  "btn_call":    {"si": "📞 මට Call කරන්න", "sg": "📞 Mata call karanna", "en": "📞 Call me"},
  "btn_confirm": {"si": "✅ Confirm", "sg": "✅ Confirm", "en": "✅ Confirm"},
  "btn_change":  {"si": "✏️ වෙනස් කරන්න", "sg": "✏️ Wenas karanna", "en": "✏️ Change"},
  "btn_cancel":  {"si": "❌ එපා", "sg": "❌ Epa", "en": "❌ Cancel"},
  "btn_same":    {"si": "✅ ඔව්, ඒකටම", "sg": "✅ Ow, ekatama", "en": "✅ Yes, same"},
  "btn_new":     {"si": "📝 අලුත් විස්තර", "sg": "📝 Aluth details", "en": "📝 New details"},
  "btn_qty":     {"si": "ප්‍රමාණය තෝරන්න", "sg": "Pramanaya thoranna", "en": "Choose quantity"},
  "btn_pick":    {"si": "තෝරන්න", "sg": "Thoranna", "en": "Choose"},
  "btn_products":{"si": "Products බලන්න", "sg": "Products balanna", "en": "See products"},
  "btn_price":   {"si": "💰 මිල", "sg": "💰 Price eka", "en": "💰 Price"}
}$json$::jsonb, 'Every fixed text and button label. Edit the words, keep the {placeholders}. si = Sinhala, sg = Singlish, en = English.')
on conflict (key) do nothing;

-- =====================================================================
-- From the 0037 test version: keep sellers and WhatsApp numbers, remove the rest
-- =====================================================================
do $$
begin
  if to_regclass('lingo.bot_sellers') is not null then
    insert into lingo_feeder.sellers (user_id, business_name, phone, address, delivery_days, status, created_at)
    select s.user_id, left(coalesce(nullif(btrim(u.business_name), ''), 'My shop'), 80), s.shop_phone, s.shop_address,
           least(greatest(s.delivery_days, 1), 30)::text, s.status, s.created_at
      from lingo.bot_sellers s join lingo.lingo_users u on u.id = s.lingo_user_id
    on conflict (user_id) do nothing;
    if to_regclass('lingo.wa_numbers') is not null then
      insert into lingo_feeder.numbers (phone_number_id, user_id, waba_id, display_phone, verified_name, connect_mode, status, quality_rating,
                                        verify_token, token_secret_id, app_secret_id, token_last4, problem, last_webhook_at, last_check_at, last_check, created_at)
      select n.phone_number_id, s.user_id, n.waba_id, n.display_phone, n.verified_name, n.connect_mode, n.status, n.quality_rating,
             n.verify_token, n.token_secret_id, n.app_secret_id, n.token_last4, n.problem, n.last_webhook_at, n.last_check_at, n.last_check, n.created_at
        from lingo.wa_numbers n join lingo.bot_sellers s on s.lingo_user_id = n.lingo_user_id
      on conflict do nothing;
    end if;
  end if;
end $$;

drop function if exists lingo.seller_products(bigint), lingo.seller_settings(bigint), lingo.fixed_for(bigint), lingo.seller_budget(bigint),
  lingo.log_usage(bigint, text, jsonb, boolean), lingo.cache_key(text, text, text, text), lingo.bot_number(jsonb), lingo.bot_verify_token(jsonb),
  lingo.bot_gate(jsonb), lingo.bot_set_ad(jsonb), lingo.bot_buffer_add(jsonb), lingo.bot_claim(jsonb), lingo.bot_compact(jsonb),
  lingo.bot_cache_get(jsonb), lingo.bot_save_turn(jsonb), lingo.bot_handoff(jsonb), lingo.bot_statuses(jsonb), lingo.bot_echo(jsonb),
  lingo.bot_due_followups(jsonb), lingo.bot_set_wa_ids(jsonb), lingo.bot_numbers_to_check(jsonb), lingo.bot_save_check(jsonb),
  lingo.ensure_seller(uuid, text), lingo.sync_feeder_products(bigint), lingo.save_wa_number(jsonb), lingo.remove_wa_number(bigint),
  lingo.panel_overview(bigint, int), lingo.panel_inbox(bigint, text, int), lingo.admin_sellers(), lingo.admin_report(int);
drop view if exists lingo.lingo_products;
drop table if exists lingo.bot_events, lingo.eval_runs, lingo.eval_cases, lingo.ai_usage, lingo.model_prices, lingo.answer_cache,
  lingo.bot_orders, lingo.bot_product_msgs, lingo.bot_seen, lingo.bot_buffer, lingo.bot_messages, lingo.bot_customers, lingo.bot_ads,
  lingo.bot_fixed_messages, lingo.quick_rules, lingo.product_faqs, lingo.product_content, lingo.wa_numbers, lingo.bot_sellers;
