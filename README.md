# Retexia

The website for [retexia.com](https://retexia.com) (marketing pages, sign-in and the customer
account area for Retexia's ready-made products: Retexia Lingo, Retexia Post, and more to come) and
the team's admin panel at admin.retexia.com.

Everything is edited in the admin: requests, payments and receipts, customers, products and packages,
onboarding forms, pages and sections, texts, theme colours and settings. Adding a product means
adding rows (the admin's wizard does it), not changing code.

## What's inside

```
apps/web               retexia.com (Next.js 16, App Router, Cache Components)
apps/admin             admin.retexia.com: the team's panel (Next.js 16, staff-only, two-step sign-in)
packages/ui            Retexia design system: tokens, Tailwind v4 theme, React components (+ admin components)
packages/content       page section schemas and the section catalog, list of interface text keys
packages/forms         onboarding form engine (validation, conditions) and its React renderer
packages/supabase      Supabase clients (browser / server / static / proxy / service role), roles, DB types
packages/config        shared tsconfig and ESLint
supabase/migrations    0001 schema and RLS, 0002 API grants, 0003 admin (roles, payments, actions, audit)
supabase/seed.sql      all site content (re-runnable)
supabase/templates     new_product.sql: SQL template for a new product
docs/                  ADMIN_GUIDE.md, EDITING_CONTENT.md, ADDING_A_PRODUCT.md, DEPLOY.md, ADMIN_PLAN.md
scripts/               database tests, type generation, string extraction, e2e Supabase stand-in
e2e/                   Playwright tests for both apps
```

## Run it locally

Requirements: Node 20.9+ and pnpm (`corepack enable pnpm`).

1. Create a Supabase project and run the migration and seed (see [docs/DEPLOY.md](docs/DEPLOY.md),
   step 1). A local Supabase (`supabase start`) works too.
2. Copy the environment files and fill them in:

```bash
cp .env.example apps/web/.env.local
```

```bash
cp apps/admin/.env.example apps/admin/.env.local
```

3. Install and start:

```bash
pnpm install
```

```bash
pnpm dev
```

Open http://localhost:3000 for the website and http://localhost:3001 for the admin (make yourself
the owner first, see [docs/DEPLOY.md](docs/DEPLOY.md), step 2). The design system styleguide is at
http://localhost:3000/_styleguide (development only).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the website (3000) and the admin (3001) in development mode |
| `pnpm build` | Production build of both apps |
| `pnpm lint` | ESLint in every package |
| `pnpm typecheck` | TypeScript in every package |
| `pnpm db:test` | Run the migrations and seed in an in-memory Postgres and test RLS, triggers and RPCs (website and admin) |
| `pnpm db:types` | Regenerate `packages/supabase/src/database.types.ts` from the migrations (no Supabase needed) |
| `pnpm e2e` | Playwright tests for both apps against a local Supabase stand-in (`npx playwright install chromium` once) |
| `node scripts/extract-strings.mjs` | Collect every `t("key", "fallback")` in the app into `site_strings` in `seed.sql` |
| `pnpm --filter @retexia/ui tokens` | Regenerate `packages/ui/src/tokens.css` from `tokens.ts` |

## How it works

- **Content:** public pages read Supabase with an anonymous, cookie-less client inside `"use cache"`
  functions tagged `content` (`apps/web/lib/content.ts`). Pages are prerendered and refresh every 60
  seconds, or immediately when a Supabase Database Webhook calls `POST /api/revalidate`.
- **Pages are data:** `pages` + `page_sections`. `SectionRenderer` maps each section `type` to a
  component and validates its `content` JSON with zod. Bad content hides that one section and logs a
  warning. It never breaks the page.
- **Products are data:** `products`, `packages`, `package_features`, `product_features`, `faqs`,
  `forms`/`form_steps`/`form_fields`. No product name appears in the app code.
- **Onboarding:** `/[slug]/get-started` renders the product's form from the database, validates each
  step with a zod schema built from the field definitions, autosaves a draft to `localStorage`, shows a
  review screen and submits through a Server Action that re-validates against the database.
- **Security:** Row Level Security on every table. The `prepare_order` trigger sets the owner, status,
  price snapshot and reference (`LNG-2026-0001`). Customers cannot update orders, and they can only
  cancel through the `cancel_order` RPC while the status allows it. `orders.admin_note` is hidden by
  column privileges. The browser never decides prices, statuses or ownership.
- **Auth:** Supabase Auth with `@supabase/ssr`. The session cookie can be shared across
  `*.retexia.com` (`NEXT_PUBLIC_COOKIE_DOMAIN`), so future product panels (`apps/lingo` on
  `lingo.retexia.com`) reuse the same login. `proxy.ts` refreshes the session, protects `/account` and
  `/*/get-started`, and handles maintenance mode.
- **Theme:** design tokens live in `packages/ui/src/tokens.ts`. The root layout emits one `<style>`
  with light and dark values, merged with validated overrides from `site_settings.theme` and product
  colours (`--product-<slug>`). Light, dark and system modes via `next-themes`, with no flash.

## Decisions worth knowing

Where the spec left room, these are the choices made (simplest option that keeps content editable):

- **Caching:** Next.js 16's recommended model (`cacheComponents` + `"use cache"`, `cacheTag("content")`,
  `cacheLife({ revalidate: 60 })`). The revalidate endpoint expires the tag immediately
  (`revalidateTag("content", { expire: 0 })`).
