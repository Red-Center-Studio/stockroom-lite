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
