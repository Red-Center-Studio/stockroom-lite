import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN } from "../auth/auth";
import { LOCATION_KINDS } from "../db/schema";
import { ROLES } from "../labels";
import { isValidCurrency, isValidTimeZone, zonedInstant } from "./region";

/**
 * Server-side validation for every form and query. Nothing sent by the browser is trusted: ids, roles and
 * numbers are all checked here before any database work.
 */

const required = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long (${max} characters at most).`);
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (${max} characters at most).`)
    .optional()
    .transform((v) => v ?? "");
const email = z.string().trim().toLowerCase().max(254, "Email is too long.").pipe(z.email("Enter a valid email."));
const password = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Password must be ${PASSWORD_MAX} characters or fewer.`);
export const id = z.uuid("Something went wrong with that link. Go back and try again.");
const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.uuid().safeParse(v).success, { message: "Pick from the list." });
const checkbox = z
  .union([z.literal("1"), z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "1" || v === "on" || v === "true");

const NUM = /^-?\d{1,9}(\.\d{1,4})?$/;
const cleanNum = (v: string) => v.trim().replace(/,/g, "");

/** A quantity greater than zero, up to 3 decimal places is kept. */
export const qty = (label = "Quantity") =>
  z
    .string()
    .transform(cleanNum)
    .refine((v) => NUM.test(v) && Number(v) > 0, { message: `${label} must be a number greater than 0.` })
    .transform(Number);
/** An optional number of 0 or more (empty means "not set"). */
const optionalAmount = (label: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? "" : cleanNum(v)))
    .refine((v) => v === "" || (NUM.test(v) && Number(v) >= 0), { message: `${label} must be a number of 0 or more.` })
    .transform((v) => (v === "" ? null : Number(v)));

/** A local date and time from a datetime-local input, or empty for now. Returned as the raw string. */
const when = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v), { message: "Enter a valid date." });

// ---------- Auth ----------

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX),
  next: z.string().optional(),
});
export const signUpSchema = z.object({ fullName: required(80, "Full name"), email, password });
export const forgotSchema = z.object({ email });
export const resetSchema = z
  .object({ token: z.string().min(1).max(200), password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The two passwords do not match.", path: ["confirm"] });
export const accountNameSchema = z.object({ fullName: required(80, "Full name") });
export const accountEmailSchema = z.object({ email });
export const accountPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(PASSWORD_MAX),
    newPassword: password,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { message: "The two new passwords do not match.", path: ["confirm"] });
export const roleSchema = z.object({ role: z.enum(ROLES, { message: "Pick a role." }) });

// ---------- Catalog ----------

export const itemSchema = z.object({
  name: required(120, "Name"),
  sku: optionalText(60, "Code"),
  category: optionalText(60, "Category"),
  unit: required(20, "Unit"),
  supplier: optionalText(100, "Supplier"),
  supplierCode: optionalText(60, "Supplier code"),
  unitCost: optionalAmount("Unit cost"),
  notes: optionalText(1000, "Notes"),
});

export const locationSchema = z.object({
  name: required(80, "Name"),
  kind: z.enum(LOCATION_KINDS, { message: "Pick what kind of place it is." }),
  parentId: optionalId,
  notes: optionalText(1000, "Notes"),
});

export const levelSchema = z.object({
  itemId: id,
  locationId: id,
  minQty: optionalAmount("Reorder point"),
  parQty: optionalAmount("Target level"),
});

// ---------- Stock ----------

export const recordSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["use", "waste"]),
    itemId: id,
    locationId: id,
    qty: qty(),
    reference: optionalText(80, "Reference"),
    note: optionalText(500, "Note"),
    occurredAt: when,
  }),
  z.object({
    type: z.literal("receive"),
    itemId: id,
    locationId: id,
    qty: qty(),
    unitCost: optionalAmount("Unit cost"),
    reference: optionalText(80, "Reference"),
    note: optionalText(500, "Note"),
    occurredAt: when,
  }),
  z.object({
    type: z.literal("transfer"),
    itemId: id,
    locationId: id,
    toLocationId: id,
    qty: qty(),
    reference: optionalText(80, "Reference"),
    note: optionalText(500, "Note"),
    occurredAt: when,
  }),
  z.object({
    type: z.literal("adjust"),
    itemId: id,
    locationId: id,
    direction: z.enum(["add", "remove"], { message: "Choose add or remove." }),
    qty: qty(),
    reference: optionalText(80, "Reference"),
    note: required(500, "Reason"),
    occurredAt: when,
  }),
]);

// ---------- Settings ----------

export const settingsSchema = z.object({
  businessName: required(80, "Business name"),
  supportEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .optional()
    .transform((v) => v ?? "")
    .refine((v) => v === "" || z.email().safeParse(v).success, {
      message: "Enter a valid support email, or leave it empty.",
    }),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isValidCurrency, { message: "Enter a 3-letter currency code such as USD, EUR or AUD." }),
  unitSystem: z.enum(["metric", "imperial"]),
  dateFormat: z.enum(["dmy", "mdy", "ymd"]),
  timeZone: z
    .string()
    .trim()
    .optional()
    .transform((v) => v ?? "")
    .refine((v) => v === "" || isValidTimeZone(v), {
      message: "That time zone was not recognised. Pick one from the list.",
    }),
  locationWord: required(30, "What you call a place"),
  showSetupOffer: checkbox,
});

// ---------- Helpers ----------

/** Turns a parsed form body into plain string fields (the first value for each name). Files are dropped. */
export function formValues(body: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    const first: unknown = Array.isArray(v) ? (v as unknown[])[0] : v;
    if (typeof first === "string") out[k] = first;
  }
  return out;
}

/** All string values for a repeated field name, such as the lines of a delivery. */
export function formList(body: Record<string, unknown>, name: string): string[] {
  const v = body[name];
  const list: unknown[] = Array.isArray(v) ? (v as unknown[]) : v === undefined ? [] : [v];
  return list.map((x) => (typeof x === "string" ? x : ""));
}

/** The first validation message, for showing above a form. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Something in the form is not right. Check it and try again.";
}

/** Converts a local date and time typed in a time zone to an ISO timestamp, or null for "now". */
export function localToIso(value: string | null, timeZone: string): string | null {
  if (!value) return null;
  const [day, time] = value.split("T");
  if (!day) return null;
  const iso = zonedInstant(day, time ?? "12:00", timeZone).toISOString();
  // Never in the future: a date typed for later today becomes now.
  return Date.parse(iso) > Date.now() ? new Date().toISOString() : iso;
}
