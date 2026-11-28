// Retexia Feeder → Auto comment (0046): the comment rules (apps/panels/lib/feeder/auto-comment/rules.ts)
// and the database part (free package, settings, the clock's fair claiming, the log, who can read what).
//
//   pnpm db:test   (or: node scripts/test-auto-comment.mjs)
import { readFileSync } from "node:fs";
import { createHarness, migration, seed } from "./lib/harness.mjs";
import { decide, defaultSettings, fill, hasLink, hasPhone, hasWord, readSettings } from "../apps/panels/lib/feeder/auto-comment/rules.ts";

const { db, ok, expectError, as, summary } = await createHarness();

console.log("Auto comment: the rules");
const s = defaultSettings();
let d = decide(s, { id: "c1", message: "Price kiyada?", author: "Nimal Perera" });
ok(d.reply?.includes("Nimal") && d.reply.includes("price") && d.rule?.startsWith("price") && !d.hide, "a price question gets the price rule's reply with the first name");
ok(d.private?.startsWith("Hi Nimal"), "and the private message");
d = decide(s, { id: "c2", message: "මිල කීයද", author: "Kamal" });
ok(d.rule?.startsWith("price"), "Sinhala words match too");
d = decide(s, { id: "c3", message: "Colombo walata delivery thiyenawada", author: "Kamal" });
ok(d.reply?.includes("cash on delivery"), "a delivery question gets the delivery rule");
d = decide(s, { id: "c4", message: "Nice product 👍", author: "Kamal" });
ok(d.rule === "default" && s.replies.some((r) => fill(r, "Kamal") === d.reply), "anything else gets one of the default replies");
ok(decide(s, { id: "c4", message: "Nice product 👍", author: "Kamal" }).reply === d.reply, "the same comment always gets the same variant");
d = decide(s, { id: "c5", message: "call me 077 123 4567", author: "Sunil" });
ok(d.hide === "phone number" && d.reply === null && d.private?.includes("Sunil"), "a phone number is hidden, gets no public reply but still the private message");
ok(hasPhone("+94771234567") && hasPhone("0771234567") && !hasPhone("Rs 2,490") && !hasPhone("2 bottles"), "phone numbers are found, prices are not");
d = decide(s, { id: "c6", message: "cheaper here www.othershop.lk", author: "X" });
ok(d.hide === "link", "links are hidden");
ok(hasLink("wa.me/94771234567") && hasLink("buy at shop.lk/item") && !hasLink("ok. thanks"), "links of any kind are found");
d = decide({ ...s, hide_words: ["scam", "බොරු"] }, { id: "c7", message: "This is a SCAM", author: "X" });
ok(d.hide === "word: scam", "chosen words are hidden in any capitals");
ok(decide({ ...s, hide_words: ["බොරු"] }, { id: "c8", message: "මේක බොරු", author: "X" }).hide === "word: බොරු", "Sinhala words too");
ok(!hasWord("Send me a phone", "one") && hasWord("I want one", "one"), "Latin words match as whole words only");
ok(decide({ ...s, hide_on: false }, { id: "c5", message: "call me 077 123 4567", author: "Sunil" }).hide === null, "hiding can be switched off");
ok(decide({ ...s, reply_on: false, private_on: false }, { id: "c9", message: "price?", author: "A" }).reply === null, "replies can be switched off");
ok(fill("Hi {name}, thanks 😊", "") === "Hi, thanks 😊" && fill("Yes {name} 😊 ok", null) === "Yes 😊 ok", "without a name the text still reads well");
ok(fill("Thank you {name} 😊", "Nimal Perera") === "Thank you Nimal 😊", "{name} is the first name only");
const r = readSettings({ replies: ["  a  ", "", "b"], rules: [{ words: [" x "], reply: "y" }, { words: [], reply: "z" }], hide_words: ["", "q"] });
ok(r.replies.join() === "a,b" && r.rules.length === 1 && r.rules[0].words[0] === "x" && r.hide_words.join() === "q", "saved settings are cleaned (empty replies, rules without words)");
ok(readSettings(null).rules.length === 3, "a customer without settings starts from the ready-made rules");

console.log("Auto comment: the free package (0046)");
await db.exec(migration);
await db.exec(seed);
const file = readFileSync(new URL("../supabase/migrations/0046_feeder_auto_comment.sql", import.meta.url), "utf8");
const q = async (sql, params) => (await db.query(sql, params)).rows;
await q(`insert into public.products (slug, code, name, short_name, status) values ('feeder', 'FDR', 'Retexia Feeder', 'Feeder', 'live') on conflict (slug) do nothing`);
await db.exec(file);
await db.exec(file);
const pk = await q(`select k.price_monthly::int price, k.setup_fee::int setup, k.is_active, (select count(*)::int from public.package_features f where f.package_id = k.id) features
                      from public.packages k join public.products p on p.id = k.product_id where p.slug = 'feeder' and k.slug = 'auto-comment'`);
ok(pk.length === 1 && pk[0].price === 0 && pk[0].setup === 0 && pk[0].is_active && pk[0].features === 6, "Feeder has a free Auto comment package with its features, once even when run twice");

