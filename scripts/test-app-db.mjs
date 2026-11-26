// The Retexia app (0044): push tokens, notification prefs, push rows in the outbox, Lingo Feeder
// pushes, and account deletion requests.
//
//   pnpm db:test
import { createHarness, migration, seed } from "./lib/harness.mjs";

const { db, ok, expectError, as, summary } = await createHarness();
await db.exec(migration);
await db.exec(seed);
await db.exec(migration); // re-runnable
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const user = async (email) => (await q(`insert into auth.users (email) values ($1) returning id`, [email]))[0].id;
const pushes = async (uid) => q(`select event, subject, body, payload from public.notifications_outbox where channel = 'push' and user_id = $1 order by created_at, id`, [uid]);

const nimal = await user("nimal@example.com");
const sara = await user("sara@example.com");
const TOKEN = "ExponentPushToken[abcdefghij1234567890]";

console.log("App: push tokens (0044)");
await expectError(() => as("anon", null, `select public.register_push_token($1, 'android')`, [TOKEN]), "visitors can't register a phone", /permission denied/);
await expectError(() => as("authenticated", nimal, `select public.register_push_token('not-a-token', 'android')`), "only real Expo push tokens", /check constraint/);
await as("authenticated", nimal, `select public.register_push_token($1, 'android', 'Pixel 8', '1.0.0')`, [TOKEN]);
ok((await as("authenticated", nimal, `select expo_token from public.push_tokens`)).rows.length === 1, "a person sees their own phone");
ok((await as("authenticated", sara, `select expo_token from public.push_tokens`)).rows.length === 0, "nobody else sees it");
await expectError(() => as("authenticated", nimal, `insert into public.push_tokens (user_id, expo_token, platform) values ($1, 'ExponentPushToken[zzzzzzzzzzzz]', 'android')`, [sara]), "nobody writes tokens directly", /permission denied/);
await as("authenticated", sara, `select public.register_push_token($1, 'android')`, [TOKEN]);
const moved = await one(`select user_id, device_name, disabled from public.push_tokens where expo_token = $1`, [TOKEN]);
ok(moved.user_id === sara && moved.device_name === null, "signing in on the same phone moves the token to the new person");
await as("authenticated", nimal, `select public.unregister_push_token($1)`, [TOKEN]);
ok((await one(`select count(*)::int n from public.push_tokens`)).n === 1, "someone else can't sign that phone out");
await as("authenticated", sara, `select public.unregister_push_token($1)`, [TOKEN]);
ok((await one(`select count(*)::int n from public.push_tokens`)).n === 0, "signing out removes the phone");
await as("authenticated", nimal, `select public.register_push_token($1, 'android', 'Pixel 8', '1.0.0')`, [TOKEN]);

console.log("\nApp: queue_push and preferences");
await expectError(() => as("authenticated", nimal, `select public.queue_push($1, 'x.y', 'Hi', 'There')`, [nimal]), "only the server queues pushes", /permission denied/);
ok((await one(`select public.queue_push($1, 'test.hello', 'Hi', 'There', '/inbox') as r`, [sara])).r === false, "no phone with the app: nothing queued");
ok((await one(`select public.queue_push($1, 'test.hello', 'Hi', 'There', '/inbox') as r`, [nimal])).r === true, "with the app: queued");
const p1 = (await pushes(nimal))[0];
ok(p1.subject === "Hi" && p1.payload.url === "/inbox", "the push row has its title and the screen it opens");
ok((await as("authenticated", nimal, `select subject from public.notifications_outbox`)).rows.length === 1, "a person reads their own app notifications (Inbox)");
ok((await as("authenticated", sara, `select subject from public.notifications_outbox`)).rows.length === 0, "and nobody else's");
await q(`insert into public.notifications_outbox (event, channel, recipient, user_id, subject, body) values ('test.mail', 'email', 'nimal@example.com', $1, 'Mail', 'x')`, [nimal]);
ok((await as("authenticated", nimal, `select subject from public.notifications_outbox`)).rows.length === 1, "emails stay out of the Inbox");
await expectError(() => as("authenticated", nimal, `insert into public.notification_prefs (user_id, push) values ($1, false)`, [sara]), "nobody changes someone else's preferences", /row-level security/);
await as("authenticated", nimal, `insert into public.notification_prefs (user_id, muted) values ($1, '{lingo_feeder.order,order.*}')`, [nimal]);
ok((await one(`select public.queue_push($1, 'lingo_feeder.order', 'x', 'y') as r`, [nimal])).r === false, "a muted event isn't pushed");
ok((await one(`select public.queue_push($1, 'order.status_changed', 'x', 'y') as r`, [nimal])).r === false, "a muted kind (order.*) isn't pushed");
ok((await one(`select public.queue_push($1, 'lingo_feeder.call', 'x', 'y') as r`, [nimal])).r === true, "other events still are");
await as("authenticated", nimal, `update public.notification_prefs set push = false, muted = '{}' where user_id = $1`, [nimal]);
ok((await one(`select public.queue_push($1, 'lingo_feeder.call', 'x', 'y') as r`, [nimal])).r === false, "app notifications off: nothing is pushed");
await as("authenticated", nimal, `update public.notification_prefs set push = true where user_id = $1`, [nimal]);
await q(`update public.push_tokens set disabled = true where user_id = $1`, [nimal]);
ok((await one(`select public.queue_push($1, 'lingo_feeder.call', 'x', 'y') as r`, [nimal])).r === false, "a phone Expo said is gone gets nothing");
await q(`update public.push_tokens set disabled = false where user_id = $1`, [nimal]);
await q(`delete from public.notifications_outbox where user_id = $1`, [nimal]);

