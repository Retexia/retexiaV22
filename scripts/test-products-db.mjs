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
console.log("Real product photos in designs (0024)");
const photo = (product, path, source = "upload", ago = 0) =>
  q(`insert into post.media (business_id, product_id, kind, source, storage_path, created_at) values ($1, $2, 'photo', $3, $4, now() - make_interval(mins => $5))`, [biz, product, source, path, ago]);
for (const [i, n] of ["a", "b", "c", "d"].entries()) await photo(cake, `${biz}/uploads/cake-${n}.jpg`, "upload", 10 - i);
await photo(cake, `${biz}/ai/cake-design.jpg`, "ai", 20);
await photo(bun, `${biz}/uploads/bun.jpg`);
const withPhotos = (await q(`select post.design_context($1, $2::jsonb) c`, [biz, JSON.stringify({ type: "product", id: cake })]))[0].c;
ok(withPhotos.photos.length === 3 && withPhotos.photos[0].endsWith("cake-a.jpg"), "a product post gets the owner's own photos of it (first 3)");
ok(!withPhotos.photos.some((p) => p.includes("/ai/")), "AI designs are never used as the product photo");
const grpPhotos = (await q(`select post.design_context($1, $2::jsonb) c`, [biz, JSON.stringify({ type: "group", id: grp })]))[0].c;
ok(grpPhotos.photos.length === 2 && grpPhotos.photos.some((p) => p.endsWith("bun.jpg")), "a group post gets one photo of each product");
ok((await q(`select post.design_context($1, $2::jsonb) c`, [biz, JSON.stringify({ type: "business" })]))[0].c.photos.length === 0, "a whole-business post gets no product photo");
ok((await q(`select post.design_context($1, $2::jsonb) c`, [biz, JSON.stringify({ type: "product", id: soap })]))[0].c.photos.length === 0, "a product without photos gets none (designed from text)");
await q(`delete from post.media where business_id = $1`, [biz]);

await q(`delete from post.products where id = $1`, [bun]);
ok((await q(`select product_ids from post.product_groups where id = $1`, [grp]))[0].product_ids.length === 1, "a deleted product leaves its groups");
await q(`delete from post.posts where business_id = $1 and local_date = '2026-12-20'`, [biz]);
await q(`select post.add_planned_items($1, '2026-12-20', $2::jsonb)`, [biz, JSON.stringify([{ format: "post", slot: 1, prompt: "Cake", focus: { type: "product", id: cake, name: "Chocolate cake" } }])]);
ok((await q(`select brief from post.posts where business_id = $1 and local_date = '2026-12-20'`, [biz]))[0].brief.focus.id === cake, "playlist items keep their focus");

console.log("n8n worker: accounts, publishing, delete, edit (0016)");
await q(`update post.businesses set settings = settings || '{"paused": false, "auto_publish": true}', subscription_status = 'active' where id = $1`, [biz]);
await q(`delete from post.social_accounts where business_id = $1`, [biz]);
await expectError(() => as("authenticated", amaya, `select * from post.admin_connect_page($1, 'page1', 'TOKEN')`, [biz]), "customers can't add accounts or tokens", /permission denied/);
const conn = await q(`select * from post.admin_connect_page($1, 'page1', 'PAGE-TOKEN-1', 'ig1', 'Amaya Cakes', 'amayacakes')`, [biz]);
ok(conn.length === 2 && conn.every((c) => c.status === "connected"), "Retexia adds a customer's Facebook Page and Instagram with one call");
const acc = await q(`select platform::text, token_secret_id, display_name from post.social_accounts where business_id = $1 order by platform`, [biz]);
ok(acc[0].token_secret_id && acc[0].token_secret_id === acc[1].token_secret_id && (await q(`select post.read_secret($1) t`, [acc[0].token_secret_id]))[0].t === "PAGE-TOKEN-1", "the token is kept in Vault, shared by the Page and its Instagram");
await q(`select * from post.admin_connect_page($1, 'page1', 'PAGE-TOKEN-2')`, [biz]);
ok((await q(`select post.read_secret($1) t`, [acc[0].token_secret_id]))[0].t === "PAGE-TOKEN-2" && (await q(`select count(*)::int n from post.social_accounts where business_id = $1`, [biz]))[0].n === 2, "running it again replaces the token (no duplicates)");
const overview = await q(`select * from post.admin_accounts where business_id = $1`, [biz]);
ok(overview.length === 2 && overview.every((r) => r.has_token && !("token" in r) && r.owner_email), "the overview shows who is ready to post (owner email, no tokens)");
await expectError(() => as("authenticated", amaya, `select * from post.admin_accounts`), "customers can't read the overview", /permission denied/);

