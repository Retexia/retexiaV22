// Admin database tests (0003_admin.sql): staff roles and RLS, the order
// workflow RPC, payments and receipts, product secrets, n8n results, the
// product wizard and the audit log. Runs in PGlite like scripts/test-db.mjs.
//
//   pnpm db:test
import { createHarness, migration, seed } from "./lib/harness.mjs";

const { db, ok, expectError, as, summary } = await createHarness();

await db.exec(migration);
await db.exec(seed);
await db.exec(migration); // re-runnable
console.log("Admin migration applied twice");

const year = new Date().getFullYear();
const q = async (sql, params) => (await db.query(sql, params)).rows;

async function user(email, role = "customer", meta = {}) {
  const id = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, JSON.stringify(meta)]))[0].id;
  if (role !== "customer") await q(`update public.profiles set role = $1 where id = $2`, [role, id]);
  return id;
}

const owner = await user("owner@retexia.test", "owner");
const admin = await user("admin@retexia.test", "admin");
const support = await user("support@retexia.test", "support");
const editor = await user("editor@retexia.test", "editor");
const alice = await user("alice@example.com", "customer", { full_name: "Alice Perera" });
const bob = await user("bob@example.com", "customer", { full_name: "Bob Silva" });

const ids = (
  await q(`select p.id as lingo, (select id from public.packages where product_id = p.id and slug = 'pro') as pro,
                  (select id from public.packages where product_id = p.id and slug = 'core') as core
             from public.products p where p.slug = 'lingo'`)
)[0];

const order = (
  await as("authenticated", alice, `insert into public.orders (product_id, package_id, billing_cycle) values ($1, $2, 'monthly') returning id, ref`, [ids.lingo, ids.pro])
).rows[0];
const bobOrder = (
  await as("authenticated", bob, `insert into public.orders (product_id, package_id) values ($1, $2) returning id, ref`, [ids.lingo, ids.core])
).rows[0];

// --- Roles and access --------------------------------------------------------
console.log("Roles and access");
ok((await as("authenticated", alice, `select id from public.staff_orders`)).rows.length === 0, "customer sees no rows in staff_orders");
ok((await as("authenticated", alice, `select id from public.staff_customers`)).rows.length === 0, "customer sees no rows in staff_customers");
ok((await as("authenticated", support, `select id from public.staff_orders`)).rows.length === 2, "support sees every request");
ok((await as("authenticated", editor, `select id from public.staff_orders`)).rows.length === 2, "editor can view requests");
ok((await as("authenticated", alice, `select id from public.orders`)).rows.length === 1, "customer still sees only own orders");
await expectError(
  () => as("authenticated", alice, `select public.admin_change_order_status($1, 'reviewing')`, [order.id]),
  "customer cannot call admin_change_order_status",
  /Retexia team/,
);
await expectError(() => as("authenticated", alice, `select public.admin_dashboard()`), "customer cannot read the dashboard", /Retexia team/);
await expectError(() => as("authenticated", alice, `select * from private.order_secrets`), "customer cannot read the private schema", /permission denied/);
await expectError(() => as("authenticated", admin, `select * from private.order_secrets`), "even admins cannot read private directly", /permission denied/);
await expectError(
  () => as("authenticated", admin, `select public.svc_get_integration_settings()`),
  "svc_* functions are service-role only",
  /permission denied/,
);
await expectError(
  () => as("authenticated", support, `select public._change_order_status($1, 'reviewing', null, null, false, null, 'n8n')`, [order.id]),
  "internal _change_order_status is not callable",
  /permission denied/,
);
await expectError(
  () => as("authenticated", support, `insert into public.services (title) values ('x')`),
  "support cannot edit website content",
  /row-level security/,
);
{
  const r = await as("authenticated", editor, `update public.page_sections set title = 'Edited by editor' where type = 'cta' returning id`);
  ok(r.rows.length > 0, "editor can edit page sections");
}
await expectError(
  () => as("authenticated", editor, `update public.packages set price_monthly = 1 where slug = 'core'`).then((r) => {
    if (r.affectedRows === 0) throw new Error("0 rows (RLS)");
  }),
  "editor cannot change prices",
);
await expectError(
  () => as("authenticated", editor, `select public.admin_change_order_status($1, 'reviewing')`, [order.id]),
  "editor cannot change a request status",
  /role cannot/,
);
await expectError(
  () => as("authenticated", admin, `update public.profiles set role = 'admin' where id = $1`, [support]),
  "admin cannot change roles",
  /Only an owner/,
);
await as("authenticated", owner, `update public.profiles set role = 'admin' where id = $1`, [support]);
ok((await q(`select role from public.profiles where id = $1`, [support]))[0].role === "admin", "owner can change roles");
await q(`update public.profiles set role = 'support' where id = $1`, [support]);
await expectError(
  () => as("authenticated", owner, `update public.profiles set role = 'admin' where id = $1`, [owner]),
  "the last owner cannot be demoted",
  /at least one owner/,
);
ok((await as("authenticated", support, `select id from public.audit_logs`)).rows.length === 0, "support cannot read the audit log");
ok((await as("authenticated", admin, `select id from public.audit_logs`)).rows.length > 0, "admin can read the audit log");
{
  const r = await as("authenticated", owner, `update public.audit_logs set summary = 'x' returning id`).catch((e) => e);
  ok(r instanceof Error || r.rows.length === 0, "nobody can edit the audit log");
}

