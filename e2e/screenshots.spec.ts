import { mkdirSync } from "node:fs";
import { test } from "@playwright/test";

// README screenshots from the seeded demo data. Run with: npm run screenshots
// Desktop shots are 1200 px wide; phone shots are 390 px wide at 2x (780 px images).
const DIR = process.env.SHOTS_DIR ?? "docs/screenshots";
mkdirSync(DIR, { recursive: true });

test.use({ storageState: ".e2e-state/manager.json" });

const desktop = [
  ["binwright-lite-dashboard", "/dashboard"],
  ["binwright-lite-stock", "/stock"],
] as const;

for (const [name, path] of desktop) {
  test(`desktop ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 860 });
    await page.goto(path);
    await page.screenshot({ path: `${DIR}/${name}.jpg`, type: "jpeg", quality: 88 });
  });
}

test("desktop item page", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 860 });
  await page.goto("/items?q=gloves");
  await page.locator("table a").first().click();
  await page.screenshot({ path: `${DIR}/binwright-lite-item.jpg`, type: "jpeg", quality: 88 });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test("record form", async ({ page }) => {
    await page.goto("/record");
    await page.getByLabel("Item").selectOption({ label: "Nitrile gloves (M) (GLV-M)" });
    await page.getByLabel("Location").selectOption({ label: "Van 2 (Marco)" });
    await page.getByLabel("Quantity").fill("1");
    await page.screenshot({ path: `${DIR}/binwright-lite-record-mobile.jpg`, type: "jpeg", quality: 88 });
  });

  test("home on a phone", async ({ page }) => {
    await page.goto("/dashboard");
    await page.screenshot({ path: `${DIR}/binwright-lite-dashboard-mobile.jpg`, type: "jpeg", quality: 88 });
  });
});
