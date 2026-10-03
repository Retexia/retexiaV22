# Admin panel plan (admin.retexia.com)

Working notes for `apps/admin`: what exists in the repo, where the admin spec's names differ from it
(**the repo wins**), and the decisions taken where the spec left room.

## What exists (from `0001_init.sql` and `0002_api_grants.sql`)

| Area | Tables / functions as they exist |
|---|---|
| Content | `site_settings` (single row, `id = 1`), `site_strings` (`key` pk), `navigation_items`, `pages`, `page_sections` (`type`, `content jsonb`), `services`, `testimonials`, `faqs` |
| Products | `products` (`slug`, `code`, `status` live/coming_soon/hidden, `color_light/dark/soft_light/soft_dark`, `page_slug`, `panel_url`, `panel_live`, `onboarding_form_id`), `product_features`, `packages` (`price_monthly`, `price_yearly`, `setup_fee`, `is_active`, `is_visible`, `is_featured`), `package_features` |
| Forms | `forms` (`version`), `form_steps`, `form_fields` (`key`, `type`, `options`, `show_if`, `prefill_from`, `width`, `min`, `max`) |
| Orders | `orders` (`ref`, `user_id`, `status`, `status_note`, `billing_cycle`, snapshot `package_name`/`price_amount`/`setup_fee`/`currency`, `answers` jsonb array, `admin_note`, `starts_at`, `renews_at`, `cancelled_at`), `order_statuses` (`key`, `label`, `tone`, `is_final`, `customer_can_cancel`), `order_events` (timeline), `order_counters` |
| Customers | `profiles` (`id` = auth user, `role`, `full_name`, `email`, `phone`, `whatsapp`, `business_name`, `marketing_opt_in`) |
| Inbox | `contact_messages` (`status` new/read/replied/archived), `waitlist` |
| Functions | `is_admin()`, `is_privileged()`, `request_role()`, `prepare_order()`, `guard_order_update()`, `log_order_event()`, `cancel_order()`, `protect_profile_fields()` |
| Storage | public bucket `site-assets` |

## Where the spec differs from the repo

| Spec says | Repo / decision |
|---|---|
| `supabase/migrations/0002_admin.sql` | `0002_api_grants.sql` already exists, so the admin migration is **`0003_admin.sql`**. |
| `orders.renews_at`, `starts_at`, `cancelled_at` "if missing" | Already exist. Added only `assigned_to`, `service_data`, `paused_at`, `cancel_reason`, `price_override_reason`, `source`. |
| `profiles.role` values | Constraint widened from `customer/admin` to `customer/support/editor/admin/owner`. Existing admins keep working: `is_admin()` now means admin **or** owner. |
| Receipt numbering prefix setting | Stored as `site_settings.receipt_prefix` (default `RCT`). |
| "Notifications: which events notify the customer by default" | Stored in a separate one-row table `staff_settings` (`notification_settings` jsonb + `staff_notification_emails`), because `site_settings` is readable by visitors and team emails must not be. |
| Customers can select "their own confirmed and refunded payments" | They also see their own **pending** payments, so the order page can say "We received your payment proof". |
| Customer proof upload "marks a pending payment" | Done by the RPC `customer_submit_payment_proof()` (checks ownership and status) instead of an insert policy on `payments`. |
| Service-role client reads `private` schema | `private` is not exposed through the Data API (not even to the service role), so it is read through `svc_*` functions in `public` that **only `service_role` may execute**. Staff writes go through role-checked `admin_*` RPCs. |
| `private.order_secrets` encrypted with pgsodium/Vault | Stored as plain text in the unexposed `private` schema (pgsodium is deprecated on Supabase and Vault is per-secret, not per-row). Only `service_role` and admin+ (audited reveal) can read. Documented in DEPLOY.md. |
| Delete user "keeps orders/payments" | `orders.user_id` was `not null … on delete cascade`. 0003 makes it nullable with `on delete set null`, and `admin_anonymise_user()` scrubs personal fields before the auth user is deleted. |
| Staff read orders including `admin_note` | Customers can't select `admin_note` (column grants from 0001), so staff read orders through the view **`staff_orders`** (all columns, returns rows only for staff). Same idea for **`staff_customers`** (profiles + sign-in data from `auth.users` + totals). |
| Support creates requests "on behalf of a customer" | `is_privileged()` now includes support, admin and owner (it lets `prepare_order` keep the chosen customer). Prices are still always snapshotted from the package unless an admin changes them with `admin_update_order()` and a reason. |
| Header "My account" when logged in | `navigation_items.signed_in_label` / `signed_in_href` (seeded on the header button). Empty = button stays as it is. |
| "Export a list of keys used in code at build time" | `scripts/extract-strings.mjs` also writes `packages/content/src/string-keys.json`, which admin compares with `site_strings`. |
| `apps/admin/src/products/registry.ts` | The admin app has no `src/` folder (same layout as `apps/web`), so it lives at `apps/admin/products/registry.ts`. |
| Default status flow + Lingo service fields/action "seed" | Status transitions are inserted by `0003_admin.sql` (`on conflict do nothing`, so edits in the admin survive). Lingo's service fields and action are inserted by 0003 too (only if the `lingo` product exists) and are also in `seed.sql`. |
| Pricing card "reuse web component from packages/ui" | The pricing card markup moved to `packages/ui` (`PricingCard`); web and admin both render it. |
| Receipt layout shared | `packages/ui` exports `Receipt`; web (customer receipts) and admin (`/print/receipt/[id]`) render the same component. |

