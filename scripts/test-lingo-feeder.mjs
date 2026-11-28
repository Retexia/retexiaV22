// Lingo Feeder end to end: every n8n Code node (n8n/lingo-feeder/src) in workflow order against the REAL
// SQL (migrations 0039 + 0040 in PGlite), with OpenAI, Gemini and WhatsApp mocked. Two sellers.
//
//   node scripts/test-lingo-feeder.mjs
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createHarness, migration, seed } from "./lib/harness.mjs";
import { createPipeline } from "./lib/lingo-feeder-pipeline.mjs";

const { db, ok, expectError, as, summary } = await createHarness();
await db.exec(migration);
await db.exec(seed);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const rpc = async (fn, p) => (await as("service_role", null, `select lingo_feeder.${fn}($1::jsonb) as r`, [JSON.stringify(p)])).rows[0].r;

// Package rows need the Feeder product: add it and run 0039 again (it must be safe to re-run).
await q(`insert into public.products (slug, code, name, short_name, status) values ('feeder', 'FDR', 'Retexia Feeder', 'Feeder', 'live') on conflict (slug) do nothing`);
await db.exec(readFileSync(new URL("../supabase/migrations/0039_lingo_feeder.sql", import.meta.url), "utf8"));
await db.exec(readFileSync(new URL("../supabase/migrations/0042_lingo_feeder_details_voice.sql", import.meta.url), "utf8"));
await db.exec(readFileSync(new URL("../supabase/migrations/0043_lingo_feeder_human.sql", import.meta.url), "utf8"));
await db.exec(readFileSync(new URL("../supabase/migrations/0051_lingo_feeder_win_back_phone_orders.sql", import.meta.url), "utf8"));
// Follow-ups at any hour in tests.
await q(`update lingo_feeder.settings set value = value || '{"followup_from": 0, "followup_to": 24}' where key = 'timing'`);

// ---------- fake AI ----------
let brainNext = [], openaiDown = false, adNext = 0, mediaNext = "", seenReq = [];
const oaiUsage = (i = 2400, o = 120, cached = 1600) => ({ prompt_tokens: i, completion_tokens: o, total_tokens: i + o, prompt_tokens_details: { cached_tokens: cached }, completion_tokens_details: { reasoning_tokens: 0 } });
const BLANK = { intent: "chat", product_id: 0, name: "", address: "", phone: "", phone2: "", qty: 0, reply: "", needs_human: false, lang: "si", memo: "" };
const ai = {
  async openai(req, task) {
    seenReq.push({ provider: "openai", task, req });
    if (task === "ad_match") return { choices: [{ message: { content: JSON.stringify({ p: adNext }) } }], usage: oaiUsage(3800, 8, 0) };
    if (openaiDown) return { error: { message: "Rate limit reached", type: "rate_limit" } };
    const next = brainNext.shift() ?? {};
    return { choices: [{ message: { content: JSON.stringify({ ...BLANK, ...next }) } }], usage: oaiUsage() };
  },
  async gemini(model, req, task) {
    seenReq.push({ provider: "gemini", task, model, req });
    if (task === "media") return { candidates: [{ content: { parts: [{ text: mediaNext }] } }], usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 30, promptTokensDetails: [{ modality: "AUDIO", tokenCount: 640 }] } };
    const next = brainNext.shift() ?? {};
    return { candidates: [{ content: { parts: [{ text: JSON.stringify({ ...BLANK, ...next }) }] } }], usageMetadata: { promptTokenCount: 2500, candidatesTokenCount: 140, thoughtsTokenCount: 20 } };
  },
};
const sentToWa = [];
const pipe = createPipeline({ rpc, ai, wa: (body) => { sentToWa.push(body); return { messages: [{ id: "wamid.OUT" + sentToWa.length }] }; } });

// ---------- sellers, catalogue, numbers ----------
const user = async (email) => (await one(`insert into auth.users (email) values ($1) returning id`, [email])).id;
const A = await user("amaya@example.com");
const Bu = await user("kasun@example.com");

console.log("Lingo Feeder: catalogue, package, sellers");
ok((await one(`select count(*)::int n from lingo_feeder.products`)).n === 170, "the catalogue has the 170 products from the CSV (0040)");
ok((await one(`select count(*)::int n from lingo_feeder.products where long_description like '%{price}%' and long_description like '%{delivery_fee}%'`)).n === 170, "every description shows the seller's own price ({price}, {delivery_fee})");
const pkg = await one(`select k.name, k.price_monthly::int m, k.price_yearly::int y from public.packages k join public.products p on p.id = k.product_id where p.slug = 'feeder' and k.slug = 'lingo-feeder'`);
ok(pkg && pkg.name === "Lingo Feeder" && pkg.m === 5900 && pkg.y === 59000, "package Lingo Feeder: LKR 5,900 a month, 59,000 a year");
ok(!(await one(`select to_regclass('lingo.bot_sellers') t`)).t, "the 0037 test tables are gone (lingo schema is the Lingo product's again)");
await q(`select lingo_feeder.ensure_seller($1, 'Amaya Herbals')`, [A]);
await q(`select lingo_feeder.ensure_seller($1, 'Kasun Stores')`, [Bu]);
await q(`select lingo_feeder.ensure_seller($1, 'other name')`, [A]);
ok((await one(`select business_name from lingo_feeder.sellers where user_id = $1`, [A])).business_name === "Amaya Herbals", "one seller per Retexia account (ensure_seller keeps the first)");
await q(`update lingo_feeder.sellers set location = 'Matara', phone = '0771112233', delivery_days = '2-3', call_hours = '9am - 6pm', status = 'live'`);

