import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { appSettings, type AppSettings } from "../db/schema";
import type { AppUser } from "../env";
import { can } from "../lib/can";
import { denied, type Result } from "./result";

/** The one settings row. Recreated with defaults if someone deleted it by hand. */
export async function getSettings(db: DB): Promise<AppSettings> {
  const row = await db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  if (row) return row;
  await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
  const created = await db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  if (!created) throw new Error("Settings row missing");
  return created;
}

export type SettingsInput = Pick<
  AppSettings,
  | "businessName"
  | "supportEmail"
  | "currency"
  | "unitSystem"
  | "dateFormat"
  | "timeZone"
  | "locationWord"
  | "showSetupOffer"
>;

export async function updateSettings(db: DB, actor: AppUser, input: SettingsInput): Promise<Result> {
  if (!can(actor, "settings:edit")) return denied("change settings");
  await db
    .update(appSettings)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(appSettings.id, 1));
  return { ok: true };
}
