// Feeder → Lingo end to end: every n8n Code node (n8n/lingo/src) in workflow order against the REAL
// SQL (migration 0037 in PGlite), with Gemini and WhatsApp mocked. Two sellers at the same time.
//
//   node scripts/test-lingo.mjs
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHarness, migration, seed } from "./lib/harness.mjs";

const require = createRequire(import.meta.url);
const { db, ok, expectError, as, summary } = await createHarness();
await db.exec(migration);
await db.exec(seed);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const rpc = async (fn, p) => (await as("service_role", null, `select lingo.${fn}($1::jsonb) as r`, [JSON.stringify(p)])).rows[0].r;

// ---------- Code-node runner ($input, $(), this.helpers, require) ----------
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const src = (f) => readFileSync(new URL(`../n8n/lingo/src/${f}`, import.meta.url), "utf8");
const node = (items, executed = true) => {
  const arr = (Array.isArray(items) ? items : [items]).map((j) => ({ json: j }));
  return { first: () => arr[0], all: () => arr, isExecuted: executed };
};
async function run(file, input, nodes, helpers = {}) {
  const $input = node(input);
  const $ = (name) => nodes[name] ?? { isExecuted: false, first: () => { throw new Error(`node not executed: ${name}`); }, all: () => [] };
  const out = await new AsyncFunction("$input", "$", "require", src(file)).call({ helpers }, $input, $, require);
  return out.map((i) => i.json);
}
const usage = (i, o) => ({ promptTokenCount: i, candidatesTokenCount: o, totalTokenCount: i + o });
const gem = (obj, u = usage(500, 40)) => ({ candidates: [{ content: { parts: [{ text: typeof obj === "string" ? obj : JSON.stringify(obj) }] } }], usageMetadata: u });

const cfg = { SUPABASE_URL: "x", GRAPH_VERSION: "v25.0", MODEL_FAST: "gemini-3.5-flash-lite", MODEL_REPLY: "gemini-3.5-flash-lite", REPLY_THINKING: "", TAP_WAIT_SECONDS: 2, HISTORY_LIMIT: 5, KEEP_LAST: 2, RETEXIA_APP_SECRET: "EDIT" };
const calls = { classify: 0, reply: 0, ad: 0, media: 0, summary: 0 };
let n = 0, outId = 0;

// ---------- sellers, products, numbers ----------
const user = async (email) => (await one(`insert into auth.users (email) values ($1) returning id`, [email])).id;
const amaya = await user("amaya@example.com");
const kasun = await user("kasun@example.com");
await q(`insert into feeder.products (product_id, product_name, price, delivery_fee) values
  (9001, 'Ayora Cholesterol Care Tablet', 1340, 450), (9002, 'Ayora Beard Growth Spray', 1490, 450), (9003, 'Ayora Diabetic Care Tablet', 1340, 450)`);
await q(`insert into lingo.product_content (product_id_feeder, short_description, long_description, application, precautions, symptoms, aliases, picture_url) values
  (9001, 'Cholesterol control', 'Ayora Cholesterol Care 🌿 රු. {price} + delivery රු. {delivery_fee}', 'දිනකට පෙති 2ක් කෑමෙන් පසු.', 'වෙනත් ඖෂධ ගන්නා අය වෛද්‍ය උපදෙස් ලබාගන්න.', 'cholesterol,කොලෙස්ටරෝල්', 'cholesterol tablet', 'https://img.example/Cholesterol.jpg'),
  (9002, 'Beard growth', 'Ayora Beard Growth Spray 🧔', 'දිනකට දෙවරක් spray කරන්න.', 'ඇස්වලට නොයවන්න.', 'beard,රැවුල', 'beard spray', 'https://img.example/Beard.jpg'),
  (9003, 'Sugar control', 'Ayora Diabetic Care', 'දිනකට පෙති 2ක්.', 'ගැබිණි අයට නොවේ.', 'sugar,diabetes', 'diabetic', null)`);
// the starter FAQ seed runs with the migration; run it again now that there is content
await db.exec(readFileSync(new URL("../supabase/migrations/0037_feeder_lingo.sql", import.meta.url), "utf8"));

const A = await one(`select lingo.ensure_seller($1, 'Amaya Shop') as id`, [amaya]).then((r) => Number(r.id));
const B = await one(`select lingo.ensure_seller($1, 'Kasun Stores') as id`, [kasun]).then((r) => Number(r.id));
await q(`insert into feeder.customers (user_id, name) values ($1, 'Amaya'), ($2, 'Kasun')`, [amaya, kasun]);
await q(`insert into feeder.customer_products (user_id, product_id, price) values ($1, 9001, null), ($1, 9002, 1590), ($1, 9003, null), ($2, 9001, null)`, [amaya, kasun]);

