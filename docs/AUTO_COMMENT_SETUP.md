# Autopublish + Auto comment: going live

Both tools use the same door to Facebook and the AI: the n8n workflow **"Retexia — Feeder Autopublish (gateway)"**. It holds the Meta System User token and uses the OpenAI key Lingo Feeder already uses; the panel never sees either. Auto comment uses the Page's own token, which n8n gets from the System User.

Shared by every Feeder tool (migration 0047):
- **Business details** (feeder.retexia.com/business): shop name, town, delivery days, call hours. Lingo Feeder and Auto comment's AI use them.
- **My products**: one list and one price per product (Lingo Feeder's price follows it, both ways).
- **Connections** (feeder.retexia.com/connections): Facebook / Instagram / TikTok (for Autopublish and Auto comment) and WhatsApp (for Lingo Feeder). A seller only sees the connections their tools use.

## 1. Meta (business.facebook.com, your Retexia business)

1. **Business settings → Users → System users**: open (or add) the system user Retexia uses.
2. **Assign assets** to it:
   - the **ad account**: Manage campaigns;
   - the **Page**: Create ads, Leads, **Moderate** (reply and hide comments), **Messages** (private replies).
   If the ad account or Page belongs to another business, that business shares it with Retexia as a partner first.
3. **Generate a new token** for the system user (app: your Retexia Meta app, expiry: never) with these permissions:
   `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `pages_manage_metadata`, `leads_retrieval`, and for Auto comment `pages_read_user_content`, `pages_manage_engagement`, `pages_messaging`.
4. While the Meta app is in **Development** mode it works for your own business's ad accounts and Pages. Comments by people who aren't on the app may be limited until the app passes App Review (Advanced access); test with your own Facebook account (an app admin).

## 2. n8n

1. If an older "Retexia — Feeder Autopublish (gateway)" is there, **deactivate** it (two active workflows can't share the webhook path).
2. **Import** `n8n/feeder-autopublish.json` (Workflows → Import from file). It has the comment calls and the new **OpenAI (Auto comment)** step.
3. Credentials (all Header Auth):
   - Webhook: **"Retexia key (Autopublish)"**: Name `X-Retexia-Key`, Value = a long random text (the same as `FEEDER_ADS_N8N_KEY` on Vercel).
   - Every Meta node (Meta GET / POST, Page token, Meta POST image): **"Meta System User (Autopublish)"**: Name `Authorization`, Value `Bearer <the new token>`.
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

SQL editor, in order (both safe to run again):
1. `supabase/migrations/0046_feeder_auto_comment.sql`: the free **Auto comment** package, its tables and the every-minute clock.
2. `supabase/migrations/0047_feeder_shared_and_ai_comments.sql`: shared business details and prices, and Auto comment's AI settings.

## 5. Check (in this order)

1. feeder.retexia.com → **Business details**: fill in your shop. Then **My products**: your products and prices.
2. **Connections**: ad account ID, Page ID → **Save**, then **Check**. Every line should be green.
3. admin.retexia.com → Products → Feeder → **Autopublish** tab: confirm the account (status **connected**).
4. **Autopublish → Launch**: a product, 1 video or image, a template → **Launch**. Everything is created **paused**; watch the launch's timeline until the review finishes, then switch it on in Ads Manager or the launch page.
5. **Auto comment**: write **What to hide** and **How to reply** in your own words, Save, switch it on. Comment on your ad from your own Facebook account (e.g. "price kiyada?"). Within a minute (or press **Check now**) the AI replies, sends you a private message with the price, and hides what you described (phone numbers and links always).
6. **Try a comment** on the Auto comment page asks the same AI without touching Facebook (handy in a presentation). It says "Backup reply" when the AI isn't reachable.
