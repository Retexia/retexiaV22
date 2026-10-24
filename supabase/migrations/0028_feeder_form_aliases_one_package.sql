-- =====================================================================
-- 0028: Feeder: customers' form names become product aliases, and one
-- package (Bulk create v2, LKR 1,900).
--
--   * A form name a customer saves for a product (My products) is added to
--     feeder.products.aliases, so every search finds the product by it. When
--     they remove it, it leaves the aliases too, unless another customer
--     still uses that name for the same product.
--   * Existing form names are added now.
--   * Feeder is sold as one package: "Bulk create v2" (slug bulk-import-v2),
--     LKR 1,900. Other Feeder packages are hidden and closed to new orders;
--     customers who already have one keep it (it opens Bulk create v2).
-- Safe to run again. Run after 0027.
-- =====================================================================

-- Same name in any capitals / spacing = the same alias.
create or replace function feeder.alias_key(p text) returns text
language sql immutable as $$ select lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')) $$;

create or replace function feeder.sync_form_aliases() returns trigger
language plpgsql security definer set search_path = feeder, public as $$
declare
  v_add text[] := '{}';
  v_del text[] := '{}';
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_add := array(
      select n from unnest(new.form_names) n
       where btrim(n) <> ''
         and (tg_op = 'INSERT' or new.product_id <> old.product_id
              or not exists (select 1 from unnest(old.form_names) o where feeder.alias_key(o) = feeder.alias_key(n))));
    if cardinality(v_add) > 0 then
      update feeder.products p
         set aliases = p.aliases || array(
               select distinct on (feeder.alias_key(n)) btrim(n) from unnest(v_add) n
                where not exists (select 1 from unnest(p.aliases) a where feeder.alias_key(a) = feeder.alias_key(n))),
             updated_at = now()
       where p.product_id = new.product_id;
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_del := array(
      select o from unnest(old.form_names) o
       where tg_op = 'DELETE' or new.product_id <> old.product_id
          or not exists (select 1 from unnest(new.form_names) n where feeder.alias_key(n) = feeder.alias_key(o)));
    -- Names no other customer still uses for this product.
    v_del := array(
      select d from unnest(v_del) d
       where not exists (
         select 1 from feeder.customer_products c, unnest(c.form_names) x
          where c.product_id = old.product_id and c.user_id <> old.user_id and feeder.alias_key(x) = feeder.alias_key(d)));
    if cardinality(v_del) > 0 then
      update feeder.products p
         set aliases = array(select a from unnest(p.aliases) a
                              where feeder.alias_key(a) <> all (array(select feeder.alias_key(d) from unnest(v_del) d))),
             updated_at = now()
       where p.product_id = old.product_id;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists customer_form_aliases on feeder.customer_products;
create trigger customer_form_aliases
  after insert or update of form_names, product_id or delete on feeder.customer_products
  for each row execute function feeder.sync_form_aliases();

-- Form names saved before this migration.
update feeder.products p
   set aliases = p.aliases || array(
         select distinct on (feeder.alias_key(x)) btrim(x)
           from feeder.customer_products c, unnest(c.form_names) x
          where c.product_id = p.product_id and btrim(x) <> ''
            and not exists (select 1 from unnest(p.aliases) a where feeder.alias_key(a) = feeder.alias_key(x))),
       updated_at = now()
 where exists (select 1 from feeder.customer_products c where c.product_id = p.product_id and cardinality(c.form_names) > 0);

-- ---------------------------------------------------------------------
-- One package: Bulk create v2, LKR 1,900.
-- ---------------------------------------------------------------------
update public.packages k
   set name = 'Bulk create v2',
       tagline = 'Facebook, TikTok and your CRM sheets → one courier file',
       description = 'Upload Facebook and TikTok lead files and add your CRM Google Sheets. Retexia reads the columns whatever they are called, matches every order to your products by your form names, checks every lead, and gives you one courier CSV. Anything it can''t match exactly is shown to you instead of guessed.',
       price_monthly = 1900, badge = null, cta_label = 'Get Bulk create v2',
       is_active = true, is_visible = true, updated_at = now()
  from public.products p
 where p.id = k.product_id and p.slug = 'feeder' and k.slug = 'bulk-import-v2';

update public.packages k
   set is_active = false, is_visible = false, updated_at = now()
  from public.products p
 where p.id = k.product_id and p.slug = 'feeder' and k.slug <> 'bulk-import-v2';

delete from public.package_features
 where package_id = (select k.id from public.packages k join public.products p on p.id = k.product_id where p.slug = 'feeder' and k.slug = 'bulk-import-v2');
insert into public.package_features (package_id, label, sort_order)
select k.id, f.label, f.n
  from public.packages k
  join public.products p on p.id = k.product_id and p.slug = 'feeder'
  cross join (values
    (1, 'Facebook lead files (.xls, .csv) and TikTok lead files (.xlsx, .csv)'),
    (2, 'CRM Google Sheets by view link, saved to your account'),
    (3, 'Your products and form names: every lead lands on the right product'),
    (4, 'Any column names, in any language: found and checked automatically'),
    (5, 'Never guesses: anything unclear is shown before a file is made'),
    (6, 'One courier CSV for everything, downloaded to your computer')
  ) as f(n, label)
 where k.slug = 'bulk-import-v2';
