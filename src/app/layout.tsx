import type { Metadata } from "next";
import "./globals.css";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// Korean-first typography is provided by a pure CSS system-font stack in
// globals.css (--font-sans-kr). We intentionally do not use Google Fonts so the
// production build never depends on fetching web fonts at build time.

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "미국 한인 커뮤니티를 위한 Korean-English bilingual 로컬 구인구직 플랫폼. LA/OC 지역 알바·파트타임·정규직.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
