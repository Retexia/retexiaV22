// Retexia Feeder → Connections: the seller's own Meta Business portfolio (0048).
//   * the server's allow-list (apps/panels/lib/feeder/meta-allow.ts) agrees with the n8n gateway's, call by call;
//   * the token lives in Vault, customers never see it, removing deletes it;
//   * at most 2 Pages answer comments, and one Page belongs to one Retexia account;
//   * with their own token Autopublish doesn't wait for Retexia; the older partner way still does.
//
//   pnpm db:test   (or: node scripts/test-meta-connection.mjs)
import { readFileSync } from "node:fs";
import { createHarness, migration, seed } from "./lib/harness.mjs";
import { metaAllowed } from "../apps/panels/lib/feeder/meta-allow.ts";

const { db, ok, expectError, as, summary } = await createHarness();

console.log("Connections: the same allow-list as the n8n gateway");
const wf = JSON.parse(readFileSync(new URL("../n8n/feeder-autopublish.json", import.meta.url), "utf8"));
const configCode = wf.nodes.find((n) => n.name === "Config").parameters.jsCode;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const config = new AsyncFunction("$input", configCode);
const n8nAllows = async (body) => (await config({ first: () => ({ json: { body } }) }))[0].json.kind !== "refused";
const P = "987654321";
const calls = [
  { action: "meta", method: "GET", path: "act_123456", params: { fields: "name" } },
  { action: "meta", method: "POST", path: "act_123456/campaigns", params: { name: "x" } },
  { action: "meta", method: "POST", path: "123456", params: { status: "ACTIVE" } },
  { action: "meta", method: "POST", path: "123456", params: { name: "renamed" } },
  { action: "meta", method: "POST", path: "act_123456/users", params: {} },
  { action: "meta", method: "GET", path: "", params: {} },
  { action: "meta", method: "GET", path: "me/adaccounts", params: {} },
  { action: "meta_page", method: "GET", page_id: P, path: `${P}/leadgen_forms` },
  { action: "meta_page", method: "GET", page_id: P, path: `${P}/posts`, params: { fields: "id" } },
  { action: "meta_page", method: "GET", page_id: P, path: `${P}/ads_posts` },
  { action: "meta_page", method: "POST", page_id: P, path: "111_222/comments", params: { message: "hi" } },
  { action: "meta_page", method: "POST", page_id: P, path: "111_222/comments", params: { message: "hi", attachment_url: "x" } },
  { action: "meta_page", method: "POST", page_id: P, path: "111_222", params: { is_hidden: true } },
  { action: "meta_page", method: "POST", page_id: P, path: "111_222", params: { message: "edit" } },
  { action: "meta_page", method: "POST", page_id: P, path: `${P}/messages`, params: { recipient: { comment_id: "111_222" }, message: { text: "hi" } } },
  { action: "meta_page", method: "POST", page_id: P, path: `${P}/messages`, params: { recipient: { id: "5555" }, message: { text: "spam" } } },
  { action: "meta_page", method: "POST", page_id: P, path: `${P}/feed`, params: { message: "post" } },
  { action: "meta_page", method: "POST", page_id: P, path: `${P}/roles`, params: { user: "x" } },
  { action: "meta_image", account: "act_123456", image_url: "https://abc.supabase.co/storage/v1/object/sign/autopublish/u/x.jpg?token=1" },
  { action: "meta_image", account: "act_123456", image_url: "https://evil.example/x.jpg" },
];
let agree = 0;
for (const c of calls) if ((metaAllowed(c) === null) === (await n8nAllows(c))) agree++;
ok(agree === calls.length, `the server and n8n agree on all ${calls.length} sample calls (allowed and refused)`);
ok(metaAllowed(calls[15]) !== null && metaAllowed(calls[16]) !== null, "no messages except private replies to comments, no new Page posts");
ok(metaAllowed(calls[3]) !== null && metaAllowed(calls[17]) !== null, "no renaming objects, no Page roles");

