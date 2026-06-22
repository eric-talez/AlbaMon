import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CompanyRow } from "@/lib/db/types";
import type { EmployerCompanyInput } from "@/lib/employer/validation";

export interface EmployerCompany {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  phone: string | null;
  city: string;
  state: string;
  addressDisplay: string | null;
  isVerified: boolean;
  createdAt: string;
}

export type CompanyListResult =
  | { status: "ok"; companies: EmployerCompany[] }
  | { status: "unavailable" }
  | { status: "error" };

export type CompanyWriteResult =
  | { status: "created" | "updated"; companyId: string }
  | { status: "not_allowed" | "unavailable" | "error" };

const COMPANY_SELECT =
  "id, owner_id, name, description, website, phone, city, state, " +
  "address_display, is_verified, created_at, updated_at";

function mapCompany(row: CompanyRow): EmployerCompany {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    website: row.website,
    phone: row.phone,
    city: row.city,
    state: row.state,
    addressDisplay: row.address_display,
    isVerified: row.is_verified,
    createdAt: row.created_at,
  };
}

function companyPayload(input: EmployerCompanyInput) {
  return {
    name: input.name,
    description: input.description,
    website: input.website,
    phone: input.phone,
    city: input.city,
    state: input.state,
    address_display: input.addressDisplay,
  };
}

export async function getEmployerCompanies(ownerId: string): Promise<CompanyListResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("companies")
      .select(COMPANY_SELECT)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return {
      status: "ok",
      companies: ((data ?? []) as unknown as CompanyRow[]).map(mapCompany),
    };
  } catch {
    console.error("[db] getEmployerCompanies failed");
    return { status: "error" };
  }
}

export async function getOwnedEmployerCompany(
  companyId: string,
  ownerId: string,
): Promise<EmployerCompany | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("companies")
      .select(COMPANY_SELECT)
      .eq("id", companyId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapCompany(data as unknown as CompanyRow) : null;
  } catch {
    console.error("[db] getOwnedEmployerCompany failed");
    return null;
  }
}

export async function createEmployerCompany(
  ownerId: string,
  input: EmployerCompanyInput,
): Promise<CompanyWriteResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: existing, error: existingError } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", ownerId)
      .limit(1);
    if (existingError) throw existingError;
    if ((existing ?? []).length > 0) return { status: "not_allowed" };

    const { data, error } = await supabase
      .from("companies")
      .insert({
        owner_id: ownerId,
        is_verified: false,
        ...companyPayload(input),
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "42501") return { status: "not_allowed" };
      throw error;
    }
    return { status: "created", companyId: data.id as string };
  } catch {
    console.error("[db] createEmployerCompany failed");
    return { status: "error" };
  }
}

export async function updateEmployerCompany(
  companyId: string,
  ownerId: string,
  input: EmployerCompanyInput,
): Promise<CompanyWriteResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("companies")
      .update(companyPayload(input))
      .eq("id", companyId)
      .eq("owner_id", ownerId)
      .select("id")
      .maybeSingle();
    if (error) {
      if (error.code === "42501") return { status: "not_allowed" };
      throw error;
    }
    return data
      ? { status: "updated", companyId: data.id as string }
      : { status: "not_allowed" };
  } catch {
    console.error("[db] updateEmployerCompany failed");
    return { status: "error" };
  }
}
