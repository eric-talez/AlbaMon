-- Slice 21: employer access requests — admin-reviewed employer role upgrades.
--
-- Real auth users are provisioned as 'seeker' (handle_new_user in the init
-- schema). Until now the only path to the employer role was manual SQL. This
-- migration adds a self-service request queue: a seeker files a request from
-- /employer/request-access, an admin approves or rejects it from
-- /admin/employer-requests. Approval flips profiles.role to 'employer' inside
-- one SECURITY DEFINER function so the request row and the role change move
-- atomically. Requesters can never update a request or their own role:
-- the table has NO update/delete policies, and profiles keeps the existing
-- profiles_prevent_role_self_update trigger as defense in depth.

create table public.employer_access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  business_name text not null,
  contact_name text not null,
  phone text,
  website text,
  city text not null,
  state text not null default 'CA',
  reason text,
  status text not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employer_access_requests_status_allowed
    check (status in ('pending', 'approved', 'rejected')),
  constraint employer_access_requests_business_name_not_empty
    check (length(btrim(business_name)) > 0),
  constraint employer_access_requests_contact_name_not_empty
    check (length(btrim(contact_name)) > 0),
  constraint employer_access_requests_city_not_empty
    check (length(btrim(city)) > 0),
  constraint employer_access_requests_business_name_max_length
    check (char_length(business_name) <= 200),
  constraint employer_access_requests_contact_name_max_length
    check (char_length(contact_name) <= 120),
  constraint employer_access_requests_phone_max_length
    check (phone is null or char_length(phone) <= 40),
  constraint employer_access_requests_website_max_length
    check (website is null or char_length(website) <= 2048),
  constraint employer_access_requests_city_max_length
    check (char_length(city) <= 100),
  constraint employer_access_requests_state_two_letter
    check (state ~ '^[A-Z]{2}$'),
  constraint employer_access_requests_reason_max_length
    check (reason is null or char_length(reason) <= 1000),
  -- Review bookkeeping is all-or-nothing: pending rows carry no review fields,
  -- decided rows always carry the decision time. reviewed_by may later become
  -- null via ON DELETE SET NULL, so only reviewed_at is required here.
  constraint employer_access_requests_review_fields_consistent
    check (
      (status = 'pending' and reviewed_by is null and reviewed_at is null)
      or (status <> 'pending' and reviewed_at is not null)
    )
);

-- One open request per user; rejected users may file again.
create unique index employer_access_requests_one_pending_per_requester
  on public.employer_access_requests (requester_id)
  where status = 'pending';

create index employer_access_requests_status_created_idx
  on public.employer_access_requests (status, created_at desc);

create index employer_access_requests_requester_created_idx
  on public.employer_access_requests (requester_id, created_at desc);

create trigger employer_access_requests_set_updated_at
  before update on public.employer_access_requests
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.employer_access_requests enable row level security;

-- Requesters may file a request only as themselves, only while their DB role
-- is still 'seeker' (employers/admins already have access), and only in the
-- initial pending state with no review fields.
create policy employer_access_requests_insert_own on public.employer_access_requests
  for insert
  with check (
    requester_id = auth.uid()
    and public.current_profile_role() = 'seeker'
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

create policy employer_access_requests_select_own on public.employer_access_requests
  for select using (requester_id = auth.uid());

create policy employer_access_requests_select_admin on public.employer_access_requests
  for select using (public.is_admin());

-- There is intentionally NO update or delete policy on this table: a requester
-- can never approve, reject, or edit a request through PostgREST, and admin
-- decisions must go through review_employer_access_request() below so the
-- request status and the profile role change happen in one transaction.

-- ----------------------------------------------------------------------------
-- Admin review function
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER so the decision and the role promotion are atomic without
-- handing out broader update policies. The caller must be an authenticated
-- admin per the runtime profiles.role; everyone else gets an exception before
-- any row is touched.
create or replace function public.review_employer_access_request(
  request_id uuid,
  decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.employer_access_requests%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an admin may review employer access requests';
  end if;

  if decision not in ('approved', 'rejected') then
    raise exception 'Unsupported employer access request decision: %', decision;
  end if;

  select * into target
  from public.employer_access_requests
  where id = request_id
  for update;

  if not found or target.status <> 'pending' then
    return 'conflict';
  end if;

  update public.employer_access_requests
  set status = decision,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = request_id;

  -- Approval promotes seeker -> employer only. It never touches an admin
  -- profile, and a rejection never changes any role.
  if decision = 'approved' then
    update public.profiles
    set role = 'employer'
    where id = target.requester_id
      and role = 'seeker';
  end if;

  return decision;
end;
$$;

comment on function public.review_employer_access_request(uuid, text) is
  'Admin-only: approve/reject a pending employer access request; approval promotes the requester from seeker to employer atomically.';

revoke all on function public.review_employer_access_request(uuid, text) from public, anon, authenticated;
grant execute on function public.review_employer_access_request(uuid, text) to authenticated;