console.log("Lingo: sellers and products (0037)");
ok((await one(`select lingo.ensure_seller($1, 'x') as id`, [amaya])).id == A, "one seller per Retexia account (ensure_seller is idempotent)");
ok((await one(`select lingo.sync_feeder_products($1) as n`, [A])).n === 3 && (await one(`select lingo.sync_feeder_products($1) as n`, [A])).n === 0, "My products become Lingo products once");
await q(`select lingo.sync_feeder_products($1)`, [B]);
const pA = Object.fromEntries((await q(`select feeder_id, id, price::float, delivery_fee::float, image_url, usage from lingo.lingo_products where lingo_user_id = $1`, [A])).map((r) => [r.feeder_id, r]));
ok(pA[9001].price === 1340 && pA[9001].delivery_fee === 450, "price and delivery come from Feeder");
ok(pA[9002].price === 1590, "…or the seller's own price in My products");
ok(pA[9001].image_url === "https://img.example/Cholesterol.jpg" && pA[9001].usage.startsWith("දිනකට"), "photo and content come from the shared product content");
await q(`update lingo.products set application = 'Seller: 1 tablet a day' where id = $1`, [pA[9003].id]);
ok((await one(`select usage from lingo.lingo_products where id = $1`, [pA[9003].id])).usage === "Seller: 1 tablet a day", "a seller's own field wins over the shared one");
ok((await one(`select count(*)::int n from lingo.product_faqs where product_id_feeder = 9001 and source = 'starter'`)).n === 4, "starter FAQs from usage and precautions (4 for a product with both)");
const pB9001 = (await one(`select id from lingo.lingo_products where lingo_user_id = $1 and feeder_id = 9001`, [B])).id;

const faq = (await one(`insert into lingo.product_faqs (product_id_feeder, question_en, variants, answer_si, answer_en) values (9001, 'Can diabetics use it?', '{sugar thiyena}', 'ඔව්, දියවැඩියාව ඇති අයටත් පුළුවන්. වෛද්‍ය උපදෙස් ලබාගන්න 🙏', 'Yes, people with diabetes can use it. Please check with your doctor 🙏') returning id`)).id;

const SECRET_A = "app-secret-amaya", SECRET_B = "app-secret-kasun";
let saved = await rpc("save_wa_number", { lingo_user_id: A, phone_number_id: "1110001", waba_id: "2220001", token: "EAAtokenAmaya1234", app_secret: SECRET_A });
ok(saved.ok && saved.verify_token?.length >= 20, "a number is saved with its own verify token");
await rpc("save_wa_number", { lingo_user_id: B, phone_number_id: "1110002", token: "EAAtokenKasun9876", app_secret: SECRET_B });
ok((await rpc("save_wa_number", { lingo_user_id: B, phone_number_id: "1110001" })).error === "taken", "one number belongs to one seller");
ok((await one(`select token_last4, token_secret_id is not null as v from lingo.wa_numbers where lingo_user_id = $1`, [A])).token_last4 === "1234", "only the last 4 characters of the token are kept outside Vault");
ok((await rpc("bot_verify_token", { token: saved.verify_token })).ok === true && (await rpc("bot_verify_token", { token: "nope" })).ok === false, "Meta's webhook check accepts only a real verify token");
await q(`update lingo.bot_sellers set status = 'live'`);

console.log("Lingo: tenant isolation (RLS)");
ok((await as("authenticated", amaya, `select lingo_user_id from lingo.bot_sellers`)).rows.length === 1, "a seller sees only their own Lingo account");
await expectError(() => as("authenticated", amaya, `select token_secret_id from lingo.wa_numbers`), "nobody reads the Vault ids from the browser", /permission denied/);
await expectError(() => as("authenticated", amaya, `update lingo.bot_sellers set ai_monthly_budget_usd = 999`), "sellers can't raise their own AI allowance", /permission denied/);
await expectError(() => as("authenticated", amaya, `select lingo.bot_number('{"lingo_user_id": 1}'::jsonb)`), "the bot functions are for the service role only", /permission denied/);

// ---------- webhooks ----------
const PNID = { [A]: "1110001", [B]: "1110002" };
const SECRET = { [A]: SECRET_A, [B]: SECRET_B };
const wh = (seller, from, msg, name = "Saman") => ({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value: {
  messaging_product: "whatsapp", metadata: { display_phone_number: "94110000000", phone_number_id: PNID[seller] },
  contacts: [{ profile: { name }, wa_id: from }],
  messages: [{ from, id: "wamid.IN" + ++n, timestamp: String(1800000000 + n), ...msg }] } }] }] });
const text = (body, extra = {}) => ({ type: "text", text: { body }, ...extra });
const tapMsg = (id, title) => ({ type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } } });

