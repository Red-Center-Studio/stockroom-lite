import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { byUrgency, listLevels, needsAttention, statusOf, summarise, topUpQty } from "../src/services/levels";
import { db, makeItem, makeLocation } from "./helpers";

describe("stock status", () => {
  it("is low at or below the reorder point, and out at zero", () => {
    expect(statusOf({ onHand: 5, minQty: 5, parQty: null })).toBe("low");
    expect(statusOf({ onHand: 0, minQty: 5, parQty: null })).toBe("out");
    expect(statusOf({ onHand: 50, minQty: 5, parQty: null })).toBe("ok");
  });

  it("has no status worth worrying about when no level is set", () => {
    expect(statusOf({ onHand: 0, minQty: null, parQty: null })).toBe("untracked");
    expect(statusOf({ onHand: 10, minQty: null, parQty: null })).toBe("untracked");
  });

  it("works out how much brings it back to the target", () => {
    expect(topUpQty({ onHand: 3, minQty: 5, parQty: 20 })).toBe(17);
    expect(topUpQty({ onHand: 3, minQty: 5, parQty: null })).toBe(7);
    expect(topUpQty({ onHand: 30, minQty: 5, parQty: 20 })).toBe(0);
  });
});

describe("levels from the database", () => {
  it("lists what needs attention, most urgent first, and values stock at the unit cost", async () => {
    const a = await makeItem({ name: "A", unitCost: 2.5 });
    const b = await makeItem({ name: "B" });
    const c = await makeItem({ name: "C" });
    const loc = await makeLocation();
    const add = (item: string, onHand: number) =>
      env.DB.prepare("INSERT INTO stock_level (id, item_id, location_id, on_hand, min_qty) VALUES (?, ?, ?, ?, 5)")
        .bind(crypto.randomUUID(), item, loc, onHand)
        .run();
    await add(a, 4);
    await add(b, 0);
    await add(c, 9);
    const levels = await listLevels(db());
    const list = levels.filter(needsAttention).sort(byUrgency);
    expect(list.map((l) => l.itemName)).toEqual(["B", "A"]);
    const s = summarise(levels);
    expect(s).toMatchObject({ out: 1, low: 1, items: 3, locations: 1, value: 10 });
  });

  it("skips archived items and places", async () => {
    const item = await makeItem({ archived: true });
    const loc = await makeLocation();
    await env.DB.prepare("INSERT INTO stock_level (id, item_id, location_id, on_hand) VALUES (?, ?, ?, 3)")
      .bind(crypto.randomUUID(), item, loc)
      .run();
    expect(await listLevels(db())).toEqual([]);
  });
});