// --- Workflow ----------------------------------------------------------------
console.log("Workflow");
await as("authenticated", support, `select public.admin_change_order_status($1, 'reviewing', null, 'Looks good', false)`, [order.id]);
ok((await q(`select status from public.orders where id = $1`, [order.id]))[0].status === "reviewing", "support can start review");
ok((await q(`select body from public.order_notes where order_id = $1`, [order.id]))[0]?.body === "Looks good", "internal note stored");
await expectError(
  () => as("authenticated", support, `select public.admin_change_order_status($1, 'active')`, [order.id]),
  "transitions not in the table are refused",
  /cannot move from reviewing to active/,
);
await expectError(
  () => as("authenticated", support, `select public.admin_change_order_status($1, 'rejected')`, [bobOrder.id]),
  "reject needs a reason",
  /give a reason/,
);
await as(
  "authenticated",
  support,
  `select public.admin_change_order_status($1, 'awaiting_payment', 'Approved, please pay', null, true)`,
  [order.id],
);
{
  const ev = await as("authenticated", alice, `select to_status, note from public.order_events where order_id = $1 order by created_at desc limit 1`, [order.id]);
  ok(ev.rows[0].to_status === "awaiting_payment" && ev.rows[0].note === "Approved, please pay", "customer sees the approval with its note");
  const outbox = await q(`select channel, event from public.notifications_outbox where order_id = $1 and event = 'order.status_changed'`, [order.id]);
  ok(outbox.some((o) => o.channel === "email"), "approval queued an email notification");
}
await expectError(
  () => as("authenticated", support, `select public.admin_change_order_status($1, 'setting_up')`, [order.id]),
  "Start setup needs a confirmed payment",
  /confirmed payment/,
);
await expectError(
  () => as("authenticated", support, `select public.admin_change_order_status($1, 'setting_up', null, null, false, 'Paid in cash')`, [order.id]),
  "support cannot override the payment rule",
  /confirmed payment/,
);

