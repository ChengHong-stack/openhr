import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { fmtDateTime } from "@/lib/dates";
import { Avatar, Empty, Flash, PageHeader, RoleBadge, type SP } from "@/components/ui";
import { createEmployee, importEmployees, saveDepartment, deleteDepartment } from "../actions";

export const metadata = { title: "Employees" };

export default async function Employees({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
  const q = (sp.q ?? "").trim();
  const [users, departments, managers] = await Promise.all([
    db.user.findMany({
      where: { status, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { employeeNo: { contains: q, mode: "insensitive" } }] } : {}) },
      include: { department: true, manager: true, _count: { select: { reports: true } } },
      orderBy: { name: "asc" },
    }),
    db.department.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } }),
    db.user.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader title="Employees" subtitle="Only people listed here (or from allowed domains) can sign in">
        <form className="flex gap-2">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} className="input" placeholder="Search…" />
        </form>
        <Link href="/admin/employees" className={status === "ACTIVE" ? "btn-primary" : "btn-secondary"}>Active</Link>
        <Link href="/admin/employees?status=INACTIVE" className={status === "INACTIVE" ? "btn-primary" : "btn-secondary"}>Inactive</Link>
      </PageHeader>
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="card xl:col-span-2">
          {users.length === 0 ? <Empty>No {status.toLowerCase()} employees{q ? ` matching “${q}”` : ""}.</Empty> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Manager</th><th>Last sign-in</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <Link href={`/admin/employees/${u.id}`} className="flex items-center gap-2 hover:underline">
                          <Avatar name={u.name} image={u.image} size={28} />
                          <span><span className="font-medium">{u.name}</span><span className="block text-xs text-slate-500">{u.email}</span></span>
                        </Link>
                      </td>
                      <td><RoleBadge role={u.role} />{u._count.reports > 0 && <p className="mt-1 text-xs text-slate-500">{u._count.reports} report(s)</p>}</td>
                      <td>{u.department?.name ?? "—"}<p className="text-xs text-slate-500">{u.jobTitle}</p></td>
                      <td>{u.manager?.name ?? "—"}</td>
                      <td className="text-xs text-slate-500">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="card">
            <h2 className="h2 mb-3">Add employee</h2>
            <form action={createEmployee} className="space-y-3">
              <div><label className="label">Work email (Google account)</label><input name="email" type="email" required className="input" /></div>
              <div><label className="label">Full name</label><input name="name" required className="input" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Role</label>
                  <select name="role" className="input" defaultValue="EMPLOYEE"><option value="EMPLOYEE">Employee</option><option value="MANAGER">Manager</option><option value="ADMIN">Admin</option></select>
                </div>
                <div><label className="label">Department</label>
                  <select name="departmentId" className="input"><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
                </div>
              </div>
              <div><label className="label">Manager (approves their leave & claims)</label>
                <select name="managerId" className="input"><option value="">— None (admins approve) —</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Job title</label><input name="jobTitle" className="input" /></div>
                <div><label className="label">Join date</label><input name="joinDate" type="date" className="input" /></div>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sendInvite" defaultChecked /> Email them an invite</label>
              <button className="btn-primary w-full">Add employee</button>
            </form>
          </section>

          <section className="card">
            <h2 className="h2 mb-1">Import CSV</h2>
            <p className="muted mb-3 text-xs">Columns: <code>email, name, department, job_title, manager_email, role, employee_no, join_date, phone</code>. Existing emails are updated.</p>
            <form action={importEmployees} className="space-y-3">
              <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700" />
              <button className="btn-secondary w-full">Import</button>
            </form>
          </section>

          <section className="card">
            <h2 className="h2 mb-3">Departments</h2>
            <ul className="mb-3 divide-y divide-slate-100 text-sm">
              {departments.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-1.5">
                  <span>{d.name} <span className="text-slate-400">({d._count.users})</span></span>
                  {d._count.users === 0 && (
                    <form action={deleteDepartment}><input type="hidden" name="id" value={d.id} /><button className="text-xs text-rose-600 hover:underline">Remove</button></form>
                  )}
                </li>
              ))}
            </ul>
            <form action={saveDepartment} className="flex gap-2">
              <input name="name" required className="input" placeholder="New department" />
              <button className="btn-secondary">Add</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
