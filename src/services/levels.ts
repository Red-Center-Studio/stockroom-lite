import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import type { LocationKind } from "../db/schema";

/**
 * Stock levels and their status. An item at a place is "out" when nothing is left, "low" at or below its reorder
 * point, and "OK" above it. Without a reorder point it shows as "No level set".
 */

export type StockStatus = "out" | "low" | "ok" | "untracked";

export const statusLabel: Record<StockStatus, string> = {
  out: "Out of stock",
  low: "Low",
  ok: "OK",
  untracked: "No level set",
};

export interface LevelView {
  levelId: string;
  itemId: string;
  itemName: string;
  sku: string;
  category: string;
  unit: string;
  unitCost: number | null;
  supplier: string;
  supplierCode: string;
  locationId: string;
  locationName: string;
  locationKind: LocationKind;
  onHand: number;
  minQty: number | null;
  parQty: number | null;
  lastCountedAt: string | null;
  status: StockStatus;
  /** Stock on hand at the latest unit cost, or null without a cost. */
  value: number | null;
}

export function statusOf(row: Pick<LevelView, "onHand" | "minQty" | "parQty">): StockStatus {
  if (row.minQty === null && row.parQty === null) return "untracked";
  if (row.onHand <= 0) return "out";
  if (row.minQty !== null && row.onHand <= row.minQty) return "low";
  return "ok";
}

export interface LevelFilter {
  locationId?: string;
  itemId?: string;
  search?: string;
  category?: string;
}

/** A text column from a raw row, or "" when it is missing. */
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Every stock level for active items at active places, with its status. */
export async function listLevels(db: DB, filter: LevelFilter = {}): Promise<LevelView[]> {
  const where = [sql`i.archived = 0`, sql`l.archived = 0`];
  if (filter.locationId) where.push(sql`sl.location_id = ${filter.locationId}`);
  if (filter.itemId) where.push(sql`sl.item_id = ${filter.itemId}`);
  if (filter.category) where.push(sql`i.category = ${filter.category}`);
  if (filter.search) {
    const like = `%${filter.search.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(sql`(i.name LIKE ${like} ESCAPE '\\' OR i.sku LIKE ${like} ESCAPE '\\')`);
  }
  const rows = await db.all<Record<string, unknown>>(sql`
    SELECT sl.id AS levelId, sl.item_id AS itemId, i.name AS itemName, i.sku AS sku, i.category AS category,
      i.unit AS unit, i.unit_cost AS unitCost, i.supplier AS supplier, i.supplier_code AS supplierCode,
      sl.location_id AS locationId, l.name AS locationName, l.kind AS locationKind,
      sl.on_hand AS onHand, sl.min_qty AS minQty, sl.par_qty AS parQty, sl.last_counted_at AS lastCountedAt
    FROM stock_level sl
    JOIN item i ON i.id = sl.item_id
    JOIN location l ON l.id = sl.location_id
    WHERE ${sql.join(where, sql` AND `)}
    ORDER BY i.name COLLATE NOCASE, l.name COLLATE NOCASE`);

  return rows.map((r) => {
    const onHand = Number(r.onHand ?? 0);
    const minQty = numOrNull(r.minQty);
    const parQty = numOrNull(r.parQty);
    const unitCost = numOrNull(r.unitCost);
    return {
      levelId: String(r.levelId),
      itemId: String(r.itemId),
      itemName: String(r.itemName),
      sku: str(r.sku),
      category: str(r.category),
      unit: str(r.unit),
      unitCost,
      supplier: str(r.supplier),
      supplierCode: str(r.supplierCode),
      locationId: String(r.locationId),
      locationName: String(r.locationName),
      locationKind: r.locationKind as LocationKind,
      onHand,
      minQty,
      parQty,
      lastCountedAt: (r.lastCountedAt as string | null) ?? null,
      status: statusOf({ onHand, minQty, parQty }),
      value: unitCost !== null && onHand > 0 ? Math.round(unitCost * onHand * 100) / 100 : null,
    };
  });
}

export const needsAttention = (l: Pick<LevelView, "status">) => l.status === "out" || l.status === "low";

const STATUS_ORDER: Record<StockStatus, number> = { out: 0, low: 1, ok: 2, untracked: 3 };
export const byUrgency = (a: LevelView, b: LevelView) =>
  STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.itemName.localeCompare(b.itemName);

/** How much to order to top back up to the target level (or twice the reorder point without one). */
export function topUpQty(l: Pick<LevelView, "onHand" | "minQty" | "parQty">): number {
  const target = l.parQty ?? (l.minQty !== null ? l.minQty * 2 : 0);
  const need = target - Math.max(0, l.onHand);
  return need > 0 ? Math.round(need * 1000) / 1000 : 0;
}

export interface Summary {
  out: number;
  low: number;
  value: number;
  items: number;
  locations: number;
}

export function summarise(levels: LevelView[]): Summary {
  return {
    out: levels.filter((l) => l.status === "out").length,
    low: levels.filter((l) => l.status === "low").length,
    value: Math.round(levels.reduce((s, l) => s + (l.value ?? 0), 0) * 100) / 100,
    items: new Set(levels.map((l) => l.itemId)).size,
    locations: new Set(levels.map((l) => l.locationId)).size,
  };
}
