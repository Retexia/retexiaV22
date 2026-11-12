// Retexia Plan (0030): goals stay private, a goal can be shared per person
// (viewer / editor), tasks are personal, the chat is for the goal's people.
//
//   pnpm db:test
import { createHarness, migration, seed } from "./lib/harness.mjs";

const { db, ok, expectError, as, summary } = await createHarness();
await db.exec(migration);
await db.exec(seed);
await db.exec(migration); // re-runnable
const q = async (sql, params) => (await db.query(sql, params)).rows;
const user = async (email) => (await q(`insert into auth.users (email) values ($1) returning id`, [email]))[0].id;

const nimal = await user("nimal@example.com");
const sara = await user("sara@example.com");
const kamal = await user("kamal@example.com");

console.log("Plan: goals, sharing, tasks, chat (0030)");
const goal = (await as("authenticated", nimal, `insert into plan.goals (owner_id, title, period, starts_on, ends_on, category) values ($1, 'Earn LKR 200,000', 'month', '2026-11-01', '2026-11-30', 'income') returning id`, [nimal])).rows[0].id;
const chart = (await as("authenticated", nimal, `insert into plan.charts (goal_id, title, unit, target) values ($1, 'Income', 'LKR', 200000) returning id`, [goal])).rows[0].id;
await as("authenticated", nimal, `insert into plan.points (chart_id, value, created_by) values ($1, 15000, $2)`, [chart, nimal]);
ok((await as("authenticated", nimal, `select id from plan.goals`)).rows.length === 1, "the owner sees their goal");
ok((await as("authenticated", sara, `select id from plan.goals`)).rows.length === 0, "nobody else does");
await expectError(() => as("authenticated", sara, `insert into plan.goals (owner_id, title, period, starts_on, ends_on) values ($1, 'x', 'week', '2026-11-02', '2026-11-08')`, [nimal]), "nobody can make goals for someone else", /row-level security/);
await expectError(() => as("authenticated", nimal, `insert into plan.goals (owner_id, title, period, starts_on, ends_on) values ($1, 'x', 'week', '2026-11-08', '2026-11-02')`, [nimal]), "a goal can't end before it starts", /check constraint/);
// Goals with their own length (0032).
ok((await as("authenticated", nimal, `insert into plan.goals (owner_id, title, period, length_n, length_unit, starts_on, ends_on) values ($1, '90-day sprint', 'custom', 90, 'day', '2026-11-12', '2027-02-09') returning id`, [nimal])).rows.length === 1, "a goal can run for a number of days");
await expectError(() => as("authenticated", nimal, `insert into plan.goals (owner_id, title, period, starts_on, ends_on) values ($1, 'x', 'custom', '2026-11-12', '2026-12-12')`, [nimal]), "a custom goal needs its length", /check constraint/);
await expectError(() => as("authenticated", nimal, `insert into plan.goals (owner_id, title, period, length_n, length_unit, starts_on, ends_on) values ($1, 'x', 'month', 1, 'month', '2026-11-01', '2026-11-30')`, [nimal]), "a calendar goal has no custom length", /check constraint/);
await expectError(() => as("authenticated", nimal, `insert into plan.goals (owner_id, title, period, length_n, length_unit, starts_on, ends_on) values ($1, 'x', 'custom', 20, 'year', '2026-11-12', '2046-11-11')`, [nimal]), "goals last at most 10 years", /check constraint/);
await q(`delete from plan.goals where title = '90-day sprint'`);