async function pipeline(nodes, mocks) {
  const m = nodes.Message.first().json;
  const p = { lingo_user_id: m.lingo_user_id, phone: m.phone, wa_id: m.waId, name: m.name, referral: m.referral, test: m.test, start_product: m.start_product,
              text: m.media ? `[${m.media.kind === "audio" ? "voice note" : "image"}] ${m.text || ""}` : m.text };
  const gate = await rpc("bot_gate", p);
  nodes.Gate = node(gate);
  if (gate.status !== "ok") return { stopped: gate.status, gate };
  if (gate.need_ad_match) {
    calls.ad++;
    const [am] = await run("build_ad_match.js", gate, nodes);
    nodes["Build Ad Match"] = node(am);
    nodes["Gemini: Ad Match"] = node(gem({ p: mocks.adProduct || 0 }, usage(300, 5)));
    const [rd] = await run("read_ad_match.js", nodes["Gemini: Ad Match"].first().json, nodes);
    await rpc("bot_set_ad", rd.p);
  }
  if (m.media) {
    calls.media++;
    const [mr] = await run("build_media_request.js", {}, nodes, { getBinaryDataBuffer: async () => Buffer.from("OggS-fake-audio") });
    nodes["Build Media Request"] = node(mr);
    nodes["Gemini: Media"] = node(gem(mocks.mediaText || "", { promptTokenCount: 700, candidatesTokenCount: 30, promptTokensDetails: [{ modality: "AUDIO", tokenCount: 640 }] }));
    const [mt] = await run("media_to_text.js", nodes["Gemini: Media"].first().json, nodes);
    nodes["Media to Text"] = node(mt);
  }
  const [row] = await run("build_buffer_row.js", {}, nodes);
  const buf = await rpc("bot_buffer_add", row.p);
  nodes["Buffer Add"] = node(buf);
  const claim = await rpc("bot_claim", { lingo_user_id: m.lingo_user_id, phone: m.phone, buffer_id: buf.id });
  nodes["Claim Batch"] = node(claim);
  if (!claim.ok) return { stopped: claim.why };
  let summarized = false;
  if ((claim.history || []).length > cfg.HISTORY_LIMIT) {
    calls.summary++;
    const [sr] = await run("build_summary_request.js", {}, nodes);
    nodes["Build Summary Request"] = node(sr);
    nodes["Gemini: Summary"] = node(gem("Customer asked about the cholesterol tablet and is ordering.", usage(400, 20)));
    nodes["Save Summary"] = node(await rpc("bot_compact", { lingo_user_id: m.lingo_user_id, phone: m.phone, upto: sr.upto, summary: "Customer asked about the cholesterol tablet and is ordering." }));
    summarized = true;
  }
  const [und] = await run("understand.js", {}, nodes);
  nodes.Understand = node(und);
  if (!und.skip) { calls.classify++; nodes["Gemini: Classify"] = node(mocks.cls === "error" ? { error: { code: 500, message: "boom" } } : gem(mocks.cls || "broken", usage(600, 50))); }
  const [plan] = await run("plan_reply.js", {}, nodes);
  nodes["Plan Reply"] = node(plan);
  let final = plan;
  let cacheHit = false;
  if (plan.route === "ai") {
    const cache = await rpc("bot_cache_get", plan.cache);
    nodes["Cache Get"] = node(cache);
    cacheHit = cache.hit;
    if (!cache.hit && !plan.degrade) { calls.reply++; nodes["Gemini: Reply"] = node(gem(mocks.ai || { r: "" }, usage(450, 60))); }
    [final] = await run("compose_reply.js", {}, nodes);
    nodes["Compose Reply"] = node(final);
  }
  const out = await run("split_outgoing.js", final, nodes);
  nodes["Split Outgoing"] = node(out);
  const results = m.test ? out : out.map(() => ({ messaging_product: "whatsapp", messages: [{ id: "wamid.OUT" + ++outId }] }));
  const [st] = await run("build_save_turn.js", results, nodes);
  nodes["Build Save Turn"] = node(st);
  const savedTurn = await rpc("bot_save_turn", st.p);
  nodes["Save Turn"] = node(savedTurn);
  let test = null;
  if (m.test) [test] = await run("test_result.js", {}, nodes);
  return { gate, claim, und, plan, final, out, st, savedTurn, summarized, cacheHit, test };
}

async function turn(seller, from, msg, mocks = {}, opts = {}) {
  const body = wh(seller, from, msg, opts.name);
  const raw = JSON.stringify(body);
  const sig = "sha256=" + createHmac("sha256", opts.secret ?? SECRET[seller]).update(raw).digest("hex");
  const nodes = { Config: node(cfg) };
  const read = await run("read_webhook.js", { body, headers: { "x-hub-signature-256": sig } }, nodes, { getBinaryDataBuffer: async () => Buffer.from(raw) });
  if (!read.length) return { stopped: "no number" };
  nodes["Read Webhook"] = node(read[0]);
  const num = await rpc("bot_number", { phone_number_id: read[0].phone_number_id });
  nodes.Number = node(num);
  if (!num.ok) return { stopped: num.why };
  const vs = await run("verify_split.js", {}, nodes);
  if (!vs.length) return { stopped: "bad signature" };
  nodes["Verify & Split"] = node(vs[0]);
  if (vs[0].statuses.length) await rpc("bot_statuses", { lingo_user_id: num.lingo_user_id, statuses: vs[0].statuses });
  if (vs[0].echoes.length) await rpc("bot_echo", { lingo_user_id: num.lingo_user_id, items: vs[0].echoes });
  if (!vs[0].message) return { stopped: "no message", vs: vs[0] };
  const [msgItem] = await run("message.js", {}, nodes);
  nodes.Message = node(msgItem);
  return pipeline(nodes, mocks);
}
async function testBot(seller, body, mocks = {}) {
  const nodes = { Config: node(cfg), "Panel: Lingo": node({ body: { lingo_user_id: seller, ...body } }) };
  const [a] = await run("panel_action.js", {}, nodes);
  nodes["Panel Action"] = node(a);
  nodes.Seller = node(await rpc("bot_number", { lingo_user_id: seller }));
  const [msgItem] = await run("message.js", {}, nodes);
  nodes.Message = node(msgItem);
  return pipeline(nodes, mocks);
}
const bodyText = (o) => (o.body.type === "text" ? o.body.text.body : o.body.type === "image" ? o.body.image.caption : o.body.interactive.body.text);
const sql1 = async (s, p) => Object.values((await q(s, p))[0] ?? {})[0];

