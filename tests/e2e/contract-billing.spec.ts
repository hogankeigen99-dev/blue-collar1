import { test, expect } from "@playwright/test";
import { login, findJobHrefByTitle } from "./helpers";

/**
 * Contract / Schedule of Values / real progress billing: the owner-facing
 * billing breakdown, deliberately separate from cost codes, that
 * contractValue and pay applications are now computed from rather than
 * typed directly (docs/OPERATING-DATA-MODEL.md).
 */
test.describe("Contract & Schedule of Values", () => {
  test("the contract page's scheduled value ties out with the job page's current contract value", async ({ page }) => {
    await login(page, "admin");
    const jobHref = await findJobHrefByTitle(page, "Oakridge Medical Office");

    await page.goto(jobHref);
    const jobText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const jobMatch = jobText.match(/Current contract value \$([\d,]+)/);
    expect(jobMatch, "job page must show a current contract value").toBeTruthy();

    await page.goto(`${jobHref}/contract`);
    const contractText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(contractText).toContain("Mobilization & general conditions");
    expect(contractText).toContain("Contract work in place");
    expect(contractText).toContain("Lump sum");
    expect(contractText).toContain("10%");
    const contractMatch = contractText.match(/Scheduled value \(current contract value\) \$([\d,]+)/);
    expect(contractMatch, "contract page must show the scheduled total").toBeTruthy();
    // Same underlying getJobCosting sum both pages read from — must agree.
    expect(contractMatch![1]).toBe(jobMatch![1]);

    await page.goto(`${jobHref}/invoices`);
    const invoicesText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(invoicesText).toContain("Schedule of Values — billed to date");
    expect(invoicesText).toMatch(/INV-\S+/);
  });

  test("Award creates a Contract with one starting SOV line from the entered contract value and terms", async ({ page }) => {
    await login(page, "admin");
    const tag = `E2E-contract-${Date.now()}`;

    await page.goto("/jobs/new");
    await page.fill('input[name="title"]', `${tag} — Contract test`);
    await page.fill('input[name="newCustomerName"]', `${tag} LLC`);
    await page.fill('input[name="contractValue"]', "50000");
    await page.selectOption('select[name="contractType"]', "GMP");
    await page.fill('input[name="retainagePct"]', "5");
    const pmOptions = await page.locator('select[name="pmUserId"] option').allTextContents();
    await page.selectOption('select[name="pmUserId"]', { label: pmOptions.find((o) => o.includes("Priya"))! });
    await page.click('button:has-text("Award project")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;

    await page.goto(`${jobHref}/contract`);
    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("GMP");
    expect(bodyText).toContain("5%");
    expect(bodyText).toContain("original contract");
    expect(bodyText).toMatch(/Total \$50,000/);
  });

  test("approving a change order adds a SOV line automatically, with no separate SOV entry", async ({ page }) => {
    await login(page, "admin");
    const tag = `E2E-co-sov-${Date.now()}`;

    await page.goto("/jobs/new");
    await page.fill('input[name="title"]', `${tag} — CO automation test`);
    await page.fill('input[name="newCustomerName"]', `${tag} LLC`);
    await page.fill('input[name="contractValue"]', "80000");
    const pmOptions = await page.locator('select[name="pmUserId"] option').allTextContents();
    await page.selectOption('select[name="pmUserId"]', { label: pmOptions.find((o) => o.includes("Priya"))! });
    await page.click('button:has-text("Award project")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;

    await page.goto(`${jobHref}/change-orders/new`);
    await page.fill('input[name="title"]', "Owner-requested scope addition");
    await page.click('button:has-text("Create change order")');
    await page.waitForURL(`${jobHref}/change-orders`);
    // The status <select> below is a controlled client component —
    // interacting immediately after a fresh navigation can race React
    // hydration under load (same class of race documented in
    // opportunity-pipeline.spec.ts's bid-line cost-code select).
    await page.waitForLoadState("networkidle");

    const coForm = page.locator('form:has(select[name="status"])').first();
    await coForm.locator('select[name="status"]').selectOption("APPROVED");
    await expect(coForm.locator('select[name="status"]')).toHaveValue("APPROVED");
    await coForm.locator('input[name="revenueAmount"]').fill("6000");
    await coForm.locator('input[name="costAmount"]').fill("4000");
    await coForm.locator('button:has-text("Save")').click();
    await page.waitForURL(`${jobHref}/change-orders`);

    await page.goto(`${jobHref}/contract`);
    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Owner-requested scope addition");
    expect(bodyText).toContain("(change order)");
    expect(bodyText).toMatch(/Total \$86,000/); // 80,000 original + 6,000 approved CO — no manual SOV re-entry
  });

  test("manually adding a Schedule of Values line increases the scheduled total", async ({ page }) => {
    await login(page, "admin");
    const tag = `E2E-add-line-${Date.now()}`;

    await page.goto("/jobs/new");
    await page.fill('input[name="title"]', `${tag} — Manual SOV line test`);
    await page.fill('input[name="newCustomerName"]', `${tag} LLC`);
    await page.fill('input[name="contractValue"]', "30000");
    const pmOptions = await page.locator('select[name="pmUserId"] option').allTextContents();
    await page.selectOption('select[name="pmUserId"]', { label: pmOptions.find((o) => o.includes("Priya"))! });
    await page.click('button:has-text("Award project")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;

    await page.goto(`${jobHref}/contract`);
    await page.click('summary:has-text("Add Schedule of Values line")');
    await page.fill('input[name="description"]', "Owner-directed fixture allowance");
    await page.fill('input[name="scheduledValue"]', "5000");
    await page.click('button:has-text("Add")');
    // The redirect target is this same URL, so waitForURL is a no-op here —
    // toContainText auto-retries instead of reading a possibly-stale
    // innerText right after the click resolves.
    await expect(page.locator("body")).toContainText("Owner-directed fixture allowance");
    await expect(page.locator("body")).toContainText("$35,000"); // 30,000 original + 5,000 manual line
  });

  test("a pay application computes this-period amount and retainage from % complete, and updates billed-to-date", async ({ page }) => {
    await login(page, "admin");
    const tag = `E2E-payapp-${Date.now()}`;

    await page.goto("/jobs/new");
    await page.fill('input[name="title"]', `${tag} — Pay application test`);
    await page.fill('input[name="newCustomerName"]', `${tag} LLC`);
    await page.fill('input[name="contractValue"]', "40000");
    await page.fill('input[name="retainagePct"]', "10");
    const pmOptions = await page.locator('select[name="pmUserId"] option').allTextContents();
    await page.selectOption('select[name="pmUserId"]', { label: pmOptions.find((o) => o.includes("Priya"))! });
    await page.click('button:has-text("Award project")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;

    await page.goto(`${jobHref}/invoices/new`);
    const lineRow = page.locator("tr", { hasText: "original contract" });
    await lineRow.locator('input[name="pctCompleteToDate"]').fill("50");
    // Live preview computes $ before submit — no calculation left to chance.
    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("$20,000"); // 50% of 40,000 earned this period
    expect(bodyText).toContain("$2,000"); // 10% retainage on that
    expect(bodyText).toContain("$18,000"); // net due this period

    await page.fill('input[name="date"]', new Date().toISOString().slice(0, 10));
    await page.click('button:has-text("Submit pay application")');
    await page.waitForURL(`${jobHref}/invoices`);

    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("$18,000 due");
    expect(bodyText).toContain("50% complete");
    expect(bodyText).toContain("$2,000 retainage withheld");

    await page.goto(`${jobHref}/contract`);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    // Billed to date on the SOV line is the gross earned amount (retainage
    // is cash withheld, not a discount on the SOV progress itself).
    expect(bodyText).toMatch(/original contract.*?\$40,000.*?\$20,000.*?\$20,000/);
  });
});
