# Deploying Retexia

A step-by-step guide from an empty Supabase project to a live `retexia.com` and `admin.retexia.com`.
Plan for about an hour and a half the first time.

You need: a [Supabase](https://supabase.com) account, a [Vercel](https://vercel.com) account, the
`retexia.com` domain, an authenticator app on your phone, and this repository on GitHub.

---

## 1. Create the Supabase project and database

1. In Supabase, click **New project**. Pick a region close to Sri Lanka (Singapore or Mumbai) and save
   the database password somewhere safe.
2. Open **SQL Editor → New query** and run each file, in order, by pasting it in and clicking **Run**:
   1. `supabase/migrations/0001_init.sql` (website: content, products, orders)
   2. `supabase/migrations/0002_api_grants.sql` (API access for new Supabase projects)
   3. `supabase/migrations/0003_admin.sql` (admin: team roles, payments, receipts, product actions,
      audit log, notifications)
   4. `0004_lingo_panel.sql`, `0005_post_schema.sql`, `0006_lingo_schema.sql` (product panels)
   5. `0007_product_controls.sql` (admin controls for Lingo and Post, Lingo v6 bot support)
3. Open a new query, paste all of `supabase/seed.sql` and click **Run**.

All files are safe to run again. Running the seed again resets the seeded content (texts, prices,
form questions) to the values in the file, so after you start editing in the admin, only re-run it on
purpose. The seed also adds any new interface texts (`site_strings`) that a code update introduced.

**With the Supabase CLI instead** (optional):

```bash
supabase link --project-ref <your-project-ref>
```

```bash
supabase db push
```

```bash
psql "$(supabase db url)" -f supabase/seed.sql
```

### Replace the placeholder contact details

After step 4 you can do this in the admin (**Settings → General**). Until then use **Table Editor →
site_settings**:

| column | placeholder |
|---|---|
| `contact_email` | hello@retexia.com |
| `contact_phone` | +94 70 000 0000 |
| `whatsapp_number` | +94700000000 (international format, no spaces) |
| `address` | Colombo, Sri Lanka |

### Legal pages

The Privacy policy and Terms of service pages are starter texts. **Have them reviewed by a lawyer
before launch.**

## 2. Make yourself the owner

1. Run the website (step 5 or locally) and sign up with your own email. Confirm it.
2. In **SQL Editor** run:

```sql
update profiles set role = 'owner' where email = 'you@example.com';
```

Roles: **owner** (everything, including the team and integration secrets), **admin** (everything
except the team, secrets and deleting logins), **editor** (website pages, media and texts),
**support** (requests, payments, customers, inbox) and **customer**. After this first owner, add the
team from the admin under **Settings → Team**. The database refuses to remove the last owner.

## 3. Supabase Auth settings

### Two-step sign-in (MFA)

**Authentication → Multi-Factor → TOTP (App Authenticator):** make sure it is **enabled**. The admin
requires every team member to set up an authenticator app (Google Authenticator, 1Password, Authy…)
the first time they sign in, and to enter a code on every new session. Customers are not affected.

### URL configuration

**Authentication → URL Configuration**

- **Site URL:** `https://retexia.com`
- **Redirect URLs** (add each):
  - `https://retexia.com/**`
  - `https://admin.retexia.com/**`
  - `https://*.retexia.com/**`
  - `http://localhost:3000/**`
  - `http://localhost:3001/**`
  - `https://*-<your-vercel-team>.vercel.app/**` (Vercel preview deployments)

### Email templates

**Authentication → Email Templates.** Point every link at the app that asked for it, with the token
hash, so links work in any browser. Both apps send a redirect address that already ends in
`/auth/confirm?next=…`, so every template uses `{{ .RedirectTo }}`:

| Template | Link |
|---|---|
| Confirm signup | `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` |
| Invite user | `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite` |
| Magic Link | `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` |
| Reset Password | `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery` |
| Change Email Address | `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email_change` |

So a customer's reset link opens `retexia.com/auth/confirm…` and a team member's opens
`admin.retexia.com/auth/confirm…`. Team invitations land on the admin's "set your password" page,
then two-step sign-in setup.

Write the email text in the Retexia voice, for example for Invite user:

> **You're on the Retexia team**
> Tap the button to set your password for the Retexia admin.
> [Set my password]
> If you didn't expect this, you can ignore this email.

Supabase's built-in email service is rate-limited and meant for testing. Before launch, add your own
SMTP provider under **Project Settings → Authentication → SMTP Settings** (Resend, Postmark, Amazon SES
or Zoho all work).

### Google sign-in (optional, customers only)

1. In Google Cloud Console create an OAuth client (type: Web). Authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase **Authentication → Providers → Google**, paste the client ID and secret, enable it.
3. In the admin, **Settings → General → Region and sign-in**, turn on "Continue with Google".

### Recommended

- **Authentication → Providers → Email:** keep **Confirm email** on.
- **Authentication → Attack Protection:** turn on leaked password protection and CAPTCHA if you see spam.

## 4. Deploy the website to Vercel

1. In Vercel click **Add New → Project** and import the GitHub repository.
2. **Root Directory:** `apps/web`. Framework preset: **Next.js** (detected). Leave build settings as they are;
   Vercel detects pnpm and Turborepo from the repository root.
3. **Environment Variables** (Production and Preview), from `.env.example`:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon / publishable key |
| `NEXT_PUBLIC_SITE_URL` | `https://retexia.com` |
| `NEXT_PUBLIC_ADMIN_URL` | `https://admin.retexia.com` (only this origin may show the site in a frame: the page editor preview) |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | `.retexia.com` in Production only. Leave **empty** for Preview. |
| `REVALIDATE_SECRET` | a long random string (`openssl rand -hex 32`) |

Never add the Supabase **service role** key to the website. It does not need it.

4. Click **Deploy**.
5. **Settings → Domains:** add `retexia.com` and `www.retexia.com`, and set `www` to redirect to
   `retexia.com`. Follow Vercel's DNS instructions at your domain registrar.

## 5. Deploy the admin to Vercel

The admin is a second Vercel project from the same repository.

1. **Add New → Project**, import the same repository again.
2. **Root Directory:** `apps/admin`.
3. **Environment Variables** (Production; for Preview use a separate Supabase project or leave the
   service role key out):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | same as the website |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as the website |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** key. Admin only. Never in a `NEXT_PUBLIC_` variable. |
| `NEXT_PUBLIC_ADMIN_URL` | `https://admin.retexia.com` |
| `NEXT_PUBLIC_WEB_URL` | `https://retexia.com` (page editor preview, links to the website) |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | `.retexia.com` in Production only |
| `REVALIDATE_SECRET` | the **same** value as the website: saving in the admin refreshes the website at once |

4. Deploy, then **Settings → Domains:** add `admin.retexia.com`.
5. Sign in at `https://admin.retexia.com` with your owner account. You are asked to set up two-step
   sign-in, then you land on the dashboard.

The service role key is used only in the admin's server code (marked `server-only`): for inviting the
team, banning or deleting logins, reading signed n8n secrets and writing audit entries. Everything
else runs with the signed-in person's own permissions, and the database checks their role again.

The admin sends `noindex` headers, a strict Content-Security-Policy and refuses to be framed.
Search engines never list it.

## 6. Instant content updates

Saving anything in the admin calls `POST https://retexia.com/api/revalidate` with the shared
`REVALIDATE_SECRET`, so changes are live within a second ("Saved · live on website").

Edits made directly in the Supabase table editor still refresh within 60 seconds. To make those
instant too, add Database Webhooks:

1. **Database → Webhooks → Create a new hook.**
2. Name: `revalidate-site`.
3. Table: a content table, for example `page_sections`. Events: **Insert, Update, Delete**.
4. Type: **HTTP Request**, method **POST**, URL `https://retexia.com/api/revalidate`.
5. HTTP Headers: add `x-revalidate-secret` with the value of `REVALIDATE_SECRET`.
6. Save. Repeat for the other content tables if you edit them outside the admin.

Refresh by hand:

```bash
curl -X POST https://retexia.com/api/revalidate -H "x-revalidate-secret: <your secret>"
```

## 7. n8n: notifications

Customer and team notifications (request received, status changed, payment confirmed, new message,
payment proof uploaded) are written to the `notifications_outbox` table. n8n sends them.

1. **Database → Webhooks → Create a new hook**, table `notifications_outbox`, event **Insert**,
   method **POST**, URL: your n8n Webhook node (for example
   `https://n8n.example.com/webhook/retexia-notifications`). Add a header `x-retexia-secret` with a
   long random value and check it in n8n.
2. In n8n, route on `record.channel` (`email` or `whatsapp`) and send `record.subject` / `record.body`
   to `record.recipient`.
3. Report back so the admin shows "sent" or the error: POST to
   `https://admin.retexia.com/api/n8n/callback`, signed (below), with

```json
{ "type": "notification", "notification_id": "<record.id>", "status": "sent" }
```

4. In the admin, **Settings → Integrations** (owner): generate the **callback secret** and save the
   **notifications webhook URL** (the same n8n URL). "Test connection" sends a signed ping; "Retry"
   in **Settings → Notifications** re-sends a failed message.

Which events notify customers by email or WhatsApp, and which team emails are told about new
requests, is set in **Settings → Notifications**.

## 8. n8n: product actions

Product actions are buttons on a request (for example "Start setup" for Lingo) that call an n8n
workflow. Set them up per product in **Products → <product> → Actions**: label, when it is available,
who may run it, which answers and setup fields are sent, the webhook URL and a signing secret
("Generate"). "Send test" posts a sample payload.

### What n8n receives

```http
POST https://n8n.example.com/webhook/lingo-setup
Content-Type: application/json
X-Retexia-Timestamp: 1791013200
X-Retexia-Signature: 3f1c…  (hex HMAC-SHA256 of "<timestamp>.<raw body>" with the action's signing secret)
```

```json
{
  "event": "action.start_setup",
  "run_id": "6f1c…",
  "callback_url": "https://admin.retexia.com/api/n8n/callback",
  "order": { "id": "…", "ref": "LIN-2026-0001", "status": "setting_up", "billing_cycle": "monthly", "package_name": "Lingo Pro", "price_amount": 14900, "setup_fee": 19900, "currency": "LKR" },
  "customer": { "id": "…", "full_name": "Amaya Perera", "email": "amaya@example.com", "phone": "+94771234567", "whatsapp": "+94771234567", "business_name": "Amaya Cakes" },
  "package": { "slug": "pro", "name": "Lingo Pro" },
  "product": { "slug": "lingo", "code": "LIN", "name": "Retexia Lingo" },
  "answers": { "business_name": "Amaya Cakes" },
  "service_data": { "bot_name": "Amaya Bot", "whatsapp_phone_number_id": "1234567890" },
  "secrets": { "meta_access_token": "EAAG…" }
}
```

Secrets are only included when the action lists them under "Data sent to n8n".

### Verify the signature in n8n (Code node)

```js
const crypto = require('crypto');
const h = $input.first().json.headers;
const body = JSON.stringify($input.first().json.body); // or the raw body if your Webhook node provides it
const expected = crypto.createHmac('sha256', $env.RETEXIA_ACTION_SECRET).update(h['x-retexia-timestamp'] + '.' + body).digest('hex');
if (h['x-retexia-signature'] !== expected) throw new Error('Bad signature');
if (Math.abs(Date.now() / 1000 - Number(h['x-retexia-timestamp'])) > 300) throw new Error('Too old');
return $input.all();
```

### Answer or call back

Either answer the webhook directly (within 15 seconds) or reply `202` and call back later. Both use
the same JSON:

```json
{
  "run_id": "6f1c…",
  "status": "succeeded",
  "service_data": { "n8n_workflow_id": "wf_123" },
  "order_status": "active",
  "customer_note": "Your assistant is live.",
  "error": null
}
```

Callbacks go to `https://admin.retexia.com/api/n8n/callback`, signed with the **callback secret**
from Settings → Integrations (same header format). The admin checks the signature and that the
timestamp is under 5 minutes old, and ignores repeats for a run that already finished. Returned
`service_data` is merged into the request's setup fields (secret fields are stored privately);
`order_status` moves the request through the normal status rules.

### About secrets

Webhook URLs, signing secrets, the callback secret and secret setup fields (for example a Meta access
token) are stored in a `private` schema that the API does not expose. The admin shows them masked
(`••••abcd`); only admins and owners can reveal a request's secret, and every reveal is in the audit
log. For extra protection you can move them into Supabase Vault later; the admin reads them only
through the `svc_*` database functions, so only those functions would change.

## 9. Before launch checklist

- [ ] Migrations 0001, 0002 and 0003 and the seed have run.
- [ ] You are the owner (`profiles.role = 'owner'`) and have set up two-step sign-in.
- [ ] TOTP MFA is enabled in Supabase Auth.
- [ ] Placeholder contact details replaced (Settings → General).
- [ ] Payment instructions and receipt details filled in (Settings → Payments and invoices).
- [ ] Legal pages reviewed by a lawyer.
- [ ] Auth Site URL, redirect URLs (website **and** admin) and the five email templates updated.
- [ ] Custom SMTP configured.
- [ ] `NEXT_PUBLIC_COOKIE_DOMAIN=.retexia.com` set for Production on both projects.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set on the admin project only.
- [ ] The same `REVALIDATE_SECRET` on both projects; saving in the admin shows "live on website".
- [ ] Notifications webhook to n8n created and the callback secret saved in n8n.
- [ ] `https://retexia.com/sitemap.xml` and `/robots.txt` load; `admin.retexia.com/robots.txt` disallows everything.
- [ ] Sign up, onboarding, payment proof upload, approval, payment confirmation and receipt tested end to end.
