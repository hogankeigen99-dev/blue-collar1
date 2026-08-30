import { test, expect } from "@playwright/test";
import { login, dateKey, addDays } from "./helpers";

/**
 * Full operating-system integration pass: one continuous project identity
 * carried through every stage of the real chain —
 * Opportunity -> Bid -> Award -> Contract/SOV -> Schedule/Crew ->
 * Daily Report -> Production -> Materials -> Vendor -> Equipment ->
 * Subcontract -> Change Order -> Job Cost -> Billing -> Cash (AR/AP) ->
 * Closeout -> Historical Estimate — through the real UI, not seed data,
 * proving every downstream number is derived from the same originating
 * records rather than typed in independently at each stop.
 *
 * This complements (does not duplicate) the narrower per-feature suites:
 * full-lifecycle.spec.ts already proves Award(direct)->...->Closeout with
 * no duplicate entry; opportunity-pipeline/contract-billing/vendor-
 * procurement/cash.spec.ts each prove one leg in isolation. This test's
 * job is the cross-page financial-consistency proof and the legs those
 * suites don't chain together: Opportunity origin, Vendor/Subcontract/
 * Equipment, and Cash, all on ONE project, with the same numbers checked
 * on multiple different pages.
 *
 * Filename note: this test genuinely wins an Opportunity and completes a
 * Job, which moves company-wide aggregates other suites assert exact
 * values for (e.g. opportunity-pipeline.spec.ts's win-rate percentage,
 * estimate-actual-loop.spec.ts's unfiltered per-cost-code job counts).
 * The `z-` prefix is deliberate, not cosmetic — Playwright runs spec files
 * in filename order in this single-worker config, and this capstone test
 * is meant to run last, after every narrower suite's own exact-count
 * assertions have already been checked against a company state it hasn't
 * touched yet.
 */