// --- Payments ----------------------------------------------------------------
console.log("Payments");
await expectError(
  () => as("authenticated", alice, `select public.customer_submit_payment_proof($1, 'someone-else/x.pdf')`, [order.id]),
  "customer proof path must be in their own folder",
  /Upload the proof/,
);
const proofId = (
  await as("authenticated", alice, `select public.customer_submit_payment_proof($1, $2, 'BOC 123') as id`, [order.id, `${alice}/${order.id}/proof.pdf`])
).rows[0].id;
ok((await as("authenticated", alice, `select id from public.payments`)).rows.length === 1, "customer sees their own pending payment");
ok((await as("authenticated", bob, `select id from public.payments`)).rows.length === 0, "other customers do not");
await expectError(
  () => as("authenticated", alice, `update public.payments set status = 'confirmed' where id = $1`, [proofId]).then((r) => {
    if (r.affectedRows === 0) throw new Error("0 rows (RLS)");
  }),
  "customer cannot confirm their own payment",
);
await as("authenticated", support, `update public.payments set status = 'confirmed' where id = $1`, [proofId]);
const paid = (await q(`select receipt_number, amount, paid_at from public.payments where id = $1`, [proofId]))[0];
ok(paid.receipt_number === `RCT-${year}-0001`, `confirming creates receipt RCT-${year}-0001 (got ${paid.receipt_number})`);
ok(Number(paid.amount) === 49 + 69, "proof amount = setup fee + first period");
await expectError(
  () => as("authenticated", support, `update public.payments set status = 'refunded' where id = $1`, [proofId]),
  "only admins can refund",
  /Only an admin/,
);
await as("authenticated", support, `select public.admin_change_order_status($1, 'setting_up', 'Payment received')`, [order.id]);
ok((await q(`select status from public.orders where id = $1`, [order.id]))[0].status === "setting_up", "Start setup allowed after payment");

// --- Setup fields and secrets -----------------------------------------------
console.log("Setup fields and secrets");
await expectError(
  () => as("authenticated", support, `select public.admin_change_order_status($1, 'active')`, [order.id]),
  "Mark as live blocked until required setup fields are filled",
  /WhatsApp phone number ID/,
);
await as(
  "authenticated",
  support,
  `select public.admin_set_service_data($1, '{"whatsapp_phone_number_id": "1098765", "bot_name": "Amaya Bot", "go_live_date": "2026-10-10", "meta_access_token": "EAAGsecret1234"}')`,
  [order.id],
);
{
  const data = (await q(`select service_data from public.orders where id = $1`, [order.id]))[0].service_data;
  ok(data.whatsapp_phone_number_id === "1098765" && !("meta_access_token" in data), "values saved; secrets kept out of service_data");
  const masked = (await as("authenticated", support, `select public.admin_order_secret_status($1) as s`, [order.id])).rows[0].s;
  ok(masked.meta_access_token === "••••1234", "secrets are shown masked");
  await expectError(
    () => as("authenticated", support, `select public.admin_reveal_order_secret($1, 'meta_access_token')`, [order.id]),
    "support cannot reveal secrets",
    /Only admins/,
  );
  const revealed = (await as("authenticated", admin, `select public.admin_reveal_order_secret($1, 'meta_access_token') as v`, [order.id])).rows[0].v;
  ok(revealed === "EAAGsecret1234", "admin can reveal a secret");
  ok((await q(`select 1 from public.audit_logs where action = 'secret.reveal'`)).length === 1, "secret reveal is audited");
  await expectError(
    () => as("authenticated", support, `select public.admin_set_service_data($1, '{"nope": 1}')`, [order.id]),
    "unknown setup fields are refused",
    /Unknown setup field/,
  );
  const visible = (await as("authenticated", alice, `select public.customer_order_service_fields($1) as f`, [order.id])).rows[0].f;
  ok(visible.length === 1 && visible[0].key === "go_live_date", "customer sees only fields marked visible");
}
await as("authenticated", support, `select public.admin_change_order_status($1, 'active', 'You are live')`, [order.id]);
{
  const o = (await q(`select status, starts_at, renews_at from public.orders where id = $1`, [order.id]))[0];
  const months = (new Date(o.renews_at) - new Date(o.starts_at)) / (1000 * 60 * 60 * 24);
  ok(o.status === "active" && months >= 28 && months <= 31, "going live sets starts_at and renews_at one month later");
  await as("authenticated", support, `insert into public.payments (order_id, kind, amount, status) values ($1, 'subscription', 49, 'confirmed')`, [order.id]);
  const after = (await q(`select renews_at from public.orders where id = $1`, [order.id]))[0];
  const ext = (new Date(after.renews_at) - new Date(o.renews_at)) / (1000 * 60 * 60 * 24);
  ok(ext >= 28 && ext <= 31, "a confirmed subscription payment extends renews_at by one cycle");
  const receipts = await q(`select receipt_number from public.payments where order_id = $1 order by receipt_number`, [order.id]);
  ok(receipts[1].receipt_number === `RCT-${year}-0002`, "receipt numbers are sequential");
}

