import { createHmac } from "node:crypto";

// Must match scripts/e2e/mock-supabase.mjs (test-only secret, never used elsewhere).
const SECRET = "e2e-only-jwt-secret-e2e-only-jwt-secret";
const b64u = (s: string) => Buffer.from(s).toString("base64url");
function sign(payload: object) {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
}

export const SUPABASE_URL = "http://localhost:54321";
export const ANON_KEY = sign({ role: "anon", iss: "supabase-e2e", iat: 1700000000, exp: 2000000000 });
export const SERVICE_KEY = sign({ role: "service_role", iss: "supabase-e2e", iat: 1700000000, exp: 2000000000 });
export const WEB_URL = "http://localhost:3100";
export const ADMIN_URL = "http://localhost:3101";

export const appEnv = {
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_SITE_URL: WEB_URL,
  NEXT_PUBLIC_WEB_URL: WEB_URL,
  NEXT_PUBLIC_ADMIN_URL: ADMIN_URL,
  NEXT_PUBLIC_COOKIE_DOMAIN: "",
  REVALIDATE_SECRET: "e2e-revalidate-secret",
};
