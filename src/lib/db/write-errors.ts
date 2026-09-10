/** Exact PostgREST errors shared by session-only writers. */
export function writeFailure(error: { code: string; message?: string }): "rate_limited" | "suspended" | undefined {
  if (error.code === "P0001" && error.message === "write_rate_limited") return "rate_limited";
  if (error.code === "42501" && error.message === "account_suspended") return "suspended";
}
export const WRITE_RETRY_MESSAGE = "쓰기 한도에 도달했습니다. 잠시 후 다시 시도해 주세요. (Please try again later.)";
export const SUSPENDED_WRITE_MESSAGE = "계정이 정지되어 새 내용을 저장할 수 없습니다. 기존 내역은 확인할 수 있습니다. (Account suspended; history remains available.)";
