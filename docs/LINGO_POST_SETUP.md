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

### Database

Run `supabase/migrations/0013_post_playlist.sql` (after 0012), then
`0014_post_today_whatsapp.sql` (publish automatically for every business type,
the planning time setting, WhatsApp messages), then `0015_post_focus_groups.sql`
(what each post is about: one product, a product group, or the whole business).
After 0015, import `n8n/retexia-post.json` again (or re-copy its *Config*,
*Load business*, *Build plan request*, *Build copy request* and *Build image
request* nodes) so the designer only sees the product(s) a post is about. It adds the daily
playlist (posts and stories, slots 1–10), the functions the workflow calls, and
the new plan texts on retexia.com/post. Safe to run again.

### n8n workflow "Retexia — Post (plan + design)"

1. n8n → **Import from file** → `n8n/retexia-post.json`.
2. Open each node with a credential and pick yours: **Postgres** (the Retexia
   project), **Supabase** (the Retexia project, for Storage), **OpenAI**.
3. **Config** node: set `retexiaKey` to a long random value
   (`openssl rand -hex 32`). Models, image quality and sizes are there too
   (`imageQuality: 'high'` draws Sinhala/Tamil letters more accurately).
4. **Activate** it, then copy *Webhook: Retexia Post* → **Production URL**
   (ends in `/webhook/retexia-post`).
5. Deactivate the old "Retexia — Photo post (generate + publish)" workflow: it
   published with a fixed Page token, and the panel no longer calls it.

The workflow only designs; it never publishes. post.retexia.com publishes with
each customer's own Facebook/Instagram access.

| Call from the panel | What the workflow does |
| --- | --- |
| `plan` (06:00 each day) | Reads `post.plan_context()`, writes one idea per slot for tomorrow (offers and week-plan notes first, no repeats), answers with the prompts. If n8n is down the panel writes simple product prompts itself. |
| `design` (from 00:00, or "Design now"/"Redo"/"New post") | Answers at once, then writes the captions and the design text in the chosen languages, draws the picture (feed 4:5, story 9:16, logo when set), uploads it and calls `post.finish_design()`. Errors call `post.design_failed()`: the item shows "needs you" with the reason. |

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
   `instagram_manage_contents` (deleting Instagram posts), `business_management`.
   Customers who connected before this change press **Reconnect** once so
   Instagram deletes work. Until Meta approves them (App Review + Business
   Verification, plan 4–6 weeks), only people with a role on the app can connect:
   add early customers as testers (App roles → Roles).

### Vercel → panels project

`N8N_POST_URL` (the Production URL above), `N8N_POST_KEY` (= `retexiaKey`), `META_APP_ID`, `META_APP_SECRET`,
`META_GRAPH_VERSION=v26.0`, `POST_CRON_KEY` (the key from step 1). Redeploy.

### WhatsApp messages to owners

Owners turn them on under **Playlist and settings → WhatsApp messages**: each
post and story with its picture and caption as soon as it is ready (again after
a redo), a note when it is published, and an alert when something needs them.
Nothing is sent in their quiet hours; those messages go out when it ends.

They are sent from Retexia's own WhatsApp line on your Evolution server:

1. On the Evolution server, create an instance for Retexia (e.g. `retexia-post`)
   and scan its QR code with the Retexia business WhatsApp.
2. Vercel → panels: `POST_WHATSAPP_INSTANCE=retexia-post` (it uses
   `EVOLUTION_API_URL` and `EVOLUTION_API_KEY`; set `POST_WHATSAPP_KEY` only if
   the instance has its own key). Redeploy.
3. In Settings, press **Send a test message**.

### What happens then (the daily playlist)

- **Playlist:** each day has up to 5 posts and 5 stories (plan limits: Starter
  2 + 2, Growth 3 + 3, Pro 5 + 5). The customer sets how many, their times, the
  caption language and the design language under **Playlist and settings**.
- **06:00** (business time, changeable under **Playlist and settings → Write
  tomorrow's playlist at**): tomorrow's prompts are written, and today's empty
  slots are filled (slots whose time has passed get the next free times). The customer can
  change any idea, its languages or its time during the day, or add their own.
  **Fill today** on the Playlist page does the same for today straight away.
- **What each item is about:** the playlist picks one product or the whole
  business ("About your business" on the Brand page) at random for each item,
  each product at most once a day. Owners can change it on any item, on
  **New post** and on **Redo**: one product, a group, or the whole business.
  Groups are made under **Products → Groups**.
- **From 00:00:** the day's items are designed, so they are ready by 6 AM.
  "Design now" designs one straight away.
- **At each item's time:** published to Facebook and Instagram. Publishing
  automatically is on for every business until the owner turns it off; then
  each item waits for approval. Temporary errors retry
  after 2, 5, 15 and 30 minutes; lost access marks the account "Reconnect needed".
- **After publishing:** the customer can change the Facebook text, or delete the
  post from Facebook and Instagram. Instagram does not allow caption changes
  through its API, so the panel offers delete and post again.
- **Made by hand:** "New post" makes a post or story (up to 5 extra a day) now
  or at a chosen time.
- Nothing is planned while the business is paused, its subscription stopped, or
  Admin → Products → Post has AI posts paused for everyone.
- Orders drive plans: the customer's package sets the plan; pausing or cancelling
  the order stops Post publishing and switches the Lingo bot off.
- Admin → Products → Post → **Businesses**: health, usage, cost, and the global
  pause switches.

## 4. Check it

- `https://post.retexia.com/api/health` and `https://lingo.retexia.com/api/health`.
- Supabase → Integrations → Cron → `retexia-post-publish-tick` runs every minute
  (it only calls the panel when a post is due) and `retexia-post-batch-tick`
  every 5 minutes (`/api/post/batch` answers with what it planned and sent to
  design, and `designer: connected` when `N8N_POST_URL` is set).
- Admin → Settings → Audit log shows bot links, account changes and plan changes.
