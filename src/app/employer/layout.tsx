import { requireEmployerAreaAccess } from "@/lib/auth/guards";
import { AccountBar } from "@/components/auth/AccountBar";

// Auth-gated: depends on the request session, so never statically prerender.
export const dynamic = "force-dynamic";

/**
 * Employer area. Seekers are routed to /employer/request-access (which lives
 * outside this layout) so they can ask for employer access; admins are
 * allowed. Guarded server-side, so every nested route (incl.
 * /employer/jobs/new) is protected regardless of client state.
 */
export default async function EmployerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireEmployerAreaAccess("/employer");
  return (
    <div className="flex min-h-full flex-col">
      <AccountBar user={user} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
