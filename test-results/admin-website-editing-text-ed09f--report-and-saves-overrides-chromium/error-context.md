# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin.spec.ts >> website editing >> text and labels shows the missing-keys report and saves overrides
- Location: e2e/admin.spec.ts:151:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]: Retexia
        - generic [ref=e7]: Admin
      - button "System theme. Switch theme" [ref=e8] [cursor=pointer]
    - main [ref=e12]:
      - generic [ref=e15]:
        - generic [ref=e16]:
          - heading "Team sign in" [level=1] [ref=e17]
          - generic [ref=e18]: For the Retexia team. Customers sign in on retexia.com.
        - generic [ref=e19]:
          - alert [ref=e20]:
            - generic [ref=e21]: Too many attempts. Please wait a few minutes.
          - generic [ref=e26]:
            - generic [ref=e27]: Email
            - textbox "Email" [ref=e28]: editor@e2e.test
          - generic [ref=e29]:
            - generic [ref=e30]: Password
            - textbox "Password" [ref=e31]: e2e-Password-2026
          - link "Forgot your password?" [ref=e32] [cursor=pointer]:
            - /url: /forgot-password
          - button "Sign in" [ref=e33] [cursor=pointer]
          - button "Email me a sign-in link instead" [ref=e34] [cursor=pointer]
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e40] [cursor=pointer]
  - alert [ref=e44]
```

# Test source

```ts
  1  | import { createHash } from "node:crypto";
  2  | import { expect, type Page } from "@playwright/test";
  3  | import { ADMIN_URL, SUPABASE_URL, WEB_URL } from "./env";
  4  | 
  5  | export const PASSWORD = "e2e-Password-2026";
  6  | /** Known TOTP secret for pre-enrolled staff (base32). */
  7  | export const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  8  | 
  9  | export async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  10 |   const res = await fetch(`${SUPABASE_URL}/__test/sql`, { method: "POST", body: JSON.stringify({ sql: query, params }) });
  11 |   const json = await res.json();
  12 |   if (!res.ok) throw new Error(`SQL failed: ${json.error}\n${query}`);
  13 |   return json as T[];
  14 | }
  15 | 
  16 | export async function totp(secret: string) {
  17 |   const res = await fetch(`${SUPABASE_URL}/__test/totp`, { method: "POST", body: JSON.stringify({ secret }) });
  18 |   return ((await res.json()) as { code: string }).code;
  19 | }
  20 | 
  21 | const hash = (p: string) => createHash("sha256").update(`salt:${p}`).digest("hex");
  22 | 
  23 | /** Create a confirmed login with a role; optionally with a verified authenticator. */
  24 | export async function createUser(email: string, role: string, opts: { name?: string; mfa?: boolean } = {}) {
  25 |   const [u] = await sql<{ id: string }>(
  26 |     `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3) returning id`,
  27 |     [email, hash(PASSWORD), JSON.stringify({ full_name: opts.name ?? email.split("@")[0] })],
  28 |   );
  29 |   await sql(`update public.profiles set role = $1, full_name = $2 where id = $3`, [role, opts.name ?? email.split("@")[0], u!.id]);
  30 |   if (opts.mfa) {
  31 |     await sql(`insert into auth.mfa_factors (user_id, friendly_name, factor_type, status, secret) values ($1, 'Test phone', 'totp', 'verified', $2)`, [u!.id, TOTP_SECRET]);
  32 |   }
  33 |   return u!.id;
  34 | }
  35 | 
  36 | /** Sign in to the admin, including the two-step code when the account has one. */
  37 | export async function adminLogin(page: Page, email: string, opts: { secret?: string } = { secret: TOTP_SECRET }) {
  38 |   await page.goto(`${ADMIN_URL}/login`);
  39 |   await page.getByLabel("Email").fill(email);
  40 |   await page.getByLabel("Password").fill(PASSWORD);
  41 |   await page.getByRole("button", { name: "Sign in" }).click();
  42 |   if (opts.secret) {
> 43 |     await page.waitForURL(/\/mfa\/verify/);
     |                ^ TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
  44 |     await page.getByLabel("6-digit code").fill(await totp(opts.secret));
  45 |     await page.getByRole("button", { name: "Continue" }).click();
  46 |     await page.waitForURL((u) => !u.pathname.startsWith("/mfa"));
  47 |   }
  48 | }
  49 | 
  50 | export async function webLogin(page: Page, email: string) {
  51 |   await page.goto(`${WEB_URL}/login`);
  52 |   await page.getByLabel("Email").fill(email);
  53 |   await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  54 |   await page.getByRole("button", { name: "Sign in" }).click();
  55 |   await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  56 | }
  57 | 
  58 | export async function expectToast(page: Page, text: string | RegExp) {
  59 |   await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
  60 | }
  61 | 
  62 | /** A customer request for Lingo Pro, created like the website does. */
  63 | export async function createOrder(userId: string, status = "submitted") {
  64 |   const [o] = await sql<{ id: string; ref: string }>(
  65 |     `insert into public.orders (user_id, product_id, package_id, billing_cycle, answers)
  66 |      select $1, p.id, k.id, 'monthly', '[{"key":"business_name","label":"Business name","value":"Sunrise Bakery","display_value":"Sunrise Bakery","step":"Your business"}]'::jsonb
  67 |        from public.products p join public.packages k on k.product_id = p.id and k.slug = 'pro'
  68 |       where p.slug = 'lingo'
  69 |      returning id, ref`,
  70 |     [userId],
  71 |   );
  72 |   if (status !== "submitted") await sql(`update public.orders set status = $1 where id = $2`, [status, o!.id]);
  73 |   return o!;
  74 | }
  75 | 
```