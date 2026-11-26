// The app's API (/api/app/*, used by apps/mobile) end to end: the real route handlers in
// apps/panels against the mock Supabase, with a real access token. Needs a FRESH mock each run:
//
//   node scripts/e2e/mock-supabase.mjs                      (terminal 1)
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon from scripts/e2e/.mock/keys.json> \
//   SUPABASE_SERVICE_ROLE_KEY=<service from keys.json> PANEL_DEFAULT=feeder \
//   pnpm --filter @retexia/panels exec next dev --webpack -p 3002   (terminal 2)
//   node scripts/e2e/app-api.mjs                            (terminal 3)
import { readFileSync } from "node:fs";
const ROOT = new URL("../../", import.meta.url).pathname;
const keys = JSON.parse(readFileSync(ROOT + "scripts/e2e/.mock/keys.json", "utf8"));
const SB = keys.url, API = "http://localhost:3002";
const sql = async (s, params = []) => {
  const r = await fetch(`${SB}/__test/sql`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sql: s, params }) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`sql ${r.status}: ${JSON.stringify(j)}`);
  return j;
};
let fails = 0;
const ok = (c, l, extra = "") => { console.log(`${c ? "  ✓" : "  ✗"} ${l}${extra ? " " + extra : ""}`); if (!c) fails++; };

// --- seed -------------------------------------------------------------------
await sql(`insert into public.products (slug, code, name, short_name, status) values ('feeder', 'FDR', 'Retexia Feeder', 'Feeder', 'live') on conflict (slug) do nothing`);
for (const f of ["0039_lingo_feeder.sql", "0042_lingo_feeder_details_voice.sql", "0043_lingo_feeder_human.sql", "0044_app_push.sql"]) await sql(readFileSync(ROOT + "supabase/migrations/" + f, "utf8"));
const pw = "Password123!";
// The mock hashes passwords with its own hash(): sign up through the API, then confirm.
const su = await fetch(`${SB}/auth/v1/signup`, { method: "POST", headers: { "content-type": "application/json", apikey: keys.anon }, body: JSON.stringify({ email: "seller@example.com", password: pw, data: { full_name: "Amaya Seller" } }) });
ok(su.ok, "sign up the test seller", String(su.status));
const other = await fetch(`${SB}/auth/v1/signup`, { method: "POST", headers: { "content-type": "application/json", apikey: keys.anon }, body: JSON.stringify({ email: "nobody@example.com", password: pw }) });
await sql(`update auth.users set email_confirmed_at = now() where email in ('seller@example.com', 'nobody@example.com')`);
const [{ id: uid }] = await sql(`select id from auth.users where email = $1`, ['seller@example.com']);
console.log("seller", uid);
const pkg = (await sql(`select p.id, p.product_id from public.packages p join public.products pr on pr.id = p.product_id where pr.slug = 'feeder' and p.slug = 'lingo-feeder'`))[0];
await sql(`insert into public.orders (user_id, product_id, package_id, package_name, status, ref) values ($1, $2, $3, 'Lingo Feeder', 'active', 'FDR-2026-9001')`, [uid, pkg.product_id, pkg.id]);
await sql(`select lingo_feeder.ensure_seller($1, 'Amaya Shop')`, [uid]);
await sql(`insert into lingo_feeder.chats (user_id, phone, profile_name, status, needs_call, call_reason, last_in_at, last_msg_at) values ($1, '94771234567', 'Kamal', 'ordering', true, 'Asked for a call', now(), now()), ($1, '94770000001', 'Nimali', 'asking', false, null, now() - interval '2 days', now() - interval '2 days')`, [uid]);
await sql(`insert into lingo_feeder.messages (user_id, phone, role, content) values ($1, '94771234567', 'c', 'Hi, price?'), ($1, '94771234567', 'b', 'Rs. 3,450 with delivery 😊')`, [uid]);
await sql(`insert into lingo_feeder.orders (user_id, phone, product_name, qty, name, address, phone1, unit_price, delivery_fee, total, status, confirmed_at) values ($1, '94771234567', 'Herbal Tea', 1, 'Kamal Perera', '12 Main St, Kandy', '0771234567', 3000, 450, 3450, 'confirmed', now())`, [uid]);

