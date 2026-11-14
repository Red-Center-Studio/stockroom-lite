import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { adjustStock, countStock, receiveStock, recordUse, transferStock } from "../src/services/ledger";
import { db, makeItem, makeLocation, makeUser, stockOf } from "./helpers";

const movements = (itemId: string) =>
  env.DB.prepare(
    "SELECT type, qty_delta, balance_after, location_id FROM movement WHERE item_id = ? ORDER BY created_at, rowid",
  )
    .bind(itemId)
    .all<{ type: string; qty_delta: number; balance_after: number; location_id: string }>()
    .then((r) => r.results);

describe("receiving", () => {
  it("adds stock, writes the movement with the balance after, and records the cost", async () => {
    const u = await makeUser("staff");
    const it1 = await makeItem({ unitCost: 2 });
    const loc = await makeLocation();
    const res = await receiveStock(db(), u, {
      itemId: it1,
      locationId: loc,
      reference: "INV-1",
      qty: 10,
      unitCost: 2.5,
    });
    expect(res.ok).toBe(true);
    expect(await stockOf(it1, loc)).toBe(10);
    const m = await movements(it1);
    expect(m).toEqual([{ type: "receive", qty_delta: 10, balance_after: 10, location_id: loc }]);
    const row = await env.DB.prepare("SELECT unit_cost FROM item WHERE id = ?")
      .bind(it1)
      .first<{ unit_cost: number }>();
    expect(row?.unit_cost).toBe(2.5);
  });

  it("keeps decimals exact across several deliveries", async () => {
    const u = await makeUser("staff");
    const a = await makeItem({ name: "A" });
    const loc = await makeLocation();
    await receiveStock(db(), u, { itemId: a, locationId: loc, qty: 0.1 });
    await receiveStock(db(), u, { itemId: a, locationId: loc, qty: 0.2 });
    expect(await stockOf(a, loc)).toBe(0.3);
  });

  it("refuses an archived item and saves nothing", async () => {
    const u = await makeUser("staff");
    const gone = await makeItem({ archived: true });
    const loc = await makeLocation();
    const res = await receiveStock(db(), u, { itemId: gone, locationId: loc, qty: 1 });
    expect(res.ok).toBe(false);
    expect(await stockOf(gone, loc)).toBe(0);
    expect(await movements(gone)).toEqual([]);
  });
});

