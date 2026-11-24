# Lingo Feeder: what it costs and what to charge (Nov 2026)

## AI prices used (US$ per 1M tokens)

| Model | Job | Input | Cached input | Output |
|---|---|---|---|---|
| gpt-5.4-mini | the conversation ("brain") | 0.75 | 0.075 | 4.50 |
| gpt-5.4-nano | ad matching, and after the allowance | 0.20 | 0.02 | 1.25 |
| gemini-3.5-flash-lite | voice notes, photos, backup | 0.30 (audio 0.30) | 0.03 | 2.50 |

These come from third-party price lists. Check them against openai.com/api/pricing and ai.google.dev/pricing, and edit them in admin; every cost is worked out from that table.

## Why Gemini seemed to burn credit, and what's different now

| Before (0037 test version) | Now |
|---|---|
| Two AI calls for almost every message (read it, then write the answer) | One call that reads and answers |
| Plus summary calls | No separate summary calls |
| Thinking / reasoning not set, so hidden "thinking" tokens could be billed as output | Hidden reasoning is off (`reasoning_effort: none`, Gemini `thinkingLevel: minimal`) and output is capped |
| A Sinhala answer is many tokens | Unchanged |
| — | Lingo's long instructions are identical in every call, so OpenAI bills them at the cached price (10%) |

Also, most messages now need **no AI at all**:
- the ad's pre-filled message
- lead forms
- the details form filled in
- button taps
- price, delivery and "how do I order"
- quantities, yes / no

Every call is logged with its tokens and cost (`lingo_feeder.ai_usage`), so admin shows the real cost per seller and per chat.

## Cost per chat (estimate until there is real data)

| Step | Estimate |
|---|---|
| One AI turn | ~2,400 input tokens (~1,600 cached) + ~150 output ≈ **US$0.0014** (first turn of a product ≈ US$0.0025) |
| AI turns per chat | From your exported chats: ~1.8 customer messages per chat, and most first messages are the ad text or a lead form. That gives **~0.8–1.2 AI turns per chat**. |
| Voice notes / photos | ~4% of messages, ≈ US$0.0004 each |
| Ad matching | Once per new ad (≈ US$0.001) |
| **Planning figure** | **US$0.003 per chat** (≈ Rs. 0.9 at Rs. 300 / US$). Admin switches to the measured figure after 20 real chats. |

| Chats a month | AI cost |
|---|---|
| 1,000 (≈ 33 a day) | US$3 ≈ Rs. 900 |
| 3,000 (≈ 100 a day) | US$9 ≈ Rs. 2,700 |
| Ceiling | US$10 at full AI. Then the cheaper model (≈ 4× cheaper) up to US$20. Then fixed texts only. No seller can cost more than ≈ Rs. 6,000 a month, and reaching that takes well over 10,000 chats. |

WhatsApp fees are paid by each seller to Meta on their own account, and chats from Click-to-WhatsApp ads are free, so they are not a Retexia cost.

## The price: LKR 5,900 / month (59,000 / year), 7 days free

Assumed fixed costs: Rs. 9,000 a month (n8n server, Supabase share), shared by the sellers; 3% payment fee.

| Seller | At Rs. 4,900 | At **Rs. 5,900** |
|---|---|---|
| Typical: 1,000 chats, 10 sellers sharing costs | profit ≈ Rs. 2,950 (60%) | profit ≈ **Rs. 3,900 (66%)** |
| Heavy: 3,000 chats | profit ≈ Rs. 1,150 (23%) | profit ≈ **Rs. 2,100 (36%)** |
| Early days: 3 sellers, fixed costs Rs. 3,000 each, 1,000 chats | profit ≈ Rs. 850 | profit ≈ **Rs. 1,820** |

Rs. 5,900 keeps a profit on every realistic seller, including early on and if the dollar or AI prices move. For the seller it is still far cheaper than one staff member, and in the exported chats 82 of 103 customers on one number never got an answer: one extra order a day pays for it.

## Tracking it

Admin → Products → Feeder → **Lingo Feeder** shows, for this month (and last month's profit):
- money in (confirmed payments for the package) and MRR
- AI cost per seller, by provider (OpenAI / Gemini) and by task
- cost per chat
- profit per seller and in total
- a price check: the price for your target margin, and break-even for the heaviest possible seller

Change the exchange rate, fixed costs, payment fee or target margin there, and the numbers update.
