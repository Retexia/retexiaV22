# Retexia: complete handoff (web platform + plan for the mobile app)

Written 2026-11-26 from the code in this repository (last commit "longo feeder13"). Part 1 describes everything that exists. Part 2 is the plan for the React Native app.

**For a new Claude session:**
- Read this file first.
- Then read the files it points to.
- Never put secrets (keys, tokens, passwords) into the repo or into prompts; they live in Vercel, n8n and Supabase Vault.

---

# PART 1: WHAT EXISTS

## 1. What Retexia is

Retexia sells automation products to small Sri Lankan businesses. Everything is priced in LKR.

| Product | Panel | What it does |
|---|---|---|
| Retexia Lingo | lingo.retexia.com | WhatsApp bot on the customer's own WhatsApp (Evolution API, QR connect). Answers customers, takes orders. |
| Retexia Post | post.retexia.com | Daily social posts for Facebook/Instagram in the business's brand: approve or skip, published on time. |
| Retexia Feeder | feeder.retexia.com | Tools for Feeder dropshipping resellers. Packages: **Bulk create v2** (lead files → courier CSV), **Autopublish** (free Meta/TikTok ad launcher), **Lingo Feeder** (WhatsApp sales assistant on the Cloud API). |
| Retexia Plan | plan.retexia.com | Free for every account: goals, charts, daily tasks, streaks, an AI coach. |

Other parts:
- **retexia.com** (`apps/web`): the website, product pages, sign-up/sign-in, and the customer's **Account** (their requests, payments, receipts, profile, security).
- **admin.retexia.com** (`apps/admin`): the team's back office.

Customer-facing language:
- UI and copy: English.
- Lingo / Lingo Feeder chats with end customers: Sinhala, Singlish, English (Lingo also Tamil).

## 2. Architecture at a glance

```
            retexia.com (apps/web)        admin.retexia.com (apps/admin)     post|lingo|feeder|plan.retexia.com (apps/panels)
                 │  Next.js 16, Vercel           │  Next.js 16, Vercel                 │  ONE Next.js app; proxy.ts picks the panel by subdomain
                 └───────────────┬───────────────┴───────────────┬──────────────────────┘
                                 │  shared session cookie "sb-retexia-auth" on .retexia.com
                          Supabase (ONE project)
                          Postgres schemas: public, private, post, lingo, feeder, plan, lingo_feeder
                          Auth · Storage · Vault (WhatsApp tokens, keys) · pg_cron · pg_net · Database Webhooks
                                 │
                          n8n (self-hosted): the "worker"
                          Post designer/publisher, Lingo bots, Feeder bulk import, Autopublish gateway,
                          Lingo Feeder WhatsApp engine, Plan coach, outgoing WhatsApp
                                 │
     External: PayHere (card) · bank transfer (slip upload) · Resend (email) · Meta Graph (FB/IG, WhatsApp Cloud API, Ads)
               · TikTok Ads · Evolution API (WhatsApp for Lingo) · OpenAI + Gemini (AI)
```

How the pieces split the work:
- The website and panels **decide**: business rules live in SQL functions and Next server code.
- n8n **does the slow or external work**.
- The panels call n8n webhooks with a shared key header (`X-Retexia-Key` or similar).
- n8n calls Supabase RPCs with the service role.

## 3. Monorepo and tooling

| Path | What |
|---|---|
| `apps/web` | retexia.com |
| `apps/admin` | admin.retexia.com |
| `apps/panels` | every product panel (`app/post`, `app/lingo`, `app/feeder`, `app/plan`, `app/auth`, `app/support`, `app/api`) |
| `packages/ui` | design system (`@retexia/ui`, `@retexia/ui/admin`): tokens, theme.css, components |
| `packages/supabase` | Supabase clients (`browser`, `server`, `proxy`, `admin`, `static`), cookie options, roles, generated DB types |
| `packages/forms` | onboarding-form engine (multi-step forms defined in the DB) |
| `packages/content` | content schemas, string keys |
| `packages/config` | eslint + tsconfig presets |
| `supabase/migrations` | numbered SQL migrations (run in order in the SQL editor; every file is safe to re-run) |
| `supabase/seed.sql` | site content, products, packages, form questions, statuses |
| `n8n/` | importable n8n workflows; `n8n/lingo-feeder/src/*.js` is the source of the Lingo Feeder Code nodes |
| `scripts/` | tests (`test-*.mjs`), the PGlite DB harness (`scripts/lib/harness.mjs`), mock Supabase (`scripts/e2e/mock-supabase.mjs`), workflow builders, catalogue import |
| `docs/` | guides (DEPLOY, ADMIN_GUIDE, ADDING_A_PRODUCT, EDITING_CONTENT, PAYHERE, LINGO_POST_SETUP, LINGO_FEEDER_SETUP / PRICING / REAL_CHATS, this file) |

- **Stack:**
  - pnpm 12 workspaces, Turborepo 2, Node ≥ 20.9, TypeScript 5.9.
  - Next.js **16.3.8** with React 19.2. This version differs from older Next.js; read `node_modules/next/dist/docs/` before changing Next code.
  - Tailwind v4 (custom `@utility` classes), zod 4, lucide-react icons (stroke 1.5), sonner toasts.