const GASTRIC = 517;
const PIC = (await one(`select product_id from lingo_feeder.products where picture_url is not null order by product_id limit 1`)).product_id;
const BEARD = (await one(`select product_id from lingo_feeder.products where name ilike '%beard growth spray%'`)).product_id;
await q(`insert into feeder.products (product_id, product_name, price, delivery_fee) values ($1, 'Gastric', 1340, 450) on conflict do nothing`, [GASTRIC]);
await q(`insert into lingo_feeder.seller_products (user_id, product_id, price) values ($1, $2, 1490)`, [A, BEARD]);
const cat = Object.fromEntries((await q(`select id, price::float, delivery_fee::float, total::float, enabled from lingo_feeder.catalog($1)`, [A])).map((r) => [r.id, r]));
ok(cat[GASTRIC].price === 1340 && cat[GASTRIC].total === 1790, "price and delivery: Feeder catalogue (1,340 + 450 = 1,790)");
ok(cat[BEARD].price === 1490, "…or the seller's own price");
ok((await q(`select lingo_feeder.match_products($1, 'බඩ දැවිල්ලට බෙහෙත් ඕන', 3) m`, [A]))[0].m[0].id === GASTRIC, "a product is found from a Sinhala alias");

const SECRET = { [A]: "app-secret-amaya", [Bu]: "app-secret-kasun" };
const PNID = { [A]: "1110001", [Bu]: "1110002" };
let saved = await rpc("save_number", { user_id: A, phone_number_id: PNID[A], waba_id: "2220001", token: "EAAtokenAmaya1234", app_secret: SECRET[A] });
ok(saved.ok && saved.verify_token?.length >= 20, "a WhatsApp number is saved with its own verify token");
await rpc("save_number", { user_id: Bu, phone_number_id: PNID[Bu], token: "EAAtokenKasun9876", app_secret: SECRET[Bu] });
ok((await rpc("save_number", { user_id: Bu, phone_number_id: PNID[A] })).error === "taken", "one number belongs to one seller");
ok((await one(`select token_last4 from lingo_feeder.numbers where user_id = $1`, [A])).token_last4 === "1234", "only the last 4 characters of the token are kept outside Vault");
ok((await rpc("bot_verify_token", { token: saved.verify_token })).ok === true && (await rpc("bot_verify_token", { token: "nope" })).ok === false, "Meta's webhook check accepts only a real verify token");
await q(`update lingo_feeder.numbers set status = 'connected'`);

console.log("Lingo Feeder: tenant isolation (RLS)");
ok((await as("authenticated", A, `select user_id from lingo_feeder.sellers`)).rows.length === 1, "a seller sees only their own account");
await expectError(() => as("authenticated", A, `select token_secret_id from lingo_feeder.numbers`), "nobody reads the Vault ids from the browser", /permission denied/);
await expectError(() => as("authenticated", A, `update lingo_feeder.sellers set ai_budget_usd = 999`), "sellers can't raise their own AI allowance", /permission denied/);
await expectError(() => as("authenticated", A, `select lingo_feeder.bot_number('{"phone_number_id": "1110001"}'::jsonb)`), "the engine functions are for the service role only", /permission denied/);
await expectError(() => as("authenticated", A, `select * from lingo_feeder.settings`), "sellers can't read the settings (models, prompts, money)", /permission denied/);

// ---------- WhatsApp webhooks ----------
let n = 0;
const names = {};
const wh = (seller, from, msg, name = null, referral = null) => {
  name = names[from] = name || names[from] || "Saman Perera";
  const body = { object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { display_phone_number: "94110000000", phone_number_id: PNID[seller] },
    contacts: [{ profile: { name }, wa_id: from }],
    messages: [{ from, id: "wamid.IN" + ++n, timestamp: String(1800000000 + n), ...msg, ...(referral ? { referral } : {}) }] } }] }] };
  const sig = "sha256=" + createHmac("sha256", SECRET[seller]).update(JSON.stringify(body)).digest("hex");
  return pipe.webhook(body, sig);
};
const text = (body) => ({ type: "text", text: { body } });
const tap = (id, title = id) => ({ type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } } });
const listTap = (id, title = id) => ({ type: "interactive", interactive: { type: "list_reply", list_reply: { id, title } } });
const chatRow = (seller, phone) => one(`select * from lingo_feeder.chats where user_id = $1 and phone = $2`, [seller, phone]);
const bodies = (r) => (r.outs || []).map((o) => o.text).join("\n---\n");
const AD = { source_id: "ad-gastric-1", source_type: "ad", source_url: "https://fb.me/x", headline: "Ayora Ayurvedic Gastric Care Tablets 🌿", body: "ගැස්ට්‍රයිටිස්, බඩ දැවිල්ල සඳහා" };

console.log("Lingo Feeder: an ad click → photo + description, then the greeting (no AI)");
const C1 = "94771234567";
let r = await wh(A, C1, text("Hello! Can I get more info on this?"), "Saman Perera", AD);
ok(r.calls.openai === 0 && r.calls.ad === 0, "the ad's own words name the product: no AI at all");
ok((await one(`select product_id, matched_by from lingo_feeder.ads where ad_id = 'ad-gastric-1'`)).matched_by === "text", "the ad is saved as the Gastric Care ad (found from its text)");
ok(r.outs.length === 2 && r.outs[0].text.includes("1,340") && !r.outs[0].text.includes("{price}"), "message 1: the full description with the seller's price");
ok(r.outs[1].kind === "buttons" && /Saman/.test(r.outs[1].text) && /Lingo/.test(r.outs[1].text) && r.outs[1].text.includes("Amaya Herbals") && r.outs[1].text.includes("1,790") && r.outs[1].text.includes("👤 නම"),
  "message 2: greeting with their name, Lingo, the shop, the total and the details form");