const user = async (email, role = "customer") => {
  const id = (await q(`insert into auth.users (email) values ($1) returning id`, [email]))[0].id;
  if (role !== "customer") await q(`update public.profiles set role = $1 where id = $2`, [role, id]);
  return id;
};
const amaya = await user("amaya@example.com");
const kasun = await user("kasun@example.com");
const admin = await user("admin@retexia.test", "admin");

console.log("Auto comment: switching on starts the clock");
await q(`insert into feeder.comment_settings (user_id, replies) values ($1, '{hi}')`, [amaya]);
ok((await q(`select started_at from feeder.comment_settings where user_id = $1`, [amaya]))[0].started_at === null, "saved but off: no start time");
await q(`update feeder.comment_settings set enabled = true, started_at = now() - interval '3 days', problem = 'old' where user_id = $1`, [amaya]);
const st = (await q(`select started_at > now() - interval '1 minute' fresh, problem from feeder.comment_settings where user_id = $1`, [amaya]))[0];
ok(st.fresh && st.problem === null, "switching on sets the start to now (older comments are never touched) and clears the old problem");
await q(`update feeder.comment_settings set started_at = now() - interval '1 hour' where user_id = $1`, [amaya]);
await q(`update feeder.comment_settings set replies = '{hello}' where user_id = $1`, [amaya]);
ok((await q(`select started_at < now() - interval '30 minutes' kept from feeder.comment_settings where user_id = $1`, [amaya]))[0].kept, "saving settings while on keeps the start time");
await expectError(() => q(`update feeder.comment_settings set replies = '{a,b,c,d,e,f}' where user_id = $1`, [amaya]), "at most 5 default replies", /check/);

console.log("Auto comment: the clock claims fairly");
await q(`insert into feeder.comment_settings (user_id, enabled) values ($1, true)`, [kasun]);
const claim = async (u = null) => (await q(`select user_id from feeder.comment_claim(20, $1)`, [u])).map((x) => x.user_id).sort();
ok((await claim()).join() === [amaya, kasun].sort().join(), "everyone who is on and due is claimed");
ok((await claim()).length === 0, "nobody twice in the same minute, and not while a check runs");
await q(`select feeder.comment_release($1, 'Facebook said no')`, [amaya]);
const rel = (await q(`select locked_until, last_checked_at is not null checked, problem from feeder.comment_settings where user_id = $1`, [amaya]))[0];
ok(rel.locked_until === null && rel.checked && rel.problem === "Facebook said no", "release unlocks, notes the check and the problem");
ok((await claim(amaya)).join() === amaya, "\"Check now\" runs one customer straight away");
ok((await claim(amaya)).length === 0, "…but not while their check is running");
await q(`update feeder.comment_settings set enabled = false, locked_until = null, next_check_at = now() - interval '1 minute' where user_id = $1`, [kasun]);
ok(!(await claim()).includes(kasun), "switched off: never checked");

console.log("Auto comment: each comment is handled once");
// The checker claims a comment with exactly this upsert (onConflict user_id,dedupe) before it acts.
const claimRow = async (dedupe, kind = "comment") =>
  (await q(`insert into feeder.comment_log (user_id, page_id, post_id, kind, dedupe, comment_id) values ($1, '987654321', '987654321_1', $2, $3, '1_2')
            on conflict (user_id, dedupe) do nothing returning id`, [amaya, kind, dedupe])).length;
ok((await claimRow("c:1_2")) === 1, "a new comment is claimed (written down before anything is sent)");
ok((await claimRow("c:1_2")) === 0, "the same comment can't be claimed again, so it is never answered twice");
ok((await claimRow("first:987654321_1", "first_comment")) === 1 && (await claimRow("first:987654321_1", "first_comment")) === 0, "one first comment per post");
ok((await q(`select status from feeder.comment_log where user_id = $1 limit 1`, [amaya]))[0].status === "pending", "a claimed comment is pending until the checker notes what worked");

console.log("Auto comment: customers read their own rows, write nothing directly");
ok((await as("authenticated", amaya, `select user_id from feeder.comment_settings`)).rows.length === 1, "a customer sees their own settings");
ok((await as("authenticated", kasun, `select id from feeder.comment_log`)).rows.length === 0, "and nobody else's log");
await expectError(() => as("authenticated", amaya, `update feeder.comment_settings set enabled = true where user_id = $1`, [amaya]), "settings are saved through feeder.retexia.com only", /permission denied/);
await expectError(() => as("authenticated", amaya, `select * from feeder.comment_claim(20, null)`), "customers can't run the clock", /permission denied/);
ok((await as("authenticated", admin, `select user_id from feeder.comment_settings`)).rows.length === 2, "the Retexia team sees everyone's");
await q(`delete from auth.users where id = $1`, [amaya]);
ok((await q(`select count(*)::int n from feeder.comment_log where user_id = $1`, [amaya]))[0].n === 0, "deleting a customer removes their settings and log");

summary();
