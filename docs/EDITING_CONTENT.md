# Editing the site in Supabase

Almost everything you see on retexia.com comes from the database. The Supabase **Table Editor** is
the content manager: open a table, click a cell, change it, save. Every table and column has a
description in the editor (hover the column name).

Changes show up within a few seconds when the revalidation webhook is set up (see
[DEPLOY.md, step 5](DEPLOY.md#5-instant-content-updates-database-webhook)), otherwise within a minute.

> Tip: to hide something, set `is_visible` to `false` instead of deleting the row. You can bring it
> back later.

## Quick reference: "I want to change X"

| I want to change… | Table | Column(s) |
|---|---|---|
| Site name (shown as the logo when there is no logo image) | `site_settings` | `site_name` |
| Logo | `site_settings` | `logo_url`, `logo_dark_url` (see [Images](#images)) |
| Favicon / link preview image | `site_settings` | `favicon_url`, `og_image_url` |
| Browser tab title pattern | `site_settings` | `seo_title_template` (e.g. `%s · Retexia`) |
| Default Google description | `site_settings` | `seo_default_description` |
| Email, phone, WhatsApp, address, hours | `site_settings` | `contact_email`, `contact_phone`, `whatsapp_number`, `address`, `business_hours` |
| Pre-filled WhatsApp message | `site_settings` | `whatsapp_default_message` |
| Footer text and copyright (`{year}` = current year) | `site_settings` | `footer_text`, `copyright_text` |
| Social links in the footer | `site_settings` | `social_links` (e.g. `[{"platform": "facebook", "url": "https://facebook.com/retexia"}]`) |
| Thin announcement bar at the top | `site_settings` | `announcement_enabled`, `announcement_text`, `announcement_href` |
| Brand colours, corner roundness | `site_settings` | `theme` (see [Theme](#theme-colours)) |
| Light / dark default | `site_settings` | `default_theme` (`light`, `dark` or `system`) |
| Currency and number format | `site_settings` | `currency_code` (`LKR`), `currency_locale` (`en-LK`) |
| Turn on Google sign-in or magic links | `site_settings` | `auth_google_enabled`, `auth_magic_link_enabled` |
| Put the site in maintenance | `site_settings` | `maintenance_mode`, `maintenance_message` (admins still see the site) |
| Any button label, form message, error, empty state | `site_strings` | `value` (find the row by `key`) |
| Header / footer links | `navigation_items` | `label`, `href`, `sort_order`, `is_visible` |
| A page's title and Google text | `pages` | `title`, `seo_title`, `seo_description`, `og_image_url` |
| Hide a whole page | `pages` | `is_published = false` |
| A section's heading or intro | `page_sections` | `eyebrow`, `title`, `highlight`, `subtitle` |
| Hide a section | `page_sections` | `is_visible = false` |
| Reorder sections | `page_sections` | `sort_order` (lower comes first) |
| Section-specific settings (buttons, chat example, stats…) | `page_sections` | `content` (see [Section types](#section-types)) |
| Services on the home page | `services` | `title`, `description`, `icon`, `sort_order` |
| FAQs | `faqs` | `question`, `answer` (markdown); `product_id` empty = general FAQ |
| Customer quotes | `testimonials` | add rows (real quotes only); the section appears once a row exists |
| Product name, tagline, colours | `products` | `name`, `short_name`, `tagline`, `color_*` |
| Product features list | `product_features` | `title`, `description`, `icon` |
| Prices | `packages` | `price_monthly`, `price_yearly`, `setup_fee` |
| "Most popular" label / highlighted plan | `packages` | `badge`, `is_featured` |
| Hide a plan | `packages` | `is_visible = false` |
| Show a plan but stop new orders | `packages` | `is_active = false` |
| What each plan includes | `package_features` | `label`, `included` (false = greyed out with a cross) |
| Onboarding questions | `form_fields` | see [Onboarding forms](#onboarding-forms) |
| Status names and descriptions customers see | `order_statuses` | `label`, `description`, `tone` |
| Move a customer's order forward | `orders` | `status` (+ optional `status_note`) |

## Images

1. **Storage → site-assets → Upload file.** (The bucket is public; only admins and the dashboard can upload.)
2. Click the file → **Get URL** → copy.
3. Paste the URL into the column (for example `site_settings.logo_url`).

Use a transparent PNG or SVG for logos (about 28px tall on screen; upload at 2–3× for sharp
displays). Link preview images should be 1200 × 630 px.

## Theme colours

`site_settings.theme` overrides the design tokens. Example:

```json
{
  "brand": { "light": "#2a68d9", "dark": "#7aaeff" },
  "brand-hover": { "light": "#1f55b8", "dark": "#a1c5ff" },
  "brand-soft": { "light": "#eaf1fd", "dark": "#14254a" },
  "radius-lg": "20px"
}
```

- Colour tokens: `surface`, `surface-raised`, `surface-sunk`, `line`, `line-strong`, `ink`, `ink-muted`,
  `brand`, `brand-hover`, `brand-soft`, `brand-halo`, `on-brand`, `link`, `success`, `success-soft`,
  `warning`, `warning-soft`, `danger`, `danger-soft`, `on-danger`.
- A colour can be one value (used for both themes) or `{ "light": …, "dark": … }`.
- Allowed colour formats: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(…)`, `hsl(…)`.
- Size tokens: `radius-sm`, `radius-md`, `radius-lg`, `container`, `content`, `measure`, `gutter`
  (`px` or `rem` only).
- Anything else, or a typo, is ignored. The site never breaks because of a bad value.

Keep text readable: `ink` on `surface` and white on `brand` need at least 4.5:1 contrast. Check with
[webaim.org/resources/contrastchecker](https://webaim.org/resources/contrastchecker/).

Product colours live on each product (`products.color_light`, `color_dark`, `color_soft_light`,
`color_soft_dark`).

## Icons

Wherever a table has an `icon` column, write a [Lucide](https://lucide.dev/icons) icon name in lowercase
with dashes, for example `message-circle`, `calendar-clock`, `globe`. An unknown name shows a neutral
fallback icon.

## Links

`href` columns and `content` buttons accept:

- a page on this site: `/contact`, `/lingo#pricing`, `#pricing` (same page)
- a full address: `https://…`, `mailto:hello@retexia.com`, `tel:+94…`
- `whatsapp:` → opens WhatsApp with the site number and default message
- `whatsapp:Hi, I want Lingo` → the same, with your own message

## Section types

Each row in `page_sections` has a `type` and a `content` JSON. Common columns (`eyebrow`, `title`,
`highlight`, `subtitle`, `background`, `anchor`) work for every type. `highlight` is the part of the
title shown in colour; it must appear exactly in the title. `anchor` (e.g. `pricing`) makes the section
reachable at `/page#pricing`. `background` is `surface` (white) or `sunk` (soft grey-blue band).

If `content` does not match the type, that section is hidden and a warning is written to the Vercel
logs. Fix the JSON and it comes back.

### hero
The big opening block. The first section on a page is its main heading.
```json
{
  "primary_cta": { "label": "See plans", "href": "#pricing" },
  "secondary_cta": { "label": "Talk to us", "href": "/contact" },
  "visual": "lingo_chat",
  "show_halo": true,
  "badge": "Coming soon",
  "size": "large",
  "chat": {
    "name": "Kandy Cakes",
    "status": "Replies instantly",
    "messages": [
      { "from": "customer", "text": "Hi, price ekka?", "time": "10:12 pm" },
      { "from": "business", "text": "Rs. 3,900. Delivery is free in Kandy.", "time": "10:12 pm" }
    ]
  }
}
```
`visual`: `lingo_chat` (or `chat`) for the WhatsApp mock, `image` (add `image_url`, `image_alt`), or
`none`. `size`: `large` or `small`. All keys are optional.

### features
```json
{ "source": "product", "columns": 3 }
```
`source: "product"` lists `product_features` of the page's product (or of `"product_slug": "lingo"`).
For your own list use `"source": "inline"` with
`"items": [{ "icon": "clock", "title": "Works 24/7", "text": "One sentence." }]`. `columns`: 2 or 3.

### products
```json
{ "include_coming_soon": true, "show_status": true }
```
Cards for every visible product, with "Learn more" or "Join the waitlist".

### services
```json
{ "layout": "grid" }
```
Shows the `services` table.

### steps
```json
{ "items": [
  { "icon": "clipboard-list", "title": "Tell us about your business", "text": "About ten minutes." },
  { "icon": "wrench", "title": "We set it up", "text": "We build and test it." },
  { "icon": "circle-check", "title": "It runs, you relax", "text": "We keep an eye on it." }
] }
```

### about
```json
{
  "body": "First paragraph.\n\nSecond paragraph (markdown).",
  "stats": [{ "value": "24/7", "label": "Replies, day and night" }],
  "image_url": "https://…", "image_alt": "Our team"
}
```
Keep stats honest: product facts, not invented customer numbers.

### pricing
```json
{ "product_slug": "lingo", "show_yearly_toggle": true, "note": "Optional line under the cards." }
```
Shows the product's visible `packages`. `product_slug` can be left out on a product page.

### faq
```json
{ "product_slug": "lingo" }
```
Leave `{}` for the general FAQs (rows with an empty `product_id`).

### testimonials
```json
{ "product_slug": "lingo" }
```
Hidden while there are no matching rows in `testimonials`.

### cta
```json
{ "primary_cta": { "label": "Choose a plan", "href": "#pricing" }, "secondary_cta": { "label": "Message us on WhatsApp", "href": "whatsapp:" } }
```

### contact
```json
{ "show_form": true, "show_details": true, "show_whatsapp": true }
```
Messages land in `contact_messages`. Set their `status` to `read`, `replied` or `archived` as you work.

### waitlist
```json
{ "product_slug": "post" }
```
Only shows while that product's status is `coming_soon`. Sign-ups land in `waitlist`.

### rich_text
```json
{ "body": "## A heading\n\nParagraphs, **bold**, [links](/contact) and lists." }
```

### image_text
```json
{ "body": "Markdown text.", "image_url": "https://…", "image_alt": "What the image shows", "image_side": "right", "cta": { "label": "Learn more", "href": "/lingo" } }
```

## Adding a new page

1. `pages` → insert a row: `slug` (e.g. `partners` → `/partners`), `title`, `seo_description`.
2. `page_sections` → insert rows with `page_id` = the new page's `id`, a `type`, `sort_order`
   and `content`.
3. Add a link in `navigation_items` if it should be in the header or footer.

Reserved slugs that cannot be used: `account`, `login`, `signup`, `auth`, `api`, `forgot-password`,
`reset-password`, `maintenance`.

## Onboarding forms

`forms` → `form_steps` → `form_fields`. The Lingo form has slug `lingo-onboarding`.

- **Change a question:** edit `label`, `placeholder`, `help_text` or `options` in `form_fields`.
- **Add a question:** insert a row with `step_id` (which step), a unique `key` (lowercase with
  underscores), `label`, `type`, `required`, `sort_order`. Leave `form_id` empty; it fills itself.
- **Remove a question:** set `is_visible = false`.
- **Field types:** `text`, `textarea`, `email`, `phone`, `number`, `url`, `select`, `radio`,
  `radio_cards`, `checkbox_group`, `checkbox`, `toggle`.
- **Choices** (`select`, `radio`, `radio_cards`, `checkbox_group`):
  `[{"value": "colombo", "label": "Colombo", "description": "optional"}]`.
- **`min` / `max`:** characters for text, value for numbers, number of choices for checkbox groups.
- **Show only sometimes:** `show_if` = `{"field": "business_type", "in": ["products", "both"]}` or
  `{"field": "industry", "equals": "other"}`.
- **Pre-fill from the profile:** `prefill_from` = `profile.full_name`, `profile.phone`,
  `profile.whatsapp`, `profile.business_name` or `user.email`. Answers to these fields also fill empty
  profile fields when the request is sent.
- **Labels** can contain links: `I agree to the [Terms](/terms)`.
- **After changing questions, bump `forms.version`** (e.g. 1 → 2). Saved drafts from the old version are
  discarded, and each order records which version it was made with. Old orders keep their answers
  with the labels they had at the time.

## Orders

Every request appears in `orders` with a reference like `LNG-2026-0001`. The price, package name and
reference are filled in by the database, never by the browser.

To move an order forward, change `status` in the table editor (`submitted` → `reviewing` →
`awaiting_payment` → `setting_up` → `active`). The customer sees a new entry on their timeline. To add
a message to that entry, set `status_note` in the same edit. You can also edit `order_events.note`
afterwards.

`admin_note` is for the team only. Customers can never read it.

Customers may cancel while the status has `customer_can_cancel = true` in `order_statuses`
(by default: submitted, reviewing, awaiting payment).
