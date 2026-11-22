import { db } from "@/lib/db";
import { currentUser, canApprove } from "@/lib/session";
import { readUpload } from "@/lib/storage";

/** Medical certificate attached to a leave request: visible to the owner and their leave approvers. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const r = await db.leaveRequest.findUnique({ where: { id }, include: { user: true } });
  if (!r?.certPath) return new Response("Not found", { status: 404 });
  if (r.userId !== me.id && !canApprove(me, r.user, "leave")) return new Response("Forbidden", { status: 403 });
  try {
    const buf = await readUpload(r.certPath);
    const safeName = (r.certName ?? "medical-certificate").replace(/[^\w.\- ]/g, "_");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": r.certMime ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("File missing", { status: 404 });
  }
}
