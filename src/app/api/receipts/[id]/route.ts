import { db } from "@/lib/db";
import { currentUser, canApprove } from "@/lib/session";
import { readUpload } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const c = await db.claim.findUnique({ where: { id }, include: { user: true } });
  if (!c?.receiptPath) return new Response("Not found", { status: 404 });
  if (c.userId !== me.id && !canApprove(me, c.user)) return new Response("Forbidden", { status: 403 });
  try {
    const buf = await readUpload(c.receiptPath);
    const safeName = (c.receiptName ?? "receipt").replace(/[^\w.\- ]/g, "_");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": c.receiptMime ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("File missing", { status: 404 });
  }
}