- **Commands:**
  - `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`
  - `pnpm db:test`: 7 suites, ~570 checks; runs every migration in PGlite with Supabase-like roles and RLS.
  - `pnpm e2e` (Playwright), `pnpm lingo-feeder:n8n` (rebuild the workflow JSON), `pnpm lingo-feeder:catalog <csv>`.
- **Local preview:**
  - `node scripts/e2e/mock-supabase.mjs`: a mock Supabase on :54321 with all migrations; writes keys to `scripts/e2e/.mock/keys.json`.
  - Run panels with `next dev --webpack`; Turbopack has a Google-font bug here.

## 4. Products, packages and prices (LKR)

| Product (slug) | Package (slug) | Monthly | Yearly | Setup | Trial |
|---|---|---|---|---|---|
| Lingo (`lingo`) | Lingo Core (`core`) | 6,900 | 69,000 | 9,900 | – |
| | Lingo Pro (`pro`) | 14,900 | 149,000 | 19,900 | – |
| | Lingo Supreme (`supreme`) | 34,900 | 349,000 | 49,900 | – |
| Post (`post`) | Starter / Growth / Pro | 5,900 / 14,900 / 29,900 | ×10 | 0 | – |
| Feeder (`feeder`) | Bulk create v2 (`bulk-import-v2`) | 1,900 | – | 0 | 14 days |
| | Autopublish (`autopublish`) | free | – | 0 | – |
| | Lingo Feeder (`lingo-feeder`) | 5,900 | 59,000 | 0 | 7 days |
| Plan (`plan`) | (none, free for every account) | | | | |

Prices are DB values (seed and migrations) and editable in admin. The Feeder product row itself was created in admin; migrations only add its packages.

## 5. Customer journey on the web (and the access rule)

1. retexia.com/`<product>` → **Get started** (`/[slug]/get-started?package=…`).
   - An onboarding form from `public.forms / form_steps / form_fields` creates a **request**: a row in `public.orders`, ref like `LNG-2026-0001`.
