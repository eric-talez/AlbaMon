"use server";

import type { MessageFormState } from "@/lib/messages/action";
import { sendMessageForRole } from "@/lib/messages/action";

export async function sendSeekerApplicationMessage(
  _previousState: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  return sendMessageForRole("seeker", "/dashboard/applications", formData);
}
