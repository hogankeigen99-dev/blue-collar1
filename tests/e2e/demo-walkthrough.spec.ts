import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

/**
 * The live product demo: Mueller Construction Demo, its 5 personas, the
 * Switch Demo Role control, the Riverside Commerce Center hero project, and
 * the walkthrough's core claim — ENTER ONCE, CREWSYNC HANDLES THE REST.
 * Every step drives the real app (real server actions, real Prisma data);
 * nothing here is a scripted screenshot.
 */

async function switchRole(page: Page, label: string) {
  await page.click(`form:has(button[name="persona"]) button:has-text("${label}")`);
  await page.waitForLoadState("networkidle");
}

test.describe("Demo mode", () => {
  test("all 5 personas are reachable via Switch Demo Role, and the bar is demo-only", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/");
    let bodyText = await page.locator("body").innerText();
    expect(bodyText.toLowerCase()).toContain("demo mode");
    expect(bodyText).toContain("Switch Demo Role");

    await switchRole(page, "Foreman");
    await expect(page).toHaveURL(/\/field$/);
    expect(await page.locator("body").innerText()).toContain("Frank Delgado");

    await switchRole(page, "Estimator");
    await expect(page).toHaveURL(/\/opportunities$/);
    expect(await page.locator("body").innerText()).toContain("Elena Cruz");

    await switchRole(page, "Accounting");
    await expect(page).toHaveURL(/\/cash$/);
    expect(await page.locator("body").innerText()).toContain("Carlos Ibarra");

    await switchRole(page, "Project Manager");
    await expect(page).toHaveURL(/\/today$/);
    expect(await page.locator("body").innerText()).toContain("Priya Shah");

    await switchRole(page, "Executive");
    await expect(page).toHaveURL(/\/$/);
    expect(await page.locator("body").innerText()).toContain("Amanda Reyes");
  });

  test("the Walkthrough button opens a step panel that navigates the real app", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/");
    await page.click('button:has-text("Walkthrough")');
    await page.waitForLoadState("networkidle");

    let bodyText = (await page.locator("body").innerText()).toLowerCase();
    expect(bodyText).toContain("step 1 of");
    expect(bodyText).toContain("company command");

    await page.click('button:has-text("Next")');
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/jobs\/c[a-z0-9]{10,}$/);
    bodyText = (await page.locator("body").innerText()).toLowerCase();
    expect(bodyText).toContain("riverside commerce center");
    expect(bodyText).toContain("step 2 of");

    await page.click('button:has-text("Back")');
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/$/);

    await page.click('button:has-text("Exit Walkthrough")');
    expect((await page.locator("body").innerText()).toLowerCase()).not.toContain("step 1 of");
  });
});

