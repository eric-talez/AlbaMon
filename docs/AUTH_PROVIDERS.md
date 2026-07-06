# Auth providers — social login & phone OTP (Slice 19)

How K-Work US signs users in beyond the dev role-picker: KakaoTalk, Google,
and Naver OAuth plus phone-number OTP, all through **Supabase Auth** — the app
never talks to Kakao/Google/Naver/SMS vendors directly and never handles OAuth
tokens or one-time codes itself.

Everything ships **disabled by default**. CI, local dev, and production behave
exactly as before until you both configure a provider in the Supabase
dashboard *and* flip its public flag. CI requires no OAuth or SMS credentials.

## 1. Provider matrix

| Method | Registry key | Supabase provider | Flag (default `false`) | Status in this build |
|---|---|---|---|---|
| KakaoTalk | `kakao` | `kakao` (built-in) | `NEXT_PUBLIC_AUTH_KAKAO_ENABLED` | Implemented — needs dashboard setup |
| Google | `google` | `google` (built-in) | `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | Implemented — needs dashboard setup |
| Naver | `naver` | `custom:<slug>` (custom OIDC) | `NEXT_PUBLIC_AUTH_NAVER_ENABLED` + `NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID` | Implemented via custom OIDC — **setup-required by default**, see §5 |
| Phone OTP | — | Supabase Phone Auth | `NEXT_PUBLIC_AUTH_PHONE_ENABLED` | Implemented — needs Phone provider + SMS vendor in Supabase |
| Dev role-picker | — | — | — | Unchanged; non-production + unconfigured Supabase only |

The registry (`src/lib/auth/providers.ts`) is the single allowlist: only the
keys above resolve to a Supabase provider string, and only while enabled.
Unknown or user-influenced strings never reach
`supabase.auth.signInWithOAuth`.

## 2. Enablement model

A method renders as clickable only when **all** of these hold, otherwise the
button shows a calm "setup required" state (never a crash):

1. Its `NEXT_PUBLIC_AUTH_*_ENABLED` flag is exactly the string `true`
   (anything else — `1`, `TRUE`, empty — counts as off).
2. Supabase itself is configured (real `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, not the `.env.example` placeholders).
3. For Naver: `NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID` contains a valid slug
   (lowercase `[a-z0-9_-]`, max 63 chars — anything else is ignored).

Notes:

- The flags are **public booleans, not secrets**. Real client IDs/secrets and
  SMS credentials live only in the Supabase dashboard — never in this repo,
  Vercel env, or CI.
- `NEXT_PUBLIC_*` values are inlined into the client bundle at build time.
  Changing a flag requires a rebuild/redeploy (Vercel redeploys on env change).
- In dev-auth mode (non-production + placeholder Supabase values) every
  method is setup-required and the dev role-picker remains available — that
  mode is unchanged by this slice and stays impossible in production.
- During a basic **local Supabase** DB smoke
  ([`LOCAL_SUPABASE.md`](LOCAL_SUPABASE.md)), keep all `NEXT_PUBLIC_AUTH_*`
  flags `false`: every method then renders its "setup required" state by
  design (no crash, no dead button). Enable a flag locally only after
  configuring that provider — or use the guide's phone test-OTP appendix,
  which needs no real credentials.

## 3. Auth flow

- **Social**: button → `supabase.auth.signInWithOAuth({ provider, options: {
  redirectTo } })` → provider consent → Supabase → `GET /auth/callback?code=…`
  → `exchangeCodeForSession(code)` → redirect to the sanitized `next` path
  (default `/dashboard`). No token exchange is hand-rolled.
- **Phone OTP**: `signInWithOtp({ phone })` sends the SMS via the provider
  configured in Supabase; `verifyOtp({ phone, token, type: "sms" })` verifies
  and sets the session. The app never stores codes and never logs phone
  numbers or codes; resend is rate-limited in the UI with a 60-second
  cooldown (Supabase applies its own server-side limits too).
- **Roles**: any first sign-in (social or phone) triggers the existing
  `on_auth_user_created` trigger, which provisions a `profiles` row with role
  `seeker` (`profiles.email` is nullable, so phone-only accounts are fine).
  Authorization continues to read **`profiles.role` only** — never
  `user_metadata`.
