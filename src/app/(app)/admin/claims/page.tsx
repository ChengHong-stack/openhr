import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { todayUTC, ymd } from "@/lib/dates";
import { config } from "@/lib/config";
import { Flash, PageHeader, type SP } from "@/components/ui";
import { saveClaimCategory } from "../actions";

export const metadata = { title: "Claims setup" };

export default async function ClaimsSetup({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const cats = await db.claimCategory.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { claims: true } } } });
  const t = todayUTC();
  const monthStart = ymd(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)));

  const Row = ({ c }: { c?: (typeof cats)[number] }) => (
    <form action={saveClaimCategory} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="col-span-2"><label className="label">Name</label><input name="name" defaultValue={c?.name} required className="input !py-1.5" /></div>
      <div className="sm:col-span-2"><label className="label">Limit per claim ({config.currency}, blank = none)</label><input name="limitPerClaim" type="number" step="0.01" min="0" defaultValue={c?.limitPerClaim ? Number(c.limitPerClaim) : ""} className="input !py-1.5" /></div>
      <label className="flex items-center gap-1 pb-2 text-xs"><input type="checkbox" name="active" defaultChecked={c?.active ?? true} />Active{c ? ` · ${c._count.claims} claims` : ""}</label>
      <button className={`${c ? "btn-secondary" : "btn-primary"} !py-1.5`}>{c ? "Save" : "Add"}</button>
    </form>
  );

  return (
    <>
      <PageHeader title="Claims setup" subtitle="Categories, limits and payroll export" />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="h2 mb-3">Categories</h2>
          <div className="space-y-2">
            {cats.map((c) => <Row key={c.id} c={c} />)}
            <p className="label pt-3">New category</p>
            <Row />
          </div>
        </section>
        <section id="export" className="card">
          <h2 className="h2 mb-1">Export for payroll</h2>
          <p className="muted mb-4">CSV of claims by expense date, ready to import into your payroll system.</p>
          <form action="/api/export/claims" method="get" className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">From</label><input type="date" name="from" defaultValue={monthStart} className="input" /></div>
              <div><label className="label">To</label><input type="date" name="to" defaultValue={ymd(t)} className="input" /></div>
            </div>
            <div><label className="label">Status</label>
              <select name="status" className="input" defaultValue="APPROVED">
                <option value="APPROVED">Approved only</option><option value="PENDING">Pending</option><option value="REJECTED">Rejected</option><option value="ALL">All</option>
              </select>
            </div>
            <button className="btn-primary w-full">Download CSV</button>
          </form>
        </section>
      </div>
    </>
  );
}