const pic = (await q(`insert into post.media (business_id, kind, source, storage_path) values ($1, 'photo', 'ai', $2) returning id`, [biz, `${biz}/ai/pub.jpg`]))[0].id;
await q(`update post.posts set status = 'expired' where business_id = $1 and status::text in ('ready', 'approved', 'publishing')`, [biz]);
const due = (await q(`insert into post.posts (business_id, local_date, slot, format, scheduled_at, status, caption, variants, media_id) values ($1, '2027-01-05', 1, 'photo', now() - interval '1 minute', 'ready', 'Hello', '{"facebook": {"caption": "FB text"}, "instagram": {"caption": "IG text #cake"}}', $2) returning id`, [biz, pic]))[0].id;
ok((await q(`select * from post.worker_publish_rows($1)`, [due])).length === 0, "n8n gets nothing for a post the website hasn't claimed");
ok((await q(`select id from post.claim_due_posts(20)`)).some((r) => r.id === due), "the website claims the due post");
await expectError(() => as("authenticated", amaya, `select * from post.worker_publish_rows($1)`, [due]), "customers can't read publishing jobs (they carry tokens)", /permission denied/);
const jobs = await q(`select * from post.worker_publish_rows($1)`, [due]);
ok(jobs.length === 2 && jobs.every((j) => j.token === "PAGE-TOKEN-2" && j.storage_path.endsWith("pub.jpg")), "n8n gets one job per account with the customer's token");
ok(jobs.find((j) => j.platform === "facebook").caption === "FB text" && jobs.find((j) => j.platform === "instagram").caption === "IG text #cake", "each platform gets its own caption");
ok((await q(`select * from post.worker_publish_rows($1)`, [due])).length === 0, "the same job twice never posts twice");
const fbJob = jobs.find((j) => j.platform === "facebook");
const igJob = jobs.find((j) => j.platform === "instagram");
let r1 = (await q(`select post.n8n_publish_result($1::jsonb) r`, [JSON.stringify({ publication_id: fbJob.publication_id, ok: true, external_id: "page1_99" })]))[0].r;
ok(r1.post_status === "publishing", "the post waits until every account has answered");
r1 = (await q(`select post.n8n_publish_result($1::jsonb) r`, [JSON.stringify({ publication_id: igJob.publication_id, ok: false, error_kind: "temporary", error: "Media not ready" })]))[0].r;
const retryRow = (await q(`select status::text s, scheduled_at > now() + interval '90 seconds' later from post.posts where id = $1`, [due]))[0];
ok(r1.post_status === "retrying" && retryRow.s === "approved" && retryRow.later, "a temporary error is tried again in 2 minutes");
await q(`update post.posts set scheduled_at = now() - interval '1 second' where id = $1`, [due]);
await q(`select post.claim_due_posts(20)`);
const again = await q(`select * from post.worker_publish_rows($1)`, [due]);
ok(again.length === 1 && again[0].platform === "instagram" && again[0].attempt === 2, "the retry only posts to the account that failed");
await q(`select post.n8n_publish_result($1::jsonb)`, [JSON.stringify({ publication_id: again[0].publication_id, ok: true, external_id: "ig_77" })]);
ok((await q(`select status::text s from post.posts where id = $1`, [due]))[0].s === "published", "when every account is done the post is published");

