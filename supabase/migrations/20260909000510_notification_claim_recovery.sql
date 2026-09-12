-- Terminal recovery must not wait on a locked row before claiming unrelated work.
-- Keep maintenance bounded to five rows per invocation, like the delivery batch.
create or replace function public.claim_notification_batch(batch_size integer)
returns setof public.notification_outbox language plpgsql security definer set search_path = '' as $$
begin
  with terminal as (
    select o.id from public.notification_outbox o
    where ((o.status='sending' and o.lease_until<=now()) or (o.status='pending' and o.available_at<=now()))
      and (o.attempts>=5 or o.first_attempt_at < now()-interval '23 hours')
    order by o.available_at,o.id for update skip locked limit 5
  )
  update public.notification_outbox o set status='failed',lease_until=null,
    last_error_code=case when o.attempts>=5 then 'attempts_exhausted' else 'idempotency_window_expired' end
  from terminal where o.id=terminal.id;
  return query
  with due as (
    select o.id from public.notification_outbox o
    where ((o.status='pending' and o.available_at<=now()) or (o.status='sending' and o.lease_until<=now()))
      and o.attempts<5 and (o.first_attempt_at is null or o.first_attempt_at>=now()-interval '23 hours')
    order by o.available_at,o.id for update skip locked limit greatest(0,least(coalesce(batch_size,5),5))
  )
  update public.notification_outbox o set status='sending',lease_until=now()+interval '5 minutes',
    attempts=o.attempts+1,first_attempt_at=coalesce(o.first_attempt_at,now())
  from due where o.id=due.id returning o.*;
end; $$;