ok(/^(Good (morning|afternoon|evening)|Hi) Saman/.test(r.outs[1].text), "…starting with Good morning / afternoon / evening in English, like Sri Lankans greet");
ok(!r.outs.some((o) => o.body.context), "the ad's pre-filled first message isn't quoted");
ok(JSON.stringify(r.outs[1].body.interactive.action.buttons.map((b) => b.reply.id)) === '["ORDER","USAGE","CALL"]', "…with 🛒 Order · 📖 How to use · 📞 Call me buttons");
let c = await chatRow(A, C1);
ok(c.status === "new" && c.awaiting === "details" && c.product_id === GASTRIC, "status: only clicked the ad (said nothing yet)");

console.log("Lingo Feeder: details → summary → confirm → thank-you + how to use");
r = await wh(A, C1, text("👤 නම : Saman Perera\n🏠 ලිපිනය : 23, Galle Road,\nMatara\n📞 දුරකථන අංකය : 077 123 4567 / 0712223344"));
ok(r.calls.openai === 0, "our filled-in form is read in code (no AI)");
ok(r.outs[0].kind === "buttons" && r.outs[0].text.includes("23, Galle Road, Matara") && r.outs[0].text.includes("0771234567 / 0712223344"), "the summary: address on several lines, both phone numbers");
ok(JSON.stringify(r.outs[0].body.interactive.action.buttons.map((b) => b.reply.id)) === '["CONFIRM","CHANGE","CANCEL"]', "…with ✅ Confirm · ✏️ Change · ❌ Cancel");
ok(r.outs[0].body.context?.message_id?.startsWith("wamid.IN"), "…as a reply quoting the customer's message");
ok(r.outs.at(-1).kind === "reaction" && r.outs.at(-1).body.reaction.emoji === "👍", "…and a 👍 reaction on their details");
const draft = await one(`select * from lingo_feeder.orders where user_id = $1 and phone = $2`, [A, C1]);
ok(draft.status === "draft" && Number(draft.total) === 1790 && draft.product_name.includes("Gastric"), "a draft order, total from the database (not the AI)");
ok((await chatRow(A, C1)).status === "ordering", "status: giving order details");
r = await wh(A, C1, tap("CONFIRM", "✅ Confirm"));
ok(r.outs[0].text.includes("Saman") && r.outs[0].text.includes("2-3") && r.outs[0].text.startsWith("❤️"), "thank-you with their first name and delivery days");
ok(r.outs.at(-1).kind === "reaction" && r.outs.at(-1).body.reaction.emoji === "❤️" && !r.outs.some((o) => o.body.reaction?.emoji === "🙏"), "…a ❤️ reaction on the confirmation (never 🙏)");
const sug = r.outs.find((o) => /ගැනත් විස්තර/.test(o.text));
ok(r.claim.related ? sug && !sug.body.interactive && Array.from(sug.text).length < 120 : !sug, "…a short, no-button suggestion only when a related product exists");
ok(r.outs[1].text.includes("භාවිතා කරන හැටි") && r.outs[1].text.includes("⚠️"), "…then how to use the product (+ precautions) as its own message");
c = await chatRow(A, C1);
ok(c.status === "ordered" && c.details.address === "23, Galle Road, Matara", "status: ordered; their details are kept for the next order");
ok((await one(`select status, confirmed_at is not null as at from lingo_feeder.orders where id = $1`, [draft.id])).at, "the order is confirmed");

console.log("Lingo Feeder: quick answers (no AI), in the customer's style");
r = await wh(A, C1, text("Kiyd?"));
ok(r.calls.openai === 0 && r.outs[0].text.includes("Rs. 1,340/-") && r.outs[0].text.includes("Total Rs. 1,790"), "\"Kiyd?\" → the price, in Singlish");
r = await wh(A, C1, text("Dawas kiyak yanawada"));
ok(r.calls.openai === 0 && r.outs[0].text.includes("dawas 2-3"), "\"Dawas kiyak yanawada\" → delivery days, in Singlish");
r = await wh(A, C1, text("How much is it?"));
ok(r.outs[0].text.includes("Price Rs. 1,340"), "English → English");
r = await wh(A, C1, text("thanks"));
ok(r.outs[0].text.includes("Thank you Saman") || r.outs[0].text.includes("Saman"), "thanks after an order → a short thank-you with their name");

console.log("Lingo Feeder: the AI (OpenAI) for real questions, checked before sending");
brainNext = [{ intent: "question", reply: "Kiri dena ammala nam bonna kalin doctor kenekgen ahala balanna dr 🙏", lang: "sg", memo: "Ordered gastric; asked about breastfeeding" }];
r = await wh(A, C1, text("kiri dena ammala ta puluwanda?"));
const brainReq = seenReq.filter((x) => x.task === "brain").pop().req;
ok(r.calls.openai === 1 && r.outs[0].text.startsWith("Kiri dena ammala"), "a real question → one OpenAI call, the answer is sent");
ok(brainReq.messages[0].content.includes("You are Lingo") && brainReq.messages[1].content.includes("How to use") && !brainReq.messages[1].content.includes("Beard"),
  "the AI sees Lingo's instructions and only this chat's product (not the catalogue)");
ok(brainReq.reasoning_effort === "none" && brainReq.prompt_cache_key === `lingo-feeder-p${GASTRIC}` && brainReq.response_format.json_schema.strict === true,
  "no hidden reasoning tokens, a cache key per product, strict JSON");
const use = await one(`select provider, model, tokens_in, tokens_cached, cost_usd::float c from lingo_feeder.ai_usage where task = 'brain' order by id desc limit 1`);
ok(use.provider === "openai" && use.model === "gpt-5.4-mini" && Math.abs(use.c - ((800 * 0.75 + 1600 * 0.075 + 120 * 4.5) / 1e6)) < 1e-9, "its cost is logged (cached input at the cached price)");
ok((await chatRow(A, C1)).memo.includes("breastfeeding"), "the AI keeps a short memo of the chat");