2. **Order statuses** (`public.order_statuses`):
   - `submitted`, `reviewing`, `awaiting_payment`, `setting_up`, `active`, `paused`, `cancelled`, `rejected`, `trial`, `trial_ended`.
   - Allowed moves and the roles that can make them: `public.order_status_transitions`.
   - Every change writes `order_events` (the customer's timeline).
3. **Payment happens ONLY on retexia.com** (`/account/products/[ref]`):
   - **Bank transfer:** bank details + the customer's reference; they upload the slip; the team confirms in Admin → Payments → Proofs; the request moves on automatically.
   - **Card:** PayHere recurring. Notifications go to `admin.retexia.com/api/payhere/notify` and become payments + receipts. Renewals, failures and cancellations are automatic (docs/PAYHERE.md). Which methods are on is set in Admin → Settings → Payments (`public.payment_methods`; the seed has card as "coming soon").
   - `public.payments` holds receipts (`RCT-YYYY-NNNN`), printable at `/(print)/account/receipts/[id]`.
4. **Free trials:**
   - A package with `trial_days` starts straight in `trial`.
   - `public.run_trials()` (pg_cron, hourly) sends reminders, then sets `trial_ended`.
   - One trial per customer per product, also per phone number.
5. **Access rule (authorization), used by every panel:**
   - A customer can use a package when they have an order for it in `ACCESS_STATUSES = ["setting_up", "active", "paused", "trial"]`.
   - A `trial` only counts until `trial_ends_at` (`apps/panels/lib/customer.ts → opensPanel`).
   - Free packages (price 0, no setup fee) are open to every account.
   - Feeder lists every package: owned ones open, the rest show a lock (`apps/panels/lib/feeder/access.ts → getFeeder`).
   - **The mobile app must use exactly this rule** (see Part 2).

## 6. Authentication and authorization

- **Supabase Auth** for every app: email + password, magic link (`signInWithOtp`, no auto sign-up), email confirmation, forgot/reset password. Server actions: `apps/web/app/(auth)/actions.ts`.
- **One session for all subdomains:**
  - Cookie name `sb-retexia-auth`, domain `.retexia.com` (`packages/supabase/src/cookies.ts`). localhost and previews get host-only cookies.
  - Panels without a session redirect to `/auth/start`, which asks retexia.com (`/auth/panel`) to hand the session over. Back on the panel, `/auth/handoff` sets it.
- **Profiles and roles:**
  - `public.profiles.role` is one of `customer | support | editor | admin | owner`.
  - SQL helpers: `public.staff_role()`, `public.has_role(array[...])`, `public.is_privileged()`. The DB refuses to remove the last owner.
- **Admin:** staff only, **TOTP MFA required** (`/mfa/setup`, `/mfa/verify`). Capability checks via `can(role, …)` (`@retexia/supabase`); every admin action calls `requireRole(...)` and writes `public.audit_logs`.
- **RLS everywhere:**
  - Customers can read their own rows; most writes go through `security definer` SQL functions or server code with the **service role**.
  - Rule: the service role key is used only in server code (`import "server-only"`), never `NEXT_PUBLIC`, never in `apps/web` client code. Every service-role query must filter by the signed-in user's id taken from the session, never from the request.
- **Support mode** (0034):
  - An admin/owner starts a session in admin (with a reason) and gets a 10-minute one-time link. Opening it gives that browser a support cookie for ≤ 60 minutes.
  - The panels then show the customer's account with a banner.
  - Passwords, email and payments stay out of reach. Only hashes are stored.

## 7. Database

**Schemas** (Supabase → Settings → Data API → Exposed schemas must include `post`, `lingo`, `feeder`, `plan`, `lingo_feeder`):

| Schema | Main tables |
|---|---|
| `public` (41 tables) | profiles, site_settings, site_strings, products, product_features, packages, package_features, pages, page_sections, navigation_items, services, testimonials, faqs, contact_messages, waitlist, forms, form_steps, form_fields, order_statuses, order_status_transitions, order_counters, orders, order_events, order_notes, customer_notes, payments, payment_methods, receipt_counters, payhere_events, product_service_fields, product_actions, action_runs, notifications_outbox, audit_logs, admin_saved_views, media, staff_settings, support_sessions, … |
| `private` | product_action_secrets, order_secrets, integration_settings (service role only) |
| `post` | businesses, social_accounts, products, media, plan_items (daily playlist), posts, publications, usage_monthly, events |
| `lingo` | lingo_users, business_details, products, customers, orders, messages, fixed_messages (the original Lingo bot) |
| `feeder` | products (Feeder catalogue, product_id = Feeder item code), customers, customer_products; Autopublish: ad_accounts, ad_templates, ad_slots, ad_launches, ad_creatives, ad_nodes, ad_events, ad_lead_forms, ad_error_catalog |
| `plan` | settings, goals, charts, points, tasks, completions, members, messages |
| `lingo_feeder` (15 tables) | settings, products, sellers, seller_products, numbers, ads, chats, messages, buffer, seen, product_msgs, orders, model_prices, ai_usage, events |

**Migrations** (run in order; every file is safe to re-run; there is no 0038 or 0041):

| File | What |
|---|---|
| 0001 | base website: content, products, packages, forms, orders |
| 0002 | explicit API grants |
| 0003 | admin: roles, order workflow, payments, receipts, product actions, outbox, audit |
| 0004–0008 | Lingo panel link, Post schema, Lingo schema, product controls, Post/Lingo launch (pg_cron publisher) |
| 0009–0011 | Paddle (later removed) |
| 0012, 0017, 0018 | PayHere, policies, LKR prices |
| 0013–0016, 0019, 0024, 0035 | Post: playlist, WhatsApp follow-ups, focus groups, n8n publishing, Meta OAuth connect, product photos, focus repair |
| 0020 | payment methods (bank transfer, card) |
| 0021–0023 | admin request control, delete customer, "you are live" email |
| 0025 | light theme by default |
| 0026–0029 | Feeder bulk import v2, Feeder catalogue + customers, aliases, free trials |
| 0030–0033 | Plan |
| 0034 | support sessions |
| 0036 | Feeder Autopublish |
| 0037 | Feeder → Lingo test version (superseded) |
| 0039, 0040, 0042, 0043 | Lingo Feeder (see §11) |

**Scheduled jobs (pg_cron):**
- `retexia-post-publish-tick` (every minute), `retexia-post-batch-tick` (5 min), `retexia-post-expire`, `retexia-post-meta-cleanup`
- `retexia-trials` (hourly)
- `retexia-plan-tick` (15 min)
- `retexia-feeder-ads-tick` (every minute)
- Lingo Feeder follow-ups run from n8n every 15 min.

**Conventions:**
- `create … if not exists`, `create or replace function`, explicit `revoke … from public, anon, authenticated` + `grant … to service_role` on internal functions.
- Comments on tables and columns written for non-developers.
- Vault holds third-party tokens; only `security definer` functions decrypt them.
- Regenerate types with `pnpm db:types`.

## 8. The panels (apps/panels)

Every panel uses `PanelShell` (`@retexia/ui/admin`):
- Left sidebar: "Retexia" wordmark + product chip in the product colour, then nav groups.
- Top bar: theme toggle, account menu.
- Mobile: the sidebar collapses behind a ☰ button.

Pages use `PageHeader` (title, chips, description, actions) and `LinkTabs` for sub-navigation.

| Panel | Routes (under the subdomain) |
|---|---|
| **Post** | `/` · `/start` · `/welcome` · `/plan` · `/calendar` · `/create` · `/posts/[id]` · `/library` · `/products` · `/brand` · `/accounts` (Connect Facebook & Instagram, `/connect/meta`) · `/activity` · `/settings` |
| **Lingo** | `/` · `/connect` (WhatsApp QR) · `/business` · `/products` · `/customers` · `/customers/[id]` · `/orders` (+ CSV export) · `/replies` · `/settings` · `/setting-up` |
| **Plan** | `/` · `/overview` · `/goals` · `/goals/[id]` · `/settings` |
| **Feeder** | `/` (overview) · `/products` (My products) · `/setup` · `/[pkg]` (Bulk create v2) · `/autopublish` (+ accounts, templates, launches) · `/lingo-feeder` (Home, Chats, Chats/[phone], Orders (+ courier CSV), Products, Business details, WhatsApp, Try Lingo) · `/lingo` (redirects) |

Panels with no access show a lock card ("Start the free trial" / "Get …"), which links to retexia.com.

## 9. Admin (apps/admin)

Sections:
- Dashboard
- **Requests**: list, `/requests/[ref]` with status moves, notes, payments, Setup tab with product panels, customer view.
- **Customers**: support mode, delete everything.
- **Payments**: proofs, receipts.
- **Inbox** (contact messages)
- **Products**: hub per product with extra tabs from `apps/admin/products/registry.tsx`, e.g. Feeder → Autopublish, Feeder → **Lingo Feeder** (profit report, price check, models, AI prices, catalogue CSV import, Check photos), Lingo → Bot accounts, Post → Businesses.
- **Forms** (onboarding forms)
- **Website**: pages, sections, navigation, services, testimonials, FAQs, media, strings.
- **Settings**: general, team, payments, statuses, notifications, integrations, theme, audit.

Keyboard shortcuts and a command palette exist. Printable receipts are at `/print/receipt/[id]`.

## 10. n8n workflows (`n8n/*.json`)

| Workflow | Purpose | Called by |
|---|---|---|
| Retexia — Post (worker), 80 nodes | designs posts (AI images with the real product photo), publishes to FB/IG, WhatsApp follow-ups | pg_cron ticks → `post.retexia.com/api/post/*` → n8n (`N8N_POST_URL/KEY`) |
| Leads (FB · TikTok · CRM) → Courier CSV, 25 nodes | Feeder Bulk create v2 | panels (`FEEDER_N8N_URL/KEY`) |
| Retexia — Feeder Autopublish (gateway), 23 nodes | creates Meta/TikTok campaigns from templates | panels (`FEEDER_ADS_N8N_URL/KEY`) |
| Retexia — Plan, 21 nodes | AI coach, reminders | panels (`PLAN_N8N_URL/KEY`) |
| Retexia — Lingo Feeder (WhatsApp bot), 70 nodes | the Lingo Feeder engine | Meta webhook + panel webhook |
| Retexia — Lingo Feeder (follow-ups + health), 15 nodes | follow-ups, "stopped replying", number health | schedule |

The original Lingo bot runs on Evolution API, with its own n8n flows outside this repo (`LINGO_N8N_WEBHOOK_URL`). n8n credentials are referenced by name or id; the secrets themselves live only in n8n.

**Notifications today:**
- `public.notifications_outbox`: an INSERT fires a Supabase Database Webhook to `admin.retexia.com/api/notifications/dispatch` (header `x-retexia-secret`), which sends **email via Resend**.
- WhatsApp notices go through n8n, which reports back to `/api/n8n/callback`.
- **There are no push notifications yet** (Part 2 adds them).

## 11. Lingo Feeder (the most recent work, in detail)

- **What it is:** a WhatsApp sales assistant ("Lingo", a friendly Sri Lankan girl) on the seller's own number through the **WhatsApp Cloud API**.
- **Setup docs:** `docs/LINGO_FEEDER_SETUP.md`. Pricing analysis: `docs/LINGO_FEEDER_PRICING.md`. Real-chat analysis: `docs/LINGO_REAL_CHATS.md`.
- **Flow:**
  1. The ad click brings the referral; the product is found from the ad text (or by one small AI call per ad).
  2. Message 1: product photo + long description.
  3. Message 2: "Good morning Nimal 😊 I'm Lingo from <shop>…", the total, the details form, and buttons 🛒 Order · 📖 How to use · 📞 Call me.
  4. Quantity list → details (or "same details as last time?") → checks: a town alone isn't an address, a wrong phone number is pointed out, a missing phone gets "use this WhatsApp number?" → summary with ✅ Confirm · ✏️ Change · ❌ Cancel.
  5. Thank-you with their name → how-to-use message → at most one short suggestion of a related product.
- **Human touches:**
  - Long answers are split into 2–3 messages, sent with no waits.
  - Text variations (`settings.variants`).
  - Reactions: ❤️ on confirm and thanks, 👍 on complete details; never 🙏.
  - Every reply quotes the customer's message (not taps, not the ad's prefill).
  - Never the same request twice in a row: an offer to call, then "Call them".
