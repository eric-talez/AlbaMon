-- ============================================================================
-- K-Work US — restrict public/seeker reads of the companies base table
-- ============================================================================
-- Why: `public.companies` was directly readable through PostgREST by `anon`
-- and by any ordinary authenticated seeker. The combination of
--   grant select on public.companies to anon, authenticated   (20260707…)
--   policy companies_select_public_verified using (is_verified = true)  (init)
-- meant that anyone holding the public anon key could request private
-- base-table columns (`phone`, `address_display`, `website`, `owner_id`) for
-- every verified company — data the UI never shows.
--
-- Public job pages never need the base table: they read the approved-only
-- `public.public_job_listings` view, which exposes only safe company identity
-- (`company_name`, `company_is_verified`). That view runs with its owner's
-- rights (no `security_invoker`, and the base table does not FORCE row level
-- security), so the changes below do NOT affect it.
--
-- Model unchanged: Row Level Security remains the row gate. This migration only
-- TIGHTENS access — it changes no columns and deletes no data.

-- 1. Remove the public/seeker read path. Company verification alone must no
--    longer grant base-table visibility; verified companies are exposed to the
--    public only through public.public_job_listings from here on. The owner
--    (companies_select_owner) and admin (companies_select_admin) SELECT
--    policies are retained, so employers still read their own company and
--    admins still read all.
drop policy if exists companies_select_public_verified on public.companies;

-- 2. `anon` no longer needs — and must not have — any direct read on the base
--    table. Idempotent: revoking an absent privilege is a no-op. The
--    `authenticated` grant is intentionally kept so the retained owner/admin
--    SELECT policies can still return rows for employers and admins; a seeker
--    holds the grant but matches no SELECT policy, so it reads zero rows.
revoke select on table public.companies from public, anon;

-- Post-conditions (RLS + grants; asserted in tests/db-schema.test.ts):
--   anon                 : no SELECT privilege on public.companies (42501);
--                          still reads approved jobs via public_job_listings.
--   authenticated seeker : holds the grant but matches no SELECT policy
--                          (not owner, not admin) -> zero company rows.
--   employer             : companies_select_owner -> own company only.
--   admin                : companies_select_admin -> all companies.
