import { test, expect } from "@playwright/test";
import { login, addDays, dateKey, findJobHrefByTitle } from "./helpers";

/**
 * The Estimate <-> Actual Closed Loop: historical productivity surfaced at
 * estimate time, filterable history, a recommended rate, an accuracy
 * verdict per cost code, and — the loop-closing step — a job reaching
 * COMPLETE automatically feeding its own numbers back into that history.
 *
 * Relies on seeded history (prisma/seed.ts): cost code "03 20 00"
 * (Reinforcing steel placement, unit TON) has three completed jobs at a
 * consistent ~19% hours-per-unit overrun, giving the accuracy dashboard an
 * unambiguous "consistently underestimated" verdict to assert against.
 */
test.describe("Estimate <-> actual closed loop", () => {
  test("Award form and Add Budget Line form surface historical rates for a code with completed-job history", async ({ page }) => {
    await login(page, "admin");

    // --- Award form ---
    await page.goto("/jobs/new");
    const costCodeOptions = await page.locator('select[name="costCodeId"] option').allTextContents();
    const rebarLabel = costCodeOptions.find((o) => o.includes("03 20 00"));
    expect(rebarLabel, "seeded rebar cost code must be selectable on the Award form").toBeTruthy();
    await page.selectOption('select[name="costCodeId"]', { label: rebarLabel! });

    let bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Recommended");
    expect(bodyText).toMatch(/hrs\/TON/);
    // 3 completed jobs on this code qualifies for the "recent jobs" source
    // (recordbreak at >=2) rather than the all-time-company fallback.
    expect(bodyText).toContain("recent jobs");

    await page.fill('input[name="costCodeQty"]', "10");
    await page.click('button:has-text("Use recommended")');
    const filledHours = await page.locator('input[name="costCodeHours"]').inputValue();
    expect(Number(filledHours)).toBeCloseTo(47.5, 1); // 4.75 hrs/TON recommended rate x 10 TON

    // --- Add Budget Line form (on an existing job) ---
    const jobHref = await findJobHrefByTitle(page, "Sunrise Duplex");
    await page.goto(`${jobHref}/cost-codes/new`);

    const budgetLineOptions = await page.locator('select[name="costCodeId"] option').allTextContents();
    const rebarBudgetLabel = budgetLineOptions.find((o) => o.includes("03 20 00"));
    expect(rebarBudgetLabel).toBeTruthy();
    await page.selectOption('select[name="costCodeId"]', { label: rebarBudgetLabel! });

    bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Historical productivity for this code");
    expect(bodyText).toContain("Company rate (all-time)");
    expect(bodyText).toContain("Recent-job rate");
    expect(bodyText).toMatch(/Recommended:\s*4\.75 hrs\/TON/);
    // Not submitted — this job already has other cost-code lines and this
    // check only needs the panel to render with real numbers, not a write.
  });

  test("historical productivity filters on /cost-codes actually filter results", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/cost-codes");

    // Column-anchored so a stray digit inside a code or a number never
    // produces a false match — each row is code, description, unit, total
    // hours, total qty, avg rate, # jobs, in that exact order.
    function parseRow(bodyText: string, code: string, description: string, unit: string) {
      const re = new RegExp(`${code} ${description} ${unit} ([\\d.]+|—) ([\\d.]+|—) ([\\d.]+|—) (\\d+|—)`);
      const m = bodyText.match(re);
      expect(m, `row for ${code} should be parseable`).toBeTruthy();
      return { totalHours: m![1], totalQty: m![2], avgRate: m![3], jobCount: m![4] };
    }

    // Unfiltered: rebar (Foundation pour, 3 jobs) and excavation
    // (Residential patio & walkway, 1 job) both show real job counts.
    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(parseRow(bodyText, "03 20 00", "Reinforcing steel placement", "TON").jobCount).toBe("3");
    expect(parseRow(bodyText, "31 23 00", "Excavation", "CY").jobCount).toBe("1");

    // Filter to "Foundation pour" — excavation's only benchmark is under a
    // different project type, so it should drop to zero jobs while rebar
    // (all three of its historical jobs are Foundation pour) stays at 3.
    await page.selectOption('select[name="projectType"]', { label: "Foundation pour" });
    await page.click('button:has-text("Apply filters")');
    await page.waitForURL(/projectType=/);

    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(parseRow(bodyText, "03 20 00", "Reinforcing steel placement", "TON").jobCount).toBe("3");
    expect(parseRow(bodyText, "31 23 00", "Excavation", "CY").jobCount).toBe("—");

    // A "Clear" link appears once a filter is active, and clears it.
    await page.click('a:has-text("Clear")');
    await page.waitForURL((url) => !url.search.includes("projectType"));
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(parseRow(bodyText, "31 23 00", "Excavation", "CY").jobCount).toBe("1");

    // Filter by quantity range narrow enough to exclude the rebar jobs
    // (8-10 TON each) entirely.
    await page.goto("/cost-codes?qtyMin=1000&qtyMax=2000");
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(parseRow(bodyText, "03 20 00", "Reinforcing steel placement", "TON").jobCount).toBe("—");
  });

  test("estimating accuracy dashboard shows a consistently-underestimated verdict for the seeded rebar history", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/cost-codes");

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const idx = bodyText.indexOf("03 20 00");
    expect(idx).toBeGreaterThanOrEqual(0);
    const rebarSection = bodyText.slice(idx, idx + 250);
    expect(rebarSection).toContain("Consistently underestimated");
    // All three seeded jobs land 17.5-20.8% over — average is comfortably
    // within a tight band around 19%.
    expect(rebarSection).toMatch(/\+1[5-9]\.\d%|\+20\.\d%/);
  });

  test("completing a job's stage snapshots its finished cost-code lines into the estimating history live", async ({ page }) => {
    await login(page, "admin");

    // Read the rebar code's current totals before adding a new completed job.
    const rebarRowRe = /03 20 00 Reinforcing steel placement TON ([\d.]+) ([\d.]+) ([\d.]+) (\d+)/;
    await page.goto("/cost-codes");
    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const beforeMatch = bodyText.match(rebarRowRe);
    expect(beforeMatch, "rebar row must be parseable from the historical productivity table").toBeTruthy();
    const beforeJobCount = Number(beforeMatch![4]);

    // Award a fresh job on the rebar cost code.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const startDate = dateKey(today);
    const endDate = dateKey(addDays(today, 3));
    const tag = `E2E-loop-${Date.now()}`;

    await page.goto("/jobs/new");
    await page.fill('input[name="title"]', `${tag} — Rebar closeout test`);
    await page.fill('input[name="newCustomerName"]', `${tag} Holdings LLC`);
    await page.fill('input[name="location"]', "1 Test Loop Rd");
    await page.fill('input[name="contractValue"]', "9000");
    await page.fill('input[name="targetStartDate"]', startDate);
    await page.fill('input[name="targetEndDate"]', endDate);

    const pmOptions = await page.locator('select[name="pmUserId"] option').allTextContents();
    await page.selectOption('select[name="pmUserId"]', { label: pmOptions.find((o) => o.includes("Priya"))! });
    const foremanOptions = await page.locator('select[name="foremanWorkerId"] option').allTextContents();
    await page.selectOption('select[name="foremanWorkerId"]', { label: foremanOptions.find((o) => o.includes("Frank"))! });
    await (await page.locator('input[name="workerIds"]').all())[0].check();

    const costCodeOptions = await page.locator('select[name="costCodeId"] option').allTextContents();
    await page.selectOption('select[name="costCodeId"]', { label: costCodeOptions.find((o) => o.includes("03 20 00"))! });
    await page.fill('input[name="costCodeQty"]', "5");
    await page.fill('input[name="costCodeHours"]', "20");

    await page.click('button:has-text("Award project")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;

    // Log actual production against that line — 5 TON at 24 hours (well
    // above the 4-hour estimate) so this job's own variance is visible.
    await page.goto(`${jobHref}/command-center/edit`);
    await page.selectOption('select[name="stage"]', "ACTIVE");
    await page.click('button:has-text("Save")');
    await page.waitForURL(jobHref);

    await page.goto(`${jobHref}/daily-reports/new`);
    await page.fill('input[name="date"]', startDate);
    await page.fill('input[name="crewSize"]', "2");
    const row = page.locator('input[name="rowJobCostCodeId"]').first().locator("xpath=..");
    await row.locator('input[name="rowHours"]').fill("24");
    await row.locator('input[name="rowQty"]').fill("5");
    await page.fill('textarea[name="workCompleted"]', "Placed rebar for footings");
    await page.click('button:has-text("Submit daily update")');
    await page.waitForURL(jobHref);

    // Jump straight to COMPLETE — no stage-order restriction in the app —
    // which is the automation trigger under test.
    await page.goto(`${jobHref}/command-center/edit`);
    await page.check('input[name="punchListComplete"]');
    await page.check('input[name="requiredDocsComplete"]');
    await page.selectOption('select[name="stage"]', "COMPLETE");
    await page.click('button:has-text("Save")');
    await page.waitForURL(jobHref);
    bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Complete");

    // The historical productivity table now counts this job too, with no
    // manual "record benchmark" step — it happened as a side effect of the
    // stage save, the same call path lib/command-center-actions.ts wires up.
    await page.goto("/cost-codes");
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const afterMatch = bodyText.match(rebarRowRe);
    expect(afterMatch).toBeTruthy();
    const afterJobCount = Number(afterMatch![4]);
    expect(afterJobCount).toBe(beforeJobCount + 1);
  });
});
