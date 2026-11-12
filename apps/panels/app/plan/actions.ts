"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { coachReply } from "@/lib/plan/coach";
import { people, type ChatMessage } from "@/lib/plan/data";
import { daysBetween, goalStart, grainFor, lengthRange, periodLabel, periodRange } from "@/lib/plan/logic";
import { planWorker } from "@/lib/plan/n8n";
import { goalAccess, requirePlan } from "@/lib/plan/session";

const uuid = z.uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
function done(message: string): ActionResult;
function done<T>(message: string, data: T): ActionResult<T>;
function done<T>(message: string, data?: T): ActionResult<T> {
  revalidatePath("/", "layout");
  return { ok: true, message, data };
}
const planUrl = () => (process.env.PLAN_PANEL_URL || "https://plan.retexia.com").replace(/\/+$/, "");

// ---------------------------------------------------------------- goals

const TEMPLATES = {
  income: { category: "income", chart: { title: "Income", unit: "LKR", mode: "total", kind: "line" }, task: "Write down today's income" },
  savings: { category: "savings", chart: { title: "Saved", unit: "LKR", mode: "total", kind: "line" }, task: "Put money aside" },
  habit: { category: "habit", chart: null, task: null },
  custom: { category: "custom", chart: null, task: null },
} as const;

const goalInput = z.object({
  id: uuid.optional(),
  template: z.enum(["income", "savings", "habit", "custom"]).default("custom"),
  title: z.string().trim().min(1, "Name the goal").max(140),
  why: z.string().trim().max(1000).default(""),
  period: z.enum(["year", "month", "week", "custom"]),
  /** Custom goals: how long, from `from` (default today). */
  length_n: z.number().int().min(1, "At least 1").max(999).nullable().optional(),
  length_unit: z.enum(["day", "week", "month", "year"]).nullable().optional(),
  on: day,
  /** Start counting from (inside the period). Empty: today for a running period, else its first day. */
  from: day.nullable().optional(),
  category: z.enum(["income", "savings", "business", "health", "learning", "habit", "custom"]),
  parent_id: uuid.nullable().default(null),
  target: z.number().positive().max(1e12).nullable().default(null),
  unit: z.string().trim().max(20).default(""),
  habit: z.string().trim().max(140).default(""),
  /** total: reach the target by the end · rate: reach the target every day/week/month (per) by the end. */
  target_type: z.enum(["total", "rate"]).default("total"),
  per: z.enum(["day", "week", "month"]).default("day"),
  /** Rate: where you are now (e.g. 40 a day). Empty = the first day logged. */
  baseline: z.number().min(0).max(1e12).nullable().default(null),
});

/** A rate per week needs at least 2 weeks to grow; per month at least 2 months. */
function perFits(per: "day" | "week" | "month", range: { starts_on: string; ends_on: string }) {
  const days = daysBetween(range.starts_on, range.ends_on) + 1;
  return per === "day" || (per === "week" ? days >= 14 : days >= 56);
}

