-- Slice 7: harden employer-managed verification and paid-boost fields.

drop policy if exists companies_insert_owner on public.companies;
create policy companies_insert_owner on public.companies
  for insert
  with check (
    owner_id = auth.uid()
    and (
      public.is_admin()
      or (public.is_employer() and is_verified = false)
    )
  );

drop policy if exists jobs_insert_owner on public.jobs;
create policy jobs_insert_owner on public.jobs
  for insert
  with check (
    public.owns_company(company_id)
    and (public.is_employer() or public.is_admin())
    and moderation_status = 'pending'
    and (public.is_admin() or boost is null)
  );

create or replace function public.prevent_company_verification_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_verified is distinct from old.is_verified
     and auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin() then
    raise exception 'Only a trusted admin workflow may change company verification'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists companies_prevent_verification_change on public.companies;
create trigger companies_prevent_verification_change
  before update of is_verified on public.companies
  for each row execute function public.prevent_company_verification_change();

create or replace function public.prevent_job_boost_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.boost is distinct from old.boost
     and auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin() then
    raise exception 'Only a trusted admin or billing workflow may change a job boost'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_prevent_boost_change on public.jobs;
create trigger jobs_prevent_boost_change
  before update of boost on public.jobs
  for each row execute function public.prevent_job_boost_change();
