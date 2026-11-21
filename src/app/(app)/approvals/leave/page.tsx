import Link from "next/link";
import { db } from "@/lib/db";
import { requireApprover, approvableOwnersWhere } from "@/lib/session";
import { getBalances } from "@/lib/leave";
import { fmtDay, fmtDateTime } from "@/lib/dates";
import { Avatar, Empty, Flash, PageHeader, StatusBadge, type SP } from "@/components/ui";
import { DecisionForm } from "@/components/decision-form";
import { approveLeave, rejectLeave, revokeLeave } from "../../leave/actions";

export const metadata = { title: "Leave approvals" };

export default async function LeaveApprovals({ searchParams }: { searchParams: SP }) {
  const me = await requireApprover();
  const sp = await searchParams;
  const tab = sp.tab === "history" ? "history" : "pending";
  const owner = await approvableOwnersWhere(me);

  const requests = await db.leaveRequest.findMany({
    where: { user: owner, status: tab === "pending" ? "PENDING" : { not: "PENDING" } },
    include: { user: { include: { department: true } }, leaveType: true, approver: true },
    orderBy: tab === "pending" ? { startDate: "asc" } : { decidedAt: "desc" },
    take: tab === "pending" ? undefined : 100,
  });

  // Balance context for pending requests
  const balanceFor = new Map<string, number>();
  if (tab === "pending") {
    for (const r of requests) {
      const k = `${r.userId}:${r.startDate.getUTCFullYear()}`;
      if (balanceFor.has(k + r.leaveTypeId)) continue;
      const bals = await getBalances(r.userId, r.startDate.getUTCFullYear());
      for (const b of bals) balanceFor.set(k + b.leaveTypeId, b.available);
    }
  }
  const returnTo = `/approvals/leave${tab === "history" ? "?tab=history" : ""}`;

  return (
    <>
      <PageHeader
        title="Leave approvals"
        subtitle={me.role === "ADMIN" ? "All employees" : "Your direct reports"}
      >
        <Link href="/approvals/leave" className={tab === "pending" ? "btn-primary" : "btn-secondary"}>Pending</Link>
        <Link href="/approvals/leave?tab=history" className={tab === "history" ? "btn-primary" : "btn-secondary"}>History</Link>
      </PageHeader>
      <Flash ok={sp.ok} error={sp.error} />

      <section className="card">
        {requests.length === 0 ? (
          <Empty>{tab === "pending" ? "Nothing waiting for you. 🎉" : "No decisions yet."}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Employee</th><th>Leave</th><th>Dates</th><th>Days</th><th>{tab === "pending" ? "Balance after" : "Status"}</th><th /></tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const after = balanceFor.get(`${r.userId}:${r.startDate.getUTCFullYear()}${r.leaveTypeId}`);
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <Avatar name={r.user.name} image={r.user.image} size={28} />
                          <div>
                            <p className="font-medium">{r.user.name}</p>
                            <p className="text-xs text-slate-500">{r.user.department?.name ?? r.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: r.leaveType.color }} />{r.leaveType.name}</span>
                        {r.reason && <p className="text-xs text-slate-500">{r.reason}</p>}
                        <p className="text-xs text-slate-400">Applied {fmtDateTime(r.createdAt)}</p>
                      </td>
                      <td className="whitespace-nowrap">
                        {fmtDay(r.startDate)}{r.endDate.getTime() !== r.startDate.getTime() && <> – {fmtDay(r.endDate)}</>}
                        {r.halfDay !== "NONE" && <span className="ml-1 text-xs text-slate-500">({r.halfDay})</span>}
                      </td>
                      <td>{Number(r.days)}</td>
                      <td>
                        {tab === "pending" ? (
                          r.leaveType.paid ? (
                            <span className={after !== undefined && after < 0 ? "font-semibold text-rose-600" : ""}>{after ?? "—"} day(s)</span>
                          ) : <span className="text-xs text-slate-500">Unpaid</span>
                        ) : (
                          <>
                            <StatusBadge status={r.status} />
                            {r.approver && <p className="mt-1 text-xs text-slate-500">by {r.approver.name}</p>}
                            {r.decisionNote && <p className="text-xs text-slate-500">“{r.decisionNote}”</p>}
                          </>
                        )}
                      </td>
                      <td className="text-right">
                        {r.status === "PENDING" ? (
                          <DecisionForm id={r.id} approve={approveLeave} reject={rejectLeave} returnTo={returnTo} />
                        ) : r.status === "APPROVED" && me.role === "ADMIN" ? (
                          <form action={revokeLeave}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button data-decision="revoke" className="text-xs font-medium text-rose-600 hover:underline">Revoke</button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