// Sharing one goal.
await as("authenticated", nimal, `insert into plan.members (goal_id, email, role, invited_by) values ($1, ' Sara@Example.com ', 'viewer', $2)`, [goal, nimal]);
const m = (await q(`select email, user_id from plan.members where goal_id = $1`, [goal]))[0];
ok(m.email === "sara@example.com" && m.user_id === sara, "an invited email with a Retexia account is linked at once");
ok((await as("authenticated", sara, `select id from plan.goals`)).rows.length === 1, "the invited person sees the goal");
ok((await as("authenticated", sara, `select value from plan.points`)).rows.length === 1, "and its chart values");
await expectError(() => as("authenticated", sara, `insert into plan.points (chart_id, value, created_by) values ($1, 5000, $2)`, [chart, sara]), "a viewer can't add values", /row-level security/);
await q(`update plan.members set role = 'editor' where goal_id = $1`, [goal]);
await as("authenticated", sara, `insert into plan.points (chart_id, value, created_by) values ($1, 5000, $2)`, [chart, sara]);
ok(true, "an editor can add values");
await expectError(() => as("authenticated", sara, `update plan.goals set title = 'Mine now' where id = $1`, [goal]).then((r) => { if (!r.affectedRows) throw new Error("row-level security: nothing changed"); }), "only the owner changes the goal", /row-level security/);
await expectError(() => as("authenticated", sara, `insert into plan.members (goal_id, email) values ($1, 'kamal@example.com')`, [goal]), "only the owner invites people", /row-level security/);
ok((await as("authenticated", kamal, `select id from plan.goals`)).rows.length === 0, "people who aren't invited see nothing");

// Chat.
await as("authenticated", sara, `insert into plan.messages (goal_id, author_id, body) values ($1, $2, 'Great start!')`, [goal, sara]);
await expectError(() => as("authenticated", sara, `insert into plan.messages (goal_id, author_id, kind, body) values ($1, $2, 'coach', 'I am the coach')`, [goal, sara]), "people can't post as the AI coach", /row-level security/);
await expectError(() => as("authenticated", kamal, `insert into plan.messages (goal_id, author_id, body) values ($1, $2, 'hi')`, [goal, kamal]), "outsiders can't post in a goal's chat", /row-level security/);
ok((await as("authenticated", nimal, `select body from plan.messages`)).rows.length === 1 && (await as("authenticated", kamal, `select body from plan.messages`)).rows.length === 0, "the chat is visible only to the goal's people");

// Leaving and removing.
await as("authenticated", sara, `delete from plan.members where goal_id = $1 and user_id = $2`, [goal, sara]);
ok((await as("authenticated", sara, `select id from plan.goals`)).rows.length === 0, "an invited person can leave a goal");

// Tasks are personal.
const task = (await as("authenticated", nimal, `insert into plan.tasks (owner_id, goal_id, title, repeat, every_n, starts_on) values ($1, $2, 'Call 5 customers', 'every', 2, '2026-11-01') returning id`, [nimal, goal])).rows[0].id;
await as("authenticated", nimal, `insert into plan.completions (task_id, day) values ($1, '2026-11-01')`, [task]);
ok((await as("authenticated", sara, `select id from plan.tasks`)).rows.length === 0, "tasks are personal");
await expectError(() => as("authenticated", sara, `insert into plan.completions (task_id, day) values ($1, '2026-11-03')`, [task]), "nobody can tick someone else's task", /row-level security/);

// Invite before sign-up, emails.
await as("authenticated", nimal, `insert into plan.members (goal_id, email) values ($1, 'new.person@example.com')`, [goal]);
ok((await q(`select user_id from plan.members where email = 'new.person@example.com'`))[0].user_id === null, "an email without an account waits for them");
await expectError(() => as("authenticated", nimal, `select plan.queue_email('plan.weekly', 'x@example.com', null, 's', 'b')`), "only the server can queue Plan emails", /permission denied/);
await q(`select plan.queue_email('plan.weekly', 'Nimal@Example.com', $1, 'Your week', 'Body', '{"url": "https://plan.retexia.com"}')`, [nimal]);
ok((await q(`select recipient from public.notifications_outbox where event = 'plan.weekly'`))[0].recipient === "nimal@example.com", "Plan emails go to the outbox like every Retexia email");

// Deleting the account deletes their Plan.
await q(`delete from auth.users where id = $1`, [nimal]);
ok((await q(`select count(*)::int n from plan.goals`))[0].n === 0 && (await q(`select count(*)::int n from plan.tasks`))[0].n === 0, "deleting a customer deletes their goals and tasks");

summary();
