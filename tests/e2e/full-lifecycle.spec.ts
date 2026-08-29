import { test, expect } from "@playwright/test";
import { login, addDays, dateKey, getCommandCenterStats } from "./helpers";

/**
 * The whole point of this app: award -> setup -> schedule -> mobilize ->
 * daily field updates -> production -> job cost -> exception detection ->
 * change work -> materials -> completion -> billing ready -> invoice ->
 * closeout, for one small project, through the real UI, with no duplicate
 * data entry anywhere in the chain.
 */
test.describe("Small-project full lifecycle", () => {
  test("award through closeout", async ({ page }) => {
    test.setTimeout(150_000);
    await login(page, "admin");

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const startDate = dateKey(today);
    const endDate = dateKey(addDays(today, 6));
    const tag = `E2E-${Date.now()}`;

    // --- Award ---
    await page.goto("/jobs/new");
    await page.fill('input[name="title"]', `${tag} Duplex — Foundation & Slab`);
    await page.fill('input[name="newCustomerName"]', `${tag} Holdings LLC`);
    await page.fill('input[name="location"]', "99 Test Site Rd");
    await page.fill('input[name="contractValue"]', "38000");
    await page.fill('input[name="targetStartDate"]', startDate);
    await page.fill('input[name="targetEndDate"]', endDate);

    const pmOptions = await page.locator('select[name="pmUserId"] option').allTextContents();
    const pmLabel = pmOptions.find((o) => o.includes("Priya"));
    await page.selectOption('select[name="pmUserId"]', { label: pmLabel! });
    const foremanOptions = await page.locator('select[name="foremanWorkerId"] option').allTextContents();
    const foremanLabel = foremanOptions.find((o) => o.includes("Frank"));
    await page.selectOption('select[name="foremanWorkerId"]', { label: foremanLabel! });
    const workerCheckboxes = await page.locator('input[name="workerIds"]').all();
    await workerCheckboxes[0].check();

    await page.fill('input[name="budget_LABOR"]', "4800");
    await page.fill('input[name="budget_MATERIAL"]', "9000");
    await page.fill('input[name="budget_EQUIPMENT"]', "1200");

    const costCodeOptions = await page.locator('select[name="costCodeId"] option').allTextContents();
    const slabLabel = costCodeOptions.find((o) => o.includes("Concrete slab"));
    await page.selectOption('select[name="costCodeId"]', { label: slabLabel! });
    await page.fill('input[name="costCodeQty"]', "50");
    await page.fill('input[name="costCodeHours"]', "45");

    await page.click('button:has-text("Award project")');
    // cuids are long and start with "c" — specific enough not to match /jobs/new.
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;
    const jobId = jobHref.split("/").pop()!;
    expect(jobId).toBeTruthy();

    // --- Setup verified: jobNumber + checklist auto-generated ---
    let bodyText = await page.locator("body").innerText();
    expect(bodyText).toMatch(/\d{4}-\d{3}/);
    expect(bodyText).toContain("Day 1 of 7");
    expect(bodyText).toContain("Preconstruction");
    expect(bodyText).toContain("Confirm contract value and PM assignment");

    // --- Schedule: crew auto-scheduled at award, no separate step ---
    await page.goto("/schedule");
    let scheduleText = await page.locator("body").innerText();
    expect(scheduleText.includes("Frank") || scheduleText.includes(foremanLabel!.split(" (")[0])).toBe(true);

    // --- Mobilize ---
    await page.goto(`${jobHref}/command-center/edit`);
    await page.selectOption('select[name="stage"]', "MOBILIZATION");
    await page.click('button:has-text("Save")');
    await page.waitForURL(jobHref);
    bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Mobilization");
    expect(bodyText).toContain("Schedule crew for week 1");

    await page.goto(`${jobHref}/command-center/edit`);
    await page.selectOption('select[name="stage"]', "ACTIVE");
    await page.click('button:has-text("Save")');
    await page.waitForURL(jobHref);

    // --- Daily field update: one form drives labor, materials, and change work ---
    await page.goto(`${jobHref}/daily-reports/new`);
    await page.fill('input[name="date"]', startDate);
    await page.fill('input[name="crewSize"]', "2");
    const row = page.locator('input[name="rowJobCostCodeId"]').first().locator("xpath=..");
    await row.locator('input[name="rowHours"]').fill("13");
    await row.locator('input[name="rowQty"]').fill("10");
    await page.fill('textarea[name="workCompleted"]', "Set forms, began slab pour");
    await page.fill('textarea[name="materialNeeded"]', "Need 2 tons of #4 rebar for the footings");
    await page.check("#hasChangeCondition");
    await page.fill('textarea[name="changeConditionNotes"]', "Hit an old utility line not on the plans, needs reroute");
    await page.click('button:has-text("Submit daily update")');
    await page.waitForURL(jobHref);

    // --- Job cost auto-updated, no separate production log ---
    const afterReport = await getCommandCenterStats(page);
    expect(Number(afterReport["Actual labor hours"])).toBeCloseTo(13, 5);

    // --- Exception detection: computed, not hand-flagged ---
    bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Labor overrun");
    expect(bodyText).toContain("Unapproved change work");

    // --- Material request auto-opened from the report, no PM re-entry ---
    await page.goto(`${jobHref}/materials`);
    expect(await page.locator("body").innerText()).toContain("Need 2 tons of #4 rebar");

    // --- Change work: field-flagged -> priced -> approved -> contract value updates ---
    await page.goto(`${jobHref}/change-orders`);
    let coText = await page.locator("body").innerText();
    expect(coText).toContain("IDENTIFIED");
    const coForm = page.locator("form:has(select[name=\"status\"])").first();
    await coForm.locator('select[name="status"]').selectOption("APPROVED");
    await coForm.locator('input[name="revenueAmount"]').fill("3200");
    await coForm.locator('input[name="costAmount"]').fill("2100");
    await coForm.locator('button:has-text("Save")').click();
    await page.waitForURL(`${jobHref}/change-orders`);
    coText = await page.locator("body").innerText();
    expect(coText).toContain("APPROVED");

    await page.goto(jobHref);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("1 ($3,200)");
    expect(bodyText).toContain("Current contract value $41,200");

    // --- Materials: request -> received ---
    await page.goto(`${jobHref}/materials`);
    const matForm = page.locator("form:has(select[name=\"status\"])").first();
    await matForm.locator('select[name="status"]').selectOption("RECEIVED");
    await matForm.locator('input[name="unitCost"]').fill("160");
    await matForm.locator('input[name="totalCost"]').fill("1600");
    await matForm.locator('input[name="receivedDate"]').fill(startDate);
    await matForm.locator('button:has-text("Save")').click();
    await page.waitForURL(`${jobHref}/materials`);
    const materialsText = await page.locator("body").innerText();
    expect(materialsText).toContain("RECEIVED");

    // --- Completion -> billing ready -> invoice -> closeout ---
    await page.goto(`${jobHref}/command-center/edit`);
    await page.check('input[name="punchListComplete"]');
    await page.check('input[name="requiredDocsComplete"]');
    await page.selectOption('select[name="stage"]', "CLOSEOUT");
    await page.click('button:has-text("Save")');
    await page.waitForURL(jobHref);
    bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Closeout");
    expect(bodyText).toContain("Submit final invoice");
    expect(bodyText).toContain("Ready to invoice");

    await page.goto(`${jobHref}/invoices/new`);
    await page.fill('input[name="invoiceNumber"]', `INV-${tag}`);
    await page.fill('input[name="amount"]', "20000");
    await page.fill('input[name="date"]', startDate);
    await page.click('button:has-text("Create invoice")');
    await page.waitForURL(`${jobHref}/invoices`);

    await page.goto(`${jobHref}/command-center/edit`);
    await page.selectOption('select[name="stage"]', "COMPLETE");
    await page.click('button:has-text("Save")');
    await page.waitForURL(jobHref);
    bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Complete");
  });
});
