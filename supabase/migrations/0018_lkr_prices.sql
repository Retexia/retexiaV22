-- =====================================================================
-- 0018: Prices in Sri Lankan rupees (LKR) for PayHere.
--
--   * site currency back to LKR (0009 had switched it to USD for Paddle);
--   * the original LKR plan prices (as launched in the seed / 0008);
--   * requests that aren't paid yet are re-priced in LKR, so PayHere charges
--     rupees (paid requests keep what was paid);
--   * website wording: "Plans from LKR ...", "Prices in Sri Lankan rupees";
--   * contact address spelling (Battaramulla).
-- Safe to run again.
-- =====================================================================

update public.site_settings set currency_code = 'LKR', currency_locale = 'en-LK' where id = 1;
update public.packages set currency = null where currency is not null and currency <> 'LKR';

update public.packages pk
   set price_monthly = v.monthly, price_yearly = v.yearly, setup_fee = v.setup, fine_print = v.fine
  from public.products p,
       (values
         ('lingo', 'core', 6900.00, 69000.00, 9900.00, 'Prices in Sri Lankan rupees (LKR). WhatsApp marketing message fees charged by Meta are billed at cost. Yearly plans include 2 months free.'),
         ('lingo', 'pro', 14900.00, 149000.00, 19900.00, 'Prices in Sri Lankan rupees (LKR). WhatsApp marketing message fees charged by Meta are billed at cost. Yearly plans include 2 months free.'),
         ('lingo', 'supreme', 34900.00, 349000.00, 49900.00, 'Prices in Sri Lankan rupees (LKR). WhatsApp marketing message fees charged by Meta are billed at cost. Yearly plans include 2 months free.'),
         ('post', 'starter', 5900.00, 59000.00, 0, 'Prices in Sri Lankan rupees (LKR). Yearly plans include 2 months free. AI allowances reset every month; when one runs out, Post keeps posting with your own photos.'),
         ('post', 'growth', 14900.00, 149000.00, 0, 'Prices in Sri Lankan rupees (LKR). Yearly plans include 2 months free. AI allowances reset every month; when one runs out, Post keeps posting with your own photos.'),
         ('post', 'pro', 29900.00, 299000.00, 0, 'Prices in Sri Lankan rupees (LKR). Yearly plans include 2 months free. AI allowances reset every month; when one runs out, Post keeps posting with your own photos.')
       ) as v (product, slug, monthly, yearly, setup, fine)
 where p.id = pk.product_id and p.slug = v.product and pk.slug = v.slug;

-- Any other plan still saying "US dollars".
update public.packages set fine_print = replace(fine_print, 'Prices in US dollars.', 'Prices in Sri Lankan rupees (LKR).')
 where fine_print like '%US dollars%';

-- Requests not paid yet: priced again from their plan, in LKR.
update public.orders o
   set price_amount = case when o.billing_cycle = 'yearly' then coalesce(pk.price_yearly, pk.price_monthly) else pk.price_monthly end,
       setup_fee = pk.setup_fee,
       currency = 'LKR'
  from public.packages pk
 where pk.id = o.package_id
   and coalesce(o.currency, '') <> 'LKR'
   and o.status in ('submitted', 'reviewing', 'awaiting_payment')
   and not exists (select 1 from public.payments x where x.order_id = o.id and x.status = 'confirmed');

update public.pages set seo_description = replace(seo_description, 'Plans from US$25 a month.', 'Plans from LKR 6,900 a month.') where slug = 'lingo';
update public.pages set seo_description = replace(seo_description, 'Plans from US$19 a month.', 'Plans from LKR 5,900 a month.') where slug = 'post';

update public.site_settings set address = regexp_replace(address, '^\s*battamulla', 'Battaramulla', 'i')
 where id = 1 and address ~* '^\s*battamulla';
