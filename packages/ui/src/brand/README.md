# Retexia brand mark

`retexia-mark.svg` is the Retexia "R" (blue `#005DE0`), redrawn as a vector from the logo artwork so
it stays sharp at every size. Everything else is made from it:

- Website favicons: `apps/web/app/icon.svg`, `apps/panels/app/icon.svg`, `apps/admin/app/icon.svg`
- App icons, splash and notification icon: `node apps/mobile/scripts/make-icons.mjs`
- Google Play icon and feature graphic: `node apps/mobile/store/make-store-images.mjs`

Change the mark here, then run both scripts and update the three favicons.