// Delete and edit (n8n does the Meta calls)
await expectError(() => as("authenticated", amaya, `select * from post.worker_delete_rows($1)`, [due]), "customers can't read delete jobs", /permission denied/);
const del = await q(`select * from post.worker_delete_rows($1)`, [due]);
ok(del.length === 2 && del.every((d) => d.token === "PAGE-TOKEN-2" && d.external_id), "delete: where the post is online, with the token");
const edits = await q(`select * from post.worker_edit_rows($1)`, [due]);
ok(edits.length === 1 && edits[0].external_id === "page1_99", "edit: only the Facebook post (Instagram can't be edited)");
await q(`select post.worker_delete_result($1::jsonb)`, [JSON.stringify({ publication_id: del[0].publication_id, ok: true })]);
ok((await q(`select status::text s from post.posts where id = $1`, [due]))[0].s === "published", "half deleted: still published");
await q(`select post.worker_delete_result($1::jsonb)`, [JSON.stringify({ publication_id: del[1].publication_id, ok: true })]);
ok((await q(`select status::text s from post.posts where id = $1`, [due]))[0].s === "removed", "deleted everywhere: removed");

// Lost access, no accounts, stuck
const due2 = (await q(`insert into post.posts (business_id, local_date, slot, format, scheduled_at, status, caption, media_id) values ($1, '2027-01-05', 2, 'photo', now() - interval '1 minute', 'approved', 'x', $2) returning id`, [biz, pic]))[0].id;
await q(`select post.claim_due_posts(20)`);
for (const j of await q(`select * from post.worker_publish_rows($1)`, [due2])) await q(`select post.n8n_publish_result($1::jsonb)`, [JSON.stringify({ publication_id: j.publication_id, ok: false, error_kind: "needs_user", error: "Token expired" })]);
ok((await q(`select deny_reason from post.posts where id = $1`, [due2]))[0].deny_reason === "Token expired", "lost access fails the post with the reason");
ok((await q(`select count(*)::int n from post.social_accounts where business_id = $1 and status = 'reconnect_needed'`, [biz]))[0].n === 2, "and marks the accounts \"reconnect needed\"");
await q(`select * from post.admin_connect_page($1, 'page1', 'PAGE-TOKEN-3', 'ig1')`, [biz]);
ok((await q(`select count(*)::int n from post.social_accounts where business_id = $1 and status = 'connected'`, [biz]))[0].n === 2, "a new token reconnects them");
await q(`update post.social_accounts set enabled = false where business_id = $1`, [biz]);
const due3 = (await q(`insert into post.posts (business_id, local_date, slot, format, scheduled_at, status, media_id) values ($1, '2027-01-05', 3, 'photo', now() - interval '1 minute', 'approved', $2) returning id`, [biz, pic]))[0].id;
await q(`select post.claim_due_posts(20)`);
ok((await q(`select * from post.worker_publish_rows($1)`, [due3])).length === 0 && (await q(`select deny_reason from post.posts where id = $1`, [due3]))[0].deny_reason.startsWith("No Facebook or Instagram account"), "with no connected account the post fails and says why");
await q(`update post.social_accounts set enabled = true where business_id = $1`, [biz]);
const stuck = (await q(`insert into post.posts (business_id, local_date, slot, format, scheduled_at, status, media_id) values ($1, '2027-01-05', 4, 'photo', now() - interval '1 hour', 'approved', $2) returning id`, [biz, pic]))[0].id;
await q(`select post.claim_due_posts(20)`);
await q(`select * from post.worker_publish_rows($1)`, [stuck]);
await q(`alter table post.posts disable trigger posts_updated`);
await q(`update post.posts set updated_at = now() - interval '30 minutes' where id = $1`, [stuck]);
await q(`alter table post.posts enable trigger posts_updated`);
ok((await q(`select post.recover_publishing() n`))[0].n >= 1 && (await q(`select status::text s from post.posts where id = $1`, [stuck]))[0].s === "approved", "a publish that never came back is tried again");

