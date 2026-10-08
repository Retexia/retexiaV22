// Product schemas (0005 post, 0006 lingo): owners only see their own data,
// customers can't touch plans, statuses or the WhatsApp API key, and the
// Retexia team can read for support.
//
//   pnpm db:test
import { createHarness, migration, seed } from "./lib/harness.mjs";

const { db, ok, expectError, as, summary } = await createHarness();
await db.exec(migration);
await db.exec(seed);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const user = async (email, role = "customer") => {
  const id = (await q(`insert into auth.users (email) values ($1) returning id`, [email]))[0].id;
  if (role !== "customer") await q(`update public.profiles set role = $1 where id = $2`, [role, id]);
  return id;
};
const amaya = await user("amaya@example.com");
const kasun = await user("kasun@example.com");
const support = await user("support@retexia.test", "support");

console.log("Post");
const biz = (await as("authenticated", amaya, `insert into post.businesses (owner_id, name) values ($1, 'Amaya Cakes') returning id`, [amaya])).rows[0].id;
await q(`insert into post.businesses (owner_id, name) values ($1, 'Kasun Phones')`, [kasun]);
ok((await as("authenticated", amaya, `select id from post.businesses`)).rows.length === 1, "owners see only their own business");
ok((await as("authenticated", support, `select id from post.businesses`)).rows.length === 2, "the Retexia team can read every business");
await expectError(() => as("anon", null, `select id from post.businesses`), "visitors can't read Post data", /permission denied/);
await expectError(() => as("authenticated", amaya, `update post.businesses set plan = 'pro' where id = $1`, [biz]), "owners can't change their plan", /permission denied/);
await expectError(
  () => as("authenticated", kasun, `insert into post.products (business_id, name) values ($1, 'Hack')`, [biz]),
  "owners can't add products to someone else's business",
  /row-level security/,
);
const post = (await q(`insert into post.posts (business_id, local_date, slot, format, scheduled_at, status) values ($1, current_date + 1, 1, 'photo', now() + interval '1 day', 'ready') returning id`, [biz]))[0].id;
ok((await as("authenticated", amaya, `select post.approve_post($1) s`, [post])).rows[0].s === "approved", "owners can approve their ready post");
await expectError(() => as("authenticated", kasun, `select post.deny_post($1)`, [post]), "others can't deny it", /Post not found/);
await as("authenticated", amaya, `update post.posts set caption = 'New caption' where id = $1`, [post]);
ok((await q(`select status from post.posts where id = $1`, [post]))[0].status === "safety_review", "an owner's edit goes back through the safety check");
await expectError(() => as("authenticated", amaya, `update post.posts set status = 'published' where id = $1`, [post]), "owners can't set statuses directly", /permission denied/);
await expectError(() => as("authenticated", amaya, `select post.claim_due_posts()`), "scheduler functions are service-only", /permission denied/);
await q(`select post.bump_usage($1, 'images', 2, 0.08)`, [biz]);
ok((await as("authenticated", amaya, `select images from post.usage_monthly`)).rows[0]?.images === 2, "usage counters work and owners can read theirs");