const C1 = "94771110001", C2 = "94771110002", C3 = "94771110003";
const ref = { source_id: "AD_CHOL", source_type: "ad", source_url: "https://fb.me/x", headline: "කොලෙස්ටරෝල් පාලනයට ස්වභාවික විසඳුමක්", body: "Ayora Cholesterol Care 🌿" };

console.log("Lingo: webhooks");
let r = await turn(A, "94779990000", text("hi"));
ok(r.stopped === "ignored" && calls.classify === 0, "a stranger who didn't come from an ad is ignored (no AI)");
r = await turn(A, C1, text("Hello! Can I get more info on this?", { referral: ref }), {}, { secret: "wrong" });
ok(r.stopped === "bad signature", "a webhook with a bad signature is refused");
{
  const raw = JSON.stringify({ entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "999999" }, messages: [] } }] }] });
  const nodes = { Config: node(cfg) };
  const [read] = await run("read_webhook.js", { body: JSON.parse(raw), headers: {} }, nodes, { getBinaryDataBuffer: async () => Buffer.from(raw) });
  ok((await rpc("bot_number", { phone_number_id: read.phone_number_id })).ok === false, "an unknown number is dropped");
  ok((await one(`select count(*)::int n from lingo.bot_events where type = 'unknown_number'`)).n === 1, "…and logged");
}

console.log("Lingo: the order flow (seller A)");
r = await turn(A, C1, text("Hello! Can I get more info on this?", { referral: ref }), { adProduct: pA[9001].id });
ok(calls.ad === 1 && calls.classify === 0, "a new ad is matched to its product once; the pre-filled message needs no middle AI (quick rule)");
ok(r.out.length === 2 && r.out[0].body.type === "image" && r.out[0].body.image.link.includes("Cholesterol"), "photo + long description first");
ok(r.out[0].body.image.caption.includes("1,340") && r.out[0].body.image.caption.includes("450"), "prices in the description come from the product row");
ok(bodyText(r.out[1]).includes("1️⃣ නම"), "then it asks for name, address and phone");
ok(r.st.p.route === "rule" && r.st.p.stage === "browsing", "route = rule (level 0), stage → browsing");

r = await turn(A, C1, text("kiyada?"));
ok(calls.classify === 0 && r.plan.route === "send" && bodyText(r.out[0]).includes("1,790"), '"kiyada?" → fixed price text with the database total (0 AI)');

const c0 = calls.classify, r0 = calls.reply;
r = await turn(A, C1, text("meka sugar thiyena ayata ganna puluwanda?"), { cls: { k: "question", t: "safety", faq: faq, p: 0, q: "can diabetics use it", l: "sg", o: {}, u: false } });
ok(calls.classify === c0 + 1 && calls.reply === r0, "an FAQ the middle AI picked is answered as written (no reply AI)");
ok(bodyText(r.out[0]).includes("දියවැඩියාව") && r.st.p.route === "faq", "route = faq");
ok((await one(`select hits from lingo.product_faqs where id = $1`, [faq])).hits === 1, "the FAQ's hits go up");

r = await turn(A, C1, text("mama pressure beheth bonawa, meka bonna puluwanda?"),
  { cls: { k: "question", t: "safety", faq: 0, p: 0, q: "can take with blood pressure medicine", l: "sg", o: {}, u: false },
    ai: { r: "Wena beheth bonawa nam, mulinma doctor kenekgen ahala balanna 🙏" } });
ok(r.plan.route === "ai" && calls.reply === r0 + 1, "a real product question with no FAQ → reply AI");
const aiPrompt = r.plan.req.contents[0].parts[0].text;
ok(aiPrompt.includes("වෙනත් ඖෂධ ගන්නා") && aiPrompt.includes("Singlish") && !aiPrompt.includes("Beard"), "…with only this product's safety facts, in Singlish");
ok(r.out.length === 1 && bodyText(r.out[0]).startsWith("Wena beheth") && bodyText(r.out[0]).includes("ලිපිනය"), "answer + order nudge merged into ONE WhatsApp message");
ok((await one(`select count(*)::int n from lingo.answer_cache`)).n === 1, "the checked answer is saved in the answer cache");

console.log("Lingo: second customer, same ad, same question");
const ad0 = calls.ad;
r = await turn(A, C2, text("Price eka kiyada?", { referral: ref }), { cls: { k: "question", t: "price", faq: 0, p: 0, q: "price", l: "sg", o: {}, u: false } });
ok(calls.ad === ad0 && r.out[0].body.type === "image" && r.out.length === 2, "the ad's product is known instantly (0 tokens); the price is in the photo text");
const rr = calls.reply;
r = await turn(A, C2, text("pressure beheth ekka bonna puluwanda?"), { cls: { k: "question", t: "safety", faq: 0, p: 0, q: "can take with blood pressure medicine", l: "sg", o: {}, u: false } });
ok(r.cacheHit && calls.reply === rr && r.st.p.route === "cache", "the same question → answer cache hit, no reply AI");
await q(`update lingo.product_content set precautions = precautions || ' (updated)' where product_id_feeder = 9001`);
r = await turn(A, C2, text("pressure beheth ekka puluwanda?"), { cls: { k: "question", t: "safety", faq: 0, p: 0, q: "can take with blood pressure medicine", l: "sg", o: {}, u: false }, ai: { r: "Doctor kenekgen ahala balanna 🙏" } });
ok(!r.cacheHit && calls.reply === rr + 1, "changing the product facts invalidates the cached answer");

