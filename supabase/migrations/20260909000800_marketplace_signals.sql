-- Aggregate in Postgres so the API row limit cannot truncate the observation cohort.
create or replace function public.admin_marketplace_signals(reference_date timestamptz default now())
returns table(cohort_count bigint, applied_within_7_days bigint,
  median_first_employer_reply_hours double precision, unanswered_application_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin analytics not allowed' using errcode='42501';
  end if;
  return query
  with cohort as (
    -- Latest publication, including paused/closed history. Unknown publication is excluded.
    select j.id, j.posted_at, c.owner_id
    from public.jobs j join public.companies c on c.id=j.company_id
    where j.state = 'CA' and j.posted_at between reference_date - interval '28 days' and reference_date - interval '7 days'
  ), eligible as (
    select a.id, a.job_id, a.created_at, c.owner_id
    from cohort c join public.applications a on a.job_id=c.id
    join public.profiles p on p.id=a.seeker_id
    where a.created_at between c.posted_at and c.posted_at + interval '7 days'
      and a.status <> 'withdrawn' and p.account_status <> 'suspended'
  ), replies as (
    select a.id, min(m.created_at) as first_reply, a.created_at
    from eligible a left join public.messages m on m.application_id=a.id
      and m.sender_id=a.owner_id
      and m.created_at between a.created_at and reference_date
    group by a.id, a.created_at
  )
  select (select count(*) from cohort), (select count(distinct job_id) from eligible),
    (select percentile_cont(0.5) within group(order by extract(epoch from (first_reply-created_at))/3600)
      from replies where first_reply is not null),
    (select count(*) from replies where first_reply is null);
end;
$$;
revoke all on function public.admin_marketplace_signals(timestamptz) from public, anon;
grant execute on function public.admin_marketplace_signals(timestamptz) to authenticated;
