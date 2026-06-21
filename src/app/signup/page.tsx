import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import { DevAuthForm } from "@/components/auth/DevAuthForm";

export const metadata: Metadata = { title: "회원가입" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 block text-center text-sm text-muted">
          {SITE_NAME}
        </Link>
        <DevAuthForm mode="signup" next={next} error={error} />
      </div>
    </main>
  );
}
