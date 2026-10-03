-- =============================================================================
-- Explicit API grants
-- -----------------------------------------------------------------------------
-- Newer Supabase projects do not grant table access to the API roles (anon,
-- authenticated) automatically. Without these grants every request fails with
-- "permission denied for table ...". Row Level Security (0001_init.sql) still
-- decides which rows each role can see or change; these grants only open the
-- door for RLS to do its job. Safe to run more than once.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Public content: everyone may read (RLS filters hidden rows), admins may write
-- (RLS "Admins can write" policies).
grant select on
  public.site_settings, public.site_strings, public.navigation_items, public.pages,
  public.page_sections, public.services, public.testimonials, public.faqs, public.products,
  public.product_features, public.packages, public.package_features, public.forms,
  public.form_steps, public.form_fields, public.order_statuses
to anon, authenticated;

grant insert, update, delete on
  public.site_settings, public.site_strings, public.navigation_items, public.pages,
  public.page_sections, public.services, public.testimonials, public.faqs, public.products,
  public.product_features, public.packages, public.package_features, public.forms,
  public.form_steps, public.form_fields, public.order_statuses
to authenticated;

-- Profiles: signed-in people read and edit their own row (role and email are
-- protected by the protect_profile_fields trigger).
grant select, update on public.profiles to authenticated;
grant insert, delete on public.profiles to authenticated; -- admins only, via RLS

-- Orders: column-level grants (customers never see admin_note).
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

-- Order timeline: owners read their own events (RLS); admins manage them.
grant select on public.order_events to authenticated;
grant insert, update, delete on public.order_events to authenticated; -- admins only, via RLS

-- Forms on the public site: anyone may add, only admins read (RLS).
grant insert on public.contact_messages, public.waitlist to anon, authenticated;
grant select, update, delete on public.contact_messages, public.waitlist to authenticated; -- admins only

-- Internal counter: no API access at all.
revoke all on public.order_counters from anon, authenticated;

-- Functions used by RLS policies and the account area.
grant execute on function
  public.is_admin(), public.is_privileged(), public.request_role()
to anon, authenticated;
revoke execute on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

-- Service role (webhooks, server-side tools) keeps full access.
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