/** New or changed goal. A new goal from a template gets its chart (with the target) and its daily task. */
export async function saveGoal(input: z.input<typeof goalInput>): Promise<ActionResult<Record<string, unknown>>> {
  return run(async () => {
    const { db, user, today } = await requirePlan();
    const d = goalInput.parse(input);
    let range: { starts_on: string; ends_on: string };
    if (d.period === "custom") {
      if (!d.length_n || !d.length_unit) return { ok: false, message: "Set how long the goal runs.", fieldErrors: { length_n: "Required" } };
      range = lengthRange(d.from || today, d.length_n, d.length_unit);
      if (daysBetween(range.starts_on, range.ends_on) > 3660) return { ok: false, message: "A goal can run for up to 10 years.", fieldErrors: { length_n: "Too long" } };
    } else {
      const period = periodRange(d.period, d.on);
      range = { starts_on: goalStart(period, today, d.from), ends_on: period.ends_on };
    }
    if (d.target_type === "rate" && d.target != null && !perFits(d.per, range)) return { ok: false, message: `This goal is too short for a target per ${d.per}. Use per day${d.per === "month" ? " or per week" : ""}.`, fieldErrors: { per: "Too long for this goal" } };
    const length = d.period === "custom" ? { length_n: d.length_n!, length_unit: d.length_unit! } : { length_n: null, length_unit: null };
    if (d.parent_id) {
      const p = await goalAccess(db, d.parent_id, user.id);
      if (!p || p.role !== "owner") return { ok: false, message: "Pick one of your own goals as the bigger goal." };
    }
    const row = { title: d.title, why: d.why || null, period: d.period, ...range, ...length, category: d.category, parent_id: d.parent_id, updated_at: new Date().toISOString() };
    if (d.id) {
      const a = await goalAccess(db, d.id, user.id);
      if (!a || a.role !== "owner") return { ok: false, message: "Only the goal's owner can change it." };
      const { error } = await db.from("goals").update(row).eq("id", d.id);
      if (error) return { ok: false, message: dbMessage(error) };
      return done("Goal saved", { id: d.id });
    }
    const { data: goal, error } = await db.from("goals").insert({ ...row, owner_id: user.id }).select("id").single();
    if (error || !goal) return { ok: false, message: dbMessage(error) };
    const t = TEMPLATES[d.template];
    const rate = d.target_type === "rate" && d.target != null;
    const unit = d.unit || t.chart?.unit || "";
    const chart = rate
      ? // "Orders per day": each day's count, aiming for the target every day by the end.
        { title: `${t.chart?.title ?? (unit ? unit.charAt(0).toUpperCase() + unit.slice(1) : "Count")} per ${d.per}`, unit, mode: "rate", kind: "bar", grain: d.per, baseline: d.baseline }
      : t.chart
        ? { ...t.chart, unit, grain: grainFor(range) }
        : d.target != null
          ? { title: "Progress", unit, mode: "total", kind: "line", grain: grainFor(range) }
          : null;
    if (chart) await db.from("charts").insert({ goal_id: goal.id, ...chart, target: d.target });
    const task = d.template === "habit" ? d.habit || d.title : t.task;
    if (task) await db.from("tasks").insert({ owner_id: user.id, goal_id: goal.id, title: task, repeat: "daily", starts_on: range.starts_on < today ? today : range.starts_on, ends_on: range.ends_on });
    return done("Goal created", { id: goal.id });
  });
}

export async function setGoalStatus(input: { id: string; status: "active" | "done" | "dropped" }): Promise<ActionResult> {
  return run(async () => {
    const { db, user } = await requirePlan();
    const d = z.object({ id: uuid, status: z.enum(["active", "done", "dropped"]) }).parse(input);
    const a = await goalAccess(db, d.id, user.id);
    if (!a || a.role !== "owner") return { ok: false, message: "Only the goal's owner can change it." };
    const { error } = await db.from("goals").update({ status: d.status, updated_at: new Date().toISOString() }).eq("id", d.id);
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/", "layout");
    return { ok: true, message: d.status === "done" ? "Well done! Goal marked as done." : d.status === "dropped" ? "Goal dropped" : "Goal active again" };
  });
}

export async function deleteGoal(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, user } = await requirePlan();
    const id = uuid.parse(input.id);
    const a = await goalAccess(db, id, user.id);
    if (!a || a.role !== "owner") return { ok: false, message: "Only the goal's owner can delete it." };
    const { error } = await db.from("goals").delete().eq("id", id);
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/", "layout");
    return { ok: true, message: "Goal deleted" };
  });
}

// ---------------------------------------------------------------- charts and values

const chartInput = z.object({
  id: uuid.optional(),
  goal_id: uuid,
  title: z.string().trim().min(1, "Name the chart").max(80),
  unit: z.string().trim().max(20).default(""),
  x_mode: z.enum(["time", "labels"]),
  grain: z.enum(["day", "week", "month"]),
  mode: z.enum(["total", "value", "rate"]),
  kind: z.enum(["line", "bar"]),
  target: z.number().max(1e12).nullable(),
  baseline: z.number().min(0).max(1e12).nullable().default(null),
});

export async function saveChart(input: z.input<typeof chartInput>): Promise<ActionResult> {
  return run(async () => {
    const { db, user } = await requirePlan();
    const { id, ...parsed } = chartInput.parse(input);
    const a = await goalAccess(db, parsed.goal_id, user.id);
    if (!a || a.role !== "owner") return { ok: false, message: "Only the goal's owner can change its charts." };
    // A rate is per day/week/month over time; only a rate has a starting level.
    const d: z.output<typeof chartInput> = parsed.mode === "rate" ? { ...parsed, x_mode: "time" } : { ...parsed, baseline: null };
    if (d.mode === "rate" && !perFits(d.grain, a.goal)) return { ok: false, message: `This goal is too short for a target per ${d.grain}. Use per day${d.grain === "month" ? " or per week" : ""}.`, fieldErrors: { grain: "Too long for this goal" } };
    const { error } = id ? await db.from("charts").update(d).eq("id", id).eq("goal_id", d.goal_id) : await db.from("charts").insert(d);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(id ? "Chart saved" : "Chart added");
  });
}

