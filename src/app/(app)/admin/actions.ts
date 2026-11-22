"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { parseDay } from "@/lib/dates";
import { runCarryForward } from "@/lib/leave";
import { parseCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/mail";
import { config } from "@/lib/config";
import { back } from "@/lib/flash";

const done = (path: string, ok: string): never => {
  revalidatePath("/", "layout");
  back(path, { ok });
};
const opt = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

/* ───────────── Employees ───────────── */

const EmployeeSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  name: z.string().trim().min(1, "Name is required.").max(120),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

/** Would setting `managerId` as the manager of `userId` create a reporting loop? */
async function createsCycle(userId: string, managerId: string) {
  let cur: string | null = managerId;
  for (let i = 0; cur && i < 50; i++) {
    if (cur === userId) return true;
    const u: { managerId: string | null } | null = await db.user.findUnique({ where: { id: cur }, select: { managerId: true } });
    cur = u?.managerId ?? null;
  }
  return false;
}

async function ensureManagerRole(managerId: string | null) {
  if (!managerId) return;
  await db.user.updateMany({ where: { id: managerId, role: "EMPLOYEE" }, data: { role: "MANAGER" } });
}

function employeeFields(fd: FormData) {
  const joinRaw = opt(fd.get("joinDate"));
  return {
    jobTitle: opt(fd.get("jobTitle")),
    phone: opt(fd.get("phone")),
    employeeNo: opt(fd.get("employeeNo")),
    departmentId: opt(fd.get("departmentId")),
    managerId: opt(fd.get("managerId")),
    backupManagerId: opt(fd.get("backupManagerId")),
    joinDate: joinRaw ? parseDay(joinRaw) : null,
  };
}

/** Backup approver must be someone other than the person and their main manager. */
function backupError(userId: string | null, extra: { managerId: string | null; backupManagerId: string | null }) {
  if (!extra.backupManagerId) return null;
  if (extra.backupManagerId === userId) return "Someone can't be their own backup approver.";
  if (extra.backupManagerId === extra.managerId) return "Pick a different person from the manager as backup approver.";
  return null;
}

export async function createEmployee(fd: FormData) {
  const me = await requireAdmin();
  const p = EmployeeSchema.safeParse({ email: fd.get("email"), name: fd.get("name"), role: fd.get("role") || "EMPLOYEE" });
  if (!p.success) back("/admin/employees", { error: p.error.issues[0].message });
  if (await db.user.findUnique({ where: { email: p.data.email } })) back("/admin/employees", { error: "That email already exists." });
  const extra = employeeFields(fd);
  if (extra.employeeNo && (await db.user.findUnique({ where: { employeeNo: extra.employeeNo } })))
    back("/admin/employees", { error: "That employee number is already used." });
  const bErr = backupError(null, extra);
  if (bErr) back("/admin/employees", { error: bErr });
  const u = await db.user.create({ data: { ...p.data, ...extra } });
  await ensureManagerRole(extra.managerId);
  await ensureManagerRole(extra.backupManagerId);
  await audit(me.id, "user.created", "User", u.id, { email: u.email, role: u.role });
  if (fd.get("sendInvite") === "on") {
    await notify(u.email, "You've been invited", [
      `Hi ${u.name}, ${me.name} added you to ${config.appName}.`,
      "Sign in with your Google account using this email address.",
    ], "/login");
  }
  done("/admin/employees", `${u.name} added.`);
}

export async function updateEmployee(fd: FormData) {
  const me = await requireAdmin();
  const id = String(fd.get("id"));
  const path = `/admin/employees/${id}`;
  const p = EmployeeSchema.safeParse({ email: fd.get("email"), name: fd.get("name"), role: fd.get("role"), status: fd.get("status") });
  if (!p.success) back(path, { error: p.error.issues[0].message });
  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) back("/admin/employees", { error: "Employee not found." });
  const extra = employeeFields(fd);

  if (extra.managerId === id) back(path, { error: "Someone can't be their own manager." });
  const bErr = backupError(id, extra);
  if (bErr) back(path, { error: bErr });
  if (extra.managerId && (await createsCycle(id, extra.managerId))) back(path, { error: "That manager reports (directly or indirectly) to this person." });
  const clash = await db.user.findFirst({ where: { id: { not: id }, OR: [{ email: p.data.email }, ...(extra.employeeNo ? [{ employeeNo: extra.employeeNo }] : [])] } });
  if (clash) back(path, { error: "Email or employee number already used by someone else." });

  // Never remove the last active admin.
  const losingAdmin = existing.role === "ADMIN" && existing.status === "ACTIVE" && (p.data.role !== "ADMIN" || p.data.status !== "ACTIVE");
  if (losingAdmin && (await db.user.count({ where: { role: "ADMIN", status: "ACTIVE" } })) <= 1)
    back(path, { error: "You can't remove the last active admin." });
  // Demoting a manager who still has reports would orphan their approvals.
  if (existing.role !== "EMPLOYEE" && p.data.role === "EMPLOYEE" && (await db.user.count({ where: { OR: [{ managerId: id }, { backupManagerId: id }] } })) > 0)
    back(path, { error: "Reassign the people this person manages or backs up before making them an Employee." });

  await db.user.update({ where: { id }, data: { ...p.data, ...extra } });
  await ensureManagerRole(extra.managerId);
  await ensureManagerRole(extra.backupManagerId);
  await audit(me.id, "user.updated", "User", id, { email: p.data.email, role: p.data.role, status: p.data.status });
  done(path, "Saved.");
}

