import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader user={user} />
      {/* Reserve the navigation and device safe area. */}
      <div className="flex flex-1 flex-col pb-[var(--mobile-bottom-offset)] sm:pb-0">{children}</div>
      <SiteFooter />
      <MobileBottomNav user={user} />
    </div>
  );
}