async function chartAccess(chartId: string) {
  const ctx = await requirePlan();
  const { data: chart } = await ctx.db.from("charts").select("id, goal_id, x_mode").eq("id", chartId).maybeSingle();
  const a = chart ? await goalAccess(ctx.db, chart.goal_id, ctx.user.id) : null;
  return { ...ctx, chart, access: a };
}

export async function deleteChart(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, chart, access } = await chartAccess(uuid.parse(input.id));
    if (!chart || access?.role !== "owner") return { ok: false, message: "Only the goal's owner can delete its charts." };
    const { error } = await db.from("charts").delete().eq("id", chart.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Chart deleted");
  });
}

const pointInput = z.object({
  chart_id: uuid,
  value: z.number().min(-1e12).max(1e12),
  on: day.optional(),
  label: z.string().trim().max(60).default(""),
  note: z.string().trim().max(280).default(""),
});

/** A value on a chart (any time: today, or an earlier day). Owner and editors. */
export async function addPoint(input: z.input<typeof pointInput>): Promise<ActionResult> {
  return run(async () => {
    const d = pointInput.parse(input);
    const { db, user, chart, access, settings, today } = await chartAccess(d.chart_id);
    if (!chart || !access || access.role === "viewer") return { ok: false, message: "You can't add values to this chart." };
    if (chart.x_mode === "labels" && !d.label) return { ok: false, message: "Enter what this value is for (the label).", fieldErrors: { label: "Required" } };
    const on = d.on && d.on <= today ? d.on : today;
    // The chosen day at the current time (in the person's time zone), so the order of entries stays natural.
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: settings.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    const at = on === today ? new Date().toISOString() : zoned(on, time === "24:00" ? "00:00" : time, settings.timezone);
    const { error } = await db.from("points").insert({ chart_id: chart.id, value: d.value, at, label: d.label || null, note: d.note || null, created_by: user.id });
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Added");
  });
}

function zoned(date: string, time: string, tz: string) {
  const guess = new Date(`${date}T${time}:00Z`);
  const local = new Date(guess.toLocaleString("en-US", { timeZone: tz }));
  return new Date(guess.getTime() - (local.getTime() - guess.getTime())).toISOString();
}

export async function deletePoint(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, user } = await requirePlan();
    const id = uuid.parse(input.id);
    const { data: p } = await db.from("points").select("id, chart_id, created_by").eq("id", id).maybeSingle();
    if (!p) return { ok: false, message: "Not found." };
    const { chart, access } = await chartAccess(p.chart_id);
    if (!chart || !access || (access.role !== "owner" && p.created_by !== user.id)) return { ok: false, message: "You can't delete this value." };
    const { error } = await db.from("points").delete().eq("id", id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Deleted");
  });
}

// ---------------------------------------------------------------- tasks (daily goals)

const taskInput = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1, "Write the task").max(140),
  goal_id: uuid.nullable().default(null),
  repeat: z.enum(["none", "daily", "every", "weekdays"]),
  every_n: z.number().int().min(1).max(30).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  starts_on: day,
});

export async function saveTask(input: z.input<typeof taskInput>): Promise<ActionResult> {
  return run(async () => {
    const { db, user } = await requirePlan();
    const { id, ...d } = taskInput.parse(input);
    if (d.repeat === "weekdays" && !d.weekdays.length) return { ok: false, message: "Pick at least one day", fieldErrors: { weekdays: "Pick at least one day" } };
    if (d.goal_id) {
      const a = await goalAccess(db, d.goal_id, user.id);
      if (!a || a.role !== "owner") return { ok: false, message: "Link the task to one of your own goals." };
    }
    const row = { ...d, every_n: d.repeat === "every" ? d.every_n : 1, weekdays: d.repeat === "weekdays" ? [...new Set(d.weekdays)].sort() : [] };
    const { error } = id ? await db.from("tasks").update(row).eq("id", id).eq("owner_id", user.id) : await db.from("tasks").insert({ ...row, owner_id: user.id });
    if (error) return { ok: false, message: dbMessage(error) };
    return done(id ? "Task saved" : "Task added");
  });
}

