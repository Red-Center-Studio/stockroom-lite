import { Hono } from "hono";
import type { AppEnv } from "../env";
import { can } from "../lib/can";
import { CSV_BOM, csvRow } from "../lib/csv";
import { requirePermission } from "../lib/middleware";
import { formatMoney, formatQty } from "../lib/region";
import { listCategories } from "../services/catalog";
import { byUrgency, listLevels, statusLabel, type StockStatus } from "../services/levels";
import { btn, Card, Empty, H1, Select, StatusBadge, Table, Td, Th, Field } from "../views/components";
import { render } from "./render";
import { LevelBar, pickLists } from "./shared";

export const stockRoutes = new Hono<AppEnv>();

const STATUSES: StockStatus[] = ["out", "low", "ok", "untracked"];

function filtersFrom(q: Record<string, string>) {
  const status = STATUSES.includes(q.status as StockStatus) ? (q.status as StockStatus) : undefined;
  return {
    search: (q.q ?? "").trim().slice(0, 80) || undefined,
    locationId: /^[0-9a-f-]{36}$/.test(q.location ?? "") ? q.location : undefined,
    category: (q.category ?? "").slice(0, 60) || undefined,
    status,
  };
}

stockRoutes.get("/stock", requirePermission("stock:view"), async (c) => {
  const db = c.get("db");
  const settings = c.get("settings");
  const region = c.get("region");
  const f = filtersFrom(c.req.query());
  const [all, categories, lists] = await Promise.all([listLevels(db, f), listCategories(db), pickLists(c)]);
  const levels = (f.status ? all.filter((l) => l.status === f.status) : all).sort(f.status ? byUrgency : () => 0);
  const showCost = can(c.get("user"), "cost:view");
  const exportQs = new URLSearchParams(c.req.query()).toString();
  return render(
    c,
    { title: "Stock", active: "stock" },
    <>
      <H1
        sub="Every item at every place, with its reorder point and status."
        action={
          can(c.get("user"), "data:export") ? (
            <a
              class={btn("secondary", "border-white/40 bg-white/10 text-white hover:bg-white/20")}
              href={`/stock/export.csv${exportQs ? `?${exportQs}` : ""}`}
            >
              Download CSV
            </a>
          ) : undefined
        }
      >
        Stock
      </H1>
      <Card class="mb-5" label="Filter stock">
        <form method="get" action="/stock" class="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-5" role="search">
          <Field
            label="Search"
            name="q"
            type="search"
            value={f.search}
            placeholder="Name or code"
            inputmode="search"
            bare
            class="mb-3 lg:col-span-2"
          />
          <Select
            label={settings.locationWord}
            name="location"
            options={lists.locationOpts}
            value={f.locationId}
            placeholder="All"
            class="mb-3"
          />
          <Select
            label="Category"
            name="category"
            options={categories.map((x) => ({ value: x, label: x }))}
            value={f.category}
            placeholder="All"
            class="mb-3"
          />
          <Select
            label="Status"
            name="status"
            options={STATUSES.map((s) => ({ value: s, label: statusLabel[s] }))}
            value={f.status}
            placeholder="All"
            class="mb-3"
          />
          <div class="flex gap-2 sm:col-span-2 lg:col-span-5">
            <button type="submit" class={btn("primary")}>
              Show
            </button>
            <a href="/stock" class={btn("ghost")}>
              Clear
            </a>
          </div>
        </form>
      </Card>
      {levels.length === 0 ? (
        <Empty>
          {all.length === 0 && !f.search && !f.locationId ? (
            <>
              No stock yet.{" "}
              <a class="tap text-primary underline" href="/items/new">
                Add an item
              </a>{" "}
              and set where it is kept, or{" "}
              <a class="tap text-primary underline" href="/record?type=receive">
                receive a delivery
              </a>
              .
            </>
          ) : (
            "Nothing matches those filters."
          )}
        </Empty>
      ) : (
        <Card>
          <Table caption={`${levels.length} stock ${levels.length === 1 ? "line" : "lines"}`}>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>{settings.locationWord}</Th>
                <Th class="text-right">On hand</Th>
                <Th>Reorder at / target</Th>
                <Th>Status</Th>
                {showCost ? <Th class="text-right">Value</Th> : null}
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <tr>
                  <Td>
                    <a
                      class="tap font-semibold text-primary underline-offset-2 hover:underline"
                      href={`/items/${l.itemId}`}
                    >
                      {l.itemName}
                    </a>
                    {l.sku ? <span class="block text-xs text-gray-700">{l.sku}</span> : null}
                  </Td>
                  <Td>
                    <a class="tap underline-offset-2 hover:underline" href={`/locations/${l.locationId}`}>
                      {l.locationName}
                    </a>
                  </Td>
                  <Td class="text-right tabular-nums">
                    <span class="font-semibold">{formatQty(l.onHand, l.unit)}</span>
                    <LevelBar l={l} />
                  </Td>
                  <Td class="tabular-nums">
                    {l.minQty === null ? "Not set" : formatQty(l.minQty)} /{" "}
                    {l.parQty === null ? "Not set" : formatQty(l.parQty)}
                  </Td>
                  <Td>
                    <StatusBadge status={l.status} />
                  </Td>
                  {showCost ? (
                    <Td class="text-right tabular-nums">{l.value !== null ? formatMoney(l.value, region) : ""}</Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>,
  );
});

stockRoutes.get("/stock/export.csv", requirePermission("data:export"), async (c) => {
  const settings = c.get("settings");
  const region = c.get("region");
  const f = filtersFrom(c.req.query());
  const all = await listLevels(c.get("db"), f);
  const levels = f.status ? all.filter((l) => l.status === f.status) : all;
  let body =
    CSV_BOM +
    csvRow([
      "Item",
      "Code",
      "Category",
      settings.locationWord,
      "On hand",
      "Unit",
      "Reorder point",
      "Target",
      "Status",
      "Unit cost",
      `Value (${region.currency})`,
      "Supplier",
      "Last counted",
    ]);
  for (const l of levels) {
    body += csvRow([
      l.itemName,
      l.sku,
      l.category,
      l.locationName,
      l.onHand,
      l.unit,
      l.minQty,
      l.parQty,
      statusLabel[l.status],
      l.unitCost,
      l.value,
      l.supplier,
      l.lastCountedAt ? l.lastCountedAt.slice(0, 10) : "",
    ]);
  }
  return c.body(body, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="stock-${new Date().toISOString().slice(0, 10)}.csv"`,
  });
});