brainNext = [{ intent: "question", reply: "Meka 100% cure ekak dr, kisima athuru abadayak na", lang: "sg" }];
r = await wh(A, C1, text("meka hodata wada karanawada?"));
ok(r.outs[0].text.includes("office eken ahala") && (await chatRow(A, C1)).needs_call, "a banned claim is never sent: \"I'll check\" + call them");
await q(`update lingo_feeder.chats set needs_call = false, call_reason = null where phone = $1`, [C1]);
brainNext = [{ intent: "question", reply: "Dawas 14kin hoda wenawa dr 😊", lang: "sg" }];
r = await wh(A, C1, text("kochchara kalayakin hoda wenawada"));
ok(r.outs[0].text.includes("office eken ahala") && /number not in the facts/.test((await chatRow(A, C1)).call_reason), "a number that isn't in the facts is never sent");
await q(`update lingo_feeder.chats set needs_call = false, call_reason = null where phone = $1`, [C1]);

openaiDown = true;
brainNext = [{ intent: "question", reply: "Ow dr, sugar thiyena ayata doctor ge ahala balanna 🙏", lang: "sg" }];
r = await wh(A, C1, text("sugar thiyena ayata puluwanda"));
openaiDown = false;
ok(r.calls.openai === 1 && r.calls.gemini === 1 && r.outs[0].text.includes("doctor"), "OpenAI down → Gemini answers instead");
ok((await one(`select count(*)::int n from lingo_feeder.events where type = 'ai_failed'`)).n === 1, "…and the OpenAI failure is logged for admin");

console.log("Lingo Feeder: another product in the same chat, a second order with the same details");
brainNext = [{ intent: "other_product", product_id: BEARD, reply: "", lang: "sg" }];
r = await wh(A, C1, text("beard growth spray ekath thiyenawada?"));
ok(r.outs[0].text.includes("1,490") && r.outs[r.outs.length - 1].kind === "buttons", "Lingo switches to the beard spray: its description (seller's price) + an Order button");
r = await wh(A, C1, tap("ORDER", "🛒 Order karanna"));
ok(r.outs[0].kind === "buttons" && r.outs[0].text.includes("23, Galle Road, Matara") && r.outs[0].body.interactive.action.buttons[0].reply.id === "SAME", "Order → \"same details as last time?\"");
r = await wh(A, C1, tap("SAME", "✅ Ow, ekatama"));
ok(r.outs[0].text.includes("Beard") && r.outs[0].text.includes("1,940"), "…yes → summary for the beard spray (1,490 + 450)");
r = await wh(A, C1, tap("CONFIRM"));
ok((await one(`select count(*)::int n from lingo_feeder.orders where user_id = $1 and phone = $2 and status = 'confirmed'`, [A, C1])).n === 2, "one customer, two orders");

console.log("Lingo Feeder: quantity list, change, cancel");
const C2 = "94770000002";
r = await wh(A, C2, text("Hello! Can I get more info on this?"), "Nimal", AD);
r = await wh(A, C2, tap("ORDER"));
ok(r.outs[0].kind === "list" && r.outs[0].body.interactive.action.sections[0].rows.length === 5 && r.outs[0].body.interactive.action.sections[0].rows[1].description.includes("3,130"),
  "Order → a list to choose how many (2 = Rs. 3,130 with one delivery)");
r = await wh(A, C2, listTap("QTY_2", "දෙකක්"));
ok(r.outs[0].text.includes("👤 නම") && (await chatRow(A, C2)).awaiting === "details", "…then the details form");
r = await wh(A, C2, text("Nimal Silva\nNo 5, Temple Road, Kandy\n0712345678"));
ok(r.calls.openai === 0 && r.outs[0].text.includes("× 2") && r.outs[0].text.includes("3,130"), "plain lines are read in code; summary with 2 and the right total");
r = await wh(A, C2, tap("CHANGE"));
ok(r.outs[0].kind === "list" && r.outs[0].body.interactive.action.sections[0].rows.map((x) => x.id).join() === "CH_NAME,CH_ADDRESS,CH_PHONE,CH_QTY", "Change → choose what to change");
r = await wh(A, C2, listTap("CH_ADDRESS"));
r = await wh(A, C2, text("No 7, Lake Road, Kandy"));
ok(r.outs[0].text.includes("No 7, Lake Road, Kandy") && r.outs[0].kind === "buttons", "the new address → a new summary");
r = await wh(A, C2, tap("CANCEL"));
c = await chatRow(A, C2);
ok(c.status === "cancelled" && (await one(`select status from lingo_feeder.orders where phone = $1`, [C2])).status === "cancelled", "Cancel → order and chat cancelled");

console.log("Lingo Feeder: lead forms, call me, complaints, spam");
const C3 = "94770000003";
r = await wh(A, C3, text("Hello! I filled out your form. Here's my information:\n\nStreet address: 12/3, Main Street, Galle\nFull name: Kamala Jayasinghe\nPhone number: +94 77 888 9999"), "Kamala", AD);
ok(r.calls.openai === 0 && r.outs.filter((o) => o.kind !== "reaction").length === 2 && r.outs[1].text.includes("Kamala") && r.outs[1].text.includes("12/3, Main Street, Galle") && r.outs[1].text.includes("Confirm"),
  "a lead form: photo, then hello + summary in one message (no AI)");
ok((await chatRow(A, C3)).status === "ordering", "…status: giving details");
r = await wh(A, C3, tap("CALL", "📞 Mata call karanna"));
c = await chatRow(A, C3);
ok(c.needs_call && c.call_reason === "Asked for a call" && r.outs[0].text.includes("9am - 6pm"), "Call me → \"call them\" for the seller, with the call hours");
brainNext = [{ intent: "complaint", needs_human: true, lang: "sg" }];
const C4 = "94770000004";
await wh(A, C4, text("Hello! Can I get more info on this?"), "Ruwan", AD);
r = await wh(A, C4, text("mage order eka thama awe nahane, courier eken call kale na"));
c = await chatRow(A, C4);
ok(c.needs_call && c.paused_until && r.outs[0].text.includes("team"), "a complaint → apology, call them, Lingo steps back");
r = await wh(A, C4, text("hello?"));
ok(r.stopped === "paused", "…and stays quiet in that chat while the seller handles it");
const C5 = "94770000005";
r = await wh(A, C5, text("මට රු. 5,000 ලැබුණා! https://free-cash.buzz/claim"), "Promo");
ok(!r.outs.length && (await chatRow(A, C5)).status === "spam", "a spam link gets no answer and status spam");
ok((await wh(A, C5, text("hi"))).stopped === "spam", "…later messages from it are ignored too");