- **Chat statuses:** `new` (only clicked the ad), `asking`, `ordering`, `no_reply` (stopped replying), `ordered`, `cancelled`, `not_interested`, `spam`, plus the `needs_call` flag ("Call them").
- **AI:**
  - One OpenAI call reads the message and writes the reply: `gpt-5.4-mini`, reasoning `none`, strict JSON, cached instructions, only this chat's product.
  - Gemini 3.5 Flash writes down voice notes. Flash-Lite handles photos and is the fallback when OpenAI fails.
  - About 4 in 5 messages need no AI (taps, forms, lead forms, quick answers).
  - Output guard: banned claims, numbers not in the facts, wrong script, mixed-script words.
  - Allowance: US$10 per seller per month → cheaper model up to 2× → fixed texts only.
  - Every call is logged in `lingo_feeder.ai_usage` with its cost. Admin profit report: `lingo_feeder.admin_profit()`.
- **Engine source:**
  - `n8n/lingo-feeder/src/*.js` (`lib.js` and `persona.js` are included into nodes via `// @include`). `pnpm lingo-feeder:n8n` builds the JSON.
  - `scripts/test-lingo-feeder.mjs` (112 checks) runs the same code against the real SQL.
- **Seller panel pages:** Home (setup steps, numbers, status counts), Chats (status chips, search, WhatsApp-style thread, status select, "Called", pause, reply), Orders (Feeder courier CSV: `name,address,tp_1,tp_2,price,qty,item_code,delivery`, BOM + CRLF), Products (on/off, own price, what Lingo knows, ads → product), Business details, WhatsApp (connect: phone number id, WABA id, token, app secret → Vault), Try Lingo (simulator).
- **Engine actions from the panel:** the "Panel: Lingo Feeder" webhook (`LINGO_FEEDER_N8N_URL`) runs `test_bot`, `check` and `send`. That webhook currently has no Header Auth in production; adding a Header Auth credential is recommended.

