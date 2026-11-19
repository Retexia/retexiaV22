// Retexia Feeder → Autopublish (0036): the free package, ad accounts that wait for
// Retexia, read-only rows for customers, fair claiming of due launches, the error catalog.
//
//   pnpm db:test
import { readFileSync } from "node:fs";
import { createHarness, migration, seed } from "./lib/harness.mjs";

const { db, ok, expectError, as, summary } = await createHarness();
await db.exec(migration);
await db.exec(seed);
await db.exec(migration); // re-runnable
const q = async (sql, params) => (await db.query(sql, params)).rows;
const user = async (email, role = "customer") => {
  const id = (await q(`insert into auth.users (email) values ($1) returning id`, [email]))[0].id;
  if (role !== "customer") await q(`update public.profiles set role = $1 where id = $2`, [role, id]);
  return id;
};
const amaya = await user("amaya@example.com");
const kasun = await user("kasun@example.com");
const admin = await user("admin@retexia.test", "admin");

console.log("Autopublish: the free package (0036)");
await q(`insert into public.products (slug, code, name, short_name, status) values ('feeder', 'FDR', 'Retexia Feeder', 'Feeder', 'live') on conflict (slug) do nothing`);
await db.exec(readFileSync(new URL("../supabase/migrations/0036_feeder_autopublish.sql", import.meta.url), "utf8"));
await db.exec(readFileSync(new URL("../supabase/migrations/0036_feeder_autopublish.sql", import.meta.url), "utf8"));
const pk = await q(`select k.name, k.price_monthly::int price, k.setup_fee::int setup, k.is_active, k.is_visible, (select count(*)::int from public.package_features f where f.package_id = k.id) features
                      from public.packages k join public.products p on p.id = k.product_id where p.slug = 'feeder' and k.slug = 'autopublish'`);
ok(pk.length === 1 && pk[0].price === 0 && pk[0].setup === 0 && pk[0].is_active && pk[0].is_visible, "Feeder has an Autopublish package, free (LKR 0, no setup fee), once even when run twice");
ok(pk[0].features === 6, "with its features listed");
ok((await q(`select public from storage.buckets where id = 'autopublish'`))[0]?.public === false, "creatives go to a private bucket");
ok((await q(`select count(*)::int n from feeder.ad_error_catalog where not is_draft`))[0].n >= 25, "the error catalog is seeded");

console.log("Autopublish: ad accounts wait for Retexia");
await q(`insert into feeder.ad_accounts (user_id, meta_ad_account_id, meta_page_id, meta_status) values ($1, '1234567890', '987654321', 'connected')`, [amaya]);
ok((await q(`select meta_status from feeder.ad_accounts where user_id = $1`, [amaya]))[0].meta_status === "requested", "a new ad account is never connected straight away");
await q(`update feeder.ad_accounts set meta_status = 'connected' where user_id = $1`, [amaya]);
ok((await q(`select meta_status from feeder.ad_accounts where user_id = $1`, [amaya]))[0].meta_status === "connected", "Retexia confirms it");
await q(`update feeder.ad_accounts set max_daily_spend = 10000, privacy_policy_url = 'https://amaya.lk/privacy' where user_id = $1`, [amaya]);
ok((await q(`select meta_status from feeder.ad_accounts where user_id = $1`, [amaya]))[0].meta_status === "connected", "other settings don't touch the connection");
await q(`update feeder.ad_accounts set meta_page_id = '111111111' where user_id = $1`, [amaya]);
ok((await q(`select meta_status, meta_info from feeder.ad_accounts where user_id = $1`, [amaya]))[0].meta_status === "requested", "a different Page needs Retexia to confirm again");
await q(`update feeder.ad_accounts set meta_status = 'connected', meta_page_id = '987654321' where user_id = $1`, [amaya]);
ok((await q(`select meta_status from feeder.ad_accounts where user_id = $1`, [amaya]))[0].meta_status === "requested", "…even when the same update says connected");
await q(`update feeder.ad_accounts set meta_status = 'connected' where user_id = $1`, [amaya]);
await expectError(
  () => q(`insert into feeder.ad_accounts (user_id, meta_ad_account_id, meta_page_id) values ($1, '1234567890', '555555555')`, [kasun]),
  "one ad account belongs to one Retexia customer",
  /duplicate key/,
);
await q(`insert into feeder.ad_accounts (user_id, tiktok_advertiser_id) values ($1, '7000000000001')`, [kasun]);
ok((await q(`select meta_status, tiktok_status from feeder.ad_accounts where user_id = $1`, [kasun]))[0].tiktok_status === "requested", "TikTok works the same way");
await q(`update feeder.ad_accounts set tiktok_advertiser_id = null where user_id = $1`, [kasun]);
ok((await q(`select tiktok_status from feeder.ad_accounts where user_id = $1`, [kasun]))[0].tiktok_status === "none", "removing the ID disconnects it");