// --- Product actions (n8n) ---------------------------------------------------
console.log("Product actions");
const action = (await q(`select id from public.product_actions where key = 'start_setup'`))[0];
await expectError(
  () => as("authenticated", support, `select public.admin_start_action_run($1, $2)`, [bobOrder.id, action.id]),
  "disabled actions cannot run",
  /switched off/,
);
await as("authenticated", admin, `select public.admin_set_action_secret($1, 'https://n8n.example.com/webhook/abc', 'shh-secret')`, [action.id]);
await as("authenticated", admin, `update public.product_actions set is_enabled = true where id = $1`, [action.id]);
{
  const status = (await as("authenticated", admin, `select public.admin_action_secret_status($1) as s`, [ids.lingo])).rows[0].s;
  ok(status[action.id].has_webhook && status[action.id].webhook_host === "n8n.example.com", "action secret status shows only the host");
  await expectError(
    () => as("authenticated", support, `select public.admin_start_action_run($1, $2)`, [bobOrder.id, action.id]),
    "actions only run in their allowed statuses",
    /not available in status submitted/,
  );
  await q(`update public.orders set status = 'setting_up' where id = $1`, [bobOrder.id]);
  const run = (await as("authenticated", support, `select public.admin_start_action_run($1, $2) as r`, [bobOrder.id, action.id])).rows[0].r;
  ok(run.run_id && run.context.order.ref === bobOrder.ref && run.context.customer.email === "bob@example.com", "run started with the order context");
  const secret = (await as("service_role", null, `select public.svc_get_action_secret($1) as s`, [action.id])).rows[0].s;
  ok(secret.signing_secret === "shh-secret", "service role reads the signing secret");
  await q(`update public.product_service_fields set required_for_status = null where key = 'whatsapp_phone_number_id'`);
  const applied = (
    await as(
      "service_role",
      null,
      `select public.svc_apply_action_result($1, 'succeeded', '{"n8n_workflow_id": "wf_42", "not_a_field": "x"}', 'active', 'Your bot is live') as r`,
      [run.run_id],
    )
  ).rows[0].r;
  const o = (await q(`select status, service_data from public.orders where id = $1`, [bobOrder.id]))[0];
  ok(applied.status === "succeeded" && o.status === "active", "callback moved the request to active");
  ok(o.service_data.n8n_workflow_id === "wf_42" && !("not_a_field" in o.service_data), "callback merged only defined service fields");
  const again = (await as("service_role", null, `select public.svc_apply_action_result($1, 'failed') as r`, [run.run_id])).rows[0].r;
  ok(again.already_finished === true, "callbacks are idempotent per run");
  await q(`update public.product_service_fields set required_for_status = 'active' where key = 'whatsapp_phone_number_id'`);
}

