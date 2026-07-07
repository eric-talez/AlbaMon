import type { ReactNode } from "react";

type Tone = "brand" | "success" | "warning" | "danger" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  success: "bg-green-100 text-success dark:bg-green-950/40",
  warning: "bg-amber-100 text-warning dark:bg-amber-950/40",
  danger: "bg-red-100 text-danger dark:bg-red-950/40",
  neutral: "bg-surface text-muted border border-border",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function VerifiedBadge() {
  return <Badge tone="success">Company info reviewed / 회사 정보 확인됨</Badge>;
}

export function CompanyVerificationBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge tone="success">Company information reviewed / 회사 정보 확인됨</Badge>
  ) : (
    <Badge tone="neutral">Company not yet verified / 아직 인증되지 않은 회사</Badge>
  );
}
