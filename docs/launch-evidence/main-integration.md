# 최신 main 통합 검증 — 2026-09-11

사용자 요청: 로컬 main 병합 및 원격 main 대상 PR 생성. 실제 hosted 배포는 실행하지 않았다.
기존 [실행 종료 기록](execution-closure.md)의 검증 결과는 해당 소스의 기록으로 보존하며,
이 문서는 그 후 들어온 upstream 19개 커밋을 통합한 결과다.

최종 상태는 아래 **Slice31 후속 통합**을 함께 확인한다. 첫 검증 묶음은 main `aa48d6c` 기준이다.

## 병합 범위와 충돌 해결

- 출시 브랜치 부모: `a4dab8645f51d6309af10fed3df73d635c9c8dbf`.
- 통합한 origin/main: `aa48d6c1fa66e87c10b6cd9ccc52955183078173`.
- 회사 정보 비공개화, 보안 헤더, 관리자 감사, private 요청 카운터, 개발 모드 브라우저 테스트를 반영했다.
- 보안 헤더와 staging noindex를 함께 적용했다. 현재 Next/React/Playwright 잠금 버전은 유지했다.
- 공고 승인은 현재 정책·AAL2·revision·사유·만료를 검사하는 `transition_job`을 유지한다.
  과거 `moderate_pending_job`은 새 forward migration에서 실행 권한을 제거하고 호출도 거부한다.
- 회사·신고·고용주 요청 RPC는 행 잠금을 유지하며, 기존 September 트리거가 감사 로그를
  같은 트랜잭션에서 한 번만 기록한다. 감사 실패 시 실제 변경과 역할 승격도 롤백된다.
- 일반 사용자 쓰기는 기존 DB quota를 유지한다. 이 경로에 service-role 카운터를 추가하지 않았다.
  전화 OTP는 개발용 기능으로 보존하며 production/preview UI·Server Action·release gate 모두 차단한다.
- `test:e2e`는 실제 로컬 DB + production 서버, `test:e2e:dev`는 DB 없는 개발 모드다.
  CI에서 두 모드를 각각 실행한다. 실제 인증 테스트에는 세션을 담는 trace/video를 기록하지 않는다.
- DB runner는 pgTAP과 예외 기반 Slice SQL 검사를 각각 실행한다. 포함 파일은 pgTAP 디렉터리에
  함께 두고 동시성 검사는 현재 DB의 TCP 주소를 사용한다.

## 이번 통합의 실제 검증

| 검사 | 결과 |
|---|---|
| Node 22.23.1 전체 단위 검사 | 924 PASS, 6 opt-in skip |
| Next 타입 생성, TypeScript, ESLint | PASS |
| 잠금 의존성 npm audit | 모든 등급 0 |
| 로컬 DB에 연결한 production build | PASS, build ID `5eEvywSe_G6tJSZ6FczOo` |
| 실제 로컬 Auth/REST/브라우저 | 27 PASS |
| 개발 모드 desktop/mobile 브라우저 | 31 PASS |
| 로컬 메일 provider double 및 서명 webhook | 5 PASS |
| 새 DB 25개 마이그레이션 | pgTAP 498 PASS + Slice25/27/28 전 사례 PASS |
| 기존 21개 DB → 누락 July 3개 + 호환 1개 적용 | pgTAP 498 PASS + Slice25/27/28 전 사례 PASS |
| 오프라인 문서 검사 | beta 9/9, local Supabase 7/7 PASS |

새 DB의 호환 수정 전 24개 스키마에서 Slice27 D가 실제로 실패했다:
`expected exactly 1 audit row, found 2`. 호환 마이그레이션 적용 후 같은 검사를 통과했다.
레거시 API 거부, AAL1·정지·정책 미동의 거부, 감사 오류의 원자적 롤백도 실제 SQL로 확인했다.