// --- Products ----------------------------------------------------------------
console.log("Products");
await expectError(
  () => as("authenticated", support, `select public.admin_create_product('{"slug": "nope", "name": "Nope"}')`),
  "only admins create products",
  /Only admins/,
);
const created = (
  await as(
    "authenticated",
    admin,
    `select public.admin_create_product($1) as id`,
    [
      JSON.stringify({
        name: "Retexia Test",
        short_name: "Test",
        slug: "test-product",
        icon: "flask-conical",
        tagline: "Testing things",
        color_light: "#6d3fc0",
        packages: [
          { slug: "basic", name: "Test Basic", price_monthly: 1000, price_yearly: 10000, setup_fee: 500, features: [{ label: "One thing" }, { label: "Two", included: false }] },
        ],
        sections: [
          { type: "hero", title: "Hello", content: { visual: "none" }, sort_order: 1 },
          { type: "pricing", title: "Prices", content: { product_slug: "test-product" }, sort_order: 2 },
        ],
        form: { mode: "clone", from_product_id: ids.lingo },
      }),
    ],
  )
).rows[0].id;
{
  const p = (await q(`select status, code, onboarding_form_id from public.products where id = $1`, [created]))[0];
  ok(p.status === "hidden" && p.code === "TES", `wizard product is hidden with code TES (got ${p.code})`);
  const counts = (
    await q(
      `select (select count(*) from public.packages where product_id = $1)::int pk,
              (select count(*) from public.package_features f join public.packages k on k.id = f.package_id where k.product_id = $1)::int pf,
              (select count(*) from public.page_sections s join public.pages g on g.id = s.page_id where g.product_id = $1)::int sec,
              (select count(*) from public.form_fields where form_id = $2)::int fields,
              (select count(*) from public.product_service_fields where product_id = $1)::int sf`,
      [created, p.onboarding_form_id],
    )
  )[0];
  ok(counts.pk === 1 && counts.pf === 2 && counts.sec === 2, "packages, features and page sections created");
  ok(counts.fields === 24 && counts.sf === 7, "form and service fields cloned from Lingo");
  ok((await as("anon", null, `select id from public.products where slug = 'test-product'`)).rows.length === 0, "hidden product is not public");
  await as("authenticated", admin, `update public.products set status = 'live' where id = $1`, [created]);
  ok((await as("anon", null, `select id from public.products where slug = 'test-product'`)).rows.length === 1, "going live makes it public");
  const ref = (
    await as("authenticated", bob, `insert into public.orders (product_id, package_id) select $1, id from public.packages where product_id = $1 returning ref`, [created])
  ).rows[0].ref;
  ok(ref === `TES-${year}-0001`, "customers can order the new product");
}
{
  const dup = (await as("authenticated", admin, `select public.admin_duplicate_product($1, 'lingo-two', 'Retexia Lingo Two') as id`, [ids.lingo])).rows[0].id;
  const d = (
    await q(
      `select p.code, p.status, (select count(*) from public.packages where product_id = p.id)::int pk,
              (select content->>'product_slug' from public.page_sections s join public.pages g on g.id = s.page_id
                where g.product_id = p.id and s.type = 'pricing') pricing_slug,
              (select bool_or(is_enabled) from public.product_actions where product_id = p.id) any_enabled
         from public.products p where p.id = $1`,
      [dup],
    )
  )[0];
  ok(d.status === "hidden" && d.pk === 3 && d.code !== "LNG", `duplicate is hidden with its own code (${d.code}) and packages`);
  ok(d.pricing_slug === "lingo-two", "duplicated page sections point at the new product");
  ok(d.any_enabled === false, "duplicated actions start switched off");
}
{
  const pk = (await q(`select array_agg(id order by sort_order desc) a from public.packages where product_id = $1`, [ids.lingo]))[0].a;
  await expectError(
    () => as("authenticated", editor, `select public.admin_reorder('packages', $1)`, [pk]),
    "editors cannot reorder packages",
    /Only admins/,
  );
  await as("authenticated", admin, `select public.admin_reorder('packages', $1)`, [pk]);
  const first = (await q(`select slug from public.packages where product_id = $1 order by sort_order limit 1`, [ids.lingo]))[0].slug;
  ok(first === "supreme", "admin_reorder applies the new order");
  await expectError(() => as("authenticated", admin, `select public.admin_reorder('orders', $1)`, [pk]), "unknown tables cannot be reordered", /cannot be reordered/);
}

