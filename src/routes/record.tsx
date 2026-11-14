import { Hono, type Context } from "hono";
import { and, desc, eq, gt } from "drizzle-orm";
import type { AppEnv } from "../env";
import { item, location, movement } from "../db/schema";
import { can } from "../lib/can";
import { requirePermission } from "../lib/middleware";
import { formatQty, formatWhen, roundQty } from "../lib/region";
import { firstError, formList, formValues, id as idSchema, localToIso, recordSchema } from "../lib/validate";
import { movementLabel, RECORDABLE, recordableLabel, type Recordable } from "../labels";
import { getLocation } from "../services/catalog";
import { listLevels } from "../services/levels";
import { adjustStock, countStock, receiveStock, recordUse, transferStock } from "../services/ledger";
import { Alert, Button, Card, Csrf, Empty, Field, H1, H2, QtyField, Select, TextArea } from "../views/components";
import { formBody, render } from "./render";
import { placePath, pickLists } from "./shared";

export const recordRoutes = new Hono<AppEnv>();

// ---------- Record one movement ----------

interface RecordForm {
  type: Recordable;
  itemId?: string;
  locationId?: string;
  toLocationId?: string;
  qty?: string;
  error?: string;
  values?: Record<string, string>;
}

async function recordPage(c: Context<AppEnv>, form: RecordForm, status: 200 | 400 = 200) {
  const user = c.get("user")!;
  const settings = c.get("settings");
  const region = c.get("region");
  const lists = await pickLists(c);
  const v = form.values ?? {};
  const types = RECORDABLE.filter((t) => t !== "adjust" || can(user, "stock:adjust"));
  // The last thing this person recorded, shown as a confirmation after saving.
  let saved: { text: string; balance: string } | null = null;
  if (c.req.query("m") === "saved") {
    const last = await c
      .get("db")
      .select({
        type: movement.type,
        qty: movement.qtyDelta,
        bal: movement.balanceAfter,
        name: item.name,
        unit: item.unit,
        place: location.name,
      })
      .from(movement)
      .innerJoin(item, eq(item.id, movement.itemId))
      .innerJoin(location, eq(location.id, movement.locationId))
      .where(
        and(eq(movement.userId, user.id), gt(movement.createdAt, new Date(Date.now() - 10 * 60_000).toISOString())),
      )
      .orderBy(desc(movement.createdAt))
      .limit(1)
      .get();
    if (last) {
      saved = {
        text: `${movementLabel[last.type]} ${formatQty(Math.abs(last.qty), last.unit)} of ${last.name} at ${last.place}.`,
        balance: `${formatQty(last.bal, last.unit)} now on hand there.`,
      };
    }
  }
  return render(
    c,
    { title: "Record stock", active: "record", status },
    <>
      <H1 sub="Use, waste, receive or move stock. Works well on a phone.">Record stock</H1>
      {saved ? (
        <Alert tone="success">
          <strong>Saved.</strong> {saved.text} {saved.balance}
        </Alert>
      ) : null}
      {form.error ? <Alert tone="error">{form.error}</Alert> : null}
      {lists.itemOpts.length === 0 || lists.locationOpts.length === 0 ? (
        <Empty>
          Add at least one item and one place first.{" "}
          {can(user, "catalog:edit") ? (
            <>
              <a class="text-primary underline" href="/items/new">
                Add an item
              </a>{" "}
              or{" "}
              <a class="text-primary underline" href="/locations/new">
                add a place
              </a>
              .
            </>
          ) : (
            "Ask a manager to set them up."
          )}
        </Empty>
      ) : (
        <Card class="mx-auto max-w-xl">
          <form method="post" action="/record" data-enhance data-record-form>
            <Csrf token={c.get("csrfToken")} />
            <fieldset class="mb-4">
              <legend class="mb-2 text-sm font-medium">What happened?</legend>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {types.map((t) => (
                  <label class="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-gray-400 bg-white px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-50 has-[:checked]:font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary-200">
                    <input type="radio" name="type" value={t} checked={form.type === t} class="size-5 accent-primary" />
                    <span>{recordableLabel[t]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Select
              label="Item"
              name="itemId"
              options={lists.itemOpts}
              value={form.itemId ?? v.itemId}
              placeholder="Pick an item"
              required
            />
            <Select
              label={settings.locationWord}
              name="locationId"
              options={lists.locationOpts}
              value={form.locationId ?? v.locationId}
              placeholder={`Pick a ${settings.locationWord.toLowerCase()}`}
              required
              hint="Where the stock is now (for a move, where it is coming from)."
            />
            <div data-show-for="transfer">
              <Select
                label="Move it to"
                name="toLocationId"
                options={lists.locationOpts}
                value={form.toLocationId ?? v.toLocationId}
                placeholder="Only for a move"
              />
            </div>
            <div data-show-for="adjust">
              <Select
                label="Add or remove"
                name="direction"
                options={[
                  { value: "remove", label: "Remove stock" },
                  { value: "add", label: "Add stock" },
                ]}
                value={v.direction ?? "remove"}
                hint="Only for an adjustment. To set the exact number, count the stock instead."
              />
            </div>
            <QtyField label="Quantity" name="qty" value={form.qty ?? v.qty} required />
            <div data-show-for="receive">
              <QtyField
                label={`Unit cost (${region.currency})`}
                name="unitCost"
                value={v.unitCost}
                hint="Only for receiving. Cost of one unit."
              />
            </div>
            <Field
              label="Reference"
              name="reference"
              value={v.reference}
              maxlength={80}
              hint="Job number, event, supplier invoice or anything that helps find it later."
            />
            <TextArea
              label="Note"
              name="note"
              value={v.note}
              maxlength={500}
              rows={2}
              hint="Required for an adjustment: say why."
            />
            <details class="mb-4">
              <summary class="cursor-pointer text-sm font-medium text-primary">It happened earlier</summary>
              <Field
                label="When"
                name="occurredAt"
                type="datetime-local"
                value={v.occurredAt}
                class="mt-3"
                hint="Leave empty for now."
              />
            </details>
            <Button full>Save</Button>
          </form>
        </Card>
      )}
    </>,
  );
}

const pickType = (v: string | undefined): Recordable =>
  (RECORDABLE as readonly string[]).includes(v ?? "") ? (v as Recordable) : "use";
const uuidOrUndef = (v: string | undefined) => (v && idSchema.safeParse(v).success ? v : undefined);

recordRoutes.get("/record", requirePermission("stock:record"), async (c) => {
  const q = c.req.query();
  const qty = q.qty && /^\d{1,9}(\.\d{1,3})?$/.test(q.qty) ? q.qty : undefined;
  return recordPage(c, {
    type: pickType(q.type),
    itemId: uuidOrUndef(q.item),
    locationId: uuidOrUndef(q.location),
    toLocationId: uuidOrUndef(q.to),
    qty,
  });
});

recordRoutes.post("/record", requirePermission("stock:record"), async (c) => {
  const db = c.get("db");
  const user = c.get("user")!;
  const values = formValues(await formBody(c));
  const type = pickType(values.type);
  const fail = (error: string) => recordPage(c, { type, values, error }, 400);
  const parsed = recordSchema.safeParse({ ...values, type });
  if (!parsed.success) return fail(firstError(parsed.error));
  const d = parsed.data;
  const occurredAt = localToIso(d.occurredAt, c.get("region").timeZone) ?? undefined;
  const common = { itemId: d.itemId, locationId: d.locationId, reference: d.reference, note: d.note, occurredAt };
  let res;
  if (d.type === "use" || d.type === "waste") res = await recordUse(db, user, { ...common, type: d.type, qty: d.qty });
  else if (d.type === "receive") res = await receiveStock(db, user, { ...common, qty: d.qty, unitCost: d.unitCost });
  else if (d.type === "transfer")
    res = await transferStock(db, user, { ...common, toLocationId: d.toLocationId, qty: d.qty });
  else if (d.type === "adjust")
    res = await adjustStock(db, user, { ...common, delta: d.direction === "add" ? d.qty : -d.qty });
  else return fail("Choose what happened.");
  if (!res.ok) return fail(res.message);
  // Keep the place picked, so recording several items from the same van is quick.
  return c.redirect(`/record?m=saved&type=${type}&location=${d.locationId}`, 303);
});

// ---------- Count ----------

recordRoutes.get("/count", requirePermission("stock:count"), async (c) => {
  const settings = c.get("settings");
  const region = c.get("region");
  const lists = await pickLists(c);
  const levels = await listLevels(c.get("db"));
  const stats = new Map<string, { n: number; last: string | null }>();
  for (const l of levels) {
    const s = stats.get(l.locationId) ?? { n: 0, last: null };
    s.n++;
    if (l.lastCountedAt && (!s.last || l.lastCountedAt < s.last)) s.last = l.lastCountedAt;
    stats.set(l.locationId, s);
  }
  return render(
    c,
    { title: "Count stock", active: "count" },
    <>
      <H1
        sub={`Pick a ${settings.locationWord.toLowerCase()} and enter what you can see. Counts fix the numbers and are saved in the activity log.`}
      >
        Count stock
      </H1>
      {lists.locations.length === 0 ? (
        <Empty>No places yet.</Empty>
      ) : (
        <ul class="grid gap-3 sm:grid-cols-2">
          {lists.locations.map((l) => {
            const s = stats.get(l.id);
            return (
              <li>
                <a
                  href={`/count/${l.id}`}
                  class="block rounded-2xl border border-line bg-white p-4 shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-200"
                >
                  <span class="block font-semibold text-navy">{placePath(l, lists.locations)}</span>
                  <span class="mt-1 block text-sm text-gray-700">
                    {s ? `${s.n} item${s.n === 1 ? "" : "s"}. ` : "No items yet. "}
                    {s?.last ? `Oldest count ${formatWhen(s.last, region)}.` : s ? "Not counted yet." : ""}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>,
  );
});

recordRoutes.get("/count/:id", requirePermission("stock:count"), async (c) => countPage(c));

async function countPage(c: Context<AppEnv>, error?: string, status: 200 | 400 = 200) {
  const parsed = idSchema.safeParse(c.req.param("id"));
  if (!parsed.success) return c.notFound();
  const db = c.get("db");
  const loc = await getLocation(db, parsed.data);
  if (!loc || loc.archived) return c.notFound();
  const region = c.get("region");
  const q = c.req.query();
  const blind = q.blind === "1";
  const levels = await listLevels(db, { locationId: loc.id });
  const focus = uuidOrUndef(q.item);
  if (focus) levels.sort((a, b) => (a.itemId === focus ? -1 : b.itemId === focus ? 1 : 0));
  const lists = await pickLists(c);
  const here = new Set(levels.map((l) => l.itemId));
  const others = lists.itemOpts.filter((o) => !here.has(o.value));
  const done = q.m === "saved" ? { n: Number(q.n ?? 0), d: Number(q.d ?? 0) } : null;
  return render(
    c,
    { title: `Count ${loc.name}`, active: "count", status },
    <>
      <H1 sub="Enter what you count. Leave a box empty to skip that item.">Count: {loc.name}</H1>
      {done ? (
        <Alert tone="success">
          Saved {done.n} count{done.n === 1 ? "" : "s"}.{" "}
          {done.d === 0
            ? "Everything matched."
            : `${done.d} did not match and ${done.d === 1 ? "was" : "were"} corrected.`}
        </Alert>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <p class="mb-4 text-sm">
        {blind ? (
          <a class="text-primary underline" href={`/count/${loc.id}`}>
            Show the expected numbers
          </a>
        ) : (
          <a class="text-primary underline" href={`/count/${loc.id}?blind=1`}>
            Hide the expected numbers (blind count, more accurate)
          </a>
        )}
      </p>
      <form method="post" action={`/count/${loc.id}`} data-enhance>
        <Csrf token={c.get("csrfToken")} />
        {levels.length === 0 ? (
          <Empty>No items are kept here yet. Add one below.</Empty>
        ) : (
          <Card>
            <ul class="divide-y divide-line">
              {levels.map((l, i) => (
                <li
                  class={`grid grid-cols-[1fr_8rem] items-center gap-3 py-3 ${l.itemId === focus ? "rounded-lg bg-alert-50 px-2" : ""}`}
                >
                  <div>
                    <label for={`count-${i}`} class="font-semibold">
                      {l.itemName}
                    </label>
                    <p class="text-sm text-gray-700" id={`count-${i}-hint`}>
                      {blind ? `Count in ${l.unit}.` : `Expected ${formatQty(l.onHand, l.unit)}.`}
                      {l.lastCountedAt ? ` Last counted ${formatWhen(l.lastCountedAt, region)}.` : " Never counted."}
                    </p>
                  </div>
                  <div>
                    <input type="hidden" name="itemId" value={l.itemId} />
                    <input
                      id={`count-${i}`}
                      name="counted"
                      type="text"
                      inputmode="decimal"
                      autocomplete="off"
                      aria-describedby={`count-${i}-hint`}
                      class="block w-full rounded-xl border border-gray-400 bg-white px-3 py-3 text-right text-base tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-200"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {others.length > 0 ? (
          <Card class="mt-4" label="Count an item not listed">
            <H2>Found something not listed?</H2>
            <div class="grid gap-x-3 sm:grid-cols-[1fr_8rem]">
              <Select label="Item" name="itemId" id="extra-item" options={others} placeholder="Pick an item" />
              <QtyField label="Counted" name="counted" id="extra-counted" bare />
            </div>
          </Card>
        ) : null}
        <TextArea label="Note" name="note" maxlength={300} rows={2} hint="For example: end of month stocktake." />
        <Button full>Save counts</Button>
      </form>
    </>,
  );
}

recordRoutes.post("/count/:id", requirePermission("stock:count"), async (c) => {
  const parsed = idSchema.safeParse(c.req.param("id"));
  if (!parsed.success) return c.notFound();
  const body = await formBody(c);
  const ids = formList(body, "itemId");
  const counts = formList(body, "counted");
  const lines: { itemId: string; counted: number }[] = [];
  for (let i = 0; i < ids.length; i++) {
    const raw = (counts[i] ?? "").trim().replace(/,/g, "");
    const itemId = ids[i] ?? "";
    if (raw === "" || itemId === "") continue;
    if (!idSchema.safeParse(itemId).success) return countPage(c, "Pick an item from the list.", 400);
    if (!/^\d{1,9}(\.\d{1,4})?$/.test(raw))
      return countPage(c, `"${raw.slice(0, 20)}" is not a count. Enter a number of 0 or more.`, 400);
    lines.push({ itemId, counted: roundQty(Number(raw)) });
  }
  const note = (formValues(body).note ?? "").trim().slice(0, 300);
  const res = await countStock(c.get("db"), c.get("user")!, parsed.data, lines, note);
  if (!res.ok) return countPage(c, res.message, 400);
  return c.redirect(`/count/${parsed.data}?m=saved&n=${res.value?.counted ?? 0}&d=${res.value?.changed ?? 0}`, 303);
});
