# Deploying Retexia

A step-by-step guide from an empty Supabase project to a live `retexia.com`.
Plan for about an hour the first time.

You need: a [Supabase](https://supabase.com) account, a [Vercel](https://vercel.com) account, the
`retexia.com` domain, and this repository on GitHub.

---

## 1. Create the Supabase project and database

1. In Supabase, click **New project**. Pick a region close to Sri Lanka (Singapore or Mumbai) and save
   the database password somewhere safe.
2. Open **SQL Editor → New query**, paste all of `supabase/migrations/0001_init.sql` and click **Run**.
3. Open a new query, paste all of `supabase/seed.sql` and click **Run**.

Both files are safe to run again. Running the seed again resets the seeded content (texts, prices,
form questions) to the values in the file, so after you start editing in the table editor, only re-run
it on purpose.

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

Open **Table Editor → site_settings** and replace these placeholders with real values:

| column | placeholder |
|---|---|
| `contact_email` | hello@retexia.com |
| `contact_phone` | +94 70 000 0000 |
| `whatsapp_number` | +94700000000 (international format, no spaces) |
| `address` | Colombo, Sri Lanka |

### Legal pages

The Privacy policy and Terms of service (`page_sections` of the `privacy` and `terms` pages) are
starter texts. **Have them reviewed by a lawyer before launch.**

## 2. Make yourself an admin

1. Run the site (step 4 or locally) and sign up with your own email. Confirm it.
2. In **SQL Editor** run:

```sql
update profiles set role = 'admin' where email = 'you@example.com';
```

Admins can see the site during maintenance mode, and can read and write all content and orders
through the API. (The Supabase dashboard can always edit everything, admin or not.)

## 3. Supabase Auth settings

### URL configuration

**Authentication → URL Configuration**

- **Site URL:** `https://retexia.com`
- **Redirect URLs** (add each):
  - `https://retexia.com/**`
  - `https://*.retexia.com/**`
  - `http://localhost:3000/**`
  - `https://*-<your-vercel-team>.vercel.app/**` (Vercel preview deployments)

### Email templates

**Authentication → Email Templates.** Point every link at `/auth/confirm` with the token hash, so links
work in any browser (not only the one that asked for them). Replace the link in each template:

| Template | Link |
|---|---|
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}` |
| Magic Link | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}` |
| Reset Password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |
| Change Email Address | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/account/security` |

`{{ .RedirectTo }}` carries the page the person was going to (for example the Lingo onboarding form),
so they land back there after confirming. If a template keeps the default `{{ .ConfirmationURL }}`,
it still works: `/auth/confirm` also accepts `?code=` links, as long as the link is opened in the same
browser.

Write the email text in the Retexia voice, for example for Confirm signup:

> **Confirm your email**
> Tap the button to finish creating your Retexia account.
> [Confirm my email]
> If you did not sign up, you can ignore this email.

Supabase's built-in email service is rate-limited and meant for testing. Before launch, add your own
SMTP provider under **Project Settings → Authentication → SMTP Settings** (Resend, Postmark, Amazon SES
or Zoho all work).

### Google sign-in (optional)

1. In Google Cloud Console create an OAuth client (type: Web). Authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase **Authentication → Providers → Google**, paste the client ID and secret, enable it.
3. In **Table Editor → site_settings** set `auth_google_enabled` to `true`. The "Continue with Google"
   button appears on sign-in and sign-up.

### Recommended

- **Authentication → Providers → Email:** keep **Confirm email** on.
- **Authentication → Attack Protection:** turn on leaked password protection and CAPTCHA if you see spam.

## 4. Deploy to Vercel

1. In Vercel click **Add New → Project** and import the GitHub repository.
2. **Root Directory:** `apps/web`. Framework preset: **Next.js** (detected). Leave build settings as they are;
   Vercel detects pnpm and Turborepo from the repository root.
3. **Environment Variables** (Production and Preview), from `.env.example`:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon / publishable key |
| `NEXT_PUBLIC_SITE_URL` | `https://retexia.com` (for Preview: leave the same, or your preview URL) |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | `.retexia.com` in Production only. Leave **empty** for Preview. |
| `REVALIDATE_SECRET` | a long random string (`openssl rand -hex 32`) |

