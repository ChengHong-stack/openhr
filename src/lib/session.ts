import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import type { User } from "@prisma/client";

/** Current user, re-read from the DB on every request so role/deactivation changes apply immediately. */
export async function currentUser() {
  const session = await auth();
  const uid = (session as { uid?: string } | null)?.uid;
  if (!uid) return null;
  const user = await db.user.findUnique({ where: { id: uid } });
  if (!user || user.status !== "ACTIVE") return null;
  return user;
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "ADMIN") redirect("/?error=" + encodeURIComponent("Admins only."));
  return u;
}

export async function requireApprover() {
  const u = await requireUser();
  if (u.role === "EMPLOYEE") redirect("/?error=" + encodeURIComponent("Managers and admins only."));
  return u;
}

/** What is being approved. Backup approvers only cover leave. */
export type ApprovalKind = "leave" | "claim";

/**
 * Admins approve anyone; managers approve their direct reports, and for leave also the people
 * they are the backup approver for. Nobody approves their own.
 */
export function canApprove(
  actor: Pick<User, "id" | "role">,
  owner: Pick<User, "id" | "managerId" | "backupManagerId">,
  kind: ApprovalKind = "claim",
) {
  if (actor.id === owner.id) return false;
  if (actor.role === "ADMIN") return true;
  if (actor.role !== "MANAGER") return false;
  return owner.managerId === actor.id || (kind === "leave" && owner.backupManagerId === actor.id);
}

/**
 * Fallback for admins nobody else can approve: no active manager and no other active admin.
 * Without this, a sole admin's own requests would be invisible to every approver.
 */
export async function canSelfApprove(actor: Pick<User, "id" | "role" | "managerId" | "backupManagerId">) {
  if (actor.role !== "ADMIN") return false;
  const others = [actor.managerId, actor.backupManagerId].filter((x): x is string => !!x);
  const other = await db.user.findFirst({
    where: {
      status: "ACTIVE",
      id: { not: actor.id },
      OR: [{ role: "ADMIN" }, ...(others.length ? [{ id: { in: others } }] : [])],
    },
    select: { id: true },
  });
  return !other;
}

/** Prisma filter for users whose requests the actor may approve. */
export async function approvableOwnersWhere(
  actor: Pick<User, "id" | "role" | "managerId" | "backupManagerId">,
  kind: ApprovalKind = "claim",
) {
  if (actor.role !== "ADMIN") {
    return kind === "leave" ? { OR: [{ managerId: actor.id }, { backupManagerId: actor.id }] } : { managerId: actor.id };
  }
  return (await canSelfApprove(actor)) ? {} : { id: { not: actor.id } };
}

/** Active people to notify about a new request: manager (+ backup for leave), else all admins. */
export async function approversFor(
  owner: Pick<User, "id" | "managerId" | "backupManagerId">,
  kind: ApprovalKind = "claim",
) {
  const ids = [owner.managerId, kind === "leave" ? owner.backupManagerId : null].filter((x): x is string => !!x);
  const found = ids.length ? await db.user.findMany({ where: { id: { in: ids }, status: "ACTIVE" } }) : [];
  return found.length ? found : db.user.findMany({ where: { role: "ADMIN", status: "ACTIVE", id: { not: owner.id } } });
}
