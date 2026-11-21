// Liveness probe for the host's healthcheck. Deliberately independent of auth and the DB:
// migrations already ran (and reached the DB) before the server started.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", { headers: { "Cache-Control": "no-store" } });
}
