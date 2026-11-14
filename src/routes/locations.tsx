import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { LOCATION_KINDS, type Location } from "../db/schema";
import { can } from "../lib/can";
import { requirePermission } from "../lib/middleware";
import { formatMoney, formatQty, formatWhen } from "../lib/region";
import { firstError, formValues, id as idSchema, locationSchema } from "../lib/validate";
import { locationKindLabel } from "../labels";
import {
  addLocation,
  getLocation,
  listLocations,
  setLocationArchived,
  updateLocation,
  type LocationInput,
} from "../services/catalog";
import { listLevels, needsAttention } from "../services/levels";
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
  Select,
  StatusBadge,
  Table,
  Td,
  TextArea,
  Th,
} from "../views/components";
import { flash, formBody, plural, render } from "./render";
import { LevelBar, locationOptions, placePath } from "./shared";

export const locationRoutes = new Hono<AppEnv>();

locationRoutes.get("/locations", requirePermission("stock:view"), async (c) => {
  const db = c.get("db");
  const settings = c.get("settings");
  const showArchived = c.req.query("archived") === "1";
  const [all, levels] = await Promise.all([listLocations(db, true), listLevels(db)]);
  const shown = all.filter((l) => l.archived === showArchived);
  const word = settings.locationWord;
  const stats = new Map<string, { items: number; attention: number; value: number }>();
  for (const l of levels) {
    const s = stats.get(l.locationId) ?? { items: 0, attention: 0, value: 0 };
    s.items++;
    if (needsAttention(l)) s.attention++;
    s.value += l.value ?? 0;
    stats.set(l.locationId, s);
  }
  const showCost = can(c.get("user"), "cost:view");
  const msg = flash(c, { archived: `${word} archived.`, restored: `${word} restored.` });
  return render(
    c,
    { title: plural(word), active: "locations" },
    <>
      <H1
        sub="Vans, storerooms, shelves, kits: anywhere stock is kept."
        action={
          can(c.get("user"), "catalog:edit") ? (
            <a class={btn("accent")} href="/locations/new">
              Add {word.toLowerCase()}
            </a>
          ) : undefined
        }
      >
        {plural(word)}
      </H1>
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {shown.length === 0 ? (
        <Empty>{showArchived ? "Nothing archived." : `No ${plural(word).toLowerCase()} yet.`}</Empty>
      ) : (
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown
            .map((l) => ({ l, path: placePath(l, all) }))
            .sort((a, b) => a.path.localeCompare(b.path))
            .map(({ l, path }) => {
              const s = stats.get(l.id);
              return (
                <li>
                  <a
                    href={`/locations/${l.id}`}
                    class="block h-full rounded-2xl border border-line bg-white p-4 shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    <span class="block font-semibold text-brand">{path}</span>
                    <span class="block text-sm text-gray-700">{locationKindLabel[l.kind]}</span>
                    <span class="mt-2 block text-sm">
                      {s ? `${s.items} item${s.items === 1 ? "" : "s"}` : "No items"}
                      {s && s.attention ? (
                        <span class="font-semibold text-danger">, {s.attention} need attention</span>
                      ) : null}
                      {showCost && s && s.value ? `, ${formatMoney(s.value, c.get("region"))}` : ""}
                    </span>
                  </a>
                </li>
              );
            })}
        </ul>
      )}
      <p class="mt-4 text-sm">
        <a class="tap text-primary underline" href={showArchived ? "/locations" : "/locations?archived=1"}>
          {showArchived ? "Show current" : "Show archived"}
        </a>
      </p>
    </>,
  );
});

