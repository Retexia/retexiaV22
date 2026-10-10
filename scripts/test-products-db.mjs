// Product schemas (0005 post, 0006 lingo): owners only see their own data,
// customers can't touch plans, statuses or the WhatsApp API key, and the
// Retexia team can read for support.
//
//   pnpm db:test
import { readFileSync } from "node:fs";
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
await q(`update post.businesses set settings = settings || '{"playlist": {"posts": 3, "stories": 2, "post_times": ["08:00", "12:00", "18:00"], "story_times": ["10:00", "20:00"]}}' where id = $1`, [biz]);
const slot = (await q(`select * from post.next_free_slot($1)`, [biz]))[0];
ok(slot && slot.scheduled_at > new Date(Date.now() + 19 * 60_000), "the next free slot is in the future");
ok((await q(`select to_char(post.slot_time($1, '2026-10-10', 2) at time zone 'Asia/Colombo', 'HH24:MI') t`, [biz]))[0].t === "12:00", "slot times follow the business's posting times");

console.log("Daily playlist (0013)");
ok((await q(`select to_char(post.item_time($1, '2026-10-10', 2, true) at time zone 'Asia/Colombo', 'HH24:MI') t`, [biz]))[0].t === "20:00", "story times follow the playlist settings");
ok((await q(`select post.default_times(5, false) t`))[0].t.length === 5, "five default post times");
const planDate = "2026-12-01";
const added = (await q(`select post.add_planned_items($1, $2, $3::jsonb) n`, [biz, planDate, JSON.stringify([
  { format: "post", slot: 1, title: "Mango cake", prompt: "Show the new mango cake", caption_language: "si", design_language: "si" },
  { format: "post", slot: 2, prompt: "Behind the scenes" },
  { format: "story", slot: 1, prompt: "Weekend offer story", time: "21:15" },
])]))[0].n;
ok(added === 3, "planned items are added to the playlist");
ok((await q(`select post.add_planned_items($1, $2, $3::jsonb) n`, [biz, planDate, JSON.stringify([{ format: "post", slot: 1, prompt: "dup" }])]))[0].n === 0, "a playlist slot is never filled twice");
const planned = await q(`select id, status::text, slot, is_story, brief, to_char(scheduled_at at time zone 'Asia/Colombo', 'HH24:MI') t from post.posts where business_id = $1 and local_date = $2 order by is_story, slot`, [biz, planDate]);
ok(planned.every((p) => p.status === "planned") && planned[0].t === "08:00" && planned[2].t === "21:15", "planned items get their times (setting or given)");
ok(planned[0].brief.caption_language === "si" && planned[1].brief.design_language === "en", "languages: per item, else the business default");
await expectError(() => as("authenticated", amaya, `select post.add_planned_items($1, $2, '[]'::jsonb)`, [biz, planDate]), "customers can't call playlist functions directly", /permission denied/);

// Designing: an item whose time is close is claimed once.
await q(`update post.businesses set subscription_status = 'active' where id = $1`, [biz]);
await q(`update post.posts set scheduled_at = now() + interval '1 hour' where id = $1`, [planned[0].id]);
const claimed = await q(`select id, status::text from post.claim_design_items(10)`);
ok(claimed.some((c) => c.id === planned[0].id && c.status === "generating"), "planned items close to their time are claimed for design");
ok(!(await q(`select id from post.claim_design_items(10)`)).some((c) => c.id === planned[0].id), "an item being designed is not claimed twice");
const fin = (await q(`select post.finish_design($1::jsonb) r`, [JSON.stringify({ post_id: planned[0].id, business_id: biz, format: "post", storage_path: `${biz}/ai/x.jpg`, bytes: 1000, alt_text: "cake", caption: "කේක්", variants: { facebook: { caption: "කේක්" } }, brief: { headline: "අලුත් කේක්" }, publish: false, image_cost: 0.04, text_cost: 0.002 })]))[0].r;
const designed = (await q(`select status::text, media_id, brief from post.posts where id = $1`, [planned[0].id]))[0];
ok(fin.status === "ready" && designed.media_id && designed.brief.headline === "අලුත් කේක්" && designed.brief.prompt === "Show the new mango cake", "a finished design makes the item ready and keeps its prompt");
const handmade = (await q(`select post.finish_design($1::jsonb) r`, [JSON.stringify({ business_id: biz, format: "story", storage_path: `${biz}/ai/y.jpg`, bytes: 900, publish: true, brief: { prompt: "now" } })]))[0].r;
const mrow = (await q(`select status::text, slot, is_story from post.posts where id = $1`, [handmade.post_id]))[0];
ok(mrow.status === "approved" && mrow.slot >= 6 && mrow.is_story, "a story made by hand goes out now, in a slot outside the playlist");
await q(`delete from post.posts where id = $1`, [planned[1].id]);
ok((await q(`select post.finish_design($1::jsonb) r`, [JSON.stringify({ post_id: planned[1].id, business_id: biz, storage_path: `${biz}/ai/z.jpg` })]))[0].r.status === "gone", "a design for a deleted item changes nothing");
await q(`select post.design_failed($1, 'OpenAI said no')`, [planned[2].id]);
ok((await q(`select status::text, deny_reason from post.posts where id = $1`, [planned[2].id]))[0].deny_reason === "OpenAI said no", "a failed design is shown to the owner with the reason");
await q(`update post.posts set status = 'planned', scheduled_at = now() - interval '1 hour' where id = $1`, [planned[2].id]);
await q(`select post.expire_stale_posts()`);
ok((await q(`select status::text s from post.posts where id = $1`, [planned[2].id]))[0].s === "expired", "items never designed are skipped after their time");

