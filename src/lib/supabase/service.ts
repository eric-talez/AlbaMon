import "server-only";

import { createClient } from "@supabase/supabase-js";

const PLACEHOLDER_FRAGMENTS = ["your-project", "your-service-role-key", "example.com"];

function configured(value: string | undefined): value is string {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return !PLACEHOLDER_FRAGMENTS.some((fragment) =>
    trimmed.toLowerCase().includes(fragment),
  );
}

export function isSupabaseServiceRoleConfigured(): boolean {
  return (
    configured(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    configured(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

export function createSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!configured(url) || !configured(key)) {
    throw new Error("Supabase service role is not configured.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
