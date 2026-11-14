import { sql } from "drizzle-orm";
import {
  check as checkConstraint,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Database schema. One deploy serves one business, so there is no organisation table.
 * Ids are text UUIDs. App dates are ISO timestamps in UTC stored as text; calendar dates are YYYY-MM-DD.
 * Quantities are REAL (stock can be 2.5 kg). Money is REAL in the business's own currency.
 * Better Auth's own tables (user, session, account, verification) use the column types it expects.
 */

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const timestamps = {
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
};

// ---------- Better Auth tables ----------

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    // Better Auth calls this field "name". It is the person's full name.
    name: text("full_name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    // null while the account waits for an admin to give it a role.
    role: text("role", { enum: ["admin", "manager", "staff"] }),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [checkConstraint("user_role_check", sql`${t.role} IS NULL OR ${t.role} IN ('admin', 'manager', 'staff')`)],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------- App tables ----------

export const appSettings = sqliteTable("app_settings", {
  // Always 1: there is exactly one settings row, created by a migration.
  id: integer("id").primaryKey(),
  businessName: text("business_name").notNull().default("My Business"),
  supportEmail: text("support_email").notNull().default(""),
  setupHelpUrl: text("setup_help_url").notNull().default("https://redcenterstudio.com/binwright/"),
  showSetupOffer: integer("show_setup_offer", { mode: "boolean" }).notNull().default(true),
  // ISO 4217 code such as USD, AUD, GBP, EUR or JPY. Costs are shown in this currency.
  currency: text("currency").notNull().default("USD"),
  // Which units are offered first when adding an item. Any unit can still be typed.
  unitSystem: text("unit_system", { enum: ["metric", "imperial"] })
    .notNull()
    .default("metric"),
  dateFormat: text("date_format", { enum: ["dmy", "mdy", "ymd"] })
    .notNull()
    .default("dmy"),
  // IANA time zone such as Europe/London. Empty means the TIME_ZONE value in wrangler.jsonc.
  timeZone: text("time_zone").notNull().default(""),
  // What a location is called in this business: Location, Van, Room, Site, Kit and so on.
  locationWord: text("location_word").notNull().default("Location"),
  updatedAt: text("updated_at").notNull().default(now),
});

export const LOCATION_KINDS = [
  "vehicle",
  "warehouse",
  "storeroom",
  "workshop",
  "shelf",
  "site",
  "kit",
  "other",
] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const location = sqliteTable(
  "location",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind", { enum: LOCATION_KINDS }).notNull().default("storeroom"),
    // A location can sit inside another one: a shelf in a storeroom, a drawer in a van.
    parentId: text("parent_id"),
    notes: text("notes").notNull().default(""),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index("location_name_idx").on(t.name)],
);

export const item = sqliteTable(
  "item",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    // Your own code for the item. Unique when set (checked by the app).
    sku: text("sku").notNull().default(""),
    category: text("category").notNull().default(""),
    // The unit stock is counted in: each, box, kg, L, m, lb, gal and so on.
    unit: text("unit").notNull().default("each"),
    supplier: text("supplier").notNull().default(""),
    supplierCode: text("supplier_code").notNull().default(""),
    // Latest cost of one unit, in the business currency. Updated when stock is received with a cost.
    unitCost: real("unit_cost"),
    notes: text("notes").notNull().default(""),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index("item_name_idx").on(t.name), index("item_category_idx").on(t.category)],
);

/** Stock of one item at one location. `onHand` is kept in step with the movement ledger. */
export const stockLevel = sqliteTable(
  "stock_level",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    locationId: text("location_id")
      .notNull()
      .references(() => location.id, { onDelete: "cascade" }),
    onHand: real("on_hand").notNull().default(0),
    // Reorder point: at or below this, the item is low.
    minQty: real("min_qty"),
    // Target level to top back up to.
    parQty: real("par_qty"),
    lastCountedAt: text("last_counted_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("stock_level_item_location_idx").on(t.itemId, t.locationId),
    index("stock_level_location_idx").on(t.locationId),
  ],
);

export const MOVEMENT_TYPES = ["receive", "use", "waste", "transfer_out", "transfer_in", "count", "adjust"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** The stock ledger. Rows are never edited; a mistake is fixed with an adjustment or a count. */
export const movement = sqliteTable(
  "movement",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    locationId: text("location_id")
      .notNull()
      .references(() => location.id, { onDelete: "cascade" }),
    type: text("type", { enum: MOVEMENT_TYPES }).notNull(),
    // Signed change to stock on hand: stock received is positive, use and waste negative.
    qtyDelta: real("qty_delta").notNull(),
    balanceAfter: real("balance_after").notNull(),
    unitCost: real("unit_cost"),
    // Supplier invoice, job number, event name: whatever helps find it later.
    reference: text("reference").notNull().default(""),
    note: text("note").notNull().default(""),
    // Both halves of a transfer share this id.
    transferId: text("transfer_id"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    occurredAt: text("occurred_at").notNull().default(now),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [
    index("movement_level_idx").on(t.itemId, t.locationId, t.occurredAt),
    index("movement_occurred_idx").on(t.occurredAt),
  ],
);

export const schema = {
  user,
  session,
  account,
  verification,
  appSettings,
  location,
  item,
  stockLevel,
  movement,
};

export type User = typeof user.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
export type Location = typeof location.$inferSelect;
export type Item = typeof item.$inferSelect;
export type StockLevel = typeof stockLevel.$inferSelect;
export type Movement = typeof movement.$inferSelect;
