/**
 * Demo data. Used by the nightly reset in demo mode and by `npm run seed:local` / `npm run seed:remote`.
 * Plain TypeScript with explicit .ts imports, so Node can run it directly for the seed script.
 * Never run this against a real business's database: it deletes everything first.
 *
 * It simulates 45 days of a facilities and events business: daily use in vans and at events, deliveries into the
 * warehouse, vans topped up from the warehouse, and weekly counts. The numbers come from a fixed random seed, so the
 * demo looks the same after every reset, relative to today.
 */
import { hashPassword } from "../auth/password.ts";

export const DEMO_PASSWORD = "binwright-lite-demo";

export const DEMO_ACCOUNTS = [
  { role: "admin", name: "Alex Morgan", email: "admin@demo.binwright.example" },
  { role: "manager", name: "Sam Lee", email: "manager@demo.binwright.example" },
  { role: "staff", name: "Jordan Taylor", email: "staff@demo.binwright.example" },
] as const;

export interface Statement {
  sql: string;
  params: (string | number | null)[];
}

const DAY = 86_400_000;
const DAYS = 45;

/** Small seeded random number generator (mulberry32), so every reset gives the same story. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOCATIONS = [
  {
    key: "wh",
    name: "Main warehouse",
    kind: "warehouse",
    parent: null,
    notes: "Unit 4, 18 Dock Road. Deliveries before 2pm.",
  },
  { key: "aid", name: "First aid cabinet", kind: "shelf", parent: "wh", notes: "Checked every Monday." },
  { key: "v1", name: "Van 1 (Priya)", kind: "vehicle", parent: null, notes: "" },
  { key: "v2", name: "Van 2 (Marco)", kind: "vehicle", parent: null, notes: "" },
  { key: "ws", name: "Workshop", kind: "workshop", parent: null, notes: "" },
  {
    key: "ev",
    name: "Events kit A",
    kind: "kit",
    parent: null,
    notes: "Travels to venues. Count before and after each event.",
  },
] as const;
type LocKey = (typeof LOCATIONS)[number]["key"];

const ITEMS = [
  {
    key: "gloves",
    name: "Nitrile gloves (M)",
    sku: "GLV-M",
    cat: "Consumables",
    unit: "box",
    pack: 10,
    cost: 8.5,
    supplier: "SafeHands Supply",
    code: "SH-201",
  },
  {
    key: "cleaner",
    name: "Surface cleaner 5 L",
    sku: "CLN-5L",
    cat: "Cleaning",
    unit: "bottle",
    pack: 4,
    cost: 14.2,
    supplier: "CleanCo",
    code: "CC-5000",
  },
  {
    key: "ties",
    name: "Cable ties 300 mm (100)",
    sku: "TIE-300",
    cat: "Fixings",
    unit: "pack",
    pack: 10,
    cost: 6.9,
    supplier: "Fastline",
    code: "FL-T300",
  },
  {
    key: "aa",
    name: "AA batteries (24)",
    sku: "BAT-AA24",
    cat: "Consumables",
    unit: "pack",
    pack: 6,
    cost: 18,
    supplier: "Fastline",
    code: "FL-AA24",
  },
  {
    key: "filter",
    name: "HVAC filter 500 x 500",
    sku: "FLT-500",
    cat: "Parts",
    unit: "each",
    pack: 12,
    cost: 11.75,
    supplier: "AirParts Direct",
    code: "AP-F500",
  },
  {
    key: "fuse",
    name: "Fuses 10 A (box of 10)",
    sku: "FUS-10A",
    cat: "Parts",
    unit: "box",
    pack: 5,
    cost: 4.4,
    supplier: "Fastline",
    code: "FL-F10",
  },
  {
    key: "sealant",
    name: "Silicone sealant, clear",
    sku: "SIL-CLR",
    cat: "Fixings",
    unit: "each",
    pack: 12,
    cost: 7.8,
    supplier: "Fastline",
    code: "FL-SIL",
  },
  {
    key: "liners",
    name: "Bin liners 80 L (roll)",
    sku: "BIN-80",
    cat: "Cleaning",
    unit: "roll",
    pack: 10,
    cost: 5.1,
    supplier: "CleanCo",
    code: "CC-B80",
  },
  {
    key: "aidkit",
    name: "First aid kit refill",
    sku: "FAK-REF",
    cat: "Medical supplies",
    unit: "each",
    pack: 1,
    cost: 32,
    supplier: "SafeHands Supply",
    code: "SH-FAR",
  },
  {
    key: "eyewash",
    name: "Saline eyewash 500 mL",
    sku: "EYE-500",
    cat: "Medical supplies",
    unit: "bottle",
    pack: 6,
    cost: 9.6,
    supplier: "SafeHands Supply",
    code: "SH-EW5",
  },
  {
    key: "sanitiser",
    name: "Hand sanitiser 500 mL",
    sku: "SAN-500",
    cat: "Cleaning",
    unit: "bottle",
    pack: 12,
    cost: 6.3,
    supplier: "CleanCo",
    code: "CC-HS5",
  },
  {
    key: "pipe",
    name: "Copper pipe 15 mm",
    sku: "CU-15",
    cat: "Parts",
    unit: "m",
    pack: 6,
    cost: 9.2,
    supplier: "AirParts Direct",
    code: "AP-CU15",
  },
  {
    key: "grease",
    name: "Grease cartridge 450 g",
    sku: "GRS-450",
    cat: "Consumables",
    unit: "each",
    pack: 10,
    cost: 8.95,
    supplier: "Fastline",
    code: "FL-G450",
  },
  {
    key: "bands",
    name: "Event wristbands (100)",
    sku: "WRB-100",
    cat: "Consumables",
    unit: "pack",
    pack: 5,
    cost: 12.5,
    supplier: "Venue Goods",
    code: "VG-W100",
  },
  {
    key: "gaffer",
    name: "Gaffer tape 48 mm",
    sku: "GAF-48",
    cat: "Consumables",
    unit: "roll",
    pack: 6,
    cost: 15.4,
    supplier: "Venue Goods",
    code: "VG-GT48",
  },
] as const;
type ItemKey = (typeof ITEMS)[number]["key"];

/**
 * Stock levels: [item, place, reorder point, target, average daily use, final story].
 * Story "low" stops restocking near the end so it shows as low; "out" runs it to zero.
 */
