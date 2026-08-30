import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Role-by-role usability & pilot-readiness pass: each persona should land
 * somewhere that answers "what do I do right now" without hunting through
 * ten nav links — Executive gets the company-wide rollup, PM gets their own
 * jobs' exceptions, Estimator gets the pipeline with what's due soon
 * surfaced, Accounting gets Cash with what needs action surfaced, Foreman
 * (unaffected by this phase, already the best of the five) keeps its
 * existing personal home.
 */
test.describe("PM landing", () => {
  test("a PM lands on their own Action Center, not the company-wide dashboard", async ({ page }) => {
    await login(page, "pm");
    await expect(page).toHaveURL(/\/today$/);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("My action center");
  });

  test("a PM's default view excludes another PM's job, and 'Show every project' reveals it", async ({ page }) => {
    await login(page, "pm");
    // Already on /today (My action center) from login.
    let bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("Lakeview Terrace");

    await page.click('a:has-text("Show every project")');
    await expect(page).toHaveURL(/\/today\?all=1$/);
    bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Company action center");
    expect(bodyText).toContain("Lakeview Terrace");
    expect(bodyText).toMatch(/past target finish date/);

    await page.click('a:has-text("Back to my jobs")');
    await expect(page).toHaveURL(/\/today$/);
    bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("Lakeview Terrace");
  });

  test("a PM can still reach the full Company Command Center from the nav", async ({ page }) => {
    await login(page, "pm");
    await page.click('nav a:has-text("Command")');
    await expect(page).toHaveURL(/\/\?view=command$/);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Company command");
  });
});

test.describe("Executive landing", () => {
  test("an ADMIN still lands on the company-wide Command Center", async ({ page }) => {
    await login(page, "admin");
    await expect(page).toHaveURL(/\/$/);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Company command");
  });
});

test.describe("Estimator workspace", () => {
  test("the Pipeline surfaces what's due soon and what still needs cost-code lines", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/opportunities");

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Needs attention");
    expect(bodyText).toMatch(/Elm Terrace — Site Utilities[\s\S]*?Due (today|in \d+ day\(s\))/);
    expect(bodyText).toContain("No cost code lines yet");

    // Cross-linked to historical rates, not a dead end.
    await page.click('a:has-text("Historical rates")');
    await expect(page).toHaveURL(/\/cost-codes$/);
    expect(await page.locator("body").innerText()).toContain("Cost codes");
    await page.click('a:has-text("Pipeline")');
    await expect(page).toHaveURL(/\/opportunities$/);
  });
});

test.describe("Accounting workspace", () => {
  test("Cash surfaces releasable retainage and severely-overdue AR/AP as one needs-action list", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/cash");

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Needs action");
    expect(bodyText).toMatch(/Westgate Plaza[\s\S]*?(AR overdue|AP overdue|held by owner|owed to)/);

    // Cross-linked to the GL export settings, not a dead end.
    await page.click('a:has-text("GL export mapping")');
    await expect(page).toHaveURL(/\/accounting$/);
    await page.click('a:has-text("AR/AP, retainage")');
    await expect(page).toHaveURL(/\/cash$/);
  });
});

test.describe("Foreman landing (unaffected by this phase)", () => {
  test("a Foreman still lands on their own personal Today home with a minimal nav", async ({ page }) => {
    await login(page, "foreman");
    await expect(page).toHaveURL(/\/field$/);
    const navLinks = await page.locator("header nav a").allTextContents();
    expect(navLinks).toEqual(["CrewSync", "Today", "Schedule"]);
  });
});
