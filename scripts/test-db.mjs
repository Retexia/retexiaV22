// Runs every supabase/migrations/*.sql file and supabase/seed.sql twice against an
// in-memory Postgres (PGlite) that mimics Supabase's auth/storage schemas and
// API roles, then checks the security rules (RLS, triggers, RPCs).
//
//   pnpm db:test
//
// This is a fast safety net. The real thing is still `supabase db reset`.
import { createHarness, migration, seed, template } from "./lib/harness.mjs";

const { db, ok, expectError, as, summary } = await createHarness();

// --- 1. Migration and seed, twice --------------------------------------------
console.log("Migration and seed");
for (const round of [1, 2]) {
  await db.exec(migration);
  ok(true, `migration run ${round}`);
  await db.exec(seed);
  ok(true, `seed run ${round}`);
}

const count = async (table) => (await db.query(`select count(*)::int as n from ${table}`)).rows[0].n;
ok((await count("public.products")) === 2, "2 products");
ok((await count("public.packages")) === 6, "6 packages (Lingo 3, Post 3)");
ok((await count("public.package_features")) === 50, "50 package features");
ok((await count("public.form_fields")) === 35, "35 onboarding fields (Lingo 24, Post 11)");
ok((await count("public.form_steps")) === 5, "5 onboarding steps");
ok((await count("public.services")) === 6, "6 services");
ok((await count("public.pages")) === 7, "7 pages");
ok((await count("public.order_statuses")) === 8, "8 order statuses");
ok((await count("public.site_strings")) > 50, "site strings seeded");
const formLink = await db.query(
  `select f.slug from public.products p join public.forms f on f.id = p.onboarding_form_id where p.slug = 'lingo'`,
);
ok(formLink.rows[0]?.slug === "lingo-onboarding", "Lingo points at its onboarding form");
const fieldFormIds = await db.query(`select count(*)::int as n from public.form_fields where form_id is null`);
ok(fieldFormIds.rows[0].n === 0, "form_fields.form_id filled from step");