console.log("\nApp: account notices push only 'it's ready' news");
await q(`select public._notify_customer('order.status_changed', null, $1, 'Update on your request LNG-1', 'Awaiting payment. Pay from your account.', '{"ref": "LNG-1", "to_status": "awaiting_payment"}')`, [nimal]);
ok((await pushes(nimal)).length === 0, "nothing about paying is pushed");
await q(`select public._notify_customer('payment.confirmed', null, $1, 'Payment received', 'Thanks', '{"ref": "LNG-1"}')`, [nimal]);
ok((await pushes(nimal)).length === 0, "billing stays on email");
await q(`select public._notify_customer('order.status_changed', null, $1, 'Update on your request LNG-1', 'Active. Pay LKR 6,900 monthly.', '{"ref": "LNG-1", "to_status": "active"}')`, [nimal]);
const live = await pushes(nimal);
ok(live.length === 1 && live[0].subject === "Retexia is ready" && !/LKR|pay/i.test(live[0].body), "going live pushes its own short words, never the email text");
ok((await q(`select 1 from public.notifications_outbox where channel = 'email' and user_id = $1 and event = 'order.status_changed'`, [nimal])).length === 2, "emails are sent as before");
await q(`select public._notify_customer('order.created', null, $1, 'Your free trial has started', 'x', '{"ref": "FDR-1", "status": "trial"}')`, [nimal]);
ok((await pushes(nimal)).at(-1).subject.startsWith("Your free trial of"), "a free trial start pushes");
await q(`delete from public.notifications_outbox`);

console.log("\nApp: Lingo Feeder pushes");
await q(`select lingo_feeder.ensure_seller($1, 'Amaya Shop')`, [nimal]);
await q(`insert into lingo_feeder.chats (user_id, phone, profile_name, needs_call, call_reason) values ($1, '94771234567', 'Kamal Perera', true, 'Asked for a call')`, [nimal]);
let lf = await pushes(nimal);
ok(lf.length === 1 && lf[0].event === "lingo_feeder.call" && lf[0].payload.url === "/lingo-feeder/chats?status=call", "a chat that needs a call pushes \"Call them\"");
ok(!JSON.stringify(lf[0]).includes("Kamal") && !JSON.stringify(lf[0]).includes("94771234567"), "the push never carries the customer's name or number");
await q(`update lingo_feeder.chats set call_reason = 'Again' where user_id = $1`, [nimal]);
await q(`update lingo_feeder.chats set needs_call = true where user_id = $1`, [nimal]);
ok((await pushes(nimal)).length === 1, "once per call request");
await q(`update lingo_feeder.chats set needs_call = false where user_id = $1`, [nimal]);
await q(`update lingo_feeder.chats set needs_call = true, call_reason = 'Marked by you' where user_id = $1`, [nimal]);
ok((await pushes(nimal)).length === 1, "the seller's own \"Call them\" doesn't push");
await q(`insert into lingo_feeder.chats (user_id, phone, needs_call, test) values ($1, 'test-panel', true, true)`, [nimal]);
ok((await pushes(nimal)).length === 1, "test chats (Try Lingo) don't push");

const order = (await one(`insert into lingo_feeder.orders (user_id, phone, product_name, qty, total) values ($1, '94771234567', 'Herbal Tea', 2, 3450) returning id`, [nimal])).id;
ok((await pushes(nimal)).length === 1, "a draft order doesn't push");
await q(`update lingo_feeder.orders set status = 'confirmed' where id = $1`, [order]);
lf = await pushes(nimal);
ok(lf.length === 2 && lf[1].event === "lingo_feeder.order" && lf[1].body === "Herbal Tea × 2 · Rs. 3,450", "a confirmed order pushes the product and total");
await q(`update lingo_feeder.orders set status = 'cancelled' where id = $1`, [order]);
await q(`update lingo_feeder.orders set status = 'confirmed' where id = $1`, [order]);
ok((await pushes(nimal)).length === 2, "turning a cancelled order back on doesn't push again");
await q(`insert into lingo_feeder.orders (user_id, phone, product_name, total, status, test) values ($1, 'test-panel', 'X', 100, 'confirmed', true)`, [nimal]);
ok((await pushes(nimal)).length === 2, "test orders don't push");

