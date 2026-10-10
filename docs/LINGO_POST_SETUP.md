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

### How it works: the website decides, n8n is the worker

post.retexia.com decides **what** happens and **when** (planning, designing,
publishing times, retries, WhatsApp quiet hours). The n8n workflow
"Retexia — Post (worker)" only does the job it is asked to do, and each run takes
seconds (a design about a minute). Nothing waits or polls inside n8n, so it
stays light as customers grow.

| Job (post.retexia.com → n8n) | What n8n does |
| --- | --- |
| `plan` (at each business's planning time) | Writes one idea per slot for tomorrow, answers with them. |
| `design` (from midnight, "Design now", "Redo", "New post") | Captions + picture → Storage → `post.finish_design()`. Errors → `post.design_failed()`. |
| `publish` (a post whose time has come) | `post.worker_publish_rows()` gives each account with that customer's token from Supabase → Facebook post / story, Instagram post / story → `post.n8n_publish_result()` per account. |
| `delete` (owner deletes a published post) | `post.worker_delete_rows()` → Meta delete → `post.worker_delete_result()`. |
| `edit_text` (owner changes a published Facebook text) | `post.worker_edit_rows()` → Facebook. |
| `whatsapp` (a message for an owner) | Sends it through Retexia's Evolution line (picture + caption, or text). |

The clocks are in Supabase and only call the website when something is due:
`retexia-post-publish-tick` (checked every minute inside the database; calls
post.retexia.com only when a post is due) and `retexia-post-batch-tick`
(planning and designs). Temporary Meta errors retry after 2, 5, 15 and 30
minutes; lost access marks the account "reconnect needed" and the owner is told.

### Set it up

1. Run `supabase/migrations/0016_post_n8n_publish.sql` (after 0015; safe to run again,
   also over earlier versions of it).
2. n8n → **Import from file** → `n8n/retexia-post.json` ("Retexia — Post (worker)").
   Pick your credentials on the Postgres, Supabase and OpenAI nodes. Deactivate
   the old "Retexia — Photo post (generate + publish)" workflow and any earlier
   "Retexia — Post" copy.
3. **Config** node: `retexiaKey` = a long random value (`openssl rand -hex 32`),
   and the Evolution URL, API key and instance of Retexia's own WhatsApp line.
4. **Activate**, copy *Webhook: Retexia Post* → **Production URL**.
5. Vercel → panels: `N8N_POST_URL` (that URL), `N8N_POST_KEY` (= `retexiaKey`),
   `POST_PUBLISHER=n8n`, `POST_CRON_KEY`. No Meta keys are needed. Redeploy.
6. The Vault secrets from step 1 of this guide must exist: `post_publish_url`,
   `post_batch_url`, `post_cron_key`.

The Postgres user in n8n must be able to run the `post.worker_*` and
`post.n8n_publish_result` functions (`post_n8n.<project-ref>` or `postgres`).
These return customers' tokens, which n8n keeps in its run history: keep your
n8n private, and turn on pruning (`EXECUTIONS_DATA_PRUNE=true`,
`EXECUTIONS_DATA_MAX_AGE=168`) so the history stays small.

### Add a customer's Facebook Page and Instagram (Supabase → SQL Editor)

You need the customer's **Page id**, a **Page access token** (long-lived, with
`pages_manage_posts`, `pages_read_engagement`, `instagram_basic`,
`instagram_content_publish`; for deleting Instagram posts also
`instagram_manage_contents`) and their **Instagram business account id** (linked to the Page).

```sql
-- Find the business
select business_id, business, owner_email, platform, status, has_token from post.admin_accounts;

-- Connect the Page and its Instagram (run again with a new token to replace it)
select * from post.admin_connect_page(
  'BUSINESS-ID',            -- from the query above
  'PAGE-ID',
  'PAGE-ACCESS-TOKEN',
  'INSTAGRAM-ACCOUNT-ID',   -- or null for Facebook only
  'Page name',              -- optional, shown in the panel
  'instagram_username');    -- optional
```

The token is stored encrypted in Supabase Vault; the panel shows the accounts
as connected straight away. Tip: with a Meta **Business Manager**, customers
add your business as a partner on their Page, and a **system user** token
from your Business Manager does not expire.

### A post was designed but not published: check

```sql
-- 1. Does the business have connected accounts with a token?
select business, platform, status, enabled, has_token from post.admin_accounts;
-- 2. What happened to the latest posts (deny_reason says why it failed)?
select local_date, slot, is_story, status, scheduled_at, deny_reason from post.posts order by updated_at desc limit 20;
-- 3. Each account's result
select x.status, x.attempts, x.last_error, x.created_at from post.publications x order by x.created_at desc limit 20;
-- 4. Is the publishing clock running, and does it reach the website?
select jobname, schedule, active from cron.job where jobname like 'retexia-post%';
select status_code, left(content::text, 200), created from net._http_response order by created desc limit 10;
select name from vault.decrypted_secrets where name like 'post_%';
```

- A post stays **ready** after its time: the clock isn't running (step 4) or
  auto publish is off (it then needs Approve).
- **failed** with "No Facebook or Instagram account is connected": add them with
  `post.admin_connect_page`, then press **Retry** on the post.
- **failed** with a Meta message: the token or its permissions; add a new token.
- n8n → Executions shows each publish job and Meta's answer.

Deleting a published post and changing a Facebook post's text are also done by
n8n, when the owner presses the button in the panel.

### Meta app (optional: only for "Continue with Facebook" in the panel)

Not needed when you add customers' Pages in Supabase (above).

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

The website picks them (nothing twice, quiet hours respected) and n8n sends them. Owners turn them on under **Playlist and settings → WhatsApp messages**: each
post and story with its picture and caption as soon as it is ready (again after
a redo), a note when it is published, and an alert when something needs them.
Nothing is sent in their quiet hours; those messages go out when it ends.

They come from Retexia's own WhatsApp line: on the Evolution server, create an
instance (e.g. `retexia-post`), scan its QR code with the Retexia business
WhatsApp, and put its details in the workflow's **Config** node.
(Optional: with `POST_WHATSAPP_INSTANCE` also set in Vercel, the panel's
**Send a test message** button works too.)

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
- Supabase → Integrations → Cron → `retexia-post-publish-tick` and `retexia-post-batch-tick`
  every 5 minutes (`/api/post/batch` answers with what it planned and sent to
  design, and `designer: connected` when `N8N_POST_URL` is set).
- Admin → Settings → Audit log shows bot links, account changes and plan changes.