console.log("Connect Facebook & Instagram (0019)");
await q(`update post.businesses set plan = 'starter' where id = $1`, [biz]);
await q(`select * from post.admin_connect_page($1, 'page1', 'T1', 'ig1', 'Amaya Cakes', 'amayacakes')`, [biz]);
await q(`select * from post.admin_connect_page($1, 'page2', 'T2', 'ig2', 'Second Page', 'second')`, [biz]);
const before = (await q(`select count(*)::int n from post.social_accounts where business_id = $1 and enabled and status = 'connected'`, [biz]))[0].n;
const off = (await q(`select post.enforce_account_limit($1) n`, [biz]))[0].n;
const on = await q(`select external_id from post.social_accounts where business_id = $1 and enabled and status = 'connected' order by external_id`, [biz]);
ok(before === 4 && off === 2 && on.length === 2, "connecting more accounts than the plan allows switches the extra ones off");
ok(on.map((r) => r.external_id).join(",") === "ig2,page2", "the accounts connected last stay on");
ok((await q(`select post.enforce_account_limit($1) n`, [biz]))[0].n === 0, "running it again changes nothing");
await expectError(() => as("authenticated", amaya, `select post.enforce_account_limit($1)`, [biz]), "customers can't run it", /permission denied/);
ok((await q(`select has_function_privilege('post_n8n', 'post.admin_connect_page(uuid, text, text, text, text, text)', 'execute') ok`))[0].ok, "the n8n worker may save connected Pages");

console.log("Payment methods: bank transfer and card (0020)");
const lingoP = (await q(`select id from public.products where slug = 'lingo'`))[0].id;
const corePk = (await q(`select id from public.packages where product_id = $1 and slug = 'core'`, [lingoP]))[0].id;
const methods = await q(`select key, status, is_default from public.payment_methods order by sort_order`);
ok(methods.length === 2 && methods[0].key === "bank_transfer" && methods[0].is_default && methods[0].status === "active", "bank transfer is the default payment method");
ok(methods[1].key === "card" && methods[1].status === "coming_soon", "card starts as coming soon");
ok((await as("anon", null, `select key from public.payment_methods`)).rows.length === 2, "visitors can see the payment methods");
await expectError(() => as("authenticated", kasun, `update public.payment_methods set status = 'off' where key = 'card'`).then((r) => { if (!r.rowCount) throw new Error("permission denied (no rows)"); }), "customers can't change payment methods", /permission denied|no rows/);
await expectError(() => as("authenticated", kasun, `select public.set_default_payment_method('card')`), "customers can't change the default", /Only an admin/);
await expectError(() => q(`select public.set_default_payment_method('card')`), "a method must be active before it can be the default", /Switch the method on/);
await expectError(() => q(`update public.payment_methods set status = 'off' where key = 'bank_transfer'`), "the default method can't be switched off", /payment_methods_default_active/);

const paid = (await as("authenticated", kasun, `insert into public.orders (product_id, package_id, billing_cycle, answers) values ($1, $2, 'monthly', '[]') returning id, ref, status, currency, payment_method`, [lingoP, corePk])).rows[0];
ok(paid.status === "awaiting_payment" && paid.currency === "LKR" && paid.payment_method === "bank_transfer", "a new request waits for payment, in LKR, by bank transfer (the default)");
await expectError(() => as("authenticated", kasun, `select public.customer_set_payment_method($1, 'card')`, [paid.id]), "a coming-soon method can't be chosen", /not available/);
await q(`update public.payment_methods set status = 'active' where key = 'card'`);
await as("authenticated", kasun, `select public.customer_set_payment_method($1, 'card')`, [paid.id]);
ok((await q(`select payment_method from public.orders where id = $1`, [paid.id]))[0].payment_method === "card", "once card is active the customer can switch to it");
await q(`select public.set_default_payment_method('card')`);
ok((await q(`select key from public.payment_methods where is_default`)).map((r) => r.key).join() === "card", "the admin can change the default");
await q(`select public.set_default_payment_method('bank_transfer')`);
await as("authenticated", kasun, `select public.customer_set_payment_method($1, 'bank_transfer')`, [paid.id]);

