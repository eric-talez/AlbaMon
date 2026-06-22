"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { setCompanyVerification } from "@/lib/db/admin-moderation";

export interface CompanyVerificationState {
  status: "idle" | "success" | "conflict" | "error";
  message: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function refreshCompanyPaths(): void {
  revalidatePath("/admin");
  revalidatePath("/admin/companies");
}

export async function updateCompanyVerification(
  _previousState: CompanyVerificationState,
  formData: FormData,
): Promise<CompanyVerificationState> {
  await requireRole("admin", "/admin/companies");
  const companyId = formData.get("companyId");
  const verification = formData.get("verification");
  if (
    typeof companyId !== "string" ||
    !UUID_PATTERN.test(companyId) ||
    (verification !== "verify" && verification !== "unverify")
  ) {
    return { status: "error", message: "올바른 회사 인증 요청이 아닙니다." };
  }

  const result = await setCompanyVerification(
    companyId,
    verification === "verify",
  );
  if (result.status === "updated") {
    refreshCompanyPaths();
    return {
      status: "success",
      message: verification === "verify"
        ? "회사를 인증했습니다."
        : "회사 인증을 해제했습니다.",
    };
  }
  if (result.status === "conflict") {
    refreshCompanyPaths();
    return {
      status: "conflict",
      message: "회사를 찾을 수 없거나 상태가 변경되었습니다. 목록을 새로고침했습니다.",
    };
  }
  return {
    status: "error",
    message: result.status === "unavailable"
      ? "Supabase가 연결된 환경에서만 회사 인증을 변경할 수 있습니다."
      : "회사 인증을 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
