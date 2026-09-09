# A1 의존성 보안 검증 기록

- 검증일: 2026-09-09
- 범위: 운영 의존성(`npm audit --omit=dev`)의 High/Critical 취약점 제거
- 기준 커밋: `16f828c43b2f436ef2099c1aa7dd1bb15233ea73`
- 검증 환경: Node.js `v25.9.0`, npm `11.12.1`, macOS arm64

## 실패 기준 (RED)

변경 전 `npm test`는 46개 파일, 495개 테스트가 모두 통과했다. 따라서 아래 audit 실패를 기존 기능 실패와 분리해 재현했다.

```text
$ npm audit --omit=dev --audit-level=high
5 vulnerabilities (1 moderate, 3 high, 1 critical)
exit 1
```

영향 패키지는 `next@16.2.9`, Next 내부 `postcss@8.4.31`, `sharp@0.34.5`, `nanoid@3.3.14`, `baseline-browser-mapping@2.10.38`이었다.

```text
$ npm ls next react react-dom @supabase/ssr @supabase/supabase-js
@supabase/ssr@0.12.0
@supabase/supabase-js@2.108.2
next@16.2.9
react@19.2.4
react-dom@19.2.4
```

## 버전 선택과 도달 가능성

공식 npm 레지스트리를 조회한 결과 `next@16.3.4`가 2026-09-09 현재 `latest` stable이며 Node.js `>=20.9.0`을 요구한다. `eslint-config-next@16.3.4`도 같은 버전으로 게시되어 있다. 검증 환경과 프로젝트의 TypeScript/React 버전은 설치된 Next 16 가이드의 요구사항을 충족한다.

- [npm registry: next 16.3.4](https://registry.npmjs.org/next/16.3.4)
- [npm registry: eslint-config-next 16.3.4](https://registry.npmjs.org/eslint-config-next/16.3.4)
- [Next.js App Router/Turbopack middleware advisory](https://github.com/advisories/GHSA-6gpp-xcg3-4w24)
- [Next.js App Router Server Actions DoS advisory](https://github.com/advisories/GHSA-m99w-x7hq-7vfj)
- [Next.js Server Actions custom-server SSRF advisory](https://github.com/advisories/GHSA-89xv-2m56-2m9x)
- [Next.js dynamic-host rewrite SSRF advisory](https://github.com/advisories/GHSA-p9j2-gv94-2wf4)
- [Next.js SVG image optimization DoS advisory](https://github.com/advisories/GHSA-q8wf-6r8g-63ch)
- [Next.js Server Function endpoint disclosure advisory](https://github.com/advisories/GHSA-955p-x3mx-jcvp)
- [Next.js Windows-hosted RCE advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36)
- [Next.js AVIF image optimization RCE advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4)

이 앱은 App Router와 다수의 Server Action을 사용하므로 Server Actions 및 Server Function 관련 경고는 직접 관련된다. 반면 현재 `next.config.ts`에는 `i18n`, 외부 호스트 rewrite/redirect, `images.remotePatterns`, AVIF 형식 설정이 없고 별도 custom server도 없다. 따라서 해당 설정이나 이미지 처리에 한정된 경고는 현재 구성에서 도달 가능성이 낮다. Windows 전용 RCE는 배포 운영체제에 따라 달라지는 경고다. 도달 가능성이 낮은 항목도 운영 환경 변경에 대비해 모두 수정된 프레임워크 버전으로 올렸다.

GitHub의 2026년 7월 advisories는 Next 16.2.11을, 2026년 9월 Windows/AVIF advisories는 16.3.3을 수정 버전으로 제시한다. 선택한 16.3.4는 두 수정선을 모두 포함하는 최신 stable 버전이다.

업데이트 전 설치된 16.2.9 문서와 업데이트 후 설치된 16.3.4 문서에서 App Router 설치, Next 16 업그레이드, production checklist를 확인했다. 프로젝트는 문서가 요구하는 직접 ESLint 실행과 Turbopack 기본 빌드를 이미 사용하므로 호환성 소스 변경은 필요하지 않았다.

## 최소 변경

```text
$ npm install --save-exact next@16.3.4
$ npm install --save-dev --save-exact eslint-config-next@16.3.4
$ npm audit fix --omit=dev --dry-run
baseline-browser-mapping 2.10.38 => 2.11.21
1 moderate severity vulnerability remains in the dry run
```

dry-run에서 확인된 운영 transitive 패치만 `npm audit fix --omit=dev`로 적용했다. `--force`와 Next 내부 dependency override는 사용하지 않았다. 최종 주요 버전은 다음과 같다.

```text
next@16.3.4
eslint-config-next@16.3.4
next/node_modules/postcss@8.5.23
sharp@0.35.4
nanoid@3.3.18
baseline-browser-mapping@2.11.21
```

## 성공 검증 (GREEN)

```text
$ npm ci
added 408 packages, audited 409 packages

$ npm run typecheck
exit 0

$ npm run lint
exit 0

$ npm test
Test Files  46 passed (46)
Tests       495 passed (495)

$ NEXT_PUBLIC_SITE_URL=http://localhost:3000 \
  NEXT_PUBLIC_SUPABASE_URL=https://placeholder.invalid \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false \
  NEXT_PUBLIC_AUTH_KAKAO_ENABLED=false \
  NEXT_PUBLIC_AUTH_NAVER_ENABLED=false \
  NEXT_PUBLIC_AUTH_PHONE_ENABLED=false \
  npm run build
Next.js 16.3.4 (Turbopack)
Compiled successfully
exit 0

$ npm audit --omit=dev --audit-level=high
found 0 vulnerabilities
exit 0
```

빌드는 성공했지만 기존 `generateStaticParams` 경로에서 `cookies()`를 호출해 `DYNAMIC_SERVER_USAGE` 로그를 출력한 뒤 mock 공고로 fallback한다. 이는 A2의 운영 mock 차단 범위이며 A1에서는 소스 코드를 변경하지 않았다. 그러므로 이 기록은 운영 의존성 audit 해결만 증명하며 F01(운영 mock 노출) 해결을 선언하지 않는다.

전체 개발 의존성을 포함한 `npm audit`에는 7개 dev-only 경고(Moderate 3, High 4)가 남아 있다. 출시 차단 기준인 `--omit=dev --audit-level=high` 결과에는 포함되지 않으며, 이번 A1의 운영 dependency 범위를 넓히지 않기 위해 별도 업데이트하지 않았다.
