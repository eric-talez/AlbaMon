-- ============================================================================
-- Slice 28 — live role-scoped verification for the durable rate limiter
-- ============================================================================
-- Proves, against a REAL Postgres (grants + RLS actually enforced), that after
-- 20260714010000_server_rate_limiting.sql:
--   A/B. anon cannot SELECT/INSERT public.rate_limit_buckets, nor EXECUTE the fn;
--   C/D. an authenticated user is likewise denied on table + function;
--   E.   service_role: the first max_attempts calls are allowed, the next denied,
--        a denied call still increments (capped), and retry_after is clamped;
--   F.   bounded input validation rejects bad hash / out-of-range args;
--   G.   an expired bucket is cleaned up on the next consume;
--   H.   buckets are independent per (scope, subject_hash).
--
-- Run ONLY against a disposable LOCAL stack (never hosted):
--   supabase start && supabase db reset            # applies migrations + seed
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/slice-28-rate-limiting.sql
--
-- Self-verifying: each check RAISEs on failure (psql exits non-zero) and emits
-- `PASS <case>` on success. Every check runs in its own transaction and is rolled
-- back, so this script mutates nothing. No principals needed — the limiter is
-- keyed by opaque HMAC hashes, not auth.uid(). Hashes below are fixed 64-hex
-- literals (repeat('a',64) etc.); real hashes are HMAC-SHA256 output.

-- --- A. anon: table + function denied ----------------------------------------
begin;
set local role anon;
do $$
begin
  begin
    perform 1 from public.rate_limit_buckets limit 1;
    raise exception 'FAIL A: anon SELECT rate_limit_buckets (expected denied)';
  exception when insufficient_privilege then
    raise notice 'PASS A1: anon denied SELECT on rate_limit_buckets';
  end;
  begin
    insert into public.rate_limit_buckets(scope, subject_hash, window_start, attempt_count, expires_at)
      values ('x', repeat('a', 64), now(), 1, now() + interval '1 minute');
    raise exception 'FAIL A: anon INSERT rate_limit_buckets (expected denied)';
  exception when insufficient_privilege then
    raise notice 'PASS A2: anon denied INSERT on rate_limit_buckets';
  end;
  begin
    perform 1 from public.consume_rate_limit('x', repeat('a', 64), 3, 900);
    raise exception 'FAIL A: anon EXECUTE consume_rate_limit (expected denied)';
  exception when insufficient_privilege then
    raise notice 'PASS A3: anon denied EXECUTE on consume_rate_limit';
  end;
end $$;
rollback;

-- --- B. authenticated: table + function denied -------------------------------
begin;
set local role authenticated;
do $$
begin
  begin
    perform 1 from public.rate_limit_buckets limit 1;
    raise exception 'FAIL B: authenticated SELECT rate_limit_buckets (expected denied)';
  exception when insufficient_privilege then
    raise notice 'PASS B1: authenticated denied SELECT on rate_limit_buckets';
  end;
  begin
    perform 1 from public.consume_rate_limit('x', repeat('a', 64), 3, 900);
    raise exception 'FAIL B: authenticated EXECUTE consume_rate_limit (expected denied)';
  exception when insufficient_privilege then
    raise notice 'PASS B2: authenticated denied EXECUTE on consume_rate_limit';
  end;
end $$;
rollback;

-- --- E. service_role: allow first N, deny the rest, cap + clamp ---------------
begin;
set local role service_role;
do $$
declare
  v_allowed boolean; v_remaining int; v_retry int;
  h text := repeat('a', 64);
  i int;
