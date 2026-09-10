"use server";

import type { MessageFormState } from "@/lib/messages/action";
import { sendMessageForParticipant } from "@/lib/messages/action";

export async function sendSeekerApplicationMessage(
  _previousState: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  return sendMessageForParticipant(formData);
}
