import {
  REPORT_REASONS,
  type ReportReason,
} from "@/lib/types";

export interface ParsedReportForm {
  reason: ReportReason;
  details: string | null;
}

export type ReportFormParseResult =
  | { ok: true; value: ParsedReportForm }
  | { ok: false; message: string };

const MAX_REPORT_DETAILS_LENGTH = 1000;

export function isReportReason(value: unknown): value is ReportReason {
  return (
    typeof value === "string" &&
    (REPORT_REASONS as readonly string[]).includes(value)
  );
}

export function parseReportForm(formData: FormData): ReportFormParseResult {
  const reason = formData.get("reason");
  const detailsRaw = formData.get("details");

  if (!isReportReason(reason)) {
    return { ok: false, message: "신고 사유를 선택해 주세요." };
  }
  if (typeof detailsRaw !== "string") {
    return { ok: false, message: "신고 내용 형식이 올바르지 않습니다." };
  }

  const details = detailsRaw.trim();
  if (details.length > MAX_REPORT_DETAILS_LENGTH) {
    return {
      ok: false,
      message: "상세 내용은 1,000자 이하로 입력해 주세요.",
    };
  }

  return { ok: true, value: { reason, details: details || null } };
}
