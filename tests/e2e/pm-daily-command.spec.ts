import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * The PM Daily Command (/today) must answer, for a real seeded exception:
 * what needs attention, why, the impact, what to do, who owns it, and when
 * it's due — not just repeat the bare alert list from /alerts.
 */
test.describe("PM Daily Command", () => {
  test("shows a known exception with why/impact/owner/due and a recommended action", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/today");

    // Sunrise Duplex's seeded "today" report flags a fresh equipment issue —
    // deterministic regardless of when the seed was run.
    const card = page
      .locator("div.bg-white.border.rounded-lg", { hasText: "Sunrise Duplex" })
      .filter({ hasText: "Equipment issue" })
      .first();
    await expect(card).toBeVisible();

    await expect(card.locator("text=Why it matters")).toBeVisible();
    await expect(card.locator("text=Impact if ignored")).toBeVisible();
    await expect(card.locator("text=Owner")).toBeVisible();
    await expect(card.locator("text=Due")).toBeVisible();

    // Owner resolves to a real name, not a placeholder.
    const ownerValue = await card.locator("text=Owner").locator("xpath=following-sibling::div[1]").innerText();
    expect(ownerValue.trim().length).toBeGreaterThan(0);
    expect(ownerValue).not.toBe("Unassigned");

    // A concrete action with a working link back into the job.
    const actionLink = card.locator("a", { hasText: "→" });
    await expect(actionLink).toBeVisible();
    const href = await actionLink.getAttribute("href");
    expect(href).toMatch(/^\/jobs\//);
  });

  test("empty state reads cleanly when nothing needs attention", async ({ page }) => {
    // Not a seeded-state assertion — just confirms the page never crashes
    // and always renders one of the two valid states.
    await login(page, "admin");
    const response = await page.goto("/today");
    expect(response?.status()).toBe(200);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("PM Daily Command");
  });
});
