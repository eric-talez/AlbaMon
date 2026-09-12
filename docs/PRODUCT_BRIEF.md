# K-Work US — Product brief

The [California public-launch design](superpowers/specs/2026-09-09-california-launch-design.md)
is the current scope. The original Version0.1 PDF and numbered Slice notes are
historical planning material, not launch authority.

K-Work US is a mobile-first hiring marketplace for California workplaces, with
Korean-first UI and key English guidance. Seekers and employers both use it free.
Community specialization and job-related Korean ability requirements are allowed;
nationality or ethnicity restrictions are not. The operator, domain and reviewed
public policy facts remain unselected; implementation is not public launch approval.

The core journey is browse → sign in → explicitly acknowledge policies → apply →
message → manage interview/offer status. Employers request access, maintain a
company, submit compliant pay/location information for review, and manage the
publication lifecycle and applicants. Active administrators use TOTP/AAL2 for
review, reports, suspensions and aggregate marketplace signals. Offered status
is not evidence of a completed hire.

Public jobs use one canonical predicate: California, approved, unexpired and
eligible owner. Approval records real publication/expiry; unknown historical
dates are not invented. Search supports city/category/type/language/pay/sort and
pagination. Public sitemap/structured data use the same actual public records.

Next.js App Router, TypeScript, Tailwind and Supabase Auth/Postgres/RLS remain the
stack. Verified sessions and current database roles authorize callers; form role
values and user metadata do not. Writes enforce ownership, active status, policy
identity, concurrency and audit rules at the database boundary. Production builds
and runtimes never publish samples. Trusted notification workers use the outbox,
Resend and signed webhooks; real provider delivery is still unverified. Production
security headers complement the database authorization boundary. Ordinary
business writes use database quotas without a service-role preflight; phone
sign-in remains disabled for this launch. Separate hermetic development browser
coverage supplements the real local production/Auth/DB journeys.

Policies use version `ca-launch-v1` plus a draft/reviewed bundle identity. Operator
facts, complete prose and external review must align with a service-controlled CAS
current pointer; prior acceptance evidence is retained. Filling facts requires a
reviewed publication workflow, not changing historical migrations or bulk consent.
See [policy review](legal/launch-policy-review.md).

Payments/boosts, nationwide expansion, AI matching, resume file upload, realtime
chat, payroll and individual work-eligibility determinations are excluded from
the first launch. Existing unused boost schema is retained for compatibility.

[Deployment](DEPLOYMENT.md), [launch checklist](LAUNCH_CHECKLIST.md) and
[actual environment evidence](launch-evidence/environments.md) define readiness.
The final D2 verification/fault/restore campaign and actual hosted/provider/legal/
physical-device gates remain separately recorded. Local tests establish software
behavior; they cannot select the operator or approve a public launch.
