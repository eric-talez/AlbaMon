/**
 * Database row types for K-Work US (Slice 3).
 *
 * Hand-written, lightweight types that mirror the SQL schema in
 * `supabase/migrations/`. The enum string unions are NOT redefined here — they
 * are re-exported from `@/lib/types`, which stays the single source of truth
 * (the SQL enums are checked against it in tests/db-schema.test.ts).
 *
 * Columns are snake_case to match Postgres; the app's camelCase `Job` view type
 * is produced by the mapper in `@/lib/db/jobs`.
 */
import type {
  BoostType,
  JobCategory,
  JobType,
  LanguageRequirement,
  ModerationStatus,
  PayUnit,
  Role,
} from "@/lib/types";

export type {
  BoostType,
  JobCategory,
  JobType,
  LanguageRequirement,
  ModerationStatus,
  PayUnit,
  Role,
};

export type AddressDisplayMode = "full" | "city_only";

export interface ProfileRow {
  id: string;
  role: Role;
  email: string | null;
  display_name: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  website: string | null;
  phone: string | null;
  city: string;
  state: string;
  address_display: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobRow {
  id: string;
  company_id: string;
  title: string;
  category: JobCategory;
  job_type: JobType;
  city: string;
  state: string;
  address_display: string | null;
  address_display_mode: AddressDisplayMode;
  pay_min: number;
  pay_max: number;
  pay_unit: PayUnit;
  tips_available: boolean;
  schedule_days: string;
  schedule_time_range: string;
  language_requirement: LanguageRequirement;
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  moderation_status: ModerationStatus;
  boost: BoostType | null;
  posted_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Approved-only row returned by the safe `public_job_listings` view. */
export interface PublicJobListingRow {
  id: string;
  title: string;
  category: JobCategory;
  job_type: JobType;
  city: string;
  state: string;
  address_display: string | null;
  address_display_mode: AddressDisplayMode;
  pay_min: number;
  pay_max: number;
  pay_unit: PayUnit;
  tips_available: boolean;
  schedule_days: string;
  schedule_time_range: string;
  language_requirement: LanguageRequirement;
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  moderation_status: ModerationStatus;
  boost: BoostType | null;
  posted_at: string | null;
  company_name: string;
  company_is_verified: boolean;
}

export interface ApplicationRow {
  id: string;
  job_id: string;
  seeker_id: string;
  status: string;
  cover_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportRow {
  id: string;
  reporter_id: string | null;
  job_id: string | null;
  company_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