test.describe("Full operating system — one project through the whole chain", () => {
  test("Opportunity through Historical Estimate, with financial consistency at every stop", async ({ page }) => {
    test.setTimeout(240_000);
    await login(page, "admin");

    const tag = `E2E-os-${Date.now()}`;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const startDate = dateKey(today);
    const endDate = dateKey(addDays(today, 20));

    // ---------------------------------------------------------------
    // 1. Opportunity -> Bid
    // ---------------------------------------------------------------
    await page.goto("/opportunities/new");
    await page.fill('input[name="title"]', `${tag} — Sitework bid`);
    await page.fill('input[name="prospectName"]', `${tag} Prospect LLC`);
    await page.fill('input[name="projectType"]', `${tag} Project Type`);
    await page.fill('input[name="estimatedValue"]', "96000");
    await page.click('button:has-text("Add opportunity")');
    await page.waitForURL(/\/opportunities\/c[a-z0-9]{10,}$/);
    const opportunityHref = new URL(page.url()).pathname;
    const opportunityId = opportunityHref.split("/").pop()!;

    await page.click('a:has-text("+ Add bid line")');
    const costCodeOptions = await page.locator('select[name="costCodeId"] option').allTextContents();
    const excavationLabel = costCodeOptions.find((o) => o.includes("Excavation"));
    await page.selectOption('select[name="costCodeId"]', { label: excavationLabel! });
    await page.fill('input[name="estimatedQty"]', "60");
    await page.fill('input[name="estimatedHours"]', "42");
    await page.click('button:has-text("Add bid line")');
    await page.waitForURL(opportunityHref);
    await expect(page.locator("body")).toContainText("Excavation");

    // ---------------------------------------------------------------
    // 2. Award (Opportunity -> Job, no re-entry of title/value/bid line)
    // ---------------------------------------------------------------
    await page.click('a:has-text("Mark won")');
    await page.waitForURL(new RegExp(`/jobs/new\\?opportunityId=${opportunityId}`));

    expect(await page.locator('input[name="title"]').inputValue()).toBe(`${tag} — Sitework bid`);
    expect(await page.locator('input[name="contractValue"]').inputValue()).toBe("96000");
    expect(await page.locator('input[name="costCodeQty"]').first().inputValue()).toBe("60");
    expect(await page.locator('input[name="costCodeHours"]').first().inputValue()).toBe("42");

    // The Labor ($) budget is auto-suggested from those cost-code hours the
    // instant the page renders — not a second, disconnected dollar guess.
    const laborBreakdown = (await page.locator("body").innerText()).match(
      /([\d.]+) cost-code hrs × \$(\d+)\/hr company avg = \$(\d+)/
    );
    expect(laborBreakdown, "labor-budget suggestion text should render").toBeTruthy();
    const [, hrsStr, rateStr, suggestedStr] = laborBreakdown!;
    expect(Number(hrsStr)).toBeCloseTo(42, 5);
    // rateStr is rounded to whole dollars for display; suggestedStr is computed
    // from the full-precision rate, so recomputing from the rounded rate is
    // only approximate — bound the gap rather than requiring exact equality.
    expect(Math.abs(Math.round(Number(hrsStr) * Number(rateStr)) - Number(suggestedStr))).toBeLessThanOrEqual(Number(hrsStr));
    expect(await page.locator('input[name="budget_LABOR"]').inputValue()).toBe(suggestedStr);
    await expect(page.locator("body")).toContainText("applied — edit above to override");

    await page.fill('input[name="newCustomerName"]', `${tag} Client LLC`);
    await page.fill('input[name="location"]', "500 Full Chain Way");
    await page.fill('input[name="targetStartDate"]', startDate);
    await page.fill('input[name="targetEndDate"]', endDate);
    const pmOptions = await page.locator('select[name="pmUserId"] option').allTextContents();
    await page.selectOption('select[name="pmUserId"]', { label: pmOptions.find((o) => o.includes("Priya"))! });
    const foremanOptions = await page.locator('select[name="foremanWorkerId"] option').allTextContents();
    const foremanLabel = foremanOptions.find((o) => o.includes("Frank"));
    await page.selectOption('select[name="foremanWorkerId"]', { label: foremanLabel! });
    const workerCheckboxes = await page.locator('input[name="workerIds"]').all();
    await workerCheckboxes[0].check();

    // An initial subcontractor row right on the Award form (a real vendor
    // gets found-or-created inline, same pattern as the Customer above).
    await page.click('button:has-text("+ Add subcontractor")');
    await page.fill('input[name="subVendor"]', `${tag} Drywall LLC`);
    await page.fill('input[name="subDescription"]', "Interior partitions");
    await page.fill('input[name="subAmount"]', "9000");

    await page.click('button:has-text("Award project")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;
    const jobId = jobHref.split("/").pop()!;

    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toMatch(/\d{4}-\d{3}/); // jobNumber auto-generated
    expect(bodyText).toContain(`Current contract value ${money(96000)}`);

    // The opportunity closes the loop back to this exact job.
    await page.goto(opportunityHref);
    expect(await page.locator("body").innerText()).toContain("Won");

    // ---------------------------------------------------------------
    // 3. Contract/SOV ties to the Command Center's contract value
    // ---------------------------------------------------------------
    await page.goto(`${jobHref}/contract`);
    let contractText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(contractText).toContain(`Scheduled value (current contract value) ${money(96000)}`);

    // ---------------------------------------------------------------
    // 4. Schedule/Crew — auto-scheduled at Award, no separate step
    // ---------------------------------------------------------------
    await page.goto("/schedule");
    const scheduleText = await page.locator("body").innerText();
    expect(scheduleText.includes("Frank") || scheduleText.includes(foremanLabel!.split(" (")[0])).toBe(true);

    // ---------------------------------------------------------------
    // 5. Equipment — committed cost flows from the asset's own rate,
    //    never re-typed per assignment. Fresh equipment (not a seeded
    //    asset already booked elsewhere) so the assignment can't collide
    //    with an existing job's dates.
    // ---------------------------------------------------------------
    await page.goto("/equipment/new");
    await page.fill('input[name="name"]', `${tag} Mini excavator`);
    await page.fill('input[name="type"]', "Excavator");
    await page.selectOption('select[name="ownership"]', { label: "Rented" });
    await page.fill('input[name="dailyRentalCost"]', "380");
    await page.click('button:has-text("Add equipment")');
    await page.waitForURL("/equipment");

    await page.goto("/equipment/assign");
    const equipmentOptions = await page.locator('select[name="equipmentId"] option').allTextContents();
    const pumpLabel = equipmentOptions.find((o) => o.includes(`${tag} Mini excavator`));
    await page.selectOption('select[name="equipmentId"]', { label: pumpLabel! });
    const jobOptions = await page.locator('select[name="jobId"] option').allTextContents();
    const jobLabel = jobOptions.find((o) => o.includes(`${tag} — Sitework bid`));
    await page.selectOption('select[name="jobId"]', { label: jobLabel! });
    await page.fill('input[name="startDate"]', startDate);
    await page.fill('input[name="endDate"]', dateKey(addDays(today, 2)));
    await page.click('button:has-text("Assign")');
    await page.waitForURL("/equipment");
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toMatch(new RegExp(`${tag} Mini excavator.*?${tag} — Sitework bid`));

    // Committed cost flows from the equipment's own daily rate, never
    // re-typed per assignment — real on the job's own costing table.
    await page.goto(jobHref);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Equipment $0 $1,140 $0 $1,140");

    // ---------------------------------------------------------------
    // 6. Mobilize -> Active
    // ---------------------------------------------------------------
    await page.goto(`${jobHref}/command-center/edit`);
    await page.selectOption('select[name="stage"]', "MOBILIZATION");
    await page.click('button:has-text("Save")');
    await page.waitForURL(jobHref);
    await page.goto(`${jobHref}/command-center/edit`);
    await page.selectOption('select[name="stage"]', "ACTIVE");
    await page.click('button:has-text("Save")');
    await page.waitForURL(jobHref);

    // ---------------------------------------------------------------
    // 7. Daily Report -> Production, Materials, Change Order — one form,
    //    no duplicate entry across three different downstream records
    // ---------------------------------------------------------------
    await page.goto(`${jobHref}/daily-reports/new`);
    await page.fill('input[name="date"]', startDate);
    await page.fill('input[name="crewSize"]', "2");
    const row = page.locator('input[name="rowJobCostCodeId"]').first().locator("xpath=..");
    await row.locator('input[name="rowHours"]').fill("20");
    await row.locator('input[name="rowQty"]').fill("28");
    await page.fill('textarea[name="workCompleted"]', "Excavated grid A-C");
    await page.fill('textarea[name="materialNeeded"]', `${tag} Need 12 tons of crushed stone base`);
    await page.check("#hasChangeCondition");
    await page.fill('textarea[name="changeConditionNotes"]', `${tag} Hit buried debris, needs extra haul-off`);
    await page.click('button:has-text("Submit daily update")');
    await page.waitForURL(jobHref);

    // Job cost updated live from the same entry, no separate production log.
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toMatch(/Actual labor hours\s*20/);

    // ---------------------------------------------------------------
    // 8. Materials -> Vendor — assign an existing vendor, mark received
    // ---------------------------------------------------------------
    await page.goto(`${jobHref}/materials`);
    await expect(page.locator("body")).toContainText("Need 12 tons of crushed stone base");
    const matCard = page.locator("div.bg-white.border.rounded-lg.p-4.space-y-2", { hasText: "crushed stone base" });
    const vendorOptions = await matCard.locator('select[name="vendorId"] option').allTextContents();
    const metroLabel = vendorOptions.find((o) => o.includes("Metro Rebar"));
    await matCard.locator('select[name="vendorId"]').selectOption({ label: metroLabel! });
    await matCard.locator('select[name="status"]').selectOption("RECEIVED");
    await matCard.locator('input[name="unitCost"]').fill("140");
    await matCard.locator('input[name="totalCost"]').fill("1680");
    await matCard.locator('input[name="receivedDate"]').fill(startDate);
    await matCard.locator('button:has-text("Save")').click();
    await page.waitForURL(`${jobHref}/materials`);
    await page.reload(); // past the client router cache, same route we just left
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Metro Rebar & Supply");
    expect(bodyText).toContain("RECEIVED");

    // The vendor directory rolls this job's spend up live, not re-entered —
    // click through to Metro Rebar & Supply's own detail and confirm this
    // exact job shows up in its material-request history.
    await page.goto("/vendors");
    await page.click('a:has-text("Metro Rebar & Supply")');
    await page.waitForURL(/\/vendors\/c[a-z0-9]{10,}$/);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain(`${tag} — Sitework bid`);

    // ---------------------------------------------------------------
    // 9. Subcontract (the one entered at Award) — execute it, then bill it
    // ---------------------------------------------------------------
    await page.goto(`${jobHref}/subcontracts`);
    let subText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(subText).toContain(`${tag} Drywall LLC`);
    expect(subText).toContain("DRAFT");
    const subCard = page.locator("div.bg-white.border.rounded-lg", { hasText: `${tag} Drywall LLC` });
    await subCard.locator('select[name="agreementStatus"]').selectOption("EXECUTED");
    await subCard.locator('button:has-text("Save")').click();
    await page.waitForURL(`${jobHref}/subcontracts`);
    await page.reload();

    const executedSubCard = page.locator("div.bg-white.border.rounded-lg", { hasText: `${tag} Drywall LLC` });
    await executedSubCard.locator('select[name="status"]').selectOption("INVOICED");
    await executedSubCard.locator('input[name="actualAmount"]').fill("9000");
    await executedSubCard.locator('button:has-text("Save")').click();
    await page.waitForURL(`${jobHref}/subcontracts`);
    await page.reload();
    subText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(subText).toContain("EXECUTED");
    expect(subText).toContain("INVOICED");

    // ---------------------------------------------------------------
    // 10. Change Order: field-flagged -> priced -> approved -> SOV grows
    //     -> Command Center and the Contract page and Financials all
    //     move together, because they all read the same records
    // ---------------------------------------------------------------
    await page.goto(`${jobHref}/change-orders`);
    let coText = await page.locator("body").innerText();
    expect(coText).toContain("IDENTIFIED");
    const coForm = page.locator('form:has(select[name="status"])').first();
    await coForm.locator('select[name="status"]').selectOption("APPROVED");
    await coForm.locator('input[name="revenueAmount"]').fill("5000");
    await coForm.locator('input[name="costAmount"]').fill("3400");
    await coForm.locator('button:has-text("Save")').click();
    await page.waitForURL(`${jobHref}/change-orders`);
    coText = await page.locator("body").innerText();
    expect(coText).toContain("APPROVED");

    const newContractValue = 96000 + 5000;
    await page.goto(jobHref);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain(`Current contract value ${money(newContractValue)}`);

    await page.goto(`${jobHref}/contract`);
    contractText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(contractText).toContain(`Scheduled value (current contract value) ${money(newContractValue)}`);

    // Same number, third page: the company Financials view's per-project row.
    await page.goto("/financials");
    const financialsRow = page.locator("tr", { hasText: `${tag} — Sitework bid` });
    const financialsRowText = (await financialsRow.first().innerText()).replace(/\s+/g, " ");
    expect(financialsRowText).toContain(money(newContractValue));

    // ---------------------------------------------------------------
    // 11. Billing: a pay application -> AR shows up on /cash, matching
    //     the exact number the invoices page itself shows
    // ---------------------------------------------------------------
    await page.goto(`${jobHref}/invoices/new`);
    await page.locator("tr").filter({ hasText: "original contract" }).locator('input[name="pctCompleteToDate"]').fill("40");
    await page.fill('input[name="date"]', startDate);
    await page.click('button:has-text("Submit pay application")');
    await page.waitForURL(`${jobHref}/invoices`);
    let invoicesText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const invMatch = invoicesText.match(/(INV-\S+) — (\$[\d,]+) due/);
    expect(invMatch, "a new invoice number/amount should render").toBeTruthy();
    const [, invoiceNumber, invoiceAmount] = invMatch!;

    // Send it — DRAFT pay apps aren't outstanding AR yet.
    const invoiceRow = page.locator("div.px-4.py-3.space-y-2", { hasText: invoiceNumber });
    await invoiceRow.locator('select[name="status"]').selectOption("SENT");
    await invoiceRow.locator('button:has-text("Save")').click();
    await page.waitForURL(`${jobHref}/invoices`);
    await page.reload();
    invoicesText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(invoicesText).toContain("SENT");

    // ---------------------------------------------------------------
    // 12. Cash: the exact same invoice, AR side; the exact same
    //     subcontract, AP side; retainage held on both directions
    // ---------------------------------------------------------------
    await page.goto("/cash");
    const cashText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(cashText).toContain(`${tag} — Sitework bid`);
    expect(cashText).toContain(invoiceNumber);
    expect(cashText).toContain(invoiceAmount.replace("$", "")); // amount appears in the AR row
    expect(cashText).toContain(`${tag} Drywall LLC`); // the INVOICED subcontract, AP side
    expect(cashText).toMatch(/Retainage held/);

    // ---------------------------------------------------------------
    // 13. Closeout -> Complete -> a Historical benchmark is recorded
    //     automatically, feeding the NEXT estimate
    // ---------------------------------------------------------------
    await page.goto(`${jobHref}/command-center/edit`);
    await page.check('input[name="punchListComplete"]');
    await page.check('input[name="requiredDocsComplete"]');
    await page.selectOption('select[name="stage"]', "CLOSEOUT");
    await page.click('button:has-text("Save")');
    await page.waitForURL(jobHref);

    await page.goto(`${jobHref}/command-center/edit`);
    await page.selectOption('select[name="stage"]', "COMPLETE");
    await page.click('button:has-text("Save")');
    await page.waitForURL(jobHref);
    bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Complete");

    // ---------------------------------------------------------------
    // 14. Historical Estimate: this exact job's cost code now shows up
    //     as real estimating history for its (new, isolated) project type
    // ---------------------------------------------------------------
    await page.goto(`/cost-codes?projectType=${encodeURIComponent(`${tag} Project Type`)}`);
    const costCodesText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const rowMatch = costCodesText.match(/31 23 00 Excavation CY ([\d.]+) ([\d.]+) ([\d.]+) (\d+)/);
    expect(rowMatch, "the excavation row should be parseable, filtered to this job's own project type").toBeTruthy();
    expect(rowMatch![4]).toBe("1"); // exactly this one completed job contributed
  });
});

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
