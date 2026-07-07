"use server";

import {
  submitEmployerAccessRequestForUser,
  type EmployerAccessRequestFormState,
} from "@/lib/employer-access/actions";

export async function submitEmployerAccessRequest(
  _previousState: EmployerAccessRequestFormState,
  formData: FormData,
): Promise<EmployerAccessRequestFormState> {
  return submitEmployerAccessRequestForUser(formData);
}
