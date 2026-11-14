import type { AppSettings } from "../db/schema";

/**
 * Per-install region settings: currency, unit system, date format and time zone, chosen on the Setup page.
 * Every date, quantity and amount shown in the app goes through these helpers.
 */

export type DateFormat = "dmy" | "mdy" | "ymd";
export type UnitSystem = "metric" | "imperial";

export interface Region {
  currency: string;
  unitSystem: UnitSystem;
  dateFormat: DateFormat;
  timeZone: string;
}

export const DATE_FORMATS: Record<DateFormat, { label: string; example: string }> = {
  dmy: { label: "Day month year", example: "13 Nov 2026" },
  mdy: { label: "Month day year", example: "Nov 13, 2026" },
  ymd: { label: "Year month day", example: "2026-11-13" },
};

export const UNIT_SYSTEMS: Record<UnitSystem, string> = {
  metric: "Metric (kg, L, m)",
  imperial: "US and imperial (lb, gal, ft)",
};

/** Time zones offered on the Setup page. Any valid IANA name is accepted. */
export const COMMON_TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

let KNOWN_CURRENCIES: Set<string> | null = null;

export function isValidCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  // Intl formats any three letters, so check against the list of real currencies where the runtime has it.
  if (KNOWN_CURRENCIES === null) {
    try {
      KNOWN_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));
    } catch {
      KNOWN_CURRENCIES = new Set();
    }
  }
  if (KNOWN_CURRENCIES.size > 0 && !KNOWN_CURRENCIES.has(code)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

export function regionFrom(
  settings: Pick<AppSettings, "currency" | "unitSystem" | "dateFormat" | "timeZone">,
  fallbackTz: string,
): Region {
  const tz = isValidTimeZone(settings.timeZone) ? settings.timeZone : isValidTimeZone(fallbackTz) ? fallbackTz : "UTC";
  const currency = isValidCurrency(settings.currency) ? settings.currency : "USD";
  return { currency, unitSystem: settings.unitSystem, dateFormat: settings.dateFormat, timeZone: tz };
}

const LOCALE: Record<DateFormat, string> = { dmy: "en-GB", mdy: "en-US", ymd: "en-CA" };

/** An amount of money in the install's currency, such as "$12.50" or "JP¥1,200". */
export function formatMoney(amount: number | null | undefined, r: Pick<Region, "currency" | "dateFormat">): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat(LOCALE[r.dateFormat], { style: "currency", currency: r.currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${r.currency}`;
  }
}

/** Rounds a quantity to 3 decimal places, so 0.1 + 0.2 shows as 0.3. */
export const roundQty = (n: number): number => Math.round(n * 1000) / 1000;

/** A stock quantity with its unit: "12 each", "2.5 kg". */
export function formatQty(n: number, unit = ""): string {
  const v = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(roundQty(n));
  return unit ? `${v} ${unit}` : v;
}

function safeFormat(d: Date, opts: Intl.DateTimeFormatOptions, locale: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...opts, timeZone }).format(d);
  } catch {
    return `${new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(d)} UTC`;
  }
}

/** A stored ISO timestamp as a date and time in this region's format and time zone. */
export function formatWhen(iso: string | null, r: Pick<Region, "dateFormat" | "timeZone">): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (r.dateFormat === "ymd") {
    const day = ymdInZone(d, r.timeZone);
    const time = safeFormat(d, { hour: "2-digit", minute: "2-digit", hour12: false }, "en-GB", r.timeZone);
    return `${day} ${time}`;
  }
  return safeFormat(
    d,
    { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" },
    LOCALE[r.dateFormat],
    r.timeZone,
  );
}

/** A YYYY-MM-DD date in this region's format. */
export function formatDay(ymd: string | null, r: Pick<Region, "dateFormat">): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  if (r.dateFormat === "ymd") return ymd;
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE[r.dateFormat], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** The calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function ymdInZone(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The hour (0 to 23) of an instant in a time zone. */
export function hourInZone(d: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
  }).format(d);
  return Number(h) % 24;
}

/** Minutes the time zone is ahead of UTC at an instant (negative west of Greenwich). */
function zoneOffsetMinutes(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60_000);
}

/** The UTC instant of a local date and time (YYYY-MM-DD, HH:MM) in a time zone, daylight saving included. */
export function zonedInstant(ymd: string, hhmm: string, timeZone: string): Date {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const localAsUtc = Date.parse(`${ymd}T${hhmm}:00Z`);
  let guess = localAsUtc;
  for (let i = 0; i < 3; i++) {
    const next = localAsUtc - zoneOffsetMinutes(new Date(guess), tz) * 60_000;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Whole days between two YYYY-MM-DD dates (b minus a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
