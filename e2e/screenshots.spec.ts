import { mkdirSync } from "node:fs";
import { test } from "@playwright/test";

// README screenshots from the seeded demo data. Run with: npm run screenshots
// Desktop shots are 1200 px wide; phone shots are 390 px wide at 2x (780 px images).
const DIR = process.env.SHOTS_DIR ?? "docs/screenshots";
mkdirSync(DIR, { recursive: true });

test.use({ storageState: ".e2e-state/manager.json" });

const desktop = [
  ["stockroom-lite-dashboard", "/dashboard"],
  ["stockroom-lite-stock", "/stock"],
] as const;

for (const [name, path] of desktop) {
  test(`desktop ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 860 });
    await page.goto(path);
    await page.screenshot({ path: `${DIR}/${name}.jpg`, type: "jpeg", quality: 88 });
  });
}

// Home screen at ad and social sizes (landscape 1200x628 and square 1200x1200).
for (const [w, h] of [
  [1200, 628],
  [1200, 1200],
] as const) {
  test(`home ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/dashboard");
    await page.screenshot({ path: `${DIR}/stockroom-lite-home-${w}x${h}.jpg`, type: "jpeg", quality: 90 });
  });
}

test("desktop item page", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 860 });
  await page.goto("/items?q=gloves");
  await page.locator("table a").first().click();
  await page.screenshot({ path: `${DIR}/stockroom-lite-item.jpg`, type: "jpeg", quality: 88 });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test("record form", async ({ page }) => {
    await page.goto("/record");
    await page.getByLabel("Item").selectOption({ label: "Nitrile gloves (M) (GLV-M)" });
    await page.getByLabel("Location").selectOption({ label: "Van 2 (Marco)" });
    await page.getByLabel("Quantity").fill("1");
    await page.screenshot({ path: `${DIR}/stockroom-lite-record-mobile.jpg`, type: "jpeg", quality: 88 });
  });

  test("home on a phone", async ({ page }) => {
    await page.goto("/dashboard");
    await page.screenshot({ path: `${DIR}/stockroom-lite-dashboard-mobile.jpg`, type: "jpeg", quality: 88 });
  });
});