## 12. Design system (copy this exactly in the app)

**Colour tokens** (`packages/ui/src/tokens.ts` → `tokens.css`; light is the default since 0025, dark is the `.dark` class):

| Token | Light | Dark |
|---|---|---|
| surface | #ffffff | #0c1322 |
| surface-raised | #ffffff | #131c30 |
| surface-sunk | #f4f7fc | #090e1a |
| line | #e4ebf5 | #232f48 |
| line-strong | #7d8dab | #6e7d9c |
| ink | #16264a | #e7edf9 |
| ink-muted | #5a6884 | #9daac3 |
| brand | #2a68d9 | #7aaeff |
| brand-hover | #1f55b8 | #a1c5ff |
| brand-soft | #eaf1fd | #14254a |
| brand-halo | #dbe7fb | #16274a |
| on-brand | #ffffff | #0c1322 |
| link | #2a68d9 | #7aaeff |
| success / success-soft | #1d7338 / #dcf2e3 | #5fd38a / #11301c |
| warning / warning-soft | #855600 / #fbebc8 | #f2c14e / #33270a |
| danger / danger-soft | #b42318 / #fde2df | #ff8a80 / #3b1512 |
| on-danger | #ffffff | #0c1322 |

- **Shadows:**
  - Light: sm `0 1px 2px #16264a0a, 0 10px 30px -12px #2a68d926`; lg `0 30px 60px -20px #2a68d940, 0 6px 16px -6px #16264a14`.
  - Dark: sm `0 1px 2px #00000066, 0 10px 30px -12px #00000099`.
  - Focus ring: 2px surface + 4px brand.
- **Radii:** sm 6 · md 12 · lg 20 (pills 999).
- **Layout:** container 1040 / wide 1280 / content 720 / measure 480 / gutter 24.

**Product colours** (`public.products`; used as `--product-<slug>` accents, chips and badges):

| Product | light | dark | soft light | soft dark | icon |
|---|---|---|---|---|---|
| Lingo | #0b7565 | #3fd3bc | #d7f1ec | #0f2f2a | message-circle |
| Post | #ad2a5e | #ff7fae | #f8dde8 | #3a1424 | calendar-clock |
| Plan | #5b3fd1 | #a996ff | #ece8fc | #221a45 | target |
| Feeder | set in admin (falls back to brand blue) | | | | |

Admin → Settings → Theme can override colours (`site_settings`; `theme-overrides.ts` builds the CSS).

**Fonts** (Google): **Outfit** 300/400/500 (display), **DM Sans** 400/500/600 (text), **DM Mono** 400 (code), **Noto Sans Sinhala** 400/500 (fallback in every stack, for Sinhala).

| Style | Font | Weight | Size / line height | Tracking |
|---|---|---|---|---|
| display-xl | Outfit | 300 | 36/44 (52/60 large screens) | -0.02em |
| display | Outfit | 300 | 30/38 (36/44) | -0.015em |
| h1 | Outfit | 400 | 26/34 | -0.01em |
| h2 | Outfit | 500 | 18/26 | |
| h3 | DM Sans | 600 | 14/20 | |
| body-lg | DM Sans | 400 | 16/26 | |
| body | DM Sans | 400 | 14/22 | |
| label | DM Sans | 500 | 13/20 | |
| small | DM Sans | 400 | 12/18 | |
| eyebrow | DM Sans | 500 | 11/16 | 0.24em, uppercase |
| caption | DM Sans | 600 | 11/16 | 0.06em, uppercase |
| code | DM Mono | 400 | 12/18 | |

**The Retexia loading animation** (`packages/ui/src/components/loading.tsx` + `theme.css`):
- **RetexiaLoader** (page or section loading): centred column, gap 12.
  - The word "Retexia" in Outfit 20px, tracking-wide, ink-muted.
  - Under it a track 160×3px, radius 999, background brand-soft.
  - Two "segments" glide left → right inside the track:
    - Segment 1: width 40%, gradient `transparent → brand 35% → brand-hover 75% → transparent`, animation 1.4s `cubic-bezier(0.65, 0, 0.35, 1)` infinite, left from -40% to 100%.
    - Segment 2: width 18%, opacity 0.7, delay 0.5s.
  - Reduced motion: one still full-width line.
- **ProgressLine** (top of the screen while anything waits on the server):
  - Fixed 3px bar, same two segments over a brand-soft background (opacity 0.7).
  - Appears after 150ms (no flicker), stays at least 400ms, fades with opacity 200ms.
