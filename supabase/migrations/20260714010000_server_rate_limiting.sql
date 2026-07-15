-- Slice 28: durable, distributed server-side rate limiting.
--
-- A private operational counter table plus one atomic SECURITY DEFINER function
-- back a fixed-window limiter that works across serverless instances (browser
-- cooldowns and in-memory Maps do not). The application reaches it ONLY through
-- consume_rate_limit(), called by the service-role key from a server-only
-- module — never by anon/authenticated, and never as a generic client RPC.
--
-- Privacy: the table stores only an opaque HMAC-SHA256 subject hash (64 lowercase
-- hex chars). Raw phone numbers, IP addresses, OTP codes, emails, user IDs, and
-- user-agent strings are hashed with a server-only secret before they ever reach
-- Postgres and are never stored or logged here.
--
-- Model unchanged: RLS stays enabled (with NO policies, so the API roles see zero
-- rows) and existing DB uniqueness / RLS / transactional constraints remain the
-- final correctness layer. This limiter is an abuse-cost layer in front of them.

create table public.rate_limit_buckets (
  scope text not null,
  subject_hash text not null,
  window_start timestamptz not null,
  attempt_count bigint not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  -- Fixed-window bucket key: one row per (policy, subject, window).
  constraint rate_limit_buckets_pkey primary key (scope, subject_hash, window_start),
  constraint rate_limit_buckets_scope_not_empty
    check (length(btrim(scope)) > 0),
  constraint rate_limit_buckets_scope_max_length
    check (char_length(scope) <= 100),
  -- Only opaque 64-char lowercase-hex HMAC output is ever stored.
  constraint rate_limit_buckets_subject_hash_format
    check (subject_hash ~ '^[0-9a-f]{64}$'),
  constraint rate_limit_buckets_attempt_count_positive
    check (attempt_count >= 1),
  constraint rate_limit_buckets_expiry_after_window
    check (expires_at > window_start)
);

comment on table public.rate_limit_buckets is
  'Private operational rate-limit counters (Slice 28). service_role-only; RLS on with no policies. Keyed by (scope, opaque HMAC subject_hash, window_start); stores no raw phone/IP/OTP/email/uid/UA.';

-- Supports bounded cleanup of expired rows without a table scan.
create index rate_limit_buckets_expires_at_idx
  on public.rate_limit_buckets (expires_at);

-- ----------------------------------------------------------------------------
-- Explicit privileges (this project grants nothing implicitly to the API roles).
-- ----------------------------------------------------------------------------
-- anon/authenticated get NO table privileges. Only the trusted service-role key
-- (RLS bypass by design) receives the DML the limiter function needs.
revoke all on table public.rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.rate_limit_buckets to service_role;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
-- Enabled with NO policies: PostgREST callers (anon/authenticated) can never read
-- or write a row. All access flows through consume_rate_limit() below, which is
-- executable only by service_role.
alter table public.rate_limit_buckets enable row level security;

-- ----------------------------------------------------------------------------
-- Atomic fixed-window limiter
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER with a pinned empty search_path (all identifiers fully
-- qualified). Prefixed parameters (p_*) avoid PL/pgSQL column-name ambiguity.
-- The window is derived from database time only — a client-supplied timestamp is
-- never trusted. Denied calls still increment (capped so a hot bucket cannot
-- overflow). No dynamic SQL, no identifier interpolation.
create or replace function public.consume_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_expires_at timestamptz;
  v_count bigint;
begin
  -- 1. Validate bounded inputs (never trust caller-supplied format/timing).
  if p_scope is null or length(btrim(p_scope)) = 0 or char_length(p_scope) > 100 then
    raise exception 'consume_rate_limit: scope must be non-blank and <= 100 chars';
  end if;
  if p_subject_hash is null or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'consume_rate_limit: subject_hash must be 64 lowercase hex chars';
  end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 10000 then
    raise exception 'consume_rate_limit: max_attempts must be in [1, 10000]';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'consume_rate_limit: window_seconds must be in [1, 86400]';
  end if;

  -- 2. Fixed window aligned to database time.
  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );
  v_expires_at := v_window_start + make_interval(secs => p_window_seconds);

  -- 3. Bounded, non-blocking cleanup of expired buckets (uses the expiry index;
  --    SKIP LOCKED so concurrent limiter calls never wait on each other).
  delete from public.rate_limit_buckets
  where ctid in (
    select ctid
    from public.rate_limit_buckets
    where expires_at < v_now
    order by expires_at
    limit 100
    for update skip locked
  );

  -- 4. Atomic insert-or-increment under concurrency. The increment is capped at
  --    max_attempts + 1: past the limit every call is denied, so counting higher
  --    is pointless and bigint + cap makes overflow impossible.
  insert into public.rate_limit_buckets as b (
    scope, subject_hash, window_start, attempt_count, expires_at, updated_at
  )
  values (p_scope, p_subject_hash, v_window_start, 1, v_expires_at, v_now)
  on conflict (scope, subject_hash, window_start) do update
    set attempt_count = least(b.attempt_count + 1, p_max_attempts + 1),
        updated_at = v_now
  returning b.attempt_count into v_count;

  -- 5. Only the first max_attempts calls in the window are allowed. Retry time is
  --    clamped to [1, window] so it is never zero/negative at a window boundary.
  allowed := v_count <= p_max_attempts;
  remaining := greatest(0, p_max_attempts - v_count)::integer;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      least(
        p_window_seconds,
        ceil(extract(epoch from (v_expires_at - v_now)))::integer
      )
    )
  end;
  return next;
end;
$$;

comment on function public.consume_rate_limit(text, text, integer, integer) is
  'Service-role-only atomic fixed-window rate limiter (Slice 28). Stores only opaque HMAC subject hashes; window computed from database time. Returns (allowed, remaining, retry_after_seconds).';

-- Callable ONLY by service_role. Inaccessible to public/anon/authenticated so it
-- can never be invoked as a generic client RPC.
revoke all on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;
