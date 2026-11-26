# The Retexia app (Android now, iPhone later)

The app is `apps/mobile`: Expo SDK 58, React Native 0.88, Expo Router. Customers sign in with their
Retexia account and use what they already have. **It sells nothing**: no prices, no "Buy", "Upgrade"
or "Start trial", no links to a checkout. Payments, trials and receipts stay on retexia.com. A
product that isn't on the account just says "This isn't on your account".

Read `docs/RETEXIA_HANDOFF.md` Part 2 for why it's built this way (Google Play's payments and
"just a website" rules).

## What's in it

| Area | Screens |
|---|---|
| Sign-in | Email + password, or "Email me a link" (no new accounts from the app) |
| Home | Greeting, Lingo Feeder today (chats, orders, sales), Call them, new orders, other products on the account |
| Inbox | Every app notification, newest first; opening it marks them read |
| Products | Every product and package: on the account (with trial end) or "This isn't on your account" |
| Lingo Feeder | Home (Lingo on/off, WhatsApp number, today and this month) · Chats (status chips, search, swipe for Called / Pause Lingo, live updates) · a chat (Call, Called, status, pause, reply within WhatsApp's 24 hours, the customer's orders) · Orders (views, mark sent, cancel, share the courier CSV) · Try Lingo |
| Account | Profile, notification settings, fingerprint/face lock, Light / Dark / Phone appearance, privacy policy, sign out, delete my account. "Billing is managed on retexia.com" as plain text |
| Not in the app yet | Post, Plan, Lingo and the other Feeder tools: a screen says to use them on their panel for now (plain text, no link) |

Native parts: push notifications (Android channels "Call them", "New orders", "Updates"), tapping a
notification opens its screen, biometric lock, share sheet, haptics, pull-to-refresh, the last
day's data kept on the phone for offline use, the Retexia loader and fonts.

## How it fits together

```
apps/mobile ──Supabase Auth (same users, session in the phone's keystore)──► Supabase
     │        └─Realtime: lingo_feeder.chats / messages (RLS: the seller's own rows)
     │
     └──Bearer <access token>──► apps/panels /api/app/*  (any panel host; default feeder.retexia.com)
                                   │ lib/app/auth.ts: checks the token with Supabase Auth
                                   │ lib/app/access.ts: the SAME access rule as the panels
                                   │   (loadCustomer / loadFeeder in lib/customer.ts, lib/feeder/access.ts)
                                   └ lib/feeder/lingo-feeder/ops.ts + csv.ts: the SAME code the web
                                     panel's server actions run
Database triggers (0044) ──► notifications_outbox (channel "push") ──Database Webhook──►
     admin.retexia.com/api/notifications/dispatch ──► Expo Push API ──► Firebase ──► phone
```

