import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { getBalances } from "@/lib/leave";
import { fmtDay, todayUTC, ymd } from "@/lib/dates";
import { Avatar, Flash, PageHeader, StatusBadge, type SP } from "@/components/ui";
import { updateEmployee, saveBalance } from "../../actions";

export default async function EmployeeDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const year = Number(sp.year) || todayUTC().getUTCFullYear();
  const u = await db.user.findUnique({
    where: { id },
    include: { reports: { orderBy: { name: "asc" } }, backupReports: { orderBy: { name: "asc" } } },
  });
  if (!u) notFound();
  const [departments, managers, balances, recent] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ where: { status: "ACTIVE", id: { not: id } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getBalances(id, year),
    db.leaveRequest.findMany({ where: { userId: id }, include: { leaveType: true }, orderBy: { startDate: "desc" }, take: 10 }),
  ]);

  return (
    <>
      <Link href="/admin/employees" className="mb-3 inline-block text-sm text-brand-600 hover:underline">← Employees</Link>
      <PageHeader title={u.name} subtitle={u.email}>
        <Avatar name={u.name} image={u.image} size={44} />
      </PageHeader>
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="h2 mb-4">Profile & access</h2>
          <form action={updateEmployee} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={u.id} />
            <div className="sm:col-span-2"><label className="label">Full name</label><input name="name" defaultValue={u.name} required className="input" /></div>
            <div className="sm:col-span-2"><label className="label">Email (Google account)</label><input name="email" type="email" defaultValue={u.email} required className="input" /></div>
            <div><label className="label">Role</label>
              <select name="role" defaultValue={u.role} className="input"><option value="EMPLOYEE">Employee</option><option value="MANAGER">Manager</option><option value="ADMIN">Admin</option></select>
            </div>
            <div><label className="label">Status</label>
              <select name="status" defaultValue={u.status} className="input"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive (can&apos;t sign in)</option></select>
            </div>
            <div><label className="label">Department</label>
              <select name="departmentId" defaultValue={u.departmentId ?? ""} className="input"><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </div>
            <div><label className="label">Manager</label>
              <select name="managerId" defaultValue={u.managerId ?? ""} className="input"><option value="">— None (admins approve) —</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            </div>
            <div className="sm:col-span-2"><label className="label">Backup approver (can also approve leave, e.g. when the manager is away)</label>
              <select name="backupManagerId" defaultValue={u.backupManagerId ?? ""} className="input"><option value="">— None —</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            </div>
            <div><label className="label">Job title</label><input name="jobTitle" defaultValue={u.jobTitle ?? ""} className="input" /></div>
            <div><label className="label">Employee no.</label><input name="employeeNo" defaultValue={u.employeeNo ?? ""} className="input" /></div>
            <div><label className="label">Join date</label><input name="joinDate" type="date" defaultValue={u.joinDate ? ymd(u.joinDate) : ""} className="input" /></div>
            <div><label className="label">Phone</label><input name="phone" defaultValue={u.phone ?? ""} className="input" /></div>
            <div className="sm:col-span-2"><button className="btn-primary">Save changes</button></div>
          </form>
          {u.reports.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4 text-sm">
              <p className="label">Direct reports</p>
              <p>{u.reports.map((r) => r.name).join(", ")}</p>
            </div>
          )}
          {u.backupReports.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4 text-sm">
              <p className="label">Backup approver for</p>
              <p>{u.backupReports.map((r) => r.name).join(", ")}</p>
            </div>
          )}
        </section>

        <section className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="h2">Leave balances {year}</h2>
            <div className="flex gap-1">
              <Link className="btn-secondary !px-2 !py-1" href={`?year=${year - 1}`}>←</Link>
              <Link className="btn-secondary !px-2 !py-1" href={`?year=${year + 1}`}>→</Link>
            </div>
          </div>
          <div className="space-y-3">
            {balances.map((b) => (
              <form key={b.leaveTypeId} action={saveBalance} className="rounded-lg border border-slate-200 p-3">
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="leaveTypeId" value={b.leaveTypeId} />
                <input type="hidden" name="year" value={year} />
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium"><span className="h-2 w-2 rounded-full" style={{ background: b.color }} />{b.name}</span>
                  <span className="text-slate-500">{b.used} used · {b.pending} pending · <strong className="text-slate-800">{b.available} left</strong>{!b.hasRecord && " · default"}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div><label className="label">Entitled</label><input name="entitled" type="number" step="0.5" defaultValue={b.entitled} className="input !py-1.5" /></div>
                  <div><label className="label">Carried</label><input name="carriedForward" type="number" step="0.5" defaultValue={b.carriedForward} className="input !py-1.5" /></div>
                  <div><label className="label">Adjust ±</label><input name="adjustment" type="number" step="0.5" defaultValue={b.adjustment} className="input !py-1.5" /></div>
                  <div className="flex items-end"><button className="btn-secondary w-full !py-1.5">Save</button></div>
                </div>
              </form>
            ))}
          </div>
          <h3 className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent leave</h3>
          <ul className="space-y-1.5 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span>{r.leaveType.name} · {fmtDay(r.startDate)}{r.endDate > r.startDate ? ` – ${fmtDay(r.endDate)}` : ""} ({Number(r.days)}d)</span>
                <StatusBadge status={r.status} />
              </li>
            ))}
            {recent.length === 0 && <li className="muted">None.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
