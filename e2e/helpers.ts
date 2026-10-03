import { createHash } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { ADMIN_URL, SUPABASE_URL, WEB_URL } from "./env";

export const PASSWORD = "e2e-Password-2026";
/** Known TOTP secret for pre-enrolled staff (base32). */
export const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

export async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/__test/sql`, { method: "POST", body: JSON.stringify({ sql: query, params }) });
  const json = await res.json();
  if (!res.ok) throw new Error(`SQL failed: ${json.error}\n${query}`);
  return json as T[];
}

export async function totp(secret: string) {
  const res = await fetch(`${SUPABASE_URL}/__test/totp`, { method: "POST", body: JSON.stringify({ secret }) });
  return ((await res.json()) as { code: string }).code;
}

const hash = (p: string) => createHash("sha256").update(`salt:${p}`).digest("hex");

/** Create a confirmed login with a role; optionally with a verified authenticator. */
export async function createUser(email: string, role: string, opts: { name?: string; mfa?: boolean } = {}) {
  const [u] = await sql<{ id: string }>(
    `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3) returning id`,
    [email, hash(PASSWORD), JSON.stringify({ full_name: opts.name ?? email.split("@")[0] })],
  );
  await sql(`update public.profiles set role = $1, full_name = $2 where id = $3`, [role, opts.name ?? email.split("@")[0], u!.id]);
  if (opts.mfa) {
    await sql(`insert into auth.mfa_factors (user_id, friendly_name, factor_type, status, secret) values ($1, 'Test phone', 'totp', 'verified', $2)`, [u!.id, TOTP_SECRET]);
  }
  return u!.id;
}

/** Sign in to the admin, including the two-step code when the account has one. */
export async function adminLogin(page: Page, email: string, opts: { secret?: string } = { secret: TOTP_SECRET }) {
  await page.goto(`${ADMIN_URL}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (opts.secret) {
    await page.waitForURL(/\/mfa\/verify/);
    await page.getByLabel("6-digit code").fill(await totp(opts.secret));
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/mfa"));
  }
}

export async function webLogin(page: Page, email: string) {
  await page.goto(`${WEB_URL}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

/** A customer request for Lingo Pro, created like the website does. */
export async function createOrder(userId: string, status = "submitted") {
  const [o] = await sql<{ id: string; ref: string }>(
    `insert into public.orders (user_id, product_id, package_id, billing_cycle, answers)
     select $1, p.id, k.id, 'monthly', '[{"key":"business_name","label":"Business name","value":"Sunrise Bakery","display_value":"Sunrise Bakery","step":"Your business"}]'::jsonb
       from public.products p join public.packages k on k.product_id = p.id and k.slug = 'pro'
      where p.slug = 'lingo'
     returning id, ref`,
    [userId],
  );
  if (status !== "submitted") await sql(`update public.orders set status = $1 where id = $2`, [status, o!.id]);
  return o!;
}