console.log("Autopublish: customers read their own rows, write nothing directly");
ok((await as("authenticated", amaya, `select user_id from feeder.ad_accounts`)).rows.length === 1, "a customer sees their own account");
ok((await as("authenticated", kasun, `select user_id from feeder.ad_accounts where user_id = $1`, [amaya])).rows.length === 0, "and nobody else's");
await expectError(() => as("authenticated", amaya, `update feeder.ad_accounts set meta_status = 'connected' where user_id = $1`, [amaya]), "a customer can't connect their own account", /permission denied/);
await expectError(() => as("authenticated", amaya, `insert into feeder.ad_templates (user_id, name, platforms, objective, structure, audiences) values ($1, 'x', '{meta}', 'leads', '{}', '[{}]')`, [amaya]), "templates are saved through feeder.retexia.com only", /permission denied/);
ok((await as("authenticated", admin, `select user_id from feeder.ad_accounts`)).rows.length === 2, "the Retexia team sees every account");
ok((await as("authenticated", amaya, `select id from feeder.ad_error_catalog`)).rows.length === 0, "the error catalog is for the team only");
await expectError(() => as("authenticated", amaya, `select * from feeder.ad_claim_launches(5, 'x', null)`), "customers can't run the runner", /permission denied/);

console.log("Autopublish: templates, launches, plan nodes");
const tpl = (await q(`insert into feeder.ad_templates (user_id, name, platforms, objective, structure, audiences) values ($1, 'Daily', '{meta,tiktok}', 'leads', '{"preset":"evergreen"}', '[{"name":"LK"}]') returning id`, [amaya]))[0].id;
await expectError(() => q(`insert into feeder.ad_templates (user_id, name, platforms, objective, structure, audiences) values ($1, 'x', '{facebook}', 'leads', '{}', '[{}]')`, [amaya]), "only Meta and TikTok", /check constraint/);
await expectError(() => q(`insert into feeder.ad_templates (user_id, name, platforms, objective, structure, audiences) values ($1, 'x', '{meta}', 'leads', '{}', '[]')`, [amaya]), "a template has at least one audience", /check constraint/);
const launch = async (ref, owner, state = "queued", next = "now()") =>
  q(`insert into feeder.ad_launches (ref, user_id, template_id, product_name, form_name, snapshot, state, next_run_at) values ($1, $2, $3, 'Wart Remover', 'Wartosin 1490', '{}', $4, ${next})`, [ref, owner, tpl, state]);
