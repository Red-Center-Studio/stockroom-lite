import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Browser, makeItem, makeLocation, signedIn, stockOf, location_ } from "./helpers";

const html = (res: Response) => res.text();

describe("sign up and roles", () => {
  it("makes the first account an admin, and later ones wait for approval", async () => {
    const first = new Browser();
    const r1 = await first.post("/signup", {
      fullName: "Owner",
      email: "owner@example.com",
      password: "correct-horse-battery",
    });
    expect(r1.status).toBe(303);
    const dash = await first.get("/dashboard");
    expect(dash.status).toBe(200);
    expect(await html(dash)).toContain("Stock today");

    const second = new Browser();
    await second.post("/signup", { fullName: "New", email: "new@example.com", password: "correct-horse-battery" });
    const waiting = await second.get("/dashboard");
    expect(waiting.status).toBe(303);
    expect(location_(waiting)).toBe("/waiting");
  });

  it("sends signed-out visitors to sign in", async () => {
    const res = await new Browser().get("/stock");
    expect(res.status).toBe(303);
    expect(location_(res)).toContain("/login?next=%2Fstock");
  });

  it("staff can record but cannot edit items, see costs or open setup", async () => {
    const { browser } = await signedIn("staff");
    expect((await browser.get("/record")).status).toBe(200);
    expect((await browser.get("/items/new")).status).toBe(403);
    expect((await browser.get("/setup")).status).toBe(403);
    expect((await browser.get("/stock/export.csv")).status).toBe(403);
    const it1 = await makeItem({ unitCost: 9.99 });
    const loc = await makeLocation();
    await env.DB.prepare("INSERT INTO stock_level (id, item_id, location_id, on_hand) VALUES (?, ?, ?, 3)")
      .bind(crypto.randomUUID(), it1, loc)
      .run();
    const page = await html(await browser.get(`/items/${it1}`));
    expect(page).not.toContain("9.99");
  });

  it("rejects a form posted without the CSRF token", async () => {
    const { browser } = await signedIn("admin");
    const res = await browser.post("/locations/new", { name: "X", kind: "storeroom" }, { csrf: false });
    expect(res.status).toBe(403);
  });

  it("rejects a form posted from another site", async () => {
    const { browser } = await signedIn("admin");
    const res = await browser.post(
      "/locations/new",
      { name: "X", kind: "storeroom" },
      { origin: "https://evil.example" },
    );
    expect(res.status).toBe(403);
  });
});

describe("catalog", () => {
  it("a manager adds a place and an item kept there with levels", async () => {
    const { browser } = await signedIn("manager");
    const r = await browser.post("/locations/new", { name: "Van 1", kind: "vehicle", notes: "" });
    expect(r.status).toBe(303);
    const locId = location_(r).split("/")[2]!.split("?")[0]!;
    const r2 = await browser.post("/items/new", {
      name: "Cable ties",
      sku: "TIE-1",
      unit: "pack",
      unitCost: "6.90",
      locationId: locId,
      minQty: "2",
      parQty: "6",
    });
    expect(r2.status).toBe(303);
    const row = await env.DB.prepare("SELECT min_qty, par_qty FROM stock_level").first<{
      min_qty: number;
      par_qty: number;
    }>();
    expect(row).toEqual({ min_qty: 2, par_qty: 6 });
  });

  it("refuses a duplicate code and a target below the reorder point", async () => {
    const { browser } = await signedIn("manager");
    await makeItem({ sku: "DUP" });
    const r = await browser.post("/items/new", { name: "Other", sku: "DUP", unit: "each" });
    expect(r.status).toBe(400);
    expect(await html(r)).toContain("already uses the code DUP");
    const it1 = await makeItem();
    const loc = await makeLocation();
    const r2 = await browser.post(`/items/${it1}/level`, { locationId: loc, minQty: "10", parQty: "5" });
    expect(r2.status).toBe(400);
  });

  it("will not let a place sit inside itself", async () => {
    const { browser } = await signedIn("manager");
    const a = await makeLocation({ name: "A" });
    const b = await makeLocation({ name: "B", parentId: a });
    const r = await browser.post(`/locations/${a}/edit`, { name: "A", kind: "storeroom", parentId: b });
    expect(r.status).toBe(400);
    expect(await html(r)).toContain("cannot sit inside itself");
  });
});