describe("using stock", () => {
  it("takes stock out and keeps decimals exact", async () => {
    const u = await makeUser("staff");
    const it1 = await makeItem({ unit: "kg" });
    const loc = await makeLocation();
    await receiveStock(db(), u, { itemId: it1, locationId: loc, qty: 0.3 });
    await recordUse(db(), u, { type: "use", itemId: it1, locationId: loc, qty: 0.1 });
    await recordUse(db(), u, { type: "waste", itemId: it1, locationId: loc, qty: 0.2 });
    expect(await stockOf(it1, loc)).toBe(0);
  });

  it("never goes below zero, and says how much is there", async () => {
    const u = await makeUser("staff");
    const it1 = await makeItem();
    const loc = await makeLocation({ name: "Van 2" });
    await receiveStock(db(), u, { itemId: it1, locationId: loc, qty: 2 });
    const res = await recordUse(db(), u, { type: "use", itemId: it1, locationId: loc, qty: 3 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("Only 2 box on hand at Van 2");
    expect(await stockOf(it1, loc)).toBe(2);
    expect((await movements(it1)).length).toBe(1);
  });

  it("two people using the last one at the same moment: exactly one succeeds", async () => {
    const u = await makeUser("staff");
    const it1 = await makeItem();
    const loc = await makeLocation();
    await receiveStock(db(), u, { itemId: it1, locationId: loc, qty: 1 });
    const results = await Promise.all([
      recordUse(db(), u, { type: "use", itemId: it1, locationId: loc, qty: 1 }),
      recordUse(db(), u, { type: "use", itemId: it1, locationId: loc, qty: 1 }),
    ]);
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(await stockOf(it1, loc)).toBe(0);
    expect((await movements(it1)).filter((m) => m.type === "use").length).toBe(1);
  });

  it("refuses people with no role", async () => {
    const pending = await makeUser(null);
    const it1 = await makeItem();
    const loc = await makeLocation();
    const res = await recordUse(db(), pending, { type: "use", itemId: it1, locationId: loc, qty: 1 });
    expect(res.ok).toBe(false);
  });
});

describe("moving stock", () => {
  it("moves between places as a matched pair", async () => {
    const u = await makeUser("staff");
    const it1 = await makeItem();
    const wh = await makeLocation({ name: "Warehouse" });
    const van = await makeLocation({ name: "Van" });
    await receiveStock(db(), u, { itemId: it1, locationId: wh, qty: 10 });
    const res = await transferStock(db(), u, { itemId: it1, locationId: wh, toLocationId: van, qty: 4 });
    expect(res.ok).toBe(true);
    expect(await stockOf(it1, wh)).toBe(6);
    expect(await stockOf(it1, van)).toBe(4);
    const pair = await env.DB.prepare(
      "SELECT count(DISTINCT transfer_id) AS t, count(*) AS n FROM movement WHERE transfer_id IS NOT NULL",
    ).first<{ t: number; n: number }>();
    expect(pair).toEqual({ t: 1, n: 2 });
  });

  it("does nothing at either end when there is not enough", async () => {
    const u = await makeUser("staff");
    const it1 = await makeItem();
    const wh = await makeLocation();
    const van = await makeLocation();
    await receiveStock(db(), u, { itemId: it1, locationId: wh, qty: 1 });
    const res = await transferStock(db(), u, { itemId: it1, locationId: wh, toLocationId: van, qty: 5 });
    expect(res.ok).toBe(false);
    expect(await stockOf(it1, wh)).toBe(1);
    expect(await stockOf(it1, van)).toBe(0);
    expect((await movements(it1)).length).toBe(1);
  });

  it("refuses moving to the same place", async () => {
    const u = await makeUser("staff");
    const it1 = await makeItem();
    const wh = await makeLocation();
    expect((await transferStock(db(), u, { itemId: it1, locationId: wh, toLocationId: wh, qty: 1 })).ok).toBe(false);
  });
});

describe("counting", () => {
  it("sets stock to the count and records the difference", async () => {
    const u = await makeUser("staff");
    const it1 = await makeItem();
    const loc = await makeLocation();
    await receiveStock(db(), u, { itemId: it1, locationId: loc, qty: 10 });
    const res = await countStock(db(), u, loc, [{ itemId: it1, counted: 7 }]);
    expect(res).toEqual({ ok: true, value: { counted: 1, changed: 1 } });
    expect(await stockOf(it1, loc)).toBe(7);
    const last = (await movements(it1)).at(-1);
    expect(last).toMatchObject({ type: "count", qty_delta: -3, balance_after: 7 });
    const lvl = await env.DB.prepare("SELECT last_counted_at FROM stock_level").first<{ last_counted_at: string }>();
    expect(lvl?.last_counted_at).toBeTruthy();
  });

  it("starts tracking an item at a place the first time it is counted there", async () => {
    const u = await makeUser("staff");
    const it1 = await makeItem();
    const loc = await makeLocation();
    await countStock(db(), u, loc, [{ itemId: it1, counted: 4 }]);
    expect(await stockOf(it1, loc)).toBe(4);
  });
});

describe("adjusting", () => {
  it("needs a manager and a reason", async () => {
    const staff = await makeUser("staff");
    const manager = await makeUser("manager");
    const it1 = await makeItem();
    const loc = await makeLocation();
    expect((await adjustStock(db(), staff, { itemId: it1, locationId: loc, delta: 2, note: "found" })).ok).toBe(false);
    expect((await adjustStock(db(), manager, { itemId: it1, locationId: loc, delta: 2, note: "" })).ok).toBe(false);
    expect((await adjustStock(db(), manager, { itemId: it1, locationId: loc, delta: 2, note: "Found a box" })).ok).toBe(
      true,
    );
    expect((await adjustStock(db(), manager, { itemId: it1, locationId: loc, delta: -5, note: "Oops" })).ok).toBe(
      false,
    );
    expect(await stockOf(it1, loc)).toBe(2);
  });
});
