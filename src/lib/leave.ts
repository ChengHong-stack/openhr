import { db } from "./db";
import { config } from "./config";
import { eachDay, isoDow, ymd } from "./dates";
import type { HalfDay } from "@prisma/client";

/** Working days between two dates (inclusive), skipping non-working weekdays and public holidays. */
export async function countLeaveDays(start: Date, end: Date, halfDay: HalfDay) {
  if (end < start) return 0;
  const holidays = await db.holiday.findMany({ where: { date: { gte: start, lte: end } } });
  const hol = new Set(holidays.map((h) => ymd(h.date)));
  const days = eachDay(start, end).filter((d) => config.workingDays.includes(isoDow(d)) && !hol.has(ymd(d))).length;
  if (halfDay !== "NONE") return days >= 1 && start.getTime() === end.getTime() ? 0.5 : days;
  return days;
}

export type BalanceRow = {
  leaveTypeId: string;
  name: string;
  code: string;
  color: string;
  paid: boolean;
  entitled: number;
  carriedForward: number;
  adjustment: number;
  used: number;
  pending: number;
  available: number;
  hasRecord: boolean;
};

/** Balances per active leave type for a user and year. Requests count against the year they start in. */
export async function getBalances(userId: string, year: number): Promise<BalanceRow[]> {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31));
  const [types, records, requests] = await Promise.all([
    db.leaveType.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.leaveBalance.findMany({ where: { userId, year } }),
    db.leaveRequest.groupBy({
      by: ["leaveTypeId", "status"],
      where: { userId, startDate: { gte: from, lte: to }, status: { in: ["APPROVED", "PENDING"] } },
      _sum: { days: true },
    }),
  ]);
  return types.map((t) => {
    const r = records.find((x) => x.leaveTypeId === t.id);
    const sum = (s: string) =>
      Number(requests.find((q) => q.leaveTypeId === t.id && q.status === s)?._sum.days ?? 0);
    const entitled = Number(r?.entitled ?? t.defaultDays);
    const carriedForward = Number(r?.carriedForward ?? 0);
    const adjustment = Number(r?.adjustment ?? 0);
    const used = sum("APPROVED");
    const pending = sum("PENDING");
    return {
      leaveTypeId: t.id,
      name: t.name,
      code: t.code,
      color: t.color,
      paid: t.paid,
      entitled,
      carriedForward,
      adjustment,
      used,
      pending,
      available: entitled + carriedForward + adjustment - used - pending,
      hasRecord: !!r,
    };
  });
}

/**
 * Year-end carry forward: for each active user and leave type with a carry-forward cap,
 * move min(remaining in fromYear, cap) into the next year's balance record.
 */
export async function runCarryForward(fromYear: number) {
  const types = await db.leaveType.findMany({ where: { active: true, carryForwardMax: { gt: 0 } } });
  const users = await db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  let updated = 0;
  for (const u of users) {
    const bals = await getBalances(u.id, fromYear);
    for (const t of types) {
      const b = bals.find((x) => x.leaveTypeId === t.id);
      if (!b) continue;
      const remaining = b.entitled + b.carriedForward + b.adjustment - b.used; // pending excluded
      const cf = Math.max(0, Math.min(remaining, Number(t.carryForwardMax)));
      await db.leaveBalance.upsert({
        where: { userId_leaveTypeId_year: { userId: u.id, leaveTypeId: t.id, year: fromYear + 1 } },
        create: { userId: u.id, leaveTypeId: t.id, year: fromYear + 1, entitled: t.defaultDays, carriedForward: cf },
        update: { carriedForward: cf },
      });
      updated++;
    }
  }
  return updated;
}
