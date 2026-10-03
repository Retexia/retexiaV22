import { expect, test } from "@playwright/test";
import { WEB_URL } from "./env";
import { createOrder, createUser, expectToast, sql, webLogin } from "./helpers";

test.describe("customer order page", () => {
  test("awaiting payment: instructions, proof upload, then 'being checked'", async ({ page }) => {
    await sql(`update public.site_settings set payment_instructions = 'Bank: **Test Bank**, account 0001234567' where id = 1`);
    const email = `payer-${Date.now()}@e2e.test`;
    const id = await createUser(email, "customer", { name: "Kasun Fernando" });
    const order = await createOrder(id, "awaiting_payment");
    await webLogin(page, email);
    await page.goto(`${WEB_URL}/account/products/${order.ref}`);
    await expect(page.getByRole("heading", { name: "How to pay" })).toBeVisible();
    await expect(page.getByText("Test Bank")).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
    await page.getByRole("button", { name: "Send payment proof" }).click();
    await expectToast(page, /check your payment/i);
    await expect(page.getByText("Payment proof received")).toBeVisible();

    const [p] = await sql<{ status: string; proof_path: string }>(`select status, proof_path from public.payments where order_id = $1`, [order.id]);
    expect(p!.status).toBe("pending");
    expect(p!.proof_path.startsWith(`${id}/${order.id}/`)).toBe(true);
  });

  test("rejects files that are not images or PDFs", async ({ page }) => {
    const email = `wrongfile-${Date.now()}@e2e.test`;
    const id = await createUser(email, "customer");
    const order = await createOrder(id, "awaiting_payment");
    await webLogin(page, email);
    await page.goto(`${WEB_URL}/account/products/${order.ref}`);
    await page.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await page.getByRole("button", { name: "Send payment proof" }).click();
    await expect(page.getByText(/Upload a photo/)).toBeVisible();
  });

  test("confirmed payments show a receipt; visible setup fields are shown", async ({ page }) => {
    const email = `active-${Date.now()}@e2e.test`;
    const id = await createUser(email, "customer");
    const order = await createOrder(id, "setting_up");
    await sql(`insert into public.payments (order_id, user_id, kind, amount, currency, method, status, paid_at) values ($1, $2, 'setup_fee', 29800, 'LKR', 'bank_transfer', 'confirmed', now())`, [order.id, id]);
    await sql(`update public.orders set service_data = jsonb_build_object('bot_name', 'Sunny', 'go_live_date', '2026-11-01') where id = $1`, [order.id]);
    await webLogin(page, email);
    await page.goto(`${WEB_URL}/account/products/${order.ref}`);
    await expect(page.getByRole("heading", { name: "Your setup" })).toBeVisible();
    await expect(page.getByText("Sunny")).toBeVisible();
    await page.getByRole("link", { name: /Receipt RCT-/ }).click();
    await expect(page.getByText(order.ref).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Print or save as PDF/ })).toBeVisible();
  });
});

test("header button switches to “My account” when signed in", async ({ page }) => {
  await page.goto(WEB_URL);
  const header = page.locator("header").first();
  await expect(header.getByRole("link", { name: "My account" })).toHaveCount(0);
  await webLogin(page, "customer@e2e.test");
  await page.goto(WEB_URL);
  await expect(header.getByRole("link", { name: "My account" })).toBeVisible();
});

test("only the admin may frame the website", async ({ request }) => {
  const res = await request.get(WEB_URL);
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'self' http://localhost:3101");
  expect(res.headers()["x-frame-options"]).toBeUndefined();
});