console.log("Lingo Feeder: unknown ads, voice notes, photos");
const C6 = "94770000006";
adNext = BEARD;
r = await wh(A, C6, text("Hello! Can I get more info on this?"), "Dilan", { source_id: "ad-x", source_type: "ad", headline: "රැවුල හොඳට වැවෙන්න 🔥", body: "Limited offer" });
ok(r.calls.ad === 1 && (await one(`select matched_by, product_id from lingo_feeder.ads where ad_id = 'ad-x'`)).product_id === BEARD, "an ad its words don't name → one small AI call finds the product, saved");
r = await wh(A, "94770000007", text("Hello! Can I get more info on this?"), "Isuru", { source_id: "ad-x", source_type: "ad", headline: "රැවුල හොඳට වැවෙන්න 🔥" });
ok(r.calls.ad === 0 && r.outs[0].text.includes("1,490"), "the next customer from that ad: no AI");
mediaNext = "මට ගැස්ට්‍රයිටිස් තියෙනවා, මේක බොන්න පුළුවන්ද";
brainNext = [{ intent: "question", reply: "ඔව් 😊 දිනකට පෙති 1-2ක් ගන්න පුළුවන්. වෙනත් බෙහෙත් බොනවා නම් doctor ගෙන් අහලා බලන්න 🙏", lang: "si" }];
r = await wh(A, C1, { type: "audio", audio: { id: "media-1", mime_type: "audio/ogg; codecs=opus" } });
ok(r.calls.media === 1 && r.claim.msgs[0].t.startsWith("[voice]") && r.outs[0].text.startsWith("ඔව්"), "a voice note → Gemini writes it down → Lingo answers it");
const mediaReq = seenReq.find((x) => x.task === "media");
ok(mediaReq.req.generationConfig.thinkingConfig.thinkingLevel === "minimal" && mediaReq.model === "gemini-3.5-flash" && mediaReq.req.generationConfig.temperature === 0,
  "voice notes: Gemini 3.5 Flash (clearer Sinhala), minimal thinking, no guessing");
ok(/English letters/.test(mediaReq.req.systemInstruction.parts[0].text) && mediaReq.req.systemInstruction.parts[0].text.includes("The chat is about this product: Ayora"),
  "…told to write English words (diabetes, order) in English letters, with the chat's product as a hint");
const mu = await one(`select provider, tokens_audio from lingo_feeder.ai_usage where task = 'media'`);
ok(mu.provider === "gemini" && mu.tokens_audio === 640, "the voice note's audio tokens are logged and priced");

console.log("Lingo Feeder: checking the order details (phone, address), never asking twice");
const D1 = "94770000011";
await wh(A, D1, text("Hello! Can I get more info on this?"), "Chamari", AD);
r = await wh(A, D1, text("👤 නම : Chamari Silva\n🏠 ලිපිනය : 45/2, Lake Road, Kurunegala"));
ok(r.outs[0].kind === "buttons" && r.outs[0].text.includes("077 000 0011") && r.outs[0].body.interactive.action.buttons.map((b) => b.reply.id).join() === "USE_WA,OTHER_PHONE",
  "no phone number → \"shall I use this WhatsApp number (077 000 0011)?\" with Yes / Another number");
ok((await chatRow(A, D1)).awaiting === "phone" && !(await one(`select phone1 from lingo_feeder.orders where phone = $1`, [D1])).phone1, "…the WhatsApp number isn't used without asking");
r = await wh(A, D1, text("ow"));
ok(r.outs[0].text.includes("0770000011") && r.outs[0].text.includes("Confirm"), "\"ow\" → that number goes in the summary");
const D2 = "94770000012";
await wh(A, D2, text("Hello! Can I get more info on this?"), "Pradeep", AD);
r = await wh(A, D2, text("👤 නම : Pradeep\n🏠 ලිපිනය : 12, Station Road, Gampaha"));
r = await wh(A, D2, tap("OTHER_PHONE", "📞 වෙන number එකක්"));
ok(r.outs[0].text.includes("phone number") && (await chatRow(A, D2)).awaiting === "field_phone", "Another number → asks for it");
r = await wh(A, D2, text("077 12345"));
ok(r.calls.openai === 0 && r.outs[0].text.includes("07712345") && r.outs[0].text.includes("10"), "a number that's too short → Lingo says it isn't a full number (no AI)");
r = await wh(A, D2, text("0712345678"));
ok(r.outs[0].text.includes("0712345678") && r.outs[0].text.includes("Confirm"), "…then the right one → summary");
const D3 = "94770000013";
await wh(A, D3, text("Hello! Can I get more info on this?"), "Nuwan", AD);
r = await wh(A, D3, text("👤 නම : Nuwan Perera\n🏠 ලිපිනය : Matara\n📞 දුරකථන අංකය : 0771239876"));
ok(r.outs[0].text.includes("\"Matara\"") && r.outs[0].text.includes("ලිපිනය") && (await chatRow(A, D3)).awaiting === "field_address", "only a town as the address → asks for the full home or work address");
r = await wh(A, D3, text("No 8, Beach Road, Matara"));
ok(r.outs[0].text.includes("No 8, Beach Road, Matara") && r.outs[0].text.includes("Confirm"), "…the full address → summary");
brainNext = [{ intent: "details", reply: "", lang: "sg" }, { intent: "details", reply: "", lang: "sg" }];
const D4 = "94770000014";
await wh(A, D4, text("Hello! Can I get more info on this?"), "Ruwani", AD);
r = await wh(A, D4, tap("ORDER"));
r = await wh(A, D4, listTap("QTY_1", "එකක්"));
const firstAsk = r.outs[0].text;
r = await wh(A, D4, text("hari mama ewannam"));
ok(r.outs[0].text !== firstAsk, "an empty \"details\" reading from the AI never re-sends the same request");
r = await wh(A, D4, text("👤 නම :"));
r = await wh(A, D4, text("👤 නම :"));
ok((await chatRow(A, D4)).needs_call || r.outs.some((o) => /call/i.test(o.text)), "asked for the same details again and again → Lingo offers a call, then the chat goes to Call them");
const D5 = "94771234567";   // C1: has an order with saved details
r = await wh(A, D5, tap("ORDER"));
r = await wh(A, D5, tap("NEW", "📝 Aluth details"));
r = await wh(A, D5, text("na ektama danna"));
ok(r.outs[0].text.includes("23, Galle Road, Matara") && r.outs[0].text.includes("Confirm"), "\"na ektama danna\" / \"kalin dunna details walatama\" → the saved details, straight to the summary");
r = await wh(A, D5, tap("CANCEL"));