begin
  for i in 1..3 loop
    select allowed, remaining, retry_after_seconds
      into v_allowed, v_remaining, v_retry
      from public.consume_rate_limit('slice28_e', h, 3, 900);
    if not v_allowed then
      raise exception 'FAIL E: call % denied (expected allowed)', i;
    end if;
  end loop;

  select allowed, remaining, retry_after_seconds
    into v_allowed, v_remaining, v_retry
    from public.consume_rate_limit('slice28_e', h, 3, 900);
  if v_allowed then raise exception 'FAIL E: 4th call allowed (expected denied)'; end if;
  if v_remaining <> 0 then raise exception 'FAIL E: remaining % (expected 0)', v_remaining; end if;
  if v_retry < 1 or v_retry > 900 then
    raise exception 'FAIL E: retry_after_seconds % out of [1,900]', v_retry;
  end if;

  -- Denied call still incremented; the counter is capped at max_attempts + 1 = 4.
  perform 1 from public.rate_limit_buckets
    where scope = 'slice28_e' and subject_hash = h and attempt_count = 4;
  if not found then
    raise exception 'FAIL E: denied call did not increment to the cap (4)';
  end if;
  raise notice 'PASS E: 3 allowed, 4th denied, retry=% clamped, counter capped at 4', v_retry;
end $$;
rollback;

-- --- F. bounded input validation ---------------------------------------------
begin;
set local role service_role;
do $$
begin
  begin
    perform 1 from public.consume_rate_limit('s', 'not-64-hex', 3, 900);
    raise exception 'FAIL F1: non-hex subject_hash accepted';
  exception when others then
    if sqlerrm like 'FAIL F%' then raise; end if;
    raise notice 'PASS F1: non-hex subject_hash rejected';
  end;
  begin
    perform 1 from public.consume_rate_limit('s', repeat('a', 64), 0, 900);
    raise exception 'FAIL F2: max_attempts=0 accepted';
  exception when others then
    if sqlerrm like 'FAIL F%' then raise; end if;
    raise notice 'PASS F2: out-of-range max_attempts rejected';
  end;
  begin
    perform 1 from public.consume_rate_limit('s', repeat('a', 64), 3, 999999);
    raise exception 'FAIL F3: oversized window accepted';
  exception when others then
    if sqlerrm like 'FAIL F%' then raise; end if;
    raise notice 'PASS F3: out-of-range window_seconds rejected';
  end;
end $$;
rollback;

-- --- G. expired-row cleanup on next consume ----------------------------------
begin;
set local role service_role;
do $$
declare
  n int;
  h_expired text := repeat('c', 64);
  h_active text := repeat('d', 64);
begin
  insert into public.rate_limit_buckets(scope, subject_hash, window_start, attempt_count, expires_at, updated_at)
    values ('slice28_g', h_expired, now() - interval '2 hours', 5, now() - interval '1 hour', now() - interval '1 hour');
  perform 1 from public.consume_rate_limit('slice28_g', h_active, 3, 900);
  select count(*) into n from public.rate_limit_buckets
    where scope = 'slice28_g' and subject_hash = h_expired;
  if n <> 0 then raise exception 'FAIL G: expired bucket not cleaned (% rows)', n; end if;
  raise notice 'PASS G: expired bucket cleaned up on the next consume';
end $$;
rollback;

-- --- H. buckets independent per (scope, subject_hash) ------------------------
begin;
set local role service_role;
do $$
declare
  v_allowed boolean;
  hA text := repeat('a', 64);
  hB text := repeat('b', 64);
begin
  select allowed into v_allowed from public.consume_rate_limit('slice28_h', hA, 1, 900);
  if not v_allowed then raise exception 'FAIL H: first call denied'; end if;
  select allowed into v_allowed from public.consume_rate_limit('slice28_h', hA, 1, 900);
  if v_allowed then raise exception 'FAIL H: repeat on same key allowed (expected denied)'; end if;
  select allowed into v_allowed from public.consume_rate_limit('slice28_h', hB, 1, 900);
  if not v_allowed then raise exception 'FAIL H: different subject_hash denied'; end if;
  select allowed into v_allowed from public.consume_rate_limit('slice28_h2', hA, 1, 900);
  if not v_allowed then raise exception 'FAIL H: different scope denied'; end if;
  raise notice 'PASS H: counters are independent per (scope, subject_hash)';
end $$;
rollback;

\echo 'Slice 28 live verification: all cases passed.'
