import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { parseDay, ymd } from "@/lib/dates";
import { audit } from "@/lib/audit";

const esc = (v: unknown) => {
  const s = String(v ?? "");
  // Neutralise spreadsheet formula injection and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me || me.role !== "ADMIN") return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const from = parseDay(url.searchParams.get("from") ?? "");
  const to = parseDay(url.searchParams.get("to") ?? "");
  const status = url.searchParams.get("status") || "APPROVED";

  const claims = await db.claim.findMany({
    where: {
      ...(status === "ALL" ? {} : { status: status as "APPROVED" }),
      ...(from || to ? { expenseDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    include: { user: { include: { department: true } }, category: true, approver: true },
    orderBy: [{ user: { name: "asc" } }, { expenseDate: "asc" }],
  });

  const header = ["Employee No", "Employee", "Email", "Department", "Category", "Expense Date", "Description", "Currency", "Amount", "Status", "Approved By", "Decided At"];
  const rows = claims.map((c) => [
    c.user.employeeNo, c.user.name, c.user.email, c.user.department?.name, c.category.name, ymd(c.expenseDate),
    c.description, c.currency, Number(c.amount).toFixed(2), c.status, c.approver?.name, c.decidedAt?.toISOString(),
  ]);
  const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  await audit(me.id, "claims.exported", "Claim", null, { count: claims.length, status, from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="claims-${status.toLowerCase()}-${ymd(new Date())}.csv"`,
    },
  });
}
