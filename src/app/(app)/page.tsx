import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, approvableOwnersWhere } from "@/lib/session";
import { getBalances } from "@/lib/leave";
import { fmtDay, todayUTC } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { Avatar, Empty, Flash, StatusBadge, type SP } from "@/components/ui";

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = todayUTC();
  const in14 = new Date(today.getTime() + 14 * 86400000);
  const isApprover = me.role !== "EMPLOYEE";
  const owner = isApprover ? await approvableOwnersWhere(me) : null;

  const [balances, myPending, myUpcoming, outToday, holidays, pendingLeave, pendingClaims] = await Promise.all([
    getBalances(me.id, today.getUTCFullYear()),
    Promise.all([
      db.leaveRequest.count({ where: { userId: me.id, status: "PENDING" } }),
      db.claim.aggregate({ where: { userId: me.id, status: "PENDING" }, _count: true, _sum: { amount: true } }),
    ]),
    db.leaveRequest.findMany({
      where: { userId: me.id, status: { in: ["APPROVED", "PENDING"] }, endDate: { gte: today } },
      include: { leaveType: true }, orderBy: { startDate: "asc" }, take: 5,
    }),
    db.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: today }, endDate: { gte: today }, user: { status: "ACTIVE" } },
      include: { user: { include: { department: true } } }, orderBy: { user: { name: "asc" } },
    }),
    db.holiday.findMany({ where: { date: { gte: today, lte: new Date(today.getTime() + 60 * 86400000) } }, orderBy: { date: "asc" }, take: 4 }),
    owner ? db.leaveRequest.count({ where: { status: "PENDING", user: owner } }) : 0,
    owner ? db.claim.count({ where: { status: "PENDING", user: owner } }) : 0,
  ]);
  const comingUp = await db.leaveRequest.findMany({
    where: { status: "APPROVED", startDate: { gt: today, lte: in14 }, user: { status: "ACTIVE" } },
    include: { user: true }, orderBy: { startDate: "asc" }, take: 8,
  });
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Kuala_Lumpur" }));
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <div className="mb-6">
        <h1 className="h1">{greet}, {me.name.split(" ")[0]}</h1>
        <p className="muted mt-1">{fmtDay(today)}</p>
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      {isApprover && (pendingLeave > 0 || pendingClaims > 0) && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 px-5 py-4">
          <p className="flex-1 text-sm text-brand-700">
            <strong>Waiting for your approval:</strong> {pendingLeave} leave request{pendingLeave === 1 ? "" : "s"}, {pendingClaims} claim{pendingClaims === 1 ? "" : "s"}
          </p>
          {pendingLeave > 0 && <Link href="/approvals/leave" className="btn-primary">Review leave</Link>}
          {pendingClaims > 0 && <Link href="/approvals/claims" className="btn-secondary">Review claims</Link>}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {balances.filter((b) => b.paid).slice(0, 2).map((b) => (
          <Link key={b.leaveTypeId} href="/leave" className="card !p-4 hover:border-brand-200">
            <p className="muted">{b.name}</p>
            <p className="mt-1 text-2xl font-semibold">{b.available} <span className="text-sm font-normal text-slate-500">days left</span></p>
          </Link>
        ))}
        <Link href="/leave" className="card !p-4 hover:border-brand-200">
          <p className="muted">My pending leave</p>
          <p className="mt-1 text-2xl font-semibold">{myPending[0]}</p>
        </Link>
        <Link href="/claims" className="card !p-4 hover:border-brand-200">
          <p className="muted">My pending claims</p>
          <p className="mt-1 text-2xl font-semibold">{fmtMoney(myPending[1]._sum.amount)}</p>
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/leave" className="btn-primary">Apply for leave</Link>
        <Link href="/claims" className="btn-secondary">Submit a claim</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card">
          <h2 className="h2 mb-3">Out today</h2>
          {outToday.length === 0 ? <p className="muted">Everyone&apos;s in.</p> : (
            <ul className="space-y-2.5">
              {outToday.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <Avatar name={r.user.name} image={r.user.image} size={28} />
                  <div className="text-sm"><p className="font-medium">{r.user.name}</p><p className="text-xs text-slate-500">{r.user.department?.name ?? ""}{r.halfDay !== "NONE" ? ` · ${r.halfDay} only` : ""}</p></div>
                </li>
              ))}
            </ul>
          )}
          {comingUp.length > 0 && (
            <>
              <h3 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Next 2 weeks</h3>
              <ul className="space-y-1 text-sm">
                {comingUp.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2"><span>{r.user.name}</span><span className="text-slate-500">{fmtDay(r.startDate)}{r.endDate > r.startDate ? ` – ${fmtDay(r.endDate)}` : ""}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card">
          <h2 className="h2 mb-3">My upcoming leave</h2>
          {myUpcoming.length === 0 ? <Empty>Nothing planned.</Empty> : (
            <ul className="space-y-3">
              {myUpcoming.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium">{r.leaveType.name}</p>
                    <p className="text-xs text-slate-500">{fmtDay(r.startDate)}{r.endDate > r.startDate ? ` – ${fmtDay(r.endDate)}` : ""} · {Number(r.days)} day(s)</p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="h2 mb-3">Upcoming holidays</h2>
          {holidays.length === 0 ? <p className="muted">None in the next 60 days.</p> : (
            <ul className="space-y-2 text-sm">
              {holidays.map((h) => (
                <li key={h.id} className="flex justify-between gap-2"><span>{h.name}</span><span className="text-slate-500">{fmtDay(h.date)}</span></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
