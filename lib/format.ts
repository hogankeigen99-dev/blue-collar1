export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

export const PROJECT_STAGE_LABEL: Record<string, string> = {
  PRECON: "Preconstruction",
  MOBILIZATION: "Mobilization",
  ACTIVE: "Active",
  PUNCH_LIST: "Punch list",
  CLOSEOUT: "Closeout",
  COMPLETE: "Complete",
};

export const OPPORTUNITY_STAGE_LABEL: Record<string, string> = {
  OPPORTUNITY: "Qualifying",
  BIDDING: "Bidding",
  SUBMITTED: "Submitted",
  WON: "Won",
  LOST: "Lost",
  NO_BID: "No bid",
};

export const COST_CATEGORY_LABEL: Record<string, string> = {
  LABOR: "Labor",
  MATERIAL: "Material",
  EQUIPMENT: "Equipment",
  SUBCONTRACTOR: "Subcontractor",
  OTHER: "Other",
};
