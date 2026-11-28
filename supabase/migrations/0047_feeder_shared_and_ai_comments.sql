-- =====================================================================
-- 0047: Feeder tools share one business and one product list; Auto comment
-- uses AI.
--
-- Autopublish, Auto comment and Lingo Feeder are for the same sellers, so:
--   * Business details live once, in feeder.customers (shop name, contact
--     number, town, address, delivery days, call hours, a line about the
--     shop), edited at feeder.retexia.com/business. Lingo Feeder's copy
--     (lingo_feeder.sellers) follows automatically, both ways, so the
--     WhatsApp bot keeps working unchanged.
--   * One price per product: the seller's price in My products
--     (feeder.customer_products) and in Lingo Feeder (lingo_feeder.
--     seller_products) follow each other.
--   * Auto comment: the AI reads each comment with the seller's products and
--     business details and decides what to hide (from the seller's own words,
--     "What to hide") and writes the reply and the private message ("How to
--     reply"). The keyword replies stay as the backup when AI can't answer.
-- Safe to run again. Run after 0046.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Business details, once
-- ---------------------------------------------------------------------
alter table feeder.customers add column if not exists business_name text check (business_name is null or char_length(btrim(business_name)) between 1 and 80);
alter table feeder.customers add column if not exists phone text check (phone is null or char_length(phone) <= 40);
alter table feeder.customers add column if not exists location text check (location is null or char_length(location) <= 120);
alter table feeder.customers add column if not exists address text check (address is null or char_length(address) <= 300);
alter table feeder.customers add column if not exists delivery_days text not null default '2-3' check (delivery_days ~ '^[0-9]{1,2}(-[0-9]{1,2})?$');
alter table feeder.customers add column if not exists call_hours text not null default '9am - 6pm' check (char_length(call_hours) <= 40);
alter table feeder.customers add column if not exists about text check (about is null or char_length(about) <= 300);
comment on column feeder.customers.business_name is 'The shop''s name, shared by every Feeder tool (Lingo Feeder greets with it, Auto comment signs with it). Empty = not filled in yet.';

-- feeder.customers → lingo_feeder.sellers (when the seller has Lingo Feeder).
create or replace function feeder.customers_share_business() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 or new.business_name is null then return new; end if;
  if to_regclass('lingo_feeder.sellers') is not null then
    update lingo_feeder.sellers s
       set business_name = new.business_name, phone = new.phone, location = new.location, address = new.address,
           delivery_days = new.delivery_days, call_hours = new.call_hours, about = new.about, updated_at = now()
     where s.user_id = new.user_id
       and (s.business_name, s.phone, s.location, s.address, s.delivery_days, s.call_hours, s.about)
           is distinct from (new.business_name, new.phone, new.location, new.address, new.delivery_days, new.call_hours, new.about);
  end if;
  return new;
end $$;
drop trigger if exists customers_share_business on feeder.customers;
create trigger customers_share_business after insert or update of business_name, phone, location, address, delivery_days, call_hours, about
  on feeder.customers for each row execute function feeder.customers_share_business();

do $$ begin
  if to_regclass('lingo_feeder.sellers') is null then return; end if;

  -- A new Lingo Feeder seller starts with the business details they already gave
  -- (ensure_seller() would otherwise name the shop after the person).
  create or replace function lingo_feeder.sellers_take_business() returns trigger
  language plpgsql security definer set search_path = '' as $f$
  declare c record;
  begin
    select * into c from feeder.customers where user_id = new.user_id and business_name is not null;
    if found then
      new.business_name := c.business_name; new.phone := c.phone; new.location := c.location; new.address := c.address;
      new.delivery_days := c.delivery_days; new.call_hours := c.call_hours; new.about := c.about;
    end if;
    return new;
  end $f$;
  drop trigger if exists sellers_take_business on lingo_feeder.sellers;
  create trigger sellers_take_business before insert on lingo_feeder.sellers
    for each row execute function lingo_feeder.sellers_take_business();

  -- lingo_feeder.sellers → feeder.customers (details saved in Lingo Feeder; not the
  -- placeholder a new seller row starts with).
  create or replace function lingo_feeder.sellers_share_business() returns trigger
  language plpgsql security definer set search_path = '' as $f$
  begin
    if pg_trigger_depth() > 1 or new.business_name = 'My shop' then return new; end if;
    insert into feeder.customers (user_id, business_name, phone, location, address, delivery_days, call_hours, about)
    values (new.user_id, new.business_name, new.phone, new.location, new.address, new.delivery_days, new.call_hours, new.about)
    on conflict (user_id) do update
       set business_name = excluded.business_name, phone = excluded.phone, location = excluded.location, address = excluded.address,
           delivery_days = excluded.delivery_days, call_hours = excluded.call_hours, about = excluded.about, updated_at = now();
    return new;
  end $f$;
  drop trigger if exists sellers_share_business on lingo_feeder.sellers;
  create trigger sellers_share_business after update of business_name, phone, location, address, delivery_days, call_hours, about
    on lingo_feeder.sellers for each row execute function lingo_feeder.sellers_share_business();

  -- Details already saved in Lingo Feeder become the shared ones (once).
  insert into feeder.customers (user_id, business_name, phone, location, address, delivery_days, call_hours, about)
  select s.user_id, s.business_name, s.phone, s.location, s.address, s.delivery_days, s.call_hours, s.about
    from lingo_feeder.sellers s
   where s.business_name <> 'My shop'
  on conflict (user_id) do update
     set business_name = excluded.business_name, phone = excluded.phone, location = excluded.location, address = excluded.address,
         delivery_days = excluded.delivery_days, call_hours = excluded.call_hours, about = excluded.about, updated_at = now()
   where feeder.customers.business_name is null;
end $$;

-- ---------------------------------------------------------------------
-- 2. One price per product
-- ---------------------------------------------------------------------
-- My products → Lingo Feeder.
create or replace function feeder.customer_products_share_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 or to_regclass('lingo_feeder.seller_products') is null then return new; end if;
  if exists (select 1 from lingo_feeder.sellers where user_id = new.user_id)
     and exists (select 1 from lingo_feeder.products where product_id = new.product_id) then
    insert into lingo_feeder.seller_products (user_id, product_id, price)
    values (new.user_id, new.product_id, nullif(new.price, 0))
    on conflict (user_id, product_id) do update set price = excluded.price, updated_at = now()
     where lingo_feeder.seller_products.price is distinct from excluded.price;
  end if;
  return new;
end $$;
drop trigger if exists customer_products_share_price on feeder.customer_products;
create trigger customer_products_share_price after insert or update of price on feeder.customer_products
  for each row execute function feeder.customer_products_share_price();

do $$ begin
  if to_regclass('lingo_feeder.seller_products') is null then return; end if;

  -- Lingo Feeder → My products (a price set there also puts the product in My products).
  create or replace function lingo_feeder.seller_products_share_price() returns trigger
  language plpgsql security definer set search_path = '' as $f$
  begin
    if pg_trigger_depth() > 1 then return new; end if;
    if new.price is null then
      update feeder.customer_products set price = null, updated_at = now()
       where user_id = new.user_id and product_id = new.product_id and price is not null;
    elsif exists (select 1 from feeder.products where product_id = new.product_id) then
      insert into feeder.customers (user_id) values (new.user_id) on conflict (user_id) do nothing;
      insert into feeder.customer_products (user_id, product_id, price)
      values (new.user_id, new.product_id, new.price)
      on conflict (user_id, product_id) do update set price = excluded.price, updated_at = now()
       where feeder.customer_products.price is distinct from excluded.price;
    end if;
    return new;
  end $f$;
  drop trigger if exists seller_products_share_price on lingo_feeder.seller_products;
  create trigger seller_products_share_price after insert or update of price on lingo_feeder.seller_products
    for each row execute function lingo_feeder.seller_products_share_price();

  -- Prices already set in Lingo Feeder reach My products (once; My products wins when both are set).
  insert into feeder.customers (user_id)
  select distinct sp.user_id from lingo_feeder.seller_products sp where sp.price is not null
  on conflict (user_id) do nothing;
  insert into feeder.customer_products (user_id, product_id, price)
  select sp.user_id, sp.product_id, sp.price
    from lingo_feeder.seller_products sp
    join feeder.products p on p.product_id = sp.product_id
   where sp.price is not null
  on conflict (user_id, product_id) do update set price = excluded.price
   where feeder.customer_products.price is null;
end $$;

-- ---------------------------------------------------------------------
-- 3. Auto comment with AI
-- ---------------------------------------------------------------------
alter table feeder.comment_settings add column if not exists ai_on boolean not null default true;
alter table feeder.comment_settings add column if not exists hide_rules text check (hide_rules is null or char_length(hide_rules) <= 1500);
alter table feeder.comment_settings add column if not exists reply_style text check (reply_style is null or char_length(reply_style) <= 1500);
comment on column feeder.comment_settings.hide_rules is 'The seller''s own words: which comments to hide. The AI follows them.';
comment on column feeder.comment_settings.reply_style is 'The seller''s own words: how to reply (tone, what to say in public, what in the private message).';

alter table feeder.comment_log add column if not exists ai boolean not null default false;
alter table feeder.comment_log add column if not exists ai_tokens int check (ai_tokens is null or ai_tokens >= 0);
alter table feeder.comment_log add column if not exists product_id int;
comment on column feeder.comment_log.ai is 'true = the AI decided (hide / reply / private message); false = the backup keyword replies did.';