console.log("Lingo: details → summary → confirm");
const dMsg = text("Saman Perera. me number ekama");
const before = calls.reply;
r = await turn(A, C1, dMsg, { cls: { k: "details", t: "other", faq: 0, p: 0, q: "gives name and phone", l: "sg", o: { n: "Saman Perera", ph: "same" }, u: false } });
ok(calls.reply === before && bodyText(r.out[0]).includes("ලිපිනය") && !bodyText(r.out[0]).includes("නම,"), "partial details → asks only for the address");
ok((await sql1(`select name||'|'||contact||'|'||status from lingo.bot_orders where lingo_user_id = $1 and phone = $2`, [A, C1])) === "Saman Perera|0771110001|draft", "draft order with 'same number' turned into the WhatsApp number");
ok(r.st.p.stage === "collecting", "stage → collecting");
r = await turn(A, C1, text("No 12, Temple Road, Kandy. 2k ona"), { cls: { k: "details", t: "other", faq: 0, p: 0, q: "address and qty 2", l: "sg", o: { a: "No 12, Temple Road, Kandy", qty: 2 }, u: false } });
const sum = r.out[r.out.length - 1].body.interactive;
ok(sum.type === "button" && sum.action.buttons.map((b) => b.reply.id).join() === "CONFIRM,CHANGE,CANCEL", "complete → summary with Confirm / Change / Cancel");
ok(sum.body.text.includes("3,130") && sum.body.text.includes("x 2"), "total from the database: 1,340 × 2 + 450 = 3,130");
ok(r.summarized, "older messages were summarised first (the Inbox keeps them all)");
const cBefore = calls.classify;
r = await turn(A, C1, text("ow"));
ok(calls.classify === cBefore && r.st.p.route === "rule", '"ow" while confirming → quick rule confirm (0 AI)');
ok((await sql1(`select status||'|'||qty||'|'||total||'|'||product_id_feeder||'|'||ad_id||'|'||feeder_sync from lingo.bot_orders where lingo_user_id = $1 and phone = $2`, [A, C1])) === "confirmed|2|3130.00|9001|AD_CHOL|pending",
  "order confirmed with its Feeder product id, the ad, and waiting for the courier file");
ok(bodyText(r.out[0]).includes("confirm කළා") && bodyText(r.out[0]).includes("3ක්"), "confirmation text with the seller's delivery days");
r = await turn(A, C1, text("thanks"));
ok(calls.classify === cBefore && bodyText(r.out[0]).includes("ස්තූතියි") && r.st.p.stage === "ordered", '"thanks" after ordering → chat reply (0 AI)');
r = await turn(A, C1, tapMsg("CONFIRM", "✅ Confirm"));
ok(calls.classify === cBefore && r.st.p.route === "tap", "a button tap never calls the middle AI");

console.log("Lingo: other products, voice, language");
r = await turn(A, C2, text("beard ekata monawa hari thiyenawada?"), { cls: { k: "other_product", t: "other", faq: 0, p: pA[9002].id, q: "beard product", l: "sg", o: {}, u: false } });
ok(r.und.req.contents[0].parts[0].text.includes(`Others: ${pA[9002].id}:Ayora Beard Growth Spray`), "the database found the beard spray in the text (Others)");
ok(r.out[0].body.image.link.includes("Beard") && r.out[0].body.image.caption.includes("Beard"), "→ that product's photo + description");
ok(!r.und.req.contents[0].parts[0].text.includes("Diabetic"), "the middle AI never sees the catalogue");
r = await turn(A, C2, { type: "audio", audio: { id: "MEDIA1", mime_type: "audio/ogg; codecs=opus", voice: true } },
  { mediaText: "mage nama Nimal, Galle, 0712345678", cls: { k: "details", t: "other", faq: 0, p: 0, q: "gives name city phone", l: "si", o: { n: "Nimal", ph: "0712345678" }, u: false } });
ok(r.claim.msgs[0].t.startsWith("[voice]") && calls.media === 1, "voice note → ≤40 words of text once");
ok(bodyText(r.out[0]).includes("ලිපිනය"), "details from the voice note → asks only for the address");
r = await turn(A, C2, text("English please"), { cls: { k: "chat", t: "other", faq: 0, p: 0, q: "wants english", l: "en", o: {}, u: false } });
ok(bodyText(r.out[0]).includes("address") && (await sql1(`select lang from lingo.bot_customers where lingo_user_id = $1 and phone = $2`, [A, C2])) === "en", '"English please" → English from now on');

