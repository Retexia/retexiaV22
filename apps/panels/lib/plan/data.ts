import "server-only";

import { publicDb, type PlanDb } from "./db";
import { goalAccess } from "./session";
import { dayStats, shift, type Chart, type Done, type Goal, type Point, type Role, type Task } from "./logic";

export type GoalRow = Goal & { role: Role };
export type Person = { id: string; name: string; email: string };

/** The person's tasks (not archived) and what they ticked in the last 400 days. */
export async function loadTasks(db: PlanDb, userId: string, today: string) {
  const { data: rows } = await db
    .from("tasks")
    .select("id, goal_id, title, repeat, every_n, weekdays, starts_on, ends_on")
    .eq("owner_id", userId)
    .eq("archived", false)
    .order("created_at");
  const tasks = (rows ?? []) as Task[];
  const done: Done = new Map();
  if (tasks.length) {
    const { data: ticks } = await db.from("completions").select("task_id, day").in("task_id", tasks.map((t) => t.id)).gte("day", shift(today, -400)).limit(20000);
    for (const c of ticks ?? []) {
      if (!done.has(c.task_id)) done.set(c.task_id, new Set());
      done.get(c.task_id)!.add(c.day);
    }
  }
  return { tasks, done };
}

/** Every goal the person owns or was invited to, with all their charts and values. */
export async function loadGoals(db: PlanDb, userId: string) {
  const [{ data: own }, { data: shared }] = await Promise.all([
    db.from("goals").select("*").eq("owner_id", userId).order("starts_on", { ascending: false }),
    db.from("members").select("goal_id, role").eq("user_id", userId),
  ]);
  const sharedIds = (shared ?? []).map((m) => m.goal_id);
  const { data: sharedGoals } = sharedIds.length ? await db.from("goals").select("*").in("id", sharedIds) : { data: [] };
  const goals: GoalRow[] = [
    ...((own ?? []) as Goal[]).map((g) => ({ ...g, role: "owner" as Role })),
    ...((sharedGoals ?? []) as Goal[]).map((g) => ({ ...g, role: ((shared ?? []).find((m) => m.goal_id === g.id)?.role ?? "viewer") as Role })),
  ];
  const { charts, points } = await loadCharts(db, goals.map((g) => g.id));
  return { goals, charts, points };
}

export async function loadCharts(db: PlanDb, goalIds: string[]) {
  if (!goalIds.length) return { charts: [] as Chart[], points: [] as Point[] };
  const { data: charts } = await db.from("charts").select("*").in("goal_id", goalIds).order("sort").order("created_at");
  const ids = (charts ?? []).map((c) => c.id);
  const { data: points } = ids.length ? await db.from("points").select("id, chart_id, at, label, value, note, created_by").in("chart_id", ids).order("at").limit(20000) : { data: [] };
  return {
    charts: ((charts ?? []) as Chart[]).map((c) => ({ ...c, target: c.target == null ? null : Number(c.target) })),
    points: ((points ?? []) as Point[]).map((p) => ({ ...p, value: Number(p.value) })),
  };
}

/** Share of the goal's task days done so far (null when the goal has no tasks). */
export function goalTaskRate(goal: Goal, tasks: Task[], done: Done, today: string) {
  const mine = tasks.filter((t) => t.goal_id === goal.id);
  if (!mine.length) return null;
  const to = today < goal.ends_on ? today : goal.ends_on;
  if (to < goal.starts_on) return null;
  const stats = dayStats(mine, done, goal.starts_on, to);
  const due = stats.reduce((s, d) => s + d.due, 0);
  return due ? stats.reduce((s, d) => s + d.done, 0) / due : null;
}

export async function people(ids: (string | null | undefined)[]): Promise<Map<string, Person>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!unique.length) return new Map();
  const { data } = await publicDb().from("profiles").select("id, full_name, email").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, { id: p.id, name: p.full_name || (p.email ?? "").split("@")[0] || "Someone", email: p.email ?? "" }]));
}

export type ChatMessage = { id: string; kind: "user" | "coach"; body: string; created_at: string; author_id: string | null; author: string };

/** Everything the goal page shows, or null when the person may not see this goal. */
export async function loadGoal(db: PlanDb, goalId: string, userId: string, today: string) {
  const access = await goalAccess(db, goalId, userId);
  if (!access) return null;
  const { goal, role } = access;
  const [{ charts, points }, { data: members }, { data: messages }, { data: children }, parent] = await Promise.all([
    loadCharts(db, [goal.id]),
    db.from("members").select("id, email, user_id, role, created_at").eq("goal_id", goal.id).order("created_at"),
    db.from("messages").select("id, kind, body, created_at, author_id").eq("goal_id", goal.id).order("created_at", { ascending: false }).limit(100),
    db.from("goals").select("*").eq("parent_id", goal.id).order("starts_on"),
    goal.parent_id ? goalAccess(db, goal.parent_id, userId) : Promise.resolve(null),
  ]);
  const owner = goal.owner_id;
  const names = await people([owner, ...(members ?? []).map((m) => m.user_id), ...(messages ?? []).map((m) => m.author_id), ...points.map((p) => p.created_by)]);
  const { tasks, done } = role === "owner" ? await loadTasks(db, userId, today) : { tasks: [] as Task[], done: new Map() as Done };
  return {
    goal,
    role,
    charts,
    points,
    owner: names.get(owner) ?? { id: owner, name: "Owner", email: "" },
    members: (members ?? []).map((m) => ({ ...m, name: m.user_id ? (names.get(m.user_id)?.name ?? m.email) : m.email, joined: Boolean(m.user_id) })),
    messages: ((messages ?? []) as Omit<ChatMessage, "author">[]).reverse().map((m) => ({ ...m, author: m.kind === "coach" ? "Retexia coach" : m.author_id ? (names.get(m.author_id)?.name ?? "Someone") : "Someone" })),
    children: (children ?? []) as Goal[],
    parent: parent?.goal ?? null,
    tasks: tasks.filter((t) => t.goal_id === goal.id),
    done,
    names: Object.fromEntries([...names].map(([id, p]) => [id, p.name])),
  };
}
