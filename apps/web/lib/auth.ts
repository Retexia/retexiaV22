import "server-only";

import type { Tables } from "@retexia/supabase";
import { createServerClient } from "@retexia/supabase/server";
import { redirect } from "next/navigation";

export type Profile = Tables<"profiles">;

/** Signed-in user (verified with Supabase Auth) or null. */
export async function getUser() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user ?? null };
}

/** Signed-in user and profile, or a redirect to /login?next=<path>. */
export async function requireUser(nextPath: string) {
  const { supabase, user } = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { supabase, user, profile: profile ?? null };
}

export function firstName(profile: Pick<Profile, "full_name"> | null, email?: string | null) {
  const name = profile?.full_name?.trim().split(/\s+/)[0];
  return name || email?.split("@")[0] || "";
}