// --- sign in ----------------------------------------------------------------
const tok = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json", apikey: keys.anon }, body: JSON.stringify({ email: "seller@example.com", password: pw }) })).json();
ok(Boolean(tok.access_token), "password sign-in gives an access token");
const tok2 = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json", apikey: keys.anon }, body: JSON.stringify({ email: "nobody@example.com", password: pw }) })).json();
const call = async (method, path, body, token = tok.access_token) => {
  const r = await fetch(API + path, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("json")) return { status: r.status, body: await r.json(), headers: r.headers };
  const bytes = Buffer.from(await r.arrayBuffer());
  return { status: r.status, body: bytes.toString("utf8"), bom: bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, headers: r.headers };
};

console.log("\n/api/app");
let r = await fetch(API + "/api/app/me");
ok(r.status === 401, "no token → 401", String(r.status));
r = await call("GET", "/api/app/me", null, "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.badsignaturebadsignature");
ok(r.status === 401, "a forged token → 401", String(r.status));
const me = await call("GET", "/api/app/me");
ok(me.status === 200 && me.body.user.email === "seller@example.com", "GET me", String(me.status));
const feeder = me.body.products?.find((p) => p.key === "feeder");
ok(feeder?.open && feeder.packages.find((p) => p.slug === "lingo-feeder")?.open, "Lingo Feeder is open (active order)");
ok(me.body.products?.find((p) => p.key === "plan")?.open === true, "Plan is open for everyone");
ok(!JSON.stringify(me.body).match(/price|LKR|get-started|buy/i), "no prices or buy links in /me");
const me2 = await call("GET", "/api/app/me", null, tok2.access_token);
ok(me2.status === 200 && !me2.body.products.find((p) => p.key === "feeder")?.packages.find((p) => p.slug === "lingo-feeder")?.open, "someone without it: Lingo Feeder locked");
r = await call("GET", "/api/app/lingo-feeder/home", null, tok2.access_token);
ok(r.status === 403, "their Lingo Feeder routes → 403", String(r.status));

r = await call("POST", "/api/app/push-token", { token: "ExponentPushToken[smoke-test-token-123]", platform: "android", device: "Pixel", version: "1.0.0" });
ok(r.status === 200, "register push token", JSON.stringify(r.body));
r = await call("POST", "/api/app/push-token", { token: "nope", platform: "android" });
ok(r.status === 400 && r.body.fieldErrors?.token, "a bad token → 400 with the field", JSON.stringify(r.body));

r = await call("GET", "/api/app/lingo-feeder/home");
ok(r.status === 200 && r.body.seller?.business_name === "Amaya Shop" && r.body.stats?.call === 1, "Lingo Feeder home", JSON.stringify(r.body).slice(0, 200));
r = await call("GET", "/api/app/lingo-feeder/chats?status=call");
ok(r.status === 200 && r.body.chats.length === 1 && r.body.counts.call === 1, "chats ?status=call", JSON.stringify(r.body).slice(0, 160));
r = await call("GET", "/api/app/lingo-feeder/chats?q=Nimali");
ok(r.status === 200 && r.body.chats.length === 1 && r.body.chats[0].phone === "94770000001", "chats search");
r = await call("GET", "/api/app/lingo-feeder/chats/94771234567");
ok(r.status === 200 && r.body.messages.length === 2 && r.body.canReply === true && r.body.orders.length === 1, "one chat with messages and orders");
r = await call("GET", "/api/app/lingo-feeder/chats/94779999999");
ok(r.status === 404, "unknown chat → 404", String(r.status));
r = await call("GET", "/api/app/lingo-feeder/chats/94771234567", null, tok2.access_token);
ok(r.status === 403, "another person can't read the chat", String(r.status));
r = await call("POST", "/api/app/lingo-feeder/chats/94771234567/called", { called: true });
ok(r.status === 200 && r.body.message === "Marked as called.", "mark as called", JSON.stringify(r.body));
r = await call("POST", "/api/app/lingo-feeder/chats/94771234567/status", { status: "ordered" });
ok(r.status === 200, "set status", JSON.stringify(r.body));
r = await call("POST", "/api/app/lingo-feeder/chats/94771234567/status", { status: "hacked" });
ok(r.status === 400, "an unknown status → 400", JSON.stringify(r.body));
r = await call("POST", "/api/app/lingo-feeder/chats/94771234567/pause", { paused: true });
ok(r.status === 200, "pause Lingo in a chat", JSON.stringify(r.body));
r = await call("POST", "/api/app/lingo-feeder/chats/94771234567/reply", { text: "Hello!" });
ok(r.status === 400 && /engine/i.test(r.body.error), "reply without the n8n engine → a clear error", JSON.stringify(r.body));
r = await call("POST", "/api/app/lingo-feeder/chats/94771234567/explode", {});
ok(r.status === 404, "unknown action → 404", String(r.status));
const chat = (await sql(`select status, needs_call, paused_until is not null as paused from lingo_feeder.chats where user_id = $1 and phone = '94771234567'`, [uid]))[0];
ok(chat.status === "ordered" && chat.needs_call === false && chat.paused === true, "the changes are in the database");