const CSV_HEADERS = ["email", "name", "department", "job_title", "manager_email", "role", "employee_no", "join_date", "phone"];

export async function importEmployees(fd: FormData) {
  const me = await requireAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back("/admin/employees", { error: "Choose a CSV file." });
  if (file.size > 2 * 1024 * 1024) back("/admin/employees", { error: "CSV must be under 2 MB." });
  const rows = parseCsv(await file.text());
  if (rows.length < 2) back("/admin/employees", { error: "CSV has no data rows." });
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (r: string[], k: string) => (header.indexOf(k) >= 0 ? (r[header.indexOf(k)] ?? "").trim() : "");
  if (!header.includes("email") || !header.includes("name")) back("/admin/employees", { error: `CSV needs at least email and name columns. Supported: ${CSV_HEADERS.join(", ")}` });

  const errors: string[] = [];
  let created = 0, updated = 0;
  const pendingManagers: { email: string; managerEmail: string }[] = [];

  for (const [i, r] of rows.slice(1).entries()) {
    const line = i + 2;
    const email = col(r, "email").toLowerCase();
    const name = col(r, "name");
    if (!z.string().email().safeParse(email).success || !name) { errors.push(`Row ${line}: missing/invalid email or name`); continue; }
    const roleRaw = col(r, "role").toUpperCase();
    const role = (["ADMIN", "MANAGER", "EMPLOYEE"].includes(roleRaw) ? roleRaw : undefined) as "ADMIN" | "MANAGER" | "EMPLOYEE" | undefined;
    const deptName = col(r, "department");
    const dept = deptName ? await db.department.upsert({ where: { name: deptName }, create: { name: deptName }, update: {} }) : null;
    const joinDate = col(r, "join_date") ? parseDay(col(r, "join_date")) : null;
    if (col(r, "join_date") && !joinDate) errors.push(`Row ${line}: join_date must be YYYY-MM-DD (ignored)`);
    const data = {
      name,
      ...(role ? { role } : {}),
      ...(dept ? { departmentId: dept.id } : {}),
      ...(col(r, "job_title") ? { jobTitle: col(r, "job_title") } : {}),
      ...(col(r, "employee_no") ? { employeeNo: col(r, "employee_no") } : {}),
      ...(col(r, "phone") ? { phone: col(r, "phone") } : {}),
      ...(joinDate ? { joinDate } : {}),
    };
    try {
      const exists = await db.user.findUnique({ where: { email } });
      if (exists) { await db.user.update({ where: { email }, data }); updated++; }
      else { await db.user.create({ data: { email, ...data } }); created++; }
      const me2 = col(r, "manager_email").toLowerCase();
      if (me2) pendingManagers.push({ email, managerEmail: me2 });
    } catch (e) {
      errors.push(`Row ${line}: ${(e as { code?: string }).code === "P2002" ? "duplicate employee_no" : "could not save"}`);
    }
  }
  // Second pass so managers can appear later in the file.
  for (const pm of pendingManagers) {
    const [u, m] = await Promise.all([db.user.findUnique({ where: { email: pm.email } }), db.user.findUnique({ where: { email: pm.managerEmail } })]);
    if (!u || !m) { errors.push(`${pm.email}: manager ${pm.managerEmail} not found`); continue; }
    if (u.id === m.id || (await createsCycle(u.id, m.id))) { errors.push(`${pm.email}: manager would create a loop`); continue; }
    await db.user.update({ where: { id: u.id }, data: { managerId: m.id } });
    await ensureManagerRole(m.id);
  }
  await audit(me.id, "user.imported", "User", null, { created, updated, errors: errors.length });
  revalidatePath("/", "layout");
  back("/admin/employees", errors.length
    ? { error: `Imported ${created} new, ${updated} updated. ${errors.length} issue(s): ${errors.slice(0, 5).join("; ")}${errors.length > 5 ? "…" : ""}` }
    : { ok: `Imported ${created} new, ${updated} updated.` });
}

export async function saveDepartment(fd: FormData) {
  const me = await requireAdmin();
  const name = String(fd.get("name") ?? "").trim();
  if (!name) back("/admin/employees", { error: "Department name is required." });
  await db.department.upsert({ where: { name }, create: { name }, update: {} });
  await audit(me.id, "department.created", "Department", null, { name });
  done("/admin/employees", `Department “${name}” added.`);
}

export async function deleteDepartment(fd: FormData) {
  const me = await requireAdmin();
  const id = String(fd.get("id"));
  const n = await db.user.count({ where: { departmentId: id } });
  if (n > 0) back("/admin/employees", { error: `Move the ${n} people in this department first.` });
  await db.department.delete({ where: { id } });
  await audit(me.id, "department.deleted", "Department", id);
  done("/admin/employees", "Department removed.");
}

