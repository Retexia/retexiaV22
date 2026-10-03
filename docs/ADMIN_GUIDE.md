# Retexia admin guide

How the team runs Retexia day to day at **admin.retexia.com**. No code, no Supabase dashboard.

## Signing in

1. Go to admin.retexia.com and sign in with your email and password (or "Email me a sign-in link").
2. The first time, scan the QR code with an authenticator app (Google Authenticator, 1Password,
   Authy…) and enter the 6-digit code. After that you enter a code once per session.
3. Lost your phone? Ask an owner to click **Reset two-step** next to your name in **Settings → Team**;
   you then scan a new QR code at your next sign-in. Avoid this by adding a second authenticator under
   **Your account → Two-step sign-in**.

Customers can't use the admin, even if they know the address.

## Who can do what

| | Support | Editor | Admin | Owner |
|---|:---:|:---:|:---:|:---:|
| Dashboard, requests, customers (view) | ✓ | ✓ | ✓ | ✓ |
| Change request status, notes, record payments, run product actions | ✓ | | ✓ | ✓ |
| Website pages, sections, media, texts, menus, FAQs | | ✓ | ✓ | ✓ |
| Products, packages, onboarding forms, service fields, actions | | | ✓ | ✓ |
| Edit customers, change prices, refunds, settings, theme, statuses, audit log | | | ✓ | ✓ |
| Team, integration secrets, deleting logins | | | | ✓ |

The database enforces the same rules, so a hidden button is never the only protection.

## Keyboard shortcuts

