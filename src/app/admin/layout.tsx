import { requireArea } from "@/lib/auth/guards";
import { AccountBar } from "@/components/auth/AccountBar";

// Auth-gated: depends on the request session, so never statically prerender.
export const dynamic = "force-dynamic";

/** Admin area — admin role only. Seekers and employers are rejected. */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireArea("admin", "/admin");
  return (
    <div className="flex min-h-full flex-col">
      <AccountBar user={user} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
