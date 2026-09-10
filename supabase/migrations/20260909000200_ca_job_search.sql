-- California launch: enforce publishable workplaces and provide literal,
-- unit-consistent public search over the safe listing projection.

create or replace function public.enforce_ca_job_pay()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Existing incompatible rows may be paused/closed without inventing data.
  -- Inserts, publication, and direct edits of either guarded field must pass.
  if tg_op = 'INSERT'
     or new.moderation_status = 'approved'
     or new.state is distinct from old.state
     or new.pay_min is distinct from old.pay_min then
    if new.state <> 'CA' then
      raise exception '현재는 캘리포니아 근무지 공고만 등록할 수 있습니다.'
        using errcode = '23514';
    end if;
    if new.pay_min <= 0 then
      raise exception '0보다 큰 기본 급여를 입력해 주세요. 팁은 별도입니다.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_enforce_ca_pay on public.jobs;
create trigger jobs_enforce_ca_pay
  before insert or update on public.jobs
  for each row execute function public.enforce_ca_job_pay();

drop policy if exists jobs_select_public_approved on public.jobs;
create policy jobs_select_public_approved on public.jobs
  for select using (moderation_status = 'approved' and state = 'CA');

create or replace view public.public_job_listings
with (security_barrier = true)
as
select
  j.id,
  j.title,
  j.category,
  j.job_type,
  j.city,
  j.state,
  j.address_display,
  j.address_display_mode,
  j.pay_min,
  j.pay_max,
  j.pay_unit,
  j.tips_available,
  j.schedule_days,
  j.schedule_time_range,
  j.language_requirement,
  j.description,
  j.responsibilities,
  j.requirements,
  j.benefits,
  j.moderation_status,
  j.boost,
  j.posted_at,
  c.name as company_name,
  c.is_verified as company_is_verified
from public.jobs j
join public.companies c on c.id = j.company_id
where j.moderation_status = 'approved'
  and j.state = 'CA';

comment on view public.public_job_listings is
  'Approved California public jobs plus safe company identity fields; no private company columns.';

revoke all on public.public_job_listings from public, anon, authenticated;
grant select on public.public_job_listings to anon, authenticated;

create or replace function public.search_public_jobs(
  search_query text default null,
  search_city text default null,
  search_category public.job_category default null,
  search_job_type public.job_type default null,
  search_language_requirement public.language_requirement default null,
  search_pay_unit public.pay_unit default null,
  search_pay_min numeric default null,
  search_sort text default 'newest',
  search_page integer default 1
)
returns setof public.public_job_listings
language sql
stable
security definer
set search_path = ''
as $$
  with args as (
    select
      greatest(1, least(coalesce(search_page, 1), 500)) as page,
      coalesce(
        search_pay_unit,
        case
          when search_pay_min is not null or search_sort in ('pay_high', 'pay_low')
            then 'hour'::public.pay_unit
        end
      ) as pay_unit
  )
  select p.*
  from public.public_job_listings p
  cross join args a
  where (
      search_query is null
      or strpos(
        lower(concat_ws(' ', p.title, p.company_name, p.description)),
        lower(search_query)
      ) > 0
    )
    and (search_city is null or p.city = search_city)
    and (search_category is null or p.category = search_category)
    and (search_job_type is null or p.job_type = search_job_type)
    and (
      search_language_requirement is null
      or p.language_requirement = search_language_requirement
    )
    and (a.pay_unit is null or p.pay_unit = a.pay_unit)
    and (search_pay_min is null or p.pay_min >= search_pay_min)
  order by
    case when search_sort = 'pay_low' then p.pay_min end asc nulls last,
    case when search_sort = 'pay_high' then p.pay_min end desc nulls last,
    case when search_sort not in ('pay_low', 'pay_high') or search_sort is null
      then p.posted_at end desc nulls last,
    p.id desc
  offset ((select page from args) - 1) * 20
  limit 21;
$$;

revoke all on function public.search_public_jobs(
  text, text, public.job_category, public.job_type,
  public.language_requirement, public.pay_unit, numeric, text, integer
) from public;
grant execute on function public.search_public_jobs(
  text, text, public.job_category, public.job_type,
  public.language_requirement, public.pay_unit, numeric, text, integer
) to anon, authenticated;

create or replace function public.list_public_job_cities()
returns table(city text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.city
  from public.public_job_listings p
  where p.state = 'CA'
  order by p.city;
$$;

revoke all on function public.list_public_job_cities() from public;
grant execute on function public.list_public_job_cities() to anon, authenticated;