// Planning: the 06:00 run claims each business once a day (pick a time zone where it is past 06:00 now).
const zones = ["UTC", "Asia/Colombo", "Asia/Tokyo", "America/New_York", "Pacific/Auckland", "Europe/London", "America/Los_Angeles"];
const tz = zones.find((z) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: z, hour: "2-digit", hour12: false }).format(new Date())) >= 6);
await q(`update post.businesses set timezone = $2, onboarding_done = true, subscription_status = 'active', last_plan_date = null where id = $1`, [biz, tz]);
await q(`update post.businesses set onboarding_done = false where id <> $1`, [biz]);
const runs = await q(`select * from post.claim_planning_businesses(10)`);
ok(runs.length === 1 && runs[0].business_id === biz, "the 06:00 run picks up the business");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
ok(new Date(runs[0].plan_date).toISOString().slice(0, 10) === new Date(new Date(`${today}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10), "it writes tomorrow's playlist");
ok((await q(`select * from post.claim_planning_businesses(10)`)).length === 0, "and only once a day");
ok(runs[0].plan_today === true, "every run also fills today's empty slots");

console.log("Planning time, auto publish, WhatsApp (0014)");
await q(`update post.businesses set last_plan_date = null, settings = jsonb_set(settings, '{playlist,plan_time}', '"23:59"') where id = $1`, [biz]);
const lateNow = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(":", "")) >= 2359;
ok(lateNow || (await q(`select * from post.claim_planning_businesses(10)`)).length === 0, "the run waits for the business's own planning time");
await q(`update post.businesses set settings = jsonb_set(settings, '{playlist,plan_time}', '"00:00"') where id = $1`, [biz]);
ok((await q(`select * from post.claim_planning_businesses(10)`)).length === 1, "an earlier planning time runs straight away (to try it out)");
await q(`update post.businesses set settings = jsonb_set(settings, '{playlist,plan_time}', '"9am"'), last_plan_date = null where id = $1`, [biz]);
ok((await q(`select * from post.claim_planning_businesses(10)`)).length <= 1, "a broken planning time falls back to 06:00 instead of failing");
await q(`update post.businesses set category = 'Alcohol', settings = jsonb_set(settings, '{auto_publish}', 'false') where id = $1`, [biz]);
await db.exec(readFileSync(new URL("../supabase/migrations/0014_post_today_whatsapp.sql", import.meta.url), "utf8"));
ok((await q(`select settings ->> 'auto_publish' a from post.businesses where id = $1`, [biz]))[0].a === "true", "businesses held back by their type publish automatically again");
await q(`update post.posts set wa_media_id = media_id, wa_alert = 'failed', wa_published_at = now() where business_id = $1`, [biz]);
ok(true, "WhatsApp bookkeeping columns exist");

console.log("Focus and product groups (0015)");
const [cake, bun, soap] = (await q(`insert into post.products (business_id, name, price, currency) values ($1, 'Chocolate cake', 2500, 'LKR'), ($1, 'Fish bun', 150, 'LKR'), ($1, 'Soap', 400, 'LKR') returning id`, [biz])).map((r) => r.id);
const grp = (await as("authenticated", amaya, `insert into post.product_groups (business_id, name, product_ids) values ($1, 'Bakery', $2) returning id`, [biz, [cake, bun]])).rows[0].id;
ok(Boolean(grp), "owners can make groups of their products");
await expectError(() => as("authenticated", kasun, `insert into post.product_groups (business_id, name) values ($1, 'Hack')`, [biz]), "nobody else can add groups to a business", /row-level security|permission denied/);
ok((await as("authenticated", kasun, `select id from post.product_groups`)).rows.length === 0, "and nobody else sees them");
const one = (await q(`select post.design_context($1, $2::jsonb) c`, [biz, JSON.stringify({ type: "product", id: cake })]))[0].c;
ok(one.products.length === 1 && one.products[0].name === "Chocolate cake" && one.focus.name === "Chocolate cake", "a post about one product only shows the AI that product");
const grpCtx = (await q(`select post.design_context($1, $2::jsonb) c`, [biz, JSON.stringify({ type: "group", id: grp })]))[0].c;
ok(grpCtx.products.length === 2 && !grpCtx.products.some((p) => p.name === "Soap") && grpCtx.focus.type === "group", "a post about a group shows only the group's products");
const whole = (await q(`select post.design_context($1, $2::jsonb) c`, [biz, JSON.stringify({ type: "business" })]))[0].c;
ok(whole.focus.type === "business" && whole.products.length >= 3 && "brand_brief" in whole.business, "a post about the whole business gets the About summary and all products");
const stray = (await q(`select post.design_context($1, $2::jsonb) c`, [biz, JSON.stringify({ type: "product", id: "00000000-0000-4000-8000-000000000000" })]))[0].c;
ok(stray.focus.type === "business", "an unknown or deleted product falls back to the whole business");
ok((await q(`select post.design_context($1) c`, [biz]))[0].c.business.name === "Amaya Cakes", "the old one-argument call still works");
await q(`delete from post.products where id = $1`, [bun]);
ok((await q(`select product_ids from post.product_groups where id = $1`, [grp]))[0].product_ids.length === 1, "a deleted product leaves its groups");
await q(`delete from post.posts where business_id = $1 and local_date = '2026-12-20'`, [biz]);
await q(`select post.add_planned_items($1, '2026-12-20', $2::jsonb)`, [biz, JSON.stringify([{ format: "post", slot: 1, prompt: "Cake", focus: { type: "product", id: cake, name: "Chocolate cake" } }])]);
ok((await q(`select brief from post.posts where business_id = $1 and local_date = '2026-12-20'`, [biz]))[0].brief.focus.id === cake, "playlist items keep their focus");
const ctx = (await q(`select post.plan_context($1, $2) c`, [biz, planDate]))[0].c;
ok(ctx.business.name && Array.isArray(ctx.products) && Array.isArray(ctx.offers) && Array.isArray(ctx.recent_prompts), "the AI gets the business, products, offers and recent prompts in one query");

console.log("Paddle (0009)");
const lingoP = (await q(`select id from public.products where slug = 'lingo'`))[0].id;
const corePk = (await q(`select id from public.packages where product_id = $1 and slug = 'core'`, [lingoP]))[0].id;
await q(`update public.packages set paddle_price_monthly = 'pri_core_m', paddle_price_setup = 'pri_core_setup' where id = $1`, [corePk]);
const paid = (await as("authenticated", kasun, `insert into public.orders (product_id, package_id, billing_cycle, answers) values ($1, $2, 'monthly', '[]') returning id, status, currency`, [lingoP, corePk])).rows[0];
ok(paid.status === "awaiting_payment" && paid.currency === "USD", "with online payments on, a new request waits for payment, in USD (no Paddle catalog needed)");
const webP = (await q(`insert into public.products (slug, code, name, short_name, status, pay_online) values ('custom-dev', 'CDV', 'Custom development', 'Custom', 'live', false) returning id`))[0].id;
const webPk = (await q(`insert into public.packages (product_id, slug, name, price_monthly, is_active) values ($1, 'basic', 'Basic', 100, true) returning id`, [webP]))[0].id;
const manual = (await as("authenticated", kasun, `insert into public.orders (product_id, package_id, billing_cycle, answers) values ($1, $2, 'monthly', '[]') returning status`, [webP, webPk])).rows[0];
ok(manual.status === "submitted", "products with Paddle turned off wait for review instead");
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

console.log("PayHere (0012)");
const phOrder = (await as("authenticated", kasun, `insert into public.orders (product_id, package_id, billing_cycle, answers) values ($1, $2, 'monthly', '[]') returning id, ref`, [lingoP, corePk])).rows[0];
await expectError(() => as("authenticated", kasun, `select public.svc_payhere_payment('{}'::jsonb)`), "customers can't record PayHere payments", /permission denied/);
await q(`select public.svc_payhere_payment($1::jsonb)`, [JSON.stringify({ order_id: phOrder.id, transaction_id: "ph_1001", subscription_id: "420075000001", amount: "64.00", currency: "USD", kind: "setup_fee", origin: "web", period_end: "2026-11-09T00:00:00Z" })]);
const ph = (await q(`select status, payhere_subscription_id from public.orders where id = $1`, [phOrder.id]))[0];
ok(ph.status === "setting_up" && ph.payhere_subscription_id === "420075000001", "a PayHere payment moves the request on and keeps its subscription");
await q(`select public.svc_payhere_payment($1::jsonb)`, [JSON.stringify({ subscription_id: "420075000001", transaction_id: "ph_1002", amount: "25.00", currency: "USD", kind: "subscription", origin: "subscription_recurring", period_end: "2026-12-09T00:00:00Z" })]);
ok((await q(`select count(*)::int n from public.payments where order_id = $1 and status = 'confirmed'`, [phOrder.id]))[0].n === 2, "PayHere renewals are matched by subscription");
await q(`select public.svc_payhere_subscription($1::jsonb)`, [JSON.stringify({ subscription_id: "420075000001", status: "canceled" })]);
ok((await q(`select status from public.orders where id = $1`, [phOrder.id]))[0].status === "cancelled", "a stopped PayHere subscription cancels the request");

summary();
