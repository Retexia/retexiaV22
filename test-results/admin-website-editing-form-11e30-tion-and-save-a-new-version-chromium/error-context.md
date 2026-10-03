# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin.spec.ts >> website editing >> form builder: add a question and save a new version
- Location: e2e/admin.spec.ts:125:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-sonner-toast]').filter({ hasText: 'Saved as version 2' }).first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('[data-sonner-toast]').filter({ hasText: 'Saved as version 2' }).first() with timeout 15000ms
  - waiting for locator('[data-sonner-toast]').filter({ hasText: 'Saved as version 2' }).first()

```

```yaml
- link "Skip to content":
  - /url: "#main"
- complementary:
  - text: Retexia Admin
  - button "Collapse sidebar"
  - navigation "Admin":
    - link "Dashboard":
      - /url: /
    - link "Requests 1 waiting":
      - /url: /requests
    - link "Customers":
      - /url: /customers
    - link "Payments":
      - /url: /payments
    - link "Inbox":
      - /url: /inbox
    - paragraph: Products
    - link "Lingo":
      - /url: /products/lingo
    - link "Post":
      - /url: /products/post
    - link "Books":
      - /url: /products/books
    - link "All products":
      - /url: /products
    - link "Onboarding forms":
      - /url: /forms
    - link "New product":
      - /url: /products/new
    - paragraph: Website
    - link "Pages":
      - /url: /website/pages
    - link "Navigation":
      - /url: /website/navigation
    - link "Services":
      - /url: /website/services
    - link "FAQs":
      - /url: /website/faqs
    - link "Testimonials":
      - /url: /website/testimonials
    - link "Media":
      - /url: /website/media
    - link "Text and labels":
      - /url: /website/strings
    - paragraph: Settings
    - link "General":
      - /url: /settings/general
    - link "Theme":
      - /url: /settings/theme
    - link "Payments and invoices":
      - /url: /settings/payments
    - link "Order statuses":
      - /url: /settings/statuses
    - link "Notifications":
      - /url: /settings/notifications
    - link "Integrations":
      - /url: /settings/integrations
    - link "Team":
      - /url: /settings/team
    - link "Audit log":
      - /url: /settings/audit
- banner:
  - button "Search requests, customers… ⌘ K"
  - link "View website":
    - /url: http://localhost:3100
  - button "Notifications"
  - button "System theme. Switch theme"
  - button "Your account"
