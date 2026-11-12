import "server-only";

import { createServerClient } from "@retexia/supabase/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { AccessError } from "../action";
import { localDate } from "../time";
import { planDb, publicDb, type PlanDb } from "./db";
import type { Goal, Role } from "./logic";

export type PlanSettings = {
  timezone: string;
  whatsapp: string | null;
  morning_on: boolean;
  morning_time: string;
  weekly_on: boolean;
  coach_language: "en" | "si" | "singlish" | "ta";
  /** Set when Plan can't use its database (schema not exposed, migration not run). */
  setupError?: string;
};

function setupMessage(error: { code?: string; message?: string }) {
  if (error.code === "PGRST106") return 'Retexia Plan can\'t reach its database yet: add "plan" to Supabase → Project Settings → Data API → Exposed schemas.';
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "3F000") return "Retexia Plan's database isn't set up yet: run the migration 0030_plan.sql in Supabase.";
  return `Retexia Plan can't reach its database right now (${error.message ?? "unknown error"}). Please try again in a minute.`;
}
export type PlanUser = { id: string; email: string; name: string };

/** Retexia Plan is free: any signed-in Retexia account can use it (no order). */
export const getPlanUser = cache(async (): Promise<PlanUser | null> => {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", data.user.id).maybeSingle();
  return { id: data.user.id, email: (profile?.email ?? data.user.email ?? "").toLowerCase(), name: profile?.full_name ?? "" };
});

/** The person's Plan settings (made on first visit, WhatsApp from their Retexia profile) and invites waiting for them. */
const prepare = cache(async (user: PlanUser): Promise<PlanSettings> => {
  const db = planDb();
  const { data, error } = await db.from("settings").select("timezone, whatsapp, morning_on, morning_time, weekly_on, coach_language").eq("user_id", user.id).maybeSingle();
  if (error) {
    console.error("[plan] database", error);
    return { timezone: "Asia/Colombo", whatsapp: null, morning_on: false, morning_time: "07:00", weekly_on: false, coach_language: "en", setupError: setupMessage(error) };
  }
  if (user.email) await db.from("members").update({ user_id: user.id }).is("user_id", null).eq("email", user.email);
  if (data) return { ...data, morning_time: String(data.morning_time).slice(0, 5) } as PlanSettings;
  const { data: profile } = await publicDb().from("profiles").select("whatsapp, phone").eq("id", user.id).maybeSingle();
  const raw = String(profile?.whatsapp || profile?.phone || "").replace(/[^\d+]/g, "");
  const whatsapp = /^\+?\d{9,15}$/.test(raw) ? raw : null;
  await db.from("settings").insert({ user_id: user.id, whatsapp });
  return { timezone: "Asia/Colombo", whatsapp, morning_on: false, morning_time: "07:00", weekly_on: true, coach_language: "en" };
});

export type PlanContext = { user: PlanUser; settings: PlanSettings; db: PlanDb; today: string };

/** For pages: signed in (else the sign-in hand-off from retexia.com). */
export async function requirePlanPage(path = "/"): Promise<PlanContext> {
  const user = await getPlanUser();
  if (!user) redirect(`/auth/start?next=${encodeURIComponent(path)}`);
  const settings = await prepare(user);
  return { user, settings, db: planDb(), today: localDate(settings.timezone) };
}

/** For server actions. */
export async function requirePlan(): Promise<PlanContext> {
  const user = await getPlanUser();
  if (!user) throw new AccessError("Please sign in again.");
  const settings = await prepare(user);
  if (settings.setupError) throw new AccessError(settings.setupError);
  return { user, settings, db: planDb(), today: localDate(settings.timezone) };
}

/** A goal and the person's role in it (owner / editor / viewer), or null when they may not see it. */
export async function goalAccess(db: PlanDb, goalId: string, userId: string): Promise<{ goal: Goal; role: Role } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(goalId)) return null;
  const { data: goal } = await db.from("goals").select("*").eq("id", goalId).maybeSingle();
  if (!goal) return null;
  if (goal.owner_id === userId) return { goal: goal as Goal, role: "owner" };
  const { data: m } = await db.from("members").select("role").eq("goal_id", goalId).eq("user_id", userId).maybeSingle();
  return m ? { goal: goal as Goal, role: m.role as Role } : null;
}
