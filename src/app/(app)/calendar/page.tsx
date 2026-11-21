import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, canApprove } from "@/lib/session";
import { eachDay, isoDow, todayUTC, ymd } from "@/lib/dates";
import { config } from "@/lib/config";
import { PageHeader, type SP } from "@/components/ui";

export const metadata = { title: "Team calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = todayUTC();
  const [y, m] = (sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : ymd(today).slice(0, 7)).split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const gridStart = new Date(first.getTime() - (isoDow(first) - 1) * 86400000);
  const gridEnd = new Date(last.getTime() + (7 - isoDow(last)) * 86400000);
  const prev = ymd(new Date(Date.UTC(y, m - 2, 1))).slice(0, 7);
  const next = ymd(new Date(Date.UTC(y, m, 1))).slice(0, 7);
  const dept = sp.dept || "";

  const [departments, requests, holidays] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.leaveRequest.findMany({
      where: {
        status: { in: ["APPROVED", "PENDING"] },
        startDate: { lte: gridEnd },
        endDate: { gte: gridStart },
        user: { status: "ACTIVE", ...(dept ? { departmentId: dept } : {}) },
      },
      include: { user: true, leaveType: true },
      orderBy: { user: { name: "asc" } },
    }),
    db.holiday.findMany({ where: { date: { gte: gridStart, lte: gridEnd } } }),
  ]);
  const hol = new Map(holidays.map((h) => [ymd(h.date), h.name]));
  // Leave type is only shown to the owner and their approvers (medical leave etc. is private).
  const visibleType = (r: (typeof requests)[number]) => r.userId === me.id || canApprove(me, r.user);

  const days = eachDay(gridStart, gridEnd);
  const monthLabel = first.toLocaleDateString("en-MY", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageHeader title="Team calendar" subtitle={monthLabel}>
        <form className="flex gap-2">
          <input type="hidden" name="m" value={`${y}-${String(m).padStart(2, "0")}`} />
          <select name="dept" defaultValue={dept} className="input !w-auto">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button className="btn-secondary">Filter</button>
        </form>
        <Link className="btn-secondary" href={`/calendar?m=${prev}&dept=${dept}`}>←</Link>
        <Link className="btn-secondary" href={`/calendar?dept=${dept}`}>Today</Link>
        <Link className="btn-secondary" href={`/calendar?m=${next}&dept=${dept}`}>→</Link>
      </PageHeader>

      <div className="card overflow-x-auto !p-0">
        <div className="grid min-w-[760px] grid-cols-7 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
        </div>
        <div className="grid min-w-[760px] grid-cols-7">
          {days.map((d) => {
            const key = ymd(d);
            const inMonth = d.getUTCMonth() === m - 1;
            const off = !config.workingDays.includes(isoDow(d));
            const people = requests.filter((r) => r.startDate <= d && r.endDate >= d);
            return (
              <div key={key} className={`min-h-28 border-b border-r border-slate-100 p-1.5 ${!inMonth ? "bg-slate-50/60 text-slate-400" : off ? "bg-slate-50" : ""}`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${key === ymd(today) ? "bg-brand-600 font-semibold text-white" : ""}`}>{d.getUTCDate()}</span>
                </div>
                {hol.has(key) && <p className="mb-1 truncate rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800" title={hol.get(key)}>{hol.get(key)}</p>}
                {!off && people.map((r) => (
                  <p key={r.id}
                    title={`${r.user.name}${visibleType(r) ? " · " + r.leaveType.name : ""}${r.status === "PENDING" ? " (pending)" : ""}`}
                    className={`mb-0.5 truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-white ${r.status === "PENDING" ? "opacity-50" : ""}`}
                    style={{ background: visibleType(r) ? r.leaveType.color : "#64748b" }}>
                    {r.user.name.split(" ")[0]}{r.halfDay !== "NONE" ? ` (${r.halfDay})` : ""}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <p className="muted mt-3">Faded entries are pending approval. Leave types are visible only to you and your approvers.</p>
    </>
  );
}