const webP = (await q(`insert into public.products (slug, code, name, short_name, status, pay_online) values ('custom-dev', 'CDV', 'Custom development', 'Custom', 'live', false) returning id`))[0].id;
const webPk = (await q(`insert into public.packages (product_id, slug, name, price_monthly, is_active) values ($1, 'basic', 'Basic', 100, true) returning id`, [webP]))[0].id;
const manual = (await as("authenticated", kasun, `insert into public.orders (product_id, package_id, billing_cycle, answers) values ($1, $2, 'monthly', '[]') returning status`, [webP, webPk])).rows[0];
ok(manual.status === "submitted", "products set to review first wait for the team instead");

// Bank transfer: slip → the team confirms → the request moves on
const slip = await as("authenticated", kasun, `select public.customer_submit_payment_proof($1, $2, 'BOC 12345', 'Paid today') id`, [paid.id, `${kasun}/${paid.id}/slip.jpg`]);
const slipId = slip.rows[0].id;
const pending = (await q(`select status, method, amount from public.payments where id = $1`, [slipId]))[0];
ok(pending.status === "pending" && pending.method === "bank_transfer" && Number(pending.amount) === 6900 + 9900, "the customer's slip waits for the team (setup fee + first month)");
ok((await q(`select status from public.orders where id = $1`, [paid.id]))[0].status === "awaiting_payment", "the request waits until the slip is confirmed");
await q(`update public.payments set status = 'failed', review_note = 'The amount is different.' where id = $1`, [slipId]);
const told = await q(`select body from public.notifications_outbox where order_id = $1 and event = 'payment.rejected'`, [paid.id]);
ok(told.length === 1 && told[0].body.includes("The amount is different."), "rejecting a slip tells the customer why");
ok((await as("authenticated", kasun, `select status, review_note from public.payments where id = $1`, [slipId])).rows[0]?.review_note === "The amount is different.", "the customer sees the rejected slip and the reason");
const slip2 = (await as("authenticated", kasun, `select public.customer_submit_payment_proof($1, $2, 'BOC 12346', null) id`, [paid.id, `${kasun}/${paid.id}/slip2.jpg`])).rows[0].id;
await q(`update public.payments set status = 'confirmed' where id = $1`, [slip2]);
const afterSlip = (await q(`select status from public.orders where id = $1`, [paid.id]))[0];
ok(afterSlip.status === "setting_up", "confirming the slip moves the request to setting up");
ok(/^RCT-/.test((await q(`select receipt_number from public.payments where id = $1`, [slip2]))[0].receipt_number), "with a receipt");

// Card (PayHere): self-serve products go live on payment
const postP = (await q(`select id from public.products where slug = 'post'`))[0].id;
const starter = (await q(`select id from public.packages where product_id = $1 and slug = 'starter'`, [postP]))[0].id;
const postOrder = (await as("authenticated", kasun, `insert into public.orders (product_id, package_id, billing_cycle, answers) values ($1, $2, 'monthly', '[]') returning id`, [postP, starter])).rows[0];
await expectError(() => as("authenticated", kasun, `select public.svc_gateway_payment('{}'::jsonb)`), "customers can't record card payments", /permission denied/);
const pay = { order_id: postOrder.id, transaction_id: "card_1", amount: "5900.00", currency: "lkr", kind: "setup_fee", period_start: "2026-10-09T00:00:00Z", period_end: "2026-11-09T00:00:00Z", origin: "web" };
await q(`select public.svc_gateway_payment($1::jsonb)`, [JSON.stringify(pay)]);
const afterCard = (await q(`select status, payment_method, renews_at from public.orders where id = $1`, [postOrder.id]))[0];
ok(afterCard.status === "active" && afterCard.payment_method === "card", "a card payment for Post goes straight to active (the panel opens)");
ok((await q(`select note from public.order_events where order_id = $1 and to_status = 'active'`, [postOrder.id]))[0]?.note?.includes("https://post.retexia.com"), "the live message links to the Post panel");
ok(new Date(afterCard.renews_at).toISOString().startsWith("2026-11-09"), "the renewal date follows the paid period");
await q(`select public.svc_gateway_payment($1::jsonb)`, [JSON.stringify(pay)]);
ok((await q(`select count(*)::int n from public.payments where reference = 'card_1'`))[0].n === 1, "the same card payment is recorded once");
await q(`select public.svc_gateway_refund($1::jsonb)`, [JSON.stringify({ transaction_id: "card_1", adjustment_id: "card_1:refund", amount: "5900.00", currency: "LKR" })]);
ok((await q(`select status from public.payments where reference = 'card_1'`))[0].status === "refunded", "a full refund marks the payment refunded");
ok(Number((await q(`select price_monthly from public.packages where id = $1`, [starter]))[0].price_monthly) === 5900, "Post Starter costs LKR 5,900 a month");
ok((await q(`select count(*)::int n from information_schema.columns where table_schema = 'public' and column_name like 'paddle%'`))[0].n === 0 && (await q(`select to_regclass('public.paddle_events') t`))[0].t === null, "Paddle is gone from the database");

