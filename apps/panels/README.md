# Retexia product panels (post.retexia.com, lingo.retexia.com)

One Next.js app for every product's customer panel. `proxy.ts` looks at the
domain and serves `app/post/*` on post.retexia.com and `app/lingo/*` on
lingo.retexia.com (an internal rewrite, so URLs stay clean). A new product is a
new folder plus one line in `lib/panel.ts`, and a new domain on the same Vercel
project.

Shared by all panels:

- **Login:** the normal Retexia account. When a panel has no session it asks
  retexia.com (`/auth/start` → `retexia.com/auth/panel` → `/auth/handoff`): the
  website confirms who is signed in (or asks them to sign in) and hands the
  sign-in over, so panels work even if the shared `.retexia.com` cookie can't be
  read. If it fails, `/auth/problem` says why (e.g. different Supabase projects).
- **Setup check:** `https://lingo.retexia.com/api/health` shows the Supabase
  project this deployment uses and whether the keys are set (no secrets). It must
  show the same project as the website.
- **Access:** `lib/customer.ts` checks the main database for an order of that
  product in status *setting up*, *active* or *paused*.
- **Data:** everything is in the Retexia Supabase project: Post in schema
  `post`, Lingo in schema `lingo` (migrations 0005 and 0006, with row-level
  security). The panels read them on the server with the service-role key
  (`server-only`) and every query is filtered by the customer's own account.

## Lingo (lingo.retexia.com)

What the customer sees and controls (no chat transcripts):

- **Overview:** bot on/off, customers who messaged, messages answered,
  orders, sales and conversion (30 days), a daily chart, orders to handle,
  best sellers, most-asked-about products, follow-ups waiting.
- **Orders:** to handle / sent / delivered / not confirmed / cancelled; move an
  order along with an optional WhatsApp note to the customer (pre-written in
  their language); edit delivery details; CSV export.
- **Customers:** every person who messaged, with a stage (just asking,
  interested, about to order, customer, repeat, cancelled), interest, orders and
  spend; a customer page with a short written analysis, Lingo's own summary note,
  their orders, a "stop Lingo for this customer" switch and a quick WhatsApp message.
- **Products:** all fields the bot uses, photo upload (public bucket for WhatsApp).
- **Business details**, **Bot replies** (their own wording for every fixed message,
  per language, with placeholders; "use the default" restores Retexia's text),
  **Bot settings** (name, staff name, languages, owner alert number, follow-up hours,
  delivery days).

How a customer is linked to their bot: `lingo.lingo_users.owner_id` is their
Retexia login. Connect it in the admin: the request's **Setup** tab → *Lingo bot
account* (connect an existing bot or create one), or **Products → Lingo → Bot
accounts**. Until linked, the panel shows "almost ready".

## Post (post.retexia.com)

Schema `post` (`supabase/migrations/0005_post_schema.sql`): today’s
posts, calendar, new post (n8n photo workflow), library, products, week plan
and offers, brand, accounts, schedule, activity. New posts call
`N8N_PHOTO_POST_URL` with `X-Retexia-Key: N8N_POST_KEY`; set the n8n webhook
node to Header Auth with that header.

## Control from the admin (admin.retexia.com)

- **Products → Lingo → Bot accounts:** every bot with its customer, on/off,
  messages, orders and sales (30 days). Each account page: bot settings, the
  WhatsApp (Evolution) connection with a *Check connection* button (the API key
  is write-only), connect/disconnect the customer, latest orders, products.
- **Products → Post → Businesses:** every business with plan, accounts,
  published/failed/blocked posts, AI usage against the plan and cost. Global
  switches stop all publishing or all nightly AI posts at once. Each business
  page: pause (vacation mode), plan and subscription, accounts on/off, token
  expiry, failed publishes with Meta's error, upcoming posts, activity.
- A request's **Setup** tab shows the product's card (Lingo bot / Post business).

Needs `supabase/migrations/0007_product_controls.sql`.

## n8n workflows

- **Lingo v6:** needs 0007 (its *Save Incoming* step relies on a unique
  WhatsApp message id). Postgres credential: user `lingo_n8n.<project-ref>`.
- **Photo post:** in the *Config* node set `supabaseUrl` to the Retexia project
  URL (not the old Post project), and protect *Webhook: photo post* with Header
  Auth `X-Retexia-Key` = `N8N_POST_KEY`, otherwise anyone who finds the URL can
  post for your customers. Postgres credential: user `post_n8n.<project-ref>`;
  Supabase credential: the Retexia project.

## Environment

See `.env.example`: the Retexia project's URL, anon key and service-role key
(server-side only), the n8n photo-post webhook and its key.

## Deploy (one Vercel project)

1. **Add New → Project**, this repository, Root Directory `apps/panels`.
   Install `cd ../.. && pnpm install --frozen-lockfile`, build
   `cd ../.. && pnpm turbo run build --filter=@retexia/panels`.
2. Environment variables from `.env.example` (no `PANEL_DEFAULT` in production).
   Moving from separate Lingo/Post projects? See `docs/CONSOLIDATE_DATABASES.md`.
3. Domains: add `post.retexia.com` and `lingo.retexia.com`.
4. Main Supabase → Authentication → URL Configuration → Redirect URLs: `https://*.retexia.com/**`.
5. Admin → Products → each product → Details: Customer panel URL
   (`https://lingo.retexia.com`, `https://post.retexia.com`) and **Panel is live**.

Local: `PANEL_DEFAULT=lingo pnpm --filter @retexia/panels dev` → http://localhost:3002
(sign in on http://localhost:3000 first; cookies are shared across ports on localhost).
