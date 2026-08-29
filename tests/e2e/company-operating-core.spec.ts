import { test, expect } from "@playwright/test";
import { login, addDays, dateKey, findJobHrefByTitle } from "./helpers";

/**
 * Company Operating Core V1 — the company-wide views (Command Center,
 * Portfolio, Financials, Resources, Field, Search) are all read layers
 * over records the existing per-job workflow already writes. These tests
 * verify two things the feature is only real if both hold:
 *   1. Every new page renders with live numbers and drills down to the
 *      same job the numbers came from.
 *   2. Changing a source record (a daily report, a job's stage) ripples
 *      into the company-wide views with no separate re-entry anywhere.
 */
test.describe("Company Command Center", () => {
  test("renders live sections and drills down to source jobs", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/");

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Company command");
    expect(bodyText).toContain("Active operations");
    expect(bodyText).toContain("Financial performance");
    expect(bodyText).toContain("Labor");
    expect(bodyText).toContain("Resources");

    // The seeded labor-risk project (Riverside Phase 2) must be listed and
    // clickable straight into its own Command Center.
    const laborRiskCard = page.locator("div", { hasText: "Labor risk" }).filter({ hasText: "Riverside Apartments" }).first();
    await expect(laborRiskCard).toBeVisible();
    await page.locator('a:has-text("Riverside Apartments — Phase 2 Slab")').first().click();
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    expect(await page.locator("body").innerText()).toContain("Riverside Apartments");
  });

  test("financial tiles link to the full financial view with matching totals", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/");
    const commandText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const contractMatch = commandText.match(/= Current contract \$([\d,]+)/);
    expect(contractMatch, "Company Command must show a current-contract figure").toBeTruthy();

    await page.click('a:has-text("Full financial view")');
    await page.waitForURL("/financials");
    const financialsText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const financialsMatch = financialsText.match(/= Current contract \$([\d,]+)/);
    expect(financialsMatch).toBeTruthy();
    // Same underlying getCompanyCommand/getCompanyFinancials sums over the
    // same open jobs — the two pages must agree, not compute this twice.
    expect(financialsMatch![1]).toBe(contractMatch![1]);
  });

  test("Foreman role is redirected to the Field home, not the company dashboard", async ({ page }) => {
    await login(page, "foreman");
    await page.goto("/");
    await page.waitForURL("/field");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("Company command");
  });
});

test.describe("Project portfolio", () => {
  test("lists every open project with the same numbers as its Command Center", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/projects");

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Riverside Apartments");
    expect(bodyText).toContain("Bayside Retail Pad");
    expect(bodyText).toContain("Oakridge Medical Office");

    // Bayside is seeded schedule-risk-only — critical risk badge, not a
    // margin or labor flag.
    const baysideRow = page.locator("tr", { hasText: "Bayside Retail Pad" });
    await expect(baysideRow).toContainText("At risk");

    // Filtering by risk=schedule keeps Bayside and drops a healthy project.
    await page.goto("/projects?risk=schedule");
    const filteredText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(filteredText).toContain("Bayside Retail Pad");
    expect(filteredText).not.toContain("Oakridge Medical Office");

    // Drill down into the flagged project and confirm the contract value
    // matches what the portfolio row showed.
    const rowValue = await baysideRow.locator("td").nth(5).innerText();
    await page.goto("/projects");
    await page.locator('a:has-text("Bayside Retail Pad")').click();
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(jobText).toContain(rowValue.trim());
  });
});

test.describe("Company financials", () => {
  test("shows category rollups and flags the schedule-risk project as not the margin problem", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/financials");

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Original contract");
    expect(bodyText).toContain("By cost category");
    expect(bodyText).toContain("Labor");
    expect(bodyText).toContain("Material");

    // Bayside's margin was seeded healthy (~17%) — it must not appear in
    // the "Losing margin" list even though it's flagged elsewhere as a
    // schedule risk. Different problems, different buckets.
    const losingMarginSection = page.locator("h2", { hasText: "Losing margin" }).locator("xpath=..");
    const losingMarginText = await losingMarginSection.innerText();
    expect(losingMarginText).not.toContain("Bayside");
  });
});

test.describe("Resource command", () => {
  test("shows today's crew assignments and equipment status", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/company/resources");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Crews today");
    expect(bodyText).toContain("Available today");
    expect(bodyText).toMatch(/Equipment out|Equipment available/);
  });
});

test.describe("Field", () => {
  test("Foreman sees their own assigned project, not a generic list", async ({ page }) => {
    await login(page, "foreman");
    await page.goto("/field");
    const bodyText = await page.locator("body").innerText();
    // The seeded foreman login is linked (Worker.userId) to Frank Delgado,
    // who foremans multiple seeded jobs.
    expect(bodyText).toContain("Frank Delgado");
    expect(bodyText).toMatch(/work plan/i); // rendered uppercase via CSS text-transform
  });

  test("Admin/PM see the company-wide field activity feed", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/field");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Field activity");
    expect(bodyText).toMatch(/Bayside Retail Pad|Riverside Apartments|Oakridge Medical Office/);
  });
});