console.log("PayHere (0012)");
const phOrder = (await as("authenticated", kasun, `insert into public.orders (product_id, package_id, billing_cycle, answers) values ($1, $2, 'monthly', '[]') returning id, ref, currency`, [lingoP, corePk])).rows[0];
ok(phOrder.currency === "LKR", "PayHere requests are priced in LKR");
await expectError(() => as("authenticated", kasun, `select public.svc_payhere_payment('{}'::jsonb)`), "customers can't record PayHere payments", /permission denied/);
await q(`select public.svc_payhere_payment($1::jsonb)`, [JSON.stringify({ order_id: phOrder.id, transaction_id: "ph_1001", subscription_id: "420075000001", amount: "16800.00", currency: "LKR", kind: "setup_fee", origin: "web", period_end: "2026-11-09T00:00:00Z" })]);
const ph = (await q(`select status, payhere_subscription_id from public.orders where id = $1`, [phOrder.id]))[0];
ok(ph.status === "setting_up" && ph.payhere_subscription_id === "420075000001", "a PayHere payment moves the request on and keeps its subscription");
await q(`select public.svc_payhere_payment($1::jsonb)`, [JSON.stringify({ subscription_id: "420075000001", transaction_id: "ph_1002", amount: "6900.00", currency: "LKR", kind: "subscription", origin: "subscription_recurring", period_end: "2026-12-09T00:00:00Z" })]);
ok((await q(`select count(*)::int n from public.payments where order_id = $1 and status = 'confirmed'`, [phOrder.id]))[0].n === 2, "PayHere renewals are matched by subscription");
await q(`select public.svc_payhere_subscription($1::jsonb)`, [JSON.stringify({ subscription_id: "420075000001", status: "canceled" })]);
ok((await q(`select status from public.orders where id = $1`, [phOrder.id]))[0].status === "cancelled", "a stopped PayHere subscription cancels the request");

console.log("Feeder: products, customers, form names (0027)");
ok((await as("authenticated", amaya, `select count(*)::int n from feeder.products`)).rows[0].n === 169, "customers can read the 169 Feeder products");
ok((await q(`select product_name, price::int p from feeder.products where product_id = 433`))[0].p === 1340, "Feeder product IDs are the primary key (433 = Ayora Diabetic Care)");
await as("authenticated", amaya, `insert into feeder.customers (user_id, name, crm_links) values ($1, 'Amaya', array['https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz/edit#gid=0'])`, [amaya]);
await as("authenticated", amaya, `insert into feeder.customer_products (user_id, product_id, form_names, price) values ($1, 433, array['Diabetic 1340', 'Sugar care form'], 1490)`, [amaya]);
await as("authenticated", kasun, `insert into feeder.customers (user_id, name) values ($1, 'Kasun')`, [kasun]);
await as("authenticated", kasun, `insert into feeder.customer_products (user_id, product_id, form_names) values ($1, 433, array['Diabetes tablets'])`, [kasun]);
ok((await as("authenticated", kasun, `select user_id from feeder.customers`)).rows.length === 1, "customers only see their own Feeder row");
ok((await as("authenticated", kasun, `select product_id from feeder.customer_products`)).rows.length === 1, "and only their own products and form names");
await expectError(
  () => as("authenticated", kasun, `insert into feeder.customer_products (user_id, product_id, form_names) values ($1, 436, array['x'])`, [amaya]),
  "nobody can add products or form names for another customer",
  /row-level security/,
);
await expectError(() => as("authenticated", amaya, `update feeder.products set price = 1 where product_id = 433`), "customers can't change Feeder prices", /permission denied/);
const ov = (await q(`select form_names from feeder.products_overview where product_id = 433`))[0].form_names;
ok(ov.length === 3 && ov.includes("Diabetic 1340 (Amaya)") && ov.includes("Diabetes tablets (Kasun)"), "products_overview lists every customer's form names with who they belong to");
const co = (await q(`select name, crm_links, product_ids from feeder.customers_overview where user_id = $1`, [amaya]))[0];
ok(co.product_ids.length === 1 && co.product_ids[0] === 433 && co.crm_links.length === 1, "customers_overview: name | CRM links | product IDs");
await db.exec(readFileSync(new URL("../supabase/migrations/0027_feeder_products_customers.sql", import.meta.url), "utf8"));
ok((await q(`select count(*)::int n from feeder.customer_products`))[0].n === 2, "running 0027 again keeps customers' products and form names");