r = await call("GET", "/api/app/lingo-feeder/orders?view=new");
ok(r.status === 200 && r.body.orders.length === 1 && r.body.toExport === 1, "orders view=new");
const oid = r.body.orders[0].id;
r = await call("GET", "/api/app/lingo-feeder/orders/courier.csv");
ok(r.status === 200 && r.bom && String(r.body).replace(/^\uFEFF/, "").startsWith("name,address,tp_1,tp_2,price,qty,item_code,delivery\r\n") && r.headers.get("x-lingo-orders") === "1", "courier CSV (BOM, header, CRLF)", JSON.stringify(String(r.body).slice(0, 120)));
r = await call("GET", "/api/app/lingo-feeder/orders/courier.csv");
ok(r.status === 404, "no new orders → 404", String(r.status));
r = await call("POST", `/api/app/lingo-feeder/orders/${oid}/unsent`);
ok(r.status === 200, "back in the next courier file", JSON.stringify(r.body));
r = await call("POST", `/api/app/lingo-feeder/orders/${oid}/cancel`);
ok(r.status === 200 && r.body.message === "Order cancelled.", "cancel an order");
r = await call("POST", `/api/app/lingo-feeder/orders/${oid}/restore`);
ok(r.status === 200, "order back on");
r = await call("POST", "/api/app/lingo-feeder/lingo", { on: true });
ok(r.status === 400 && /WhatsApp|name/i.test(r.body.error), "Lingo can't turn on without a number", JSON.stringify(r.body));
r = await call("POST", "/api/app/lingo-feeder/try", { text: "hi" });
ok(r.status === 400 && /engine/i.test(r.body.error), "Try Lingo without the engine → a clear error", JSON.stringify(r.body));

r = await call("PUT", "/api/app/notifications", { push: true, muted: ["lingo_feeder.order"] });
ok(r.status === 200, "save notification settings", JSON.stringify(r.body));
r = await call("PUT", "/api/app/notifications", { push: true, muted: ["anything.else"] });
ok(r.status === 400, "only known kinds can be muted", JSON.stringify(r.body));
r = await call("GET", "/api/app/notifications");
ok(r.status === 200 && r.body.muted[0] === "lingo_feeder.order" && r.body.kinds.length === 4, "read notification settings");

await sql(`update lingo_feeder.chats set needs_call = true, call_reason = 'Complaint' where user_id = $1 and phone = '94770000001'`, [uid]);
r = await call("GET", "/api/app/inbox");
ok(r.status === 200 && r.body.items.length === 1 && r.body.items[0].unread && r.body.items[0].url === "/lingo-feeder/chats?status=call", "a Call them push shows in the Inbox", JSON.stringify(r.body).slice(0, 200));
ok((await call("GET", "/api/app/me")).body.unread === 1, "unread count in /me");
r = await call("POST", "/api/app/inbox");
ok(r.status === 200 && (await call("GET", "/api/app/me")).body.unread === 0, "opening the Inbox marks it read");
r = await call("GET", "/api/app/inbox", null, tok2.access_token);
ok(r.status === 200 && r.body.items.length === 0, "nobody else sees it");

r = await call("POST", "/api/app/account/deletion", { reason: "Testing" });
ok(r.status === 200 && r.body.data?.requestedAt, "ask to delete the account", JSON.stringify(r.body));
ok(Boolean((await call("GET", "/api/app/me")).body.deletionRequestedAt), "/me shows the request");
r = await call("DELETE", "/api/app/account/deletion");
ok(r.status === 200 && !(await call("GET", "/api/app/me")).body.deletionRequestedAt, "cancel the request");

r = await call("DELETE", "/api/app/push-token", { token: "ExponentPushToken[smoke-test-token-123]" });
ok(r.status === 200 && (await sql(`select count(*)::int n from public.push_tokens`))[0].n === 0, "sign-out removes the phone");

console.log(`\n${fails ? fails + " failed" : "all passed"}`);
process.exit(fails ? 1 : 0);
