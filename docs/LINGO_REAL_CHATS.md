# What real customers send: how Lingo Feeder was tuned (Nov 2026)

Source: two WhatsApp shop numbers (Ayora products), 13–24 Nov 2026, exported from Evolution.

| | |
|---|---|
| Chats | 261 |
| Messages | 872 |
| Images | 32 unique |
| Voice notes | 36 (not transcribed, see the last section) |

Customer names, phones and addresses are not copied here.

## What happens today

- **82 of 103 chats on the first number were never answered.** That includes all 71 Meta *lead-form* messages: "Hello! I filled out your form… Street address / Full name / Phone number". The full order is already in the message, but nobody replied.
- **On the second number, 38 of 158 chats were never answered.**
- **Replies come slowly.** Usually after 1–10 hours, and overnight leads wait until about 9 AM. Lingo answers in about 12 seconds, day and night.
- **Templates go out twice.** The same long product template is often sent twice, plus the price twice, in one reply.
- **Some answers are risky for a health product:**
  - "kisima athuruabadayak na" (no side effects at all)
  - "ow" when asked about thyroxine users
  - no answer for breastfeeding mothers, although the bottle label says *pregnant or breastfeeding: consult a doctor first*

## What customers actually write

| Intent | Real wording (typos kept) | Lingo now |
|---|---|---|
| Ad opener | සෙමට පාවිච්චි කරන බෙහෙත් එකක් ගෙන්න ගන්න පුලුවන්ද ? · Mata beheth eka genna ganna puluwanda | Photo + description, then the greeting with the details form, **0 AI** |
| Price | ඩිලිවරි ගාස්තුව එක්ක මුළු ගාන කියද ? · Kiyd · Keyada · Kiyda · Gana kiyada · How much · Me priceda · මිල ගනන් කොහොමද | Quick rule → price text with the total, **0 AI** |
| Delivery / days | Dilewary · Dilivery gasthu kiyada · Dawas kiyak yanawada · Kawada wage ganna puluwan | Quick rule → delivery text, **0 AI** |
| How to order | ඔඩර් එකක් දාන්නේ කොහොමද ? · Oder ekak danne kohomada | Quick rule → 👤 නම / 🏠 ලිපිනය / 📞 අංකය, **0 AI** |
| Wants one / two | Mata akak awanna puluwada · Matath ekak oni · Fatburn eken dekak evanna · 2 bottles | Quick rule or small AI (quantity) |
| Lead form | Hello! I filled in/out your form… (also the Sinhala "මා ඔබේ පෝරමය පුරවා…") | **Read in code**: name, address and phone → straight to the order summary |
| Details in free text | Name / phone / address in one message, in any order | Small AI extracts the fields |
| Safety | Kiri dena kenekta puluwanda · Thyroxin පාවිච්චි කරන අයට · Podi ayata hodaida · ගැස්ට්‍රයිටිස් තියෙන අයට | FAQ, or AI from the product's precautions; never "no side effects" |
| Where / who | Nishpadithaya koheda · Food city wala thiyenawada · Speed post eke ewanne nedda · මාතර කොහෙද ගන්න තියෙන්නේ | "Shop" text (online only, courier to the door) |
| Several products, one delivery | Me thunama ekama order ekak widiyata… delivery 450 witharada | Goes to you (orders with several products come later) |
| Order not received | Thama awe nahane · Mage odr eka enne kawadda · courier eken call kale na | Complaint → your Inbox |
| Quality complaint | "wathura goda wage… pena naginne na" | Complaint → your Inbox |
| Scam links | "මට රු. 5,000 ලැබුණා… https://…buzz" | Ignore. Never answer or open them. |

## How the staff really write (now Lingo's voice)

- Very short Singlish: "ok dr" · "hri miss mn oder eka dannm" · "dws 2-3 athara gnna pluwan dr" · "ow dr enna kalin call ekak dei".
- They call customers **dr**, **miss** or **sir**.
- They use a warm emoji at the end.
- Formal Sinhala is kept for the product descriptions, not for chat.

Lingo's instructions (n8n/lingo-feeder/src/persona.js) and every fixed text (lingo_feeder.settings → texts, in Sinhala, Singlish and English) are written this way. Extra style lines for every seller: lingo_feeder.settings → lingo_style.

## FAQs to add (Supabase → lingo_feeder.products → faqs, on the sema guli product)

The answers say only what the label and the shop's own answers say. Add them as `[{"q": "…", "a": "…"}]`.

| Question (short English) | Answer (Sinhala) |
|---|---|
| How do I use it? | දිනකට දෙවරක්, උදේ සහ රෑ කෑමෙන් පස්සේ මද උණුසුම් වතුර එක්ක ගුලියක් බැගින් 😊 |
| How many balls are in a bottle? | බෝතලයක ගුලි 60ක් තියෙනවා, දවසට 2ක් නම් මාසයකට ඇති. |
| Can pregnant or breastfeeding women use it? | ගර්භනී හෝ කිරිදෙන අම්මලා නම් පාවිච්චි කරන්න කලින් වෛද්‍ය උපදෙස් ගන්න dr 🙏 |
| Can I take it with other medicines (e.g. thyroxine)? | වෙනත් බෙහෙත් බොනවා නම් මුලින්ම ඔයාගේ doctor ගෙන් අහලා බලන්න dr 🙏 |
| Is it good for children? | අපි recommend කරන්නේ අවුරුදු 10ට වැඩි අයට විතරයි dr. |
| Where is it made? | Everspice Ceylon (Pvt) Ltd, පිළියන්දල. ආයුර්වේද ලියාපදිංචි අංකය තියෙනවා. |
| Is it in shops (Food City)? | කඩවල නෑ dr, online විතරයි. ගෙදරටම courier එකෙන් එවනවා 🚚 |
| Can several products come in one delivery? | ඔව් dr, එක ඕඩර් එකක් විදිහට එවන්න පුළුවන්, delivery එක විතරයි එකතු වෙන්නේ. |

## Voice notes

36 voice notes (customers and staff, 1–67 s) were not transcribed. This Mac has no speech-to-text, and Sinhala needs Gemini (or a downloaded Whisper model, which handles Sinhala poorly). In production Lingo Feeder turns each voice note into text with Gemini (good with Sinhala voice), then answers it.
