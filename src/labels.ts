/**
 * Every role, location kind and movement caption shown in the app lives here, so you can rename them in one place.
 * The keys on the left are stored in the database and must not change. Edit only the text on the right.
 */
import type { LocationKind, MovementType } from "./db/schema";

export const APP_NAME = "StockRoom";

export const ROLES = ["admin", "manager", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const roleLabel: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
};

export const roleHelp: Record<Role, string> = {
  admin: "Everything, including settings and the team.",
  manager: "Items, locations, levels, adjustments and exports.",
  staff: "Record use, receive deliveries, move and count stock.",
};

/** Shown for a signed-up user who has not been given a role yet. */
export const PENDING_LABEL = "Waiting for approval";

export const locationKindLabel: Record<LocationKind, string> = {
  vehicle: "Vehicle or van",
  warehouse: "Warehouse",
  storeroom: "Storeroom or back room",
  workshop: "Workshop",
  shelf: "Shelf, bin or cabinet",
  site: "Site or venue",
  kit: "Kit, bag or case",
  other: "Other",
};

export const movementLabel: Record<MovementType, string> = {
  receive: "Received",
  use: "Used",
  waste: "Wasted or damaged",
  transfer_out: "Moved out",
  transfer_in: "Moved in",
  count: "Counted",
  adjust: "Adjusted",
};

/** The kinds of movement a person picks on the "Record stock" form. Transfers and counts have their own flow. */
export const RECORDABLE = ["use", "waste", "receive", "transfer", "adjust"] as const;
export type Recordable = (typeof RECORDABLE)[number];

export const recordableLabel: Record<Recordable, string> = {
  use: "Use",
  waste: "Waste or damage",
  receive: "Receive",
  transfer: "Move to another place",
  adjust: "Adjust (correct a mistake)",
};

/** Units offered when adding an item, by unit system. People can type any other unit. */
export const UNITS = {
  metric: ["each", "pack", "box", "pair", "roll", "bottle", "kg", "g", "L", "mL", "m"],
  imperial: ["each", "pack", "box", "pair", "roll", "bottle", "lb", "oz", "gal", "fl oz", "ft"],
} as const;

/** Starter categories suggested on the item form. */
export const CATEGORY_SUGGESTIONS = [
  "Consumables",
  "Parts",
  "Fixings",
  "Cleaning",
  "Medical supplies",
  "Food and drink",
  "Packaging",
  "Safety gear",
  "Tools",
  "Stationery",
];

/** Currencies offered on the Setup page. Any ISO 4217 code is accepted. */
export const COMMON_CURRENCIES = [
  "USD",
  "AUD",
  "NZD",
  "CAD",
  "GBP",
  "EUR",
  "SGD",
  "ZAR",
  "INR",
  "JPY",
  "AED",
  "CHF",
  "SEK",
  "MXN",
  "BRL",
];
