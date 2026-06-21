-- ============================================================================
-- K-Work US — Slice 3: initial schema, constraints, triggers, helpers, RLS
-- ============================================================================
-- Source of truth for the database. Safe to apply to a fresh Supabase project
-- (Postgres 15+). Ordering: extensions -> enums -> tables -> indexes ->
-- updated_at trigger -> helper functions -> auth.users trigger -> RLS.
--
-- Enum string values MUST stay in sync with the const arrays in
-- src/lib/types.ts (enforced by tests/db-schema.test.ts).
--
-- Authorization model: Row Level Security is the gate. On Supabase the
-- `anon`, `authenticated`, and `service_role` roles receive table privileges
-- via default privileges; the policies below restrict which rows each role
-- may read/write. `service_role` bypasses RLS for trusted server-side flows.
-- ============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- 1. Enums  (values must match src/lib/types.ts exactly)
-- ----------------------------------------------------------------------------
create type public.user_role as enum ('seeker', 'employer', 'admin');

create type public.job_type as enum ('part_time', 'full_time', 'temporary', 'contract');

create type public.pay_unit as enum ('hour', 'day', 'week', 'month', 'year');

create type public.language_requirement as enum (
  'korean_required',
  'korean_helpful',
  'bilingual_preferred',
  'english_required'
);

create type public.job_category as enum (
  'restaurant_cafe',
  'medical_dental_reception',
  'logistics_warehouse',
  'beauty_nail_hair',
  'education_tutoring',
  'retail',
  'office_admin',
  'other'
);

create type public.moderation_status as enum (
  'draft',
  'pending',
  'approved',
  'rejected',
  'paused',
  'expired'
);

create type public.boost_type as enum ('featured', 'urgent');

-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------

