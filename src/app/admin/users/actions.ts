"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { changeAccountStatus } from "@/lib/db/admin-moderation";

export interface AccountActionState { status: "idle" | "success" | "error"; message: string }
async function changeAccount(formData: FormData, command: "suspend_account" | "restore_account"): Promise<AccountActionState> {
  const admin = await requireRole("admin", "/admin/users");
  const userId = formData.get("userId"), reason = formData.get("reason");
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
      || userId === admin.id || typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) {
    return { status: "error", message: "대상 계정과 1~500자의 처리 사유를 확인해 주세요. 본인 계정은 처리할 수 없습니다." };
  }
  const result = await changeAccountStatus(userId, command, reason.trim());
  if (result.status !== "updated") return { status: "error", message: result.status === "conflict" ? "계정 상태가 변경되었습니다. 새로고침 후 확인해 주세요." : "계정 상태를 변경하지 못했습니다. 관리자 인증과 현재 상태를 확인해 주세요." };
  for (const path of ["/admin", "/admin/users", "/admin/jobs", "/jobs", "/employer/jobs"]) revalidatePath(path);
  return { status: "success", message: command === "suspend_account" ? "계정을 정지하고 대기·공개 공고를 중지했습니다." : "계정 정지를 해제했습니다. 기존 공고는 자동 공개되지 않으며 다시 검토해야 합니다." };
}
export async function suspendAccount(_state: AccountActionState, formData: FormData) { return changeAccount(formData, "suspend_account"); }
export async function restoreAccount(_state: AccountActionState, formData: FormData) { return changeAccount(formData, "restore_account"); }
