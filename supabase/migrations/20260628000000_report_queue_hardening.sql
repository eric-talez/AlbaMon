-- Slice 11: verification trust and report queue hardening.
--
-- The reports table already exists. This migration keeps the Slice 11 surface
-- narrow: constrain report reasons/statuses, limit report inserts to approved
-- jobs through RLS, prevent duplicate same-user/same-job/same-reason reports,
-- and keep admin status updates scoped to the review queue.

alter table public.reports
  add constraint reports_reason_allowed
  check (
    reason in (
      'discriminatory_language',
      'visa_status_preference',
      'illegal_cash_pay',
      'misleading_or_suspicious',
      'spam',
      'other'
    )
  )
  not valid;

alter table public.reports
  add constraint reports_status_allowed
  check (status in ('open', 'reviewed', 'dismissed'))
  not valid;

alter table public.reports
  add constraint reports_details_max_length
  check (details is null or char_length(details) <= 1000)
  not valid;

do $$
declare
  invalid_reason_count bigint;
  invalid_status_count bigint;
  invalid_details_count bigint;
begin
  select count(*) into invalid_reason_count
  from public.reports
  where reason not in (
    'discriminatory_language',
    'visa_status_preference',
    'illegal_cash_pay',
    'misleading_or_suspicious',
    'spam',
    'other'
  );

  select count(*) into invalid_status_count
  from public.reports
  where status not in ('open', 'reviewed', 'dismissed');

  select count(*) into invalid_details_count
  from public.reports
  where details is not null and char_length(details) > 1000;

  if invalid_reason_count > 0 then
    raise exception
      'Cannot validate reports_reason_allowed: % existing rows have an unsupported reason',
      invalid_reason_count;
  end if;

  if invalid_status_count > 0 then
    raise exception
      'Cannot validate reports_status_allowed: % existing rows have an unsupported status',
      invalid_status_count;
  end if;

  if invalid_details_count > 0 then
    raise exception
      'Cannot validate reports_details_max_length: % existing rows exceed 1000 characters',
      invalid_details_count;
  end if;
end
$$;

alter table public.reports validate constraint reports_reason_allowed;
alter table public.reports validate constraint reports_status_allowed;
alter table public.reports validate constraint reports_details_max_length;

create unique index reports_unique_reporter_job_reason
  on public.reports (reporter_id, job_id, reason)
  where reporter_id is not null and job_id is not null;

drop policy if exists reports_insert_authenticated on public.reports;
create policy reports_insert_authenticated on public.reports
  for insert
  with check (
    auth.uid() is not null
    and reporter_id = auth.uid()
    and job_id is not null
    and status = 'open'
    and reason in (
      'discriminatory_language',
      'visa_status_preference',
      'illegal_cash_pay',
      'misleading_or_suspicious',
      'spam',
      'other'
    )
    and (details is null or char_length(details) <= 1000)
    and exists (
      select 1
      from public.jobs j
      where j.id = job_id and j.moderation_status = 'approved'
    )
  );

drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin on public.reports
  for update
  using (public.is_admin())
  with check (
    public.is_admin()
    and status in ('open', 'reviewed', 'dismissed')
  );
