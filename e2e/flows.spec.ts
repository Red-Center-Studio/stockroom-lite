import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Real browser flows against the demo data, at desktop and phone width, with an axe accessibility check
// (WCAG 2.2 A and AA rules) on every main page.

const PAGES = ["/dashboard", "/stock", "/record", "/count", "/items", "/locations", "/activity", "/setup", "/account"];

test.describe("as an admin", () => {
  test.use({ storageState: ".e2e-state/admin.json" });

  for (const path of PAGES) {
    test(`${path} has no accessibility problems and no sideways scroll`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("h1")).toHaveCount(1);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
        [],
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test("item and place pages are accessible too", async ({ page }) => {
    await page.goto("/items");
    await page.locator("table a").first().click();
    let results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await page.goto("/locations");
    await page.locator("main ul a").first().click();
    results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

test.describe("as staff", () => {
  test.use({ storageState: ".e2e-state/staff.json" });

  test("record use from a van and see the new balance", async ({ page }) => {
    await page.goto("/record");
    await page.getByLabel("Item").selectOption({ label: "Nitrile gloves (M) (GLV-M)" });
    await page.getByLabel("Location").selectOption({ label: "Van 1 (Priya)" });
    await page.getByLabel("Quantity").fill("1");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/Saved\. Used 1 box of Nitrile gloves \(M\) at Van 1 \(Priya\)\./)).toBeVisible();
  });

  test("the move fields only show for a move", async ({ page }) => {
    await page.goto("/record");
    await expect(page.getByLabel("Move it to")).toBeHidden();
    await page.getByLabel("Move to another place").check();
    await expect(page.getByLabel("Move it to")).toBeVisible();
  });

  test("count a place", async ({ page }) => {
    await page.goto("/count");
    await page.getByRole("link", { name: /Workshop/ }).click();
    await page.getByLabel("Grease cartridge 450 g").fill("3");
    await page.getByRole("button", { name: "Save counts" }).click();
    await expect(page.getByText(/Saved 1 count/)).toBeVisible();
  });
});

test.describe("as a manager", () => {
  test.use({ storageState: ".e2e-state/manager.json" });

  test("the home page lists what is low", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Needs ordering" })).toBeVisible();
    await expect(page.getByText(/brings it back to target/).first()).toBeVisible();
  });
});
