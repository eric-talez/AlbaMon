# 실행 및 검토 종료 기록

작성일: 2026-09-11. **로컬 구현과 최종 수정 검토 완료. 실제 공개는 NO-GO.**

후속 최신 main 통합과 새 검증은 [main 통합 기록](main-integration.md)을 참고하세요. 아래는 통합 전 소스의 종료 기록입니다.

## 검증된 코드와 문서

- 작업 브랜치: `codex/california-public-launch`. 원본 main 기준: `c8de0c83b9bbf6d3c34488eaf030e0df3ac630ef`.
- 최종 앱 코드: `63e4632d6f24ce77e4e42072a0e0b8621997c443`; 증거 문서: `212daefc7efeac42288a53825df66381e37cbe3b`. 이 종료 문서는 실행 기록만 추가한다.
- 새 최종 단위 검사: **775 PASS + 6 opt-in skip**. 타입 생성/검사, 린트, 로컬 운영 모드 빌드 통과.
- 빌드 ID: `p4JJKo0sM6tFRBxD9shd_`; 889개 파일의 디렉터리 manifest SHA-256: `9da0ca1d2fec4f36a1444254dc062735ad7b1c6c511747c96fbcc9e54f48814f`. 실제 hosted 배포나 archive digest가 아니다.
- D2의 기존 DB 원본/복원 각498, 브라우저27, 실제 로컬 Auth 복원, 별개 오류 artifact→이전 artifact 복귀 증거는 해당 source/artifact 결과로 보존한다. 새 빌드의 동일 캠페인 재실행으로 표시하지 않는다.
- 실제 `build:release`는 미정 SITE_URL에서 차단됐다. 운영 정보/정책/계정/도메인/호스팅/발송/공개 판단은 완료로 표시하지 않는다.

## 검토와 수정

14개 로컬 구현 단계의 spec/quality gate를 완료했다. 전체 브랜치 검토는 `c8de0c8..2632255`, 24개 커밋·247개 파일·27,056개 diff 행을 대상으로 수행됐다. Critical0, Important2, Minor1의 새 findings를 한 번의 수정 묶음으로 처리했다.

| 항목 | 수정 | 최종 scoped 판정 |
|---|---|---|
| I-1 staging 검증 실패 후 push 진행 | fail-fast subshell, 승인 SHA/ref/manifest/dry-run receipt 재검증 | ADDRESSED |
| I-2 일반 Production 배포 우회 명령 | 중복 명령 제거, 강화된 D3 절차로 통일 | ADDRESSED |
| M-1 공고 게시/만료 raw UTC 표시 | America/Los_Angeles PT·DST 화면 표시와 원본 dateTime 보존 | ADDRESSED |

검토 후 수정 검사는 49개 focused PASS, 그 뒤 새 전체775 PASS다. 겨울·여름 UTC 자정 부근의 실제 페이지 렌더링과 staging shell의 실패·정상 경로를 확인했다. 최종 scoped review는 `2632255..212daef`만 대상으로 수행됐으며 I-1/I-2/M-1 모두 ADDRESSED, 새 Critical/Important/Minor 0건으로 종료됐다. 기존 비차단 후속 항목과 공개 조건은 아래에 별도로 유지한다. 전체 브랜치 검토자 final_branch_review, 단일 수정 담당 final_fix_wave, 최종 scoped 검토자 final_scoped_review의 보고서를 controller가 모두 읽고 판정했다. 새 전체 검토나 변경 없는 검사 캠페인을 반복하지 않았다.

## 남은 항목과 운영 경계

계획의82세부 항목은53완료/29실제 환경·대표 확인 대기다. 최대 검색 페이지 경계와 직접 RPC 입력 처리 차이, 공고별 openness 조회 fanout은 launch 규모에서 비차단 후속 항목이다. 이전 브라우저 실행의 stream 경고5건은 원인·영향 미해결이며 공개 전 영향 확인/판단이 필요하다. 고쳐졌다고 표시하거나 로그를 숨기지 않았다. 원본 attempt5 DNS 로그 유실과 C3 로컬 fixture의13개 updated_at 변경은 되돌렸다고 주장하지 않는다.

