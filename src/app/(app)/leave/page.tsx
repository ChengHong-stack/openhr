import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getBalances } from "@/lib/leave";
import { fmtDay, todayUTC } from "@/lib/dates";
import { Flash, PageHeader, StatusBadge, Empty, type SP } from "@/components/ui";
import { LeaveForm } from "@/components/leave-form";
import { applyLeave, cancelLeave } from "./actions";

export const metadata = { title: "My leave" };

export default async function LeavePage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const sp = await searchParams;
  const thisYear = todayUTC().getUTCFullYear();
  const year = Number(sp.year) || thisYear;
  const [balances, types, requests] = await Promise.all([
    getBalances(me.id, year),
    db.leaveType.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.leaveRequest.findMany({
      where: { userId: me.id, startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } },
      include: { leaveType: true, approver: true },
      orderBy: { startDate: "desc" },
    }),
  ]);
  const today = todayUTC();
  const formTypes = types.map((t) => ({
    id: t.id,
    name: t.name,
    requiresReason: t.requiresReason,
    available: t.paid ? (balances.find((b) => b.leaveTypeId === t.id)?.available ?? 0) : null,
  }));

  return (
    <>
      <PageHeader title="My leave" subtitle={`Balances and requests for ${year}`}>
        <Link className="btn-secondary" href={`/leave?year=${year - 1}`}>← {year - 1}</Link>
        {year !== thisYear && <Link className="btn-secondary" href="/leave">This year</Link>}
        <Link className="btn-secondary" href={`/leave?year=${year + 1}`}>{year + 1} →</Link>
      </PageHeader>
      <Flash ok={sp.ok} error={sp.error} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {balances.filter((b) => b.paid).map((b) => (
          <div key={b.leaveTypeId} className="card !p-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
              <p className="text-sm font-medium text-slate-700">{b.name}</p>
            </div>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{b.available}<span className="ml-1 text-sm font-normal text-slate-500">days left</span></p>
            <p className="mt-1 text-xs text-slate-500">
              {b.entitled} entitled{b.carriedForward ? ` + ${b.carriedForward} carried` : ""}{b.adjustment ? ` ${b.adjustment > 0 ? "+" : ""}${b.adjustment} adj.` : ""} · {b.used} used{b.pending ? ` · ${b.pending} pending` : ""}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-2">
          <h2 className="h2 mb-4">Apply for leave</h2>
          {formTypes.length ? <LeaveForm types={formTypes} action={applyLeave} /> : <Empty>No leave types set up yet.</Empty>}
        </section>

        <section className="card lg:col-span-3">
          <h2 className="h2 mb-3">Requests</h2>
          {requests.length === 0 ? (
            <Empty>No leave requests in {year}.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {requests.map((r) => {
                    const cancellable = r.status === "PENDING" || (r.status === "APPROVED" && r.startDate > today);
                    return (
                      <tr key={r.id}>
                        <td className="font-medium">{r.leaveType.name}{r.reason && <p className="text-xs font-normal text-slate-500">{r.reason}</p>}</td>
                        <td className="whitespace-nowrap">
                          {fmtDay(r.startDate)}{r.endDate.getTime() !== r.startDate.getTime() && <> – {fmtDay(r.endDate)}</>}
                          {r.halfDay !== "NONE" && <span className="ml-1 text-xs text-slate-500">({r.halfDay})</span>}
                        </td>
                        <td>{Number(r.days)}</td>
                        <td>
                          <StatusBadge status={r.status} />
                          {r.approver && r.status !== "PENDING" && <p className="mt-1 text-xs text-slate-500">by {r.approver.name}</p>}
                          {r.decisionNote && <p className="text-xs text-slate-500">“{r.decisionNote}”</p>}
                        </td>
                        <td className="text-right">
                          {cancellable && (
                            <form action={cancelLeave}>
                              <input type="hidden" name="id" value={r.id} />
                              <button className="text-xs font-medium text-rose-600 hover:underline">Cancel</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
