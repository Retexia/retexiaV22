# Adding a product

A product is data: one row in `products`, its packages, a marketing page made of sections, FAQs and
an onboarding form. Adding product #3 needs no code change on the main site.

The fastest way is the template: [`supabase/templates/new_product.sql`](../supabase/templates/new_product.sql).

## 1. Prepare the template

Copy the file and search-and-replace:

| Find | Replace with | Example |
|---|---|---|
| `example` | the product slug (lowercase, used in URLs) | `books` |
| `EXP` | a 3-letter order code (capitals, unique) | `BKS` |
| `Retexia Example` | the full name | `Retexia Books` |
| `Example` | the short name used in the account area | `Books` |

Then edit the texts, packages, prices, features, FAQs and form questions. Write in the Retexia voice:
short sentences, "you" and "we", lead with what the customer gets, no hype words, no emoji.

## 2. Pick the product colour

Each product has four colours:

| Column | Used for | Rule |
|---|---|---|
| `color_light` | text, icons and chips on white | at least **4.5:1** contrast on `#ffffff` **and** on `color_soft_light` |
| `color_soft_light` | soft background behind product text | very light tint of the same hue |
| `color_dark` | the same, in dark mode | at least **4.5:1** on `#0c1322` and on `color_soft_dark` |
| `color_soft_dark` | soft background in dark mode | very dark tint of the same hue |

Choose a hue that is clearly different from the brand blue (`#2a68d9`) and from the existing products:
Lingo is teal (`#0b7565`) and Post is rose (`#ad2a5e`). Good free picks: purple `#6d3fc0`, amber-brown
`#8a5a00`, indigo `#4338ca`. Check every pair at
[webaim.org/resources/contrastchecker](https://webaim.org/resources/contrastchecker/).

## 3. Run it

Paste the edited SQL into **Supabase → SQL Editor** and run it. It is safe to run again after changes.
The product starts as `hidden`, so nothing is public yet.

## 4. Check, then go live

Make the product visible when you are ready:

```sql
update products set status = 'live' where slug = 'books';          -- can be ordered
-- or
update products set status = 'coming_soon' where slug = 'books';   -- waitlist only
```

What appears automatically:

- the product in the header **Products** menu, the footer and the home page product cards;
- its page at `/books` (built from its `page_sections`);
- pricing cards from its `packages`, with "Choose …" buttons;
- the onboarding form at `/books/get-started?package=…` from its `form_fields`;
- order references like `BKS-2026-0001`;
- its colour on its page, chips and badges.

For a **coming soon** product, replace the `pricing` section with a `waitlist` section
(`content: {"product_slug": "books"}`) and leave out packages.

Hide a product again with `status = 'hidden'`: it disappears from menus and cards and its page returns
"not found". Existing customers still see their orders.

## 5. The product's own panel (later)

Each product gets its own app for its day-to-day panel (chat history, settings, reports):

1. Create `apps/<slug>` (for example `apps/books`) as a new Next.js app in this monorepo.
2. Import the shared packages so it looks and signs in the same way:
   - `@retexia/ui` for the design system (import `@retexia/ui/theme.css` in its global CSS);
   - `@retexia/supabase` for `createServerClient`, `createBrowserClient`, `updateSession` and the
     shared cookie settings.
3. Deploy it as its own Vercel project with root directory `apps/<slug>`, on `<slug>.retexia.com`,
   with the same environment variables (including `NEXT_PUBLIC_COOKIE_DOMAIN=.retexia.com`).
   Customers who signed in on retexia.com are already signed in there.
4. Its backend is its own n8n workflow, triggered by a Database Webhook on `orders`
   (see [DEPLOY.md, step 6](DEPLOY.md#6-connecting-n8n-later-product-backends)).
5. When the panel is ready, set on the product:

```sql
update products
   set panel_url = 'https://books.retexia.com/account',
       panel_live = true
 where slug = 'books';
```

The "Open Books panel" button then turns on for customers whose order is `active`. Until then they
see "Your panel opens when setup is finished".
