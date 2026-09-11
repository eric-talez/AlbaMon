# K-Work US 출시 정책 검토 / Launch policy review

Status: **DRAFT — UNVERIFIED; not public launch approval.** Version `ca-launch-v1`.
The user has not selected a legal operator, public address, support mailbox,
domain, effective date, age/retention policy or legal reviewer. Candidate names
Albagugu/Albaguwon are not operational identities. Default product remains K-Work US.

## One deployable publication contract

`src/lib/policy-content.json` contains the four complete Korean-first drafts and
key English notices. `src/lib/policy-facts.json` is the versioned **public** facts
and decisions manifest. Both are checked in and statically imported by
`src/lib/policy-publication.mjs`; Next bundles them for policy pages/footer, and
`scripts/check-release-env.mjs` consumes exactly the same validator. No local
absolute path, ignored facts file, or extra policy environment variables are
needed in Vercel. Keep private legal advice, identity documents and credentials
outside this manifest. `review.evidenceReference` is only an opaque record ID.

All fields under `facts` must contain real reviewed publication text. These
include operator/legal name and mailing address; working support/privacy mailbox;
effective date (YYYY-MM-DD); controlling language; age/minor eligibility policy;
appeals, termination and notice procedures; dispute/liability decisions; important
change notices; category-specific retention/deletion/hold rules; verified-account,
authorized-agent, inaccessible-account, response and appeal procedures; actual
tracking/sale/sharing/DNT/GPC facts; deployed processors and settings; reviewed
legal applicability. Provide understandable Korean and key English in those
values. Null/blank/template values fail closed. No age gate, retention period,
arbitration waiver or legal applicability is chosen by this implementation.

After owner decisions and external review:

1. Update the public facts and prose together. Check current implementation,
   actual deployment region/logs/cookies/providers, working support contact and
   scoped privacy workflow against every public statement. Attach the private
   review decision, scope, date and responsible reviewer to a protected evidence
   record. Do not copy private correspondence into source or the website.
2. Have the reviewer approve the **complete facts and prose bundle**. Set
   `review.completedAt` and an opaque `review.evidenceReference` to that real
   record, and set `status` to `reviewed` only after that approval.
3. Compute the exact digest from the reviewed final version/facts/content:
   `node --input-type=module -e 'import { policyBundleHash } from "./src/lib/policy-publication.mjs"; console.log(policyBundleHash())'`.
   Record it as `review.bundleSha256` and in the protected review record. A fact
   or prose change invalidates the digest. This is integrity checking, not an
   automated proof that legal review occurred or that the service complies.
4. Run `npm run build:release` with the existing real A2/C1 settings documented
   in `.env.example`. The standalone check runs before Next's production runtime;
   C1's runtime-only delivery guard remains separate. A successful no-secret
   `npm run build` intentionally does not grant public readiness.
5. Verify the actual hosted policy text and support channel, Google smoke,
   provider/DNS/inbox/webhook evidence and hosted privacy rehearsal. Commit the
   reviewed manifest with the release. Rebuild on policy changes; static policy
   pages are not updated merely by changing hosting environment variables.

`tests/fixtures/policy-publication.mjs` is explicitly synthetic, imported only by
tests. It is never loaded by the CLI or the pages. Synthetic gate passes and local
consent records are mechanics evidence, not actual approval of draft policies.

## Decisions requiring owner and external review

| Review item | Required decision / evidence | Current state |
| --- | --- | --- |
| Legal identity/contact/domain | Real operator, public address and working request mailbox; verified ownership | UNVERIFIED |
| Age and effectiveness | Eligibility/minors, enforcement changes if needed, controlling language and effective date | UNVERIFIED |
| Terms and moderation | Party roles, agency/platform status, third-party posting responsibility, suspension/termination, appeal channel/window, emergency actions, disputes/liability, change notice | UNVERIFIED |
| Privacy regimes | CalOPPA and CCPA applicability using actual business/data facts; sale/sharing, signals, rights procedures and any additional product work | UNVERIFIED |
| Retention and erasure | Category/period/trigger/hold/disposal schedule for Auth, profiles, company/jobs, applications/messages, reports/audits, outbox/receipts, exports, backups and provider logs | UNVERIFIED |
| Linked-record preservation | Legal purpose and reviewed treatment of each participant's records, then necessary schema/access changes and staging proof | UNVERIFIED |
| Deployment processors | Vercel, Supabase and Resend actual use, region, contracts/subprocessors, cookies and logs; only actually active identity providers | UNVERIFIED |
| Privacy operations | Verified-account evidence, agents/inaccessible accounts, response/appeal procedures, protected delivery, completion and export disposal | Local tooling rehearsed; hosted/operational evidence UNVERIFIED |

## Wage and posting review

All postings supply a good-faith range/unit as **platform policy**. Do not infer
that every employer is legally subject to the same statutory posting threshold.
No California general-base-rate-only approval exists. Before approval, the operator
records job ID, actual workplace city/county, applicable date, industry/facility
(including possible fast-food/healthcare rules), pay unit and hours, tips separate
from basic pay, training/work time, commission/piece-rate details where relevant,
classification/exemption issues, official URL/check date, decision and unresolved
questions. Put the evidence reference in the existing controlled review record;
use the existing job review reason for rejection/pause without personal reporter
information. Hold unclear cases for explanation and qualified review. Do not use
keyword screening or the software's positive numeric checks as a wage verdict.

## Primary references checked 2026-09-10 (drafting sources, not a sufficiency opinion)

- [CA DIR Pay Transparency FAQ](https://www.dir.ca.gov/dlse/California_Equal_Pay_Act.htm): employer coverage and required pay-scale content; platform policy is stated separately.
- [CA DIR Minimum Wage](https://www.dir.ca.gov/dlse/minimum_wage.htm): state, local and industry distinctions. Check the current workplace-specific rule on the actual approval date.
- [Fast Food FAQ](https://www.dir.ca.gov/dlse/Fast-Food-Minimum-Wage-FAQ.htm), [Health Care FAQ](https://www.dir.ca.gov/dlse/Health-Care-Worker-Minimum-Wage-FAQ.htm), [classification FAQ](https://www.dir.ca.gov/dlse/faq_independentcontractor.htm): operator lookup sources, no universal classification conclusion is encoded.
- [EEOC National Origin](https://www.eeoc.gov/national-origin-discrimination): national-origin discrimination and job-related language considerations.
- [USCIS I-9 instructions](https://www.uscis.gov/sites/default/files/document/forms/i-9instr.pdf): employer/new-employee verification and employee choice of acceptable documents. No I-9 collection feature is provided.
- [USCIS Students and Employment](https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/students-and-employment) and [ICE SEVIS Employment](https://www.ice.gov/sevis/employment): direct users to DSO/official guidance, without a personal CPT/OPT or work-authorization ruling. Direct USCIS/ICE fetches were unavailable during this pass; official USCIS I-9 and ICE SEVIS search-index excerpts were available. Recheck the live official pages during final external review.
- [CA AG CCPA](https://oag.ca.gov/privacy/ccpa), [CalOPPA §22575](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22575.), [Government Code §12946](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=GOV&sectionNum=12946.): external review agenda. Do not copy an employment-record period into the platform's retention schedule without determining legal status, scope and exceptions.

Read the actual four rendered pages and `docs/operations/privacy-requests.md`
together. Browser assertions prove pages and actions render/work; they cannot
prove legal adequacy, translation equivalence, a reviewed retention strategy, or
a public release decision.