## Decisions

- **No Cache Components in admin.** Every admin page is per-user and dynamic; caching would only add risk.
- **Roles are checked three times:** proxy (staff + MFA `aal2`), `requireRole()` in every server action/route handler, and RLS/RPC role checks in the database.
- **Status changes** from the admin go only through `admin_change_order_status()`. n8n callbacks use the same internal function (`_change_order_status`) with actor "n8n".
- **Secrets** (`secret` service fields, action webhook URLs/signing secrets, integration secrets) never reach the browser except masked; reveal is admin+ and writes an audit row.
- **Moving form fields across steps** uses one drag-and-drop context for all steps.
- **Section editor** is generated from the zod schemas in `packages/content` (via `z.toJSONSchema`) with widgets chosen by key (`icon`, `image_url`, `product_slug`, `body`).
- **Website preview** in the page editor is an iframe of the live site. `apps/web` now sends `Content-Security-Policy: frame-ancestors 'self' <NEXT_PUBLIC_ADMIN_URL>` instead of `X-Frame-Options: SAMEORIGIN` so only the admin can frame it.
- **Duplicate product code**: `admin_duplicate_product()` derives a free 3-letter code from the new slug when none is given.
- **Database types** are generated from the migrations by `scripts/gen-types.mjs` (runs them in PGlite and writes `database.types.ts` in the `supabase gen types` format), so they stay in sync without a running Supabase.
- **Form builder saves atomically** through `admin_save_form(p jsonb)`: one transaction rewrites steps and fields, bumps `forms.version`, refuses renaming a key customers already answered (`admin_form_locked_keys()` tells the builder which), rejects duplicate keys and `show_if` rules that point nowhere. Swapping two keys in one save works (renamed rows are parked on temporary keys first).
- **Team-only settings table.** `staff_settings` (one row) holds notification channels and team emails; RLS lets staff read and admins update; visitors have no grant.
- **Payment proofs bucket** has `file_size_limit` 5 MB and image/PDF `allowed_mime_types`; the upload server action checks the same before uploading.
- **Media uploads** go through a server action (type, 5 MB size, SVG script check) with `serverActions.bodySizeLimit = 6mb`; the website's proof upload uses the same limit.
- **Header button for signed-in visitors** is swapped client-side (`SiteNavBar` reads the browser session), because the header is cached for everyone.
- **Maintenance mode** lets every team role through on the website, not only admins.
- **Lost authenticator:** owners can reset a team member's two-step sign-in (Settings → Team), using the Auth admin MFA API; it is audited.
- **End-to-end tests** run against `scripts/e2e/mock-supabase.mjs`: the real migrations in PGlite with Supabase's roles and RLS, plus the parts of PostgREST, GoTrue (password, magic links, TOTP MFA, admin API) and Storage the apps use. No real Supabase project is touched.
