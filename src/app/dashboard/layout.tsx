import { requireUser } from "@/lib/auth/guards";
import { AccountBar } from "@/components/auth/AccountBar";

// Auth-gated: depends on the request session, so never statically prerender.
export const dynamic = "force-dynamic";

/** Any authenticated user may access /dashboard. Guarded server-side. */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser("/dashboard");
  return (
    <div className="flex min-h-full flex-col">
      <AccountBar user={user} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
