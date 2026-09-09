import { checkReadiness } from "@/lib/ops/health";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const ok = await checkReadiness();
  return Response.json(
    { status: ok ? "ok" : "unavailable" },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
