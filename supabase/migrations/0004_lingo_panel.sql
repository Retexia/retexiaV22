-- =====================================================================
-- 0004: link a Lingo order to its bot account for lingo.retexia.com.
-- The team fills "Lingo account ID" (lingo_users.id in the Lingo database)
-- on the request's Setup tab; the customer panel reads it through
-- customer_order_service_fields(). Safe to run again.
-- =====================================================================
insert into public.product_service_fields
  (product_id, key, label, type, help_text, visible_to_customer, required_for_status, sort_order)
select p.id, 'lingo_account_id', 'Lingo account ID', 'number',
       'lingo_users.id of this business in the Lingo database. Links the customer''s panel (lingo.retexia.com) to their bot.',
       true, null, 0
from public.products p
where p.slug = 'lingo'
on conflict (product_id, key) do update set
  label = excluded.label, help_text = excluded.help_text, visible_to_customer = true;
