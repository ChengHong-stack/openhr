import { redirect } from "next/navigation";

/** Redirect back to a page with a flash message in the query string. */
export function back(path: string, msg: { ok?: string; error?: string }): never {
  const u = new URL(path, "http://x");
  if (msg.ok) u.searchParams.set("ok", msg.ok);
  if (msg.error) u.searchParams.set("error", msg.error);
  redirect(u.pathname + u.search);
}