Never add the Supabase **service role** key to this app. It does not need it.

4. Click **Deploy**.
5. **Settings → Domains:** add `retexia.com` and `www.retexia.com`, and set `www` to redirect to
   `retexia.com`. Follow Vercel's DNS instructions at your domain registrar.

Later, each product panel (for example `apps/lingo`) is its own Vercel project with its own root
directory, deployed to its own subdomain (`lingo.retexia.com`). Because the auth cookie is set for
`.retexia.com`, people stay signed in across all of them.

## 5. Instant content updates (Database Webhook)

Pages are cached and refresh on their own every 60 seconds. To see edits within a few seconds, let
Supabase tell the site when content changes:

1. **Database → Webhooks → Create a new hook.**
2. Name: `revalidate-site`.
3. Table: pick a content table, for example `page_sections`. Events: **Insert, Update, Delete**.
4. Type: **HTTP Request**, method **POST**, URL `https://retexia.com/api/revalidate`.
5. HTTP Headers: add `x-revalidate-secret` with the value of `REVALIDATE_SECRET`.
6. Save. Repeat for each content table (one webhook per table):
   `site_settings`, `site_strings`, `navigation_items`, `pages`, `page_sections`, `services`,
   `testimonials`, `faqs`, `products`, `product_features`, `packages`, `package_features`, `forms`,
   `form_steps`, `form_fields`, `order_statuses`.

Test it: change a section title in the table editor and reload the page.

You can also refresh by hand:

```bash
curl -X POST https://retexia.com/api/revalidate -H "x-revalidate-secret: <your secret>"
```

## 6. Connecting n8n later (product backends)

Each product's automation lives in its own n8n workflow. Hook it to orders with another webhook:

1. **Database → Webhooks → Create a new hook**, table `orders`, events **Insert** and **Update**.
2. URL: your n8n Webhook node URL. Add a secret header and check it in n8n.

Supabase sends JSON like this:

```json
{
  "type": "UPDATE",
  "table": "orders",
  "schema": "public",
  "record": {
    "id": "6f1c…",
    "ref": "LNG-2026-0001",
    "user_id": "a3b2…",
    "product_id": "9d4e…",
    "package_id": "1c7f…",
    "status": "setting_up",
    "billing_cycle": "monthly",
    "package_name": "Lingo Pro",
    "price_amount": 14900,
    "setup_fee": 19900,
    "currency": "LKR",
    "answers": [{ "key": "business_name", "label": "Business name", "value": "Amaya Cakes", "display_value": "Amaya Cakes", "step": "About your business" }],
    "form_version": 1,
    "created_at": "2026-10-02T10:00:00Z",
    "updated_at": "2026-10-03T09:00:00Z"
  },
  "old_record": { "status": "awaiting_payment", "…": "…" }
}
```

In n8n, start provisioning when `record.status` becomes `setting_up` (and `old_record.status` was
something else), and switch the bot on when it becomes `active`. Use the product's `code` (or
`product_id`) to route to the right workflow. Do not build this until the product panels exist.

## 7. Before launch checklist

- [ ] Placeholder contact details replaced in `site_settings`.
- [ ] Legal pages reviewed by a lawyer.
- [ ] You are an admin (`profiles.role = 'admin'`).
- [ ] Auth Site URL, redirect URLs and the four email templates updated.
- [ ] Custom SMTP configured.
- [ ] `NEXT_PUBLIC_COOKIE_DOMAIN=.retexia.com` set for Production only.
- [ ] Database Webhooks for the content tables created and tested.
- [ ] `https://retexia.com/sitemap.xml` and `/robots.txt` load.
- [ ] Sign up, onboarding, and an order status change tested on the live site.
