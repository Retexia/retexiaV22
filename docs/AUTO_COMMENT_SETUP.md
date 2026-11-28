# Autopublish + Auto comment: going live

Both tools use the same door to Facebook and the AI: the n8n workflow **"Retexia — Feeder Autopublish (gateway)"**. It holds the Meta System User token and uses the OpenAI key Lingo Feeder already uses; the panel never sees either. Auto comment uses the Page's own token, which n8n gets from the System User.

Shared by every Feeder tool (migration 0047):
- **Business details** (feeder.retexia.com/business): shop name, town, delivery days, call hours. Lingo Feeder and Auto comment's AI use them.
- **My products**: one list and one price per product (Lingo Feeder's price follows it, both ways).
- **Connections** (feeder.retexia.com/connections): Facebook / Instagram / TikTok (for Autopublish and Auto comment) and WhatsApp (for Lingo Feeder). A seller only sees the connections their tools use.

## 1. Meta: each seller connects their own Business portfolio (Connections)

Sellers don't share anything with Retexia's business any more. In **feeder.retexia.com → Connections → Facebook** they paste their **Business portfolio ID** and a **System User token** from that portfolio. Retexia checks it with Facebook, keeps the token encrypted (Supabase Vault) and uses only the ad accounts and Pages that **this portfolio owns** (assets of other portfolios are left out).

For the seller (shown step by step on the page):
1. business.facebook.com → Settings → **Business info**: copy the Business portfolio ID.
2. **Users → System users → Add** (Admin). **Assign assets**: the ad accounts (Manage campaigns) and the Pages (Create ads, Leads, Moderate, Messages).
3. **Generate new token** (their Meta app, expiry Never) with:
   - Autopublish: `ads_management, ads_read, business_management, pages_show_list, pages_manage_ads, pages_read_engagement, leads_retrieval`
   - Auto comment (a Pages-only token is enough): `pages_show_list, pages_read_engagement, pages_read_user_content, pages_manage_engagement, pages_messaging`
4. Paste both and press **Connect**. Then tick:
   - **Ad accounts for Autopublish** (any number; one is the default; each launch can pick another). An account Meta shows as unpaid, disabled or under review is flagged.
   - **Ads Page** (the Page the ads run from; its Instagram is picked up).
   - **Auto comment**: up to **2 Pages**. One Page answers its comments through one Retexia account only.

With their own token, Autopublish is connected straight away (no confirmation in admin). While the seller's Meta app is in Development mode it works for their own portfolio's assets; comments from people who aren't on the app may be limited until App Review.

Sellers set up the older way (shared with Retexia's business) keep working as before.

## 2. n8n

1. If an older "Retexia — Feeder Autopublish (gateway)" is there, **deactivate** it (two active workflows can't share the webhook path).
2. **Import** `n8n/feeder-autopublish.json` (Workflows → Import from file). It has the comment calls and the new **OpenAI (Auto comment)** step.
3. Credentials (all Header Auth):
   - Webhook: **"Retexia key (Autopublish)"**: Name `X-Retexia-Key`, Value = a long random text (the same as `FEEDER_ADS_N8N_KEY` on Vercel).
   - Every Meta node (Meta GET / POST, Page token, Meta POST image): **"Meta System User (Autopublish)"**: only needed for sellers on the older partner way (Retexia's own System User token). Sellers with their own portfolio don't go through n8n for Facebook.
   - **OpenAI (Auto comment)**: **"OpenAI API key"** (the one Lingo Feeder uses; it is picked already if it's the same n8n).
4. **Activate** the workflow. Copy the Webhook node's **Production URL**.

## 3. Vercel (apps/panels)

```
FEEDER_ADS_N8N_URL=<the Production URL of the webhook>
FEEDER_ADS_N8N_KEY=<the same value as the n8n Retexia key>
RETEXIA_META_BUSINESS_ID=<your business ID>
```
Redeploy **panels**.

## 4. Supabase

SQL editor, in order (all safe to run again):
1. `supabase/migrations/0046_feeder_auto_comment.sql`: the free **Auto comment** package, its tables and the every-minute clock.
2. `supabase/migrations/0047_feeder_shared_and_ai_comments.sql`: shared business details and prices, and Auto comment's AI settings.
3. `supabase/migrations/0048_feeder_meta_connection.sql`: each seller's own Business portfolio (token in Vault), its ad accounts and Pages.

## 5. Check (in this order)

1. feeder.retexia.com → **Business details**: fill in your shop. Then **My products**: your products and prices.
2. **Connections → Facebook**: Business portfolio ID + System User token → **Connect**; tick the ad accounts, the Ads Page and up to 2 Pages for Auto comment → **Save choices**. "Autopublish: ready" and "Auto comment: ready" should show.
3. (Only sellers on the older partner way: admin.retexia.com → Products → Feeder → **Autopublish** tab: confirm the account.)
4. **Autopublish → Launch**: a product, 1 video or image, a template → **Launch**. Everything is created **paused**; watch the launch's timeline until the review finishes, then switch it on in Ads Manager or the launch page.
5. **Auto comment**: write **What to hide** and **How to reply** in your own words, Save, switch it on. Comment on your ad from your own Facebook account (e.g. "price kiyada?"). Within a minute (or press **Check now**) the AI replies, sends you a private message with the price, and hides what you described (phone numbers and links always).
6. **Try a comment** on the Auto comment page asks the same AI without touching Facebook (handy in a presentation). It says "Backup reply" when the AI isn't reachable.