console.log("Lingo");
const lu = (await q(`insert into lingo.lingo_users (business_name, evolution_instance, evolution_base_url, evolution_apikey, owner_id) values ('Amaya Herbals', 'amaya', 'https://evo.example', 'SECRET-KEY', $1) returning id`, [amaya]))[0].id;
await q(`insert into lingo.lingo_users (business_name, evolution_instance, evolution_base_url, evolution_apikey) values ('Other shop', 'other', 'https://evo.example', 'OTHER-KEY')`);
const cust = (await q(`insert into lingo.customers (lingo_user_id, remote_jid) values ($1, '94770000000@s.whatsapp.net') returning id`, [lu]))[0].id;
await q(`insert into lingo.messages (lingo_user_id, customer_id, role, content) values ($1, $2, 'user', 'hi')`, [lu, cust]);
await q(`insert into lingo.orders (lingo_user_id, customer_id, product_name, quantity, unit_price, delivery_fee, status) values ($1, $2, 'Oil', 2, 1500, 350, 'confirmed')`, [lu, cust]);
await q(`insert into lingo.fixed_messages (key, language, content) values ('greeting', 'en', 'Hello from {business_name}')`);
ok((await as("authenticated", amaya, `select id from lingo.lingo_users`)).rows.length === 1, "owners see only their own bot account");
await expectError(() => as("authenticated", amaya, `select evolution_apikey from lingo.lingo_users`), "the WhatsApp API key is never readable by customers", /permission denied/);
ok((await as("authenticated", kasun, `select id from lingo.customers`)).rows.length === 0, "other customers see none of the bot's customers");
ok((await as("authenticated", amaya, `select id from lingo.messages`)).rows.length === 0, "owners can't read chat messages from the browser");
ok((await as("authenticated", support, `select id from lingo.messages`)).rows.length === 1, "the Retexia team can read messages for support");
ok(Number((await q(`select total_price from lingo.orders`))[0].total_price) === 3350, "order totals are calculated");
await as("authenticated", amaya, `insert into lingo.fixed_messages (lingo_user_id, key, language, content) values ($1, 'greeting', 'en', 'Hi! Welcome to Amaya')`, [lu]);
ok((await as("authenticated", amaya, `select content from lingo.fixed_messages where key = 'greeting' order by lingo_user_id nulls first`)).rows.length === 2, "owners see the default reply and their own version");
await expectError(() => as("authenticated", amaya, `insert into lingo.fixed_messages (key, language, content) values ('greeting', 'si', 'x')`), "owners can't change the shared defaults", /row-level security/);
await expectError(() => as("authenticated", amaya, `select lingo.panel_customer_stats($1)`, [lu]), "stats functions are server-only", /permission denied/);
const stats = await q(`select * from lingo.panel_customer_stats($1)`, [lu]);
ok(stats.length === 1 && Number(stats[0].user_messages) === 1 && Number(stats[0].spent) === 3350, "customer stats add up");
ok((await q(`select count(*)::int n from lingo.panel_daily_stats($1, 7)`, [lu]))[0].n === 7, "daily stats return one row per day");

console.log("Admin controls (0007)");
await q(`insert into lingo.messages (lingo_user_id, customer_id, role, content, wa_message_id) values ($1, $2, 'user', 'hello', 'WA-1') on conflict (lingo_user_id, wa_message_id) do nothing`, [lu, cust]);
await q(`insert into lingo.messages (lingo_user_id, customer_id, role, content, wa_message_id) values ($1, $2, 'user', 'hello', 'WA-1') on conflict (lingo_user_id, wa_message_id) do nothing`, [lu, cust]);
ok((await q(`select count(*)::int n from lingo.messages where wa_message_id = 'WA-1'`))[0].n === 1, "a WhatsApp message delivered twice is saved once (Lingo v6)");
const lo = (await q(`select * from lingo.admin_overview() where lingo_user_id = $1`, [lu]))[0];
ok(Number(lo.customers) === 1 && Number(lo.open_orders) === 1 && Number(lo.sales_30d) === 3350, "Lingo admin overview adds up");
await expectError(() => as("authenticated", support, `select lingo.admin_overview()`), "admin overview is server-only", /permission denied/);
await q(`update post.businesses set onboarding_done = true, subscription_status = 'active'`);
await q(`insert into post.posts (business_id, local_date, slot, format, scheduled_at, status) values ($1, current_date, 2, 'photo', now() - interval '1 minute', 'approved')`, [biz]);
await q(`update post.system_settings set publishing_paused = true`);
ok((await q(`select count(*)::int n from post.claim_due_posts()`))[0].n === 0, "the global switch stops all publishing");
await q(`update post.system_settings set publishing_paused = false`);
ok((await q(`select count(*)::int n from post.claim_due_posts()`))[0].n === 1, "publishing resumes when switched back on");
await expectError(() => as("authenticated", amaya, `select * from post.system_settings`), "customers can't read the global switches", /permission denied/);
const po = (await q(`select * from post.admin_overview() where business_id = $1`, [biz]))[0];
ok(Number(po.images) === 2, "Post admin overview shows this month's usage");

