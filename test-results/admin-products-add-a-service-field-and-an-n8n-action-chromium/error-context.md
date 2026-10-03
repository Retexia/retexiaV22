# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin.spec.ts >> products >> add a service field and an n8n action
- Location: e2e/admin.spec.ts:99:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('n8n.example.com').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('n8n.example.com').first() with timeout 15000ms
  - waiting for getByText('n8n.example.com').first()

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
  - link "Products":
    - /url: /products
  - text: Live LNG
  - heading "Retexia Lingo" [level=1]
  - text: Your WhatsApp answers customers in seconds
  - link "View on website":
    - /url: http://localhost:3100/lingo
  - link "New request":
    - /url: /requests/new?product=0db17914-6172-48c0-9abc-5f300652c913
  - navigation "Product sections":
    - link "Overview":
      - /url: /products/lingo
    - link "Requests 1":
      - /url: /requests?product=lingo
    - link "Details":
      - /url: /products/lingo?tab=details
    - link "Packages 3":
      - /url: /products/lingo?tab=packages
    - link "Page":
      - /url: /products/lingo?tab=page
    - link "Onboarding form":
      - /url: /products/lingo?tab=form
    - link "Service fields":
      - /url: /products/lingo?tab=service-fields
    - link "Actions":
      - /url: /products/lingo?tab=actions
    - link "Waitlist 0":
      - /url: /products/lingo?tab=waitlist
    - link "FAQs":
      - /url: /products/lingo?tab=faqs
  - paragraph:
    - text: Each action posts a signed JSON request to an n8n webhook. Requests carry
    - code: X-Retexia-Timestamp
    - text: and
    - code: X-Retexia-Signature
    - text: (HMAC-SHA256 of
    - code: timestamp.body
    - text: ). n8n can answer directly or call back
    - code: http://localhost:3101/api/n8n/callback
    - text: .
  - button "Add action"
  - list:
    - listitem:
      - button "Drag to reorder Start setup in n8n"
      - text: Start setup in n8n action.start_setup Off No webhook When Setting up · support, admin, owner
      - button "Send test" [disabled]
      - button "Edit"
      - button "Delete Start setup in n8n"
  - status
  - heading "Recent runs" [level=2]
  - paragraph: No runs yet.
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  16  |     await expect(page.getByText("This area is for the Retexia team")).toBeVisible();
  17  |   });
  18  | 
  19  |   test("a new team member must set up two-step sign-in first", async ({ page }) => {
  20  |     await adminLogin(page, "support@e2e.test", { secret: undefined });
  21  |     await page.waitForURL(/\/mfa\/setup/);
  22  |     const secret = (await page.locator("code").first().textContent())!.trim();
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
> 116 |     await expect(page.getByText("n8n.example.com").first()).toBeVisible();
      |                                                             ^ Error: expect(locator).toBeVisible() failed
  117 | 
  118 |     // The secret never comes back to the browser.
  119 |     const html = await page.content();
  120 |     expect(html).not.toMatch(/whsec_[0-9a-f]{48}/);
  121 |   });
  122 | });
  123 | 
  124 | test.describe("website editing", () => {
  125 |   test("form builder: add a question and save a new version", async ({ page }) => {
  126 |     await adminLogin(page, "owner@e2e.test");
  127 |     const [f] = await sql<{ id: string; version: number }>(`select f.id, f.version from public.forms f join public.products p on p.onboarding_form_id = f.id where p.slug = 'lingo'`);
  128 |     await page.goto(`${ADMIN_URL}/forms/${f!.id}`);
  129 |     await page.getByRole("button", { name: "Add question" }).first().click();
  130 |     await page.getByLabel("Question", { exact: true }).fill("How did you hear about us?");
  131 |     await page.getByRole("button", { name: "Save form" }).click();
  132 |     await expectToast(page, `Saved as version ${f!.version + 1}`);
  133 |     await page.getByRole("tab", { name: "Preview" }).click();
  134 |     await expect(page.getByText(/Preview with your unsaved changes/)).toBeVisible();
  135 |   });
  136 | 
  137 |   test("edit a section on the home page", async ({ page }) => {
  138 |     await adminLogin(page, "editor@e2e.test");
  139 |     const [home] = await sql<{ id: string }>(`select id from public.pages where slug = ''`);
  140 |     await page.goto(`${ADMIN_URL}/website/pages/${home!.id}`);
  141 |     await page.getByRole("button", { name: /Hero/ }).first().click();
  142 |     const title = page.getByLabel("Title", { exact: true });
  143 |     await title.fill("Your business, answered in seconds");
  144 |     await page.getByLabel("Highlighted words").fill("in seconds");
  145 |     await page.getByRole("button", { name: "Save section" }).click();
  146 |     await expectToast(page, /Section saved/);
  147 |     const [s] = await sql<{ title: string }>(`select title from public.page_sections where page_id = $1 and type = 'hero'`, [home!.id]);
  148 |     expect(s!.title).toBe("Your business, answered in seconds");
  149 |   });
  150 | 
  151 |   test("text and labels shows the missing-keys report and saves overrides", async ({ page }) => {
  152 |     await sql(`delete from public.site_strings where key = 'nav.skip'`);
  153 |     await adminLogin(page, "editor@e2e.test");
  154 |     await page.goto(`${ADMIN_URL}/website/strings`);
  155 |     await expect(page.getByText("Missing keys report")).toBeVisible();
  156 |     await page.getByRole("button", { name: /Not in database/ }).click();
  157 |     const field = page.getByLabel("Text for nav.skip");
  158 |     await field.fill("Skip to the main content");
  159 |     await field.locator("xpath=..").getByRole("button", { name: "Save" }).click();
  160 |     await expectToast(page, /Text saved/);
  161 |     const [row] = await sql<{ value: string }>(`select value from public.site_strings where key = 'nav.skip'`);
  162 |     expect(row!.value).toBe("Skip to the main content");
  163 |   });
  164 | });
  165 | 
  166 | test.describe("settings", () => {
  167 |   test("team: owners see two-step status and roles", async ({ page }) => {
  168 |     await adminLogin(page, "owner@e2e.test");
  169 |     await page.goto(`${ADMIN_URL}/settings/team`);
  170 |     await expect(page.getByText("Olivia Owner")).toBeVisible();
  171 |     await expect(page.getByLabel("Role of Eddie Editor")).toHaveValue("editor");
  172 |   });
  173 | 
  174 |   test("audit log records changes", async ({ page }) => {
  175 |     await adminLogin(page, "owner@e2e.test");
  176 |     await page.goto(`${ADMIN_URL}/settings/audit?table=products`);
  177 |     await expect(page.getByText(/products/).first()).toBeVisible();
  178 |   });
  179 | 
  180 |   test("password change keeps working sign-in", async ({ page }) => {
  181 |     await adminLogin(page, "admin@e2e.test");
  182 |     await page.goto(`${ADMIN_URL}/account`);
  183 |     await page.getByLabel("New password").fill(`${PASSWORD}-2`);
  184 |     await page.getByLabel("Repeat it").fill(`${PASSWORD}-2`);
  185 |     await page.getByRole("button", { name: "Change password" }).click();
  186 |     await expectToast(page, "Password changed");
  187 |   });
  188 | });
  189 | 
```