import type { Page } from "@playwright/test";

/** Seeded demo accounts (prisma/seed.ts) — dev/test only. */
export const DEMO_ACCOUNTS = {
  admin: { email: "admin@crewsync.dev", password: "admin12345" },
  pm: { email: "pm@crewsync.dev", password: "pm12345678" },
  foreman: { email: "foreman@crewsync.dev", password: "foreman1234" },
} as const;

export async function login(page: Page, account: keyof typeof DEMO_ACCOUNTS = "admin") {
  const { email, password } = DEMO_ACCOUNTS[account];
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.locator('form:has(input[name="password"]) button[type="submit"]').click();
  await page.waitForURL("/");
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Reads the job Command Center's label/value stat tiles into a plain
 * object, e.g. { "Actual labor hours": "67", "Schedule %": "71%", ... }. */
export async function getCommandCenterStats(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    document.querySelectorAll("div").forEach((div) => {
      const label = div.querySelector(":scope > div.text-slate-500.text-xs");
      const value = div.querySelector(":scope > div.font-medium");
      if (label && value && div.children.length === 2) {
        out[label.textContent!.trim()] = value.textContent!.trim();
      }
    });
    return out;
  });
}

/** Resolves a seeded job's detail-page URL by the (unique-enough) title text
 * shown as a link on /jobs. */
export async function findJobHrefByTitle(page: Page, titleSubstring: string): Promise<string> {
  await page.goto("/jobs");
  const href = await page.locator(`a:has-text("${titleSubstring}")`).first().getAttribute("href");
  if (!href) throw new Error(`No job link found containing "${titleSubstring}"`);
  return href;
}
