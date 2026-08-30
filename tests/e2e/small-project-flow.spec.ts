import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

/**
 * The Small Project Live Flow — CrewSync's actual pitch, told as one real
 * 7-day, 1-2 crew, ~$195K self-perform project moving through Award ->
 * Closeout -> historical intelligence feeding the next estimate. Every step
 * drives the real app; nothing here is scripted or pre-computed.
 */

async function switchRole(page: Page, label: string) {
  await page.click(`form:has(button[name="persona"]) button:has-text("${label}")`);
  await page.waitForLoadState("networkidle");
}

test.describe("Small Project Live Flow", () => {
  test("the launcher exists and every step is a real, non-blank page", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/");
    let bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Run Small Project Demo");

    await page.click('button:has-text("Run Small Project Demo")');
    await page.waitForLoadState("networkidle");
    bodyText = (await page.locator("body").innerText()).toLowerCase();
    expect(bodyText).toContain("small project live flow");
    expect(bodyText).toContain("day 0");

    const totalSteps = Number(bodyText.match(/(\d+) of (\d+)/)?.[2]);
    expect(totalSteps).toBeGreaterThan(0);
    for (let i = 1; i <= totalSteps; i++) {
      const text = (await page.locator("body").innerText()).toLowerCase();
      expect(text, `step ${i}: must not 404`).not.toContain("could not be found");
      expect(text.trim().length, `step ${i}: must render real content`).toBeGreaterThan(200);
      if (i < totalSteps) {
        await page.click('button:has-text("Next")');
        await page.waitForLoadState("networkidle");
      }
    }
  });

  test("Day 0 through Day 7: Award, mobilize, execute, change, bill, close, and feed the next estimate", async ({ page }) => {
    // ---- DAY 0: AWARD ----
    await login(page, "admin");
    await page.goto("/opportunities");
    await page.click('a:has-text("Brightside Automotive")');
    await page.waitForURL(/\/opportunities\/c[a-z0-9]{10,}$/);
    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("$195,000");

    await page.click('a:has-text("Mark won")');
    await page.waitForURL(/\/jobs\/new\?opportunityId=/);
    bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Awarding from opportunity");
    // Carried forward automatically — the PM never retypes any of this.
    expect(await page.locator('input[name="title"]').inputValue()).toBe("Brightside Automotive — Service Bay Slab & Footings");
    expect(await page.locator('input[name="contractValue"]').inputValue()).toBe("195000");
    expect(await page.locator('input[name="costCodeQty"]').count()).toBeGreaterThanOrEqual(2);

    const today = new Date();
    const start = new Date(today.getTime() + 1 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(today.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
    await page.fill('input[name="targetStartDate"]', start);
    await page.fill('input[name="targetEndDate"]', end);
    const pmOptions = await page.locator('select[name="pmUserId"] option').allTextContents();
    await page.selectOption('select[name="pmUserId"]', { label: pmOptions.find((o) => o.includes("Priya"))! });
    // Deliberately leave crew/foreman blank — that's the point of Day 0c.
    await page.click('button:has-text("Award project")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;

    // ---- DAY 0: WHAT'S MISSING ----
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("None assigned — crew not staffed yet");
    expect(bodyText).toMatch(/Confirm permit set|Add cost code budget lines/); // PRECON checklist, unchecked

    // ---- DAY 1: ASSIGN CREW ----
    const crewForm = page.locator("form", { has: page.locator('input[name="jobId"]') }).filter({ hasText: "Assign crew" });
    await crewForm.locator('label:has-text("Frank Delgado") input[type="checkbox"]').check();
    await crewForm.locator('input[name="startDate"]').fill(start);
    await crewForm.locator('input[name="endDate"]').fill(end);
    await crewForm.locator('button:has-text("Assign")').click();
    // Already on jobHref before submitting (the action redirects back to the
    // same URL), so waitForURL would resolve immediately without waiting for
    // the round-trip — wait for the actual DOM change instead.
    await expect(page.locator("body")).not.toContainText("crew not staffed yet", { timeout: 10_000 });
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Frank Delgado");

    // ---- DAY 1: FOREMAN'S WORKSPACE ----
    await switchRole(page, "Foreman");
    await expect(page).toHaveURL(/\/field$/);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Brightside Automotive");

    // ---- DAY 2: FIELD EXECUTION (ONE SUBMISSION) ----
    await page.goto(`${jobHref}/daily-reports/new`);
    const concreteRow = page.locator("div.flex.items-center.gap-2", { hasText: "Concrete slab on grade" });
    await concreteRow.locator('input[name="rowHours"]').fill("72");
    await concreteRow.locator('input[name="rowQty"]').fill("64");
    await page.fill('textarea[name="equipmentIssue"]', "Compactor broke down mid-morning, waiting on a replacement");
    await page.fill('textarea[name="materialNeeded"]', "Short 2 tons #4 rebar for the footing revision");
    await page.check('#hasChangeCondition');
    await page.fill(
      'textarea[name="changeConditionNotes"]',
      "Revised footing detail — deeper bearing required per geotech, additional concrete beyond the original SOV quantity"
    );
    await page.click('button:has-text("Submit daily update")');
    await page.waitForURL(jobHref);

    // ---- DAY 2: ENTER ONCE -> PROPAGATION (all on the same real page) ----
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toMatch(/Concrete slab on grade[\s\S]{0,200}1\.13/);
    expect(bodyText).toContain("Labor overrun");
    expect(bodyText).toMatch(/3[0-4]% over/);
    expect(bodyText).toContain("Equipment issue");
    expect(bodyText).toContain("Unapproved change work");

    // ---- DAY 3: PM DAILY COMMAND ----
    await switchRole(page, "Project Manager");
    await page.goto("/today");
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Brightside Automotive");
    expect(bodyText).toContain("Labor overrun");
    expect(bodyText).toMatch(/WHY/i);
    expect(bodyText).toMatch(/IMPACT/i);
    expect(bodyText).toMatch(/ACTION/i);
    expect(bodyText).toContain("Equipment issue");

    // ---- DAY 4: CHANGE MANAGEMENT ----
    await switchRole(page, "Executive");
    await page.goto(`${jobHref}/contract`);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const before = bodyText.match(/Total \$([\d,]+)/);
    expect(before, "contract must show a starting total").toBeTruthy();

    await page.goto(`${jobHref}/change-orders`);
    await page.waitForLoadState("networkidle");
    // The CO's title/description live in a sibling div outside the <form>,
    // so scope to the outer card by title text first, then the form within it.
    const coCard = page.locator("div.bg-white.border.rounded-lg.p-4", { hasText: "footing" });
    const coForm = coCard.locator('form:has(select[name="status"])');
    await coForm.locator('select[name="status"]').selectOption("APPROVED");
    await expect(coForm.locator('select[name="status"]')).toHaveValue("APPROVED");
    await coForm.locator('input[name="revenueAmount"]').fill("28500");
    await coForm.locator('input[name="costAmount"]').fill("21000");
    await coForm.locator('button:has-text("Save")').click();
    // Already on this URL before submitting (the action redirects back here),
    // so wait for the DOM to actually reflect APPROVED rather than the URL.
    await expect(page.locator("body")).toContainText("APPROVED", { timeout: 10_000 });

    await page.goto(`${jobHref}/contract`);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("(change order)");
    const expectedTotal = Number(before![1].replace(/,/g, "")) + 28500;
    expect(bodyText).toContain(`Total $${expectedTotal.toLocaleString("en-US")}`);

    // ---- DAY 5: ACCOUNTING HANDOFF ----
    await switchRole(page, "Accounting");
    await page.goto(`${jobHref}/contract`);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain(`$${expectedTotal.toLocaleString("en-US")}`);

    // ---- DAY 6-7: CLOSEOUT ----
    await switchRole(page, "Executive");
    await page.goto(`${jobHref}/command-center/edit`);
    await page.selectOption('select[name="stage"]', "COMPLETE");
    await page.click('button:has-text("Save")');
    await page.waitForURL(jobHref);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("COMPLETE");

    // ---- NEXT ESTIMATE: CLOSED LOOP ----
    await switchRole(page, "Estimator");
    await page.goto("/opportunities");
    await page.click('a:has-text("NorthPoint Distribution Center")');
    await page.waitForURL(/\/opportunities\/c[a-z0-9]{10,}$/);
    await page.click('a:has-text("+ Add bid line")');
    await page.waitForLoadState("networkidle");
    const slabValue = await page
      .locator('select[name="costCodeId"] option', { hasText: "Concrete slab on grade" })
      .getAttribute("value");
    await page.selectOption('select[name="costCodeId"]', slabValue!);
    await expect(page.locator('select[name="costCodeId"]')).toHaveValue(slabValue!);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Historical productivity for this code");
    expect(bodyText).toMatch(/1\.0[0-9]/); // company history ~1.04, recent ~1.08
  });
});
