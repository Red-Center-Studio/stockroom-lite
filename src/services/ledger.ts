import { and, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { item, location, stockLevel, type Item, type Location, type MovementType } from "../db/schema";
import type { AppUser } from "../env";
import { can } from "../lib/can";
import { formatQty, roundQty } from "../lib/region";
import { denied, type Result } from "./result";

/**
 * The stock ledger. Every change to stock on hand is one D1 batch (a single transaction) that updates the
 * stock level and writes the movement row with the balance after it. Taking stock out is guarded inside the same
 * statement (`on_hand >= qty`), and each following statement only runs when the one before it changed a row
 * (`changes() > 0`), so two people using the last box at the same moment cannot take stock below zero, and a move
 * never arrives without leaving.
 */

/** Small tolerance so 0.1 + 0.2 counts as 0.3 when checking there is enough stock. */
const EPS = 0.0005;

const nowIso = () => new Date().toISOString();

/** The raw D1 database behind Drizzle. The ledger uses plain prepared statements so it can batch them. */
const d1 = (db: DB): D1Database => (db as unknown as { $client: D1Database }).$client;

interface Common {
  itemId: string;
  locationId: string;
  reference?: string;
  note?: string;
  /** When it happened, if not now (ISO timestamp). */
  occurredAt?: string;
}

export interface UseInput extends Common {
  type: "use" | "waste";
  qty: number;
}
export interface ReceiveInput extends Common {
  qty: number;
  /** Cost of one unit. When given, it also becomes the item's latest unit cost. */
  unitCost?: number | null;
}
export interface AdjustInput extends Common {
  /** Signed: positive adds stock, negative removes it. */
  delta: number;
}
export interface TransferInput extends Common {
  toLocationId: string;
  qty: number;
}
export interface CountLine {
  itemId: string;
  counted: number;
}

type Loaded = { item: Item; location: Location };

async function loadPair(db: DB, itemId: string, locationId: string): Promise<Result<Loaded>> {
  const [it, loc] = await Promise.all([
    db.select().from(item).where(eq(item.id, itemId)).get(),
    db.select().from(location).where(eq(location.id, locationId)).get(),
  ]);
  if (!it || it.archived) return { ok: false, message: "That item no longer exists. Pick another one." };
  if (!loc || loc.archived) return { ok: false, message: "That place no longer exists. Pick another one." };
  return { ok: true, value: { item: it, location: loc } };
}

// ---------- Statement builders ----------

const upsertLevel = (c: D1Database, itemId: string, locationId: string) =>
  c
    .prepare("INSERT OR IGNORE INTO stock_level (id, item_id, location_id) VALUES (?, ?, ?)")
    .bind(crypto.randomUUID(), itemId, locationId);

interface MovementCols {
  type: MovementType;
  itemId: string;
  locationId: string;
  delta: number;
  userId: string;
  unitCost?: number | null | undefined;
  reference?: string | undefined;
  note?: string | undefined;
  transferId?: string | null | undefined;
  occurredAt?: string | undefined;
  /** Only write the row when the statement before it changed a row (used after a guarded update). */
  onlyIfChanged?: boolean;
  /** For counts: the delta is worked out from the current balance, which is then set to this. */
  countedTo?: number;
}

/** Writes one movement row, reading the balance after from the stock level in the same transaction. */
function insertMovement(c: D1Database, m: MovementCols) {
  const counting = m.countedTo !== undefined;
  const deltaExpr = counting ? "round(?5 - on_hand, 3)" : "?5";
  const balanceExpr = counting ? "?5" : "on_hand";
  const guard = m.onlyIfChanged ? " AND changes() > 0" : "";
  return c
    .prepare(
      `INSERT INTO movement
        (id, item_id, location_id, type, qty_delta, balance_after, unit_cost, reference, note, transfer_id, user_id, occurred_at)
       SELECT ?1, item_id, location_id, ?4, ${deltaExpr}, ${balanceExpr}, ?6, ?7, ?8, ?9, ?10, ?11
       FROM stock_level WHERE item_id = ?2 AND location_id = ?3${guard}`,
    )
    .bind(
      crypto.randomUUID(),
      m.itemId,
      m.locationId,
      m.type,
      counting ? m.countedTo! : m.delta,
      m.unitCost ?? null,
      m.reference ?? "",
      m.note ?? "",
      m.transferId ?? null,
      m.userId,
      m.occurredAt ?? nowIso(),
    );
}

const takeOut = (c: D1Database, itemId: string, locationId: string, qty: number) =>
  c
    .prepare(
      "UPDATE stock_level SET on_hand = round(on_hand - ?1, 3), updated_at = ?2 WHERE item_id = ?3 AND location_id = ?4 AND on_hand >= ?5",
    )
    .bind(qty, nowIso(), itemId, locationId, qty - EPS);

const putIn = (c: D1Database, itemId: string, locationId: string, qty: number, onlyIfChanged = false) =>
  c
    .prepare(
      `UPDATE stock_level SET on_hand = round(on_hand + ?1, 3), updated_at = ?2
       WHERE item_id = ?3 AND location_id = ?4${onlyIfChanged ? " AND changes() > 0" : ""}`,
    )
    .bind(qty, nowIso(), itemId, locationId);

export async function onHand(db: DB, itemId: string, locationId: string): Promise<number> {
  const row = await db
    .select({ onHand: stockLevel.onHand })
    .from(stockLevel)
    .where(and(eq(stockLevel.itemId, itemId), eq(stockLevel.locationId, locationId)))
    .get();
  return row?.onHand ?? 0;
}

const notEnough = (have: number, unit: string, place: string) =>
  `Only ${formatQty(have, unit)} on hand at ${place}. If more came in, record the delivery first, or count the stock to correct it.`;

const changed = (r: D1Result | undefined): number => r?.meta?.changes ?? 0;

// ---------- Use and waste ----------

export async function recordUse(db: DB, actor: AppUser, input: UseInput): Promise<Result> {
  if (!can(actor, "stock:record")) return denied("record stock");
  const pair = await loadPair(db, input.itemId, input.locationId);
  if (!pair.ok) return pair;
  const { item: it, location: loc } = pair.value!;
  const qty = roundQty(input.qty);
  const c = d1(db);
  const results = await c.batch([
    upsertLevel(c, it.id, loc.id),
    takeOut(c, it.id, loc.id, qty),
    insertMovement(c, {
      type: input.type,
      itemId: it.id,
      locationId: loc.id,
      delta: -qty,
      userId: actor.id,
      reference: input.reference,
      note: input.note,
      occurredAt: input.occurredAt,
      onlyIfChanged: true,
    }),
  ]);
  if (changed(results[1]) === 0) {
    return { ok: false, message: notEnough(await onHand(db, it.id, loc.id), it.unit, loc.name) };
  }
  return { ok: true };
}

// ---------- Receive ----------

/** Receives stock into one place. The unit cost, when given, also updates the item's latest cost. */
export async function receiveStock(db: DB, actor: AppUser, input: ReceiveInput): Promise<Result> {
  if (!can(actor, "stock:record")) return denied("receive stock");
  const pair = await loadPair(db, input.itemId, input.locationId);
  if (!pair.ok) return pair;
  const { item: it, location: loc } = pair.value!;
  const qty = roundQty(input.qty);
  const c = d1(db);
  const statements: D1PreparedStatement[] = [
    upsertLevel(c, it.id, loc.id),
    putIn(c, it.id, loc.id, qty),
    insertMovement(c, {
      type: "receive",
      itemId: it.id,
      locationId: loc.id,
      delta: qty,
      userId: actor.id,
      unitCost: input.unitCost,
      reference: input.reference,
      note: input.note,
      occurredAt: input.occurredAt,
    }),
  ];
  if (input.unitCost !== null && input.unitCost !== undefined) {
    statements.push(
      c.prepare("UPDATE item SET unit_cost = ?, updated_at = ? WHERE id = ?").bind(input.unitCost, nowIso(), it.id),
    );
  }
  await c.batch(statements);
  return { ok: true };
}

// ---------- Move between places ----------

export async function transferStock(db: DB, actor: AppUser, input: TransferInput): Promise<Result> {
  if (!can(actor, "stock:record")) return denied("move stock");
  if (input.locationId === input.toLocationId) return { ok: false, message: "Pick two different places." };
  const pair = await loadPair(db, input.itemId, input.locationId);
  if (!pair.ok) return pair;
  const { item: it, location: from } = pair.value!;
  const to = await db.select().from(location).where(eq(location.id, input.toLocationId)).get();
  if (!to || to.archived) return { ok: false, message: "The place you are moving it to no longer exists." };
  const qty = roundQty(input.qty);
  const transferId = crypto.randomUUID();
  const when = input.occurredAt ?? nowIso();
  const shared = { itemId: it.id, userId: actor.id, transferId, occurredAt: when, reference: input.reference };
  const c = d1(db);
  // Each step only runs when the one before it changed a row, so the stock never arrives without leaving.
  const results = await c.batch([
    upsertLevel(c, it.id, from.id),
    upsertLevel(c, it.id, to.id),
    takeOut(c, it.id, from.id, qty),
    insertMovement(c, {
      ...shared,
      type: "transfer_out",
      locationId: from.id,
      delta: -qty,
      onlyIfChanged: true,
      note: input.note || `To ${to.name}`,
    }),
    putIn(c, it.id, to.id, qty, true),
    insertMovement(c, {
      ...shared,
      type: "transfer_in",
      locationId: to.id,
      delta: qty,
      onlyIfChanged: true,
      note: input.note || `From ${from.name}`,
    }),
  ]);
  if (changed(results[2]) === 0) {
    return { ok: false, message: notEnough(await onHand(db, it.id, from.id), it.unit, from.name) };
  }
  return { ok: true };
}

// ---------- Adjust ----------

export async function adjustStock(db: DB, actor: AppUser, input: AdjustInput): Promise<Result> {
  if (!can(actor, "stock:adjust")) return denied("adjust stock");
  if (!input.note?.trim())
    return { ok: false, message: "Say why you are adjusting the stock, so others can follow it." };
  const pair = await loadPair(db, input.itemId, input.locationId);
  if (!pair.ok) return pair;
  const { item: it, location: loc } = pair.value!;
  const delta = roundQty(input.delta);
  if (delta === 0) return { ok: false, message: "Enter how much to add or remove." };
  const c = d1(db);
  const results = await c.batch([
    upsertLevel(c, it.id, loc.id),
    delta > 0
      ? c
          .prepare(
            "UPDATE stock_level SET on_hand = round(on_hand + ?, 3), updated_at = ? WHERE item_id = ? AND location_id = ?",
          )
          .bind(delta, nowIso(), it.id, loc.id)
      : takeOut(c, it.id, loc.id, -delta),
    insertMovement(c, {
      type: "adjust",
      itemId: it.id,
      locationId: loc.id,
      delta,
      userId: actor.id,
      reference: input.reference,
      note: input.note,
      occurredAt: input.occurredAt,
      onlyIfChanged: true,
    }),
  ]);
  if (changed(results[1]) === 0) {
    return { ok: false, message: notEnough(await onHand(db, it.id, loc.id), it.unit, loc.name) };
  }
  return { ok: true };
}

// ---------- Count ----------

/**
 * Saves a stock count for one place. Each counted line sets stock on hand to the number counted and records the
 * difference, so the ledger shows exactly what was found.
 */
export async function countStock(
  db: DB,
  actor: AppUser,
  locationId: string,
  lines: CountLine[],
  note = "",
): Promise<Result<{ counted: number; changed: number }>> {
  if (!can(actor, "stock:count")) return denied("count stock");
  if (lines.length === 0) return { ok: false, message: "Enter at least one count. Leave a box empty to skip it." };
  const loc = await db.select().from(location).where(eq(location.id, locationId)).get();
  if (!loc || loc.archived) return { ok: false, message: "That place no longer exists." };
  const when = nowIso();
  const c = d1(db);
  const before = new Map<string, number>();
  const statements: D1PreparedStatement[] = [];
  let differ = 0;
  for (const line of lines) {
    if (before.has(line.itemId)) continue;
    const it = await db.select().from(item).where(eq(item.id, line.itemId)).get();
    if (!it || it.archived) continue;
    const was = await onHand(db, it.id, loc.id);
    before.set(it.id, was);
    const counted = roundQty(line.counted);
    if (Math.abs(was - counted) > EPS) differ++;
    statements.push(
      upsertLevel(c, it.id, loc.id),
      insertMovement(c, {
        type: "count",
        itemId: it.id,
        locationId: loc.id,
        delta: 0,
        countedTo: counted,
        userId: actor.id,
        note,
        occurredAt: when,
      }),
      c
        .prepare(
          "UPDATE stock_level SET on_hand = ?, last_counted_at = ?, updated_at = ? WHERE item_id = ? AND location_id = ?",
        )
        .bind(counted, when, when, it.id, loc.id),
    );
  }
  if (statements.length === 0) return { ok: false, message: "None of those items exist any more." };
  await c.batch(statements);
  return { ok: true, value: { counted: before.size, changed: differ } };
}
