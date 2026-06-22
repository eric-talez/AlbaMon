"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createEmployerCompany,
  getOwnedEmployerCompany,
  updateEmployerCompany,
} from "@/lib/db/companies";
import { parseEmployerCompanyForm } from "@/lib/employer/validation";

export interface CompanyFormState {
  status: "idle" | "success" | "error";
  message: string;
  companyId?: string;
}

export async function saveEmployerCompany(
  _previousState: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const user = await requireRole("employer", "/employer/company");
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "회사 관리는 Supabase가 연결된 환경에서 사용할 수 있습니다." };
  }

  const parsed = parseEmployerCompanyForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const rawCompanyId = formData.get("companyId");
  const companyId = typeof rawCompanyId === "string" && rawCompanyId.trim()
    ? rawCompanyId.trim()
    : null;

  if (companyId) {
    const owned = await getOwnedEmployerCompany(companyId, user.id);
    if (!owned) {
      return { status: "error", message: "수정할 수 있는 회사 정보를 찾지 못했습니다." };
    }
  }

  const result = companyId
    ? await updateEmployerCompany(companyId, user.id, parsed.value)
    : await createEmployerCompany(user.id, parsed.value);

  if (result.status === "created" || result.status === "updated") {
    revalidatePath("/employer");
    revalidatePath("/employer/company");
    revalidatePath("/employer/jobs/new");
    return {
      status: "success",
      message: result.status === "created" ? "회사 정보가 등록되었습니다." : "회사 정보가 수정되었습니다.",
      companyId: result.companyId,
    };
  }
  if (result.status === "not_allowed") {
    return {
      status: "error",
      message: companyId
        ? "이 회사 정보를 수정할 권한이 없습니다."
        : "이미 등록된 회사가 있어 새 회사를 추가할 수 없습니다.",
    };
  }
  if (result.status === "unavailable") {
    return { status: "error", message: "회사 관리 기능을 현재 사용할 수 없습니다." };
  }
  return { status: "error", message: "회사 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
}