// --- Form builder ------------------------------------------------------------
console.log("Form builder");
{
  const formId = (await q(`select onboarding_form_id id from public.products where slug = 'lingo'`))[0].id;
  const load = async () =>
    (
      await q(
        `select f.version, (select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'fields',
                  (select jsonb_agg(jsonb_build_object('id', ff.id, 'key', ff.key, 'label', ff.label, 'type', ff.type, 'options', ff.options, 'required', ff.required, 'show_if', ff.show_if) order by ff.sort_order)
                     from public.form_fields ff where ff.step_id = s.id)) order by s.sort_order)
                  from public.form_steps s where s.form_id = f.id) steps
           from public.forms f where f.id = $1`,
        [formId],
      )
    )[0];
  const before = await load();
  const firstKey = before.steps[0].fields[0].key;
  await q(`update public.orders set form_id = $1, answers = $2 where id = $3`, [formId, JSON.stringify([{ key: firstKey, label: "x", value: "y", display_value: "y", step: "s" }]), bobOrder.id]);
  const payload = (steps) => JSON.stringify({ id: formId, title: "Lingo setup", steps });
  await expectError(() => as("authenticated", editor, `select public.admin_save_form($1)`, [payload(before.steps)]), "editors cannot save forms", /Only admins/);
  // Move the last step first, add a question with show_if, relabel the answered one.
  const steps = structuredClone(before.steps);
  steps[0].fields[0].label = "Business name (renamed label)";
  const last = steps.pop();
  steps.unshift(last);
  steps[0].fields.push({ key: "has_website", label: "Do you have a website?", type: "radio", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] });
  steps[0].fields.push({ key: "website_url", label: "Website", type: "url", show_if: { field: "has_website", equals: "yes" } });
  const v = (await as("authenticated", admin, `select public.admin_save_form($1) v`, [payload(steps)])).rows[0].v;
  const after = await load();
  ok(v === before.version + 1 && after.version === v, "saving a form bumps its version");
  ok(after.steps[0].id === last.id && after.steps[0].fields.some((f) => f.key === "website_url" && f.show_if.field === "has_website"), "steps reorder and new questions keep show_if");
  ok(after.steps.find((s) => s.fields.some((f) => f.key === firstKey)).fields.find((f) => f.key === firstKey).label === "Business name (renamed label)", "answered questions can be relabelled");
  const renamed = structuredClone(after.steps);
  renamed.find((s) => s.fields.some((f) => f.key === firstKey)).fields.find((f) => f.key === firstKey).key = "company";
  await expectError(() => as("authenticated", admin, `select public.admin_save_form($1)`, [payload(renamed)]), "answered keys are locked", /already answered/);
  const dup = structuredClone(after.steps);
  dup[0].fields.push({ key: "has_website", label: "Again", type: "text" });
  await expectError(() => as("authenticated", admin, `select public.admin_save_form($1)`, [payload(dup)]), "duplicate keys are rejected", /Two questions/);
  const badRef = structuredClone(after.steps);
  badRef[0].fields.find((f) => f.key === "website_url").show_if = { field: "nope", equals: "yes" };
  await expectError(() => as("authenticated", admin, `select public.admin_save_form($1)`, [payload(badRef)]), "show_if must reference a question", /pick that question/);
  // Swap two unanswered keys in one save.
  const swap = structuredClone(after.steps);
  const a = swap[0].fields.find((f) => f.key === "has_website");
  const b = swap[0].fields.find((f) => f.key === "website_url");
  a.key = "tmp_swap";
  b.key = "has_website";
  a.key = "website_url";
  b.show_if = null;
  a.show_if = { field: "has_website", equals: "yes" };
  await as("authenticated", admin, `select public.admin_save_form($1)`, [payload(swap)]);
  const swapped = (await load()).steps[0].fields;
  ok(swapped.find((f) => f.id === a.id).key === "website_url" && swapped.find((f) => f.id === b.id).key === "has_website", "keys can be swapped in one save");
  const removed = structuredClone((await load()).steps).slice(1);
  await as("authenticated", admin, `select public.admin_save_form($1)`, [payload(removed)]);
  ok((await load()).steps.length === removed.length, "removed steps are deleted");
  const locked = (await as("authenticated", support, `select public.admin_form_locked_keys($1) k`, [formId])).rows[0].k;
  ok(locked.includes(firstKey), "locked keys are reported to the builder");
}