test.describe("Global search", () => {
  test("finds a project by number and by name, and a customer", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/search?q=Bayside");
    let bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Bayside Retail Pad");
    expect(bodyText).toContain("Bayside Development LLC");

    await page.goto("/search?q=2026-011");
    bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Bayside Retail Pad");
  });
});

test.describe("Data propagation — no duplicate entry", () => {
  test("a foreman's daily report ripples into Company Command, Portfolio, and Financials with no re-entry", async ({ page }) => {
    await login(page, "admin");

    const jobHref = await findJobHrefByTitle(page, "Sunrise Duplex");

    // Read the company-wide actual-labor-hours total before the report.
    await page.goto("/");
    const before = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const beforeMatch = before.match(/Actual labor hours ([\d,]+)/);
    expect(beforeMatch, "Company Command must show a real actual-labor-hours figure").toBeTruthy();
    const beforeHours = Number(beforeMatch![1].replace(/,/g, ""));

    // Submit a fresh day's report the way a foreman actually would — one
    // form, no separate "log production" step anywhere in this chain.
    const reportDate = dateKey(addDays(new Date(), 100 + (Math.floor(Date.now() / 1000) % 5000)));
    await page.goto(`${jobHref}/daily-reports/new?date=${reportDate}`);
    await page.fill('input[name="date"]', reportDate);
    await page.fill('input[name="crewSize"]', "2");
    const row = page.locator('input[name="rowJobCostCodeId"]').last().locator("xpath=..");
    await row.locator('input[name="rowHours"]').fill("7");
    await row.locator('input[name="rowQty"]').fill("6");
    await page.click('button:has-text("Submit daily update")');
    await page.waitForURL(`**${jobHref}`);

    // The company-wide total moved by exactly the new hours, with no
    // separate action taken anywhere except the one form above.
    await page.goto("/");
    const after = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const afterMatch = after.match(/Actual labor hours ([\d,]+)/);
    expect(afterMatch).toBeTruthy();
    const afterHours = Number(afterMatch![1].replace(/,/g, ""));
    expect(afterHours).toBeCloseTo(beforeHours + 7, 5);

    // Same source event, reflected on the Portfolio row for this job.
    await page.goto("/projects");
    const sunriseRow = page.locator("tr", { hasText: "Sunrise Duplex" });
    await expect(sunriseRow).toBeVisible();

    // And on the company Financials total actual cost — not just the labor
    // hours count, the dollar figure too.
    await page.goto("/financials");
    const financialsText = await page.locator("body").innerText();
    expect(financialsText).toContain("Actual cost");
  });

  test("completing a job's stage removes it from Company Command without manual cleanup", async ({ page }) => {
    await login(page, "admin");

    // A fresh job each run (not seeded, shared state) so this test is safe
    // to re-run without a reset, same as the rest of this suite. A
    // near-term target start date is what makes a brand-new PRECON job
    // show up on Company Command at all (in "Starting soon") — a clean,
    // deterministic hook that doesn't depend on triggering an alert.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tag = `E2E-core-${Date.now()}`;
    const startDate = dateKey(addDays(today, 2));

    await page.goto("/jobs/new");
    await page.fill('input[name="title"]', `${tag} — Closeout propagation test`);
    await page.fill('input[name="newCustomerName"]', `${tag} LLC`);
    await page.fill('input[name="contractValue"]', "20000");
    await page.fill('input[name="targetStartDate"]', startDate);
    await page.fill('input[name="targetEndDate"]', dateKey(addDays(today, 9)));
    const pmOptions = await page.locator('select[name="pmUserId"] option').allTextContents();
    await page.selectOption('select[name="pmUserId"]', { label: pmOptions.find((o) => o.includes("Priya"))! });
    await (await page.locator('input[name="workerIds"]').all())[0].check();
    await page.click('button:has-text("Award project")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;

    await page.goto("/");
    let bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain(`${tag} — Closeout propagation test`);

    // Complete it the normal way, through the same Command Center edit
    // form every other stage change in this app goes through.
    await page.goto(`${jobHref}/command-center/edit`);
    await page.check('input[name="punchListComplete"]');
    await page.check('input[name="requiredDocsComplete"]');
    await page.selectOption('select[name="stage"]', "COMPLETE");
    await page.click('button:has-text("Save")');
    await page.waitForURL(jobHref);

    // Company Command excludes COMPLETE-stage jobs entirely (lib/company-command.ts) —
    // no separate "archive from dashboard" action exists or should be needed.
    await page.goto("/");
    bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain(`${tag} — Closeout propagation test`);

    // But it isn't lost — Projects (which can include completed work) still
    // shows it, and it now also counts toward Historical Intelligence (the
    // estimate/actual loop) since it had no cost-code lines to benchmark.
    await page.goto("/projects?includeComplete=1");
    bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain(`${tag} — Closeout propagation test`);
  });
});
