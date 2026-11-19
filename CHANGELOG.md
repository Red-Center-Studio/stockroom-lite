# Changelog

## 1.2.0 (2026-11-19)

**Renamed from Binwright Lite to StockRoom Lite.** Nothing else about how the app works has changed.

**Before you update:** this release adds one small database migration (`migrations/0001_stockroom_name.sql`). It only
points the default "ask about setup" link at the new page, and only if you have not set your own. `npm run deploy`
applies it for you and never deletes data.

- The name appears everywhere you see it: pages, titles, emails, the phone home screen name, labels, CSV file names
  and the documentation.
- New installs create a Worker and database named `stockroom-lite`. Existing installs keep the names they already
  have.
- **Everyone signs in once more after this update.** The sign-in cookie is now named after StockRoom, so existing
  sessions end. No data is lost.

## 1.1.0 (2026-11-15)

- New look, matching Binwright: dark slate header, teal buttons and links, a cool light background. Red is kept for
  out of stock and errors, amber for low stock and warnings. Every colour is a theme token in
  `src/styles/input.css`, with contrast ratios in CUSTOMISING.md.
- Phones: a Menu button replaces the sideways-scrolling tabs; links, checkboxes and toggles have 44px tap areas.
- Clearer focus rings (teal, 5.47:1 on white) and darker form borders (3:1 or more).
- The red bar on the "Out of stock" tile now shows.
- Phone checks at 375px and 390px wide in the browser tests (`e2e/mobile.spec.ts`).
- `npm run screenshots` also makes 1200x628 and 1200x1200 pictures of the Home screen.

## 1.0.0 (2026-11-15)

First release of Binwright Lite, the free and open-source edition of Binwright.

- Items, places (nested), stock levels with reorder points and targets.
- Stock ledger: use, waste, receive, move, count, adjust. Guarded against going below zero, even with two people at
  once.
- Counts with expected numbers shown or hidden.
- Low and out-of-stock status at every place, and a "needs ordering" list on the home page.
- CSV export of stock and activity.
- Per-install currency, units, date format, time zone and the word for a place.
- Staff, Manager and Admin roles.
- Demo mode with a nightly reset.
