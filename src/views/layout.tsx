import type { Child, FC } from "hono/jsx";
import { raw } from "hono/html";
import type { AppUser } from "../env";
import { can } from "../lib/can";
import { CSRF_FIELD } from "../lib/csrf-field";
import { APP_NAME, roleLabel } from "../labels";

export type NavKey =
  "dashboard" | "stock" | "record" | "count" | "items" | "locations" | "activity" | "setup" | "account";

interface NavLink {
  key: NavKey;
  href: string;
  label: string;
  show: (u: AppUser) => boolean;
}

const NAV = (placesLabel: string): NavLink[] => [
  { key: "dashboard", href: "/dashboard", label: "Home", show: (u) => can(u, "stock:view") },
  { key: "stock", href: "/stock", label: "Stock", show: (u) => can(u, "stock:view") },
  { key: "record", href: "/record", label: "Record", show: (u) => can(u, "stock:record") },
  { key: "count", href: "/count", label: "Count", show: (u) => can(u, "stock:count") },
  { key: "items", href: "/items", label: "Items", show: (u) => can(u, "stock:view") },
  { key: "locations", href: "/locations", label: placesLabel, show: (u) => can(u, "stock:view") },
  { key: "activity", href: "/activity", label: "Activity", show: (u) => can(u, "stock:view") },
  { key: "setup", href: "/setup", label: "Setup", show: (u) => can(u, "settings:edit") },
  { key: "account", href: "/account", label: "Account", show: (u) => can(u, "stock:view") },
];

export interface PageProps {
  title: string;
  user?: AppUser | null;
  active?: NavKey;
  businessName?: string;
  /** Plural of what places are called here, for the nav: "Locations", "Vans", "Rooms". */
  placesLabel?: string;
  csrf: string;
  demo?: boolean;
  children?: Child;
}

export const Page: FC<PageProps> = ({ title, user, active, businessName, placesLabel, csrf, demo, children }) => (
  <>
    {raw("<!doctype html>")}
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#1e293b" />
        <meta name="robots" content="noindex" />
        <title>{`${title} | ${businessName || APP_NAME}`}</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="stylesheet" href="/styles.css" />
        <script src="/app.js" defer></script>
      </head>
      <body class="min-h-dvh bg-canvas text-ink antialiased">
        <a
          href="#main"
          class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        {demo ? (
          <div class="bg-accent px-4 py-2 text-center text-sm font-medium text-brand print:hidden">
            {APP_NAME} demo. Anything you change is wiped every night.
          </div>
        ) : null}
        <Header
          user={user ?? null}
          active={active}
          businessName={businessName}
          placesLabel={placesLabel ?? "Locations"}
          csrf={csrf}
        />
        <div id="net-error" class="mx-auto hidden max-w-5xl px-4 pt-4" role="alert"></div>
        <main id="main" tabindex={-1} class="mx-auto w-full max-w-5xl px-4 pb-16 pt-4 focus:outline-none sm:pt-6">
          {children}
        </main>
      </body>
    </html>
  </>
);

const Header: FC<{
  user: AppUser | null;
  active?: NavKey | undefined;
  businessName?: string | undefined;
  placesLabel: string;
  csrf: string;
}> = ({ user, active, businessName, placesLabel, csrf }) => {
  const links = user && user.role ? NAV(placesLabel).filter((l) => l.show(user)) : [];
  const current = links.find((l) => l.key === active);
  return (
    <header class="sticky top-0 z-40 bg-brand text-white shadow-md print:hidden">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <a
          href="/"
          class="flex min-h-11 min-w-0 items-center gap-2 rounded font-semibold text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-accent"
        >
          <Logo />
          <span class="truncate">{businessName || APP_NAME}</span>
        </a>
        {user ? (
          <form method="post" action="/logout" class="shrink-0">
            <input type="hidden" name={CSRF_FIELD} value={csrf} />
            <button
              type="submit"
              class="min-h-11 rounded-lg px-3 py-2 text-sm text-brand-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-accent"
            >
              Sign out
            </button>
          </form>
        ) : null}
      </div>
      {links.length > 0 ? (
        <nav aria-label="Main" class="mx-auto max-w-5xl">
          {/* Phones and tablets: one Menu button that opens every link as large tap targets. No script needed. */}
          <details class="group px-4 pb-3 lg:hidden" data-nav-menu>
            <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
              <span>
                Menu
                {current ? <span class="font-normal text-brand-200">: {current.label}</span> : null}
              </span>
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                aria-hidden="true"
                class="shrink-0 transition-transform group-open:rotate-180"
              >
                <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </summary>
            <ul class="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
              {links.map((l) => (
                <li>
                  <NavA l={l} active={active} />
                </li>
              ))}
            </ul>
          </details>
          {/* Wide screens: every link in one row, wrapping if a long place name needs it. */}
          <ul class="hidden flex-wrap gap-1 px-2 pb-2 lg:flex">
            {links.map((l) => (
              <li>
                <NavA l={l} active={active} />
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {user && user.role ? (
        <p class="sr-only">
          Signed in as {user.name}, {roleLabel[user.role]}
        </p>
      ) : null}
    </header>
  );
};

const NavA: FC<{ l: NavLink; active?: NavKey | undefined }> = ({ l, active }) => (
  <a
    href={l.href}
    aria-current={active === l.key ? "page" : undefined}
    class={
      active === l.key
        ? "flex min-h-11 items-center whitespace-nowrap rounded-lg border-b-2 border-accent bg-white/15 px-3 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-accent"
        : "flex min-h-11 items-center whitespace-nowrap rounded-lg border-b-2 border-transparent px-3 py-2 text-sm text-brand-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-accent"
    }
  >
    {l.label}
  </a>
);

export const Logo: FC = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" class="shrink-0">
    <rect width="32" height="32" rx="8" fill="#2dd4bf" />
    <path d="M7 12h18v13H7z" fill="none" stroke="#1e293b" stroke-width="2.5" stroke-linejoin="round" />
    <path d="M5.5 8h21v4h-21z" fill="#1e293b" />
    <path d="M13 17h6" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round" />
  </svg>
);