console.log("Lingo: not sure, complaints, the guard");
r = await turn(A, C3, text("Hi", { referral: { source_id: "AD_X", headline: "Big sale", body: "" } }), { adProduct: 0 });
ok(bodyText(r.out[0]).includes("product එක මොකක්ද"), "an ad the AI can't match → asks which product");
const adX = calls.ad;
await turn(A, "94771110009", text("Hi", { referral: { source_id: "AD_X", headline: "Big sale", body: "" } }));
ok(calls.ad === adX, "…and isn't sent to the AI again (the seller sets it in Ads)");
await q(`update lingo.bot_customers set product_id = $1 where lingo_user_id = $2 and phone = $3`, [pA[9001].id, A, C3]);
r = await turn(A, C3, text("asdf qwer"), { cls: { k: "chat", t: "other", faq: 0, p: 0, q: "", l: "sg", o: {}, u: true } });
ok(r.out[r.out.length - 1].body.interactive?.action.buttons.map((b) => b.reply.id).join() === "ORDER,INFO,HUMAN", "not sure → one clarifying question with buttons");
r = await turn(A, C3, text("zzz ???"), { cls: "not json at all" });
ok(bodyText(r.out[0]).includes("කණ්ඩායමේ") && r.st.p.route === "human", "not sure twice (invalid AI output counts) → handed to the seller");
const cust3 = await one(`select stage, needs_seller, paused_until > now() as paused from lingo.bot_customers where lingo_user_id = $1 and phone = $2`, [A, C3]);
ok(cust3.stage === "handoff" && cust3.needs_seller && cust3.paused, "the chat shows under Needs you and the bot pauses for it");
const cls3 = calls.classify;
r = await turn(A, C3, text("hello?"));
ok(r.stopped === "paused" && calls.classify === cls3, "while paused, messages are kept for the Inbox, no reply, no AI");
r = await turn(A, C2, text("order eka awe na, salli aapahu denna"), { cls: { k: "complaint", t: "other", faq: 0, p: 0, q: "order not received refund", l: "en", o: {}, u: false } });
ok(r.st.p.handoff?.reason === "complaint" && bodyText(r.out[0]).includes("team member"), "a complaint → hand-off (in English for this customer)");

await q(`update lingo.bot_customers set paused_until = null, stage = 'browsing', needs_seller = false where lingo_user_id = $1`, [A]);
r = await turn(A, C2, text("meka kiyak dawas walin hondai?"), { cls: { k: "question", t: "results", faq: 0, p: 0, q: "how many days for results", l: "en", o: {}, u: false }, ai: { r: "You will see results in 14 days 👍" } });
ok(r.final.save.handoff && bodyText(r.out[r.out.length - 1]).includes("check"), "an AI answer with a number that isn't in the facts is blocked → will check + hand-off");
await q(`update lingo.bot_customers set paused_until = null, stage = 'browsing', needs_seller = false where lingo_user_id = $1`, [A]);
await q(`update lingo.bot_sellers set banned_claims = '{"guaranteed"}' where lingo_user_id = $1`, [A]);
r = await turn(A, C2, text("does it work for sure?"), { cls: { k: "question", t: "results", faq: 0, p: 0, q: "does it work for sure", l: "en", o: {}, u: false }, ai: { r: "Guaranteed results for everyone 💯" } });
ok(r.final.save.handoff?.reason.includes("banned"), "a banned claim → will check + hand-off");
await q(`update lingo.bot_customers set paused_until = null, stage = 'browsing', needs_seller = false where lingo_user_id = $1`, [A]);
r = await turn(A, C2, text("stock thiyenawada?"), { cls: { k: "question", t: "stock", faq: 0, p: 0, q: "in stock", l: "en", o: {}, u: false } });
ok(r.st.p.handoff && bodyText(r.out[0]).includes("check"), "no stock text set → will check + hand-off, never a made-up answer");

console.log("Lingo: seller B at the same time (same customer number)");
r = await turn(B, C1, text("Hi", { referral: { source_id: "AD_B1", headline: "Cholesterol", body: "" } }), { adProduct: pB9001 });
ok(r.out[0].body.type === "image" && bodyText(r.out[1]).includes("1️⃣"), "seller B's customer gets B's welcome");
ok((await sql1(`select count(*)::int from lingo.bot_orders where lingo_user_id = $1`, [B])) === 0, "no orders cross between sellers");
ok((await sql1(`select count(*)::int from lingo.bot_customers where phone = $1`, [C1])) === 2, "the same phone is a separate customer for each seller");
ok(r.claim.history.length === 0, "seller B's bot sees none of seller A's chat with that customer");
ok((await as("authenticated", kasun, `select count(*)::int n from lingo.bot_messages`)).rows[0].n === (await sql1(`select count(*)::int from lingo.bot_messages where lingo_user_id = $1`, [B])), "seller B reads only their own messages");