describe("recording stock", () => {
  it("records use from the form and shows what was saved", async () => {
    const { browser } = await signedIn("staff");
    const it1 = await makeItem({ name: "Gloves" });
    const loc = await makeLocation({ name: "Van 1" });
    await env.DB.prepare("INSERT INTO stock_level (id, item_id, location_id, on_hand) VALUES (?, ?, ?, 5)")
      .bind(crypto.randomUUID(), it1, loc)
      .run();
    const r = await browser.post("/record", {
      type: "use",
      itemId: it1,
      locationId: loc,
      qty: "2",
      reference: "Job 12",
    });
    expect(r.status).toBe(303);
    expect(await stockOf(it1, loc)).toBe(3);
    const page = await html(await browser.get(location_(r)));
    expect(page).toContain("Used 2 box of Gloves at Van 1.");
    expect(page).toContain("3 box now on hand there.");
  });

  it("shows a clear message when there is not enough", async () => {
    const { browser } = await signedIn("staff");
    const it1 = await makeItem();
    const loc = await makeLocation();
    const r = await browser.post("/record", { type: "use", itemId: it1, locationId: loc, qty: "1" });
    expect(r.status).toBe(400);
    expect(await html(r)).toContain("Only 0 box on hand");
  });

  it("rejects nonsense quantities", async () => {
    const { browser } = await signedIn("staff");
    const it1 = await makeItem();
    const loc = await makeLocation();
    for (const qty of ["-1", "0", "abc", "1e9"]) {
      const r = await browser.post("/record", { type: "use", itemId: it1, locationId: loc, qty });
      expect(r.status).toBe(400);
    }
  });

  it("receives stock with a unit cost from the record form", async () => {
    const { browser } = await signedIn("staff");
    const a = await makeItem({ name: "A" });
    const loc = await makeLocation();
    const r = await browser.post("/record", {
      type: "receive",
      itemId: a,
      locationId: loc,
      qty: "4",
      unitCost: "1.50",
      reference: "INV-9",
    });
    expect(r.status).toBe(303);
    expect(await stockOf(a, loc)).toBe(4);
    const row = await env.DB.prepare("SELECT unit_cost FROM item WHERE id = ?").bind(a).first<{ unit_cost: number }>();
    expect(row?.unit_cost).toBe(1.5);
  });

  it("moves stock between places from the record form", async () => {
    const { browser } = await signedIn("staff");
    const a = await makeItem();
    const wh = await makeLocation({ name: "Warehouse" });
    const van = await makeLocation({ name: "Van" });
    await env.DB.prepare("INSERT INTO stock_level (id, item_id, location_id, on_hand) VALUES (?, ?, ?, 10)")
      .bind(crypto.randomUUID(), a, wh)
      .run();
    const r = await browser.post("/record", {
      type: "transfer",
      itemId: a,
      locationId: wh,
      toLocationId: van,
      qty: "3",
    });
    expect(r.status).toBe(303);
    expect(await stockOf(a, wh)).toBe(7);
    expect(await stockOf(a, van)).toBe(3);
  });

  it("counts a place, skipping empty boxes", async () => {
    const { browser } = await signedIn("staff");
    const a = await makeItem({ name: "A" });
    const b = await makeItem({ name: "B" });
    const loc = await makeLocation();
    for (const [it1, q] of [
      [a, 5],
      [b, 9],
    ] as const) {
      await env.DB.prepare("INSERT INTO stock_level (id, item_id, location_id, on_hand) VALUES (?, ?, ?, ?)")
        .bind(crypto.randomUUID(), it1, loc, q)
        .run();
    }
    const r = await browser.post(`/count/${loc}`, { itemId: [a, b], counted: ["4", ""] });
    expect(r.status).toBe(303);
    expect(location_(r)).toContain("n=1&d=1");
    expect(await stockOf(a, loc)).toBe(4);
    expect(await stockOf(b, loc)).toBe(9);
  });
});

