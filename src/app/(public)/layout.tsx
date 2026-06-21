import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      {/* pb-20 leaves room for the mobile bottom nav */}
      <div className="flex flex-1 flex-col pb-20 sm:pb-0">{children}</div>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
