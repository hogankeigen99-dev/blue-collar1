import { test, expect } from "@playwright/test";
import { login, findJobHrefByTitle } from "./helpers";

/**
 * Subcontractor bid leveling: a scope of work goes out to multiple subs
 * before any Subcontract exists, quotes come back with their own scope
 * notes and exclusions (so they can actually be compared, not just ranked
 * by dollar amount), and selecting a winner becomes a real Subcontract
 * automatically — vendor and committed amount carried over, not re-typed.
 */
test.describe("Bid packages", () => {
  test("the bid-package list shows an awarded package and one still being compared", async ({ page }) => {
    await login(page, "admin");
    const jobHref = await findJobHrefByTitle(page, "Harbor View Corporate Campus — Sitework Package");
    await page.goto(`${jobHref}/bid-packages`);

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toMatch(/Demolition & site clearing.*?AWARDED/);
    expect(bodyText).toMatch(/Erosion control & haul-off.*?OPEN/);
    // The open package's low/high range spans both received quotes.
    expect(bodyText).toContain("$8,400");
    expect(bodyText).toContain("$9,200");
  });

  test("the awarded package shows the winning bid, the rejected runner-up, and links to the real subcontract it created", async ({ page }) => {
    await login(page, "admin");
    const jobHref = await findJobHrefByTitle(page, "Harbor View Corporate Campus — Sitework Package");
    await page.goto(`${jobHref}/bid-packages`);
    await page.click('a:has-text("Demolition & site clearing")');
    await page.waitForURL(/\/bid-packages\/c[a-z0-9]{10,}$/);

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toMatch(/Titan Demolition.*?\$18,500.*?SELECTED/);
    expect(bodyText).toMatch(/Coastal Paving Co.*?\$21,000.*?REJECTED/);
    expect(bodyText).toContain("Excludes debris haul-off");
    expect(bodyText).toContain("Awarded");
    expect(bodyText).toContain("Subcontract was created automatically");

    await page.click('a:has-text("View subcontract")');
    await page.waitForURL(`${jobHref}/subcontracts`);
    const subText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(subText).toMatch(/Titan Demolition.*?Demolition & site clearing.*?Committed \$18,500/);
  });

  test("the open package's bids sort lowest-first and exclusions are visible for comparison", async ({ page }) => {
    await login(page, "admin");
    const jobHref = await findJobHrefByTitle(page, "Harbor View Corporate Campus — Sitework Package");
    await page.goto(`${jobHref}/bid-packages`);
    await page.click('a:has-text("Erosion control & haul-off")');
    await page.waitForURL(/\/bid-packages\/c[a-z0-9]{10,}$/);

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    // Bayview ($8,400) is cheaper but excludes two things Green Shield
    // ($9,200) includes — both facts need to be visible to compare them.
    expect(bodyText).toMatch(/Bayview Site Services.*?\$8,400.*?Green Shield Erosion Control.*?\$9,200/);
    expect(bodyText).toContain("Excludes weekly inspection reports and sediment haul-off");
    // The declined invite shows up too — a real "no bid" is a real fact.
    expect(bodyText).toMatch(/Ridgeline Environmental.*?DECLINED/);
    // Still open — the winner hasn't been picked yet.
    expect(bodyText).toContain("Select as winner");
  });

  test("creating a package, inviting a vendor, recording a quote, and selecting the winner creates a real Subcontract with no re-entry", async ({ page }) => {
    await login(page, "admin");
    const tag = `E2E-bid-${Date.now()}`;
    const jobHref = await findJobHrefByTitle(page, "Fairview Elementary");

    await page.goto(`${jobHref}/bid-packages/new`);
    await page.fill('input[name="title"]', `${tag} Flooring package`);
    await page.fill('textarea[name="scope"]', "VCT flooring, all classrooms, gym excluded");
    await page.click('button:has-text("Create bid package")');
    await page.waitForURL(/\/bid-packages\/c[a-z0-9]{10,}$/);
    const packageHref = new URL(page.url()).pathname;

    // Invite a brand-new vendor — found-or-created inline, the same
    // pattern as every other "type a new vendor name" form in the app.
    // toContainText auto-retries — the redirect target is the exact same
    // route we just came from, so a one-shot read right after can catch
    // the client router cache's pre-invite render (same race handled in
    // cash.spec.ts's mark-paid test).
    await page.fill('input[name="newVendorName"]', `${tag} Flooring Co`);
    await page.click('button:has-text("Invite")');
    await page.waitForURL(packageHref);
    await expect(page.locator("body")).toContainText(`${tag} Flooring Co`);
    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("No quote yet");

    // The new vendor is real — findable straight from the directory.
    await page.goto("/vendors");
    expect(await page.locator("body").innerText()).toContain(`${tag} Flooring Co`);

    // Record what came back.
    await page.goto(packageHref);
    const bidForm = page.locator('form:has(select[name="status"])').first();
    await bidForm.locator('select[name="status"]').selectOption("RECEIVED");
    await bidForm.locator('input[name="amount"]').fill("14200");
    await bidForm.locator('input[name="scopeNotes"]').fill("VCT flooring, all classrooms");
    await bidForm.locator('input[name="exclusions"]').fill("Excludes gym floor and base cove");
    await bidForm.locator('button:has-text("Save")').click();
    await page.waitForURL(packageHref);
    await expect(page.locator("body")).toContainText("$14,200");
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Excludes gym floor and base cove");

    // Select the winner — the whole point: it becomes a real Subcontract.
    await page.click('button:has-text("Select as winner")');
    await page.waitForURL(packageHref);
    await expect(page.locator("body")).toContainText("AWARDED");
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Subcontract was created automatically");

    await page.click('a:has-text("View subcontract")');
    await page.waitForURL(`${jobHref}/subcontracts`);
    const subText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(subText).toMatch(new RegExp(`${tag} Flooring Co.*?${tag} Flooring package.*?Committed \\$14,200`));

    // Committed cost flows straight into job costing — no separate entry.
    await page.goto(jobHref);
    const jobText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(jobText).toContain("$14,200");
  });

  test("global search finds a bid package by title", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/search?q=Demolition%20%26%20site%20clearing");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Demolition & site clearing");
    expect(bodyText).toContain("Bid package");
  });
});
