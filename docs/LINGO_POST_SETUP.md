# Lingo and Post: go-live checklist

Everything below is one-time setup. After it, customers do the rest themselves:
Lingo customers link their WhatsApp by scanning a QR code, Post customers
connect Facebook/Instagram with "Continue with Facebook", and posts are made
and published automatically.

## 1. Database (Supabase → SQL Editor)

1. Run `supabase/migrations/0008_post_lingo_launch.sql`. It also publishes the
   new retexia.com/post page, plans, FAQs and order form (live within ~5 minutes).
2. **Database → Extensions:** make sure `pg_cron` and `pg_net` are on. If you
   turned them on just now, run 0008 again (it schedules the publisher).
3. Make a scheduler key (Terminal: `openssl rand -hex 32`) and store the three
   Vault secrets (replace the key):

```sql
select vault.create_secret('https://post.retexia.com/api/post/publish', 'post_publish_url');
select vault.create_secret('https://post.retexia.com/api/post/batch', 'post_batch_url');
select vault.create_secret('PASTE-THE-KEY-HERE', 'post_cron_key');
```

## 2. Lingo (lingo.retexia.com)

| Where | What |
| --- | --- |
| n8n | Lingo workflow active. Copy **WhatsApp Webhook → Production URL** (ends in `/webhook/Lingo`). |
| Vercel → panels project | `EVOLUTION_API_URL` (your Evolution server), `EVOLUTION_API_KEY` (its global key, `AUTHENTICATION_API_KEY`), `LINGO_N8N_WEBHOOK_URL` (the URL above) |
| Vercel → admin project | `LINGO_N8N_WEBHOOK_URL` (same URL) |

How it works for a customer with an active Lingo order: lingo.retexia.com →
**Set up your Lingo** (business name, language) → **scan the QR code** in
WhatsApp → Linked devices. The panel creates the WhatsApp line on your
Evolution server and points it at the n8n bot, so the bot answers straight away.
Later they can relink or unlink under **WhatsApp** in the panel.

Bots you already run: Admin → Products → Lingo → **Bot accounts** → open the
bot → connect it to the customer, and press **Link to n8n bot** once.

Without `EVOLUTION_API_*` the panel shows "almost ready" and the team connects
bots from the admin, as before.

## 3. Post (post.retexia.com)

### n8n photo workflow (unchanged)

Your "Retexia — Photo post (generate + publish)" workflow stays as it is. The
panel calls its webhook with `{ "prompt", "publish", "business_id" }` and reads
what the workflow writes to the database:

- **Publish now** → your workflow designs and publishes it (status `published`/`failed`).
- **Save as draft** → your workflow saves it as `ready` in the next free slot; the
  database sets it to that slot's time, and it goes out then (auto-publish) or
  after the owner approves.
- **Nightly posts** and **deny → new version** call the same webhook.

Set `N8N_PHOTO_POST_URL` to the **Production URL** of *Webhook: photo post*
(the workflow must be active).

### Meta app (Facebook and Instagram)

1. developers.facebook.com → **Create app** → type **Business**.
2. Add **Facebook Login for Business**. Settings → Valid OAuth Redirect URIs:
   `https://post.retexia.com/connect/meta/callback`.
   Deauthorize callback: `https://post.retexia.com/api/meta/deauthorize`.
3. App settings → Basic: Privacy Policy `https://retexia.com/privacy`, Terms
   `https://retexia.com/terms`, Data deletion callback
   `https://post.retexia.com/api/meta/data-deletion`. Copy App ID and App secret.
4. Permissions used: `pages_show_list`, `pages_manage_posts`,
   `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`,
   `business_management`. Until Meta approves them (App Review + Business
   Verification, plan 4–6 weeks), only people with a role on the app can connect:
   add early customers as testers (App roles → Roles).

### Vercel → panels project

`N8N_PHOTO_POST_URL`, `META_APP_ID`, `META_APP_SECRET`,
`META_GRAPH_VERSION=v26.0`, `POST_CRON_KEY` (the key from step 1). Redeploy.

### What happens then

- **New post** in the panel → your n8n workflow designs it (about a minute) and,
  with "Publish now", publishes it; otherwise it waits in the next free time slot.
- **Every night ~1 AM** (business time): 3 posts per business with a connected
  account and AI images left. Priority: active offer → week plan → product idea.
- **Scheduled posts** (drafts, nightly posts) are published every minute by
  post.retexia.com to Facebook and Instagram, with the customer's own access
  from "Continue with Facebook" (stored in Supabase Vault). Temporary errors retry after 2, 5, 15
  and 30 minutes; lost access marks the account "Reconnect needed".
- **Deny** → your workflow makes a new version in the next free slot (10 per post, monthly redo allowance).
- Orders drive plans: the customer's package sets the plan; pausing or cancelling
  the order stops Post publishing and switches the Lingo bot off.
- Admin → Products → Post → **Businesses**: health, usage, cost, and the global
  pause switches.

## 4. Check it

- `https://post.retexia.com/api/health` and `https://lingo.retexia.com/api/health`.
- Supabase → Integrations → Cron → `retexia-post-publish-tick` runs every minute
  (it only calls the panel when a post is due).
- Admin → Settings → Audit log shows bot links, account changes and plan changes.