-- profiles: one row per auth user. The DB-level source of truth for role.
-- At the time Slice 3 shipped, runtime auth still read user_metadata; Slice 4
-- moved authorization to this DB-owned role.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'seeker',
  email text,
  display_name text,
  phone text,
  city text,
  state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  website text,
  phone text,
  city text not null,
  state text not null default 'CA',
  address_display text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_name_not_empty check (length(name) > 0)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  category public.job_category not null,
  job_type public.job_type not null,
  city text not null,
  state text not null default 'CA',
  address_display text,
  -- 'full' | 'city_only' — mirrors Job.addressDisplayMode in src/lib/types.ts.
  address_display_mode text not null default 'city_only',
  pay_min numeric not null,
  pay_max numeric not null,
  pay_unit public.pay_unit not null,
  tips_available boolean not null default false,
  schedule_days text not null,
  schedule_time_range text not null,
  language_requirement public.language_requirement not null,
  description text not null,
  responsibilities text[] not null default '{}',
  requirements text[] not null default '{}',
  benefits text[] not null default '{}',
  moderation_status public.moderation_status not null default 'pending',
  boost public.boost_type,
  posted_at timestamptz default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_pay_min_nonneg check (pay_min >= 0),
  constraint jobs_pay_max_gte_min check (pay_max >= pay_min),
  constraint jobs_title_not_empty check (length(title) > 0),
  constraint jobs_description_not_empty check (length(description) > 0),
  constraint jobs_address_display_mode check (address_display_mode in ('full', 'city_only'))
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  seeker_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'submitted',
  cover_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_unique_per_seeker unique (job_id, seeker_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  job_id uuid references public.jobs (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- audit_logs: append-only. No updated_at trigger; writes via service-role only.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------------------------
create index jobs_moderation_posted_idx on public.jobs (moderation_status, posted_at desc);
create index jobs_city_category_type_idx on public.jobs (city, category, job_type);
create index companies_owner_idx on public.companies (owner_id);
create index applications_job_idx on public.applications (job_id);
create index applications_seeker_idx on public.applications (seeker_id);
create index reports_status_idx on public.reports (status);
create index audit_logs_actor_created_idx on public.audit_logs (actor_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 4. updated_at trigger (reusable)
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Authorization helper functions
-- ----------------------------------------------------------------------------
-- All are SECURITY DEFINER + STABLE so they bypass RLS on `profiles`/`companies`
-- when called from within a policy. This is what prevents infinite recursion
-- (a policy on `profiles` that needs to read the caller's role) and keeps the
-- helpers cheap. `search_path` is pinned to avoid hijacking.

create or replace function public.current_profile_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'admin', false);
$$;

create or replace function public.is_employer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'employer', false);
$$;

create or replace function public.owns_company(company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.companies c
    where c.id = company_id and c.owner_id = auth.uid()
  );
$$;

-- Auto-provision a profile row whenever an auth user is created. Role defaults
-- to 'seeker'; real role assignment for employers is handled in a later slice.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Defense in depth for role escalation: even if an RLS WITH CHECK is ever
-- loosened or bypassed, this trigger hard-blocks a non-admin from changing the
-- `role` of any profile. Admins (per is_admin()) may still change roles, and
-- trusted server-side flows (service role / migrations / seed, where there is no
-- authenticated user so auth.uid() is null) are allowed through.
create or replace function public.prevent_profile_role_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only an admin may change a profile role';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_self_update
  before update of role on public.profiles
  for each row execute function public.prevent_profile_role_self_update();

-- ----------------------------------------------------------------------------
-- 6. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;

-- --- profiles ---------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

create policy profiles_select_admin on public.profiles
  for select using (public.is_admin());

-- Self-update is allowed, but the WITH CHECK forbids changing your own role:
-- `role` must still equal the role currently stored for this user. This is the
-- guard against self-promotion through the normal update path.
create policy profiles_update_own on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_profile_role());

create policy profiles_update_admin on public.profiles
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- --- companies --------------------------------------------------------------
create policy companies_select_public_verified on public.companies
  for select using (is_verified = true);

create policy companies_select_owner on public.companies
  for select using (owner_id = auth.uid());

create policy companies_select_admin on public.companies
  for select using (public.is_admin());

-- Only employers (or admins) may create/own companies — seekers cannot create
-- or edit a company through the owner path.
create policy companies_insert_owner on public.companies
  for insert
  with check (
    owner_id = auth.uid()
    and (public.is_employer() or public.is_admin())
  );

create policy companies_update_owner on public.companies
  for update
  using (
    owner_id = auth.uid()
    and (public.is_employer() or public.is_admin())
  )
  with check (
    owner_id = auth.uid()
    and (public.is_employer() or public.is_admin())
  );

create policy companies_update_admin on public.companies
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- --- jobs -------------------------------------------------------------------
-- Public (anon + authenticated) may read ONLY approved jobs.
create policy jobs_select_public_approved on public.jobs
  for select using (moderation_status = 'approved');

create policy jobs_select_owner on public.jobs
  for select using (public.owns_company(company_id));

create policy jobs_select_admin on public.jobs
  for select using (public.is_admin());

-- Employer-created jobs are FORCED to 'pending' — no self-publish.
create policy jobs_insert_owner on public.jobs
  for insert
  with check (public.owns_company(company_id) and moderation_status = 'pending');

-- Owners may edit their jobs but may NOT move them to 'approved'
-- (approval is an admin-only decision).
create policy jobs_update_owner on public.jobs
  for update
  using (public.owns_company(company_id))
  with check (public.owns_company(company_id) and moderation_status <> 'approved');

create policy jobs_update_admin on public.jobs
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- --- applications -----------------------------------------------------------
-- Seekers may apply only to approved jobs, only as themselves, and only when
-- their DB profile role is actually `seeker`.
create policy applications_insert_seeker on public.applications
  for insert
  with check (
    seeker_id = auth.uid()
    and public.current_profile_role() = 'seeker'
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and j.moderation_status = 'approved'
    )
  );

create policy applications_select_own on public.applications
  for select using (seeker_id = auth.uid());

-- Employer owners can see applications for jobs under companies they own.
create policy applications_select_employer on public.applications
  for select using (
    exists (
      select 1
      from public.jobs j
      join public.companies c on c.id = j.company_id
      where j.id = applications.job_id and c.owner_id = auth.uid()
    )
  );

create policy applications_select_admin on public.applications
  for select using (public.is_admin());

create policy applications_update_admin on public.applications
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- --- reports ----------------------------------------------------------------
-- Any authenticated user may file a report (as themselves or anonymously).
create policy reports_insert_authenticated on public.reports
  for insert
  with check (
    auth.uid() is not null
    and (reporter_id = auth.uid() or reporter_id is null)
  );

create policy reports_select_own on public.reports
  for select using (reporter_id = auth.uid());

create policy reports_select_admin on public.reports
  for select using (public.is_admin());

create policy reports_update_admin on public.reports
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- --- audit_logs -------------------------------------------------------------
-- Admins may read. There is intentionally NO insert/update/delete policy:
-- writes happen only through the service-role key (which bypasses RLS) in
-- trusted server-side flows.
create policy audit_logs_select_admin on public.audit_logs
  for select using (public.is_admin());
