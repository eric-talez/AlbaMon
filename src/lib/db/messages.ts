import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ApplicationThreadContextRow,
  MessageRow,
} from "@/lib/db/types";

export interface ApplicationMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  isOwn: boolean;
}

export interface ApplicationThread {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  applicationStatus: string;
  messages: ApplicationMessage[];
}

export type ApplicationThreadResult =
  | { status: "ok"; thread: ApplicationThread }
  | { status: "not_allowed" | "unavailable" | "error" };

export type SendMessageResult =
  | { status: "sent"; messageId: string }
  | { status: "not_allowed" | "unavailable" | "error" };

const MESSAGE_SELECT = "id, application_id, sender_id, body, created_at";
const NOT_ALLOWED_CODES = new Set(["23503", "23514", "42501"]);

export async function getApplicationThread(
  applicationId: string,
  currentUserId: string,
): Promise<ApplicationThreadResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: contexts, error: contextError } = await supabase.rpc(
      "get_application_thread_context",
      { target_application_id: applicationId },
    );
    if (contextError) throw contextError;
    const context = (contexts ?? [])[0] as
      | ApplicationThreadContextRow
      | undefined;
    if (!context) return { status: "not_allowed" };

    const { data, error } = await supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;

    return {
      status: "ok",
      thread: {
        applicationId: context.application_id,
        jobId: context.job_id,
        jobTitle: context.job_title,
        companyName: context.company_name,
        applicationStatus: context.application_status,
        messages: ((data ?? []) as unknown as MessageRow[]).map((message) => ({
          id: message.id,
          senderId: message.sender_id,
          body: message.body,
          createdAt: message.created_at,
          isOwn: message.sender_id === currentUserId,
        })),
      },
    };
  } catch {
    console.error("[db] getApplicationThread failed");
    return { status: "error" };
  }
}

export async function sendApplicationMessage(
  applicationId: string,
  senderId: string,
  body: string,
): Promise<SendMessageResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("messages")
      .insert({
        application_id: applicationId,
        sender_id: senderId,
        body,
      })
      .select("id")
      .single();
    if (!error) return { status: "sent", messageId: data.id as string };
    if (NOT_ALLOWED_CODES.has(error.code)) return { status: "not_allowed" };
    throw error;
  } catch {
    console.error("[db] sendApplicationMessage failed");
    return { status: "error" };
  }
}