- **⌘K / Ctrl+K**: search everything (requests by ref, customers, products, pages) and jump anywhere.
- **g then d / r / c / p**: go to Dashboard, Requests, Customers, Payments.
- **/**: jump to the search box of the current list.

## Dashboard

What needs you today (new and in-review requests, payment proofs to check, setups stuck for 3+ days),
monthly recurring revenue, revenue by week, renewals due and new messages. Filter by product and by
period (7 days to 12 months). The bell in the top bar lights up when a new request or message arrives.

## Requests

**Requests** lists every order. Tabs: Needs action, In setup, Active, Paused, Closed, All. Filter by
product, package, assignee, source and date; sort any column; save a filter as a view; export the
current list as CSV (formulas are neutralised so the file is safe in Excel).

Open a request to see:

- **Overview:** customer, package, price, answers. Fix answers with "Edit answers"; change the price
  with "Change pricing" (admins; a reason is required and logged).
- **Setup:** service fields your team fills in (for Lingo: bot name, WhatsApp phone number ID, access
  token…). Secret fields are stored privately and shown masked; admins can reveal one (logged).
  Product actions (for example "Start setup") call n8n from here; their runs are listed below.
- **Payments:** record payments (setup fee, subscription period, other, refund), confirm a customer's
  uploaded proof, print receipts.
- **Timeline:** every status change and note. Internal notes are only for the team.
- **Activity:** the audit log for this request (admins).

### The usual flow

1. **Submitted → Reviewing** ("Start review"), or straight to **Awaiting payment** ("Approve"). The
   customer gets the note you write and sees your payment instructions with an upload button.
2. When the customer uploads a slip, it appears under **Payments → Proofs to check** and on the
   dashboard. Open it, check your bank, click **Confirm**. A receipt number (RCT-2026-0001) is created
   and the customer can download the receipt.
3. **Start setup** is only possible after a confirmed payment. Admins can go ahead without one, with a
   reason.
4. Fill in the service fields, run the product's actions, then **Mark as live**. Fields marked
   "required before Active" must be filled first. Monthly plans renew one month after going live,
   yearly plans one year after.
5. Record each renewal as a **Subscription** payment for its period; the renewal date moves to the end
   of the period. Overdue renewals show in red on the dashboard.
6. **Pause**, **Resume**, **Cancel** and **Reject** ask for the customer note (rejecting asks for a
   reason).

The buttons come from **Settings → Order statuses**, where admins decide which changes are allowed,
who may make them and the default note.

### New request (WhatsApp, phone, referral)

**Requests → New request**: pick or invite the customer, the product and package, then fill in the
same onboarding form the website uses. The source is recorded.

## Customers

Search by name, email, phone or business. A customer's page shows their requests, payments, messages,
waitlists and private team notes (pin the important ones). Admins can edit details, resend the
confirmation email, send a password reset link, change the sign-in email, ban or unban, and owners
can delete a login. Deleting a login keeps the customer's requests and payments, with personal details
removed.

## Payments

Every payment across all requests, with totals for the filter. **Proofs to check** lists uploads
waiting for confirmation. Refunds are admin-only and appear as negative amounts.

## Inbox

Contact-form messages (New, Read, Replied, Archived) and waitlist sign-ups grouped by product. Reply by
email or WhatsApp from the message; copy all waitlist emails for a launch email; export as CSV.

## Products

**Products** shows every product with open requests, active subscriptions and recurring revenue. Drag
cards to change the order on the website. **Duplicate** copies a product (packages, page, form,
service fields, actions) as a hidden draft.

**New product** is a five-step wizard: basics (name, web address, request code, icon), colour (with a
contrast check), packages (with a live preview of the pricing card), page and onboarding form (simple
or copied from another product) and review. The product starts **hidden**.

Each product has its own hub:

- **Overview:** numbers for this product, recent requests and a go-live checklist.
- **Details:** name, address, code (locked once there are requests), icon, colours, status
  (hidden / coming soon / live), product page, onboarding form, customer panel link, and the short
  feature cards used in menus.
- **Packages:** add, edit, reorder; hide one or stop new orders without deleting it. Price changes
  apply to new requests only.
- **Page / Onboarding form:** shortcuts to the page editor and the form builder.
- **Service fields:** what the team records during setup; choose which the customer sees on their
  order page and which are required before a status.
- **Actions:** n8n buttons for requests (see DEPLOY.md, step 8).
- **Waitlist** and **FAQs** for this product.

## Onboarding forms

The form builder edits steps and questions. Drag questions within or between steps; pick the answer
type; mark questions required; show a question only when an earlier answer matches; prefill from the
customer's account. **Preview** shows exactly what customers see, with validation. Saving creates a new
version; requests remember the version they were made with. Once customers have answered a question,
its key is locked (you can still change the label, hide it or delete it).

## Website

- **Pages:** every page, with publish state and search details. Open one to edit: add sections from
  the gallery, drag to reorder, hide or duplicate them. Each section has a form for its settings
  (or JSON for advanced edits) and a live preview of the website beside it. "Page settings and SEO"
  shows how the page looks in search results.
- **Navigation:** header and footer links. The header button can change for signed-in visitors
  ("My account").
- **Services, FAQs, Testimonials:** the shared lists those sections show.
- **Media:** upload images (PNG, JPG, WebP, GIF, AVIF, SVG, ICO; up to 5 MB), add alt text, see where
  an image is used. Images in use can't be deleted.
- **Text and labels:** every fixed text on the website (buttons, messages, account pages). The missing
  keys report lists texts the website uses that aren't in the database yet, and old texts no longer
  used.

Saving refreshes the website at once ("Saved · live on website").

## Settings

- **General:** business details, logos, search defaults, footer and social links, announcement bar,
  maintenance mode (the team still sees the site), currency, sign-in options.
- **Theme:** website colours for light and dark mode with a live preview and contrast check.
- **Payments and invoices:** payment instructions shown to customers, receipt details and numbering.
- **Order statuses:** labels customers see, and the allowed changes (buttons) for the team.
- **Notifications:** which events message customers (email / WhatsApp) and the team, plus the outbox
  of messages handed to n8n, with retry.
- **Integrations** (owner): the n8n callback secret and the notifications webhook.
- **Team** (owner): invite people, change roles, see who has two-step sign-in, reset it for a lost
  phone, remove access.
- **Audit log:** who changed what and when, with before/after values; filter and export.

## Good habits

- Write customer notes as if they are reading over your shoulder: they are.
- Use internal notes for anything only the team should see.
- Confirm a payment only after checking the bank.
- When in doubt, hide instead of delete: hidden things come back with one click.
