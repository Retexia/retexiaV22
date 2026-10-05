# Retexia Post panel (post.retexia.com)

The customer dashboard for Retexia Post: today's posts and stories, approve /
new version / edit / move / skip, calendar, "New post" (runs the n8n photo
workflow), photo library, products, week plan and offers, brand, connected
accounts, schedule and WhatsApp settings, activity and monthly usage.

## How it fits together

- **Login:** the normal Retexia account. The session cookie is shared on
  `.retexia.com`, so signing in on retexia.com signs you in here. Signed-out
  visitors are sent to `retexia.com/login` and come back.
- **Access:** only customers with a Retexia Post order (product slug `post`)
  in status *setting up*, *active* or *paused*.
- **Data:** the Retexia Post Supabase project (`supabase/schema.sql`). It has its
  own Auth, so the browser never talks to it: the server uses its service-role key
  (`lib/post-db.ts`, `server-only`) and every query is limited to the signed-in
  owner's business (`requireBusiness()` / `requireBusinessPage()` in `lib/session.ts`).
  The customer's login is mirrored into the Post project's `auth.users` with the
  same id, so `businesses.owner_id` works. A Post login that already has the same
  email (for example one used while testing n8n) is linked, and its businesses move over.
- **New post:** `POST N8N_PHOTO_POST_URL` with `{ prompt, publish, business_id }`
  and the header `X-Retexia-Key: N8N_POST_KEY`. In n8n, set the
  *Webhook: photo post* node's Authentication to **Header Auth** with that header
  and value, so nobody else can trigger it. The page refreshes until the post appears.
- **Edits** count as approval (`status = approved`). Set `POST_SAFETY_WORKFLOW=on`
  once a safety-check workflow listens for `safety_review` posts; edits then go
  through it first.
- **Lock point:** approve, new version, edit and move are refused within 15
  minutes of the post's time (checked in the database update itself).

## Environment (`.env.example`)

| Name | What |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | main Retexia project (same as the website) |
| `NEXT_PUBLIC_SUPABASE_URL2`, `SUPABASE_SERVICE_ROLE_KEY2` | Retexia Post project; the key stays on the server |
| `NEXT_PUBLIC_SITE_URL` | `https://post.retexia.com` |
| `NEXT_PUBLIC_WEB_URL` | `https://retexia.com` |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | `.retexia.com` (empty on localhost) |
| `N8N_PHOTO_POST_URL`, `N8N_POST_KEY` | the photo-post webhook and its shared key |
| `POST_PRODUCT_SLUG` | optional, default `post` |

## Deploy

1. Vercel → **Add New → Project**, same repository, **Root Directory** `apps/post`.
   Install command `cd ../.. && pnpm install --frozen-lockfile`, build command
   `cd ../.. && pnpm turbo run build --filter=@retexia/post`.
2. Add the environment variables above, deploy, and add the domain `post.retexia.com`.
3. Supabase (main project) → Authentication → URL Configuration: add
   `https://post.retexia.com/**` to Redirect URLs.
4. In admin.retexia.com → Products → Retexia Post → Details: set **Customer panel URL**
   to `https://post.retexia.com` and turn on **Panel is live**. Customers then see
   "Open Post panel" on their order.

Local: `pnpm --filter @retexia/post dev` → http://localhost:3002 (sign in on
http://localhost:3000 first; cookies are shared across ports on localhost).