실제 운영 정보·계정·법률 검토·발송·Google·hosted Protection/cron·실제 복원/rollback·RPO/RTO·iOS·실제 공고·대표 공개 결정·24시간 관찰은 별도 운영 게이트다. [배포 인계서](production-release.md), [최종 검사](release-candidate.md), [복원 기록](restore-drill.md), [첫30일 운영](../operations/first-30-days.md)을 따른다.

## 작업 정리

controller가 `supabase stop --project-id albalmon-ca-launch`를 실행해 소유한553xx 검증 stack만 중지했다. DB/storage Docker volume 두 개는 보존됐고 restore563xx 자원은 남지 않았다. 기존 k-work-us DB는 running/healthy이며 native5432도 그대로 실행 중이다.3100/553xx/563xx listener는 없다. 원본 main은 c8de0c8, 미추적 .idea 및 docs/superpowers 문서도 보존됐다.

최종 source와 .next 빌드, feature branch/worktree를 보존한다. 이 계획의 임시 SDD 자료는 검사/검토 결과와14개 결정 기록을 이 문서 및 기존 증거 문서에 보존한 뒤 제거했다. 다른 계획의 작업 자료는 건드리지 않았다. 병합·push·PR·실제 배포는 수행하지 않았다. 새 기능/소스 변경 없이 종료 기록만 추가하며, 통합 방식은 사용자가 결정한다.

## 실행 중 결정과 변경 비용

1. 원본 파일을 보존하려고 별도 worktree를 사용했습니다. 결과 확인에는 해당 작업 폴더로 이동해야 합니다.
2. 실행 도구용으로 계획의 작업 번호만 정규화했습니다. 문제가 있으면 원본 작업 문구와 다시 대조해야 합니다.
3. 보안 DB 검사는 관련 기능이 생기는 단계별로 확장했습니다. 누락 여부는 최종 통합 검사에서 확인해야 합니다.
4. 운영 주체·연락처·정책 정보가 실제로 정해지기 전에는 공개 출시를 막도록 했습니다. 공개 전에 대표님이 실제 값을 확정해야 합니다.
5. 공개 주소는 HTTPS와 DNS 도메인만 허용했습니다. 향후 IP 주소로 배포하려면 검증 규칙을 다시 검토해야 합니다.
6. 실행·검증 기준을 Node22로 통일했습니다. 개발 환경에서도 Node22를 선택해야 합니다.
7. 검색어를 문자 그대로 처리하는 작은 DB 함수를 추가했습니다. 이 SQL 인터페이스를 함께 유지해야 합니다.
8. 오류 복구에 설치된 Next의 retry API를 사용했습니다. Next 변경 시 API를 다시 확인해야 합니다.
9. 답변 시간과 미응답 수는 같은 7일 지원 집단으로 계산했습니다. 지표 정의가 바뀌면 쿼리·검사·설명과 과거 비교를 함께 바꿔야 합니다.
10. 여러 관리자에게 가는 알림은 수신자별로 중복을 판정했습니다. 키 형식을 변경할 때 재처리·중복 방지 규칙도 함께 바꿔야 합니다.
11. 정책 버전명과 별도로 실제 내용의 식별값을 저장했습니다. 정책 변경 시 명시적 재동의와 DB·배포 버전 일치가 필요합니다.
12. 출시 성과 지표는 캘리포니아 근무지 공고만 포함하며 마감된 게시 이력도 보존합니다. 전국 과거 수치와 비교하려면 별도 지표나 설명 변경이 필요합니다.
13. Vercel의 기본 Preview는 staging, Production은 운영 설정만 허용했습니다. 별도 staging 프로젝트에서 Production 예약 실행을 쓰려면 프로젝트 식별에 기반한 배포 규칙을 추가 검토해야 합니다.
14. 최대 페이지 경계·공고별 조회 호출·원인 미확인 스트림 경고는 병합 후속 항목으로 유지하되 스트림 영향 확인은 공개 조건으로 남겼습니다. 공고 규모가 커지거나 실제 탐색 실패가 확인되면 공개 전에 추가 수정이 필요합니다.

