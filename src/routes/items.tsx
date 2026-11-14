import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import type { Item } from "../db/schema";
import { can } from "../lib/can";
import { requirePermission } from "../lib/middleware";
import { formatMoney, formatQty, formatWhen } from "../lib/region";
import { firstError, formValues, id as idSchema, itemSchema, levelSchema } from "../lib/validate";
import { CATEGORY_SUGGESTIONS, movementLabel, UNITS } from "../labels";
import {
  addItem,
  getItem,
  listActivity,
  listCategories,
  listItems,
  removeLevel,
  setItemArchived,
  setLevel,
  updateItem,
  type ItemInput,
} from "../services/catalog";
import { listLevels } from "../services/levels";
import {
  Alert,
  btn,
  Button,
  Card,
  Csrf,
  Empty,
  Field,
  H1,
  H2,
  QtyField,
  Select,
  StatusBadge,
  Table,
  Td,
  TextArea,
  Th,
} from "../views/components";
import { flash, formBody, render } from "./render";
import { LevelBar, pickLists } from "./shared";

export const itemRoutes = new Hono<AppEnv>();

// ---------- List ----------

itemRoutes.get("/items", requirePermission("stock:view"), async (c) => {
  const db = c.get("db");
  const user = c.get("user")!;
  const showArchived = c.req.query("archived") === "1";
  const search = (c.req.query("q") ?? "").trim().toLowerCase().slice(0, 80);
  const [items, levels] = await Promise.all([listItems(db, showArchived), listLevels(db)]);
  const totals = new Map<string, { onHand: number; places: number; worst: number }>();
  const rank = { out: 0, low: 1, ok: 2, untracked: 3 } as const;
  for (const l of levels) {
    const t = totals.get(l.itemId) ?? { onHand: 0, places: 0, worst: 3 };
    t.onHand += l.onHand;
    t.places++;
    t.worst = Math.min(t.worst, rank[l.status]);
    totals.set(l.itemId, t);
  }
  const shown = items.filter(
    (i) =>
      (showArchived ? i.archived : !i.archived) &&
      (!search || i.name.toLowerCase().includes(search) || i.sku.toLowerCase().includes(search)),
  );
  const statusOf = (n: number) => (["out", "low", "ok", "untracked"] as const)[n] ?? "untracked";
  const msg = flash(c, { archived: "Item archived. Its history is kept.", restored: "Item restored." });
  return render(
    c,
    { title: "Items", active: "items" },
    <>
      <H1
        sub="Everything you keep in stock."
        action={
          can(user, "catalog:edit") ? (
            <a class={btn("accent")} href="/items/new">
              Add item
            </a>
          ) : undefined
        }
      >
        Items
      </H1>
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      <form method="get" action="/items" class="mb-4 flex flex-wrap items-end gap-2" role="search">
        <div class="min-w-0 flex-1">
          <label for="item-search" class="mb-1 block text-sm font-medium">
            Search items
          </label>
          <input
            id="item-search"
            name="q"
            type="search"
            value={search}
            placeholder="Name or code"
            class="block w-full rounded-xl border border-gray-500 bg-white px-3 py-3 text-base"
          />
        </div>
        <button type="submit" class={btn("primary")}>
          Search
        </button>
      </form>
      {shown.length === 0 ? (
        <Empty>{items.length === 0 ? "No items yet." : "No items match."}</Empty>
      ) : (
        <Card>
          <Table caption={`${shown.length} items`} captionHidden>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th class="text-right">Total on hand</Th>
                <Th>Places</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const t = totals.get(i.id);
                return (
                  <tr>
                    <Td>
                      <a
                        class="tap font-semibold text-primary underline-offset-2 hover:underline"
                        href={`/items/${i.id}`}
                      >
                        {i.name}
                      </a>
                      {i.sku ? <span class="block text-xs text-gray-700">{i.sku}</span> : null}
                    </Td>
                    <Td>{i.category}</Td>
                    <Td class="text-right tabular-nums">{formatQty(t?.onHand ?? 0, i.unit)}</Td>
                    <Td>{t?.places ?? 0}</Td>
                    <Td>
                      {t ? (
                        <StatusBadge status={statusOf(t.worst)} />
                      ) : (
                        <span class="text-sm text-gray-700">Not kept anywhere</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
      <p class="mt-4 text-sm">
        <a class="tap text-primary underline" href={showArchived ? "/items" : "/items?archived=1"}>
          {showArchived ? "Show current items" : "Show archived items"}
        </a>
      </p>
    </>,
  );
});

// ---------- Add and edit ----------

async function itemForm(
  c: Context<AppEnv>,
  opts: { item?: Item; values?: Record<string, string>; error?: string; status?: 200 | 400 },
) {
  const settings = c.get("settings");
  const region = c.get("region");
  const it = opts.item;
  const v = opts.values ?? {};
  const val = (k: keyof Item, fallback = "") =>
    v[k] ?? (it ? (it[k] === null || it[k] === undefined ? "" : String(it[k])) : fallback);
  const categories = [...new Set([...(await listCategories(c.get("db"))), ...CATEGORY_SUGGESTIONS])];
  const units = UNITS[settings.unitSystem];
  const lists = it ? null : await pickLists(c);
  return render(
    c,
    { title: it ? `Edit ${it.name}` : "Add an item", active: "items", status: opts.status ?? 200 },
    <>
      <H1>{it ? `Edit ${it.name}` : "Add an item"}</H1>
      {opts.error ? <Alert tone="error">{opts.error}</Alert> : null}
      <Card class="mx-auto max-w-2xl">
        <form method="post" action={it ? `/items/${it.id}/edit` : "/items/new"} data-enhance>
          <Csrf token={c.get("csrfToken")} />
          <Field
            label="Name"
            name="name"
            value={val("name")}
            required
            maxlength={120}
            hint="As people say it, for example: Nitrile gloves, medium."
          />
          <div class="grid gap-x-4 sm:grid-cols-2">
            <Field label="Your code (SKU)" name="sku" value={val("sku")} maxlength={60} />
            <Field label="Category" name="category" value={val("category")} maxlength={60} list="categories" />
            <Field
              label="Unit"
              name="unit"
              value={val("unit", units[0])}
              required
              maxlength={20}
              list="units"
              hint="What you count it in: each, box, kg, L, m. Pick or type your own."
            />
            <QtyField
              label={`Unit cost (${region.currency})`}
              name="unitCost"
              value={val("unitCost")}
              hint="Updated each time a delivery is received with a cost."
            />
            <Field label="Supplier" name="supplier" value={val("supplier")} maxlength={100} />
            <Field label="Supplier's code" name="supplierCode" value={val("supplierCode")} maxlength={60} />
          </div>
          <datalist id="categories">
            {categories.map((x) => (
              <option value={x} />
            ))}
          </datalist>
          <datalist id="units">
            {units.map((u) => (
              <option value={u} />
            ))}
          </datalist>
          <TextArea label="Notes" name="notes" value={val("notes")} maxlength={1000} rows={2} />
          {lists && lists.locationOpts.length > 0 ? (
            <fieldset class="mb-4 rounded-xl border border-line p-3">
              <legend class="px-1 text-sm font-semibold">Where it is kept (optional)</legend>
              <div class="grid gap-x-3 sm:grid-cols-3">
                <Select
                  label={settings.locationWord}
                  name="locationId"
                  options={lists.locationOpts}
                  value={v.locationId}
                  placeholder="Choose later"
                  class="mb-3 sm:col-span-3"
                />
                <QtyField label="Reorder at" name="minQty" value={v.minQty} bare class="mb-3" />
                <QtyField label="Top up to" name="parQty" value={v.parQty} bare class="mb-3" />
              </div>
              <p class="text-sm text-gray-700">Count or receive stock to set how much is there now.</p>
            </fieldset>
          ) : null}
          <div class="flex flex-wrap gap-2">
            <Button>{it ? "Save changes" : "Add item"}</Button>
            <a class={btn("ghost")} href={it ? `/items/${it.id}` : "/items"}>
              Cancel
            </a>
          </div>
        </form>
      </Card>
    </>,
  );
}

const toInput = (d: ReturnType<typeof itemSchema.parse>): ItemInput => ({ ...d });

itemRoutes.get("/items/new", requirePermission("catalog:edit"), (c) => itemForm(c, {}));

itemRoutes.post("/items/new", requirePermission("catalog:edit"), async (c) => {
  const values = formValues(await formBody(c));
  const parsed = itemSchema.safeParse(values);
  if (!parsed.success) return itemForm(c, { values, error: firstError(parsed.error), status: 400 });
  const db = c.get("db");
  const user = c.get("user")!;
  if (values.locationId) {
    const lvl = levelSchema.safeParse({ itemId: crypto.randomUUID(), ...values });
    if (!lvl.success) return itemForm(c, { values, error: firstError(lvl.error), status: 400 });
  }
  const res = await addItem(db, user, toInput(parsed.data));
  if (!res.ok) return itemForm(c, { values, error: res.message, status: 400 });
  if (values.locationId) {
    const lvl = levelSchema.parse({ itemId: res.value!, ...values });
    await setLevel(db, user, lvl);
  }
  return c.redirect(`/items/${res.value}?m=added`, 303);
});

async function loadItem(c: Context<AppEnv>) {
  const parsed = idSchema.safeParse(c.req.param("id"));
  if (!parsed.success) return null;
  return (await getItem(c.get("db"), parsed.data)) ?? null;
}

itemRoutes.get("/items/:id/edit", requirePermission("catalog:edit"), async (c) => {
  const it = await loadItem(c);
  if (!it) return c.notFound();
  return itemForm(c, { item: it });
});

itemRoutes.post("/items/:id/edit", requirePermission("catalog:edit"), async (c) => {
  const it = await loadItem(c);
  if (!it) return c.notFound();
  const values = formValues(await formBody(c));
  const parsed = itemSchema.safeParse(values);
  if (!parsed.success) return itemForm(c, { item: it, values, error: firstError(parsed.error), status: 400 });
  const res = await updateItem(c.get("db"), c.get("user")!, it.id, toInput(parsed.data));
  if (!res.ok) return itemForm(c, { item: it, values, error: res.message, status: 400 });
  return c.redirect(`/items/${it.id}?m=saved`, 303);
});

itemRoutes.post("/items/:id/archive", requirePermission("catalog:edit"), async (c) => {
  const it = await loadItem(c);
  if (!it) return c.notFound();
  const restore = formValues(await formBody(c)).restore === "1";
  await setItemArchived(c.get("db"), c.get("user")!, it.id, !restore);
  return c.redirect(restore ? `/items/${it.id}?m=restored` : "/items?m=archived", 303);
});

// ---------- Detail ----------

itemRoutes.get("/items/:id", requirePermission("stock:view"), async (c) => itemPage(c));

async function itemPage(c: Context<AppEnv>, error?: string, status: 200 | 400 = 200) {
  const it = await loadItem(c);
  if (!it) return c.notFound();
  const db = c.get("db");
  const user = c.get("user")!;
  const region = c.get("region");
  const [levels, activity, lists] = await Promise.all([
    listLevels(db, { itemId: it.id }),
    listActivity(db, { itemId: it.id, limit: 15 }),
    pickLists(c),
  ]);
  const total = levels.reduce((s, l) => s + l.onHand, 0);
  const edit = can(user, "catalog:edit");
  const showCost = can(user, "cost:view");
  const unused = lists.locationOpts.filter((o) => !levels.some((l) => l.locationId === o.value));
  const msg = flash(c, {
    added: "Item added. Count or receive it to set how much you have.",
    saved: "Changes saved.",
    level: "Levels saved.",
    removed: "No longer tracked at that place.",
    restored: "Item restored.",
  });
  return render(
    c,
    { title: it.name, active: "items", status },
    <>
      <H1
        sub={[it.sku, it.category, `${formatQty(total, it.unit)} on hand in total`].filter(Boolean).join(". ")}
        action={
          <>
            <a class={btn("accent")} href={`/record?item=${it.id}`}>
              Record
            </a>
            {edit ? (
              <a
                class={btn("secondary", "border-white/40 bg-white/10 text-white hover:bg-white/20")}
                href={`/items/${it.id}/edit`}
              >
                Edit
              </a>
            ) : null}
          </>
        }
      >
        {it.name}
        {it.archived ? " (archived)" : ""}
      </H1>
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card class="mb-5" label="Stock by place">
        <H2>Stock by place</H2>
        {levels.length === 0 ? (
          <p class="text-gray-700">Not kept anywhere yet. Add a place below, or receive or count it somewhere.</p>
        ) : (
          <ul class="divide-y divide-line">
            {levels.map((l) => (
              <li class="py-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <a
                      class="tap font-semibold text-primary underline-offset-2 hover:underline"
                      href={`/locations/${l.locationId}`}
                    >
                      {l.locationName}
                    </a>
                    <p class="text-sm text-gray-700">
                      {formatQty(l.onHand, l.unit)} on hand.
                      {l.lastCountedAt ? ` Last counted ${formatWhen(l.lastCountedAt, region)}.` : " Never counted."}
                    </p>
                    <LevelBar l={l} />
                  </div>
                  <StatusBadge status={l.status} />
                </div>
                {edit ? (
                  <form
                    method="post"
                    action={`/items/${it.id}/level`}
                    class="mt-3 flex flex-wrap items-end gap-2"
                    data-enhance
                  >
                    <Csrf token={c.get("csrfToken")} />
                    <input type="hidden" name="locationId" value={l.locationId} />
                    <QtyField
                      label="Reorder at"
                      name="minQty"
                      id={`min-${l.levelId}`}
                      value={l.minQty}
                      bare
                      class="w-32"
                    />
                    <QtyField
                      label="Top up to"
                      name="parQty"
                      id={`par-${l.levelId}`}
                      value={l.parQty}
                      bare
                      class="w-32"
                    />
                    <Button kind="secondary">Save levels</Button>
                  </form>
                ) : null}
                {edit && Math.abs(l.onHand) < 0.0005 ? (
                  <form method="post" action={`/levels/${l.levelId}/remove`} class="mt-2">
                    <Csrf token={c.get("csrfToken")} />
                    <input type="hidden" name="itemId" value={it.id} />
                    <Button kind="ghost" confirm={`Stop tracking ${it.name} at ${l.locationName}?`}>
                      Stop tracking here
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {edit && unused.length > 0 ? (
          <form
            method="post"
            action={`/items/${it.id}/level`}
            class="mt-4 grid gap-x-3 rounded-xl bg-gray-50 p-3 sm:grid-cols-4"
            data-enhance
          >
            <Csrf token={c.get("csrfToken")} />
            <Select
              label="Also keep it at"
              name="locationId"
              id="new-level-place"
              options={unused}
              placeholder="Pick a place"
              class="mb-3 sm:col-span-2"
            />
            <QtyField label="Reorder at" name="minQty" id="new-level-min" bare class="mb-3" />
            <QtyField label="Top up to" name="parQty" id="new-level-par" bare class="mb-3" />
            <div class="sm:col-span-4">
              <Button kind="secondary">Add place</Button>
            </div>
          </form>
        ) : null}
      </Card>

      <div class="grid gap-5 lg:grid-cols-2">
        <Card label="Details">
          <H2>Details</H2>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt class="font-medium">Unit</dt>
            <dd>{it.unit}</dd>
            {showCost ? (
              <>
                <dt class="font-medium">Unit cost</dt>
                <dd>{it.unitCost !== null ? formatMoney(it.unitCost, region) : "Not set"}</dd>
              </>
            ) : null}
            <dt class="font-medium">Supplier</dt>
            <dd>
              {it.supplier || "Not set"}
              {it.supplierCode ? ` (${it.supplierCode})` : ""}
            </dd>
          </dl>
          {it.notes ? <p class="mt-3 whitespace-pre-line text-sm">{it.notes}</p> : null}
          <p class="mt-4 flex flex-wrap gap-2">
            {edit ? (
              <form method="post" action={`/items/${it.id}/archive`}>
                <Csrf token={c.get("csrfToken")} />
                {it.archived ? <input type="hidden" name="restore" value="1" /> : null}
                <Button
                  kind={it.archived ? "secondary" : "danger"}
                  confirm={
                    it.archived ? undefined : `Archive ${it.name}? It disappears from lists, but its history is kept.`
                  }
                >
                  {it.archived ? "Restore item" : "Archive item"}
                </Button>
              </form>
            ) : null}
          </p>
        </Card>
        <Card label="Recent activity">
          <H2>Recent activity</H2>
          {activity.length === 0 ? (
            <p class="text-gray-700">Nothing recorded yet.</p>
          ) : (
            <ul class="divide-y divide-line text-sm">
              {activity.map((a) => (
                <li class="flex flex-wrap justify-between gap-x-3 py-1.5">
                  <span>
                    <strong>{movementLabel[a.type]}</strong> {formatQty(Math.abs(a.qtyDelta), a.unit)}, {a.locationName}
                    {a.reference ? `, ${a.reference}` : ""}
                  </span>
                  <span class="text-gray-700">{formatWhen(a.occurredAt, region)}</span>
                </li>
              ))}
            </ul>
          )}
          <p class="mt-3">
            <a class="tap text-primary underline" href={`/activity?item=${it.id}`}>
              All activity for this item
            </a>
          </p>
        </Card>
      </div>
    </>,
  );
}

itemRoutes.post("/items/:id/level", requirePermission("catalog:edit"), async (c) => {
  const it = await loadItem(c);
  if (!it) return c.notFound();
  const values = formValues(await formBody(c));
  const parsed = levelSchema.safeParse({ ...values, itemId: it.id });
  if (!parsed.success) return itemPage(c, firstError(parsed.error), 400);
  const res = await setLevel(c.get("db"), c.get("user")!, parsed.data);
  if (!res.ok) return itemPage(c, res.message, 400);
  return c.redirect(`/items/${it.id}?m=level`, 303);
});

itemRoutes.post("/levels/:id/remove", requirePermission("catalog:edit"), async (c) => {
  const parsed = idSchema.safeParse(c.req.param("id"));
  if (!parsed.success) return c.notFound();
  const itemId = formValues(await formBody(c)).itemId ?? "";
  const res = await removeLevel(c.get("db"), c.get("user")!, parsed.data);
  const back = idSchema.safeParse(itemId).success ? `/items/${itemId}` : "/items";
  if (!res.ok) return c.redirect(`${back}?m=`, 303);
  return c.redirect(`${back}?m=removed`, 303);
});
