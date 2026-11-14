import { Hono } from "hono";
import type { AppEnv } from "../env";
import { can } from "../lib/can";
import { requirePermission } from "../lib/middleware";
import { formatMoney, formatQty, formatWhen } from "../lib/region";
import { movementLabel } from "../labels";
import { listActivity } from "../services/catalog";
import { byUrgency, listLevels, needsAttention, summarise, topUpQty } from "../services/levels";
import { Alert, btn, Card, Empty, H1, H2, Stat, StatusBadge } from "../views/components";
import { render } from "./render";

export const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.get("/dashboard", requirePermission("stock:view"), async (c) => {
  const db = c.get("db");
  const user = c.get("user")!;
  const settings = c.get("settings");
  const region = c.get("region");
  const [levels, activity] = await Promise.all([listLevels(db), listActivity(db, { limit: 8 })]);
  const s = summarise(levels);
  const attention = levels.filter(needsAttention).sort(byUrgency);
  const showCost = can(user, "cost:view");
  const firstRun = levels.length === 0;

  return render(
    c,
    { title: "Home", active: "dashboard" },
    <>
      <H1
        sub={`${settings.businessName}. ${s.items} items in ${s.locations} places.`}
        action={
          <>
            <a class={btn("accent")} href="/record">
              Record use
            </a>
            <a
              class={btn("secondary", "border-white/40 bg-white/10 text-white hover:bg-white/20")}
              href="/record?type=receive"
            >
              Receive stock
            </a>
          </>
        }
      >
        Stock today
      </H1>

      {firstRun ? (
        <Card class="mb-5">
          <H2>Get started</H2>
          <ol class="list-decimal space-y-2 pl-5">
            <li>
              Add the places you keep stock: a van, a storeroom, a shelf.{" "}
              <a class="tap text-primary underline" href="/locations/new">
                Add a place
              </a>
            </li>
            <li>
              Add your items, with a reorder point at each place.{" "}
              <a class="tap text-primary underline" href="/items/new">
                Add an item
              </a>
            </li>
            <li>
              Count what you have now.{" "}
              <a class="tap text-primary underline" href="/count">
                Start a count
              </a>
            </li>
            <li>From then on, record use and deliveries. Anything at or below its reorder point shows here.</li>
          </ol>
        </Card>
      ) : null}

      <div class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Out of stock" value={s.out} href="/stock?status=out" tone={s.out ? "danger" : "plain"} />
        <Stat label="Low" value={s.low} href="/stock?status=low" tone={s.low ? "warn" : "plain"} />
        <Stat label="Items" value={s.items} href="/items" />
        <Stat label="Places" value={s.locations} href="/locations" />
      </div>

      <div class="grid gap-5 lg:grid-cols-3">
        <Card class="lg:col-span-2" label="Needs ordering">
          <H2>Needs ordering</H2>
          {attention.length === 0 ? (
            <p class="text-gray-700">Nothing is at or below its reorder point.</p>
          ) : (
            <ul class="divide-y divide-line">
              {attention.slice(0, 10).map((l) => {
                const top = topUpQty(l);
                return (
                  <li class="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div class="min-w-0">
                      <a
                        class="tap font-semibold text-primary underline-offset-2 hover:underline"
                        href={`/items/${l.itemId}`}
                      >
                        {l.itemName}
                      </a>
                      <p class="text-sm text-gray-700">
                        {l.locationName}: {formatQty(l.onHand, l.unit)} left
                        {l.minQty !== null ? `, reorder at ${formatQty(l.minQty)}` : ""}.
                        {top > 0 ? ` ${formatQty(top, l.unit)} brings it back to target.` : ""}
                        {l.supplier ? ` Supplier: ${l.supplier}.` : ""}
                      </p>
                    </div>
                    <StatusBadge status={l.status} />
                  </li>
                );
              })}
            </ul>
          )}
          {attention.length > 10 ? (
            <p class="mt-3">
              <a class="tap text-primary underline" href="/stock?status=low">
                See all {attention.length}
              </a>
            </p>
          ) : null}
        </Card>
        {showCost ? (
          <Card label="Stock value">
            <H2>Stock value</H2>
            <p class="text-3xl font-bold tabular-nums text-brand">{formatMoney(s.value, region)}</p>
            <p class="mt-1 text-sm text-gray-700">On hand across every place, at the latest unit cost.</p>
          </Card>
        ) : (
          <Card label="Quick links">
            <H2>Quick links</H2>
            <p>
              <a class="tap text-primary underline" href="/count">
                Count stock
              </a>
            </p>
          </Card>
        )}
      </div>

      <Card class="mt-5" label="Recent activity">
        <H2>Recent activity</H2>
        {activity.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <ul class="divide-y divide-line">
            {activity.map((a) => (
              <li class="flex flex-wrap justify-between gap-x-3 py-2 text-sm">
                <span>
                  <strong>{movementLabel[a.type]}</strong> {formatQty(Math.abs(a.qtyDelta), a.unit)} {a.itemName},{" "}
                  {a.locationName}
                  {a.userName ? <span class="text-gray-700"> by {a.userName}</span> : null}
                </span>
                <span class="text-gray-700">{formatWhen(a.occurredAt, region)}</span>
              </li>
            ))}
          </ul>
        )}
        <p class="mt-3">
          <a class="tap text-primary underline" href="/activity">
            All activity
          </a>
        </p>
      </Card>
      {settings.showSetupOffer && can(user, "settings:edit") && firstRun ? (
        <Alert tone="info">
          Want it set up for you? Red Center Studio can install it and load your items, places and team for you.{" "}
          <a class="underline" href={settings.setupHelpUrl} rel="noopener">
            Ask about setup
          </a>
          . You can hide this on the Setup page.
        </Alert>
      ) : null}
    </>,
  );
});