console.log("Launch (0008)");
const pkgs = await q(`select pk.slug, pk.price_monthly from public.packages pk join public.products p on p.id = pk.product_id where p.slug = 'post' order by pk.sort_order`);
ok(pkgs.map((p) => p.slug).join() === "starter,growth,pro", "Post has the Starter, Growth and Pro plans");
const prod = (await q(`select status, panel_url, onboarding_form_id from public.products where slug = 'post'`))[0];
ok(prod.status === "live" && prod.panel_url === "https://post.retexia.com" && prod.onboarding_form_id, "Post is live with its panel address and order form");
ok((await q(`select count(*)::int n from public.page_sections s join public.pages g on g.id = s.page_id where g.slug = 'post' and s.type = 'waitlist'`))[0].n === 0, "the waitlist section is gone from the Post page");
// Orders drive the plan
const postProduct = (await q(`select id from public.products where slug = 'post'`))[0].id;
const growth = (await q(`select id from public.packages where product_id = $1 and slug = 'growth'`, [postProduct]))[0].id;
const order = (await q(`insert into public.orders (user_id, product_id, package_id, status) values ($1, $2, $3, 'setting_up') returning id`, [amaya, postProduct, growth]))[0].id;
ok((await q(`select plan from post.businesses where id = $1`, [biz]))[0].plan === "growth", "a Post order sets the business plan");
await q(`update public.orders set status = 'cancelled' where id = $1`, [order]);
ok((await q(`select subscription_status from post.businesses where id = $1`, [biz]))[0].subscription_status === "canceled", "a cancelled order stops the business posting");
ok((await q(`select count(*)::int n from post.claim_due_posts()`))[0].n === 0, "cancelled businesses publish nothing");
// Lingo bot follows the order
const lingoProduct = (await q(`select id from public.products where slug = 'lingo'`))[0].id;
const core = (await q(`select id from public.packages where product_id = $1 and slug = 'core'`, [lingoProduct]))[0].id;
const lorder = (await q(`insert into public.orders (user_id, product_id, package_id, status) values ($1, $2, $3, 'active') returning id`, [amaya, lingoProduct, core]))[0].id;
await q(`update public.orders set status = 'paused' where id = $1`, [lorder]);
ok((await q(`select active from lingo.lingo_users where id = $1`, [lu]))[0].active === false, "pausing the Lingo order switches the bot off");
await q(`update public.orders set status = 'active' where id = $1`, [lorder]);
ok((await q(`select active from lingo.lingo_users where id = $1`, [lu]))[0].active === true, "resuming it switches the bot back on");
// Vault helpers
const sid = (await q(`select post.save_secret(null, 'PAGE-TOKEN') id`))[0].id;
ok((await q(`select post.read_secret($1) t`, [sid]))[0].t === "PAGE-TOKEN", "tokens are stored in Vault and read back on the server");
await expectError(() => as("authenticated", amaya, `select post.read_secret($1)`, [sid]), "customers can't read tokens", /permission denied/);
// Slots
await q(`update post.businesses set settings = settings || '{"slots": ["08:00", "12:00", "18:00"]}' where id = $1`, [biz]);
const slot = (await q(`select * from post.next_free_slot($1)`, [biz]))[0];
ok(slot && slot.scheduled_at > new Date(Date.now() + 19 * 60_000), "the next free slot is in the future");
ok((await q(`select to_char(post.slot_time($1, '2026-10-10', 2) at time zone 'Asia/Colombo', 'HH24:MI') t`, [biz]))[0].t === "12:00", "slot times follow the business's posting times");

console.log("Drafts from the n8n workflow");
const tmr = (await q(`select ((now() at time zone 'Asia/Colombo')::date + 1)::text d`))[0].d;
const draft = (await q(`insert into post.posts (business_id, local_date, slot, format, scheduled_at, status, source) values ($1, $2, 3, 'photo', now() + interval '1 day', 'ready', 'manual') returning scheduled_at`, [biz, tmr]))[0];
const want = (await q(`select post.slot_time($1, $2, 3) t`, [biz, tmr]))[0].t;
ok(new Date(draft.scheduled_at).getTime() === new Date(want).getTime(), "a draft saved by the workflow is scheduled at its slot's time");

