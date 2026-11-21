import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { fmtDay, todayUTC } from "@/lib/dates";
import { Flash, PageHeader, type SP } from "@/components/ui";
import { saveLeaveType, addHolidays, deleteHoliday, carryForward } from "../actions";

export const metadata = { title: "Leave setup" };

export default async function LeaveSetup({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const year = todayUTC().getUTCFullYear();
  const [types, holidays] = await Promise.all([
    db.leaveType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.holiday.findMany({ where: { date: { gte: new Date(Date.UTC(year, 0, 1)) } }, orderBy: { date: "asc" } }),
  ]);
  const TypeRow = ({ t }: { t?: (typeof types)[number] }) => (
    <form action={saveLeaveType} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12">
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="col-span-2 sm:col-span-3"><label className="label">Name</label><input name="name" defaultValue={t?.name} required className="input !py-1.5" /></div>
      <div className="sm:col-span-1"><label className="label">Code</label><input name="code" defaultValue={t?.code} required className="input !py-1.5 uppercase" /></div>
      <div className="sm:col-span-1"><label className="label">Days/yr</label><input name="defaultDays" type="number" step="0.5" min="0" defaultValue={t ? Number(t.defaultDays) : 0} className="input !py-1.5" /></div>
      <div className="sm:col-span-1"><label className="label">Max c/f</label><input name="carryForwardMax" type="number" step="0.5" min="0" defaultValue={t ? Number(t.carryForwardMax) : 0} className="input !py-1.5" /></div>
      <div className="sm:col-span-1"><label className="label">Colour</label><input name="color" type="color" defaultValue={t?.color ?? "#6366f1"} className="h-9 w-full rounded border border-slate-300" /></div>
      <div className="sm:col-span-1"><label className="label">Order</label><input name="sortOrder" type="number" defaultValue={t?.sortOrder ?? 0} className="input !py-1.5" /></div>
      <div className="col-span-2 flex flex-wrap gap-x-3 text-xs sm:col-span-3">
        <label className="flex items-center gap-1"><input type="checkbox" name="paid" defaultChecked={t?.paid ?? true} />Paid (uses balance)</label>
        <label className="flex items-center gap-1"><input type="checkbox" name="requiresReason" defaultChecked={t?.requiresReason ?? false} />Reason required</label>
        <label className="flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={t?.active ?? true} />Active</label>
      </div>
      <div className="col-span-2 sm:col-span-1"><button className={`${t ? "btn-secondary" : "btn-primary"} w-full !py-1.5`}>{t ? "Save" : "Add"}</button></div>
    </form>
  );

  return (
    <>
      <PageHeader title="Leave setup" subtitle="Leave types, public holidays and year-end carry forward" />
      <Flash ok={sp.ok} error={sp.error} />

      <section className="card mb-6">
        <h2 className="h2 mb-1">Leave types</h2>
        <p className="muted mb-4">“Days/yr” is the default entitlement; override per person on their employee page. Unpaid types don&apos;t check balance.</p>
        <div className="space-y-2">
          {types.map((t) => <TypeRow key={t.id} t={t} />)}
          <p className="label pt-3">New leave type</p>
          <TypeRow />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="h2 mb-3">Public holidays</h2>
          <ul className="mb-4 max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-1.5">
                <span><span className="inline-block w-28 text-slate-500">{fmtDay(h.date)}</span>{h.name}</span>
                <form action={deleteHoliday}><input type="hidden" name="id" value={h.id} /><button className="text-xs text-rose-600 hover:underline">Remove</button></form>
              </li>
            ))}
            {holidays.length === 0 && <li className="muted py-2">No holidays this year yet.</li>}
          </ul>
          <form action={addHolidays} className="space-y-2">
            <label className="label">Add holidays — one per line: YYYY-MM-DD, Name</label>
            <textarea name="lines" rows={4} className="input font-mono text-xs" placeholder={"2027-01-01, New Year's Day\n2027-02-06, Chinese New Year"} />
            <button className="btn-secondary">Save holidays</button>
          </form>
        </section>

        <section className="card">
          <h2 className="h2 mb-1">Year-end carry forward</h2>
          <p className="muted mb-4">
            Moves each person&apos;s unused balance (up to each type&apos;s “Max c/f”) into next year. Safe to re-run — it overwrites the carried amount, not adds to it.
          </p>
          <form action={carryForward} className="flex gap-2">
            <select name="year" defaultValue={year} className="input !w-auto">
              {[year - 1, year].map((y) => <option key={y} value={y}>{y} → {y + 1}</option>)}
            </select>
            <button className="btn-primary">Run carry forward</button>
          </form>
        </section>
      </div>
    </>
  );
}