brainNext = [{ intent: "question", reply: "ඔව් ඩිabetes තියෙන අයට පුළුවන් 😊", lang: "si" }];
r = await wh(A, "94770000011", text("ඥායබෙටීස් තියෙන අයට පුළුවන්ද"));
ok(!r.outs.some((o) => o.text.includes("ඩිabetes")), "an AI answer with Sinhala and English letters mixed in one word is never sent");

brainNext = [{ intent: "question", lang: "sg", reply: "Ow dr, meka hama dawasema kaala passe bonna puluwan 😊 Pethi 1-2k ganna one, wathura ekka. Mulin doctor kenekgen ahala balanna eka hodai, wena beheth bonawa nam." }];
r = await wh(A, "94770000011", text("meka bonne kohomada kiyala kiyannako"));
const parts = r.outs.filter((o) => o.kind === "text" || o.kind === "buttons");
ok(parts.length >= 2 && parts.every((o) => Array.from(o.text).length < 140), "a long AI answer goes as 2-3 short messages, like people text");
ok(parts[0].body.context?.message_id && !parts[1].body.context, "…the first one replies to (quotes) the customer's message");

console.log("Lingo Feeder: a product named only in words (no ad)");
const DIAB = (await one(`select product_id from lingo_feeder.products where name ilike '%diabetic%' order by product_id limit 1`)).product_id;
brainNext = [{ intent: "question", product_id: DIAB, reply: "Ow dr, sugar ekata ape Diabetic Care Tablet eka thiyenawa 😊", lang: "sg" }];
r = await wh(A, "94770000015", text("sugar walata beheth thiyenawada oyala gawa"), "Sunil");
const catReq = seenReq.filter((x) => x.task === "brain").pop().req;
ok(catReq.messages[1].content.includes("OUR PRODUCTS") && catReq.messages[1].content.includes(`${DIAB}: `), "no ad, no product yet → the AI gets the short product list");
ok(r.outs.some((o) => o.kind === "image" || o.text.includes("Diabetic")) && (await chatRow(A, "94770000015")).product_id === DIAB, "…picks the diabetes product → its photo + description");

console.log("Lingo Feeder: AI allowance → lighter model → fixed texts only");
await q(`insert into lingo_feeder.ai_usage (user_id, task, provider, model, cost_usd) values ($1, 'brain', 'openai', 'gpt-5.4-mini', 1)`, [A]);
await q(`update lingo_feeder.sellers set ai_budget_usd = 0.9 where user_id = $1`, [A]);
brainNext = [{ intent: "question", reply: "Ow dr 😊", lang: "sg" }];
r = await wh(A, C1, text("meka original da"));
ok(seenReq.filter((x) => x.task === "brain").pop().req.model === "gpt-5.4-nano", "over the allowance → the cheaper model");
await q(`update lingo_feeder.sellers set ai_budget_usd = 0.4 where user_id = $1`, [A]);
const before = seenReq.length;
r = await wh(A, C1, text("meka kohenda hadanne"));
ok(seenReq.length === before && r.outs[0].text.includes("office") && (await chatRow(A, C1)).needs_call, "over 2× → no AI; \"I'll check\" and call them");
ok((await one(`select count(*)::int n from lingo_feeder.events where type = 'allowance_used'`)).n === 1, "the allowance being used up is noted once a month (admin)");
await q(`update lingo_feeder.sellers set ai_budget_usd = null, budget_note_at = null where user_id = $1`, [A]);
await q(`update lingo_feeder.chats set needs_call = false where phone = $1`, [C1]);

