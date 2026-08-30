import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * The Small Project Cockpit (/demo/small-project) — CrewSync's actual pitch,
 * told as one real ~$195K, 1-2 crew project moved live through Award ->
 * Closeout -> historical intelligence feeding the next estimate, entirely
 * on ONE screen. Every step below drives a real server action.
 *
 * Every mutating action here redirects back to this same URL, so a bare
 * `expect(page).toHaveURL(...)` right after a click is trivially already
 * true (the URL never changed) and proves nothing about whether the
 * server round trip actually landed. Each step instead waits for a
 * specific piece of real, post-mutation content before reading the page
 * further — only once that's confirmed is a synchronous `page.url()`
 * check meaningful.
 */

const COCKPIT_PATH = "/demo/small-project";

test.describe("Small Project Cockpit", () => {
  test("the launcher exists and the cockpit renders real, non-blank content", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/");
    let bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Small Project Cockpit");

    await page.click('a:has-text("Small Project Cockpit")');
    await expect(page.locator("body")).toContainText("Brightside Automotive");
    expect(page.url()).toContain(COCKPIT_PATH);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Day 0");
    expect(bodyText.trim().length).toBeGreaterThan(500);
  });

  test("Day 0 through Next Estimate: one continuous screen, real actions, no navigation away", async ({ page }) => {
    await login(page, "admin");
    await page.goto(COCKPIT_PATH);

    // ---- DAY 0: AWARD ----
    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("$195,000");
    expect(await page.locator('input[name="costCodeQty"]').count()).toBeGreaterThanOrEqual(2);

    const awardForm = page.locator('form:has(button:has-text("Award project"))');
    const pmOptions = await awardForm.locator('select[name="pmUserId"] option').allTextContents();
    await awardForm.locator('select[name="pmUserId"]').selectOption({ label: pmOptions.find((o) => o.includes("Priya"))! });
    await awardForm.locator('button:has-text("Award project")').click();
    await expect(page.locator("body")).toContainText("Awarded as", { timeout: 10_000 });
    expect(page.url()).toContain(COCKPIT_PATH);

    // ---- DAY 0b: WHAT'S MISSING ----
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Crew not staffed yet");

    // ---- DAY 1: MOBILIZATION ----
    const crewForm = page.locator('form:has(button:has-text("Assign — real JobAssignment"))');
    // Frank Delgado (the Foreman persona's linked worker) is pre-checked by the cockpit.
    await expect(crewForm.locator('label:has-text("Frank Delgado") input[type="checkbox"]')).toBeChecked();
    await crewForm.locator('button:has-text("Assign — real JobAssignment")').click();
    await expect(page.locator("body")).toContainText("Crew assigned: Frank Delgado", { timeout: 10_000 });
    // The Foreman preview reads formal crew membership (JobAssignment), not
    // a specific day's schedule — real, and never a false negative just
    // because Frank happens to already be on another job's schedule today.
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Crew: Frank Delgado");

    // ---- DAY 2: FIELD EXECUTION (ONE SUBMISSION) ----
    const dailyForm = page.locator('form:has(button:has-text("Submit daily update"))');
    const concreteRow = dailyForm.locator("div.flex.items-center.gap-2", { hasText: "Concrete slab on grade" });
    await concreteRow.locator('input[name="rowHours"]').fill("72");
    await concreteRow.locator('input[name="rowQty"]').fill("64");
    await dailyForm.locator('textarea[name="equipmentIssue"]').fill("Compactor broke down mid-morning, waiting on a replacement");
    await dailyForm.locator('textarea[name="materialNeeded"]').fill("Short 2 tons #4 rebar for the footing revision");
    await dailyForm.locator("#hasChangeCondition").check();
    await dailyForm.locator('textarea[name="changeConditionNotes"]').fill(
      "Revised footing detail — deeper bearing required per geotech, additional concrete beyond the original SOV quantity"
    );
    await dailyForm.locator('button:has-text("Submit daily update")').click();

    // ---- DAY 2: ENTER ONCE -> PROPAGATION (same screen) ----
    await expect(page.locator("body")).toContainText("1.13", { timeout: 10_000 });
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toMatch(/3[0-4]% vs\. estimate/);
    expect(bodyText).toContain("Equipment issue");

    // ---- DAY 3: PM DAILY COMMAND (same screen, no navigation) ----
    expect(bodyText).toContain("Labor overrun");
    expect(bodyText).toMatch(/Why/);
    expect(bodyText).toMatch(/Impact/);
    expect(bodyText).toMatch(/Owner/);

    // Prove persona switching stays on the cockpit instead of jumping to
    // /field — scoped to the cockpit's own switcher (it carries returnTo),
    // not the top-nav one which still jumps to each persona's usual home.
    // The active persona's button is disabled, so waiting for that to flip
    // proves the round trip landed (the URL never changes either way).
    const cockpitSwitcher = page.locator('form:has(input[name="returnTo"][value="/demo/small-project"])').filter({ hasText: "Acting as" });
    await cockpitSwitcher.locator('button:has-text("Foreman")').click();
    await expect(cockpitSwitcher.locator('button:has-text("Foreman")')).toBeDisabled({ timeout: 10_000 });
    expect(page.url()).toContain(COCKPIT_PATH);
    await cockpitSwitcher.locator('button:has-text("Executive")').click();
    await expect(cockpitSwitcher.locator('button:has-text("Executive")')).toBeDisabled({ timeout: 10_000 });
    expect(page.url()).toContain(COCKPIT_PATH);

    // ---- DAY 4: CHANGE MANAGEMENT ----
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const before = bodyText.match(/\$([\d,]+) original.*?→ \$([\d,]+) current/);
    expect(before, "contract must show a starting current total").toBeTruthy();
    const expectedTotal = Number(before![2].replace(/,/g, "")) + 28500;

    const coCard = page.locator("div.border.rounded-md.p-3", { hasText: "footing" });
    const coForm = coCard.locator('form:has(select[name="status"])');
    await coForm.locator('select[name="status"]').selectOption("APPROVED");
    await expect(coForm.locator('select[name="status"]')).toHaveValue("APPROVED");
    await coForm.locator('input[name="revenueAmount"]').fill("28500");
    await coForm.locator('input[name="costAmount"]').fill("21000");
    await coForm.locator('button:has-text("Save")').click();
    await expect(page.locator("body")).toContainText(`$${expectedTotal.toLocaleString("en-US")} current`, { timeout: 10_000 });

    // ---- DAY 5: ACCOUNTING HANDOFF (same screen) ----
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Accounting handoff");
    expect(bodyText).toContain(`$${expectedTotal.toLocaleString("en-US")}`);

    // ---- DAY 6-7: CLOSEOUT ----
    const closeoutForm = page.locator('form:has(button:has-text("Close out project"))');
    await closeoutForm.locator('button:has-text("Close out project")').click();
    await expect(page.locator("body")).toContainText("Project closed out", { timeout: 10_000 });

    // ---- NEXT ESTIMATE: CLOSED LOOP (same screen) ----
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("NorthPoint Distribution Center");
    const nextEstimateForm = page.locator('form:has(button:has-text("Add bid line"))');
    const slabValue = await nextEstimateForm
      .locator('select[name="costCodeId"] option', { hasText: "Concrete slab on grade" })
      .getAttribute("value");
    await nextEstimateForm.locator('select[name="costCodeId"]').selectOption(slabValue!);
    await expect(nextEstimateForm.locator('select[name="costCodeId"]')).toHaveValue(slabValue!);
    await nextEstimateForm.locator('input[name="estimatedQty"]').fill("64");
    await nextEstimateForm.locator('input[name="estimatedHours"]').fill("54.4");
    await nextEstimateForm.locator('button:has-text("Add bid line")').click();
    await expect(page.locator("body")).toContainText("Estimator assumption", { timeout: 10_000 });

    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toMatch(/1\.0[0-9] hrs\/CY/); // company history ~1.04, recent ~1.08
    expect(bodyText).toContain("more aggressive than your company");

    // ---- SUMMARY ----
    expect(bodyText).toContain("Without CrewSync");
    expect(bodyText).toContain("With CrewSync");

    // The whole narrative, start to finish, never left this one URL.
    expect(page.url()).toContain(COCKPIT_PATH);
  });
});
