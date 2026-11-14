import { type Bindings, isOn } from "../env";
import { demoStatements } from "../seed/demo";

/**
 * Wipes and reloads the demo data. Runs from the daily Cron Trigger, and only when DEMO_MODE is "true",
 * so it can never touch a real business's data by accident.
 */
export async function resetDemo(env: Bindings, now = new Date()): Promise<boolean> {
  if (!isOn(env.DEMO_MODE)) return false;
  const statements = await demoStatements(now);
  await env.DB.batch(statements.map((s) => env.DB.prepare(s.sql).bind(...s.params)));
  console.log(JSON.stringify({ event: "demo_reset", statements: statements.length }));
  return true;
}
