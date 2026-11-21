import { config } from "./config";

/** Parse YYYY-MM-DD as a UTC midnight date (matches Postgres DATE columns). */
export function parseDay(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  return isNaN(d.getTime()) ? null : d;
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function fmtDay(d: Date | string | null | undefined) {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(d: Date) {
  return d.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: config.timezone });
}

export function todayUTC() {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: config.timezone }));
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

/** ISO weekday 1..7 for a UTC date. */
export const isoDow = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1;

export function eachDay(start: Date, end: Date) {
  const out: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) out.push(new Date(t));
  return out;
}