- **Pricing width:** three package cards use the page column (1040px) instead of the 720px content
  width. LKR yearly prices did not fit three-across at 720px. Phones get a horizontal scroll-snap row.
- **Product page accent:** when `pages.product_id` is set, `--accent` becomes the product colour
  (eyebrows, highlighted words, icons). Main buttons stay brand blue.
- **Hidden products:** `status = 'hidden'` (or `is_visible = false`) also makes the product's page
  return 404.
- **Status notes:** besides `order_events.note`, `orders.status_note` lets an admin write the
  customer-facing note in the same edit as the status change.
- **Form field ids:** `form_fields.form_id` is filled from the step by a trigger so `key` can be unique
  per form.
- **Waitlist:** only accepts sign-ups for products that are `coming_soon` (RLS). Duplicates are shown as
  "You're already on the list".
- **Contact and waitlist abuse:** honeypot field plus a simple in-memory per-IP rate limit. For heavier
  spam, turn on Supabase CAPTCHA or put Vercel's firewall rules in front.
- **Brand icons:** Lucide 1.x has no social-network logos, so footer social links are text.
- **Seed ids:** rows without a natural key use `md5('retexia:…')::uuid`, so the seed updates the same
  rows each time it runs.
- **Database types** in `packages/supabase/src/database.types.ts` are generated from the migrations by
  `pnpm db:types` (in-memory Postgres). `pnpm db:types:supabase` uses the Supabase CLI instead.

## The admin

- **Access:** `apps/admin/proxy.ts` lets only team roles (support, editor, admin, owner) in and
  requires two-step sign-in (TOTP, `aal2`). Every server action and route handler checks the role
  again (`requireRole`), and the database checks it a third time (RLS and role-checked RPCs).
- **Service role key:** only in `apps/admin` server code (`@retexia/supabase/admin`, `server-only`),
  for the Auth admin API, private secrets and audit entries. Never in the website, never public.
- **Generic by design:** product menus, hubs, forms, service fields and n8n actions all come from
  the database. `apps/admin/products/registry.ts` exists for the rare product-specific screen.
- **Audit:** database triggers log every change to admin-editable tables; the admin adds entries for
  logins it manages, exports, secret reveals and n8n calls.
- **n8n:** product actions are signed (`X-Retexia-Timestamp`, `X-Retexia-Signature`); callbacks to
  `/api/n8n/callback` are verified, time-limited and idempotent. See [docs/DEPLOY.md](docs/DEPLOY.md).

See [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) for how the team uses it and
[docs/ADMIN_PLAN.md](docs/ADMIN_PLAN.md) for the design decisions.

## Before launch

See the checklist at the end of [docs/DEPLOY.md](docs/DEPLOY.md). In short: replace the placeholder
contact details, have the legal pages reviewed by a lawyer, configure Auth URLs, email templates and
SMTP, and set up the revalidation webhooks.
