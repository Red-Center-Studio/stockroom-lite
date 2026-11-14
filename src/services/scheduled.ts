import { type Bindings, isOn } from "../env";
import { resetDemo } from "./demo";

/**
 * What the daily Cron Trigger does (15:00 UTC, see triggers in wrangler.jsonc). In demo mode it wipes and reloads
 * the demo data. Otherwise it does nothing.
 */
export async function runScheduled(env: Bindings, now: Date): Promise<{ demoReset: boolean }> {
  let demoReset = false;
  if (isOn(env.DEMO_MODE)) {
    try {
      demoReset = await resetDemo(env, now);
    } catch (err) {
      console.error(JSON.stringify({ event: "demo_reset_failed", error: String(err) }));
    }
  }
  console.log(JSON.stringify({ event: "scheduled", at: now.toISOString(), demoReset }));
  return { demoReset };
}
