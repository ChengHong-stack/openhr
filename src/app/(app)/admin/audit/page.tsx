import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { fmtDateTime } from "@/lib/dates";
import { PageHeader, type SP } from "@/components/ui";

export const metadata = { title: "Audit log" };
const PAGE = 50;

export default async function Audit({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim();
  const where = q ? { OR: [{ action: { contains: q } }, { actor: { name: { contains: q, mode: "insensitive" as const } } }] } : {};
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({ where, include: { actor: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.auditLog.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Audit log" subtitle={`${total} events`}>
        <form><input name="q" defaultValue={q} className="input" placeholder="Filter: leave.approved, name…" /></form>
      </PageHeader>
      <section className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(l.createdAt)}</td>
                <td>{l.actor?.name ?? "System"}</td>
                <td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{l.action}</code></td>
                <td className="max-w-md truncate text-xs text-slate-500" title={JSON.stringify(l.meta)}>{l.meta ? JSON.stringify(l.meta) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex justify-between text-sm">
          {page > 1 ? <Link className="btn-secondary" href={`?page=${page - 1}&q=${encodeURIComponent(q)}`}>← Newer</Link> : <span />}
          {page * PAGE < total && <Link className="btn-secondary" href={`?page=${page + 1}&q=${encodeURIComponent(q)}`}>Older →</Link>}
        </div>
      </section>
    </>
  );
}
