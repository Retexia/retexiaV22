# Payments with PayHere

Customers choose a plan, fill in the short form, and pay by card in PayHere's
secure window. The plan renews automatically every month or year; the setup fee
is added to the first payment. Everything after that is automatic:

| PayHere notification | Retexia |
| --- | --- |
| First payment (AUTHORIZATION_SUCCESS) | Payment + receipt, request → **Setting up** (Post → **Active**), customer emailed |
| Renewal (RECURRING_INSTALLMENT_SUCCESS) | Payment + receipt, next payment date moves on |
| Renewal failed (RECURRING_INSTALLMENT_FAILED) | Customer and team emailed; PayHere retries daily |
| Subscription stopped (RECURRING_STOPPED) | Request → **Cancelled** |
| Chargeback | Recorded as a refund |

Customers cancel with **Cancel subscription** on their request. In the admin,
a request's Payments tab has **Copy pay link**, **Check payment in PayHere**
(for a missed notification) and **Cancel subscription**.

## 1. Database

Supabase → SQL Editor → run `supabase/migrations/0012_payhere.sql` (after 0009–0011).

## 2. PayHere sandbox (sandbox.payhere.lk)

1. **Integrations → Add Domain/App:** domain `www.retexia.com`. Copy its
   **Merchant Secret** (each domain has its own) and your **Merchant ID**.
2. **Settings → API keys → Create API key:** name "Retexia", tick
   **Subscription management** and **Payment retrieval**, allowed domain
   `retexia.com`. Copy the **App ID** and **App Secret**.
3. Nothing else: the notify URL (`https://admin.retexia.com/api/payhere/notify`)
   is sent with every checkout.

## 3. Vercel (website and admin, both)

| Variable | Value |
| --- | --- |
| `PAYMENT_PROVIDER` | `payhere` |
| `NEXT_PUBLIC_PAYHERE_SANDBOX` | `true` (sandbox) / `false` (live) |
| `PAYHERE_MERCHANT_ID` | Merchant ID |
| `PAYHERE_MERCHANT_SECRET` | Merchant Secret of www.retexia.com |
| `PAYHERE_APP_ID`, `PAYHERE_APP_SECRET` | API key |

Redeploy both. Admin → Settings → Payments shows the status and every notification.

## 4. Test (sandbox)

1. On retexia.com choose a plan and fill in the form (your profile needs a phone number).
2. PayHere's window opens. Test card: Visa `4916217501611292`, any future
   expiry, any CVV, any name.
3. The request shows "Payment received" and moves on within seconds; in sandbox
   PayHere also sends a test renewal about a minute later.

## 5. Going live

1. Finish PayHere's business verification and ask PayHere to enable
   **recurring payments** (and **USD**, if you charge in dollars).
2. On www.payhere.lk repeat step 2 (live domain + secret, live API key). Live
   domains need PayHere's approval.
3. Set the live values in Vercel with `NEXT_PUBLIC_PAYHERE_SANDBOX=false` and redeploy.

Prices: PayHere charges in LKR, USD, GBP, EUR or AUD; the site's prices are in
the currency set in Settings → General (now USD). To charge in rupees, change the
currency there and the package prices in Products.