console.log("Lingo: statuses, echoes, duplicates");
const out1 = await sql1(`select wa_id from lingo.bot_messages where lingo_user_id = $1 and role = 'b' and wa_id is not null order by id limit 1`, [A]);
{
  const body = { entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: PNID[A] }, statuses: [{ id: out1, status: "read", recipient_id: C1, pricing: { billable: false, category: "service" } }] } }] }] };
  const raw = JSON.stringify(body);
  const nodes = { Config: node(cfg) };
  const [read] = await run("read_webhook.js", { body, headers: { "x-hub-signature-256": "sha256=" + createHmac("sha256", SECRET_A).update(raw).digest("hex") } }, nodes, { getBinaryDataBuffer: async () => Buffer.from(raw) });
  nodes["Read Webhook"] = node(read);
  nodes.Number = node(await rpc("bot_number", { phone_number_id: read.phone_number_id }));
  const [vs] = await run("verify_split.js", {}, nodes);
  await rpc("bot_statuses", { lingo_user_id: A, statuses: vs.statuses });
  ok((await sql1(`select status||'|'||billable||'|'||pricing_category from lingo.bot_messages where wa_id = $1`, [out1])) === "read|false|service", "delivery status and Meta's pricing are saved per message");
  const echo = { entry: [{ changes: [{ field: "smb_message_echoes", value: { metadata: { phone_number_id: PNID[A] }, message_echoes: [{ from: "94110000000", to: C2, id: "wamid.ECHO1", type: "text", text: { body: "Mama call karannam" } }] } }] }] };
  const raw2 = JSON.stringify(echo);
  const [read2] = await run("read_webhook.js", { body: echo, headers: { "x-hub-signature-256": "sha256=" + createHmac("sha256", SECRET_A).update(raw2).digest("hex") } }, nodes, { getBinaryDataBuffer: async () => Buffer.from(raw2) });
  nodes["Read Webhook"] = node(read2);
  const [vs2] = await run("verify_split.js", {}, nodes);
  await rpc("bot_echo", { lingo_user_id: A, items: vs2.echoes });
  const c2 = await one(`select paused_until > now() as paused from lingo.bot_customers where lingo_user_id = $1 and phone = $2`, [A, C2]);
  ok(c2.paused && (await sql1(`select count(*)::int from lingo.bot_messages where role = 'seller' and wa_id = 'wamid.ECHO1'`)) === 1, "a reply from the WhatsApp Business app is kept and pauses the bot for that chat");
}
{
  const body = wh(A, C1, text("same message twice"));
  const raw = JSON.stringify(body);
  const sig = "sha256=" + createHmac("sha256", SECRET_A).update(raw).digest("hex");
  const go = async () => {
    const nodes = { Config: node(cfg) };
    const [read] = await run("read_webhook.js", { body, headers: { "x-hub-signature-256": sig } }, nodes, { getBinaryDataBuffer: async () => Buffer.from(raw) });
    nodes["Read Webhook"] = node(read);
    nodes.Number = node(await rpc("bot_number", { phone_number_id: read.phone_number_id }));
    const [vs] = await run("verify_split.js", {}, nodes);
    nodes["Verify & Split"] = node(vs);
    nodes.Message = node((await run("message.js", {}, nodes))[0]);
    return pipeline(nodes, { cls: { k: "chat", t: "other", faq: 0, p: 0, q: "", l: "sg", o: {}, u: false } });
  };
  await go();
  ok((await go()).stopped === "dup", "Meta re-sending the same webhook → handled once");
}

console.log("Lingo: AI allowance (degrade mode)");
await q(`update lingo.bot_customers set paused_until = null, stage = 'browsing', needs_seller = false where lingo_user_id = $1`, [A]);
await q(`update lingo.bot_sellers set ai_monthly_budget_usd = 0.0001 where lingo_user_id = $1`, [A]);
const rd0 = calls.reply;
r = await turn(A, C2, text("ingredients monawada?"), { cls: { k: "question", t: "ingredients", faq: 0, p: 0, q: "what are the ingredients", l: "en", o: {}, u: false }, ai: { r: "x" } });
ok(calls.reply === rd0 && r.final.save.handoff?.reason.includes("allowance"), "allowance used up → no reply AI; the question goes to the seller");
await q(`update lingo.bot_customers set paused_until = null, stage = 'browsing', needs_seller = false where lingo_user_id = $1`, [A]);
await q(`update lingo.bot_customers set product_id = $1 where lingo_user_id = $2 and phone = $3`, [pA[9001].id, A, C2]);
r = await turn(A, C2, text("can diabetics use it?"), { cls: { k: "question", t: "safety", faq: faq, p: 0, q: "can diabetics use it", l: "en", o: {}, u: false } });
ok(r.st.p.route === "faq" && bodyText(r.out[0]).includes("diabetes"), "…FAQs still answer in degrade mode");
ok((await one(`select count(*)::int n from lingo.bot_events where lingo_user_id = $1 and type = 'budget_warning'`, [A])).n === 1, "the seller is warned once (80%)");
await q(`update lingo.bot_sellers set ai_monthly_budget_usd = 8 where lingo_user_id = $1`, [A]);

console.log("Lingo: cost tracking");
const aiRows = await one(`select count(*)::int n, sum(cost_usd)::float cost, count(*) filter (where stage = 'media')::int media, sum(tokens_audio)::int audio from lingo.ai_usage`);
const aiA = (await one(`select sum(cost_usd)::float c from lingo.ai_usage where lingo_user_id = $1`, [A])).c;
const totalCalls = calls.classify + calls.reply + calls.ad + calls.media + calls.summary;
ok(aiRows.n === totalCalls, `every AI call is logged in ai_usage (${aiRows.n} = ${totalCalls})`);
ok(aiRows.cost > 0 && aiRows.cost < 0.05 && aiRows.audio === 640, `with its cost from model_prices (US$${aiRows.cost.toFixed(5)}; audio tokens priced separately)`);
ok((await rpc("bot_handoff", { lingo_user_id: A, phone: C3, reason: "error in the workflow" })).ok, "a chat can be handed to the seller from anywhere (error workflow)");
const ov = await one(`select lingo.panel_overview($1) as o`, [A]);
ok(ov.o.routes.rule >= 3 && ov.o.routes.ai >= 1 && ov.o.routes.faq >= 1 && ov.o.routes.human >= 3 && ov.o.routes.tap >= 1, "the dashboard counts every route (rule / tap / fixed / faq / cache / ai / human)");
ok(Math.abs(Number(ov.o.ai_period) - aiA) < 1e-9, "dashboard AI cost = the sum of ai_usage");
ok(ov.o.to_export === 1 && ov.o.needs_you === 1, "orders waiting for the courier file and chats needing the seller are counted");
const inbox = await one(`select lingo.panel_inbox($1, 'needs') as i`, [A]);
ok(inbox.i.length >= 1 && inbox.i.every((x) => x.needs_seller), "Inbox → Needs you lists only chats waiting for the seller");