type Story = "ok" | "low" | "out";
const LEVELS: [ItemKey, LocKey, number | null, number | null, number, Story][] = [
  ["gloves", "wh", 20, 60, 1.2, "ok"],
  ["gloves", "v1", 3, 8, 0.5, "ok"],
  ["gloves", "v2", 3, 8, 0.6, "low"],
  ["cleaner", "wh", 8, 24, 0.7, "ok"],
  ["cleaner", "v1", 1, 3, 0.15, "ok"],
  ["ties", "wh", 10, 30, 0.5, "ok"],
  ["ties", "v1", 2, 6, 0.25, "ok"],
  ["ties", "v2", 2, 6, 0.2, "ok"],
  ["aa", "wh", 6, 18, 0.35, "ok"],
  ["aa", "ev", 2, 6, 0.3, "out"],
  ["filter", "wh", 4, 36, 1.4, "low"],
  ["fuse", "wh", 5, 15, 0.2, "ok"],
  ["fuse", "v2", 1, 4, 0.1, "ok"],
  ["sealant", "ws", 4, 12, 0.3, "ok"],
  ["liners", "wh", 10, 30, 0.8, "ok"],
  ["aidkit", "aid", 2, 6, 0.08, "ok"],
  ["aidkit", "ev", 1, 2, 0.04, "ok"],
  ["eyewash", "aid", 3, 8, 0.1, "ok"],
  ["sanitiser", "wh", 12, 36, 0.9, "ok"],
  ["sanitiser", "ev", 4, 10, 0.4, "low"],
  ["pipe", "ws", 18, 48, 1.1, "ok"],
  ["grease", "ws", 4, 12, 0.25, "ok"],
  ["bands", "ev", 4, 12, 0.6, "ok"],
  ["gaffer", "ev", 3, 8, 0.3, "ok"],
  ["gaffer", "wh", null, null, 0, "ok"],
];

const TABLES = ["movement", "stock_level", "item", "location", "session", "account", "verification", "user"];

