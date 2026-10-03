/**
 * Public Supabase settings. Referenced with literal `process.env.NEXT_PUBLIC_*`
 * so Next.js inlines them into browser bundles.
 */
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url: url ?? "", anonKey: anonKey ?? "", configured: Boolean(url && anonKey) };
}

export function requireSupabaseEnv() {
  const env = supabaseEnv();
  if (!env.configured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
  }
  return env;
}
