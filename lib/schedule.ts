const DAY_MS = 24 * 60 * 60 * 1000;

/** Formats a Date as a YYYY-MM-DD key using UTC fields, so it round-trips through <input type="date"> and Prisma @db.Date-ish DateTime storage without timezone drift. */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** Monday (UTC) of the week containing the given date. */
export function startOfWeek(date: Date): Date {
  const day = date.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function weekDates(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function formatDayHeader(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" });
}

const JOB_COLOR_CLASSES = [
  "bg-blue-100 text-blue-800",
  "bg-green-100 text-green-800",
  "bg-purple-100 text-purple-800",
  "bg-amber-100 text-amber-800",
  "bg-pink-100 text-pink-800",
  "bg-teal-100 text-teal-800",
  "bg-orange-100 text-orange-800",
  "bg-cyan-100 text-cyan-800",
];

/** Stable color per job id, so the same job reads as the same color across the whole board. */
export function jobColorClass(jobId: string): string {
  let hash = 0;
  for (let i = 0; i < jobId.length; i++) hash = (hash * 31 + jobId.charCodeAt(i)) >>> 0;
  return JOB_COLOR_CLASSES[hash % JOB_COLOR_CLASSES.length];
}
