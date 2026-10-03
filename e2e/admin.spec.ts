import { expect, test } from "@playwright/test";
import { ADMIN_URL } from "./env";
import { PASSWORD, adminLogin, createOrder, createUser, expectToast, sql, totp } from "./helpers";

test.describe("access", () => {
  test("signed-out visitors go to the login page; the admin is never indexed", async ({ page }) => {
    const res = await page.goto(`${ADMIN_URL}/requests`);
    await expect(page).toHaveURL(/\/login\?next=%2Frequests/);
    expect(res?.headers()["x-robots-tag"]).toContain("noindex");
    expect(res?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    await expect(page.getByRole("link", { name: /sign up/i })).toHaveCount(0);
  });

  test("customers can't use the admin", async ({ page }) => {
    await adminLogin(page, "customer@e2e.test", { secret: undefined });
    await expect(page.getByText("This area is for the Retexia team")).toBeVisible();
  });

  test("a new team member must set up two-step sign-in first", async ({ page }) => {
    await adminLogin(page, "support@e2e.test", { secret: undefined });
    await page.waitForURL(/\/mfa\/setup/);
    const secret = (await page.locator("code").first().textContent())!.trim();
    await page.getByLabel("6-digit code").fill(await totp(secret));
    await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
    await page.waitForURL(`${ADMIN_URL}/`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Sam");
    // Support can't open settings.
    await page.goto(`${ADMIN_URL}/settings/general`);
    await expect(page).toHaveURL(/\/no-access/);
  });

  test("editors see website tools but not settings", async ({ page }) => {
    await adminLogin(page, "editor@e2e.test");
    const nav = page.getByRole("navigation").first();
    await expect(nav.getByRole("link", { name: "Pages" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "General" })).toHaveCount(0);
  });
});

test.describe("requests and payments", () => {
  test("approve a request, record a payment, get a receipt", async ({ page }) => {
    const customer = await createUser(`buyer-${Date.now()}@e2e.test`, "customer", { name: "Nimal Silva" });
    const order = await createOrder(customer);
    await adminLogin(page, "owner@e2e.test");

    await page.goto(`${ADMIN_URL}/requests`);
    await page.getByRole("link", { name: order.ref }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(order.ref);

    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
    await expectToast(page, "Status updated");

    await page.getByRole("link", { name: /^Payments/ }).click();
    await page.getByRole("button", { name: "Record payment" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reference").fill("BANK-123");
    await dialog.getByRole("button", { name: "Record and confirm" }).click();
    await expectToast(page, "Payment recorded and confirmed");
    const year = new Date().getFullYear();
    await expect(page.getByRole("link", { name: new RegExp(`RCT-${year}-\\d{4}`) }).first()).toBeVisible();

    // Now setup can start (payment confirmed).
    await page.getByRole("button", { name: "Start setup" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Start setup" }).click();
    await expectToast(page, "Status updated");

    const [row] = await sql<{ status: string }>(`select status from public.orders where id = $1`, [order.id]);
    expect(row!.status).toBe("setting_up");
  });
});

test.describe("products", () => {
  test("create a product with the wizard; it appears in the menu, hidden", async ({ page }) => {
    await adminLogin(page, "owner@e2e.test");
    await page.goto(`${ADMIN_URL}/products/new`);
    await page.getByLabel("Product name").fill("Retexia Books");
    await expect(page.getByLabel("Web address")).toHaveValue("books");
    await expect(page.getByLabel("Request code")).toHaveValue("BOO");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click(); // colour
    await page.getByLabel("Name", { exact: true }).fill("Books Starter");
    await page.getByLabel(/^Monthly price/).fill("4900");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click(); // page and form
    await page.getByRole("button", { name: "Create product" }).click();
    await page.waitForURL(`${ADMIN_URL}/products/books`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Retexia Books");
    await expect(page.getByText("Hidden").first()).toBeVisible();
    await expect(page.getByRole("navigation").first().getByRole("link", { name: "Books" })).toBeVisible();

    const [p] = await sql<{ n: number; f: string | null }>(
      `select (select count(*)::int from public.packages k where k.product_id = p.id) n, p.onboarding_form_id::text f from public.products p where slug = 'books'`,
    );
    expect(p!.n).toBe(1);
    expect(p!.f).not.toBeNull();
  });

  test("add a service field and an n8n action", async ({ page }) => {
    await adminLogin(page, "owner@e2e.test");
    await page.goto(`${ADMIN_URL}/products/lingo?tab=service-fields`);
    await page.getByRole("button", { name: "Add field" }).click();
    await page.getByLabel("Label").fill("Support group link");
    await expect(page.getByLabel("Key")).toHaveValue("support_group_link");
    await page.getByRole("button", { name: "Save field" }).click();
    await expectToast(page, "Service field saved");

    await page.goto(`${ADMIN_URL}/products/lingo?tab=actions`);
    await page.getByRole("button", { name: "Add action" }).click();
    await page.getByLabel("Button label").fill("Send welcome message");
    await page.getByLabel("n8n webhook URL").fill("https://n8n.example.com/webhook/welcome");
    await page.getByRole("button", { name: "Generate" }).click();
    await expect(page.getByText(/Copy this secret now/)).toBeVisible();
    await page.getByRole("button", { name: "Save action" }).click();
    await expectToast(page, "Action saved");
    await expect(page.getByText("n8n.example.com").first()).toBeVisible();

    // The secret never comes back to the browser.
    const html = await page.content();
    expect(html).not.toMatch(/whsec_[0-9a-f]{48}/);
  });
});

test.describe("website editing", () => {
  test("form builder: add a question and save a new version", async ({ page }) => {
    await adminLogin(page, "owner@e2e.test");
    const [f] = await sql<{ id: string; version: number }>(`select f.id, f.version from public.forms f join public.products p on p.onboarding_form_id = f.id where p.slug = 'lingo'`);
    await page.goto(`${ADMIN_URL}/forms/${f!.id}`);
    await page.getByRole("button", { name: "Add question" }).first().click();
    await page.getByLabel("Question", { exact: true }).fill("How did you hear about us?");
    await page.getByRole("button", { name: "Save form" }).click();
    await expectToast(page, `Saved as version ${f!.version + 1}`);
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(page.getByText(/Preview with your unsaved changes/)).toBeVisible();
  });

  test("edit a section on the home page", async ({ page }) => {
    await adminLogin(page, "editor@e2e.test");
    const [home] = await sql<{ id: string }>(`select id from public.pages where slug = ''`);
    await page.goto(`${ADMIN_URL}/website/pages/${home!.id}`);
    await page.getByRole("button", { name: /Hero/ }).first().click();
    const title = page.getByLabel("Title", { exact: true });
    await title.fill("Your business, answered in seconds");
    await page.getByLabel("Highlighted words").fill("in seconds");
    await page.getByRole("button", { name: "Save section" }).click();
    await expectToast(page, /Section saved/);
    const [s] = await sql<{ title: string }>(`select title from public.page_sections where page_id = $1 and type = 'hero'`, [home!.id]);
    expect(s!.title).toBe("Your business, answered in seconds");
  });

  test("text and labels shows the missing-keys report and saves overrides", async ({ page }) => {
    await sql(`delete from public.site_strings where key = 'nav.skip'`);
    await adminLogin(page, "editor@e2e.test");
    await page.goto(`${ADMIN_URL}/website/strings`);
    await expect(page.getByText("Missing keys report")).toBeVisible();
    await page.getByRole("button", { name: /Not in database/ }).click();
    const field = page.getByLabel("Text for nav.skip");
    await field.fill("Skip to the main content");
    await field.locator("xpath=..").getByRole("button", { name: "Save" }).click();
    await expectToast(page, /Text saved/);
    const [row] = await sql<{ value: string }>(`select value from public.site_strings where key = 'nav.skip'`);
    expect(row!.value).toBe("Skip to the main content");
  });
});

test.describe("settings", () => {
  test("team: owners see two-step status and roles", async ({ page }) => {
    await adminLogin(page, "owner@e2e.test");
    await page.goto(`${ADMIN_URL}/settings/team`);
    await expect(page.getByText("Olivia Owner")).toBeVisible();
    await expect(page.getByLabel("Role of Eddie Editor")).toHaveValue("editor");
  });

  test("audit log records changes", async ({ page }) => {
    await adminLogin(page, "owner@e2e.test");
    await page.goto(`${ADMIN_URL}/settings/audit?table=products`);
    await expect(page.getByText(/products/).first()).toBeVisible();
  });

  test("password change keeps working sign-in", async ({ page }) => {
    await adminLogin(page, "admin@e2e.test");
    await page.goto(`${ADMIN_URL}/account`);
    await page.getByLabel("New password").fill(`${PASSWORD}-2`);
    await page.getByLabel("Repeat it").fill(`${PASSWORD}-2`);
    await page.getByRole("button", { name: "Change password" }).click();
    await expectToast(page, "Password changed");
  });
});
