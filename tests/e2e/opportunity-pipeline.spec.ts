import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Opportunity -> Bid -> Estimate -> Award: the front door before a project
 * exists. A win converts to a real Job through the same Award form every
 * other project goes through (prefilled, not a second creation code path)
 * with its bid lines carried over; a loss stays queryable for win-rate
 * reporting forever, never becoming a Job at all.
 */
test.describe("Pipeline", () => {
  test("renders the seeded win-rate summary and open opportunities", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/opportunities");

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Pipeline");
    expect(bodyText).toContain("Win rate");
    // Seeded: 2 won, 2 lost, 1 no-bid -> 50% (won / (won+lost)).
    expect(bodyText).toMatch(/Win rate \(won.*?\) 50%/);
    expect(bodyText).toContain("Cove Street Duplex — Foundation & Framing");
    expect(bodyText).toContain("Elm Terrace — Site Utilities");
    // Decided bids are excluded from the default (open) view.
    expect(bodyText).not.toContain("Bayside Development — Phase 2 Retail Pad");
  });

  test("including decided bids shows won/lost/no-bid with reasons", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/opportunities?includeDecided=1");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Harbor View Corporate Campus");
    expect(bodyText).toContain("Bayside Development — Phase 2 Retail Pad");
    expect(bodyText).toContain("Downtown Parking Structure");

    // A won opportunity links straight to the real job it became.
    await page.click('a:has-text("Harbor View Corporate Campus")');
    await page.waitForURL(/\/opportunities\/c[a-z0-9]{10,}$/);
    const detailText = await page.locator("body").innerText();
    expect(detailText).toContain("Won");
    await page.click('a:has-text("the real project")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    expect(await page.locator("body").innerText()).toContain("Harbor View Corporate Campus");
  });

  test("search finds an opportunity by title and bid number", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/search?q=Elm Terrace");
    let bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Elm Terrace — Site Utilities");
    expect(bodyText).toContain("Opportunity");

    await page.goto("/search?q=2026-B006");
    bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Cove Street Duplex — Foundation & Framing");
  });

  test("a new opportunity's bid line shows historical rates, and marking it lost removes it from the open pipeline", async ({ page }) => {
    await login(page, "admin");
    const tag = `E2E-opp-${Date.now()}`;

    await page.goto("/opportunities/new");
    await page.fill('input[name="title"]', `${tag} — Slab bid`);
    await page.fill('input[name="prospectName"]', `${tag} Prospect LLC`);
    await page.fill('input[name="estimatedValue"]', "50000");
    await page.click('button:has-text("Add opportunity")');
    await page.waitForURL(/\/opportunities\/c[a-z0-9]{10,}$/);
    const opportunityHref = new URL(page.url()).pathname;

    await page.click('a:has-text("+ Add bid line")');
    // BudgetLineFields is a client component with a controlled <select> —
    // interacting before it hydrates lets Playwright's selectOption land on
    // the raw DOM, which React's first client render then silently reverts
    // back to its initial (first-alphabetical) option. networkidle is a
    // reasonable proxy for "hydrated" here (the client bundle and any data
    // fetch are done well before the network goes idle), and the
    // toHaveValue check right after confirms the selection actually stuck
    // rather than trusting selectOption's own resolution.
    await page.waitForLoadState("networkidle");
    const slabValue = await page.locator('select[name="costCodeId"] option', { hasText: "Concrete slab" }).getAttribute("value");
    await page.selectOption('select[name="costCodeId"]', slabValue!);
    await expect(page.locator('select[name="costCodeId"]')).toHaveValue(slabValue!);
    // The estimate/actual loop's historical-rate panel, reused as-is here.
    expect(await page.locator("body").innerText()).toContain("Historical productivity for this code");
    await page.fill('input[name="estimatedQty"]', "40");
    await page.fill('input[name="estimatedHours"]', "35");
    await page.click('button:has-text("Add bid line")');
    await page.waitForURL(opportunityHref);
    // toContainText auto-retries — the redirect's URL can resolve slightly
    // ahead of the server-rendered content it points to, so a one-shot
    // innerText() read here can race a still-in-flight re-render.
    await expect(page.locator("body")).toContainText("Concrete slab on grade");

    await page.goto("/opportunities");
    expect(await page.locator("body").innerText()).toContain(`${tag} — Slab bid`);

    // Lost -> gone from the open pipeline, still visible in full history.
    await page.goto(opportunityHref);
    const lostForm = page.locator('form:has(select[name="stage"])').last();
    await lostForm.locator('select[name="stage"]').selectOption("LOST");
    await lostForm.locator('input[name="lostReason"]').fill("Client went with an in-house crew");
    await lostForm.locator('button:has-text("Save outcome")').click();
    await page.waitForURL(opportunityHref);
    await expect(page.locator("body")).toContainText("Client went with an in-house crew");

    await page.goto("/opportunities");
    expect(await page.locator("body").innerText()).not.toContain(`${tag} — Slab bid`);
    await page.goto("/opportunities?includeDecided=1");
    expect(await page.locator("body").innerText()).toContain(`${tag} — Slab bid`);
  });

  test("winning an opportunity prefills the Award form and carries the bid line into the new job's cost codes", async ({ page }) => {
    await login(page, "admin");
    const tag = `E2E-win-${Date.now()}`;

    await page.goto("/opportunities/new");
    await page.fill('input[name="title"]', `${tag} — Foundation bid`);
    await page.fill('input[name="prospectName"]', `${tag} Prospect LLC`);
    await page.fill('input[name="estimatedValue"]', "72000");
    await page.click('button:has-text("Add opportunity")');
    await page.waitForURL(/\/opportunities\/c[a-z0-9]{10,}$/);
    const opportunityHref = new URL(page.url()).pathname;
    const opportunityId = opportunityHref.split("/").pop()!;

    await page.click('a:has-text("+ Add bid line")');
    // Same controlled-<select>-vs-hydration race as the slab-bid test above.
    await page.waitForLoadState("networkidle");
    const excavationValue = await page.locator('select[name="costCodeId"] option', { hasText: "Excavation" }).getAttribute("value");
    await page.selectOption('select[name="costCodeId"]', excavationValue!);
    await expect(page.locator('select[name="costCodeId"]')).toHaveValue(excavationValue!);
    await page.fill('input[name="estimatedQty"]', "60");
    await page.fill('input[name="estimatedHours"]', "42");
    await page.click('button:has-text("Add bid line")');
    await page.waitForURL(opportunityHref);

    await page.click('a:has-text("Mark won")');
    await page.waitForURL(new RegExp(`/jobs/new\\?opportunityId=${opportunityId}`));

    let bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Awarding from opportunity");
    expect(await page.locator('input[name="title"]').inputValue()).toBe(`${tag} — Foundation bid`);
    expect(await page.locator('input[name="contractValue"]').inputValue()).toBe("72000");
    // The bid line is already in the cost-code row, not re-entered.
    expect(await page.locator('input[name="costCodeQty"]').first().inputValue()).toBe("60");
    expect(await page.locator('input[name="costCodeHours"]').first().inputValue()).toBe("42");

    const pmOptions = await page.locator('select[name="pmUserId"] option').allTextContents();
    await page.selectOption('select[name="pmUserId"]', { label: pmOptions.find((o) => o.includes("Priya"))! });
    await page.click('button:has-text("Award project")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;

    // Auto-retrying — same redirect/render race as the mark-lost flow above.
    await expect(page.locator("body")).toContainText(`${tag} — Foundation bid`);
    await expect(page.locator("body")).toContainText("Excavation");

    // The opportunity now shows WON and links back to this exact job.
    await page.goto(opportunityHref);
    bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Won");
    const wonLink = await page.locator('a:has-text("the real project")').getAttribute("href");
    expect(wonLink).toBe(jobHref);
  });

  test("Company Command shows the pipeline totals and links to the full pipeline", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/");
    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toMatch(/Open opportunities \d+/);
    expect(bodyText).toContain("Pipeline value");

    await page.click('a:has-text("Full pipeline")');
    await page.waitForURL("/opportunities");
    expect(await page.locator("body").innerText()).toContain("Pipeline");
  });
});
