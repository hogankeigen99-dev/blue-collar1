import { test, expect } from "@playwright/test";
import { login, findJobHrefByTitle } from "./helpers";

/**
 * "Fix the gaps" phase: three previously-honest limitations, now built.
 * (1) Structured permit tracking + a PERMIT_EXPIRED alert, the last
 *     ARCHITECTURE.md §3.2 Preconstruction gap. (2) Retainage release, the
 *     closeout billing event carried unmodeled since the Contract/SOV
 *     phase. (3) A severely-overdue AR/AP alert built on lib/cash.ts's
 *     existing 90+ aging bucket.
 */
test.describe("Permit tracking", () => {
  test("an expired permit on an active job is a critical exception", async ({ page }) => {
    await login(page, "admin");
    const jobHref = await findJobHrefByTitle(page, "Riverside Apartments — Phase 2 Slab");
    await page.goto(jobHref);

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("RVA-2026-0142");
    expect(bodyText).toContain("Permit expired");
    expect(bodyText).toMatch(/Permit RVA-2026-0142 expired \d+ day\(s\) ago/);
  });

  test("a permit expiring soon is a warning exception, and a healthy permit raises none", async ({ page }) => {
    await login(page, "admin");

    const sunriseHref = await findJobHrefByTitle(page, "Sunrise Duplex");
    await page.goto(sunriseHref);
    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("MPL-2026-0087");
    expect(bodyText).toMatch(/Permit MPL-2026-0087 expires in \d+ day\(s\)/);

    const harborSiteworkHref = await findJobHrefByTitle(page, "Harbor View Corporate Campus — Sitework Package");
    await page.goto(harborSiteworkHref);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("HBV-2026-0311");
    expect(bodyText).not.toContain("Permit expired");
  });
});

test.describe("Retainage release", () => {
  test("a fully closed-out job shows its owner-side retainage was released, not just zeroed out", async ({ page }) => {
    await login(page, "admin");
    const jobHref = await findJobHrefByTitle(page, "Harbor View — Foundation Pour");
    await page.goto(`${jobHref}/invoices`);

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("INV-1002");
    expect(bodyText).toContain("Retainage release");
    expect(bodyText).toMatch(/retainage released/);
    // Fully released — nothing left to hold, so no release panel to act on.
    expect(bodyText).not.toContain("Release retainage");
  });

  test("a closed-out subcontract shows its retainage was paid out to the sub", async ({ page }) => {
    await login(page, "admin");
    const jobHref = await findJobHrefByTitle(page, "Cedar Court");
    await page.goto(`${jobHref}/subcontracts`);

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Precision Saw Cutting");
    expect(bodyText).toMatch(/Retainage 8% released/);
  });

  test("a job at closeout with retainage still held can release it — a real pay application, no re-entry", async ({ page }) => {
    await login(page, "admin");
    const jobHref = await findJobHrefByTitle(page, "Westgate Plaza — Retail Shell");
    await page.goto(`${jobHref}/invoices`);

    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Retainage held: $6,120");
    expect(bodyText).toContain("This job is at Closeout");

    await page.click('button:has-text("Release retainage")');
    await page.waitForURL(`${jobHref}/invoices`);

    // toContainText auto-retries — same same-route redirect race documented
    // in cash.spec.ts and subbid.spec.ts.
    await expect(page.locator("body")).toContainText("Retainage release");
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toMatch(/\$6,120.*?due/);
    expect(bodyText).toMatch(/retainage released/);
  });
});

test.describe("Severely-overdue AR/AP", () => {
  test("a pay application outstanding 90+ days is a critical AR exception on its job", async ({ page }) => {
    await login(page, "admin");
    const jobHref = await findJobHrefByTitle(page, "Westgate Plaza — Retail Shell");
    await page.goto(jobHref);

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("AR severely overdue");
    expect(bodyText).toMatch(/Invoice INV-6001.*?has been outstanding \d+ days/);
    expect(bodyText).toContain("AP severely overdue");
    expect(bodyText).toMatch(/Precision Drywall.*?invoice.*?has been unpaid \d+ days/);
  });

  test("severely-overdue AR/AP surfaces in the Company Action Center", async ({ page }) => {
    // The Company Command Center's "Top exceptions" widget deliberately
    // scans only open jobs (stage != COMPLETE, same scoping every other
    // exception bucket there already uses) — Westgate is COMPLETE, so its
    // overdue AR/AP shows on the full company-wide Action Center instead.
    await login(page, "admin");
    await page.goto("/today");

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("AR severely overdue");
    expect(bodyText).toContain("AP severely overdue");
  });
});