// --- 2. Users and profiles ---------------------------------------------------
console.log("Profiles");
const userA = (
  await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ('a@example.com', '{"full_name":"Amaya Silva"}') returning id`,
  )
).rows[0].id;
const userB = (await db.query(`insert into auth.users (email) values ('b@example.com') returning id`)).rows[0].id;
const adminId = (await db.query(`insert into auth.users (email) values ('admin@example.com') returning id`)).rows[0].id;
await db.query(`update public.profiles set role = 'admin' where id = $1`, [adminId]);

const profA = await as("authenticated", userA, `select full_name, email, role from public.profiles`);
ok(profA.rows.length === 1 && profA.rows[0].full_name === "Amaya Silva", "profile created from sign-up metadata, owner sees only own row");
await expectError(
  () => as("authenticated", userA, `update public.profiles set role = 'admin' where id = $1`, [userA]),
  "customer cannot make themselves admin",
  /role/,
);
await as("authenticated", userA, `update public.profiles set phone = '+94771234567', email = 'hacker@x.com' where id = $1`, [userA]);
const profA2 = await db.query(`select phone, email from public.profiles where id = $1`, [userA]);
ok(profA2.rows[0].phone === "+94771234567" && profA2.rows[0].email === "a@example.com", "customer edits phone; email stays locked");
await db.query(`update auth.users set email = 'amaya@example.com' where id = $1`, [userA]);
const profA3 = await db.query(`select email from public.profiles where id = $1`, [userA]);
ok(profA3.rows[0].email === "amaya@example.com", "login email change syncs to profile");

// --- 3. Orders ----------------------------------------------------------------
console.log("Orders");
const ids = (
  await db.query(`
    select p.id as product_id,
      (select id from public.packages where product_id = p.id and slug = 'pro') as pro,
      (select id from public.packages where product_id = p.id and slug = 'core') as core,
      (select id from public.forms where slug = 'lingo-onboarding') as form_id,
      (select id from public.products where slug = 'post') as post_id
    from public.products p where p.slug = 'lingo'`)
).rows[0];

await expectError(
  () =>
    as(
      "authenticated",
      userA,
      `insert into public.orders (product_id, package_id, billing_cycle, price_amount) values ($1, $2, 'monthly', 1)`,
      [ids.product_id, ids.pro],
    ),
  "customer cannot send a price",
  /permission denied/,
);
await expectError(
  () =>
    as(
      "authenticated",
      userA,
      `insert into public.orders (product_id, package_id, status) values ($1, $2, 'active')`,
      [ids.product_id, ids.pro],
    ),
  "customer cannot send a status",
  /permission denied/,
);

const year = new Date().getFullYear();
const o1 = await as(
  "authenticated",
  userA,
  `insert into public.orders (product_id, package_id, billing_cycle, answers, form_id)
   values ($1, $2, 'monthly', '[{"key":"business_name","label":"Business name","value":"Amaya Cakes","display_value":"Amaya Cakes"}]', $3)
   returning id, ref, status, price_amount, setup_fee, currency, package_name, form_version, user_id`,
  [ids.product_id, ids.pro, ids.form_id],
);
const order1 = o1.rows[0];
ok(order1.ref === `LNG-${year}-0001`, `first ref is LNG-${year}-0001 (got ${order1.ref})`);
ok(Number(order1.price_amount) === 14900 && Number(order1.setup_fee) === 19900, "monthly Pro price and setup fee snapshotted");
ok(order1.currency === "LKR" && order1.package_name === "Lingo Pro" && order1.form_version === 1, "currency, package name and form version snapshotted");
ok(order1.status === "submitted" && order1.user_id === userA, "status submitted, owner forced");

const o2 = await as(
  "authenticated",
  userA,
  `insert into public.orders (product_id, package_id, billing_cycle) values ($1, $2, 'yearly') returning ref, price_amount`,
  [ids.product_id, ids.core],
);
ok(o2.rows[0].ref === `LNG-${year}-0002` && Number(o2.rows[0].price_amount) === 69000, "yearly Core snapshot and next ref");

await expectError(
  () => as("authenticated", userA, `insert into public.orders (product_id, package_id) values ($1, $2)`, [ids.post_id, ids.pro]),
  "package from another product is rejected",
  /does not belong/,
);
await expectError(
  () => as("anon", null, `insert into public.orders (product_id, package_id) values ($1, $2)`, [ids.product_id, ids.pro]),
  "anonymous visitors cannot order",
);

const ev1 = await as("authenticated", userA, `select to_status from public.order_events where order_id = $1`, [order1.id]);
ok(ev1.rows.length === 1 && ev1.rows[0].to_status === "submitted", "insert wrote a 'submitted' timeline event");

{
  const res = await as("authenticated", userA, `update public.orders set status = 'active' where id = $1`, [order1.id]);
  const now = await db.query(`select status from public.orders where id = $1`, [order1.id]);
  ok(res.affectedRows === 0 && now.rows[0].status === "submitted", "customer cannot update an order (0 rows changed)");
}
await expectError(
  () => as("authenticated", userA, `select admin_note from public.orders`),
  "customer cannot read admin_note",
  /permission denied/,
);
const bSees = await as("authenticated", userB, `select id from public.orders`);
ok(bSees.rows.length === 0, "user B cannot see user A's orders");
const bEvents = await as("authenticated", userB, `select id from public.order_events`);
ok(bEvents.rows.length === 0, "user B cannot see user A's events");
await expectError(
  () => as("authenticated", userB, `select public.cancel_order($1, 'nope')`, [order1.id]),
  "user B cannot cancel user A's order",
  /not found/,
);

// Admin moves order 2 forward (dashboard = no JWT)
await db.query(`update public.orders set status = 'setting_up', status_note = 'Payment received, thank you' where ref = $1`, [`LNG-${year}-0002`]);
const ev2 = await as(
  "authenticated",
  userA,
  `select e.from_status, e.to_status, e.note from public.order_events e join public.orders o on o.id = e.order_id where o.ref = $1 order by e.created_at`,
  [`LNG-${year}-0002`],
);
ok(ev2.rows.length === 2 && ev2.rows[1].to_status === "setting_up" && ev2.rows[1].note === "Payment received, thank you", "status change in dashboard adds a timeline event with note");

await expectError(
  () => as("authenticated", userA, `select public.cancel_order((select id from public.orders where ref = $1), null)`, [`LNG-${year}-0002`]),
  "cannot cancel while setting_up",
  /no longer be cancelled/,
);
const cancel = await as("authenticated", userA, `select public.cancel_order($1, 'Changed my mind') as s`, [order1.id]);
ok(cancel.rows[0].s === "cancelled", "customer can cancel a submitted order");
const after = await db.query(`select status, cancelled_at from public.orders where id = $1`, [order1.id]);
ok(after.rows[0].status === "cancelled" && after.rows[0].cancelled_at, "order cancelled with timestamp");

// Admin via API
await as("authenticated", adminId, `update public.orders set status = 'reviewing' where id = $1`, [order1.id]);
ok((await db.query(`select status from public.orders where id = $1`, [order1.id])).rows[0].status === "reviewing", "admin can update orders through the API");
const adminSees = await as("authenticated", adminId, `select id from public.orders`);
ok(adminSees.rows.length === 2, "admin sees all orders");

// --- 4. Public content and forms ---------------------------------------------
console.log("Content and public forms");
const anonProducts = await as("anon", null, `select slug from public.products order by sort_order`);
ok(anonProducts.rows.map((r) => r.slug).join(",") === "lingo,post", "anon reads live + coming soon products");
await db.query(`update public.packages set is_visible = false where slug = 'supreme'`);
const anonPackages = await as("anon", null, `select slug from public.packages`);
ok(anonPackages.rows.length === 5, "hidden package not readable");
await db.query(`update public.packages set is_visible = true where slug = 'supreme'`);
await expectError(
  () => as("anon", null, `update public.site_settings set site_name = 'Hacked'`).then((r) => {
    if (r.affectedRows === 0) throw new Error("no rows updated (RLS)");
  }),
  "anon cannot edit site settings",
);
await expectError(
  () => as("authenticated", userA, `insert into public.services (title) values ('x')`),
  "customer cannot add content",
  /row-level security/,
);

await as("anon", null, `insert into public.contact_messages (name, email, message, source_path) values ('Kasun', 'KASUN@example.com', 'Hello', '/contact')`);
{
  let readable = 0;
  try {
    readable = (await as("anon", null, `select id from public.contact_messages`)).rows.length;
  } catch {
    readable = 0; // permission denied is fine too
  }
  ok(readable === 0, "anon can send a message but not read messages");
}
ok((await db.query(`select email from public.contact_messages`)).rows[0].email === "kasun@example.com", "contact email stored lowercase");

// The waitlist is for "coming soon" products: use Post as one for these checks.
await db.query(`update public.products set status = 'coming_soon' where id = $1`, [ids.post_id]);
await as("anon", null, `insert into public.waitlist (product_id, email) values ($1, 'Nuwan@Example.com')`, [ids.post_id]);
await expectError(
  () => as("anon", null, `insert into public.waitlist (product_id, email) values ($1, 'nuwan@example.com')`, [ids.post_id]),
  "duplicate waitlist email is rejected (shown as 'already on the list')",
  /duplicate key|unique/,
);
await expectError(
  () => as("anon", null, `insert into public.waitlist (product_id, email) values ($1, 'x@example.com')`, [ids.product_id]),
  "waitlist only for coming soon products",
  /row-level security/,
);
await db.query(`update public.products set status = 'live' where id = $1`, [ids.post_id]);

const hiddenPage = await db.query(`update public.pages set is_published = false where slug = 'terms' returning id`);
const anonTerms = await as("anon", null, `select id from public.page_sections where page_id = $1`, [hiddenPage.rows[0].id]);
ok(anonTerms.rows.length === 0, "sections of unpublished pages are hidden");
await db.query(`update public.pages set is_published = true where slug = 'terms'`);

await expectError(
  () => db.query(`insert into public.pages (slug, title) values ('account', 'Nope')`),
  "reserved slugs are rejected",
  /check constraint/,
);

// --- 5. New product template --------------------------------------------------
console.log("New product template");
await db.exec(template);
await db.exec(template);
const tplProduct = await as("anon", null, `select slug, status from public.products where slug = 'example'`);
ok(tplProduct.rows.length === 0, "template product starts hidden");
await db.query(`update public.products set status = 'live' where slug = 'example'`);
const tpl = await as(
  "anon",
  null,
  `select (select count(*) from public.packages k join public.products p on p.id = k.product_id where p.slug = 'example')::int as packages,
          (select count(*) from public.page_sections s join public.pages g on g.id = s.page_id where g.slug = 'example')::int as sections,
          (select count(*) from public.form_fields f join public.forms m on m.id = f.form_id where m.slug = 'example-onboarding')::int as fields`,
);
ok(tpl.rows[0].packages === 2 && tpl.rows[0].sections >= 5 && tpl.rows[0].fields >= 4, "template creates packages, page sections and form fields");
const tplOrder = await as(
  "authenticated",
  userB,
  `insert into public.orders (product_id, package_id) select p.id, k.id from public.products p join public.packages k on k.product_id = p.id where p.slug = 'example' and k.slug = 'starter' returning ref`,
);
ok(tplOrder.rows[0].ref === `EXP-${year}-0001`, "template product can be ordered with its own ref sequence");

summary();
