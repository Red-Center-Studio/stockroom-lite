import type { Context } from "hono";
import type { FC } from "hono/jsx";
import type { Item, Location } from "../db/schema";
import type { AppEnv } from "../env";
import { ymdInZone } from "../lib/region";
import { listItems, listLocations } from "../services/catalog";
import type { LevelView } from "../services/levels";
import type { Option } from "../views/components";

/** "Main warehouse / First aid cabinet": a place's name with the places it sits inside. */
export function placePath(loc: Location, all: Location[]): string {
  const names = [loc.name];
  let cursor = loc.parentId;
  for (let i = 0; cursor && i < 10; i++) {
    const parent = all.find((l) => l.id === cursor);
    if (!parent) break;
    names.unshift(parent.name);
    cursor = parent.parentId;
  }
  return names.join(" / ");
}

export function locationOptions(all: Location[]): Option[] {
  return all
    .filter((l) => !l.archived)
    .map((l) => ({ value: l.id, label: placePath(l, all) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function itemOptions(items: Item[]): Option[] {
  return items.filter((i) => !i.archived).map((i) => ({ value: i.id, label: i.sku ? `${i.name} (${i.sku})` : i.name }));
}

export async function pickLists(c: Context<AppEnv>) {
  const db = c.get("db");
  const [items, locations] = await Promise.all([listItems(db), listLocations(db)]);
  return { items, locations, itemOpts: itemOptions(items), locationOpts: locationOptions(locations) };
}

export const todayFor = (c: Context<AppEnv>) => ymdInZone(new Date(), c.get("region").timeZone);

/** A small bar showing stock against the target level, with the reorder point marked. Decorative only. */
export const LevelBar: FC<{ l: Pick<LevelView, "onHand" | "minQty" | "parQty" | "status"> }> = ({ l }) => {
  const top = Math.max(l.parQty ?? 0, (l.minQty ?? 0) * 2, l.onHand, 1);
  const pct = Math.max(0, Math.min(100, (l.onHand / top) * 100));
  const minPct = l.minQty !== null ? Math.min(100, (l.minQty / top) * 100) : null;
  const colour = l.status === "out" ? "bg-danger" : l.status === "low" ? "bg-accent" : "bg-success";
  // Classes, not inline styles: the Content Security Policy blocks style attributes.
  return (
    <span class="relative mt-1 block h-2 w-full max-w-40 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
      <span class={`block h-full ${colour} ${WIDTHS[Math.round(pct / 10)]}`}></span>
      {minPct !== null ? (
        <span class={`absolute top-0 h-full w-0.5 bg-ink ${LEFTS[Math.round(minPct / 10)]}`}></span>
      ) : null}
    </span>
  );
};

const WIDTHS = [
  "w-0",
  "w-[10%]",
  "w-[20%]",
  "w-[30%]",
  "w-[40%]",
  "w-[50%]",
  "w-[60%]",
  "w-[70%]",
  "w-[80%]",
  "w-[90%]",
  "w-full",
];
const LEFTS = [
  "left-0",
  "left-[10%]",
  "left-[20%]",
  "left-[30%]",
  "left-[40%]",
  "left-[50%]",
  "left-[60%]",
  "left-[70%]",
  "left-[80%]",
  "left-[90%]",
  "left-[99%]",
];
