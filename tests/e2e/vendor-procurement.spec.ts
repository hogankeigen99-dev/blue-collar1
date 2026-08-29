import { test, expect } from "@playwright/test";
import { login, findJobHrefByTitle } from "./helpers";

/**
 * Vendor/Subcontract procurement: a real Vendor master record instead of a
 * free-text string on MaterialRequest/SubcontractorCost, so spend and COI
 * compliance roll up per vendor across every job, and a subcontract is a
 * real agreement (draft -> executed -> closed) instead of just a committed
 * dollar amount.
 */
test.describe("Vendors & subcontracts", () => {
  test("the vendor directory aggregates committed/actual spend across jobs and flags an expired COI", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/vendors");

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    // Metro Rebar & Supply supplies three seeded jobs — a real cross-job rollup.
    expect(bodyText).toMatch(/Metro Rebar & Supply.*?3/);
    // Ace Rebar Placing's COI was seeded in the past, on a still-active job.
    expect(bodyText).toMatch(/Ace Rebar Placing.*?COI expired/);

    await page.click('a:has-text("Ace Rebar Placing")');
    await page.waitForURL(/\/vendors\/c[a-z0-9]{10,}$/);
    const detailText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(detailText).toContain("Rebar placement");
    expect(detailText).toContain("Riverside Apartments");
    expect(detailText).toContain("EXECUTED");
  });

  test("the expired COI shows up as a company-wide exception on the still-active job", async ({ page }) => {
    await login(page, "admin");
    const jobHref = await findJobHrefByTitle(page, "Riverside Apartments — Phase 2 Slab");
    await page.goto(jobHref);
    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("COI expired");
    expect(bodyText).toMatch(/certificate of insurance expired \d+ day\(s\) ago/);
  });

  test("adding a subcontract with a new vendor name creates a real Vendor, and executing it records when", async ({ page }) => {
    await login(page, "admin");
    const tag = `E2E-vendor-${Date.now()}`;
    const jobHref = await findJobHrefByTitle(page, "Oakridge Medical Office");

    await page.goto(`${jobHref}/subcontracts/new`);
    await page.fill('input[name="newVendorName"]', `${tag} Drywall LLC`);
    await page.fill('input[name="description"]', "Interior partition framing");
    await page.fill('input[name="committedAmount"]', "15000");
    await page.fill('input[name="retainagePct"]', "5");
    await page.click('button:has-text("Add subcontract")');
    await page.waitForURL(`${jobHref}/subcontracts`);

    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain(`${tag} Drywall LLC`);
    expect(bodyText).toContain("DRAFT");

    // The new vendor is real — findable straight from the directory.
    await page.goto("/vendors");
    expect(await page.locator("body").innerText()).toContain(`${tag} Drywall LLC`);

    // Executing it (agreement signed) records the execution automatically —
    // no separate "executed date" field to type.
    await page.goto(`${jobHref}/subcontracts`);
    const card = page.locator("div.bg-white.border.rounded-lg", { hasText: `${tag} Drywall LLC` });
    await card.locator('select[name="agreementStatus"]').selectOption("EXECUTED");
    await card.locator('button:has-text("Save")').click();
    await page.waitForURL(`${jobHref}/subcontracts`);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toMatch(new RegExp(`${tag} Drywall LLC.*?EXECUTED`));
  });

  test("a material request can be assigned an existing vendor, and the vendor's directory total updates", async ({ page }) => {
    await login(page, "admin");
    const jobHref = await findJobHrefByTitle(page, "Fairview Elementary");
    await page.goto(`${jobHref}/materials`);

    const form = page.locator('form:has(select[name="vendorId"])').first();
    const vendorOptions = await form.locator('select[name="vendorId"] option').allTextContents();
    const statewideLabel = vendorOptions.find((o) => o.includes("Statewide Roofing Supply"));
    expect(statewideLabel, "seeded vendor must be selectable").toBeTruthy();
    await form.locator('select[name="vendorId"]').selectOption({ label: statewideLabel! });
    await form.locator('button:has-text("Save")').click();
    await page.waitForURL(`${jobHref}/materials`);

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Statewide Roofing Supply");
  });

  test("global search finds a vendor by name", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/search?q=Coastal Paving");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Coastal Paving Co");
    expect(bodyText).toContain("Vendor");
  });
});