- **Other motion:** `rx-fade-in`; `rx-pop-in` (translateY 4px + scale .98 → none); `rx-pulse` (opacity .55 at 50%).
- **Toasts:** sonner.

**Components** (`@retexia/ui`):
- Button (variants primary / secondary / ghost, sizes), Alert, Avatar, Badge (tones neutral / brand / success / warning / danger / product), Card (`padded`), EmptyState, ProductChip, Skeleton, StatusBadge, Stepper.
- Checkbox, CheckboxGroup, Field (label, hint, error, "(Optional)" unless `required`), Input, RadioCards, Select, Switch, Textarea.
- Accordion, Dialog, DropdownMenu, Tabs, ThemeToggle, Toaster, NavBar, Footer, Logo, PricingCard.
- Admin: PanelShell, PageHeader, LinkTabs, StatCard, DataTable, Pagination, ConfirmDialog, CommandPalette, Receipt, SortableList, ColorField.
- Icons: lucide, stroke 1.5, size 16–22.

**Copy style:**
- Plain, short English; say what happens.
- Sentence case; no exclamation marks in UI chrome; numbers with thousands separators; prices as "LKR 5,900" or "Rs. 5,900".
- Customer-facing Sinhala is spoken, not formal.

## 13. Environment variables (names only; values live in Vercel and n8n)

| Group | Variables |
|---|---|
| Shared | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (server only), NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_WEB_URL, NEXT_PUBLIC_ADMIN_URL, NEXT_PUBLIC_COOKIE_DOMAIN, REVALIDATE_SECRET |
| Email | RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO, OUTBOX_WEBHOOK_SECRET |
| PayHere | PAYHERE_MERCHANT_ID, PAYHERE_MERCHANT_SECRET, PAYHERE_APP_ID, PAYHERE_APP_SECRET, NEXT_PUBLIC_PAYHERE_SANDBOX |
| Post | N8N_POST_URL, N8N_POST_KEY, POST_PUBLISHER, POST_PANEL_URL, POST_PRODUCT_SLUG, POST_CRON_KEY, POST_SAFETY_WORKFLOW, POST_WHATSAPP_INSTANCE, POST_WHATSAPP_KEY |
| Meta / TikTok | META_APP_ID, META_APP_SECRET, META_GRAPH_VERSION, META_SCOPES, META_INSTAGRAM_DELETE, RETEXIA_META_BUSINESS_ID, RETEXIA_TIKTOK_BC_ID |
| Lingo | LINGO_PRODUCT_SLUG, NEXT_PUBLIC_LINGO_URL, EVOLUTION_API_URL, EVOLUTION_API_KEY, LINGO_N8N_WEBHOOK_URL |
| Feeder | FEEDER_PRODUCT_SLUG, FEEDER_PANEL_URL, FEEDER_N8N_URL/KEY, FEEDER_ADS_N8N_URL/KEY, APPROVAL_REMIND_HOURS, APPROVAL_EXPIRE_HOURS, LINGO_FEEDER_N8N_URL/KEY, LINGO_FEEDER_WEBHOOK_URL (old FEEDER_LINGO_* still read) |
| Plan | PLAN_N8N_URL, PLAN_N8N_KEY, PLAN_PANEL_URL |
| Panels | PANEL_DEFAULT (localhost), ADMIN_URL |

## 14. Rules we follow (keep them in the app too)

- **Secrets:**
  - The service role key and third-party tokens only ever in server code or Vault; masked in any UI.
  - n8n calls are keyed or signed (Meta webhooks: HMAC check of the raw body).
  - No secrets in repo files, chats or URLs.
- **Validation:** validate every input with zod on the server; never trust ids from the client (take the user from the session).
- **Audit:** staff actions need a role check and an audit log entry.
- **Customer data:** end customers' names, phones and addresses never go to outside services without need, and never into docs.
- **Database:** migrations are idempotent, numbered and documented in their header; every new table gets RLS + explicit grants.
- **Testing:** every DB change is covered in `pnpm db:test`; UI changes are checked in a browser (light/dark, phone width with no horizontal scroll).

---

# PART 2: THE MOBILE APP (React Native)

## 15. Answers to your questions

**1. Pay on the web, use in the app: is that allowed?** Yes, if the app is **consumption-only**:
- The app never sells anything: no prices, no "Buy" / "Upgrade" / "Start trial" buttons, no links to a checkout.
- Customers sign in and use what they already have.
- Google Play allows any app to be consumption-only. Its Payments policy says consumption-only apps may *describe* purchase options outside the app **without direct links**. The newer link-out programs (US, EEA) have extra rules and fees, so don't use them for Sri Lanka.
- In the app, a package the customer doesn't own says something neutral like "This isn't on your account". No price, no link.
- Payments, trials, receipts and cancellations stay on retexia.com, exactly as today.

**2. Authentication and authorization:**
- **Same Supabase users.** Email + password and magic link (deep link back into the app).
- The app asks the API "what can this user open?". The API applies the **same access rule as the panels** (§5: an order in setting_up / active / paused / trial before trial_ends_at, plus free packages).
- Everything else is locked. Server routes enforce it; the app only hides.