console.log("Lingo Feeder: statuses, follow-ups, echoes, delivery statuses");
await q(`update lingo_feeder.chats set last_msg_at = now() - interval '4 hours', last_out_at = now() - interval '4 hours', last_in_at = now() - interval '4 hours 1 minute' where phone in ($1, $2)`, ["94770000007", C3]);
await q(`update lingo_feeder.chats set status = 'asking' where phone = $1`, ["94770000007"]);
const fu = await rpc("bot_due_followups", {});
ok((await chatRow(A, "94770000007")).status === "no_reply", "quiet after Lingo spoke → \"stopped replying\"");
const item = fu.items.find((x) => x.to === "94770000007");
ok(item && item.text.startsWith("Isuru 😊") && item.button === "🛒 ඕඩර් කරන්න" && item.token === "EAAtokenAmaya1234", "one follow-up with their name and a 🛒 Order button, sent with the seller's token");
ok(!fu.items.some((x) => x.to === C3), "no follow-up to a chat that is waiting for a call");
ok((await rpc("bot_due_followups", {})).items.length === 0, "never twice for the same silence");
await rpc("bot_echo", { user_id: A, items: [{ to: C2, id: "wamid.ECHO1", text: "Hari sir, mama call karannam" }] });
ok((await chatRow(A, C2)).paused_until, "the seller answers from the WhatsApp Business app → Lingo pauses in that chat");
const out1 = (await one(`select wa_id from lingo_feeder.messages where role = 'b' and wa_id is not null order by id limit 1`)).wa_id;
await rpc("bot_statuses", { user_id: A, statuses: [{ id: out1, status: "read" }, { id: out1, status: "delivered" }] });
ok((await one(`select status from lingo_feeder.messages where wa_id = $1`, [out1])).status === "read", "delivery statuses: read is never downgraded");
const imgMsg = await one(`select wa_id, meta->>'image' as image from lingo_feeder.messages where kind = 'image' and wa_id is not null order by id limit 1`);
await rpc("bot_statuses", { user_id: A, statuses: [{ id: imgMsg.wa_id, status: "failed", error: "131053 Media upload error: could not download the image" }] });
ok(!(await one(`select count(*)::int n from lingo_feeder.products where picture_url = $1`, [imgMsg.image])).n, "a product photo WhatsApp can't fetch is dropped (the description goes as text next time)");

console.log("Lingo Feeder: tenant isolation in the engine, Try Lingo, the panel");
r = await wh(Bu, C1, text("Hello! Can I get more info on this?"), "Saman", AD);
ok((await one(`select count(*)::int n from lingo_feeder.chats where phone = $1`, [C1])).n === 2 && r.outs[1].text.includes("Kasun Stores"), "the same customer on another seller's number is a separate chat, with that shop's name");
ok((await one(`select product_id from lingo_feeder.ads where user_id = $1 and ad_id = 'ad-gastric-1'`, [Bu])).product_id === GASTRIC, "ads are per seller");
r = await pipe.panel({ action: "test_bot", user_id: A, session: "s1", text: "Hello! Can I get more info on this?", start_product: PIC });
ok(r.test.ok && r.test.messages.length === 2 && r.test.messages[0].kind === "image" && r.test.status === "new", "Try Lingo: the photo + greeting, nothing sent to WhatsApp");
ok((await one(`select test from lingo_feeder.chats where phone = 'test-s1'`)).test, "test chats are marked test");
const home = (await as("service_role", null, `select lingo_feeder.panel_home($1) r`, [A])).rows[0].r;
ok(home.statuses.ordered >= 1 && home.statuses.cancelled === 1 && home.statuses.spam === 1 && home.call >= 1 && !home.statuses.undefined, "Home counts every status (no test chats)");
const calls = (await as("service_role", null, `select lingo_feeder.panel_chats($1, 'call', null, 50) r`, [A])).rows[0].r;
ok(calls.length >= 1 && calls.every((x) => x.needs_call), "Chats → Call them lists only chats that need a call");
const search = (await as("service_role", null, `select lingo_feeder.panel_chats($1, 'all', 'Kamala', 50) r`, [A])).rows[0].r;
ok(search.length === 1 && search[0].phone === C3, "search by name");
ok(sentToWa.every((b) => b.messaging_product === "whatsapp" && (b.type !== "interactive" || b.interactive.body.text.length <= 1024)), "every WhatsApp message is valid (bodies within limits)");
ok(sentToWa.filter((b) => b.type === "interactive" && b.interactive.type === "button").every((b) => b.interactive.action.buttons.every((x) => Array.from(x.reply.title).length <= 20)), "button titles fit WhatsApp's 20 characters");


console.log("Lingo Feeder: a customer who backs off hears once why it suits them");
const C9 = "94779990001";
await wh(A, C9, text("Hello! Can I get more info on this?"), "Kamal Silva", AD);
brainNext = [{ ...BLANK, intent: "not_interested", lang: "sg", memo: "Has gastritis for years; says too expensive", reply: "Therenawa dr 😊 Oyage gastric ekata meka godak udaw wei. Badu gedarata awama thamai gewanne. Order karannada?" }];
r = await wh(A, C9, text("Ganan wadi, passe balannam"));
ok(r.outs[0].kind === "buttons" && /udaw wei/.test(r.outs[0].text) && JSON.stringify(r.outs[0].body.interactive.action.buttons.map((b) => b.reply.id)) === '["ORDER","CALL"]', "the first no: why it suits them, pay at the door, with 🛒 Order and 📞 Call buttons");
ok((await chatRow(A, C9)).status !== "not_interested", "…and the chat isn't marked not interested yet");
brainNext = [{ ...BLANK, intent: "not_interested", lang: "sg", reply: "Ane meka gannako, godak hondai!" }];
r = await wh(A, C9, text("Na epa"));
ok(r.outs[0].kind === "text" && !/gannako/.test(r.outs[0].text) && (await chatRow(A, C9)).status === "not_interested", "the second no is accepted kindly (no more selling)");

