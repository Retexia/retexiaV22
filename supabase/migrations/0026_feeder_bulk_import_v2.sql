-- =====================================================================
-- 0026: Retexia Feeder → "Bulk import v2" (LKR 2,400).
--
-- One courier CSV from Facebook lead files, TikTok lead files and CRM
-- Google Sheets (view links), together or separately. Columns are found by
-- name, whatever they are called (AI reads unclear ones). The panel shows it
-- at feeder.retexia.com/bulk-import-v2 for customers who bought it.
-- Needs the Feeder product (slug 'feeder'); nothing happens without it.
-- Safe to run again (the price and texts are updated, not duplicated).
-- =====================================================================

insert into public.packages (product_id, slug, name, tagline, description, price_monthly, price_yearly, setup_fee, badge, cta_label, is_active, is_visible, sort_order)
select p.id, 'bulk-import-v2', 'Bulk import v2',
       'Facebook, TikTok and your CRM sheet → one courier file',
       'Upload Facebook and TikTok lead files and add your CRM Google Sheets. Retexia reads the columns whatever they are called, matches each order to your products and gives you one courier CSV.',
       2400, null, 0, 'New', 'Get Bulk import v2', true, true,
       coalesce((select max(sort_order) + 1 from public.packages where product_id = p.id), 1)
  from public.products p
 where p.slug = 'feeder'
on conflict (product_id, slug) do update
   set name = excluded.name, tagline = excluded.tagline, description = excluded.description,
       price_monthly = excluded.price_monthly, badge = excluded.badge, cta_label = excluded.cta_label,
       is_active = true, updated_at = now();

-- What's included (shown on the pricing card).
delete from public.package_features
 where package_id = (select k.id from public.packages k join public.products p on p.id = k.product_id where p.slug = 'feeder' and k.slug = 'bulk-import-v2');
insert into public.package_features (package_id, label, sort_order)
select k.id, f.label, f.n
  from public.packages k
  join public.products p on p.id = k.product_id and p.slug = 'feeder'
  cross join (values
    (1, 'Facebook lead files (.xls, .csv)'),
    (2, 'TikTok lead files (.xlsx, .csv)'),
    (3, 'CRM Google Sheets by view link, as many as you need'),
    (4, 'Any column names: found automatically'),
    (5, 'One courier CSV for everything, downloaded to your computer')
  ) as f(n, label)
 where k.slug = 'bulk-import-v2';
