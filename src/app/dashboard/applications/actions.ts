"use server";
import { withdrawApplicationForApplicant, type ApplicationStatusFormState } from "@/lib/applications/status-action";

export async function withdrawOwnApplication(_previousState: ApplicationStatusFormState, formData: FormData): Promise<ApplicationStatusFormState> {
  return withdrawApplicationForApplicant(formData);
}
