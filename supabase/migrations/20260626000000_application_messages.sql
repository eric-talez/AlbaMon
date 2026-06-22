-- Slice 9: application-centered messages.
-- Threads are implicit: every message belongs to exactly one application.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_not_blank check (char_length(btrim(body)) > 0),
  constraint messages_body_max_length check (char_length(body) <= 2000)
);

create index messages_application_created_idx
  on public.messages (application_id, created_at, id);

alter table public.messages enable row level security;

create or replace function public.can_access_application_thread(target_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    join public.companies c on c.id = j.company_id
    where a.id = target_application_id
      and (
        (public.current_profile_role() = 'seeker' and a.seeker_id = auth.uid())
        or (public.current_profile_role() = 'employer' and c.owner_id = auth.uid())
        or public.current_profile_role() = 'admin'
      )
  );
$$;

create or replace function public.get_application_thread_context(target_application_id uuid)
returns table (
  application_id uuid,
  job_id uuid,
  job_title text,
  company_name text,
  application_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, j.id, j.title, c.name, a.status
  from public.applications a
  join public.jobs j on j.id = a.job_id
  join public.companies c on c.id = j.company_id
  where a.id = target_application_id
    and public.can_access_application_thread(a.id);
$$;

create policy messages_select_participants on public.messages
  for select
  using (public.can_access_application_thread(application_id));

create policy messages_insert_participants on public.messages
  for insert
  with check (
    sender_id = auth.uid()
    and public.current_profile_role() in ('seeker', 'employer')
    and public.can_access_application_thread(application_id)
  );

comment on table public.messages is
  'Application-centered messages visible only to the applicant, owning employer, and admins.';

revoke all on table public.messages from public, anon, authenticated;
grant select, insert on table public.messages to authenticated;

revoke all on function public.can_access_application_thread(uuid)
  from public, anon, authenticated;
revoke all on function public.get_application_thread_context(uuid)
  from public, anon, authenticated;
grant execute on function public.can_access_application_thread(uuid) to authenticated;
grant execute on function public.get_application_thread_context(uuid) to authenticated;