async function locationForm(
  c: Context<AppEnv>,
  opts: { loc?: Location; values?: Record<string, string>; error?: string; status?: 200 | 400 },
) {
  const word = c.get("settings").locationWord;
  const all = await listLocations(c.get("db"));
  const loc = opts.loc;
  const v = opts.values ?? {};
  const parents = locationOptions(all.filter((l) => l.id !== loc?.id));
  return render(
    c,
    {
      title: loc ? `Edit ${loc.name}` : `Add a ${word.toLowerCase()}`,
      active: "locations",
      status: opts.status ?? 200,
    },
    <>
      <H1>{loc ? `Edit ${loc.name}` : `Add a ${word.toLowerCase()}`}</H1>
      {opts.error ? <Alert tone="error">{opts.error}</Alert> : null}
      <Card class="mx-auto max-w-xl">
        <form method="post" action={loc ? `/locations/${loc.id}/edit` : "/locations/new"} data-enhance>
          <Csrf token={c.get("csrfToken")} />
          <Field
            label="Name"
            name="name"
            value={v.name ?? loc?.name}
            required
            maxlength={80}
            hint="For example: Van 3, Back room, Shelf B2, Events kit."
          />
          <Select
            label="Kind"
            name="kind"
            options={LOCATION_KINDS.map((k) => ({ value: k, label: locationKindLabel[k] }))}
            value={v.kind ?? loc?.kind ?? "storeroom"}
            required
          />
          <Select
            label="Sits inside"
            name="parentId"
            options={parents}
            value={v.parentId ?? loc?.parentId ?? ""}
            placeholder="Nothing (top level)"
            hint="For a shelf in a storeroom or a drawer in a van."
          />
          <TextArea
            label="Notes"
            name="notes"
            value={v.notes ?? loc?.notes}
            maxlength={1000}
            rows={2}
            hint="Address, access code location, who looks after it."
          />
          <div class="flex gap-2">
            <Button>{loc ? "Save changes" : `Add ${word.toLowerCase()}`}</Button>
            <a class={btn("ghost")} href={loc ? `/locations/${loc.id}` : "/locations"}>
              Cancel
            </a>
          </div>
        </form>
      </Card>
    </>,
  );
}

const toInput = (d: ReturnType<typeof locationSchema.parse>): LocationInput => ({ ...d });

locationRoutes.get("/locations/new", requirePermission("catalog:edit"), (c) => locationForm(c, {}));

locationRoutes.post("/locations/new", requirePermission("catalog:edit"), async (c) => {
  const values = formValues(await formBody(c));
  const parsed = locationSchema.safeParse(values);
  if (!parsed.success) return locationForm(c, { values, error: firstError(parsed.error), status: 400 });
  const res = await addLocation(c.get("db"), c.get("user")!, toInput(parsed.data));
  if (!res.ok) return locationForm(c, { values, error: res.message, status: 400 });
  return c.redirect(`/locations/${res.value}?m=added`, 303);
});

async function loadLocation(c: Context<AppEnv>) {
  const parsed = idSchema.safeParse(c.req.param("id"));
  if (!parsed.success) return null;
  return (await getLocation(c.get("db"), parsed.data)) ?? null;
}

locationRoutes.get("/locations/:id/edit", requirePermission("catalog:edit"), async (c) => {
  const loc = await loadLocation(c);
  if (!loc) return c.notFound();
  return locationForm(c, { loc });
});

locationRoutes.post("/locations/:id/edit", requirePermission("catalog:edit"), async (c) => {
  const loc = await loadLocation(c);
  if (!loc) return c.notFound();
  const values = formValues(await formBody(c));
  const parsed = locationSchema.safeParse(values);
  if (!parsed.success) return locationForm(c, { loc, values, error: firstError(parsed.error), status: 400 });
  const res = await updateLocation(c.get("db"), c.get("user")!, loc.id, toInput(parsed.data));
  if (!res.ok) return locationForm(c, { loc, values, error: res.message, status: 400 });
  return c.redirect(`/locations/${loc.id}?m=saved`, 303);
});

locationRoutes.post("/locations/:id/archive", requirePermission("catalog:edit"), async (c) => {
  const loc = await loadLocation(c);
  if (!loc) return c.notFound();
  const restore = formValues(await formBody(c)).restore === "1";
  await setLocationArchived(c.get("db"), c.get("user")!, loc.id, !restore);
  return c.redirect(restore ? `/locations/${loc.id}?m=restored` : "/locations?m=archived", 303);
});

