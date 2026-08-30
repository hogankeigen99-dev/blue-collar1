/**
 * Lets a small, fixed set of real mutation actions redirect back to the
 * Small Project Cockpit (app/demo/small-project) instead of their normal
 * target page, when called from there — so a real award/crew-assign/daily-
 * report/change-order/stage-change stays on one continuous screen instead
 * of bouncing to the page that action would otherwise land on.
 *
 * Deliberately not a general "redirect anywhere" mechanism: the only value
 * this can ever return besides the action's own fallback is this one
 * hardcoded path, so a form field an operator can't otherwise control can't
 * become an open redirect.
 */
export function demoReturnTo(formData: FormData, fallback: string): string {
  return formData.get("returnTo") === "/demo/small-project" ? "/demo/small-project" : fallback;
}