test.describe("Enter once, CrewSync handles the rest", () => {
  test("a foreman's daily report on the concrete line becomes a real labor exception for the PM, live", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/jobs");
    await page.click('a:has-text("Riverside Commerce Center")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;
    const jobId = jobHref.split("/").pop()!;

    // Before: no variance is reported on the concrete line — zero entries.
    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).not.toContain("Labor overrun");

    // The live entry: 72 hours / 64 CY against a 0.85 hrs/CY estimate.
    await page.goto(`${jobHref}/daily-reports/new`);
    const concreteRow = page.locator("div.flex.items-center.gap-2", { hasText: "Concrete slab on grade" });
    await concreteRow.locator('input[name="rowHours"]').fill("72");
    await concreteRow.locator('input[name="rowQty"]').fill("64");
    await page.click('button:has-text("Submit daily update")');
    await page.waitForURL(jobHref);

    // The Project page's cost-code table now shows the real 1.13 hrs/CY
    // actual rate (72/64, computed by lib/productivity.ts) and the overrun.
    await page.goto(jobHref);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toMatch(/Concrete slab on grade[\s\S]{0,200}1\.13/);
    expect(bodyText).toContain("Labor overrun");
    expect(bodyText).toMatch(/3[0-4]% over/);

    // PM Daily Command — the exception surfaces automatically, no re-entry.
    await switchRole(page, "Project Manager");
    await page.goto("/today");
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Riverside Commerce Center");
    expect(bodyText).toContain("Labor overrun");
    expect(bodyText).toMatch(/WHY/i);
    expect(bodyText).toMatch(/ACTION/i);

    await page.click(`a[href="${jobHref}"]`);
    await expect(page).toHaveURL(jobHref);
  });

  test("estimator sees NorthPoint's concrete estimate against real company history", async ({ page }) => {
    await login(page, "estimator");
    await page.goto("/opportunities");
    await page.click('a:has-text("NorthPoint Distribution Center")');
    await page.waitForURL(/\/opportunities\/c[a-z0-9]{10,}$/);
    const opportunityHref = new URL(page.url()).pathname;

    await page.click('a:has-text("+ Add bid line")');
    await page.waitForLoadState("networkidle");
    const slabValue = await page
      .locator('select[name="costCodeId"] option', { hasText: "Concrete slab on grade" })
      .getAttribute("value");
    await page.selectOption('select[name="costCodeId"]', slabValue!);
    await expect(page.locator('select[name="costCodeId"]')).toHaveValue(slabValue!);

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Historical productivity for this code");
    // Company history ~1.04 hrs/CY, recent-3 ~1.08 hrs/CY — real weighted
    // averages from the concrete benchmark history seeded for this demo.
    expect(bodyText).toMatch(/1\.0[0-9]/);

    await page.fill('input[name="estimatedQty"]', "600");
    await page.fill('input[name="estimatedHours"]', "510"); // 0.85 hrs/CY, the same aggressive bid rate as Riverside
    await page.click('button:has-text("Add bid line")');
    await page.waitForURL(opportunityHref);
    await expect(page.locator("body")).toContainText("Concrete slab on grade");
  });

  test("selecting the structural steel winner creates a real Subcontract, not just a decision", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/jobs");
    await page.click('a:has-text("Riverside Commerce Center")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;

    await page.goto(`${jobHref}/bid-packages`);
    await page.click('a:has-text("Structural Steel Package")');
    await page.waitForURL(/\/bid-packages\/c[a-z0-9]{10,}$/);

    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Titan Steel Erectors");
    expect(bodyText).toContain("Apex Structural Systems");
    expect(bodyText).toMatch(/Excludes: Excludes steel deck/);

    // Lowest bid (Apex) has a real exclusion — Titan wins instead.
    const titanCard = page.locator("div.bg-white.border.rounded-lg", { hasText: "Titan Steel Erectors" });
    await titanCard.locator('button:has-text("Select as winner")').click();
    await page.waitForLoadState("networkidle");

    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Awarded");
    expect(bodyText).toContain("Subcontract was created automatically");

    await page.click('a:has-text("View subcontract")');
    await page.waitForURL(`${jobHref}/subcontracts`);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Titan Steel Erectors");
    expect(bodyText).toMatch(/\$184,000/);
  });

  test("pricing and approving the footing change order updates the real contract and SOV", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/jobs");
    await page.click('a:has-text("Riverside Commerce Center")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;

    await page.goto(`${jobHref}/contract`);
    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const before = bodyText.match(/Total \$([\d,]+)/);
    expect(before, "contract page must show a starting total").toBeTruthy();

    await page.goto(`${jobHref}/change-orders`);
    await page.waitForLoadState("networkidle");
    const coCard = page.locator("div.bg-white.border.rounded-lg", { hasText: "Revised footing detail" });
    await coCard.locator('select[name="status"]').selectOption("APPROVED");
    await expect(coCard.locator('select[name="status"]')).toHaveValue("APPROVED");
    await coCard.locator('input[name="revenueAmount"]').fill("28500");
    await coCard.locator('input[name="costAmount"]').fill("21000");
    await coCard.locator('button:has-text("Save")').click();
    await page.waitForURL(`${jobHref}/change-orders`);

    await page.goto(`${jobHref}/contract`);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Revised footing detail");
    expect(bodyText).toContain("(change order)");
    const expectedTotal = Number(before![1].replace(/,/g, "")) + 28500;
    expect(bodyText).toContain(`Total $${expectedTotal.toLocaleString("en-US")}`);
  });

  test("accounting sees real AR/AP, retainage, and Riverside's own billing", async ({ page }) => {
    await login(page, "accounting");
    await page.goto("/cash");
    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Needs action");
    expect(bodyText).toMatch(/AR overdue|AP overdue|held by owner|owed to/);

    await page.goto("/jobs");
    await page.click('a:has-text("Riverside Commerce Center")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;
    await page.goto(`${jobHref}/invoices`);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Schedule of Values — billed to date");
    expect(bodyText).toMatch(/INV-3201/);
  });
});

test.describe("Reset Demo", () => {
  test("restores the seeded demonstration state", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/jobs");
    await page.click('a:has-text("Riverside Commerce Center")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    const jobHref = new URL(page.url()).pathname;

    // Confirm this session's own mutations are actually there before reset —
    // otherwise "restored" would be trivially true.
    let bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).toContain("Labor overrun");

    page.on("dialog", (dialog) => dialog.accept());
    await page.click('button:has-text("Reset Demo")');
    await page.waitForURL(/\/login/);
    expect(await page.locator("body").innerText()).toContain("CrewSync");

    await login(page, "admin");
    await page.goto("/jobs");
    await page.click('a:has-text("Riverside Commerce Center")');
    await page.waitForURL(/\/jobs\/c[a-z0-9]{10,}$/);
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(bodyText).not.toContain("Labor overrun");
    expect(bodyText).toContain("Riverside Commerce Center");
  });
});
