# Customising Binwright Lite

Binwright Lite is plain TypeScript on Cloudflare Workers: server-rendered pages (Hono with JSX), a D1 database (SQLite)
through Drizzle, and one small client script. There is no build step beyond the CSS.

## Where things live

| What                                                                 | File                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------- |
| Roles and what each can do                                           | `src/lib/can.ts` (one table)                         |
| Every caption: roles, place kinds, movement names, units, currencies | `src/labels.ts`                                      |
| Colours                                                              | `src/styles/input.css` (the `@theme` block)          |
| Database tables                                                      | `src/db/schema.ts`, plus a SQL file in `migrations/` |
| The stock ledger (use, receive, move, count, adjust)                 | `src/services/ledger.ts`                             |
| Stock status (out, low, OK) and the top-up to target                 | `src/services/levels.ts`                             |
| Pages                                                                | `src/routes/*.tsx`                                   |
| Demo data                                                            | `src/seed/demo.ts`                                   |

## Common changes

**Change the colours.** Every colour is a token in the `@theme` block of `src/styles/input.css`; pages use the token
names (`bg-brand`, `text-primary`, `bg-warn`), so changing a value restyles the whole app. Also change the two hex
values in `src/views/layout.tsx` (the logo and the `theme-color` meta), `public/favicon.svg` and
`public/manifest.webmanifest`. Then run `npm run build:css`. Keep red for out of stock and errors and amber for low
stock and warnings, so people can read the status at a glance. Check any new pair with a contrast checker: 4.5:1 for
text, 3:1 for borders, icons and focus rings. The shipped tokens:

| Token          | Value     | Used for                        | Contrast                                              |
| -------------- | --------- | ------------------------------- | ----------------------------------------------------- |
| `brand`        | `#1e293b` | Header                          | White text 14.63:1, `brand-200` text 9.85:1           |
| `brand-800`    | `#334155` | Page title banners              | White text 10.35:1, `brand-200` text 6.97:1           |
| `primary`      | `#0f766e` | Buttons, links, focus rings     | White on it 5.47:1; on white 5.47:1, on canvas 5.05:1 |
| `primary-dark` | `#115e59` | Button hover, "soon" badge text | White on it 7.58:1; on `primary-100` 6.73:1           |
| `accent`       | `#2dd4bf` | Logo, active tab, header focus  | On `brand` 7.86:1                                     |
| `canvas`       | `#f4f6f8` | Page background                 | `ink` text 16.48:1                                    |
| `ink`          | `#0f172a` | Body text                       | On white 17.85:1                                      |
| `warn`         | `#b45309` | Low stock bars and tiles        | On white 5.02:1                                       |
| `alert-700`    | `#7a4d00` | Low badge text                  | On `alert-100` 6.51:1                                 |
| `danger`       | `#b0200c` | Out of stock, errors            | White on it 6.87:1; on `danger-50` 6.45:1             |
| `success`      | `#1e6c30` | In stock, saved messages        | On `success-50` 6.13:1                                |

**Rename a role or a place kind.** Change the text on the right in `src/labels.ts`. Leave the keys on the left alone:
they are stored in the database.

**Let staff adjust stock or see costs.** Add `"staff"` to the action in the `allowed` table in `src/lib/can.ts`, for
example `"stock:adjust": EVERY_ROLE`. Every route checks this table on the server.

**Change when stock counts as low.** `statusOf` in `src/services/levels.ts`: stock is low at or below the reorder
point. Change the comparison there, for example to flag stock just above it.

**Add a field to items.** Add the column in `src/db/schema.ts`, run `npm run db:generate` to create a migration, add
it to `itemSchema` in `src/lib/validate.ts`, to the form in `src/routes/items.tsx`, and to `ItemInput` in
`src/services/catalog.ts`. Then `npm run deploy`.

**Use Resend or another email service** (for password reset emails). Replace the body of `sendEmail` in `src/lib/email.ts` with a `fetch` call to
your provider, and store its key with `npx wrangler secret put RESEND_API_KEY`.

**Different languages.** Captions are in `src/labels.ts` and the page files. Dates, money and numbers already follow
the date format and currency on the Setup page.

## Checking your changes

```bash
npm run check      # type check and all tests
npm run test:e2e   # real browser tests at desktop and phone width, with accessibility checks
```

The end-to-end tests use Microsoft Edge or Chrome if installed; set `E2E_BROWSER=chromium` to use Playwright's own
browser (run `npx playwright install chromium` first).