locationRoutes.get("/locations/:id", requirePermission("stock:view"), async (c) => {
  const loc = await loadLocation(c);
  if (!loc) return c.notFound();
  const db = c.get("db");
  const user = c.get("user")!;
  const region = c.get("region");
  const [levels, all] = await Promise.all([listLevels(db, { locationId: loc.id }), listLocations(db)]);
  const children = all.filter((l) => l.parentId === loc.id);
  const value = levels.reduce((s, l) => s + (l.value ?? 0), 0);
  const msg = flash(c, {
    added: "Added. Now count what is there.",
    saved: "Changes saved.",
    restored: "Restored.",
  });
  return render(
    c,
    { title: loc.name, active: "locations" },
    <>
      <H1
        sub={`${placePath(loc, all)}. ${locationKindLabel[loc.kind]}.${can(user, "cost:view") && value ? ` Stock value ${formatMoney(value, region)}.` : ""}`}
        action={
          <>
            <a class={btn("accent")} href={`/record?location=${loc.id}`}>
              Record use
            </a>
            <a
              class={btn("secondary", "border-white/40 bg-white/10 text-white hover:bg-white/20")}
              href={`/count/${loc.id}`}
            >
              Count
            </a>
          </>
        }
      >
        {loc.name}
        {loc.archived ? " (archived)" : ""}
      </H1>
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {children.length > 0 ? (
        <p class="mb-4 text-sm">
          Inside:{" "}
          {children.map((ch, i) => (
            <>
              {i > 0 ? ", " : ""}
              <a class="tap text-primary underline" href={`/locations/${ch.id}`}>
                {ch.name}
              </a>
            </>
          ))}
        </p>
      ) : null}
      {levels.length === 0 ? (
        <Empty>
          Nothing kept here yet.{" "}
          <a class="tap text-primary underline" href={`/record?type=receive&location=${loc.id}`}>
            Receive stock
          </a>{" "}
          or{" "}
          <a class="tap text-primary underline" href={`/count/${loc.id}`}>
            count what is here
          </a>
          .
        </Empty>
      ) : (
        <Card>
          <Table caption={`Stock at ${loc.name}`} captionHidden>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th class="text-right">On hand</Th>
                <Th>Reorder at / target</Th>
                <Th>Status</Th>
                <Th>Last counted</Th>
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
                  </Td>
                  <Td class="text-right tabular-nums">
                    {formatQty(l.onHand, l.unit)}
                    <LevelBar l={l} />
                  </Td>
                  <Td class="tabular-nums">
                    {l.minQty === null ? "Not set" : formatQty(l.minQty)} /{" "}
                    {l.parQty === null ? "Not set" : formatQty(l.parQty)}
                  </Td>
                  <Td>
                    <StatusBadge status={l.status} />
                  </Td>
                  <Td>{l.lastCountedAt ? formatWhen(l.lastCountedAt, region) : "Never"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <Card class="mt-5" label="Details">
        <H2>Details</H2>
        {loc.notes ? <p class="mb-3 whitespace-pre-line">{loc.notes}</p> : null}
        <p class="flex flex-wrap gap-2">
          {can(user, "catalog:edit") ? (
            <>
              <a class={btn("secondary")} href={`/locations/${loc.id}/edit`}>
                Edit
              </a>
              <form method="post" action={`/locations/${loc.id}/archive`}>
                <Csrf token={c.get("csrfToken")} />
                {loc.archived ? <input type="hidden" name="restore" value="1" /> : null}
                <Button
                  kind={loc.archived ? "secondary" : "danger"}
                  confirm={
                    loc.archived
                      ? undefined
                      : `Archive ${loc.name}? Its stock disappears from lists, but the history is kept.`
                  }
                >
                  {loc.archived ? "Restore" : "Archive"}
                </Button>
              </form>
            </>
          ) : null}
        </p>
      </Card>
    </>,
  );
});