export async function saveBalance(fd: FormData) {
  const me = await requireAdmin();
  const userId = String(fd.get("userId"));
  const leaveTypeId = String(fd.get("leaveTypeId"));
  const year = Number(fd.get("year"));
  const path = `/admin/employees/${userId}?year=${year}`;
  const n = (k: string) => Number(fd.get(k) ?? 0);
  const entitled = n("entitled"), carriedForward = n("carriedForward"), adjustment = n("adjustment");
  if ([entitled, carriedForward, adjustment].some((x) => !Number.isFinite(x) || Math.abs(x) > 999 || Math.round(x * 2) !== x * 2))
    back(path, { error: "Use whole or half days (e.g. 14 or 7.5)." });
  if (entitled < 0 || carriedForward < 0) back(path, { error: "Entitlement and carry-forward can't be negative." });
  const note = opt(fd.get("note"));
  await db.leaveBalance.upsert({
    where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
    create: { userId, leaveTypeId, year, entitled, carriedForward, adjustment, note },
    update: { entitled, carriedForward, adjustment, note },
  });
  await audit(me.id, "leave.balance_set", "LeaveBalance", null, { userId, leaveTypeId, year, entitled, carriedForward, adjustment, note });
  done(path, "Balance updated.");
}

/* ───────────── Leave setup ───────────── */

const LeaveTypeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,12}$/, "Code: up to 12 letters/digits."),
  defaultDays: z.coerce.number().min(0).max(366),
  carryForwardMax: z.coerce.number().min(0).max(366),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
  sortOrder: z.coerce.number().int().default(0),
});

export async function saveLeaveType(fd: FormData) {
  const me = await requireAdmin();
  const id = opt(fd.get("id"));
  const p = LeaveTypeSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) back("/admin/leave", { error: p.error.issues[0].message });
  const data = { ...p.data, paid: fd.get("paid") === "on", requiresReason: fd.get("requiresReason") === "on", active: fd.get("active") === "on" };
  try {
    const t = id ? await db.leaveType.update({ where: { id }, data }) : await db.leaveType.create({ data });
    await audit(me.id, id ? "leave_type.updated" : "leave_type.created", "LeaveType", t.id, data);
  } catch {
    back("/admin/leave", { error: "Name or code already used." });
  }
  done("/admin/leave", `Leave type “${p.data.name}” saved.`);
}

export async function addHolidays(fd: FormData) {
  const me = await requireAdmin();
  const lines = String(fd.get("lines") ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let n = 0;
  const bad: string[] = [];
  for (const l of lines) {
    const m = l.match(/^(\d{4}-\d{2}-\d{2})\s*[,\t;]\s*(.+)$/);
    const d = m && parseDay(m[1]);
    if (!m || !d) { bad.push(l); continue; }
    await db.holiday.upsert({ where: { date: d }, create: { date: d, name: m[2].slice(0, 100) }, update: { name: m[2].slice(0, 100) } });
    n++;
  }
  await audit(me.id, "holiday.added", "Holiday", null, { count: n });
  revalidatePath("/", "layout");
  back("/admin/leave", bad.length ? { error: `Saved ${n}. Couldn't read: ${bad.slice(0, 3).join(" | ")}` } : { ok: `Saved ${n} holiday(s).` });
}

export async function deleteHoliday(fd: FormData) {
  const me = await requireAdmin();
  const id = String(fd.get("id"));
  await db.holiday.delete({ where: { id } }).catch(() => null);
  await audit(me.id, "holiday.deleted", "Holiday", id);
  done("/admin/leave", "Holiday removed.");
}

export async function carryForward(fd: FormData) {
  const me = await requireAdmin();
  const year = Number(fd.get("year"));
  if (!Number.isInteger(year) || year < 2000) back("/admin/leave", { error: "Pick a year." });
  const n = await runCarryForward(year);
  await audit(me.id, "leave.carry_forward", "LeaveBalance", null, { fromYear: year, records: n });
  done("/admin/leave", `Carried forward ${year} → ${year + 1} (${n} balance records).`);
}

/* ───────────── Claims setup ───────────── */

export async function saveClaimCategory(fd: FormData) {
  const me = await requireAdmin();
  const id = opt(fd.get("id"));
  const name = String(fd.get("name") ?? "").trim();
  const limitRaw = opt(fd.get("limitPerClaim"));
  const limit = limitRaw === null ? null : Number(limitRaw);
  if (!name) back("/admin/claims", { error: "Name is required." });
  if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) back("/admin/claims", { error: "Limit must be a positive amount or blank." });
  const data = { name, limitPerClaim: limit, active: fd.get("active") === "on" };
  try {
    const c = id ? await db.claimCategory.update({ where: { id }, data }) : await db.claimCategory.create({ data });
    await audit(me.id, id ? "claim_category.updated" : "claim_category.created", "ClaimCategory", c.id, { name, limit });
  } catch {
    back("/admin/claims", { error: "A category with that name already exists." });
  }
  done("/admin/claims", `Category “${name}” saved.`);
}
