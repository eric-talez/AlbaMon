# Deployment environment variables

All examples are **placeholders**, never deployment values. Actual projects,
domains, provider accounts and operator/legal facts are unselected. Use protected
Vercel variables per scope; do not commit, log, or put keys in command arguments.
[Deployment procedure](DEPLOYMENT.md) and [actual evidence](launch-evidence/environments.md).

| Variable | Preview / staging | Production | Exposure |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | exact `STAGING_ORIGIN` | exact `PRODUCTION_ORIGIN` | Public, compiled canonical/template origin |
| `NEXT_PUBLIC_INDEXING_ENABLED` | `false` | `true` | Public, compiled robots/header policy |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<staging-ref>.supabase.co` | `https://<production-ref>.supabase.co` | Public, compiled project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon/publishable key | production anon/publishable key | Public, RLS enforced |
| `SUPABASE_SERVICE_ROLE_KEY` | staging service role only | production service role only | **Server-only secret**, worker/trusted operations |
| `STAGING_PROJECT_REF`, `PRODUCTION_PROJECT_REF` | actual distinct console refs | same verified mapping | Server-only configuration, no keys |
| `STAGING_ORIGIN`, `PRODUCTION_ORIGIN` | actual distinct HTTPS origins | same verified mapping | Server-only configuration, no keys |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | `true` after real setup/test | `true` after real setup/test | Public build-time flag, not verification evidence |
| `NEXT_PUBLIC_AUTH_KAKAO_ENABLED`, `NEXT_PUBLIC_AUTH_NAVER_ENABLED`, `NEXT_PUBLIC_AUTH_PHONE_ENABLED` | `false` until verified | `false` until verified | Public build-time flags |
| `NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID` | unset while disabled | unset while disabled | Public custom OIDC slug if selected |
| `EMAIL_PROVIDER` | `resend` | `resend` | Server-only configuration |
| `EMAIL_NOTIFICATIONS_ENABLED` | `true` only after provider setup | `true` only after provider setup | Server-only, independent runtime delivery guard |
| `EMAIL_ENVIRONMENT` | `staging` | `production` | Server-only, must match explicit target |
| `EMAIL_STAGING_ALLOWLIST` | nonempty exact controlled recipient addresses | unset | Server-only personal configuration; never evidence output |
| `EMAIL_FROM` | verified staging sender | verified production sender | Server-only sender config |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `CRON_SECRET` | separate staging values | separate production values | **Server-only secrets**; cron at least 16 random characters |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | unset unless separately implemented/reviewed | unset unless separately implemented/reviewed | Public optional; no active analytics assumed |

No redundant `DEPLOYMENT_ENV`/recipient-list aliases. Worker delivery additionally
requires actual `NODE_ENV=production`; standalone pure release validation works
before Next sets runtime mode. Health `email=configured` means the configured
delivery path is enabled, not that DNS, an inbox or provider has been verified.
Valid worker GET mutates; see the separate authorization boundary in deployment.

Operator-only inputs: `DEPLOYMENT_ORIGIN` selects the **request** URL for smoke;
`NEXT_PUBLIC_SITE_URL` remains the artifact's expected canonical URL.
`VERCEL_AUTOMATION_BYPASS_SECRET` is optional protected automation access to that
one request origin; it is never the cron secret and redirects are refused.
`RECOVERY_PROJECT_REF`/`RECOVERY_ORIGIN` are used only by explicit recovery
identity preflight. `VERCEL_TEAM`, `VERCEL_PROJECT`, `PREVIEW_URL` and
`STAGED_PRODUCTION_URL` come from actual selected infrastructure.

Vercel's repository-native build command is `npm run build:release`. It blocks
missing/placeholder settings, invalid origin shape, incorrect target/indexing/mail
mapping and absent/mismatched reviewed policy identity. Pure synthetic test values
never enter deployment `.env` files. Secrets must not be exposed through
`NEXT_PUBLIC_*`, artifacts or evidence. Changes to public settings, headers or the
checked-in facts/prose require a fresh build; environment changes cannot relabel
an existing staging bundle into production.

Policy publication uses checked-in `src/lib/policy-facts.json` and
`src/lib/policy-content.json`, with no policy environment variable or external
absolute file dependency. Follow [review and activation](legal/launch-policy-review.md)
for real facts, digest, immutable archives, CAS pointer and notices. Current facts
are draft/unresolved, so actual public readiness remains blocked.
