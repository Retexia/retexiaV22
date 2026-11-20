# Feeder → Lingo: go-live setup

**feeder.retexia.com/lingo**: the WhatsApp sales bot for Feeder sellers, on the official WhatsApp Cloud API. It is a paid Feeder package: **LKR 4,900 / month** (LKR 49,000 a year), no setup fee, with a 7-day free trial.

## How it fits together

| Part | Where |
|---|---|
| Database (sellers, numbers, chats, orders, FAQs, rules, texts, answer cache, AI usage) | `supabase/migrations/0037_feeder_lingo.sql` (schema `lingo`, `bot_*` tables) |
| The bot pipeline | n8n `n8n/feeder-lingo.json`, built from `n8n/lingo/src/*.js` by `pnpm lingo:n8n` |
| Follow-ups (every 15 min) and number health (every 6 h) | n8n `n8n/feeder-lingo-followups.json` |
| Seller panel | `apps/panels/app/feeder/(app)/lingo` (Dashboard, Inbox, Orders, Products, FAQs, Ads, Messages & buttons, Test bot, Settings, WhatsApp) |
| Admin | admin.retexia.com → Products → Feeder → **Lingo** tab |
| Tests | `node scripts/test-lingo.mjs` (part of `pnpm db:test`): every Code node runs in order against the real SQL, with two sellers |

Sellers' WhatsApp tokens and app secrets are kept in **Supabase Vault**. Only the service role can read them, through `lingo.bot_number()`. They never reach the browser or n8n credentials.

## 1. Supabase

1. Run `0037_feeder_lingo.sql` in the SQL editor. It is safe to run again.
2. In **Settings → API → Exposed schemas**, include `lingo` and `feeder`.
3. Check **Products → Feeder → Lingo** in admin: the Gemini prices and the shared content for each Feeder product. The migration copies the best existing Lingo product into shared content, and adds starter FAQs built from the usage and precautions text.

## 2. n8n (self-hosted)

1. Set the server env var `NODE_FUNCTION_ALLOW_BUILTIN=crypto`. Without it, the signature check can't run.
2. Create three **Header Auth** credentials:

| Credential name | Header | Value |
|---|---|---|
| Supabase service key (Lingo) | `apikey` | the Supabase service_role (secret) key |
| Gemini API key | `x-goog-api-key` | Retexia's Gemini key (paid tier) |
| Retexia key (Lingo) | `X-Retexia-Key` | a long random value, also used as `FEEDER_LINGO_N8N_KEY` on Vercel |

3. Import both workflows. In each **Config** node, set `SUPABASE_URL`. On each node with a credential warning, pick the credential.
4. Activate both workflows.
5. Copy these two **Production URLs**:
   - **WhatsApp Webhook** (…/webhook/feeder-lingo): sellers paste it into their Meta app.
   - **Panel: Lingo** (…/webhook/feeder-lingo-panel): the panel calls it.

## 3. Vercel (panels)

```
FEEDER_LINGO_N8N_URL=<Panel: Lingo production URL>
FEEDER_LINGO_N8N_KEY=<the Retexia key (Lingo) value>
FEEDER_LINGO_WEBHOOK_URL=<WhatsApp Webhook production URL>
```

Redeploy panels and admin.

## 4. Each seller (they do this in Lingo → WhatsApp)

1. Create a Meta Business app and add WhatsApp.
2. Create a System User token with `whatsapp_business_messaging` and `whatsapp_business_management`.
3. Paste the Phone number ID, WABA ID, token and **App secret** into Lingo.
4. Press **Test connection**.
5. Paste the Callback URL and Verify token into Meta, then subscribe to `messages` (and `smb_message_echoes` if they also reply from the WhatsApp Business app).
6. Send a test message.
7. Switch Lingo on.

Before step 1, sellers can try everything in the **Test bot**.

## Price and cost

- **Price:** LKR 4,900 / month for any number of chats.
- **AI allowance:** each seller gets **US$8** a month (`bot_sellers.ai_monthly_budget_usd`; change it per seller in admin). That is about 2,000–5,000 chats with Gemini 3.5 Flash-Lite at $0.30 / $2.50 per million tokens.
- **At 80%:** the seller sees a warning.
- **At 100%: degrade mode.** Fixed texts, quick rules, FAQs and saved answers keep working. Other questions go to the seller's Inbox. Retexia's AI cost per seller therefore can't exceed the allowance.
- **WhatsApp fees:** Meta bills these to the seller's own WhatsApp account. Chats that start from a Click-to-WhatsApp ad are free for up to 7 days, and the first 1,000 service messages a month are free.

## Not built yet (phase 2)

- Embedded Signup ("Connect WhatsApp" button). It needs Retexia's Meta Tech Provider approval.
- Chat import and FAQ mining (Batch API).
- The eval runner, and blocking prompt changes when accuracy drops. 👎 corrections are already saved as eval cases.
- The global n8n error workflow and the daily admin email digest. The admin tab already shows the weekly report and problems.
- Email or web-push alerts to sellers. The Inbox badge exists now.
- Feeder status sync back. Feeder has no API, so sellers set dispatched / delivered / returned on Orders.
