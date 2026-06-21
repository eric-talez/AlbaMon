-- Slice 5: constrain seeker-created applications to their initial state and
-- bound the optional cover note. The existing unique(job_id, seeker_id)
-- constraint is intentionally unchanged.

drop policy if exists applications_insert_seeker on public.applications;
create policy applications_insert_seeker on public.applications
  for insert
  with check (
    seeker_id = auth.uid()
    and public.current_profile_role() = 'seeker'
    and status = 'submitted'
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and j.moderation_status = 'approved'
    )
  );

alter table public.applications
  add constraint applications_cover_note_max_length
  check (cover_note is null or char_length(cover_note) <= 1000)
  not valid;

do $$
declare
  over_limit_count bigint;
begin
  select count(*) into over_limit_count
  from public.applications
  where cover_note is not null and char_length(cover_note) > 1000;

  if over_limit_count > 0 then
    raise exception
      'Cannot validate applications_cover_note_max_length: % existing rows exceed 1000 characters',
      over_limit_count;
  end if;
end
$$;

alter table public.applications
  validate constraint applications_cover_note_max_length;
