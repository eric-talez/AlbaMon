"use server";

import type { ReportJobFormState } from "@/lib/reports/action";
import { submitJobReportForUser } from "@/lib/reports/action";

export async function submitJobReport(
  jobId: string,
  _previousState: ReportJobFormState,
  formData: FormData,
): Promise<ReportJobFormState> {
  return submitJobReportForUser(jobId, formData);
}
