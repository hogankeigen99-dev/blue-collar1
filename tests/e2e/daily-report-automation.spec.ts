import { test, expect } from "@playwright/test";
import { login, addDays, dateKey, getCommandCenterStats, findJobHrefByTitle } from "./helpers";

/**
 * Verifies the core promise of this phase: one daily report submission
 * drives labor actuals/job cost, opens a material request, opens a change
 * order, and surfaces an equipment-issue exception automatically — with no
 * separate "log production" step and no duplicate entry on resubmission.
 */
test.describe("Daily report automation", () => {
  test("one submission updates labor cost, opens a material request, opens a change order, and flags equipment — with no duplicate entry", async ({
    page,
  }) => {
    await login(page, "admin");

    const jobHref = await findJobHrefByTitle(page, "Sunrise Duplex");
    const jobId = jobHref.split("/").pop()!;

    // The standalone "log production" surface must not exist — daily
    // reports are the only place hours/quantity are entered.
    const logResponse = await page.goto(`${jobHref}/log`);
    expect(logResponse?.status()).toBe(404);

    await page.goto(jobHref);
    const before = await getCommandCenterStats(page);
    const beforeHours = Number(before["Actual labor hours"]);
    expect(Number.isFinite(beforeHours)).toBe(true);

    // Submit a fresh day's report — labor against the slab cost code, a
    // material need, a change condition, and an equipment issue all in one
    // form. The date offset is derived from the current time so repeated
    // runs (no DB reset between them) always land on an untouched date
    // instead of colliding with a previous run's report.
    const reportDate = dateKey(addDays(new Date(), 100 + (Math.floor(Date.now() / 1000) % 5000)));
    const uniqueTag = `e2e-${Date.now()}`;
    await page.goto(`${jobHref}/daily-reports/new?date=${reportDate}`);
    await page.fill('input[name="date"]', reportDate);
    await page.fill('input[name="crewSize"]', "2");

    const slabRow = page.locator('input[name="rowJobCostCodeId"]').last().locator("xpath=..");
    await slabRow.locator('input[name="rowHours"]').fill("6");
    await slabRow.locator('input[name="rowQty"]').fill("6");

    await page.fill('textarea[name="materialNeeded"]', `Need 1 ton of gravel — ${uniqueTag}`);
    await page.fill('textarea[name="equipmentIssue"]', `Compactor won't start — ${uniqueTag}`);
    await page.check("#hasChangeCondition");
    await page.fill('textarea[name="changeConditionNotes"]', `Unmarked utility found — ${uniqueTag}`);

    await page.click('button:has-text("Submit daily update")');
    await page.waitForURL(`**${jobHref}`);

    // Job cost updated automatically — no separate cost entry.
    const afterFirstSubmit = await getCommandCenterStats(page);
    const afterFirstHours = Number(afterFirstSubmit["Actual labor hours"]);
    expect(afterFirstHours).toBeCloseTo(beforeHours + 6, 5);

    // Material request opened automatically.
    await page.goto(`${jobHref}/materials`);
    await expect(page.locator(`text=${uniqueTag}`).first()).toBeVisible();

    // Change order opened automatically, starting IDENTIFIED.
    await page.goto(`${jobHref}/change-orders`);
    const coCard = page.locator(`text=${uniqueTag}`).first().locator("xpath=ancestor::div[contains(@class,'border')][1]");
    await expect(coCard).toContainText("IDENTIFIED");

    // Equipment issue surfaces as a live exception on the Command Center.
    await page.goto(jobHref);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Equipment issue");
    expect(bodyText).toContain(uniqueTag);

    // Resubmitting the SAME date with different hours replaces, not adds —
    // labor hours reflect the correction, not the sum of both submissions.
    await page.goto(`${jobHref}/daily-reports/new?date=${reportDate}`);
    await expect(page.locator('textarea[name="materialNeeded"]')).toHaveValue(new RegExp(uniqueTag));
    const slabRowAgain = page.locator('input[name="rowJobCostCodeId"]').last().locator("xpath=..");
    await slabRowAgain.locator('input[name="rowHours"]').fill("4");
    await slabRowAgain.locator('input[name="rowQty"]').fill("5");
    await page.click('button:has-text("Submit daily update")');
    await page.waitForURL(`**${jobHref}`);

    const afterResubmit = await getCommandCenterStats(page);
    const afterResubmitHours = Number(afterResubmit["Actual labor hours"]);
    expect(afterResubmitHours).toBeCloseTo(beforeHours + 4, 5);

    // Still exactly one material request and one change order for this
    // report — resubmission updated them in place, it didn't duplicate them.
    await page.goto(`${jobHref}/materials`);
    const materialMatches = await page.locator(`text=${uniqueTag}`).count();
    expect(materialMatches).toBe(1);

    await page.goto(`${jobHref}/change-orders`);
    // Title and description render as separate elements but both carry the
    // tag when notes are short — count cards (the title element) specifically.
    const coMatches = await page.locator("div.font-medium.text-sm", { hasText: uniqueTag }).count();
    expect(coMatches).toBe(1);
  });
});
