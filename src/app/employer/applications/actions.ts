"use server";

import type { ApplicationStatusFormState } from "@/lib/applications/status-action";
import { updateApplicationStatusForEmployer } from "@/lib/applications/status-action";

export async function updateEmployerApplicationStatus(
  _previousState: ApplicationStatusFormState,
  formData: FormData,
): Promise<ApplicationStatusFormState> {
  return updateApplicationStatusForEmployer(formData);
}
