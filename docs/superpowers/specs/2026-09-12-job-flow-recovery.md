# Public job flow recovery

The user approved restoring public job discovery and detail navigation first. Google, Kakao and phone authentication are explicitly deferred.

## Required behavior

- Configured Supabase is the sole source for public lists, search, city options and detail. Query or transport failures propagate to a retryable error state; they never silently return fictional jobs.
- Deliberately unconfigured development keeps its existing fictional list and detail flow. Production never serves those fixtures.
- Any canonical PostgreSQL UUID returned by the public view can be opened, including the checked-in seed IDs. Continue rejecting malformed paths before querying.
- Approved, California, unexpired and active-owner visibility remains enforced by the current database view and RPCs. Missing/private/expired jobs remain unavailable.
- Use the installed Next.js documentation, Node 22 and current dependencies. Do not add dependencies or change auth/provider configuration.
- Preserve existing databases and private configuration. Use a separately named local stack with the complete migration history and clearly fictional checked-in seed for interactive verification; do not reset retained databases or make old expired/undated jobs public.

## Diagnosis

The application pointed at Studio port 54323 instead of API port 54321. The retained k-work-us database has 14 migrations, while the application expects 26. Configured development failures fell back to mock IDs, which the configured detail lookup rejected. Additionally, its UUID version/variant restriction rejected the canonical but deliberately deterministic IDs in supabase/seed.sql. All ten retained jobs have no expiry, so they must not be silently republished under the current rules.
