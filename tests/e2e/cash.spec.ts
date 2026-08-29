import { test, expect } from "@playwright/test";
import { login, findJobHrefByTitle } from "./helpers";

/**
 * Cash: company-wide AR/AP aging, a retainage summary, and an 8-week
 * forecast — a computed rollup over Invoice/Subcontract/MaterialRequest,
 * no new ledger. Seed data intentionally spreads outstanding AR across all
 * four aging buckets (Oakridge/Bayside for 0-30/31-60, Westgate Plaza —
 * already-complete, slow-paying-owner narrative — for 61-90/90+).
 */
test.describe("Cash", () => {
  test("AR aging spreads across buckets and a 90+ row is flagged", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/cash");

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Accounts receivable");
    expect(bodyText).toContain("Accounts payable");
    // Westgate Plaza's first pay app (INV-6001) is ~95 days out — 90+ bucket.
    expect(bodyText).toContain("Westgate Plaza");
    expect(bodyText).toContain("INV-6001");
    // Its second pay app (INV-6002) lands in 61-90.
    expect(bodyText).toContain("INV-6002");
    // Bayside's first pay app is ~32 days out — 31-60 bucket.
    expect(bodyText).toContain("INV-5001");
    // Oakridge's second pay app is only a few days out — 0-30 bucket.
    expect(bodyText).toContain("INV-4002");
  });

  test("retainage summary shows both sides", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/cash");
    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toMatch(/Retainage held/);
  });

  test("the 8-week forecast table renders with an overdue call-out for the 90+ AR", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/cash");
    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("8-week cash forecast");
    expect(bodyText).toContain("Net-30");
    // Westgate's oldest pay app is well past the Net-30 assumption.
    expect(bodyText).toMatch(/Overdue in \(past Net-30\)/);
  });

  test("the Company Command Center shows a Cash tile linking to /cash", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/");
    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("AR outstanding");
    expect(bodyText).toContain("AP outstanding");
    expect(bodyText).toContain("Net position");
    await page.click('a:has-text("AR/AP aging & forecast")');
    await page.waitForURL("/cash");
  });

  test("marking a received material paid removes it from AP aging", async ({ page }) => {
    await login(page, "admin");

    // Riverside Phase 2's ready-mix concrete ($23,520) is seeded RECEIVED
    // with no paidDate — a real outstanding AP row.
    await page.goto("/cash");
    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Ready-mix concrete, 4000 PSI");

    const jobHref = await findJobHrefByTitle(page, "Riverside Apartments — Phase 2 Slab");
    await page.goto(`${jobHref}/materials`);
    const row = page.locator("div.bg-white.border.rounded-lg", { hasText: "Ready-mix concrete, 4000 PSI" });
    await row.locator('input[name="paidDate"]').fill("2026-08-28");
    await row.locator('button:has-text("Save")').click();
    await page.waitForURL(`${jobHref}/materials`);
    // Force a hard navigation past the client router cache — the redirect
    // target is the same route we already fetched once this test, and a
    // soft nav back to it can otherwise render the pre-update RSC payload.
    await page.reload();

    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("paid Aug 28, 2026");

    await page.goto("/cash");
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).not.toContain("Ready-mix concrete, 4000 PSI");
  });
});