## 원본 Ruling 기록 — 결정 순서

- Use isolated git worktree with local .git/info/exclude — preserve original untracked .idea and plan documents without committing on main — cost if wrong: user switches to named worktree for review.
- Normalize task headings into this workspace to use numeric task-brief script — source headings use A1/B1 labels and bundled scripts are not executable, so invoke via bash with explicit output paths — cost if wrong: compare brief against source task.
- Implement A3 matrix incrementally with A4/C2 security additions — those columns/RPCs do not exist before their tasks — cost if wrong: cross-task missing coverage found during D2.
- Require real operator/contact/policy settings at release, and keep unverified external steps visibly pending — facts/accounts cannot be invented; user asks ability to deploy — cost if wrong: owner must supply settings before public release.
- enforce the public HTTPS hostname requirement beyond the plan's illustrative localhost/127.0.0.1 regex; reject localhost names and literal IP hosts — public Vercel/domain release needs a DNS hostname and this avoids incomplete private-IP ranges — cost if wrong: intentional future IP-address deployment needs a reviewed relaxation.
- pin remaining verification and project runtime to existing CI Node22, using per-command PATH override plus .nvmrc/engines in A3 — avoids worktree defaultNode25 masking CI differences — cost if wrong: local users must select supportedNode22 rather than defaultNode25.
- preserve literal keyword semantics in the DB when removing client post-filter; permit a minimal parameterized public-view RPC if raw PostgREST OR/ILIKE cannot represent it — actual * wildcard and comma/parenthesis errors reproduced, spec requires DB/mock parity and stable pagination — cost if wrong: one additional small SQL API to maintain; no new search service/library.
- use installed Next16.3.4 retry() for error-boundary data recovery instead of the plan sample reset() — installed error.md and runtime error-boundary.js prove retry refreshes while reset only clears state — cost if wrong: adapt the boundary API if the pinned Next version later changes.
- define first-reply median and unanswered count over the same eligible applications used by the mature-posting seven-day cohort, with replies observed through the report reference time — plan specifies the numerator but leaves reply population/window unstated, and a shared population makes metrics comparable — cost if wrong: changing the metric population requires query/test/copy changes and historical comparisons must be relabeled.
- include recipient identity in deduplication keys when one business event fans out to multiple active admins — event_key is globally unique, so ID/type/time alone would drop all but one recipient — cost if wrong: notification event-key format and replay/dedup expectations must be migrated together.
- Preserve mandated ca-launch-v1 version names and add draft/reviewed bundle-SHA acceptance identity with nullable profile/job identity fields and a service-controlled CAS current DB pointer — identical versions alone cannot distinguish materially changed content; direct API and app checks must bind the same actual current content, with no acceptance backfill — cost if wrong: D1 must coordinate reviewed pointer activation with the matching build and D2 must verify matched pointer/artifact rollback; later policy changes require explicit reacknowledgement.
- Scope C4 launch-performance cohort to CA workplace jobs in the mature latest-publication window, retaining closed/expired history and the existing applicant/reply rules — the brief's posted_at-only SQL omits geography, while the metric evaluates the CA-only launch; other-state legacy rows must not dilute it — cost if wrong: comparisons with all-state historical totals need relabelling or a separate metric; no data is rewritten.
- Enforce the current Vercel Preview→staging and Production→production mapping in both directions; treat a separate staging project's Production deployment as an unselected future topology requiring an explicit project-bound mapping — deriving the environment only from copied EMAIL_ENVIRONMENT can silently connect the main Production deployment to staging, and no separate staging project has been chosen — cost if wrong: intentional staging-on-Production scheduling needs a reviewed target-identity extension before it can deploy.
- Keep bounded invalid-pagination differences, per-owned-job openness RPC fanout, and the unproven destination-stream warnings as nonblocking merge follow-ups; keep stream impact an explicit public-Go evidence gate — full branch review found no demonstrated authorization/data-loss defect in these items and further speculative broad reruns are not justified — cost if wrong: navigation beyond10000matches, largerownerinventories, or a real affected navigation can require corrective work before public launch.