**3. "Google rejects apps that are just a website":** Google's Spam / "limited functionality" rules reject apps that are only a WebView of a website. Build **real native screens** (React Native components, not a WebView) and native features:
- push notifications
- offline cache of recent chats and orders
- biometric unlock
- the native share sheet (courier CSV, receipts)
- haptics and pull-to-refresh
- deep links from notifications straight to the right chat
- later, home-screen widgets ("Call them: 3", today's orders)

**4. Can Claude change the web and the app at the same time?** Yes. Put the app **in this monorepo** as `apps/mobile`, and move shared logic into packages. One Claude session can then change the migration, the server routes, the web panel and the app screens together, and the tests cover the shared code once. Shipping:
- **JS-only app changes:** go out instantly with **EAS Update** (over-the-air, no store review).
- **Native changes** (new permissions, new native modules): need a new build and review.

**5. iPhone later:** the same React Native code builds for iOS. Apple allows apps that only give access to accounts bought elsewhere when there are no purchase buttons or calls to action. Check App Store Review Guideline 3.1.3 ("multiplatform services" / reader rules) when you get there. Apple also requires in-app account deletion.

Sources:
- [Understanding Google Play's Payments policy](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en)
- [Coda: Epic v. Google policy update 2026](https://www.coda.co/blog/epic-v-google-policy-update-2026/)
- [9to5Google: external billing, June 2026](https://9to5google.com/2026/06/24/google-play-store-external-billing-june-30/)
- [Functionality, Content, and User Experience policy](https://support.google.com/googleplay/android-developer/answer/14983486?hl=en)

## 16. Recommended stack

| Need | Choice |
|---|---|
| App framework | **Expo** (latest SDK), React Native, TypeScript, **Expo Router** (file-based, like Next) |
| Builds / store | **EAS Build** (Android now, iOS later), **EAS Submit**, **EAS Update** (OTA) |
| Data | `@supabase/supabase-js` with a SecureStore storage adapter (`expo-secure-store`); **TanStack Query** for caching / offline; Supabase **Realtime** for live chats |
| Push | `expo-notifications` + Expo Push Service (Android needs a Firebase project + FCM v1 service account uploaded to EAS; iOS later APNs) |
| UI | own components built on the Retexia tokens (§12); `react-native-reanimated` (loader, transitions); `expo-font` (Outfit, DM Sans, DM Mono, Noto Sans Sinhala); `lucide-react-native` (stroke 1.5); `react-native-safe-area-context`; a toast lib styled like sonner |
| Native extras | `expo-local-authentication` (biometric lock), `expo-haptics`, `expo-sharing`, `expo-linking` (deep links `retexia://` + https App Links on retexia.com) |
| Validation | zod 4 (shared schemas) |

## 17. Backend changes the app needs (do these first, shared with the web)

1. **App API in `apps/panels`:**
   - Next server actions can't be called from React Native, so add route handlers under `/api/app/*`.
   - They read `Authorization: Bearer <supabase access token>`, verify it with Supabase (`auth.getUser(token)`), and reuse the same server functions the panels use.
   - Move those functions from `apps/panels/lib/...` and `actions.ts` bodies into a shared package (e.g. `packages/core`), so the web server actions and the app routes call one implementation.
   - Same zod validation, same per-user filtering, same audit.
   - Start with:
     - `GET /api/app/me`: profile, owned packages (the access rule), unread counts.
     - Lingo Feeder:
       - `GET /api/app/lingo-feeder/home`
       - `GET /api/app/lingo-feeder/chats?status=&q=`, `GET /api/app/lingo-feeder/chats/:phone`
       - `POST /api/app/lingo-feeder/chats/:phone/{reply|status|called|pause}`
       - `GET /api/app/lingo-feeder/orders?view=`, `POST /api/app/lingo-feeder/orders/:id/{cancel|sent}`
       - `GET /api/app/lingo-feeder/orders/courier.csv`
       - `POST /api/app/lingo-feeder/try`
     - Then Post (approve / skip posts, calendar), Plan (tasks, goals), Lingo (customers, orders), Feeder bulk create (upload lead files → CSV).
2. **Direct reads where RLS already allows them:**
   - `lingo_feeder.chats/messages/orders/sellers/ads` (own_read), `post`, `plan` and others can be read with the user's JWT, and Realtime can subscribe to `lingo_feeder.messages` for the user's rows.
   - Writes always go through the API.
3. **Push notifications** (new migration, e.g. 0044):
   - `public.push_tokens` (user_id, expo_token, platform, device_name, app_version, last_seen_at, disabled) with RLS (a user manages their own tokens) and an API to register / unregister on sign-in / out.
   - Extend `public.notifications_outbox` with channel `push` (title, body, data {url}). The dispatcher (`apps/admin/app/api/notifications/dispatch`) sends through the Expo Push API, drops dead tokens and respects per-user notification settings (`public.profiles` or a new `notification_prefs`).
   - Events to push first:
     - Lingo Feeder: "📞 Call them" (needs_call), new confirmed order, number problem.
     - Post: post ready to approve.
     - Plan: daily task reminder.
     - Account: payment confirmed, trial ends soon, request status changed.
   - Many of these already create emails or events; add the push row next to them.
4. **Account deletion:** Google and Apple require it. Add "Delete my account" in the app that creates a deletion request (the admin already has "delete customer everything", 0022) and a public web page for deletion requests (needed for the Data safety form).
5. **Deep links:** `https://retexia.com/.well-known/assetlinks.json` (Android App Links); later `apple-app-site-association` for iOS. Magic link and notification links open the app.

## 18. App structure (information architecture)

- **Sign in:** email + password or magic link. No sign-up in the app, or a simple free sign-up that only unlocks Plan (no purchase).
- **Tabs:**
  1. **Home**: every product the user owns (product colour cards), today's numbers, "Call them" and alerts.
  2. **Inbox**: notifications history (deep links).
  3. **Products**: Lingo Feeder · Post · Plan · Lingo · Feeder tools. Each opens its own stack with native screens mirroring the web panel pages (§8, §11).
  4. **Account**: profile, security (password, biometric lock), notification settings, theme (light/dark/system), sign out, delete account. Billing shows only "Billing is managed on retexia.com" as plain text, with no link and no prices.
- **MVP order:**
  - (1) sign-in + access rule + Home
  - (2) Lingo Feeder chats / Call them / orders + push
  - (3) Post approvals
  - (4) Plan tasks
  - (5) the rest
- **Native touches:** pull-to-refresh, swipe actions on chats (Called / Pause), haptic on confirm, share the courier CSV, offline last-seen data, skeletons, the Retexia loader.

## 19. Theme in React Native

- Export the tokens from `packages/ui/src/tokens.ts` as a plain TS object (light + dark), shared by web and app. One source, so a colour change updates both.
- `useColorScheme()` + a user override (light default, like the web).
- **Typography:** map the §12 scale to `Text` presets. Load fonts with `expo-font`; the families are `Outfit_300Light/400Regular/500Medium`, `DMSans_400/500/600`, `DMMono_400`, `NotoSansSinhala_400/500`. On Android set `includeFontPadding: false`, and use Noto Sans Sinhala for Sinhala text.
- **RetexiaLoader in Reanimated:** "Retexia" (Outfit 20, ink-muted) over a 160×3 track (brand-soft, radius 999). Two `Animated.View` segments use the same timing as the web loader: 1.4s, `Easing.bezier(0.65, 0, 0.35, 1)`, 40% and 18% widths, 0.5s delay, opacity 0.7, a `LinearGradient` brand → brand-hover with transparent ends. With reduced motion (`AccessibilityInfo.isReduceMotionEnabled`), show a still line.
- **ProgressLine:** a 3px bar under the header while a mutation or refetch runs (after 150ms, at least 400ms).
- **Cards and surfaces:** radius md 12 for cards, lg 20 for sheets, hairline borders in `line`. Use the soft shadow on Android (elevation 2–4) and the shadow tokens on iOS.
- **Product colours:** accents and chips per product (§12).

## 20. Google Play checklist

- A Play Console developer account. New personal accounts must run a **closed test with at least 12 testers for 14 days** before production access; plan that early.
- Package name (e.g. `com.retexia.app`), app signing by Google Play, target the current required Android API level.
- **Data safety form:**
  - Data collected: email, name, phone; app activity; customer messages shown to sellers.
  - Encrypted in transit; deletion available.
  - Privacy policy URL: retexia.com/privacy.
- **Account deletion:** an in-app option + a web URL.
- Content rating questionnaire, store listing (screenshots of native screens), a demo account for the reviewer (a test seller with sample data and an active package), and no purchase UI anywhere.
- Notifications permission (Android 13+) asked at a useful moment, not on first launch.

## 21. Phased plan

> **Status (2026-11-26):** phases 1–3 are built: migration 0044, `/api/app`, push, account deletion, `packages/shared`, and `apps/mobile` with Lingo Feeder. Setup steps, how it fits together and what's left: `docs/MOBILE_APP.md`.


1. **Foundations** (web + DB, before the app):
   - `packages/core` (move shared server logic)
   - `/api/app/me` + the access rule
   - tokens export
   - `push_tokens` + the outbox push channel (migration 0044)
   - assetlinks + the account deletion page
2. **App shell:** Expo app in `apps/mobile` (pnpm workspace, Turbo tasks), fonts, theme, loader, auth (SecureStore session, magic-link deep link), tabs, Home.
3. **Lingo Feeder in the app:** chats (Realtime), thread + reply, statuses, Call them, orders + courier CSV share, Try Lingo; push for needs_call and orders.
4. **Post, then Plan, then Lingo and the Feeder tools.**
5. **Store:** internal testing → closed test (12 testers / 14 days) → production. iOS later (EAS Build iOS, APNs key, Apple review).

## 22. First prompt for the new chat (copy this)

```
Read docs/RETEXIA_HANDOFF.md fully, then AGENTS.md / CLAUDE.md files in the repo.
We're adding a React Native (Expo, Expo Router, TypeScript) app as apps/mobile in this monorepo:
consumption-only (no prices, no purchase buttons or links; payments stay on retexia.com),
same Supabase auth and the same access rule as the panels, push notifications, same Retexia theme
(tokens, fonts, loader) and native screens (not a WebView).
Start with Phase 1 of section 21: plan the shared package + /api/app routes + migration 0044
(push_tokens, outbox push channel), then build it with tests (pnpm db:test) before the app shell.
```