/** Removes a task (its ticks and streak history stay for the charts of past days). */
export async function archiveTask(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, user } = await requirePlan();
    const { error } = await db.from("tasks").update({ archived: true }).eq("id", uuid.parse(input.id)).eq("owner_id", user.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Task removed");
  });
}

export async function toggleTask(input: { id: string; day: string; done: boolean }): Promise<ActionResult> {
  return run(async () => {
    const { db, user, today } = await requirePlan();
    const d = z.object({ id: uuid, day, done: z.boolean() }).parse(input);
    if (d.day > today) return { ok: false, message: "You can tick a task on its day (or later), not before." };
    const { data: t } = await db.from("tasks").select("id").eq("id", d.id).eq("owner_id", user.id).maybeSingle();
    if (!t) return { ok: false, message: "Task not found." };
    const { error } = d.done
      ? await db.from("completions").upsert({ task_id: d.id, day: d.day }, { onConflict: "task_id,day" })
      : await db.from("completions").delete().eq("task_id", d.id).eq("day", d.day);
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

// ---------------------------------------------------------------- sharing

export async function inviteMember(input: { goal_id: string; email: string; role: "viewer" | "editor" }): Promise<ActionResult> {
  return run(async () => {
    const { db, user } = await requirePlan();
    const d = z.object({ goal_id: uuid, email: z.email("Enter an email address").trim().toLowerCase(), role: z.enum(["viewer", "editor"]) }).parse(input);
    const a = await goalAccess(db, d.goal_id, user.id);
    if (!a || a.role !== "owner") return { ok: false, message: "Only the goal's owner can invite people." };
    if (d.email === user.email) return { ok: false, message: "That's you." };
    const { count } = await db.from("members").select("id", { count: "exact", head: true }).eq("goal_id", d.goal_id);
    if ((count ?? 0) >= 20) return { ok: false, message: "Up to 20 people per goal." };
    const { error } = await db.from("members").insert({ goal_id: d.goal_id, email: d.email, role: d.role, invited_by: user.id });
    if (error) return { ok: false, message: error.code === "23505" ? "Already invited." : dbMessage(error) };
    const who = user.name || user.email;
    await db.rpc("queue_email", {
      p_event: "plan.invite",
      p_recipient: d.email,
      p_user: null,
      p_subject: `${who} shared a goal with you on Retexia Plan`,
      p_body: `${who} invited you to follow their goal "${a.goal.title}" (${periodLabel(a.goal)}) on Retexia Plan${d.role === "editor" ? " and add progress to it" : ""}. You can see its charts and chat about it, with the Retexia AI coach too.\n\nRetexia Plan is free: open it and sign in (or create your Retexia account) with this email.`,
      p_payload: { url: `${planUrl()}/goals/${d.goal_id}`, button: "Open the goal" },
    });
    return done(`Invited ${d.email}`);
  });
}

export async function removeMember(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, user } = await requirePlan();
    const id = uuid.parse(input.id);
    const { data: m } = await db.from("members").select("id, goal_id, user_id").eq("id", id).maybeSingle();
    if (!m) return { ok: false, message: "Not found." };
    const a = await goalAccess(db, m.goal_id, user.id);
    if (!a || (a.role !== "owner" && m.user_id !== user.id)) return { ok: false, message: "You can't remove this person." };
    const { error } = await db.from("members").delete().eq("id", id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(m.user_id === user.id ? "You left the goal" : "Removed");
  });
}

export async function setMemberRole(input: { id: string; role: "viewer" | "editor" }): Promise<ActionResult> {
  return run(async () => {
    const { db, user } = await requirePlan();
    const d = z.object({ id: uuid, role: z.enum(["viewer", "editor"]) }).parse(input);
    const { data: m } = await db.from("members").select("goal_id").eq("id", d.id).maybeSingle();
    const a = m ? await goalAccess(db, m.goal_id, user.id) : null;
    if (!a || a.role !== "owner") return { ok: false, message: "Only the goal's owner can change this." };
    const { error } = await db.from("members").update({ role: d.role }).eq("id", d.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(d.role === "editor" ? "Can now add values" : "Can now only view");
  });
}

// ---------------------------------------------------------------- chat

/** A chat message; with askCoach the Retexia AI coach answers in the chat (a few seconds later). */
export async function sendMessage(input: { goal_id: string; body: string; askCoach: boolean }): Promise<ActionResult<{ message: ChatMessage }>> {
  return run(async () => {
    const { db, user, today, settings } = await requirePlan();
    const d = z.object({ goal_id: uuid, body: z.string().trim().min(1).max(4000), askCoach: z.boolean() }).parse(input);
    const a = await goalAccess(db, d.goal_id, user.id);
    if (!a) return { ok: false, message: "Goal not found." };
    const { data: m, error } = await db.from("messages").insert({ goal_id: d.goal_id, author_id: user.id, kind: "user", body: d.body }).select("id, kind, body, created_at, author_id").single();
    if (error || !m) return { ok: false, message: dbMessage(error) };
    if (d.askCoach) after(() => coachReply(db, a.goal, user.id, today, settings.coach_language).catch((e) => console.error("[plan coach]", e)));
    return { ok: true, data: { message: { ...(m as Omit<ChatMessage, "author">), author: user.name || "You" } } };
  });
}

/** New messages since a time (the chat also listens live; this is the fallback). */
export async function fetchMessages(input: { goal_id: string; after: string }): Promise<ActionResult<{ messages: ChatMessage[] }>> {
  return run(async () => {
    const { db, user } = await requirePlan();
    const d = z.object({ goal_id: uuid, after: z.string().max(40) }).parse(input);
    const a = await goalAccess(db, d.goal_id, user.id);
    if (!a) return { ok: false, message: "Goal not found." };
    const { data } = await db.from("messages").select("id, kind, body, created_at, author_id").eq("goal_id", d.goal_id).gt("created_at", d.after).order("created_at").limit(50);
    const names = await people((data ?? []).map((m) => m.author_id));
    return {
      ok: true,
      data: { messages: (data ?? []).map((m) => ({ ...(m as Omit<ChatMessage, "author">), author: m.kind === "coach" ? "Retexia coach" : (names.get(m.author_id ?? "")?.name ?? "Someone") })) },
    };
  });
}

// ---------------------------------------------------------------- settings

const settingsInput = z.object({
  timezone: z.string().min(3).max(60),
  whatsapp: z.string().trim().max(20),
  morning_on: z.boolean(),
  morning_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
  weekly_on: z.boolean(),
  coach_language: z.enum(["en", "si", "singlish", "ta"]),
});

export async function savePlanSettings(input: z.input<typeof settingsInput>): Promise<ActionResult> {
  return run(async () => {
    const { db, user } = await requirePlan();
    const d = settingsInput.parse(input);
    const whatsapp = d.whatsapp.replace(/[^\d+]/g, "");
    if (whatsapp && !/^\+?\d{9,15}$/.test(whatsapp)) return { ok: false, message: "Enter the WhatsApp number with the country code, e.g. +94771234567", fieldErrors: { whatsapp: "Check the number" } };
    // Same normalising as the n8n worker: 07X…, 7X… and +94 7X… are Sri Lankan mobiles (94 + 7 + 8 digits).
    let n = whatsapp.replace(/\D/g, "");
    if (n.startsWith("00")) n = n.slice(2);
    if (n.startsWith("0")) n = `94${n.slice(1)}`;
    else if (n.length === 9) n = `94${n}`;
    if (whatsapp && n.startsWith("94") && !/^947\d{8}$/.test(n)) return { ok: false, message: "Sri Lankan WhatsApp numbers look like +94 7X XXX XXXX (07X XXX XXXX). Check the number.", fieldErrors: { whatsapp: "Check the number" } };
    if (d.morning_on && !whatsapp) return { ok: false, message: "Add your WhatsApp number for the morning message.", fieldErrors: { whatsapp: "Required" } };
    try {
      new Intl.DateTimeFormat("en", { timeZone: d.timezone });
    } catch {
      return { ok: false, message: "Unknown time zone." };
    }
    const { error } = await db.from("settings").update({ ...d, whatsapp: whatsapp || null, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved" };
  });
}

export async function sendTestWhatsApp(): Promise<ActionResult> {
  return run(async () => {
    const { settings, user } = await requirePlan();
    if (!settings.whatsapp) return { ok: false, message: "Save your WhatsApp number first." };
    const r = await planWorker("whatsapp", { number: settings.whatsapp, text: `👋 Hi${user.name ? ` ${user.name.split(" ")[0]}` : ""}! This is Retexia Plan. Your morning plan will come here.` }, 45_000);
    return r.ok ? { ok: true, message: "Sent. Check WhatsApp." } : { ok: false, message: r.error };
  });
}
