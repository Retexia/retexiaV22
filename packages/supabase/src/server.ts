import "server-only";

import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cookieOptions } from "./cookies";
import type { Database } from "./database.types";
import { requireSupabaseEnv } from "./env";

/**
 * Auth-aware Supabase client for Server Components, Server Actions and Route
 * Handlers. Reads the session from cookies; RLS filters every query by user.
 */
export async function createServerClient(): Promise<SupabaseClient<Database>> {
  // Read cookies first: during prerendering this is where the route becomes dynamic.
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseEnv();

  return createSsrServerClient<Database>(url, anonKey, {
    cookieOptions: cookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session on every request, so this is safe.
        }
      },
    },
  });
}