await launch("AP-AAAAA2", amaya);
await launch("AP-AAAAA3", amaya);
await launch("AP-KKKKK2", kasun);
await launch("AP-KKKKK3", kasun, "paused");
await launch("AP-KKKKK4", kasun, "live", "now() + interval '1 hour'");
await expectError(() => launch("AP-0OIL12", amaya), "launch refs have no look-alike characters (0/O, 1/I)", /check constraint/);
await q(`insert into feeder.ad_nodes (launch_ref, user_id, platform, key, level, name) values ('AP-AAAAA2', $1, 'meta', 'c1', 'campaign', 'Wartosin 1490 · 19 Nov')`, [amaya]);
await expectError(() => q(`insert into feeder.ad_nodes (launch_ref, user_id, platform, key, level, name) values ('AP-AAAAA2', $1, 'meta', 'c1', 'campaign', 'again')`, [amaya]), "a plan node key is made once per launch and platform (retries never duplicate)", /duplicate key/);
ok((await as("authenticated", amaya, `select key from feeder.ad_nodes`)).rows.length === 1 && (await as("authenticated", kasun, `select key from feeder.ad_nodes`)).rows.length === 0, "customers see their own plan nodes only");
await q(`insert into feeder.ad_creatives (launch_ref, position, name, storage_path, kind) values ('AP-AAAAA2', 1, 'Video 1', $1, 'video')`, [`${amaya}/x.mp4`]);
ok((await as("authenticated", amaya, `select position from feeder.ad_creatives`)).rows.length === 1 && (await as("authenticated", kasun, `select position from feeder.ad_creatives`)).rows.length === 0, "and their own creatives");

console.log("Autopublish: the runner claims fairly");
const claim = async (ref = null) => (await q(`select ref, user_id from feeder.ad_claim_launches(10, 'test', $1)`, [ref])).map((r) => r.ref).sort();
const first = await claim();
ok(first.length === 2 && first.includes("AP-KKKKK2") && first.some((r) => r.startsWith("AP-AAAAA")), "one due launch per customer at a time (a big customer can't starve the others)");
ok(!first.includes("AP-KKKKK3") && !first.includes("AP-KKKKK4"), "paused launches and ones not due yet are left alone");
ok((await claim()).length === 0, "claimed launches are locked; nothing else of those customers is claimed meanwhile");
await q(`update feeder.ad_launches set locked_until = null where ref = any($1)`, [first]);
const amayaFirst = first.find((r) => r.startsWith("AP-AAAAA"));
await q(`update feeder.ad_launches set next_run_at = now() + interval '1 hour' where ref = $1`, [amayaFirst]);
const second = await claim();
ok(second.includes(amayaFirst === "AP-AAAAA2" ? "AP-AAAAA3" : "AP-AAAAA2"), "after release, the customer's next launch is claimed");
await q(`update feeder.ad_launches set locked_until = null`);
ok((await claim("AP-KKKKK2")).join() === "AP-KKKKK2", "a single launch can be run right after it's submitted");
await q(`update feeder.ad_launches set locked_until = now() - interval '1 minute' where ref = 'AP-KKKKK2'`);
ok((await claim("AP-KKKKK2")).join() === "AP-KKKKK2", "a lock that ran out (a crashed run) is taken over");

console.log("Autopublish: slots and forms");
await q(`insert into feeder.ad_slots (user_id, platform, objective, product_key, budget_level) values ($1, 'meta', 'leads', 'wartosin 1490', 'campaign') on conflict do nothing`, [amaya]);
await q(`insert into feeder.ad_slots (user_id, platform, objective, product_key, budget_level) values ($1, 'meta', 'leads', 'wartosin 1490', 'campaign') on conflict do nothing`, [amaya]);
ok((await q(`select count(*)::int n from feeder.ad_slots where user_id = $1`, [amaya]))[0].n === 1, "one evergreen campaign per customer × platform × objective × product (two launches can't make two)");
await q(`insert into feeder.ad_lead_forms (user_id, platform, page_id, form_id, name, made_by_retexia) values ($1, 'meta', '987654321', '5550001', 'Wartosin 1490', true)`, [amaya]);
ok((await q(`select form_id from feeder.ad_lead_forms where user_id = $1 and feeder.alias_key(name) = feeder.alias_key('  wartosin   1490 ')`, [amaya])).length === 1, "lead forms are found by the product's form name in any capitals / spacing");

console.log("Autopublish: deleting a customer removes everything");
await q(`delete from auth.users where id = $1`, [kasun]);
ok((await q(`select count(*)::int n from feeder.ad_launches where user_id = $1`, [kasun]))[0].n === 0 && (await q(`select count(*)::int n from feeder.ad_accounts where user_id = $1`, [kasun]))[0].n === 0, "launches and accounts go with the customer");

summary();
