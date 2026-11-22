"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, canApprove, canSelfApprove, approversFor } from "@/lib/session";
import { parseDay, fmtDay, todayUTC } from "@/lib/dates";
import { fmtMoney } from "@/lib/money";
import { saveUpload } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/mail";
import { back } from "@/lib/flash";

const ClaimSchema = z.object({
  categoryId: z.string().min(1, "Choose a category."),
  amount: z.coerce.number().positive("Amount must be more than zero.").max(1_000_000),
  expenseDate: z.string(),
  description: z.string().trim().min(3, "Describe the expense.").max(500),
});

export async function submitClaim(fd: FormData) {
  const me = await requireUser();
  const parsed = ClaimSchema.safeParse({
    categoryId: fd.get("categoryId"),
    amount: fd.get("amount"),
    expenseDate: fd.get("expenseDate"),
    description: fd.get("description"),
  });
  if (!parsed.success) back("/claims", { error: parsed.error.issues[0].message });
  const v = parsed.data;
  const date = parseDay(v.expenseDate);
  if (!date) back("/claims", { error: "Enter a valid expense date." });
  if (date > todayUTC()) back("/claims", { error: "Expense date can't be in the future." });

  const cat = await db.claimCategory.findFirst({ where: { id: v.categoryId, active: true } });
  if (!cat) back("/claims", { error: "That category isn't available." });
  if (cat.medical) back("/claims", { error: "Medical claims are submitted with your medical leave (My leave)." });
  if (cat.limitPerClaim && v.amount > Number(cat.limitPerClaim))
    back("/claims", { error: `${cat.name} is capped at ${fmtMoney(cat.limitPerClaim)} per claim.` });

  const file = fd.get("receipt");
  let receipt: { receiptPath: string; receiptName: string; receiptMime: string } | undefined;
  if (file instanceof File && file.size > 0) {
    try {
      receipt = { receiptPath: await saveUpload(file, "receipts"), receiptName: file.name.slice(0, 200), receiptMime: file.type };
    } catch (e) {
      back("/claims", { error: (e as Error).message });
    }
  } else {
    back("/claims", { error: "Attach a receipt." });
  }

  const claim = await db.claim.create({
    data: {
      userId: me.id,
      categoryId: cat.id,
      amount: Math.round(v.amount * 100) / 100,
      expenseDate: date,
      description: v.description,
      ...receipt,
    },
  });
  await audit(me.id, "claim.submitted", "Claim", claim.id, { amount: v.amount, category: cat.name });

  const approvers = await approversFor(me, "claim");
  await notify(approvers.map((a) => a.email), `Claim from ${me.name}`,
    [`${me.name} submitted a ${cat.name} claim of ${fmtMoney(v.amount)} (${fmtDay(date)}).`, v.description], "/approvals/claims");

  revalidatePath("/", "layout");
  back("/claims", { ok: `Claim of ${fmtMoney(v.amount)} submitted.` });
}

export async function cancelClaim(fd: FormData) {
  const me = await requireUser();
  const id = String(fd.get("id"));
  const c = await db.claim.findUnique({ where: { id } });
  if (!c || c.userId !== me.id) back("/claims", { error: "Claim not found." });
  if (c.leaveRequestId) back("/claims", { error: "This claim belongs to a leave request. Cancel it from My leave." });
  if (c.status !== "PENDING") back("/claims", { error: "Only pending claims can be withdrawn." });
  await db.claim.update({ where: { id }, data: { status: "CANCELLED" } });
  await audit(me.id, "claim.cancelled", "Claim", id);
  revalidatePath("/", "layout");
  back("/claims", { ok: "Claim withdrawn." });
}

export async function decideClaim(fd: FormData) {
  const me = await requireUser();
  const id = String(fd.get("id"));
  const decision = String(fd.get("decision"));
  const note = String(fd.get("note") ?? "").trim() || null;
  const returnTo = String(fd.get("returnTo") || "/approvals/claims");
  if (!["APPROVED", "REJECTED"].includes(decision)) back(returnTo, { error: "Invalid action." });

  const c = await db.claim.findUnique({ where: { id }, include: { user: true, category: true } });
  if (!c) back(returnTo, { error: "Claim not found." });
  if (c.leaveRequestId) back(returnTo, { error: "This medical claim is decided together with its leave request." });
  if (!canApprove(me, c.user) && !(c.userId === me.id && (await canSelfApprove(me)))) back(returnTo, { error: "You can't approve this claim." });
  if (c.status !== "PENDING") back(returnTo, { error: `Already ${c.status.toLowerCase()}.` });
  if (decision === "REJECTED" && !note) back(returnTo, { error: "Add a note explaining the rejection." });

  await db.claim.update({
    where: { id },
    data: { status: decision as "APPROVED" | "REJECTED", approverId: me.id, decisionNote: note, decidedAt: new Date() },
  });
  const verb = decision === "APPROVED" ? "approved" : "rejected";
  await audit(me.id, `claim.${verb}`, "Claim", id, { owner: c.user.email, amount: Number(c.amount), note });
  await notify(c.user.email, `Your claim was ${verb}`,
    [`${me.name} ${verb} your ${c.category.name} claim of ${fmtMoney(c.amount)}.`, note ? `Note: ${note}` : ""], "/claims");
  revalidatePath("/", "layout");
  back(returnTo, { ok: `Claim ${verb} for ${c.user.name}.` });
}

export async function approveClaim(fd: FormData) { fd.set("decision", "APPROVED"); return decideClaim(fd); }
export async function rejectClaim(fd: FormData) { fd.set("decision", "REJECTED"); return decideClaim(fd); }
