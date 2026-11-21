import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { fmtDay, ymd, todayUTC } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { config } from "@/lib/config";
import { Empty, Flash, PageHeader, StatusBadge, type SP } from "@/components/ui";
import { submitClaim, cancelClaim } from "./actions";

export const metadata = { title: "My claims" };

export default async function ClaimsPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const sp = await searchParams;
  const [cats, claims] = await Promise.all([
    db.claimCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.claim.findMany({ where: { userId: me.id }, include: { category: true, approver: true }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const sum = (s: string) => claims.filter((c) => c.status === s).reduce((a, c) => a + Number(c.amount), 0);

  return (
    <>
      <PageHeader title="My claims" subtitle="Submit expenses with a receipt for approval" />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="card !p-4"><p className="muted">Pending</p><p className="mt-1 text-2xl font-semibold">{fmtMoney(sum("PENDING"))}</p></div>
        <div className="card !p-4"><p className="muted">Approved</p><p className="mt-1 text-2xl font-semibold text-emerald-700">{fmtMoney(sum("APPROVED"))}</p></div>
        <div className="card !p-4"><p className="muted">Rejected</p><p className="mt-1 text-2xl font-semibold text-slate-500">{fmtMoney(sum("REJECTED"))}</p></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-2">
          <h2 className="h2 mb-4">New claim</h2>
          {cats.length === 0 ? <Empty>No claim categories set up yet.</Empty> : (
            <form action={submitClaim} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="categoryId">Category</label>
                <select id="categoryId" name="categoryId" className="input" required>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.limitPerClaim ? ` (max ${fmtMoney(c.limitPerClaim)})` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="amount">Amount ({config.currency})</label>
                <input id="amount" name="amount" type="number" step="0.01" min="0.01" required className="input" inputMode="decimal" />
              </div>
              <div>
                <label className="label" htmlFor="expenseDate">Expense date</label>
                <input id="expenseDate" name="expenseDate" type="date" required className="input" max={ymd(todayUTC())} defaultValue={ymd(todayUTC())} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="description">Description</label>
                <input id="description" name="description" required minLength={3} maxLength={500} className="input" placeholder="e.g. Grab to client meeting, KLCC" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="receipt">Receipt (JPG, PNG, PDF · max 8 MB)</label>
                <input id="receipt" name="receipt" type="file" required accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" capture="environment"
                  className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700" />
              </div>
              <div className="sm:col-span-2"><button className="btn-primary">Submit claim</button></div>
            </form>
          )}
        </section>

        <section className="card lg:col-span-3">
          <h2 className="h2 mb-3">History</h2>
          {claims.length === 0 ? <Empty>No claims yet.</Empty> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Claim</th><th>Date</th><th className="text-right">Amount</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {claims.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <p className="font-medium">{c.category.name}</p>
                        <p className="text-xs text-slate-500">{c.description}</p>
                        {c.receiptPath && <a className="text-xs text-brand-600 hover:underline" href={`/api/receipts/${c.id}`} target="_blank">View receipt</a>}
                      </td>
                      <td className="whitespace-nowrap">{fmtDay(c.expenseDate)}</td>
                      <td className="text-right font-medium tabular-nums">{fmtMoney(c.amount, c.currency)}</td>
                      <td>
                        <StatusBadge status={c.status} />
                        {c.approver && c.status !== "PENDING" && <p className="mt-1 text-xs text-slate-500">by {c.approver.name}</p>}
                        {c.decisionNote && <p className="text-xs text-slate-500">“{c.decisionNote}”</p>}
                      </td>
                      <td className="text-right">
                        {c.status === "PENDING" && (
                          <form action={cancelClaim}>
                            <input type="hidden" name="id" value={c.id} />
                            <button className="text-xs font-medium text-rose-600 hover:underline">Withdraw</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
