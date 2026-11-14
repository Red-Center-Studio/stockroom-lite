import { expect, test, type Page } from "@playwright/test";

// Phone checks at 375px and 390px wide (the phone projects in playwright.config.ts): no sideways page scroll, tap
// targets at least 44px, form text large enough that phones do not zoom in, number keyboards for quantities, and a
// menu that opens. Links inside running text are left out of the tap target check (WCAG lets them be smaller).

const SIGNED_IN = [
  "/dashboard",
  "/stock",
  "/record",
  "/count",
  "/items",
  "/items/new",
  "/locations",
  "/locations/new",
  "/activity",
  "/setup",
  "/account",
];
const SIGNED_OUT = ["/login", "/signup", "/forgot-password", "/terms", "/privacy"];

async function phoneProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth - doc.clientWidth > 1)
      problems.push(`page scrolls sideways by ${doc.scrollWidth - doc.clientWidth}px`);
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("name") || "").trim().slice(0, 40)}"`;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden";
    };
    const inText = (el: Element) => {
      if (el.tagName !== "A") return false;
      if (getComputedStyle(el).display !== "inline") return false;
      const parent = el.parentElement;
      const text = parent ? (parent.textContent ?? "").trim() : "";
      return text.length > (el.textContent ?? "").trim().length + 3;
    };
    const targets = document.querySelectorAll(
      "a[href], button, summary, select, textarea, input:not([type=hidden]):not([type=radio]):not([type=checkbox])",
    );
    for (const el of targets) {
      if (!visible(el) || inText(el) || el.classList.contains("sr-only")) continue;
      // A control inside a label counts the whole label as its tap area.
      const box = (el.closest("label") ?? el).getBoundingClientRect();
      if (box.height < 43.5) problems.push(`${name(el)} is ${Math.round(box.height)}px tall`);
      if (box.width < 43.5) problems.push(`${name(el)} is ${Math.round(box.width)}px wide`);
    }
    for (const el of document.querySelectorAll("input[type=radio], input[type=checkbox]")) {
      if (!visible(el)) continue;
      const label = el.closest("label");
      const box = (label ?? el).getBoundingClientRect();
      if (box.height < 43.5) problems.push(`${name(label ?? el)} choice is ${Math.round(box.height)}px tall`);
    }
    for (const el of document.querySelectorAll("input, select, textarea")) {
      if (!visible(el) || ["radio", "checkbox", "hidden", "file"].includes((el as HTMLInputElement).type)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 16) problems.push(`${name(el)} text is ${size}px (phones zoom in below 16px)`);
    }
    for (const el of document.querySelectorAll<HTMLInputElement>(
      "input[name*=qty i], input[name*=quantity i], input[name*=counted i], input[name^=count]",
    )) {
      if (el.type !== "number" && !["decimal", "numeric"].includes(el.inputMode))
        problems.push(`${name(el)} should open a number keyboard`);
    }
    const body = parseFloat(getComputedStyle(document.body).fontSize);
    if (body < 16) problems.push(`body text is ${body}px`);
    return problems;
  });
}

test.beforeEach(({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 768, "phone checks only");
});

test.describe("signed in on a phone", () => {
  test.use({ storageState: ".e2e-state/admin.json" });

  for (const path of SIGNED_IN) {
    test(`${path} works on a phone`, async ({ page }) => {
      await page.goto(path);
      expect(await phoneProblems(page)).toEqual([]);
    });
  }

  test("detail and count pages work on a phone", async ({ page }) => {
    await page.goto("/items");
    await page.locator("main a[href^='/items/']:not([href='/items/new'])").first().click();
    expect(await phoneProblems(page)).toEqual([]);
    await page.goto("/locations");
    await page.locator("main a[href^='/locations/']:not([href='/locations/new'])").first().click();
    expect(await phoneProblems(page)).toEqual([]);
    await page.goto("/count");
    await page.locator("main a[href^='/count/']").first().click();
    expect(await phoneProblems(page)).toEqual([]);
  });

  test("the menu opens and every link is a large tap target", async ({ page }) => {
    await page.goto("/dashboard");
    const menu = page.getByRole("navigation", { name: "Main" });
    await expect(menu.getByRole("link", { name: "Activity" })).toBeHidden();
    await menu.getByText("Menu").click();
    await expect(menu.getByRole("link", { name: "Activity" })).toBeVisible();
    expect(await phoneProblems(page)).toEqual([]);
    await menu.getByRole("link", { name: "Activity" }).click();
    await expect(page).toHaveURL(/\/activity$/);
  });
});

test.describe("signed out on a phone", () => {
  for (const path of SIGNED_OUT) {
    test(`${path} works on a phone`, async ({ page }) => {
      await page.goto(path);
      expect(await phoneProblems(page)).toEqual([]);
    });
  }
});