| Code | What |
|---|---|
| `supabase/migrations/0044_app_push.sql` | push tokens, notification prefs, the push channel, `queue_push()`, Lingo Feeder push triggers, account deletion requests, Realtime |
| `apps/panels/app/api/app/**` | the app's API (`me`, `push-token`, `notifications`, `inbox`, `account/deletion`, `lingo-feeder/*`) |
| `apps/admin/lib/push.ts` | sends push rows through Expo; turns off phones Expo says are gone |
| `apps/web/app/(auth)/app-auth` | the page an email sign-in link opens when the app doesn't open by itself |
| `apps/web/app/(site)/delete-account` | public "Delete your account" page (Google Play's Data safety form needs its URL) |
| `apps/web/app/.well-known/assetlinks.json` | Android App Links for `https://retexia.com/app-auth` |
| `packages/shared` | tokens, Lingo Feeder words and formatting, `/api/app` types: shared by the websites and the app |

What pushes (all of them can be muted in the app, Account → Notifications):

| Event | When | Opens |
|---|---|---|
| `lingo_feeder.call` | a chat gets "Call them" (not by the seller, not a test chat) | Chats → Call them |
| `lingo_feeder.order` | a customer confirms an order | Orders |
| `lingo_feeder.number` | the WhatsApp number gets a problem | Lingo Feeder |
| `order.status_changed` / `order.created` | a product is being set up, is ready, or a free trial starts | Home |

Pushes go through Expo and Google, so they never carry an end customer's name, phone or words.
Nothing about paying is pushed (billing stays on email).

## One-time setup (you)

1. **Database.** Run `0044_app_push.sql` in the Supabase SQL editor (safe to run again). Then
   `pnpm db:test` locally should still pass.
2. **Notification webhook.** Supabase → Database → Webhooks: a hook on `notifications_outbox`
   **Insert** must POST to `https://admin.retexia.com/api/notifications/dispatch` with the header
   `x-retexia-secret` = `OUTBOX_WEBHOOK_SECRET`. Lingo Feeder pushes are made by database triggers,
   so this hook is what sends them. If n8n also gets outbox rows, make it ignore `channel = 'push'`.
3. **Supabase Auth → URL Configuration → Redirect URLs:** add `https://www.retexia.com/app-auth*` (retexia.com redirects to www, so the app uses www).
   The Magic Link email template stays as it is (`{{ .RedirectTo }}&token_hash=…&type=email`).
4. **Expo / EAS** (free account at expo.dev):
   ```bash
   npm i -g eas-cli
   cd apps/mobile && eas login && eas init
   ```
   Put the project id it prints into EAS → Environment variables as `EAS_PROJECT_ID` (and into
   `apps/mobile/.env.local` for local builds). Push notifications and over-the-air updates need it.
5. **Firebase (Android push).** Create a Firebase project, add an Android app with package
   `com.retexia.app`, then upload a **FCM V1 service account key** in expo.dev → Project →
   Credentials → Android → FCM V1. (Firebase → Project settings → Service accounts → Generate new
   private key. Keep the file out of the repo.)
6. **Android App Links.** After the first Play upload, copy the **App signing key SHA-256** (Play
   Console → Test and release → App integrity) into Vercel (retexia.com project) as
   `ANDROID_CERT_SHA256`. Check `https://www.retexia.com/.well-known/assetlinks.json` shows it.
   Until then, sign-in links open the retexia.com/app-auth page with an "Open the app" button.
7. **Optional:** turn on "Enhanced push security" in Expo and set `EXPO_ACCESS_TOKEN` in the admin's
   Vercel project.

## Build and ship

```bash
cd apps/mobile
eas build --profile preview --platform android     # an .apk to install on your own phone
eas build --profile production --platform android  # the .aab for Google Play
eas submit --profile production --platform android # uploads to the internal testing track
eas update --channel production --message "…"      # JS-only changes, no store review
```

- Native changes (a new permission, a new native module, app.config.ts plugins) need a new build.
  Everything else (screens, texts, colours) can go out with `eas update`.
- `version` in app.config.ts drives `runtimeVersion`: raise it with every store build that changes
  native code, so old builds don't get updates they can't run.

## Google Play checklist

- Play Console account. A new personal account must run a **closed test with at least 12 testers
  for 14 days** before production: start it early.
- **Data safety:** email, name, phone; app activity; customer messages shown to sellers; encrypted
  in transit; deletion available at `https://retexia.com/delete-account` and in the app.
  Decide how many days the team takes to delete an account after a request, and say so there.
- **Account deletion:** in the app (Account → Delete my account) and on the web page above. Requests
  show in admin → Customers; delete with "Delete everything".
- Privacy policy URL: `https://retexia.com/privacy`.
- **Reviewer access:** a test seller account with an active Lingo Feeder package and some sample
  chats and orders. Put its email and password in Play Console → App content → App access.
- Store listing screenshots: from the app, not the website.
- Notification permission is asked from a card on Home / Lingo Feeder ("Turn on notifications"),
  never on first launch.

## Run it locally

Against the real Supabase and the production API:

```bash
cp apps/mobile/.env.example apps/mobile/.env.local   # fill EAS_PROJECT_ID if you have one
pnpm --filter @retexia/mobile start                   # then press a for Android (Expo Go / dev build)
```

Push notifications don't work in Expo Go or an emulator: use a `development` or `preview` build on
a real phone.

Fully local, against the mock Supabase (no real data):

```bash
node scripts/e2e/mock-supabase.mjs                 # terminal 1
# terminal 2: the panels app on :3002 with the mock's keys (see scripts/e2e/app-api.mjs header)
node scripts/e2e/app-api.mjs                       # seeds a test seller + checks every /api/app route
# terminal 3: the app in a browser
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon from keys.json> \
EXPO_PUBLIC_API_URL=http://localhost:3002 pnpm --filter @retexia/mobile exec expo start --web
```

Sign in as `seller@example.com` with the password in `scripts/e2e/app-api.mjs`. The web preview is
for looking at screens only (no push, no biometrics); in development the panels allow it to call
`/api/app` from the browser (CORS), production doesn't.

## Checks

```bash
pnpm db:test                                   # includes scripts/test-app-db.mjs (0044)
pnpm --filter @retexia/mobile typecheck
pnpm --filter @retexia/mobile lint
cd apps/mobile && npx expo export --platform android   # the whole app bundles
```

## Adding a product to the app

1. Its reads and actions: move the panel's server-action bodies into a `lib/<product>/ops.ts`
   (taking the user id), make the actions call them, then add `apps/panels/app/api/app/<product>/*`
   routes that call the same functions after `appUser()` + the product's access check.
2. Add its answer types to `packages/shared/src/app-api.ts`.
3. Add `apps/mobile/src/app/<product>/` screens with the components in `src/components/ui.tsx`,
   and list its package in `IN_APP` (`apps/panels/lib/app/access.ts`).
4. Its pushes: a trigger that calls `public.queue_push(user, '<product>.<event>', title, body, '/<app path>')`,
   plus an entry in `apps/panels/lib/app/notifications.ts` so it can be muted.