console.log("Lingo: Test bot (nothing goes to WhatsApp)");
const tb = await testBot(A, { action: "test_bot", session: "u1", text: "Hello! Can I get more info on this?", start_product: pA[9002].id });
ok(tb.test.reply.messages.length === 2 && tb.test.reply.messages[0].body.type === "image" && tb.test.reply.route === "rule" && tb.test.reply.cost_usd === 0, "the real pipeline runs, showing route and messages");
ok((await sql1(`select test from lingo.bot_customers where phone = 'test-u1'`)) === true && tb.st.p.sent.every((s) => !s.wa_id), "test chats are marked test and nothing was sent");
ok((await one(`select lingo.panel_overview($1) as o`, [A])).o.chats_today === ov.o.chats_today, "test chats don't count on the dashboard");
await expectError(() => run("panel_action.js", {}, { "Panel: Lingo": node({ body: { action: "test_bot", lingo_user_id: "x" } }) }), "the panel webhook needs a seller id", /lingo_user_id/);

console.log("Lingo: follow-ups");
await q(`update lingo.bot_customers set last_msg_at = now() - interval '6 hours', paused_until = null, stage = 'browsing' where lingo_user_id = $1 and phone in ($2, $3)`, [A, C1, C2]);
await q(`update lingo.bot_customers set stage = 'ordered' where lingo_user_id = $1 and phone = $2`, [A, C1]);
await q(`update lingo.bot_sellers set followups = '{"hours": 5, "from": 0, "to": 24}'`);
await q(`update lingo.wa_numbers set status = 'connected'`);
const due = await rpc("bot_due_followups", { limit: 50 });
const fu = await run("build_followups.js", due, { Config: node(cfg) });
const byTo = Object.fromEntries(fu.map((f) => [f.body.to, f]));
ok(byTo[C1]?.body.text.body.includes("confirm වෙලා") && byTo[C1].auth === "Bearer EAAtokenAmaya1234", "confirmed → delivery reminder, sent with that seller's own token");
ok(byTo[C2]?.body.interactive.action.buttons[0].reply.id === "ORDER", "no order → \"want to order?\" + Order button");
ok(!fu.some((f) => f.body.to.startsWith("test-")), "never to test chats");
ok((await rpc("bot_due_followups", { limit: 50 })).items.length === 0, "once per quiet spell");
const [ids] = await run("collect_ids.js", fu.map((_, i) => ({ messages: [{ id: "wamid.FU" + i }] })), { "Build Follow-ups": node(fu) });
await rpc("bot_set_wa_ids", ids.p);
ok((await sql1(`select count(*)::int from lingo.bot_messages where wa_id like 'wamid.FU%'`)) === fu.length, "follow-ups are in the Inbox with their WhatsApp ids");
await q(`update lingo.bot_customers set last_in_at = now() - interval '25 hours', last_msg_at = now() - interval '6 hours', notified_at = null`);
ok((await rpc("bot_due_followups", { limit: 50 })).items.length === 0, "never outside WhatsApp's 24 h window");

console.log("Lingo: number health");
await q(`update lingo.wa_numbers set status = 'connected'`);
const check = await rpc("bot_numbers_to_check", {});
ok(check.length === 2 && check.every((x) => x.token.startsWith("EAA")), "every connected number is checked with its own token");
await rpc("bot_save_check", { phone_number_id: "1110001", ok: false, error: "(190) Invalid OAuth access token" });
ok((await sql1(`select status||'|'||problem from lingo.wa_numbers where phone_number_id = '1110001'`)).startsWith("problem|(190)"), "a bad token shows as a problem with Meta's reason");
const bIds = await one(`select token_secret_id t, app_secret_id a from lingo.wa_numbers where lingo_user_id = $1`, [B]);
ok((await one(`select lingo.remove_wa_number($1) as r`, [B])).r.ok && (await sql1(`select count(*)::int from vault.secrets where id in ($1, $2)`, [bIds.t, bIds.a])) === 0
   && (await sql1(`select count(*)::int from vault.secrets where id in (select token_secret_id from lingo.wa_numbers)`)) === 1, "removing a number deletes only its own secrets from Vault");

console.log("Lingo: admin");
const adm = (await as("service_role", null, `select lingo.admin_sellers() as r`)).rows[0].r;
ok(adm.length === 2 && adm.find((x) => x.lingo_user_id === A).orders_30d === 1, "admin sees every seller with chats, orders and AI against the allowance");
const rep = (await as("service_role", null, `select lingo.admin_report(7) as r`)).rows[0].r;
ok(rep.top_ai_questions.some((x) => x.q.includes("blood pressure")) && rep.events.some((e) => e.type === "unknown_number"), "the weekly report lists reply-AI questions (FAQ ideas) and problems");
await expectError(() => as("authenticated", amaya, `select lingo.admin_sellers()`), "only the service role reads the admin report", /permission denied/);

summary();
