# Auth, profile, and administrator MFA launch evidence

A4 implements the local software path. Actual Google and Kakao account/provider verification is **UNVERIFIED**, pending D2 operator accounts, hosted Supabase project, redirect domain, and provider configuration. Local password/email accounts are disposable integration fixtures and are never evidence that Google or Kakao works.

## Current behavior

- Session refresh forwards new cookies to the same request and response, preserving Supabase SSR's Cache-Control, Expires, and Pragma headers. Every callback redirect is private/no-store and uses a sanitized relative Location. Installed NextURL normalizes loopback hosts to localhost; avoiding absolute reconstruction preserves host-only cookies on the actual browser origin.
- Successful PKCE exchange reads the trusted profile. An incomplete display name goes through `/dashboard/profile` and then the sanitized original destination. The form writes only its authenticated user's display name and optional city. Contacts use confirmed Auth email; changing a profile email cannot change the applicant contact returned to employers.
- `getAuthProfileForUser` reads role, account status and display name together. Missing or invalid profiles fail closed. Only the current session's exact AAL2 grants admin privilege; factor enrollment alone does not.
- `/account/security` supports TOTP enrollment, abandoned enrollment recovery, challenge, verification errors, and verification with an existing factor. QR/secret/code material exists only in browser memory. A new navigation after success makes the server read the upgraded cookies.
- Route guards and the database require an active AAL2 admin. The message-thread SECURITY DEFINER exception also uses `is_admin()`. Trusted service-role maintenance remains outside user flows.
- Disabled providers and phone setup notices are hidden. The example flags remain false. Google must be configured and verified for launch; Kakao remains off until its full D2 matrix passes; Naver and Phone remain false.
- Local dev-cookie admin sessions synthesize AAL2 only behind the existing non-production/unconfigured kill-switch. Dev seeker/employer sessions synthesize AAL1. There is no simulated MFA enrollment screen.

## Hosted settings and trusted operations

Enable Supabase TOTP enrollment and verification in the hosted project's Auth MFA settings, and apply migration `20260909000100_profile_and_admin_security.sql`. The isolated local configuration explicitly enables `[auth.mfa.totp] enroll_enabled = true` and `verify_enabled = true`. Its extra callback on port3100 is only for the disposable browser test app; hosted redirects must use the operator's actual approved domain.

The first admin is a trusted bootstrap operation: identify the intended verified Auth account through the operator's controlled admin tooling, set that profile's role to admin and status to active, then have that account enroll and verify through `/account/security`. The role by itself cannot enter admin routes or perform admin DB operations.

Lost authenticator recovery is also a trusted operator process, never a public role/factor-reset form. Independently verify the account owner, suspend the profile to stop admin database privileges immediately, revoke its sessions and remove the lost factor using Supabase's trusted admin tooling, then restore active status and have the owner sign in and enroll again. AAL1 still cannot perform admin work during reenrollment. Record the approval and completion in the operator's restricted audit record; keep secrets and recovery material out of logs, tickets and source control. No production bootstrap or recovery was performed for A4.

Count legacy phone-only accounts using a trusted, read-only database connection:

```sql
select count(*) as phone_only_auth_accounts
from auth.users
where nullif(phone, '') is not null and nullif(email, '') is null;
```

Local disposable-stack result on 2026-09-09: **0**. Hosted inventory remains **UNVERIFIED**. Hand the count to the operator for a controlled migration inventory; do not delete, link or export account identifiers as part of this check.

## Reproducible local checks

Use Node22 (`.nvmrc`) and the isolated `albalmon-ca-launch` stack only. The existing [RLS matrix](rls-matrix.md) documents startup and public build variables. After applying the new local migration:

```bash
npm test -- tests/auth-session-refresh.test.ts tests/profile-actions.test.ts tests/auth-production-safety.test.ts tests/auth-redirect-safety.test.ts
npm run test:db
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

The auth browser tests additionally read the local CLI service-role key directly into the test process for disposable-user setup/cleanup. They never pass that key to the app build, app runtime, or browser. They refuse a URL other than `http://127.0.0.1:55321`. Random passwords, session material, mail links and TOTP values are generated/read only at runtime. Tests clear the page before teardown to prevent failure artifacts from retaining QR material, delete their local mailbox messages/users, and keep tracing/screenshots/video off. Do not turn on traces for these tests or run them against a hosted project.

Local tests cover profile save/self-ID binding, duplicate display names remaining distinct accounts, safe apply-page return, a due-for-refresh session, real PKCE code exchange and onboarding, private invalid/canceled callback redirects, TOTP enrollment/wrong-code retry, admin AAL1 denial/AAL2 success, sign-out, and existing-factor verification after another sign-in. The pgTAP matrix covers active/suspended/AAL states, representative admin writes/RPCs, trusted status changes, message isolation, and confirmed/current Auth applicant email.

## D2 real-provider proof still required

| Scenario | Google | Kakao |
| --- | --- | --- |
| New signup and profile completion | UNVERIFIED | UNVERIFIED; flag off |
| Returning login and expired session | UNVERIFIED | UNVERIFIED; flag off |
| Consent cancellation and invalid callback | UNVERIFIED | UNVERIFIED; flag off |
| Original apply-page return and logout | UNVERIFIED | UNVERIFIED; flag off |
| Distinct accounts with the same display name | UNVERIFIED | UNVERIFIED; flag off |
| Admin AAL1 denial and AAL2 success | UNVERIFIED | UNVERIFIED; flag off |

A4 does not select or purchase a brand/domain, create hosted provider credentials, enable unverified providers, or claim hosted recovery proof.

Sources: [Supabase TOTP flow](https://supabase.com/docs/guides/auth/auth-mfa/totp), [current authenticator assurance level](https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel), [passwordless email and PKCE](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Mailpit API](https://mailpit.axllent.org/docs/api-v1/), and installed Next16.3.4 Proxy/cookies/redirect documentation.
