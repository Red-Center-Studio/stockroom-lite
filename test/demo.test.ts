import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { demoStatements, DEMO_ACCOUNTS } from "../src/seed/demo";
import { listLevels } from "../src/services/levels";
import { getSettings } from "../src/services/settings";
import { resetDemo } from "../src/services/demo";
import { runScheduled } from "../src/services/scheduled";
import { Browser, db } from "./helpers";

async function loadDemo(now = new Date()) {
  const statements = await demoStatements(now);
  await env.DB.batch(statements.map((s) => env.DB.prepare(s.sql).bind(...s.params)));
}

describe("demo data", () => {
  it("loads a business whose stock tells a story: out, low and OK", async () => {
    await loadDemo();
    const settings = await getSettings(db());
    expect(settings.businessName).toContain("demo");
    const levels = await listLevels(db());
    const statuses = new Set(levels.map((l) => l.status));
    expect(statuses.has("out")).toBe(true);
    expect(statuses.has("low")).toBe(true);
    expect(statuses.has("ok")).toBe(true);
    expect(levels.every((l) => l.onHand >= 0)).toBe(true);
  });

  it("every ledger balance matches the stock level it ends on", async () => {
    await loadDemo();
    const rows = await env.DB.prepare(
      `SELECT sl.on_hand AS onHand, (SELECT m.balance_after FROM movement m WHERE m.item_id = sl.item_id AND m.location_id = sl.location_id ORDER BY m.occurred_at DESC, m.rowid DESC LIMIT 1) AS last
       FROM stock_level sl`,
    ).all<{ onHand: number; last: number | null }>();
    for (const r of rows.results) if (r.last !== null) expect(r.last).toBeCloseTo(r.onHand, 3);
  });

  it("demo sign-in buttons work in demo mode only", async () => {
    await loadDemo();
    const b = new Browser();
    const off = await b.post("/login/demo", { role: "manager" });
    expect(off.status).toBe(404);
    expect(DEMO_ACCOUNTS.map((a) => a.role)).toEqual(["admin", "manager", "staff"]);
  });

  it("the reset does nothing unless demo mode is on", async () => {
    expect(await resetDemo({ ...env, DEMO_MODE: "false" })).toBe(false);
    expect((await runScheduled({ ...env, DEMO_MODE: "false" }, new Date())).demoReset).toBe(false);
    expect(await resetDemo({ ...env, DEMO_MODE: "true" })).toBe(true);
    const n = await env.DB.prepare("SELECT count(*) AS n FROM item").first<{ n: number }>();
    expect(n?.n).toBeGreaterThan(10);
  });
});