// --- Staff settings and staff notifications ---------------------------------
console.log("Staff settings");
{
  await expectError(() => as("anon", null, `select staff_notification_emails from public.staff_settings`), "visitors cannot read staff settings", /permission denied/);
  ok((await as("authenticated", bob, `select * from public.staff_settings`)).rows.length === 0, "customers see no staff settings");
  ok((await as("authenticated", support, `select * from public.staff_settings`)).rows.length === 1, "staff can read staff settings");
  const r = await as("authenticated", support, `update public.staff_settings set staff_notification_emails = 'x@retexia.test' where id = 1 returning id`);
  ok(r.rows.length === 0, "support cannot change staff settings");
  await as("authenticated", admin, `update public.staff_settings set staff_notification_emails = 'team@retexia.test, owner@retexia.test' where id = 1`);
  await as("anon", null, `insert into public.contact_messages (name, email, message) values ('Visitor', 'v@example.com', 'Hello there, a question')`);
  const staffMail = await q(`select recipient from public.notifications_outbox where event = 'contact.created' order by recipient`);
  ok(staffMail.length === 2 && staffMail[0].recipient === "owner@retexia.test", "staff notifications go to the configured emails");
  ok(!(await q(`select column_name from information_schema.columns where table_name = 'site_settings' and column_name like '%notification%'`)).length, "site_settings has no notification columns");
}

// --- Dashboard, customers, anonymise ----------------------------------------
console.log("Dashboard and customers");
{
  const d = (await as("authenticated", editor, `select public.admin_dashboard() as d`)).rows[0].d;
  ok(d.active_subscriptions === 2 && Number(d.mrr) > 0 && Array.isArray(d.weekly) && d.weekly.length >= 4, "dashboard numbers and weekly series");
  const c = (await as("authenticated", support, `select email, lifetime_paid, active_products from public.staff_customers where id = $1`, [alice])).rows[0];
  ok(Number(c.lifetime_paid) === 49 + 69 + 49 && c.active_products.includes("lingo"), "staff_customers totals");
  await expectError(() => as("authenticated", admin, `select public.admin_anonymise_user($1)`, [alice]), "only owners anonymise", /Only an owner/);
  await as("authenticated", owner, `select public.admin_anonymise_user($1)`, [alice]);
  const prof = (await q(`select full_name, phone from public.profiles where id = $1`, [alice]))[0];
  ok(prof.full_name === "Deleted customer" && prof.phone === null, "profile anonymised");
  await q(`delete from auth.users where id = $1`, [alice]);
  const kept = await q(`select user_id from public.orders where id = $1`, [order.id]);
  const keptPayments = await q(`select count(*)::int n from public.payments where order_id = $1`, [order.id]);
  ok(kept.length === 1 && kept[0].user_id === null && keptPayments[0].n === 2, "deleting the login keeps orders and payments");
}
{
  const actions = (await q(`select distinct action from public.audit_logs`)).map((r) => r.action);
  ok(["insert", "update", "status_change", "secret.reveal", "action.run", "auth.delete"].every((a) => actions.includes(a)), "audit log covers changes, status changes, reveals, runs and deletes");
  const sc = (await q(`select actor_email, summary from public.audit_logs where action = 'status_change' order by created_at limit 1`))[0];
  ok(sc.actor_email === "support@retexia.test" && sc.summary.includes("submitted → reviewing"), "status changes record who did it");
}

summary();
