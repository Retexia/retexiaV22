# @retexia/shared

Plain TypeScript shared by the websites (Next.js) and the app (Expo). No React, no Node, no
browser APIs, no dependencies: anything here must run on the server, in a browser and in React
Native.

| Import | What |
|---|---|
| `@retexia/shared/tokens` | design tokens: colours (light/dark), shadows, radii, layout, type scale, product colours. `@retexia/ui` turns them into CSS variables; the app reads them directly. |
| `@retexia/shared/lingo-feeder` | Lingo Feeder chat statuses in plain words, phone and price formatting, the WhatsApp 24-hour window. |
| `@retexia/shared/app-api` | the shapes of `/api/app/*` answers (apps/panels serves them, apps/mobile reads them). |

Change a token here and both the websites and the app pick it up.