console.log("Connections: the token in Vault (0048)");
await db.exec(migration);
await db.exec(seed);
await db.exec(readFileSync(new URL("../supabase/migrations/0048_feeder_meta_connection.sql", import.meta.url), "utf8"));
const q = async (sql, params) => (await db.query(sql, params)).rows;
const user = async (email, role = "customer") => {
  const id = (await q(`insert into auth.users (email) values ($1) returning id`, [email]))[0].id;
  if (role !== "customer") await q(`update public.profiles set role = $1 where id = $2`, [role, id]);
  return id;
};
const amaya = await user("amaya@example.com");
const kasun = await user("kasun@example.com");
const TOKEN = "EAAB" + "x".repeat(120) + "WXYZ";
await q(`select feeder.save_meta_token($1, '1234567890', $2)`, [amaya, TOKEN]);
const c = (await q(`select business_id, token_last4, status from feeder.meta_connections where user_id = $1`, [amaya]))[0];
ok(c.business_id === "1234567890" && c.token_last4 === "WXYZ" && c.status === "pending", "the portfolio is saved with only the token's last 4 characters");
ok((await q(`select token from feeder.meta_token($1)`, [amaya]))[0].token === TOKEN, "the server reads the token back from Vault");
await q(`select feeder.save_meta_token($1, '1234567890', $2)`, [amaya, TOKEN.replace("WXYZ", "ABCD")]);
ok((await q(`select count(*)::int n from vault.secrets where name like 'feeder_meta_%'`))[0].n === 1 && (await q(`select token from feeder.meta_token($1)`, [amaya]))[0].token.endsWith("ABCD"), "a new token replaces the old one (one secret)");
await expectError(() => q(`select feeder.save_meta_token($1, 'abc', $2)`, [kasun, TOKEN]), "the portfolio ID is numbers only", /business id/);
await expectError(() => q(`select feeder.save_meta_token($1, '1234567890', 'short')`, [kasun]), "a token must look like one", /token/);
await expectError(() => as("authenticated", amaya, `select token from feeder.meta_token($1)`, [amaya]), "customers can't read tokens", /permission denied/);
await expectError(() => as("authenticated", amaya, `select token_secret_id from feeder.meta_connections`), "…nor the secret's id", /permission denied/);
ok((await as("authenticated", amaya, `select business_id, token_last4 from feeder.meta_connections`)).rows.length === 1, "but they see their own connection");

console.log("Connections: ad accounts and Pages");
const asset = (u, kind, id, extra = "") => q(`insert into feeder.meta_assets (user_id, kind, asset_id, name${extra ? ", " + extra.split("=")[0] : ""}) values ($1, $2, $3, 'x'${extra ? ", " + extra.split("=")[1] : ""})`, [u, kind, id]);
for (const id of ["111111", "222222", "333333"]) await asset(amaya, "ad_account", id);
await asset(amaya, "page", "900001", "for_comments=true");
await asset(amaya, "page", "900002", "for_comments=true");
await asset(amaya, "page", "900003");
await expectError(() => q(`update feeder.meta_assets set for_comments = true where user_id = $1 and asset_id = '900003'`, [amaya]), "Auto comment works on at most 2 Pages", /at most 2/);
await expectError(() => q(`insert into feeder.meta_assets (user_id, kind, asset_id, for_comments) values ($1, 'ad_account', '444444', true)`, [amaya]), "only Pages answer comments", /check/);
await asset(kasun, "page", "900001");
await expectError(() => q(`update feeder.meta_assets set for_comments = true where user_id = $1 and asset_id = '900001'`, [kasun]), "a Page answers its comments through one Retexia account", /duplicate key/);
await q(`update feeder.meta_assets set is_default = true where user_id = $1 and asset_id = '111111'`, [amaya]);
await expectError(() => q(`update feeder.meta_assets set is_default = true where user_id = $1 and asset_id = '222222'`, [amaya]), "one default ad account", /duplicate key/);
await expectError(() => as("authenticated", amaya, `update feeder.meta_assets set for_comments = true where user_id = $1`, [amaya]), "customers change them only through feeder.retexia.com", /permission denied/);

