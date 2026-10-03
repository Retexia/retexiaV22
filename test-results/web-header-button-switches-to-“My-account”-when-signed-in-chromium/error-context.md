# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: web.spec.ts >> header button switches to “My account” when signed in
- Location: e2e/web.spec.ts:53:5

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3100/
Call log:
  - navigating to "http://localhost:3100/", waiting until "load"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e6]:
    - heading "This site can’t be reached" [level=1] [ref=e7]
    - paragraph [ref=e8]:
      - strong [ref=e9]: localhost
      - text: refused to connect.
    - generic [ref=e10]:
      - paragraph [ref=e11]: "Try:"
      - list [ref=e12]:
        - listitem [ref=e13]: Checking the connection
        - listitem [ref=e14]:
          - link "Checking the proxy and the firewall" [ref=e15] [cursor=pointer]:
            - /url: "#buttons"
    - generic [ref=e16]: ERR_CONNECTION_REFUSED
  - generic [ref=e17]:
    - button "Reload" [ref=e19] [cursor=pointer]
    - button "Details" [ref=e20] [cursor=pointer]
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import { WEB_URL } from "./env";
  3  | import { createOrder, createUser, expectToast, sql, webLogin } from "./helpers";
  4  | 
  5  | test.describe("customer order page", () => {
  6  |   test("awaiting payment: instructions, proof upload, then 'being checked'", async ({ page }) => {
  7  |     await sql(`update public.site_settings set payment_instructions = 'Bank: **Test Bank**, account 0001234567' where id = 1`);
  8  |     const email = `payer-${Date.now()}@e2e.test`;
  9  |     const id = await createUser(email, "customer", { name: "Kasun Fernando" });
  10 |     const order = await createOrder(id, "awaiting_payment");
  11 |     await webLogin(page, email);
  12 |     await page.goto(`${WEB_URL}/account/products/${order.ref}`);
  13 |     await expect(page.getByRole("heading", { name: "How to pay" })).toBeVisible();
  14 |     await expect(page.getByText("Test Bank")).toBeVisible();
  15 | 
  16 |     await page.locator('input[type="file"]').setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  17 |     await page.getByRole("button", { name: "Send payment proof" }).click();
  18 |     await expectToast(page, /check your payment/i);
  19 |     await expect(page.getByText("Payment proof received")).toBeVisible();
  20 | 
  21 |     const [p] = await sql<{ status: string; proof_path: string }>(`select status, proof_path from public.payments where order_id = $1`, [order.id]);
  22 |     expect(p!.status).toBe("pending");
  23 |     expect(p!.proof_path.startsWith(`${id}/${order.id}/`)).toBe(true);
  24 |   });
  25 | 
  26 |   test("rejects files that are not images or PDFs", async ({ page }) => {
  27 |     const email = `wrongfile-${Date.now()}@e2e.test`;
  28 |     const id = await createUser(email, "customer");
  29 |     const order = await createOrder(id, "awaiting_payment");
  30 |     await webLogin(page, email);
  31 |     await page.goto(`${WEB_URL}/account/products/${order.ref}`);
  32 |     await page.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  33 |     await page.getByRole("button", { name: "Send payment proof" }).click();
  34 |     await expect(page.getByText(/Upload a photo/)).toBeVisible();
  35 |   });
  36 | 
  37 |   test("confirmed payments show a receipt; visible setup fields are shown", async ({ page }) => {
  38 |     const email = `active-${Date.now()}@e2e.test`;
  39 |     const id = await createUser(email, "customer");
  40 |     const order = await createOrder(id, "setting_up");
  41 |     await sql(`insert into public.payments (order_id, user_id, kind, amount, currency, method, status, paid_at) values ($1, $2, 'setup_fee', 29800, 'LKR', 'bank_transfer', 'confirmed', now())`, [order.id, id]);
  42 |     await sql(`update public.orders set service_data = jsonb_build_object('bot_name', 'Sunny', 'go_live_date', '2026-11-01') where id = $1`, [order.id]);
  43 |     await webLogin(page, email);
  44 |     await page.goto(`${WEB_URL}/account/products/${order.ref}`);
  45 |     await expect(page.getByRole("heading", { name: "Your setup" })).toBeVisible();
  46 |     await expect(page.getByText("Sunny")).toBeVisible();
  47 |     await page.getByRole("link", { name: /Receipt RCT-/ }).click();
  48 |     await expect(page.getByText(order.ref).first()).toBeVisible();
  49 |     await expect(page.getByRole("button", { name: /Print or save as PDF/ })).toBeVisible();
  50 |   });
  51 | });
  52 | 
  53 | test("header button switches to “My account” when signed in", async ({ page }) => {
> 54 |   await page.goto(WEB_URL);
     |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3100/
  55 |   const header = page.locator("header").first();
  56 |   await expect(header.getByRole("link", { name: "My account" })).toHaveCount(0);
  57 |   await webLogin(page, "customer@e2e.test");
  58 |   await page.goto(WEB_URL);
  59 |   await expect(header.getByRole("link", { name: "My account" })).toBeVisible();
  60 | });
  61 | 
  62 | test("only the admin may frame the website", async ({ request }) => {
  63 |   const res = await request.get(WEB_URL);
  64 |   expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'self' http://localhost:3101");
  65 |   expect(res.headers()["x-frame-options"]).toBeUndefined();
  66 | });
  67 | 
```