/** Builds the statements that wipe the database and load the demo business, relative to `now`. */
export async function demoStatements(now = new Date()): Promise<Statement[]> {
  const out: Statement[] = [];
  const add = (sql: string, ...params: (string | number | null)[]) => out.push({ sql, params });
  const nowMs = now.getTime();
  const at = (dayIndex: number, hour: number) => {
    // dayIndex 0 is DAYS days ago; DAYS is today. Times never land in the future.
    const d = new Date(nowMs - (DAYS - dayIndex) * DAY);
    d.setUTCHours(hour, (dayIndex * 7) % 60, 0, 0);
    return new Date(Math.min(d.getTime(), nowMs - 60_000)).toISOString();
  };
  const r = rng(20261114);

  for (const t of TABLES) add(`DELETE FROM ${t}`);
  add("INSERT OR IGNORE INTO app_settings (id) VALUES (1)");
  add(
    `UPDATE app_settings SET business_name = ?, support_email = '', show_setup_offer = 1, currency = 'USD', unit_system = 'metric',
      date_format = 'mdy', time_zone = 'America/Chicago', location_word = 'Location', updated_at = ? WHERE id = 1`,
    "Harbourline Services (demo)",
    now.toISOString(),
  );

  // People. The extra staff member has no demo sign-in; they make the activity and team pages realistic.
  const people = [
    ...DEMO_ACCOUNTS.map((a) => ({ ...a, id: crypto.randomUUID(), demo: 1 })),
    { role: "staff", name: "Priya Nair", email: "priya@demo.binwright.example", id: crypto.randomUUID(), demo: 0 },
    { role: null, name: "Casey Brooks", email: "casey@demo.binwright.example", id: crypto.randomUUID(), demo: 0 },
  ];
  const hash = await hashPassword(DEMO_PASSWORD);
  for (const p of people) {
    add(
      "INSERT INTO user (id, full_name, email, email_verified, role, is_demo, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)",
      p.id,
      p.name,
      p.email,
      p.role,
      p.demo,
      nowMs - 60 * DAY,
      nowMs - 60 * DAY,
    );
    if (p.demo) {
      add(
        "INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)",
        crypto.randomUUID(),
        p.id,
        p.id,
        hash,
        nowMs - 60 * DAY,
        nowMs - 60 * DAY,
      );
    }
  }
  const byName = (n: string) => people.find((p) => p.name === n)!.id;
  const staffFor: Record<LocKey, string> = {
    wh: byName("Sam Lee"),
    aid: byName("Sam Lee"),
    v1: byName("Priya Nair"),
    v2: byName("Jordan Taylor"),
    ws: byName("Jordan Taylor"),
    ev: byName("Jordan Taylor"),
  };

  const locId = new Map<LocKey, string>();
  for (const l of LOCATIONS) locId.set(l.key, crypto.randomUUID());
  for (const l of LOCATIONS) {
    add(
      "INSERT INTO location (id, name, kind, parent_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      locId.get(l.key)!,
      l.name,
      l.kind,
      l.parent ? locId.get(l.parent)! : null,
      l.notes,
      at(0, 1),
      at(0, 1),
    );
  }
  const itemId = new Map<ItemKey, string>();
  for (const it of ITEMS) {
    const id = crypto.randomUUID();
    itemId.set(it.key, id);
    add(
      `INSERT INTO item (id, name, sku, category, unit, supplier, supplier_code, unit_cost, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      it.name,
      it.sku,
      it.cat,
      it.unit,
      it.supplier,
      it.code,
      it.cost,
      at(0, 1),
      at(0, 1),
    );
  }
  const itemDef = (k: ItemKey) => ITEMS.find((i) => i.key === k)!;

  // ---------- Simulate ----------
  interface Sim {
    item: ItemKey;
    loc: LocKey;
    min: number | null;
    par: number | null;
    rate: number;
    story: Story;
    bal: number;
    id: string;
    lastCount: string | null;
  }
  const sims: Sim[] = LEVELS.map(([item, loc, min, par, rate, story]) => ({
    item,
    loc,
    min,
    par,
    rate,
    story,
    bal: 0,
    id: crypto.randomUUID(),
    lastCount: null,
  }));
  const whFor = (item: ItemKey) => sims.find((s) => s.item === item && s.loc === "wh");
  const movements: Statement[] = [];
  const mv = (
    s: Sim,
    type: string,
    delta: number,
    when: string,
    extra: Partial<Record<string, string | number | null>> = {},
  ) => {
    s.bal = Math.round((s.bal + delta) * 1000) / 1000;
    movements.push({
      sql: `INSERT INTO movement (id, item_id, location_id, type, qty_delta, balance_after, unit_cost, reference, note, transfer_id, user_id, occurred_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        itemId.get(s.item)!,
        locId.get(s.loc)!,
        type,
        delta,
        s.bal,
        (extra.unitCost as number | undefined) ?? null,
        (extra.reference as string | undefined) ?? "",
        (extra.note as string | undefined) ?? "",
        (extra.transferId as string | undefined) ?? null,
        (extra.userId as string | undefined) ?? staffFor[s.loc],
        when,
        when,
      ],
    });
  };

  // Opening stock: received into the warehouse, and a count everywhere else.
  for (const s of sims) {
    const start = s.par ?? 10;
    if (s.loc === "wh")
      mv(s, "receive", start, at(0, 15), {
        reference: "Opening stock",
        note: "Stock on the shelves when Binwright was set up.",
        unitCost: itemDef(s.item).cost,
      });
    else mv(s, "count", start, at(0, 16), { note: "Opening count" });
    s.lastCount = at(0, 16);
  }

  const ordersByDay = new Map<
    string,
    { id: string; supplier: string; lines: { s: Sim; qty: number }[]; day: number }
  >();
  // Each day runs in time order: the Monday count at 8am, deliveries at 10am, use from noon, top-ups at 4pm.
  // The last simulated day is yesterday, so nothing is dated in the future.
  for (let day = 1; day < DAYS; day++) {
    const weekday = new Date(nowMs - (DAYS - day) * DAY).getUTCDay();
    const working = weekday !== 0 && weekday !== 6;
    const late = day > DAYS - 10;

    // Weekly warehouse count on Mondays: a little goes missing, and the count corrects it.
    if (weekday === 1) {
      for (const s of sims.filter((x) => x.loc === "wh" && x.rate > 0)) {
        const missing = r() < 0.35 ? Math.min(s.bal, Math.max(1, Math.round(s.rate))) : 0;
        mv(s, "count", -missing, at(day, 8), { note: missing ? "Weekly count" : "Weekly count, matched" });
        s.lastCount = at(day, 8);
      }
    }

    // Deliveries arrive two days after ordering.
    for (const [key, rec] of ordersByDay) {
      if (rec.day + 2 !== day) continue;
      const when = at(day, 10);
      const ref = `INV-${7300 + day * 11}`;
      for (const l of rec.lines) {
        mv(l.s, "receive", l.qty, when, { reference: ref, note: rec.supplier, unitCost: itemDef(l.s.item).cost });
      }
      ordersByDay.delete(key);
    }

    for (const s of sims) {
      if (s.rate <= 0) continue;
      // Events kit is used at weekends; everything else on working days.
      const active = s.loc === "ev" ? !working : working;
      if (!active) continue;
      let qty = Math.round(s.rate * (0.4 + r() * 1.4) * (s.loc === "ev" ? 2.2 : 1.4) * 10) / 10;
      if (["each", "box", "pack", "roll", "bottle"].includes(itemDef(s.item).unit)) qty = Math.round(qty);
      qty = Math.min(qty, s.bal);
      if (qty <= 0) continue;
      const waste = r() < 0.05;
      mv(s, waste ? "waste" : "use", -qty, at(day, 12 + Math.floor(r() * 4)), {
        reference: waste ? "" : s.loc === "ev" ? `Event ${1000 + day}` : `Job ${4200 + day * 3}`,
        note: waste ? "Damaged in transit" : "",
      });
    }

    // Topping up in the afternoon: from the warehouse when it has enough, otherwise an order to the supplier.
    for (const s of sims) {
      if (s.min === null || s.par === null) continue;
      if (s.bal > s.min) continue;
      if (s.story !== "ok" && late) continue;
      if ([...ordersByDay.values()].some((rec) => rec.lines.some((l) => l.s === s))) continue;
      const need = s.par - s.bal;
      const wh = s.loc === "wh" ? undefined : whFor(s.item);
      if (wh && wh.bal - need >= (wh.min ?? 0)) {
        const transferId = crypto.randomUUID();
        const when = at(day, 16);
        mv(wh, "transfer_out", -need, when, {
          transferId,
          note: `To ${LOCATIONS.find((l) => l.key === s.loc)!.name}`,
          userId: staffFor[s.loc],
        });
        mv(s, "transfer_in", need, when, { transferId, note: "From Main warehouse" });
      } else {
        const def = itemDef(s.item);
        const packs = Math.ceil(need / def.pack);
        const key = `${day}:${def.supplier}:${s.loc}`;
        const rec = ordersByDay.get(key) ?? { id: crypto.randomUUID(), supplier: def.supplier, lines: [], day };
        rec.lines.push({ s, qty: packs * def.pack });
        ordersByDay.set(key, rec);
      }
    }
  }

  // Story endings.
  for (const s of sims) {
    if (s.story === "out" && s.bal > 0) mv(s, "use", -s.bal, at(DAYS - 1, 18), { reference: "Event 1044" });
  }

  for (const s of sims) {
    add(
      `INSERT INTO stock_level (id, item_id, location_id, on_hand, min_qty, par_qty, last_counted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      s.id,
      itemId.get(s.item)!,
      locId.get(s.loc)!,
      s.bal,
      s.min,
      s.par,
      s.lastCount,
      at(0, 1),
      at(DAYS, 1),
    );
  }
  out.push(...movements);

  return out;
}
