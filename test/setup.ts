import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Every test starts from an empty database (with the default settings row).
beforeEach(async () => {
  await env.DB.batch(
    ["movement", "stock_level", "item", "location", "session", "account", "verification", "user"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
  await env.DB.prepare(
    `UPDATE app_settings SET business_name = 'My Business', support_email = '', show_setup_offer = 1, currency = 'USD',
      unit_system = 'metric', date_format = 'dmy', time_zone = '', location_word = 'Location' WHERE id = 1`,
  ).run();
});