console.log("Connections: own token vs. sharing with Retexia");
await q(`insert into feeder.ad_accounts (user_id, meta_via, meta_ad_account_id, meta_page_id, meta_status) values ($1, 'token', '111111', '900001', 'connected')`, [amaya]);
ok((await q(`select meta_status from feeder.ad_accounts where user_id = $1`, [amaya]))[0].meta_status === "connected", "with their own token it's connected straight away (checked by the server)");
await q(`update feeder.ad_accounts set meta_ad_account_id = '222222' where user_id = $1`, [amaya]);
ok((await q(`select meta_status from feeder.ad_accounts where user_id = $1`, [amaya]))[0].meta_status === "connected", "…and switching to another of their ad accounts doesn't wait for Retexia");
await q(`insert into feeder.ad_accounts (user_id, meta_ad_account_id, meta_page_id, meta_status) values ($1, '555555', '777777', 'connected')`, [kasun]);
ok((await q(`select meta_status from feeder.ad_accounts where user_id = $1`, [kasun]))[0].meta_status === "requested", "the older partner way still waits for Retexia");
await expectError(() => as("authenticated", kasun, `update feeder.ad_accounts set meta_via = 'token' where user_id = $1`, [kasun]), "a customer can't switch themselves to 'own token'", /permission denied/);

console.log("Connections: disconnecting deletes the token");
await q(`select feeder.remove_meta_connection($1)`, [amaya]);
ok((await q(`select count(*)::int n from vault.secrets where name like 'feeder_meta_%'`))[0].n === 0, "the token is gone from Vault");
ok((await q(`select count(*)::int n from feeder.meta_assets where user_id = $1`, [amaya]))[0].n === 0, "and the ad accounts and Pages");
const a2 = (await q(`select meta_via, meta_status, meta_ad_account_id from feeder.ad_accounts where user_id = $1`, [amaya]))[0];
ok(a2.meta_via === "partner" && a2.meta_status === "none" && a2.meta_ad_account_id === null, "Autopublish stops using the account");


console.log("Gateway keys: entered in admin, kept in Vault, the workflow holds none (0049)");
await db.exec(readFileSync(new URL("../supabase/migrations/0049_feeder_gateway_keys.sql", import.meta.url), "utf8"));
const owner = await user("owner@retexia.test", "owner");
const staffAdmin = await user("staff@retexia.test", "admin");
await as("authenticated", owner, `select public.admin_set_gateway_key('openai', 'sk-test-1234567890abcdWXYZ')`);
await as("authenticated", owner, `select public.admin_set_gateway_key('evolution_url', 'https://evo.example.com')`);
const shown = (await as("authenticated", owner, `select public.admin_gateway_keys() k`)).rows[0].k;
ok(shown.openai === "••••WXYZ" && shown.evolution_url === "https://evo.example.com", "the owner sees only the last 4 characters of a key (URLs in full)");
ok((await q(`select feeder.gateway_keys() k`))[0].k.openai === "sk-test-1234567890abcdWXYZ", "feeder.retexia.com's server reads the key to send with a call");
await expectError(() => as("authenticated", staffAdmin, `select public.admin_set_gateway_key('openai', 'sk-x')`), "only an owner changes them", /owner/);
await expectError(() => as("authenticated", kasun, `select feeder.gateway_keys()`), "customers can't read them", /permission denied/);
await expectError(() => as("authenticated", owner, `select public.admin_set_gateway_key('aws', 'x')`), "only the known keys", /Unknown key/);
await expectError(() => as("authenticated", owner, `select public.admin_set_gateway_key('evolution_url', 'http://plain')`), "the Evolution URL must be https", /https/);
ok((await q(`select count(*)::int n from public.audit_logs where table_name = 'feeder_gateway'`))[0].n >= 2, "every change is in the audit log");
await as("authenticated", owner, `select public.admin_set_gateway_key('openai', '')`);
ok(!("openai" in (await q(`select feeder.gateway_keys() k`))[0].k), "removing a key deletes it from Vault");
const noCreds = wf.nodes.filter((n) => n.credentials || (n.parameters.authentication && n.parameters.authentication !== "none"));
ok(noCreds.length === 0 && wf.settings.saveDataSuccessExecution === "none" && wf.settings.saveDataErrorExecution === "none", "the n8n workflow has no credentials and keeps no execution data");

summary();
