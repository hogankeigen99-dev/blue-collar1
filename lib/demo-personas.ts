/** Plain data, kept out of lib/demo-actions.ts ("use server" — every export
 * from that file must be an async Server Action, so this constant can't
 * live there). The 5 walkthrough personas. Estimator and Accounting are
 * real ADMIN-role logins (see lib/demo-seed.ts) landing on a specific view
 * rather than the default Company Command, since neither is a distinct
 * Role in this app — that split is a deliberate, previously-documented
 * scope decision (README's "A note on scope"), not something demo mode
 * should quietly reintroduce as a second permission model. */
export const DEMO_PERSONAS = [
  { key: "executive", label: "Executive", email: "admin@crewsync.dev", landing: "/" },
  { key: "pm", label: "Project Manager", email: "pm@crewsync.dev", landing: "/today" },
  { key: "estimator", label: "Estimator", email: "estimator@crewsync.dev", landing: "/opportunities" },
  { key: "foreman", label: "Foreman", email: "foreman@crewsync.dev", landing: "/field" },
  { key: "accounting", label: "Accounting", email: "accounting@crewsync.dev", landing: "/cash" },
] as const;

export type DemoPersonaKey = (typeof DEMO_PERSONAS)[number]["key"];