describe("low stock", () => {
  it("the home page lists what is at or below its reorder point, with the top-up to target", async () => {
    const { browser } = await signedIn("manager");
    const it1 = await makeItem({ name: "Filters", supplier: "AirParts" });
    const loc = await makeLocation();
    await env.DB.prepare(
      "INSERT INTO stock_level (id, item_id, location_id, on_hand, min_qty, par_qty) VALUES (?, ?, ?, 2, 10, 30)",
    )
      .bind(crypto.randomUUID(), it1, loc)
      .run();
    const page = await html(await browser.get("/dashboard"));
    expect(page).toContain("Filters");
    expect(page).toContain("28 box brings it back to target");
    expect(page).toContain("AirParts");
    const low = await html(await browser.get("/stock?status=low"));
    expect(low).toContain("Filters");
  });
});

describe("exports", () => {
  it("CSV files start with a real byte order mark, so Excel reads them as UTF-8", async () => {
    const { browser } = await signedIn("manager");
    const res = await browser.get("/stock/export.csv");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3, 7))).toBe("Item");
    const act = new Uint8Array(await (await browser.get("/activity.csv")).arrayBuffer());
    expect([...act.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("CSV cells that look like formulas are made safe", async () => {
    const { browser } = await signedIn("manager");
    await makeItem({ name: '=HYPERLINK("http://evil")' }).then(async (it1) => {
      const loc = await makeLocation();
      await env.DB.prepare("INSERT INTO stock_level (id, item_id, location_id, on_hand) VALUES (?, ?, ?, 1)")
        .bind(crypto.randomUUID(), it1, loc)
        .run();
    });
    const csv = await html(await browser.get("/stock/export.csv"));
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe("settings", () => {
  it("currency and date format change how amounts are shown", async () => {
    const { browser } = await signedIn("admin");
    const r = await browser.post("/setup", {
      businessName: "Clinic Co",
      currency: "eur",
      unitSystem: "metric",
      dateFormat: "ymd",
      timeZone: "Europe/Berlin",
      locationWord: "Room",
    });
    expect(r.status).toBe(303);
    const page = await html(await browser.get("/dashboard"));
    expect(page).toContain("Clinic Co");
    expect(page).toContain("Rooms");
    expect(page).toMatch(/€/);
  });

  it("rejects an unknown currency or time zone", async () => {
    const { browser } = await signedIn("admin");
    const base = {
      businessName: "X",
      unitSystem: "metric",
      dateFormat: "dmy",
      locationWord: "Location",
    };
    expect((await browser.post("/setup", { ...base, currency: "ABC" })).status).toBe(400);
    expect((await browser.post("/setup", { ...base, currency: "USD", timeZone: "Mars/Base" })).status).toBe(400);
  });

  it("the last admin cannot be removed", async () => {
    const { browser, user } = await signedIn("admin");
    const r = await browser.post(`/setup/team/${user.id}/role`, { role: "staff" });
    expect(r.status).toBe(400);
    expect(await html(r)).toContain("last admin");
  });
});

describe("pages", () => {
  it("every main page renders for an admin, with one h1 and a skip link", async () => {
    const { browser } = await signedIn("admin");
    const it1 = await makeItem();
    const loc = await makeLocation();
    for (const path of [
      "/dashboard",
      "/stock",
      "/record",
      "/count",
      `/count/${loc}`,
      "/items",
      `/items/${it1}`,
      `/items/${it1}/edit`,
      "/locations",
      `/locations/${loc}`,
      "/activity",
      "/setup",
      "/account",
      "/terms",
      "/privacy",
    ]) {
      const res = await browser.get(path);
      expect(res.status, path).toBe(200);
      const body = await res.text();
      expect(body.match(/<h1/g)?.length, path).toBe(1);
      expect(body, path).toContain("Skip to content");
    }
  });

  it("unknown ids and paths are a friendly 404", async () => {
    const { browser } = await signedIn("admin");
    expect((await browser.get(`/items/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await browser.get("/items/not-an-id")).status).toBe(404);
    expect((await browser.get("/nope")).status).toBe(404);
  });

  it("sends security headers", async () => {
    const res = await new Browser().get("/login");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});