console.log("Paddle (0009)");
const lingoP = (await q(`select id from public.products where slug = 'lingo'`))[0].id;
const corePk = (await q(`select id from public.packages where product_id = $1 and slug = 'core'`, [lingoP]))[0].id;
await q(`update public.packages set paddle_price_monthly = 'pri_core_m', paddle_price_setup = 'pri_core_setup' where id = $1`, [corePk]);
const paid = (await as("authenticated", kasun, `insert into public.orders (product_id, package_id, billing_cycle, answers) values ($1, $2, 'monthly', '[]') returning id, status, currency`, [lingoP, corePk])).rows[0];
ok(paid.status === "awaiting_payment" && paid.currency === "USD", "a Paddle package order waits for payment, in USD");
await expectError(() => as("authenticated", kasun, `select public.svc_paddle_payment('{}'::jsonb)`), "customers can't record Paddle payments", /permission denied/);
const pay = { order_id: paid.id, transaction_id: "txn_1", subscription_id: "sub_1", customer_id: "ctm_1", amount: "64.00", currency: "usd", kind: "setup_fee", period_start: "2026-10-09T00:00:00Z", period_end: "2026-11-09T00:00:00Z", origin: "web" };
await q(`select public.svc_paddle_payment($1::jsonb)`, [JSON.stringify(pay)]);
const after = (await q(`select status, renews_at, paddle_subscription_id from public.orders where id = $1`, [paid.id]))[0];
ok(after.status === "setting_up" && after.paddle_subscription_id === "sub_1", "a Paddle payment moves the request to setting up");
ok(new Date(after.renews_at).toISOString().startsWith("2026-11-09"), "the renewal date follows Paddle's billing period");
const rc = (await q(`select receipt_number, status, method from public.payments where reference = 'txn_1'`))[0];
ok(rc.status === "confirmed" && rc.method === "online_gateway" && /^RCT-/.test(rc.receipt_number), "the payment is confirmed with a receipt number");
await q(`select public.svc_paddle_payment($1::jsonb)`, [JSON.stringify(pay)]);
ok((await q(`select count(*)::int n from public.payments where reference = 'txn_1'`))[0].n === 1, "the same Paddle transaction is recorded once");
await q(`select public.svc_paddle_payment($1::jsonb)`, [JSON.stringify({ ...pay, order_id: "", transaction_id: "txn_2", kind: "subscription", amount: "25.00", period_start: "2026-11-09T00:00:00Z", period_end: "2026-12-09T00:00:00Z", origin: "subscription_recurring" })]);
ok(new Date((await q(`select renews_at from public.orders where id = $1`, [paid.id]))[0].renews_at).toISOString().startsWith("2026-12-09"), "renewals are matched by subscription and extend the request");
await q(`select public.svc_paddle_refund($1::jsonb)`, [JSON.stringify({ transaction_id: "txn_2", adjustment_id: "adj_1", amount: "25.00", currency: "USD" })]);
ok((await q(`select status from public.payments where reference = 'txn_2'`))[0].status === "refunded", "a full Paddle refund marks the payment refunded");
await q(`select public.svc_paddle_subscription($1::jsonb)`, [JSON.stringify({ subscription_id: "sub_1", status: "canceled" })]);
ok((await q(`select status from public.orders where id = $1`, [paid.id]))[0].status === "cancelled", "cancelling in Paddle cancels the request");
// Self-serve products go live on payment
const postP = (await q(`select id from public.products where slug = 'post'`))[0].id;
const starter = (await q(`select id from public.packages where product_id = $1 and slug = 'starter'`, [postP]))[0].id;
await q(`update public.packages set paddle_price_monthly = 'pri_starter_m' where id = $1`, [starter]);
const postOrder = (await as("authenticated", kasun, `insert into public.orders (product_id, package_id, billing_cycle, answers) values ($1, $2, 'monthly', '[]') returning id`, [postP, starter])).rows[0];
await q(`select public.svc_paddle_payment($1::jsonb)`, [JSON.stringify({ order_id: postOrder.id, transaction_id: "txn_3", subscription_id: "sub_3", amount: "19.00", currency: "USD", kind: "subscription", period_end: "2026-11-09T00:00:00Z", origin: "web" })]);
ok((await q(`select status from public.orders where id = $1`, [postOrder.id]))[0].status === "active", "a paid Post request goes straight to active");
ok(Number((await q(`select price_monthly from public.packages where id = $1`, [starter]))[0].price_monthly) === 19, "Post Starter costs US$19 a month");

summary();