- main:
  - link "Retexia Lingo":
    - /url: /products/lingo?tab=form
  - heading "Set up your Lingo" [level=1]
  - text: Steps and questions customers answer after choosing a package. Drag questions between steps; preview before saving.
  - status: Used by Retexia Lingo. Saving changes the form on the website straight away; existing requests keep their answers.
  - tablist "Form builder":
    - tab "Questions" [selected]
    - tab "Preview"
    - tab "Texts"
  - text: Unsaved changes
  - button "Discard"
  - button "Save form"
  - list:
    - listitem:
      - text: "1"
      - textbox "Step 1 title": About your business
      - textbox "Step 1 description":
        - /placeholder: Short description (optional)
        - text: The basics, so we know who Lingo is talking for.
      - button "Move step up" [disabled]
      - button "Move step down"
      - button "Hide step"
      - button "Delete step"
      - list:
        - listitem:
          - button "Drag Business name"
          - button "Business name * business_name · Short text"
        - listitem:
          - button "Drag What does your business do?"
          - button "What does your business do? * business_type · Choice cards"
        - listitem:
          - button "Drag Industry"
          - button "Industry * industry · Dropdown"
          - text: ½
        - listitem:
          - button "Drag Your industry"
          - button "Your industry * industry_other · Short text"
          - text: Conditional ½
        - listitem:
          - button "Drag City"
          - button "City * city · Short text"
          - text: ½
        - listitem:
          - button "Drag Website or social page"
          - button "Website or social page online_link · Website link"
          - text: ½
        - listitem:
          - button "Drag How did you hear about us?"
          - button "How did you hear about us? how_did_you_hear_about_us · Short text" [pressed]
      - button "Add question"
    - listitem:
      - text: "2"
      - textbox "Step 2 title": What Lingo will talk about
      - textbox "Step 2 description":
        - /placeholder: Short description (optional)
        - text: What you sell and what customers usually ask.
      - button "Move step up"
      - button "Move step down"
      - button "Hide step"
      - button "Delete step"
      - list:
        - listitem:
          - button "Drag What do you sell?"
          - button "What do you sell? * products_description · Long text"
          - text: Conditional
        - listitem:
          - button "Drag How many products?"
          - button "How many products? * product_count · Dropdown"
          - text: Conditional ½
        - listitem:
          - button "Drag Where is your product list today?"
          - button "Where is your product list today? product_info_location · Dropdown"
          - text: Conditional ½
        - listitem:
          - button "Drag Delivery"
          - button "Delivery delivery · Single choice"
          - text: Conditional
        - listitem:
          - button "Drag What services do you offer?"
          - button "What services do you offer? * services_description · Long text"
          - text: Conditional
        - listitem:
          - button "Drag How many services?"
          - button "How many services? * service_count · Dropdown"
          - text: Conditional ½
        - listitem:
          - button "Drag Do customers book appointments?"
          - button "Do customers book appointments? takes_bookings · Yes / no switch"
          - text: Conditional ½
        - listitem:
          - button "Drag Which languages do your customers write in?"
          - button "Which languages do your customers write in? * languages · Multiple choice"
        - listitem:
          - button "Drag How many messages do you get a day?"
          - button "How many messages do you get a day? * daily_messages · Dropdown"
          - text: ½
        - listitem:
          - button "Drag What do customers ask most?"
          - button "What do customers ask most? * top_questions · Long text"
      - button "Add question"
    - listitem:
      - text: "3"
      - textbox "Step 3 title": WhatsApp and contact
      - textbox "Step 3 description":
        - /placeholder: Short description (optional)
        - text: Your number, and how we reach you during setup.
      - button "Move step up"
      - button "Move step down" [disabled]
      - button "Hide step"
      - button "Delete step"
      - list:
        - listitem:
          - button "Drag WhatsApp number"
          - button "WhatsApp number * whatsapp_number · Phone"
          - text: ½
        - listitem:
          - button "Drag Which WhatsApp is it on?"
          - button "Which WhatsApp is it on? * whatsapp_type · Choice cards"
        - listitem:
          - button "Drag When should Lingo hand the chat to you?"
          - button "When should Lingo hand the chat to you? * handover · Dropdown"
        - listitem:
          - button "Drag Your name"
          - button "Your name * contact_name · Short text"
          - text: ½
        - listitem:
          - button "Drag Your phone number"
          - button "Your phone number * contact_phone · Phone"
          - text: ½
        - listitem:
          - button "Drag Best time to reach you"
          - button "Best time to reach you best_time · Dropdown"
          - text: ½
        - listitem:
          - button "Drag Anything else we should know?"
          - button "Anything else we should know? notes · Long text"
        - listitem:
          - button "Drag I agree to the [Terms](/terms) and [Privacy policy](/privacy)"
          - button "I agree to the [Terms](/terms) and [Privacy policy](/privacy) * agree · Tick box (agree)"
      - button "Add question"
    - listitem:
      - button "Add step"
  - status
  - heading "Question" [level=2]
  - button "Delete"
  - text: Question
  - textbox "Question":
    - /placeholder: What is your business called?
    - text: How did you hear about us?
  - text: Answer type(Optional)
  - combobox "Answer type(Optional)":
    - option "Choose one"
    - option "Short text" [selected]
    - option "Long text"
    - option "Email"
    - option "Phone"
    - option "Number"
    - option "Website link"
    - option "Dropdown"
    - option "Single choice"
    - option "Choice cards"
    - option "Multiple choice"
    - option "Tick box (agree)"
    - option "Yes / no switch"
  - text: Key (Optional)
  - paragraph: How the answer is stored and sent to n8n.
  - textbox "Key (Optional)": how_did_you_hear_about_us
  - text: Help text(Optional)
  - paragraph: Shown under the question. **bold** and [links](https://…) work.
  - textbox "Help text(Optional)"
  - text: Placeholder(Optional)
  - textbox "Placeholder(Optional)"
  - text: Width(Optional)
  - combobox "Width(Optional)":
    - option "Choose one"
    - option "Full width" [selected]
    - option "Half (two side by side)"
  - text: Fewest characters(Optional)
  - spinbutton "Fewest characters(Optional)"
  - text: Most characters(Optional)
  - spinbutton "Most characters(Optional)"
  - text: Starting value(Optional)
  - textbox "Starting value(Optional)"
  - text: Fill in from their account(Optional)
  - combobox "Fill in from their account(Optional)":
    - option "Don't prefill" [selected]
    - option "Their name"
    - option "Their phone"
    - option "Their WhatsApp"
    - option "Their business name"
    - option "Their email"
  - text: Step(Optional)
  - combobox "Step(Optional)":
    - option "Choose one"
    - option "1. About your business" [selected]
    - option "2. What Lingo will talk about"
    - option "3. WhatsApp and contact"
  - group "Conditional":
    - text: Conditional
    - checkbox "Only show this question depending on an earlier answer"
    - text: Only show this question depending on an earlier answer
  - switch "Required"
  - text: Required
  - switch "Shown on the form" [checked]
  - text: Shown on the form
- region "Notifications alt+T"
- alert
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
  43 |     await page.waitForURL(/\/mfa\/verify/);
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
> 59 |   await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
     |                                                                                       ^ Error: expect(locator).toBeVisible() failed
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