console.log("Lingo Feeder: the seller takes the order by phone");
const po = (await as("service_role", null, `select lingo_feeder.panel_add_order($1, $2::jsonb) r`, [A, JSON.stringify({ phone: C9, product_id: GASTRIC, qty: 2, name: "Kamal Silva", address: "12, Temple Road, Galle", phone1: "0779990001" })])).rows[0].r;
ok(po.ok && po.window_open && /Kamal/.test(po.message) && po.message.includes("12, Temple Road, Galle") && po.message.includes("× 2") && !/\{/.test(po.message), "it's saved, and the thank-you message has their details filled in (in their language)");
const pord = await one(`select status, qty, total::float, product_id from lingo_feeder.orders where id = $1`, [po.order_id]);
ok(pord.status === "confirmed" && pord.qty === 2 && pord.total === cat[GASTRIC].price * 2 + cat[GASTRIC].delivery_fee, "a confirmed order with the seller's price × qty + delivery");
const pc = await chatRow(A, C9);
ok(pc.status === "ordered" && pc.details.address === "12, Temple Road, Galle" && !pc.needs_call, "the chat is ordered, with their details for next time");
ok(!(await as("service_role", null, `select lingo_feeder.panel_add_order($1, $2::jsonb) r`, [A, JSON.stringify({ phone: C9, product_id: GASTRIC, qty: 1, name: "", address: "x", phone1: "" })])).rows[0].r.ok, "missing details are refused");
ok(!(await as("service_role", null, `select lingo_feeder.panel_add_order($1, $2::jsonb) r`, [Bu, JSON.stringify({ phone: C9, product_id: GASTRIC, qty: 1, name: "X Y", address: "Somewhere 1", phone1: "0771234567" })])).rows[0].r.ok, "another seller can't add an order to this chat");


console.log("Lingo Feeder: sells like a person (the side-effects chat that lost an order)");
const G = "94788000001";
await wh(A, G, text("Hello! Can I get more info on this?"), "Gayani", AD);
brainNext = [{ ...BLANK, intent: "question", lang: "si", needs_human: true, memo: "Asked side effects",
  reply: "සමහර අයාලට බඩේ අපහසුතාවය වෙන්න පුළුවන් dr 🙏 හැබැයි ඒ ගැන මේ product facts වල සඳහන් නැති නිසා මම හරියටම කියන්න බෑ. 100% ආයුර්වේද ඖෂධ වලින් හදපු නිසා දිනකට පෙති 1-2ක් ගත්තම ඔයාට ගැටලුවක් වෙන්නේ නෑ 😊" }];
r = await wh(A, G, text("අතුරු ආබාධ නැන්ද"));
const gt = bodies(r);
ok(!/facts|සඳහන් නැති|කියන්න බෑ/.test(gt) && /ආයුර්වේද/.test(gt), "never 'facts' or 'I can't say': only the confident, true part is sent");
ok(!/🙏/.test(gt) && !/(^|\s)dr(\s|$)/.test(gt), "no 🙏, and no 'dr' inside Sinhala script");
ok(!(await chatRow(A, G)).needs_call, "…and the shop isn't asked to call just because a detail isn't in the product's details");
brainNext = [{ ...BLANK, intent: "question", lang: "si", reply: "100% ආයුර්වේද ඖෂධ වලින් හදපු නිසා දිනකට පෙති 1-2ක් ගත්තම ඔයාට ගැටලුවක් වෙන්නේ නෑ 😊 ගැබිනි මව්වරු doctor ගෙන් අහලා පාවිච්චි කරන්න." }];
r = await wh(A, G, text("ඇයි ඒ"));
ok(!bodies(r).includes("ගැටලුවක් වෙන්නේ නෑ") && bodies(r).includes("ගැබිනි"), "a sentence she already sent is never sent again");
brainNext = [{ ...BLANK, intent: "want_order", lang: "si", reply: "ඔව් 😊 ආයුර්වේද නිසා බය වෙන්න දෙයක් නෑ." }];
r = await wh(A, G, text("මට ගන්න උවමනයි side effect ගැන කියන්න පුලුවන් නම් තවත් හොදයි"));
ok(/බය වෙන්න දෙයක් නෑ/.test(bodies(r)) && (await chatRow(A, G)).awaiting !== null, "'I want to buy, tell me about side effects': answered, and straight to the order");
const G2 = "94788000002";
await wh(A, G2, text("Hello! Can I get more info on this?"), "Nadee", AD);
brainNext = [{ ...BLANK, intent: "question", lang: "si", reply: "ඔව් 😊 ගැස්ට්‍රයිටිස්, බඩ දැවිල්ලට හොඳයි." }];
r = await wh(A, G2, text("ගැස්ට්‍රයිටිස් වලට හොඳද"));
await q(`update lingo_feeder.chats set awaiting = null where user_id = $1 and phone = $2`, [A, G2]);
brainNext = [{ ...BLANK, intent: "chat", lang: "si" }];
r = await wh(A, G2, text("Ok"));
ok(r.outs.length > 0 && (await chatRow(A, G2)).awaiting === "details", "'Ok' right after the order offer starts the order (never silence)");

console.log("Lingo Feeder: profit report");
const pkgId = (await one(`select k.id from public.packages k join public.products p on p.id = k.product_id where p.slug = 'feeder' and k.slug = 'lingo-feeder'`)).id;
const prodId = (await one(`select id from public.products where slug = 'feeder'`)).id;
const ord = (await one(`insert into public.orders (user_id, product_id, package_id, status, price_amount, billing_cycle) values ($1, $2, $3, 'active', 5900, 'monthly') returning id`, [A, prodId, pkgId])).id;
await q(`insert into public.payments (order_id, user_id, kind, amount, status, paid_at) values ($1, $2, 'subscription', 5900, 'confirmed', now())`, [ord, A]);
const profit = (await as("service_role", null, `select lingo_feeder.admin_profit(null) r`)).rows[0].r;
const pa = profit.sellers.find((s) => s.user_id === A);
ok(pa && pa.paid_lkr === 5900 && pa.mrr_lkr === 5900 && pa.ai_usd > 0 && pa.ai_by_provider.openai > 0 && pa.ai_by_provider.gemini > 0, "admin profit: money in, AI cost by provider, per seller");
ok(profit.usd_to_lkr === 300 && profit.price.monthly == 5900, "…with the exchange rate and the package price");
ok(existsSync(new URL("../n8n/lingo-feeder.json", import.meta.url)) && JSON.parse(readFileSync(new URL("../n8n/lingo-feeder.json", import.meta.url), "utf8")).nodes.length > 60, "the n8n workflow is built");

summary();
