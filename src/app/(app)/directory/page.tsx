import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Avatar, Empty, PageHeader, type SP } from "@/components/ui";

export const metadata = { title: "Directory" };

export default async function Directory({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const people = await db.user.findMany({
    where: {
      status: "ACTIVE",
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { jobTitle: { contains: q, mode: "insensitive" } }, { department: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: { department: true, manager: true },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeader title="Directory" subtitle={`${people.length} people`}>
        <form><input name="q" defaultValue={q} className="input" placeholder="Search name, role, department…" /></form>
      </PageHeader>
      {people.length === 0 ? <Empty>No one matches “{q}”.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <div key={p.id} className="card flex gap-3 !p-4">
              <Avatar name={p.name} image={p.image} size={44} />
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-slate-900">{p.name}</p>
                <p className="text-slate-600">{p.jobTitle ?? "—"}{p.department ? ` · ${p.department.name}` : ""}</p>
                <a href={`mailto:${p.email}`} className="block truncate text-brand-600 hover:underline">{p.email}</a>
                {p.phone && <a href={`tel:${p.phone}`} className="block text-slate-500">{p.phone}</a>}
                {p.manager && <p className="mt-1 text-xs text-slate-400">Reports to {p.manager.name}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
