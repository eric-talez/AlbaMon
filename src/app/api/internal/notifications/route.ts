import { runNotificationBatch } from "@/lib/notifications/worker";
export const maxDuration = 120;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response(null, { status: 401 });
  try { return Response.json(await runNotificationBatch()); }
  catch { return new Response(null, { status: 503 }); }
}
