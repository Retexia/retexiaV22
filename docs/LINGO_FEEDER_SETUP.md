# Lingo Feeder: going live

Lingo Feeder (feeder.retexia.com/lingo-feeder) is the WhatsApp sales assistant for Feeder sellers. It replaces the test version "Feeder → Lingo" (migration 0037), and has its own Supabase schema, `lingo_feeder`, so it is never mixed up with the Lingo product (lingo.retexia.com, schema `lingo`).

| Part | Where |
|---|---|
| Database | `supabase/migrations/0039_lingo_feeder.sql` (tables, functions, settings, texts) and `0040_lingo_feeder_catalog.sql` (170 products) |
| Engine | n8n: `n8n/lingo-feeder.json` (chats) and `n8n/lingo-feeder-followups.json` (follow-ups, number health) |
| Seller panel | feeder.retexia.com/lingo-feeder: Home · Chats · Orders · Products · Business details · WhatsApp · Try Lingo |
| Admin | admin.retexia.com → Products → Feeder → **Lingo Feeder**: profit, price check, models, AI prices, catalogue |
| Settings sellers don't see | Supabase → Table editor → `lingo_feeder.settings` |

## 1. Supabase

1. SQL editor: run `0039_lingo_feeder.sql`.
   - It moves your seller account and WhatsApp number (the Vault token and app secret too) from the 0037 test version.
   - It deletes the test version's chats, orders, FAQs and quick rules.
   - It renames the package to **Lingo Feeder** (slug `lingo-feeder`, LKR 5,900 a month / 59,000 a year, 7 days free).
2. Run `0040_lingo_feeder_catalog.sql` (the product catalogue). If the SQL editor says the file is too big, skip it and upload the CSV instead in admin → Lingo Feeder → Product catalogue.
3. Settings → Data API → **Exposed schemas**: add `lingo_feeder`.

## 2. n8n

1. Deactivate the two old "Retexia — Feeder Lingo" workflows.
2. Import `n8n/lingo-feeder.json` and `n8n/lingo-feeder-followups.json`.
3. Credentials (all Header Auth):

| Credential | Header name | Value |
|---|---|---|
| Supabase service key (Lingo Feeder) | `apikey` | the Supabase service_role / secret key (you can reuse the old one) |
| OpenAI API key (Lingo Feeder) | `Authorization` | `Bearer sk-…` (an OpenAI API key with credit) |
| Gemini API key | `x-goog-api-key` | your Gemini key (voice notes, photos, and the backup when OpenAI fails) |
| Retexia key (Lingo Feeder) | `X-Retexia-Key` | a long random value, the same as `LINGO_FEEDER_N8N_KEY` on Vercel |

Pick them in these nodes:

| Node | Credential |
|---|---|
| Every Supabase call (Number, Gate, Claim Batch, Save Turn, …) | Supabase |
| OpenAI: Brain, AI: Ad Match | OpenAI |
| Gemini: Brain, Gemini: Media | Gemini |
| Panel: Lingo Feeder (webhook) | Retexia key |

4. In the **Config** node of both workflows, set `SUPABASE_URL`, then activate both workflows.

## 3. Meta (your test number)

The webhook path changed. In your Meta app → WhatsApp → Configuration → Webhook → Edit:
- Callback URL: the **Production URL** of the *WhatsApp Webhook* node (it ends in `/webhook/lingo-feeder`).
- Verify token: unchanged. The panel shows it under WhatsApp.
- Keep the **messages** subscription (and **smb_message_echoes** if you also reply from the WhatsApp Business app).

## 4. Vercel (apps/panels)

```
LINGO_FEEDER_N8N_URL=<the "Panel: Lingo Feeder" webhook production URL>
LINGO_FEEDER_N8N_KEY=<the Retexia key value>
LINGO_FEEDER_WEBHOOK_URL=<the "WhatsApp Webhook" production URL>
```

The old `FEEDER_LINGO_*` names still work. Redeploy **panels** and **admin**.

## 5. The order form (WhatsApp Flows)

1. Run `0041_lingo_feeder_order_form.sql` in Supabase. If you ever run 0039 again, run 0041 after it.
2. Re-import `n8n/lingo-feeder.json`. It adds the nodes *Form Setup?*, *Build Flow*, *Can Create?* and *WA: Create Flow*. Give WA: Create Flow no credential: it uses the seller's own token.
3. Panel → WhatsApp → **WhatsApp order form** → **Create the order form**. It is created and published in the seller's own WhatsApp Business Account, so the WhatsApp Business Account ID must be saved and the token needs `whatsapp_business_management`.
4. From then on, 🛒 Order opens the form inside WhatsApp:
   - name and phone are already filled in
   - the customer adds the address, a second number if they want, and picks the quantity (with totals)
   - after "Send order", Lingo sends the summary to confirm
5. Customers can still type their details. If WhatsApp rejects the form, the panel shows its message and Lingo keeps using the typed details.
6. The Flow JSON version is in `lingo_feeder.settings` → `flow` (`json_version` 7.0). If WhatsApp says the version is not supported, change it there and press Create again.

## 6. Check

1. Admin → Lingo Feeder:
   - Set "1 US$ in rupees", your monthly fixed costs (n8n server, Supabase share) and the payment fee.
   - Press **Check photos**. The Gastric Care photo link in the CSV returns an error, so it gets removed until you upload the file again.
2. Panel → Business details: the shop name, town and call hours.
3. Panel → Try Lingo: tap the buttons, write in Sinhala, Singlish and English.
4. From a real phone: tap your ad (or send "Hello! Can I get more info on this?").

## What sellers can't see (lingo_feeder.settings)

| Key | What it is |
|---|---|
| `ai` | Models: brain `gpt-5.4-mini`, cheap `gpt-5.4-nano`, ad_match `gpt-5.4-nano`, media and fallback `gemini-3.5-flash-lite`; `openai_reasoning` none; `gemini_thinking` minimal. Also editable in admin. |
| `allowance` | US$10 per seller per month at full AI. After that the cheap model, up to 2× the allowance. After that, fixed texts only, and unclear questions go to "Call them". |
| `money` | Exchange rate, fixed costs, payment fee and target margin, for the profit report. |
| `timing` | Wait 8 s to batch messages. After 3 h quiet: "Stopped replying" and one follow-up (08:00–21:00, inside 24 h). Lingo stays quiet 12 h after the seller replies. |
| `texts` | Every fixed message and button label in Sinhala, Singlish and English. |
| `banned` | Phrases Lingo must never send. |
| `lingo_style` | Extra lines for Lingo's way of talking (applies to every seller). |

Edit the JSON; the next message uses it. Product knowledge lives in `lingo_feeder.products`. To add a product's FAQs, put them in `faqs`: `[{"q": "…", "a": "…"}]`.