console.log("Feeder: form names become aliases, one package (0028)");
const aliases = async (id) => (await q(`select aliases from feeder.products where product_id = $1`, [id]))[0].aliases;
let a433 = await aliases(433);
ok(a433.includes("Diabetic 1340") && a433.includes("Diabetes tablets") && a433.includes("Sugar Tablet"), "customers' form names are added to the product's aliases (the built-in ones stay)");
await as("authenticated", amaya, `update feeder.customer_products set form_names = array['Sugar care form', 'diabetic 1340'] where user_id = $1 and product_id = 433`, [amaya]);
ok((await aliases(433)).filter((x) => x.toLowerCase() === "diabetic 1340").length === 1, "the same name in other capitals isn't added twice");
await as("authenticated", amaya, `update feeder.customer_products set form_names = array['Sugar care form'] where user_id = $1 and product_id = 433`, [amaya]);
a433 = await aliases(433);
ok(!a433.some((x) => x.toLowerCase() === "diabetic 1340") && a433.includes("Sugar care form"), "a removed form name leaves the aliases");
await as("authenticated", kasun, `insert into feeder.customer_products (user_id, product_id, form_names) values ($1, 436, array['Sugar care form'])`, [kasun]);
await as("authenticated", amaya, `delete from feeder.customer_products where user_id = $1 and product_id = 433`, [amaya]);
ok(!(await aliases(433)).includes("Sugar care form") && (await aliases(433)).includes("Diabetes tablets"), "deleting a product takes its form names out; other customers' names stay");
ok((await aliases(436)).includes("Sugar care form"), "the same name on another product is kept there");
await q(`insert into public.products (slug, code, name, short_name, status) values ('feeder', 'FDR', 'Retexia Feeder', 'Feeder', 'live') on conflict (slug) do nothing`);
await q(`insert into public.packages (product_id, slug, name, price_monthly) select id, 'bulk-import', 'Bulk import', 1500 from public.products where slug = 'feeder'`);
await db.exec(readFileSync(new URL("../supabase/migrations/0026_feeder_bulk_import_v2.sql", import.meta.url), "utf8"));
await db.exec(readFileSync(new URL("../supabase/migrations/0028_feeder_form_aliases_one_package.sql", import.meta.url), "utf8"));
const fp = (await q(`select k.slug, k.name, k.price_monthly::int price, k.is_active, k.is_visible from public.packages k join public.products p on p.id = k.product_id where p.slug = 'feeder' order by k.slug`));
ok(fp.length === 2 && fp.find((x) => x.slug === "bulk-import-v2").name === "Bulk create v2" && fp.find((x) => x.slug === "bulk-import-v2").price === 1900, "Feeder is one package: Bulk create v2, LKR 1,900");
ok(fp.find((x) => x.slug === "bulk-import").is_visible === false && fp.find((x) => x.slug === "bulk-import").is_active === false, "the old Bulk import package is hidden and closed to new orders");

summary();
