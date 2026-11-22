import Link from "next/link";
import { db } from "@/lib/db";
import { requireApprover, approvableOwnersWhere } from "@/lib/session";
import { fmtDay, fmtDateTime } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Avatar, Empty, Flash, PageHeader, StatusBadge, type SP } from "@/components/ui";
import { DecisionForm } from "@/components/decision-form";
import { approveClaim, rejectClaim } from "../../claims/actions";

export const metadata = { title: "Claim approvals" };

export default async function ClaimApprovals({ searchParams }: { searchParams: SP }) {
  const me = await requireApprover();
  const sp = await searchParams;
  const tab = sp.tab === "history" ? "history" : "pending";
  const claims = await db.claim.findMany({
    where: { user: await approvableOwnersWhere(me, "claim"), leaveRequestId: null, status: tab === "pending" ? "PENDING" : { not: "PENDING" } },
    include: { user: { include: { department: true } }, category: true, approver: true },
    orderBy: tab === "pending" ? { createdAt: "asc" } : { decidedAt: "desc" },
    take: tab === "pending" ? undefined : 100,
  });
  const total = claims.reduce((a, c) => a + Number(c.amount), 0);
  const returnTo = `/approvals/claims${tab === "history" ? "?tab=history" : ""}`;

  return (
    <>
      <PageHeader title="Claim approvals" subtitle={tab === "pending" ? `${claims.length} pending · ${fmtMoney(total)}` : "Recent decisions"}>
        <Link href="/approvals/claims" className={tab === "pending" ? "btn-primary" : "btn-secondary"}>Pending</Link>
        <Link href="/approvals/claims?tab=history" className={tab === "history" ? "btn-primary" : "btn-secondary"}>History</Link>
        {me.role === "ADMIN" && <Link href="/admin/claims#export" className="btn-secondary">Export CSV</Link>}
      </PageHeader>
      <Flash ok={sp.ok} error={sp.error} />
      <section className="card">
        {claims.length === 0 ? <Empty>{tab === "pending" ? "No claims waiting. 🎉" : "No decisions yet."}</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Employee</th><th>Claim</th><th>Expense date</th><th className="text-right">Amount</th><th /></tr></thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={c.user.name} image={c.user.image} size={28} />
                        <div><p className="font-medium">{c.user.name}</p><p className="text-xs text-slate-500">{c.user.department?.name ?? c.user.email}</p></div>
                      </div>
                    </td>
                    <td>
                      <p className="font-medium">{c.category.name}</p>
                      <p className="text-xs text-slate-500">{c.description}</p>
                      {c.receiptPath && <a className="text-xs text-brand-600 hover:underline" href={`/api/receipts/${c.id}`} target="_blank">View receipt</a>}
                      <p className="text-xs text-slate-400">Submitted {fmtDateTime(c.createdAt)}</p>
                    </td>
                    <td className="whitespace-nowrap">{fmtDay(c.expenseDate)}</td>
                    <td className="text-right font-medium tabular-nums">{fmtMoney(c.amount, c.currency)}</td>
                    <td className="text-right">
                      {c.status === "PENDING" ? <DecisionForm id={c.id} approve={approveClaim} reject={rejectClaim} returnTo={returnTo} /> : (
                        <div className="text-left">
                          <StatusBadge status={c.status} />
                          {c.approver && <p className="mt-1 text-xs text-slate-500">by {c.approver.name}</p>}
                          {c.decisionNote && <p className="text-xs text-slate-500">“{c.decisionNote}”</p>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