- **Meaning of phone verification**: it confirms control of that phone number
  at sign-in time — nothing else. It is not identity, work-authorization,
  age, or background verification, and UI copy must never imply that.

## 4. Redirect safety

The `?next=` return path is attacker-suppliable, so every consumer runs it
through `sanitizeNextPath` (`src/lib/auth/redirect.ts`); invalid values fall
back to `/dashboard`. Accepted: same-site relative paths only. Rejected:
absolute URLs, protocol-relative `//host`, backslash variants (`/\host` —
URL parsing treats `\` as `/`), and paths containing ASCII control characters
(the URL parser strips tab/LF/CR, which would re-open the `//` bypass).

**Supabase dashboard requirement**: the OAuth `redirectTo` sometimes carries
`?next=…`, so the redirect allowlist (Supabase → Authentication → URL
Configuration) must include wildcard entries:

- `https://<your-domain>/auth/callback*`
- `http://localhost:3000/auth/callback*` (local testing)

Without the `*`, Supabase silently falls back to the Site URL and the return
path is dropped.

## 5. Per-provider Supabase setup

All of this happens in the Supabase dashboard and the provider consoles —
no code changes, no repo secrets.

### KakaoTalk (`kakao`, built-in)

1. Create an app in the Kakao Developers console; enable Kakao Login.
2. Register the Supabase-provided callback URL
   (`https://<project-ref>.supabase.co/auth/v1/callback`).
3. Copy the REST API key + client secret into Supabase → Authentication →
   Providers → Kakao, and enable it.
4. Set `NEXT_PUBLIC_AUTH_KAKAO_ENABLED=true` and redeploy.

### Google (`google`, built-in)

1. Create an OAuth client (web) in Google Cloud Console.
2. Register the same Supabase callback URL as the authorized redirect URI.
3. Copy client ID + secret into Supabase → Authentication → Providers →
   Google, and enable it.
4. Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` and redeploy.

### Naver (`custom:<slug>`, custom OIDC) — deferred-by-default

Naver is **not** a built-in Supabase provider. The app implements it through
Supabase's supported custom OIDC provider mechanism: register a custom
provider in Supabase (Authentication → Sign In / Providers → custom/OIDC),
give it a slug (e.g. `naver`), and the app passes `provider: "custom:<slug>"`
to `signInWithOAuth` — type-safe, no fake providers, no hand-rolled token
exchange.

**Caveat (why this ships setup-required):** Supabase custom OIDC requires an
OIDC-compliant issuer (discovery document, `id_token` support). Verify
Naver's current OIDC support end-to-end in a staging project before enabling;
if Naver Login cannot satisfy Supabase's custom-OIDC requirements, keep the
button in its setup-required state — do not work around it in app code.

1. Register the app at Naver Developers (Naver Login) with the Supabase
   callback URL.
2. Create the custom OIDC provider in Supabase with Naver's issuer/client
   credentials; note its slug.
3. Set `NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID=<slug>` and
   `NEXT_PUBLIC_AUTH_NAVER_ENABLED=true`, redeploy, and smoke-test a full
   sign-in before announcing it.

### Phone OTP (Supabase Phone Auth)

1. Supabase → Authentication → Providers → Phone: enable, and connect an SMS
   provider (Twilio, MessageBird, Vonage, …). **The SMS credentials are
   entered in the Supabase dashboard only** — this repo deliberately has no
   SMS SDK dependency.
2. Review Supabase's SMS rate limits and OTP expiry defaults.
3. Set `NEXT_PUBLIC_AUTH_PHONE_ENABLED=true` and redeploy.
4. Smoke-test send + verify with a real number (see
   [`BETA_READINESS.md §17`](BETA_READINESS.md#17-social--phone-auth-verification)).

## 6. Testing & CI

`npm test` covers the registry allowlist (unknown/disabled providers never
resolve), flag parsing, Naver slug validation, redirect sanitization (incl.
the callback route), phone number/OTP validation, the exact Supabase call
shapes (`signInWithOtp({ phone })`, `verifyOtp({ phone, token, type: "sms" })`
via injected fakes), setup-required rendering, and that the dev role-picker
still works in unconfigured mode. None of it contacts a real provider, so CI
stays credential-free.