새573xx와 기존553xx의 public 함수 정의/권한, RLS 정책, 비내부 트리거, 열 정의,
테이블 권한을 정렬한 비교 결과가 일치했다. SHA-256:
`14044946fdca73201a20c0de6823b6d53ab78ca12e1f93628c0226b5968a07dd`.
양쪽 migration history는25개다. 기존 DB는 reset하지 않았고, 검증 후 Auth3/프로필3/공고13을 유지했다.
현재 migration checksum 목록은 [migrations.sha256](migrations.sha256)이며 과거21개 기록은 역사적 증거다.

브라우저는 모두 통과했으나 이번 production 실행에서도 destination stream 경고2건이 있었다.
기존 공개 전 원인·영향 확인 항목은 유지한다. 이 실행은 실제 provider·hosted 복원·rollback·공개 승인
증명이 아니다. 운영 주체/지원 이메일/도메인/정책 검토/계정 및 hosted 게이트는 계속 미정·미검증이다.
[실제 배포 인계서](production-release.md)를 따른다.

## 로컬 자료 보존

원본 작업 공간의 미추적 계획6개는 초기 계획 스냅샷과 바이트 단위로 일치했다.
교체 전에 `/Users/rinny/.codex/backups/albamon-local-main-20260911-1806`에
원본과 SHA-256 manifest를 보존했다. `.idea/`는 변경하지 않는다.
PR 피드백을 위해 출시 브랜치와 worktree는 유지한다. 원격 main은 이 작업에서 push하지 않는다.

## Slice31 후속 통합 — 최종 main 기준

첫 로컬 병합 후 origin/main이 `717965d2d13bb073d568ac2d1e7f441e1e632941`
(PR33 공고 만료 처리)로 전진하여 추가 통합했다. 부모는 `d68df6180d4566d4f6d074ba53d2ffe93ec955ce`다.
최종 migration inventory는 **26개**이며, 추가된 July15 이후 September의
`is_job_open` 규칙이 공개 view/RLS/신규 지원을 일관되게 제어한다. NULL 만료, 만료,
비활성 고용주의 공고는 숨기고 과거 이력은 유지한다. 개발용 만료 fixture ID 충돌도 해소했다.

- 최종 전체 단위 검사 **938 PASS + 6 opt-in skip**, 타입 검사·린트 PASS.
- 최종 개발 모드 browser **31 PASS**. 앞선 production/local-Auth27과 메일5는 첫 통합 소스의 검증이다.
- 최종 unconfigured production artifact build와 실제 서버 확인 PASS:
  `kw-001` 샘플404, 잘못된 ID404. Build ID `fJ3pLFXvwRxffq18Awu2-`.
- 새573xx의26개 순차 적용과 실제 upstream14개→26개 업그레이드583xx 모두
  **pgTAP498 PASS + Slice25/27/28/31 전 사례 PASS**.
- 업그레이드 직후 기존 Auth3/공고10은 보존됐고, 만료일이 없는 기존 공고의 공개 수는0이었다.
  이는 새 규칙에 따른 안전한 비공개 상태다. 이후 명시적 일회용583xx에서만 현재 로컬 테스트
  seed를 준비해 고정 fixture를 전제하는 전체 SQL suite를 실행했다. hosted seed나 자동 동의는 없다.
- 최종 public 함수·권한·정책·트리거·view·열·테이블 권한의 비교도 일치했다. SHA-256:
  `f3e71f648a6d6b197df721ce8c44fdc6e2090b42a8c4a19c23879175ac31b449`.

기존553xx의25개 실험 이력은 중지한 DB/storage volume에 그대로 보존한다. July15 view 정의를
이 이력 뒤에 억지로 적용하면 이미 추가된 열을 제거하는 충돌이 있으므로 해당 경로를 실행하지 않았다.
이력 repair나 view 삭제로 우회하지 않았다. 실제 배포 경로는 검증된 upstream14→26 순서다.
중첩 worktree 산출물 때문에 원본 main의 린트가 실패한 설정도 수정했다:
ESLint는 `.worktrees/`와 `.superpowers/` 내부 산출물을 검사하지 않는다.
