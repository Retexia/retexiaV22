# Payments with Paddle

Customers choose a plan, answer the short form, and pay in Paddle's checkout
(card, Apple Pay, Google Pay, PayPal). Paddle is the Merchant of Record: it
charges, adds tax where needed, renews subscriptions and pays you out.

What happens automatically (admin.retexia.com/api/paddle/webhook):

| Paddle event | Retexia |
| --- | --- |
| First payment | Confirmed payment + receipt, request → **Setting up** (Post → **Active**), customer emailed |
| Renewal | Confirmed payment + receipt, next payment date moves on |
| Customer cancels in **Manage billing** | Request → **Cancelled** when the paid period ends |
| Paused / resumed | Request → **Paused** / **Active** |
| Payment failed (past due) | Customer and team emailed; Paddle retries by itself |
| Refund approved | Refund recorded, payment marked refunded |

Prices are in **USD** (Paddle can't charge in LKR). Manual payments can still be
recorded on a request in the admin (Payments tab).

## 1. Database

Supabase → SQL Editor → run `supabase/migrations/0009_paddle.sql`. It switches
prices to USD, adds the refund policy page and Paddle wording to the terms.

## 2. Paddle sandbox (sandbox-vendors.paddle.com)

1. **Checkout → Checkout settings → Default payment link:** `https://www.retexia.com/pay`
   (needed before Paddle lets you create checkouts).
2. **Developer tools → Authentication:**
   - **API key** with read and write access to products, prices, transactions,
     customers and subscriptions → `PADDLE_API_KEY`.
   - **Client-side token** (starts with `test_`) → `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`.
3. **Developer tools → Notifications → New destination:**
   - URL: `https://admin.retexia.com/api/paddle/webhook`
   - Events: `transaction.completed`, `subscription.created`, `subscription.updated`,
     `subscription.activated`, `subscription.past_due`, `subscription.paused`,
     `subscription.resumed`, `subscription.canceled`, `adjustment.created`, `adjustment.updated`
   - Copy its **secret key** → `PADDLE_WEBHOOK_SECRET`.

## 3. Vercel environment variables

| Project | Variables |
| --- | --- |
| Website | `NEXT_PUBLIC_PADDLE_ENV=sandbox`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `PADDLE_API_KEY` |
| Admin | `NEXT_PUBLIC_PADDLE_ENV=sandbox`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET` |

Redeploy both.

## 4. Put your plans in Paddle

Admin → Settings → **Payments and invoices** → **Sync plans to Paddle**. It creates
a Paddle product per product and a monthly, yearly and setup-fee price per plan.
Run it again whenever you change a price in the admin.

## 5. Test a payment

1. Sign in on retexia.com with a test account, choose a plan, fill in the form.
2. Paddle's checkout opens. Card `4242 4242 4242 4242`, any future date, CVC `100`.
3. The request page says "Payment received" and moves to **Setting up** within a
   few seconds. Admin → Settings → Payments shows the webhook event as **Done**.
4. **Manage billing** on the request opens Paddle's portal (cancel, change card, invoices).

## 6. Going live

1. Create the live account at vendors.paddle.com and complete verification.
   Paddle reviews the website: it needs the pricing (retexia.com/lingo, /post),
   **Terms**, **Privacy** and **Refund policy** pages (all published by the SQL).
2. Repeat step 2 in the live dashboard (live API key, `live_` client token,
   live webhook destination and secret).
3. Set `NEXT_PUBLIC_PADDLE_ENV=production` and the live keys in both Vercel
   projects, redeploy, then press **Sync plans to Paddle** again (the live catalog is separate).
