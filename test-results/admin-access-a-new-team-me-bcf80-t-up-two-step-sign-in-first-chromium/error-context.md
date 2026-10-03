# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin.spec.ts >> access >> a new team member must set up two-step sign-in first
- Location: e2e/admin.spec.ts:19:7

# Error details

```
TimeoutError: locator.textContent: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('code').first()

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
      - generic [ref=e14]:
        - generic [ref=e15]:
          - generic [ref=e16]:
            - heading "Set up two-step sign-in" [level=1] [ref=e17]
            - generic [ref=e18]: Every team account needs an authenticator app. It keeps customer data safe even if a password leaks.
          - alert [ref=e19]:
            - generic [ref=e20]: A factor with the friendly name "Retexia admin 2026-10-03 10:51" for this user already exists
        - button "Sign out" [ref=e26] [cursor=pointer]
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e32] [cursor=pointer]
  - alert [ref=e36]: Set up two-step sign-in
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { ADMIN_URL } from "./env";
  3   | import { PASSWORD, adminLogin, createOrder, createUser, expectToast, sql, totp } from "./helpers";
  4   | 
  5   | test.describe("access", () => {
  6   |   test("signed-out visitors go to the login page; the admin is never indexed", async ({ page }) => {
  7   |     const res = await page.goto(`${ADMIN_URL}/requests`);
  8   |     await expect(page).toHaveURL(/\/login\?next=%2Frequests/);
  9   |     expect(res?.headers()["x-robots-tag"]).toContain("noindex");
  10  |     expect(res?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  11  |     await expect(page.getByRole("link", { name: /sign up/i })).toHaveCount(0);
  12  |   });
  13  | 
  14  |   test("customers can't use the admin", async ({ page }) => {
  15  |     await adminLogin(page, "customer@e2e.test", { secret: undefined });
  16  |     await expect(page.getByText("This area is for the Retexia team")).toBeVisible();
  17  |   });
  18  | 
  19  |   test("a new team member must set up two-step sign-in first", async ({ page }) => {
  20  |     await adminLogin(page, "support@e2e.test", { secret: undefined });
  21  |     await page.waitForURL(/\/mfa\/setup/);
> 22  |     const secret = (await page.locator("code").first().textContent())!.trim();
      |                                                        ^ TimeoutError: locator.textContent: Timeout 15000ms exceeded.
  23  |     await page.getByLabel("6-digit code").fill(await totp(secret));
  24  |     await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  25  |     await page.waitForURL(`${ADMIN_URL}/`);
  26  |     await expect(page.getByRole("heading", { level: 1 })).toContainText("Sam");
  27  |     // Support can't open settings.
  28  |     await page.goto(`${ADMIN_URL}/settings/general`);
  29  |     await expect(page).toHaveURL(/\/no-access/);
  30  |   });
  31  | 
  32  |   test("editors see website tools but not settings", async ({ page }) => {
  33  |     await adminLogin(page, "editor@e2e.test");
  34  |     const nav = page.getByRole("navigation").first();
  35  |     await expect(nav.getByRole("link", { name: "Pages" })).toBeVisible();
  36  |     await expect(nav.getByRole("link", { name: "General" })).toHaveCount(0);
  37  |   });
  38  | });
  39  | 
  40  | test.describe("requests and payments", () => {
  41  |   test("approve a request, record a payment, get a receipt", async ({ page }) => {
  42  |     const customer = await createUser(`buyer-${Date.now()}@e2e.test`, "customer", { name: "Nimal Silva" });
  43  |     const order = await createOrder(customer);
  44  |     await adminLogin(page, "owner@e2e.test");
  45  | 
  46  |     await page.goto(`${ADMIN_URL}/requests`);
  47  |     await page.getByRole("link", { name: order.ref }).click();
  48  |     await expect(page.getByRole("heading", { level: 1 })).toContainText(order.ref);
  49  | 
  50  |     await page.getByRole("button", { name: "Approve" }).click();
  51  |     await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  52  |     await expectToast(page, "Status updated");
  53  | 
  54  |     await page.getByRole("link", { name: /^Payments/ }).click();
  55  |     await page.getByRole("button", { name: "Record payment" }).first().click();
  56  |     const dialog = page.getByRole("dialog");
  57  |     await dialog.getByLabel("Reference").fill("BANK-123");
  58  |     await dialog.getByRole("button", { name: "Record and confirm" }).click();
  59  |     await expectToast(page, "Payment recorded and confirmed");
  60  |     const year = new Date().getFullYear();
  61  |     await expect(page.getByRole("link", { name: new RegExp(`RCT-${year}-\\d{4}`) }).first()).toBeVisible();
  62  | 
  63  |     // Now setup can start (payment confirmed).
  64  |     await page.getByRole("button", { name: "Start setup" }).click();
  65  |     await page.getByRole("dialog").getByRole("button", { name: "Start setup" }).click();
  66  |     await expectToast(page, "Status updated");
  67  | 
  68  |     const [row] = await sql<{ status: string }>(`select status from public.orders where id = $1`, [order.id]);
  69  |     expect(row!.status).toBe("setting_up");
  70  |   });
  71  | });
  72  | 
  73  | test.describe("products", () => {
  74  |   test("create a product with the wizard; it appears in the menu, hidden", async ({ page }) => {
  75  |     await adminLogin(page, "owner@e2e.test");
  76  |     await page.goto(`${ADMIN_URL}/products/new`);
  77  |     await page.getByLabel("Product name").fill("Retexia Books");
  78  |     await expect(page.getByLabel("Web address")).toHaveValue("books");
  79  |     await expect(page.getByLabel("Request code")).toHaveValue("BOO");
  80  |     await page.getByRole("button", { name: "Continue" }).click();
  81  |     await page.getByRole("button", { name: "Continue" }).click(); // colour
  82  |     await page.getByLabel("Name", { exact: true }).fill("Books Starter");
  83  |     await page.getByLabel(/^Monthly price/).fill("4900");
  84  |     await page.getByRole("button", { name: "Continue" }).click();
  85  |     await page.getByRole("button", { name: "Continue" }).click(); // page and form
  86  |     await page.getByRole("button", { name: "Create product" }).click();
  87  |     await page.waitForURL(`${ADMIN_URL}/products/books`);
  88  |     await expect(page.getByRole("heading", { level: 1 })).toContainText("Retexia Books");
  89  |     await expect(page.getByText("Hidden").first()).toBeVisible();
  90  |     await expect(page.getByRole("navigation").first().getByRole("link", { name: "Books" })).toBeVisible();
  91  | 
  92  |     const [p] = await sql<{ n: number; f: string | null }>(
  93  |       `select (select count(*)::int from public.packages k where k.product_id = p.id) n, p.onboarding_form_id::text f from public.products p where slug = 'books'`,
  94  |     );
  95  |     expect(p!.n).toBe(1);
  96  |     expect(p!.f).not.toBeNull();
  97  |   });
  98  | 
  99  |   test("add a service field and an n8n action", async ({ page }) => {
  100 |     await adminLogin(page, "owner@e2e.test");
  101 |     await page.goto(`${ADMIN_URL}/products/lingo?tab=service-fields`);
  102 |     await page.getByRole("button", { name: "Add field" }).click();
  103 |     await page.getByLabel("Label").fill("Support group link");
  104 |     await expect(page.getByLabel("Key")).toHaveValue("support_group_link");
  105 |     await page.getByRole("button", { name: "Save field" }).click();
  106 |     await expectToast(page, "Service field saved");
  107 | 
  108 |     await page.goto(`${ADMIN_URL}/products/lingo?tab=actions`);
  109 |     await page.getByRole("button", { name: "Add action" }).click();
  110 |     await page.getByLabel("Button label").fill("Send welcome message");
  111 |     await page.getByLabel("n8n webhook URL").fill("https://n8n.example.com/webhook/welcome");
  112 |     await page.getByRole("button", { name: "Generate" }).click();
  113 |     await expect(page.getByText(/Copy this secret now/)).toBeVisible();
  114 |     await page.getByRole("button", { name: "Save action" }).click();
  115 |     await expectToast(page, "Action saved");
  116 |     await expect(page.getByText("n8n.example.com").first()).toBeVisible();
  117 | 
  118 |     // The secret never comes back to the browser.
  119 |     const html = await page.content();
  120 |     expect(html).not.toMatch(/whsec_[0-9a-f]{48}/);
  121 |   });
  122 | });
```