import "server-only";

import { can, isStaffRole, type Capability, type StaffRole, type Tables } from "@retexia/supabase";
import { createServerClient } from "@retexia/supabase/server";
import { redirect } from "next/navigation";
import { cache } from "react";

export type StaffContext = {
  supabase: Awaited<ReturnType<typeof createServerClient>>;
  user: { id: string; email: string | null };
  profile: Tables<"profiles">;
  role: StaffRole;
};

export class AccessError extends Error {
  constructor(message = "You don't have access to this.") {
    super(message);
    this.name = "AccessError";
  }
}

/** The signed-in staff member, or null (not signed in, or a customer). Cached per request. */
export const getStaff = cache(async (): Promise<StaffContext | null> => {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (!profile || !isStaffRole(profile.role)) return null;
  return { supabase, user: { id: data.user.id, email: data.user.email ?? null }, profile, role: profile.role };
});

/** For pages: staff or redirect to login / the "team only" page. */
export async function requireStaffPage(capability: Capability = "view"): Promise<StaffContext> {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!can(staff.role, capability)) redirect("/no-access");
  return staff;
}

/**
 * For server actions and route handlers: throws AccessError unless the caller
 * is staff with the capability. The database checks again (RLS / RPCs).
 */
export async function requireRole(capability: Capability): Promise<StaffContext> {
  const staff = await getStaff();
  if (!staff) throw new AccessError("Please sign in again.");
  if (!can(staff.role, capability)) throw new AccessError("Your role can't do this.");
  return staff;
}
