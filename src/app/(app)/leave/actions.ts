"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, canApprove, canSelfApprove } from "@/lib/session";
import { parseDay, fmtDay, todayUTC } from "@/lib/dates";
import { countLeaveDays, getBalances } from "@/lib/leave";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/mail";
import { back } from "@/lib/flash";

const ApplySchema = z.object({
  leaveTypeId: z.string().min(1, "Choose a leave type."),
  startDate: z.string(),
  endDate: z.string().optional(),
  halfDay: z.enum(["NONE", "AM", "PM"]).default("NONE"),
  reason: z.string().max(1000).optional(),
});

export async function applyLeave(fd: FormData) {
  const me = await requireUser();
  const parsed = ApplySchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) back("/leave", { error: parsed.error.issues[0].message });
  const v = parsed.data;

  const start = parseDay(v.startDate);
  const end = parseDay(v.endDate || v.startDate);
  if (!start || !end) back("/leave", { error: "Enter valid dates." });
  if (end < start) back("/leave", { error: "End date can't be before start date." });
  if (v.halfDay !== "NONE" && start.getTime() !== end.getTime())
    back("/leave", { error: "Half-day leave must start and end on the same day." });
  if (start.getUTCFullYear() !== end.getUTCFullYear())
    back("/leave", { error: "Split leave that crosses into a new year into two requests." });

  const type = await db.leaveType.findFirst({ where: { id: v.leaveTypeId, active: true } });
  if (!type) back("/leave", { error: "That leave type isn't available." });
  const reason = v.reason?.trim() || null;
  if (type.requiresReason && !reason) back("/leave", { error: `${type.name} needs a reason.` });

  const days = await countLeaveDays(start, end, v.halfDay);
  if (days <= 0) back("/leave", { error: "Those dates fall on weekends or public holidays only." });

  const overlap = await db.leaveRequest.findFirst({
    where: { userId: me.id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } },
  });
  if (overlap && !(v.halfDay !== "NONE" && overlap.halfDay !== "NONE" && overlap.halfDay !== v.halfDay))
    back("/leave", { error: `Overlaps your ${overlap.status.toLowerCase()} leave from ${fmtDay(overlap.startDate)}.` });

  if (type.paid) {
    const bal = (await getBalances(me.id, start.getUTCFullYear())).find((b) => b.leaveTypeId === type.id);
    if (!bal || bal.available < days)
      back("/leave", { error: `Not enough ${type.name} balance: ${bal?.available ?? 0} day(s) available, ${days} requested.` });
  }

  const req = await db.leaveRequest.create({
    data: { userId: me.id, leaveTypeId: type.id, startDate: start, endDate: end, halfDay: v.halfDay, days, reason },
  });
  await audit(me.id, "leave.applied", "LeaveRequest", req.id, { days, type: type.code });

  // Notify the manager, or all admins if there is no manager.
  const approvers = me.managerId
    ? await db.user.findMany({ where: { id: me.managerId, status: "ACTIVE" } })
    : await db.user.findMany({ where: { role: "ADMIN", status: "ACTIVE", id: { not: me.id } } });
  await notify(
    approvers.map((a) => a.email),
    `Leave request from ${me.name}`,
    [`${me.name} applied for ${days} day(s) of ${type.name}.`, `${fmtDay(start)} – ${fmtDay(end)}`, reason ? `Reason: ${reason}` : ""],
    "/approvals/leave",
  );

  revalidatePath("/", "layout");
  back("/leave", { ok: `Applied for ${days} day(s) of ${type.name}. Waiting for approval.` });
}

export async function cancelLeave(fd: FormData) {
  const me = await requireUser();
  const id = String(fd.get("id"));
  const req = await db.leaveRequest.findUnique({ where: { id } });
  if (!req || req.userId !== me.id) back("/leave", { error: "Request not found." });
  // Employees may withdraw pending requests, or approved ones that haven't started yet.
  const ok = req.status === "PENDING" || (req.status === "APPROVED" && req.startDate > todayUTC());
  if (!ok) back("/leave", { error: "This request can no longer be cancelled. Ask HR." });
  await db.leaveRequest.update({ where: { id }, data: { status: "CANCELLED" } });
  await audit(me.id, "leave.cancelled", "LeaveRequest", id, { previous: req.status });
  revalidatePath("/", "layout");
  back("/leave", { ok: "Leave request cancelled." });
}

export async function decideLeave(fd: FormData) {
  const me = await requireUser();
  const id = String(fd.get("id"));
  const decision = String(fd.get("decision"));
  const note = String(fd.get("note") ?? "").trim() || null;
  const returnTo = String(fd.get("returnTo") || "/approvals/leave");
  if (!["APPROVED", "REJECTED", "CANCELLED"].includes(decision)) back(returnTo, { error: "Invalid action." });

  const req = await db.leaveRequest.findUnique({ where: { id }, include: { user: true, leaveType: true } });
  if (!req) back(returnTo, { error: "Request not found." });
  if (!canApprove(me, req.user) && !(req.userId === me.id && (await canSelfApprove(me)))) back(returnTo, { error: "You can't approve this request." });

  if (decision === "CANCELLED") {
    // Revoke previously-approved leave (admin only).
    if (me.role !== "ADMIN" || req.status !== "APPROVED") back(returnTo, { error: "Only admins can revoke approved leave." });
  } else if (req.status !== "PENDING") {
    back(returnTo, { error: `Already ${req.status.toLowerCase()}.` });
  }
  if (decision === "REJECTED" && !note) back(returnTo, { error: "Add a note explaining the rejection." });

  if (decision === "APPROVED" && req.leaveType.paid) {
    const bal = (await getBalances(req.userId, req.startDate.getUTCFullYear())).find((b) => b.leaveTypeId === req.leaveTypeId);
    // available already subtracts this pending request, so it must stay >= 0
    if (!bal || bal.available < 0) back(returnTo, { error: `${req.user.name} doesn't have enough ${req.leaveType.name} balance.` });
  }

  await db.leaveRequest.update({
    where: { id },
    data: { status: decision as "APPROVED" | "REJECTED" | "CANCELLED", approverId: me.id, decisionNote: note, decidedAt: new Date() },
  });
  await audit(me.id, `leave.${decision.toLowerCase()}`, "LeaveRequest", id, { owner: req.user.email, note });
  const verb = decision === "APPROVED" ? "approved" : decision === "REJECTED" ? "rejected" : "revoked";
  await notify(
    req.user.email,
    `Your leave was ${verb}`,
    [`${me.name} ${verb} your ${req.leaveType.name} (${fmtDay(req.startDate)} – ${fmtDay(req.endDate)}).`, note ? `Note: ${note}` : ""],
    "/leave",
  );
  revalidatePath("/", "layout");
  back(returnTo, { ok: `Leave ${verb} for ${req.user.name}.` });
}

// One action per button: a button's name/value isn't reliably sent with server-action form submits.
export async function approveLeave(fd: FormData) { fd.set("decision", "APPROVED"); return decideLeave(fd); }
export async function rejectLeave(fd: FormData) { fd.set("decision", "REJECTED"); return decideLeave(fd); }
export async function revokeLeave(fd: FormData) { fd.set("decision", "CANCELLED"); return decideLeave(fd); }
