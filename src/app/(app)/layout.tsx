import { requireUser, approvableOwnersWhere } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { Nav, type NavItem } from "@/components/nav";
import { Avatar, RoleBadge } from "@/components/ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const isApprover = me.role !== "EMPLOYEE";

  let pendingLeave = 0, pendingClaims = 0;
  if (isApprover) {
    const [leaveOwner, claimOwner] = await Promise.all([approvableOwnersWhere(me, "leave"), approvableOwnersWhere(me, "claim")]);
    [pendingLeave, pendingClaims] = await Promise.all([
      db.leaveRequest.count({ where: { status: "PENDING", user: leaveOwner } }),
      // Medical claims filed with leave are decided on the leave approvals page.
      db.claim.count({ where: { status: "PENDING", leaveRequestId: null, user: claimOwner } }),
    ]);
  }

  const items: NavItem[] = [
    { href: "/", label: "Dashboard" },
    { href: "/leave", label: "My leave" },
    { href: "/claims", label: "My claims" },
    { href: "/calendar", label: "Team calendar" },
    { href: "/directory", label: "Directory" },
  ];
  if (isApprover) {
    items.push(
      { href: "/approvals/leave", label: "Leave approvals", badge: pendingLeave, section: "Approvals" },
      { href: "/approvals/claims", label: "Claim approvals", badge: pendingClaims, section: "Approvals" },
    );
  }
  if (me.role === "ADMIN") {
    items.push(
      { href: "/admin/employees", label: "Employees", section: "Admin" },
      { href: "/admin/leave", label: "Leave setup", section: "Admin" },
      { href: "/admin/claims", label: "Claims setup", section: "Admin" },
      { href: "/admin/audit", label: "Audit log", section: "Admin" },
    );
  }

  return (
    <div className="md:flex">
      <aside className="border-b border-slate-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
            {config.appName.slice(0, 1)}
          </span>
          <span className="font-semibold text-slate-900">{config.appName}</span>
        </div>
        <div className="px-2 pb-2 md:flex-1 md:overflow-y-auto">
          <Nav items={items} />
        </div>
        <div className="hidden border-t border-slate-200 p-3 md:block">
          <div className="flex items-center gap-2">
            <Avatar name={me.name} image={me.image} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{me.name}</p>
              <RoleBadge role={me.role} />
            </div>
          </div>
          <form className="mt-3" action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="btn-secondary w-full">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
        <form className="mt-10 md:hidden" action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button className="btn-secondary w-full">Sign out ({me.email})</button>
        </form>
      </main>
    </div>
  );
}