await q(`insert into lingo_feeder.numbers (phone_number_id, user_id, status) values ('1110001', $1, 'connected')`, [nimal]);
await q(`update lingo_feeder.numbers set status = 'problem', problem = 'Token expired' where user_id = $1`, [nimal]);
lf = await pushes(nimal);
ok(lf.length === 3 && lf[2].event === "lingo_feeder.number", "a WhatsApp number problem pushes");
await q(`update lingo_feeder.numbers set problem = 'Still' where user_id = $1`, [nimal]);
ok((await pushes(nimal)).length === 3, "once per problem");

console.log("\nApp: account deletion requests");
await q(`update public.staff_settings set staff_notification_emails = 'team@retexia.test' where id = 1`);
await expectError(() => as("anon", null, `select public.request_account_deletion('x', 'app')`), "visitors can't ask (sign in first)", /permission denied/);
const r1 = (await as("authenticated", sara, `select public.request_account_deletion('Not using it', 'app') as r`)).rows[0].r;
ok(r1.new === true, "a signed-in person can ask to delete their account");
const r2 = (await as("authenticated", sara, `select public.request_account_deletion(null, 'web') as r`)).rows[0].r;
ok(r2.new === false && r2.id === r1.id, "asking again keeps the first request");
ok((await q(`select 1 from public.notifications_outbox where event = 'account.deletion_requested' and recipient = 'team@retexia.test'`)).length === 1, "the team is emailed");
ok((await q(`select 1 from public.audit_logs where action = 'deletion_requested'`)).length === 1, "and it's in the audit log");
ok((await as("authenticated", sara, `select status from public.account_deletion_requests`)).rows.length === 1, "a person sees their own request");
ok((await as("authenticated", nimal, `select status from public.account_deletion_requests`)).rows.length === 0, "and nobody else's");
await expectError(() => as("authenticated", sara, `update public.account_deletion_requests set status = 'done'`).then((r) => { if (!r.affectedRows) throw new Error("permission denied: nothing changed"); }), "nobody marks their own request done", /permission denied/);
ok((await as("authenticated", sara, `select public.cancel_account_deletion() as r`)).rows[0].r === true, "they can change their mind");
ok((await one(`select status from public.account_deletion_requests where id = $1`, [r1.id])).status === "cancelled", "the request is cancelled");
const r3 = (await as("authenticated", sara, `select public.request_account_deletion(null, 'web') as r`)).rows[0].r;
ok(r3.new === true, "and ask again later");
await q(`delete from auth.users where id = $1`, [sara]);
const done = await one(`select status, email, user_id from public.account_deletion_requests where id = $1`, [r3.id]);
ok(done.status === "done" && done.user_id === null && done.email === "sara@example.com", "deleting the account marks the request done and keeps the email as the record");

console.log("\nApp: pushes go out on their own (0045)");
await q(`delete from net.calls`);
await q(`insert into public.push_tokens (user_id, expo_token, platform) values ($1, 'ExponentPushToken[pushdelivery0001]', 'android') on conflict do nothing`, [nimal]);
await q(`select public.queue_push($1, 'lingo_feeder.call', 'x', 'y')`, [nimal]);
ok((await one(`select secret from vault.secrets where name = 'push_tick_url'`)).secret === "https://feeder.retexia.com/api/push/tick", "the migration sets where pushes are sent from");
ok((await q(`select 1 from net.calls`)).length === 0, "no cron key in Vault yet: nothing is called (and nothing breaks)");
await q(`update vault.secrets set secret = 'https://feeder.example.test/api/push/tick' where name = 'push_tick_url'`);
await q(`select vault.create_secret('cron-key-0123456789abcdef', 'post_cron_key')`);
await q(`select public.queue_push($1, 'lingo_feeder.call', 'x', 'y')`, [nimal]);
let calls = await q(`select url, headers from net.calls`);
ok(calls.length === 1 && calls[0].url === "https://feeder.example.test/api/push/tick" && calls[0].headers["X-Retexia-Key"] === "cron-key-0123456789abcdef", "a new push asks the server to send it at once, with the cron key");
await q(`insert into public.notifications_outbox (event, channel, recipient, subject, body) values ('x', 'email', 'a@example.com', 's', 'b')`);
ok((await q(`select 1 from net.calls`)).length === 1, "emails don't call the push sender");
await q(`insert into public.notifications_outbox (event, channel, user_id, subject, body) select 'x', 'push', $1, 's', 'b' from generate_series(1, 3)`, [nimal]);
ok((await q(`select 1 from net.calls`)).length === 2, "several pushes in one go ask once");
await expectError(() => as("authenticated", nimal, `select public.kick_push_dispatch()`), "nobody else can make the server send", /permission denied/);

summary();
