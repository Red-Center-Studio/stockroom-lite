import { and, asc, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import type { DB } from "../db/client";
import {
  item,
  location,
  movement,
  stockLevel,
  user,
  type Item,
  type Location,
  type LocationKind,
  type MovementType,
} from "../db/schema";
import type { AppUser } from "../env";
import { can } from "../lib/can";
import { denied, type Result } from "./result";

const nowIso = () => new Date().toISOString();

// ---------- Items ----------

export interface ItemInput {
  name: string;
  sku: string;
  category: string;
  unit: string;
  supplier: string;
  supplierCode: string;
  unitCost: number | null;
  notes: string;
}

export async function listItems(db: DB, includeArchived = false): Promise<Item[]> {
  return db
    .select()
    .from(item)
    .where(includeArchived ? undefined : eq(item.archived, false))
    .orderBy(sql`${item.name} COLLATE NOCASE`, asc(item.id))
    .all();
}

export const getItem = (db: DB, id: string) => db.select().from(item).where(eq(item.id, id)).get();

async function skuTaken(db: DB, sku: string, exceptId?: string): Promise<boolean> {
  if (!sku) return false;
  const row = await db
    .select({ id: item.id })
    .from(item)
    .where(exceptId ? and(eq(item.sku, sku), ne(item.id, exceptId)) : eq(item.sku, sku))
    .get();
  return Boolean(row);
}

export async function addItem(db: DB, actor: AppUser, input: ItemInput): Promise<Result<string>> {
  if (!can(actor, "catalog:edit")) return denied("add items");
  if (await skuTaken(db, input.sku)) return { ok: false, message: `Another item already uses the code ${input.sku}.` };
  const id = crypto.randomUUID();
  await db.insert(item).values({ id, ...input });
  return { ok: true, value: id };
}

export async function updateItem(db: DB, actor: AppUser, id: string, input: ItemInput): Promise<Result> {
  if (!can(actor, "catalog:edit")) return denied("change items");
  const existing = await getItem(db, id);
  if (!existing) return { ok: false, message: "That item no longer exists." };
  if (await skuTaken(db, input.sku, id))
    return { ok: false, message: `Another item already uses the code ${input.sku}.` };
  await db
    .update(item)
    .set({ ...input, updatedAt: nowIso() })
    .where(eq(item.id, id));
  return { ok: true };
}

/** Archiving hides an item everywhere but keeps its history. */
export async function setItemArchived(db: DB, actor: AppUser, id: string, archived: boolean): Promise<Result> {
  if (!can(actor, "catalog:edit")) return denied("archive items");
  const res = await db.update(item).set({ archived, updatedAt: nowIso() }).where(eq(item.id, id)).run();
  if (res.meta.changes === 0) return { ok: false, message: "That item no longer exists." };
  return { ok: true };
}

export async function listCategories(db: DB): Promise<string[]> {
  const rows = await db
    .selectDistinct({ c: item.category })
    .from(item)
    .where(and(eq(item.archived, false), ne(item.category, "")))
    .orderBy(sql`${item.category} COLLATE NOCASE`)
    .all();
  return rows.map((r) => r.c);
}

// ---------- Locations ----------

export interface LocationInput {
  name: string;
  kind: LocationKind;
  parentId: string | null;
  notes: string;
}

export async function listLocations(db: DB, includeArchived = false): Promise<Location[]> {
  return db
    .select()
    .from(location)
    .where(includeArchived ? undefined : eq(location.archived, false))
    .orderBy(sql`${location.name} COLLATE NOCASE`, asc(location.id))
    .all();
}

export const getLocation = (db: DB, id: string) => db.select().from(location).where(eq(location.id, id)).get();

export async function addLocation(db: DB, actor: AppUser, input: LocationInput): Promise<Result<string>> {
  if (!can(actor, "catalog:edit")) return denied("add places");
  if (input.parentId && !(await getLocation(db, input.parentId))) {
    return { ok: false, message: "The place it sits inside no longer exists." };
  }
  const id = crypto.randomUUID();
  await db.insert(location).values({ id, ...input });
  return { ok: true, value: id };
}

export async function updateLocation(db: DB, actor: AppUser, id: string, input: LocationInput): Promise<Result> {
  if (!can(actor, "catalog:edit")) return denied("change places");
  if (!(await getLocation(db, id))) return { ok: false, message: "That place no longer exists." };
  if (input.parentId) {
    // Walk up from the chosen parent: if we reach this place, the change would make a loop.
    let cursor: string | null = input.parentId;
    for (let i = 0; cursor && i < 20; i++) {
      if (cursor === id) return { ok: false, message: "A place cannot sit inside itself." };
      const parent: Location | undefined = await getLocation(db, cursor);
      if (!parent) return { ok: false, message: "The place it sits inside no longer exists." };
      cursor = parent.parentId;
    }
  }
  await db
    .update(location)
    .set({ ...input, updatedAt: nowIso() })
    .where(eq(location.id, id));
  return { ok: true };
}

export async function setLocationArchived(db: DB, actor: AppUser, id: string, archived: boolean): Promise<Result> {
  if (!can(actor, "catalog:edit")) return denied("archive places");
  const res = await db.update(location).set({ archived, updatedAt: nowIso() }).where(eq(location.id, id)).run();
  if (res.meta.changes === 0) return { ok: false, message: "That place no longer exists." };
  return { ok: true };
}

// ---------- Levels ----------

export interface LevelInput {
  itemId: string;
  locationId: string;
  minQty: number | null;
  parQty: number | null;
}

/** Sets the reorder point and target for an item at a place, creating the stock level if needed. */
export async function setLevel(db: DB, actor: AppUser, input: LevelInput): Promise<Result> {
  if (!can(actor, "catalog:edit")) return denied("change stock levels");
  if (input.minQty !== null && input.parQty !== null && input.parQty < input.minQty) {
    return { ok: false, message: "The target level must be the same as the reorder point or higher." };
  }
  const [it, loc] = await Promise.all([getItem(db, input.itemId), getLocation(db, input.locationId)]);
  if (!it || !loc) return { ok: false, message: "That item or place no longer exists." };
  await db
    .insert(stockLevel)
    .values({ id: crypto.randomUUID(), itemId: it.id, locationId: loc.id, minQty: input.minQty, parQty: input.parQty })
    .onConflictDoUpdate({
      target: [stockLevel.itemId, stockLevel.locationId],
      set: { minQty: input.minQty, parQty: input.parQty, updatedAt: nowIso() },
    });
  return { ok: true };
}

/** Stops tracking an item at a place. Only allowed when none is on hand, so stock never disappears silently. */
export async function removeLevel(db: DB, actor: AppUser, levelId: string): Promise<Result> {
  if (!can(actor, "catalog:edit")) return denied("change stock levels");
  const level = await db.select().from(stockLevel).where(eq(stockLevel.id, levelId)).get();
  if (!level) return { ok: true };
  if (Math.abs(level.onHand) > 0.0005) {
    return { ok: false, message: "There is still stock here. Move it, use it or count it to zero first." };
  }
  await db.delete(stockLevel).where(eq(stockLevel.id, levelId));
  return { ok: true };
}

// ---------- Activity ----------

export interface ActivityFilter {
  itemId?: string;
  locationId?: string;
  type?: MovementType;
  userId?: string;
  /** Matches the reference or note: a job number, event or invoice. */
  text?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface ActivityRow {
  id: string;
  type: MovementType;
  qtyDelta: number;
  balanceAfter: number;
  unitCost: number | null;
  reference: string;
  note: string;
  occurredAt: string;
  itemId: string;
  itemName: string;
  unit: string;
  locationId: string;
  locationName: string;
  userName: string | null;
}

export async function listActivity(db: DB, f: ActivityFilter = {}): Promise<ActivityRow[]> {
  const where: SQL[] = [];
  if (f.itemId) where.push(eq(movement.itemId, f.itemId));
  if (f.locationId) where.push(eq(movement.locationId, f.locationId));
  if (f.type) where.push(eq(movement.type, f.type));
  if (f.userId) where.push(eq(movement.userId, f.userId));
  if (f.text) {
    const like = `%${f.text.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(sql`(${movement.reference} LIKE ${like} ESCAPE '\\' OR ${movement.note} LIKE ${like} ESCAPE '\\')`);
  }
  if (f.from) where.push(sql`${movement.occurredAt} >= ${f.from}`);
  if (f.to) where.push(sql`${movement.occurredAt} < ${f.to}`);
  return db
    .select({
      id: movement.id,
      type: movement.type,
      qtyDelta: movement.qtyDelta,
      balanceAfter: movement.balanceAfter,
      unitCost: movement.unitCost,
      reference: movement.reference,
      note: movement.note,
      occurredAt: movement.occurredAt,
      itemId: movement.itemId,
      itemName: item.name,
      unit: item.unit,
      locationId: movement.locationId,
      locationName: location.name,
      userName: user.name,
    })
    .from(movement)
    .innerJoin(item, eq(item.id, movement.itemId))
    .innerJoin(location, eq(location.id, movement.locationId))
    .leftJoin(user, eq(user.id, movement.userId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(movement.occurredAt), desc(movement.createdAt))
    .limit(Math.min(f.limit ?? 100, 10_000))
    .offset(f.offset ?? 0)
    .all();
}
