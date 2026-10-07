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

summary();
