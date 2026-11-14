import { Hono, type Context } from "hono";
import { asc, isNotNull } from "drizzle-orm";
import type { AppEnv } from "../env";
import { MOVEMENT_TYPES, user as userTable, type MovementType } from "../db/schema";
import { can } from "../lib/can";
import { CSV_BOM, csvRow } from "../lib/csv";
import { requirePermission } from "../lib/middleware";
import { formatMoney, formatQty, formatWhen, zonedInstant, addDays } from "../lib/region";
import { id as idSchema } from "../lib/validate";
import { movementLabel } from "../labels";
import { listActivity, type ActivityFilter } from "../services/catalog";
import { btn, Card, Empty, Field, H1, Pager, Select, Table, Td, Th } from "../views/components";
import { render } from "./render";
import { pickLists } from "./shared";

export const activityRoutes = new Hono<AppEnv>();

const PAGE = 100;
const isUuid = (v: string | undefined) => (v && idSchema.safeParse(v).success ? v : undefined);
const isDay = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

function filterFrom(c: Context<AppEnv>): { f: ActivityFilter; raw: Record<string, string> } {
  const q = c.req.query();
  const tz = c.get("region").timeZone;
  const from = isDay(q.from);
  const to = isDay(q.to);
  const f: ActivityFilter = {
    itemId: isUuid(q.item),
    locationId: isUuid(q.location),
    userId: isUuid(q.user),
    type: (MOVEMENT_TYPES as readonly string[]).includes(q.type ?? "") ? (q.type as MovementType) : undefined,
    text: (q.text ?? "").trim().slice(0, 80) || undefined,
    from: from ? zonedInstant(from, "00:00", tz).toISOString() : undefined,
    to: to ? zonedInstant(addDays(to, 1), "00:00", tz).toISOString() : undefined,
  };
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries({
    item: f.itemId,
    location: f.locationId,
    user: f.userId,
    type: f.type,
    text: f.text,
    from,
    to,
  })) {
    if (v) raw[k] = v;
  }
  return { f, raw };
}

activityRoutes.get("/activity", requirePermission("stock:view"), async (c) => {
  const db = c.get("db");
  const region = c.get("region");
  const settings = c.get("settings");
  const { f, raw } = filterFrom(c);
  const offset = Math.max(0, Math.min(1_000_000, Number(c.req.query("offset") ?? 0) || 0));
  const [rows, lists, people] = await Promise.all([
    listActivity(db, { ...f, limit: PAGE, offset }),
    pickLists(c),
    db
      .select({ id: userTable.id, name: userTable.name })
      .from(userTable)
      .where(isNotNull(userTable.role))
      .orderBy(asc(userTable.name))
      .all(),
  ]);
  const showCost = can(c.get("user"), "cost:view");
  const qs = new URLSearchParams(raw).toString();
  return render(
    c,
    { title: "Activity", active: "activity" },
    <>
      <H1
        sub="Every change to stock: who, what, where and when. Nothing here is ever edited or deleted."
        action={
          can(c.get("user"), "data:export") ? (
            <a
              class={btn("secondary", "border-white/40 bg-white/10 text-white hover:bg-white/20")}
              href={`/activity.csv${qs ? `?${qs}` : ""}`}
            >
              Download CSV
            </a>
          ) : undefined
        }
      >
        Activity
      </H1>
      <Card class="mb-5" label="Filter activity">
        <form method="get" action="/activity" class="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Item" name="item" options={lists.itemOpts} value={raw.item} placeholder="All" class="mb-3" />
          <Select
            label={settings.locationWord}
            name="location"
            options={lists.locationOpts}
            value={raw.location}
            placeholder="All"
            class="mb-3"
          />
          <Select
            label="What"
            name="type"
            options={MOVEMENT_TYPES.map((t) => ({ value: t, label: movementLabel[t] }))}
            value={raw.type}
            placeholder="All"
            class="mb-3"
          />
          <Select
            label="Person"
            name="user"
            options={people.map((p) => ({ value: p.id, label: p.name }))}
            value={raw.user}
            placeholder="Anyone"
            class="mb-3"
          />
          <Field
            label="Reference or note"
            name="text"
            value={raw.text}
            placeholder="Job, event, invoice"
            bare
            class="mb-3"
          />
          <Field label="From" name="from" type="date" value={raw.from} bare class="mb-3" />
          <Field label="To" name="to" type="date" value={raw.to} bare class="mb-3" />
          <div class="flex items-end gap-2 pb-3">
            <button type="submit" class={btn("primary")}>
              Show
            </button>
            <a class={btn("ghost")} href="/activity">
              Clear
            </a>
          </div>
        </form>
      </Card>
      {rows.length === 0 ? (
        <Empty>Nothing recorded that matches.</Empty>
      ) : (
        <Card>
          <Table caption="Stock movements, newest first" captionHidden>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>What</Th>
                <Th>Item</Th>
                <Th>{settings.locationWord}</Th>
                <Th class="text-right">Change</Th>
                <Th class="text-right">After</Th>
                <Th>Details</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr>
                  <Td class="whitespace-nowrap">{formatWhen(a.occurredAt, region)}</Td>
                  <Td>{movementLabel[a.type]}</Td>
                  <Td>
                    <a class="tap text-primary underline-offset-2 hover:underline" href={`/items/${a.itemId}`}>
                      {a.itemName}
                    </a>
                  </Td>
                  <Td>{a.locationName}</Td>
                  <Td
                    class={`text-right tabular-nums ${a.qtyDelta < 0 ? "text-danger" : a.qtyDelta > 0 ? "text-success" : ""}`}
                  >
                    {a.qtyDelta > 0 ? "+" : a.qtyDelta < 0 ? "-" : ""}
                    {formatQty(Math.abs(a.qtyDelta), a.unit)}
                  </Td>
                  <Td class="text-right tabular-nums">{formatQty(a.balanceAfter)}</Td>
                  <Td>
                    {[
                      a.reference,
                      a.note,
                      showCost && a.unitCost !== null ? `${formatMoney(a.unitCost, region)} each` : "",
                    ]
                      .filter(Boolean)
                      .join(". ")}
                  </Td>
                  <Td>{a.userName ?? ""}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pager base={new URLSearchParams(raw)} offset={offset} size={PAGE} shown={rows.length} path="/activity" />
        </Card>
      )}
    </>,
  );
});

activityRoutes.get("/activity.csv", requirePermission("data:export"), async (c) => {
  const { f } = filterFrom(c);
  const rows = await listActivity(c.get("db"), { ...f, limit: 10_000 });
  let body =
    CSV_BOM +
    csvRow([
      "When (UTC)",
      "What",
      "Item",
      c.get("settings").locationWord,
      "Change",
      "Unit",
      "Balance after",
      "Unit cost",
      "Reference",
      "Note",
      "By",
    ]);
  for (const a of rows) {
    body += csvRow([
      a.occurredAt,
      movementLabel[a.type],
      a.itemName,
      a.locationName,
      a.qtyDelta,
      a.unit,
      a.balanceAfter,
      a.unitCost,
      a.reference,
      a.note,
      a.userName,
    ]);
  }
  return c.body(body, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="activity-${new Date().toISOString().slice(0, 10)}.csv"`,
  });
});
