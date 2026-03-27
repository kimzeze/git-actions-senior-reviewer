# Turborepo 모노레포 리뷰 규칙

이 프로젝트는 Turborepo 모노레포입니다. 아래 규칙을 적용하세요.

---

## 패키지 태스크 원칙 (CRITICAL)

### Root Task 금지 — 항상 Package Task 사용

태스크 로직은 각 패키지의 `package.json`에 정의하고, root `package.json`은 `turbo run`으로 위임만 합니다.

```json
// BAD: root에서 직접 실행 — Turborepo 병렬화 무효화
{
  "scripts": {
    "build": "cd apps/web && next build && cd ../api && tsc",
    "lint": "eslint apps/ packages/"
  }
}

// GOOD: 각 패키지에 스크립트 정의 후 turbo로 위임
// root package.json
{
  "scripts": {
    "build": "turbo run build",
    "lint": "turbo run lint"
  }
}

// apps/web/package.json
{ "scripts": { "build": "next build", "lint": "eslint ." } }

// apps/api/package.json
{ "scripts": { "build": "tsc", "lint": "eslint ." } }
```

### turbo run 사용 (코드 내)

`package.json` 스크립트와 CI에서는 반드시 `turbo run <task>` 형태를 사용합니다. `turbo <task>` 축약형은 터미널에서 직접 타이핑할 때만 사용합니다.

```json
// BAD
{ "scripts": { "build": "turbo build" } }

// GOOD
{ "scripts": { "build": "turbo run build" } }
```

---

## 의존성 관리 (CRITICAL)

### 패키지 경계 침범 금지

상대 경로(`../../`)로 다른 패키지의 파일을 직접 import하지 않습니다. workspace 의존성을 선언하고 패키지 이름으로 import합니다.

```tsx
// BAD: 패키지 내부 침범
import { Button } from '../../packages/ui/src/button'

// GOOD: 패키지로 설치 후 import
import { Button } from '@repo/ui/button'
```

### root에 앱 의존성 설치 금지

root `package.json`에는 turbo, prettier 등 레포 도구만 설치합니다. react, next 같은 앱 의존성은 각 패키지에 설치합니다.

```json
// BAD: root에 앱 의존성
{
  "dependencies": { "react": "^18", "next": "^14" }
}

// GOOD: root에는 도구만
{
  "devDependencies": { "turbo": "latest", "prettier": "^3" }
}
```

### 공유 코드는 패키지로 추출

`apps/web/shared/` 같이 앱 내부에 공유 코드를 두지 않습니다. `packages/`로 추출합니다.

```
// BAD
apps/web/shared/utils.ts  // 다른 앱에서 접근 불가

// GOOD
packages/utils/src/index.ts  // @repo/utils로 설치 후 사용
```

---

## turbo.json 설정 (HIGH)

### dependsOn 올바르게 사용

```json
{
  "tasks": {
    // ^build: 의존하는 패키지의 build를 먼저 실행
    "build": { "dependsOn": ["^build"] },

    // build (^ 없음): 같은 패키지의 build를 먼저 실행
    "test": { "dependsOn": ["build"] },

    // pkg#task: 특정 패키지의 특정 태스크
    "deploy": { "dependsOn": ["web#build"] }
  }
}
```

### prebuild 스크립트로 의존성 수동 빌드 금지

`prebuild`에서 다른 패키지를 수동으로 빌드하면 Turborepo의 의존성 그래프를 우회합니다. workspace 의존성을 선언하고 `dependsOn: ["^build"]`를 사용합니다.

```json
// BAD: 수동 빌드
{
  "scripts": {
    "prebuild": "cd ../../packages/types && bun run build",
    "build": "next build"
  }
}

// GOOD: 의존성 선언 + turbo가 빌드 순서 관리
// package.json
{ "dependencies": { "@repo/types": "workspace:*" } }
// turbo.json
{ "tasks": { "build": { "dependsOn": ["^build"] } } }
```

### outputs 설정 필수

파일을 생성하는 태스크에는 `outputs`를 설정해야 캐시가 작동합니다.

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    }
  }
}
```

---

## 환경 변수 (HIGH)

### env에 태스크가 의존하는 변수 선언

`env`에 선언하지 않은 변수가 변경되어도 캐시가 무효화되지 않아 잘못된 빌드 결과를 반환합니다.

```json
// BAD: API_URL 변경해도 캐시 히트
{
  "tasks": { "build": { "outputs": ["dist/**"] } }
}

// GOOD: 변수 변경 시 캐시 무효화
{
  "tasks": {
    "build": {
      "outputs": ["dist/**"],
      "env": ["API_URL", "DATABASE_URL"]
    }
  }
}
```

### .env 파일을 inputs에 포함

Turbo는 `.env` 파일을 자동으로 감지하지 않습니다. 명시적으로 `inputs`에 포함해야 합니다.

```json
{
  "tasks": {
    "build": {
      "inputs": ["$TURBO_DEFAULT$", ".env", ".env.*"]
    }
  }
}
```

### root .env 지양

모노레포 루트에 `.env`를 두면 어떤 패키지가 어떤 변수를 사용하는지 불명확합니다. 각 패키지에 `.env`를 두는 것이 권장됩니다.

---

## Package Configuration (MEDIUM)

### 패키지별 설정은 해당 패키지의 turbo.json에

root `turbo.json`에 `@repo/web#test` 같은 패키지별 오버라이드가 많아지면 Package Configuration으로 분리합니다.

```json
// BAD: root에 패키지별 설정 나열
{
  "tasks": {
    "test": {},
    "@repo/web#test": { "outputs": ["coverage/**"] },
    "@repo/api#test": { "outputs": ["coverage/**"] }
  }
}

// GOOD: 패키지별 turbo.json
// apps/web/turbo.json
{
  "extends": ["//"],
  "tasks": {
    "test": { "outputs": ["coverage/**"] }
  }
}
```

---

## 안티패턴 요약

| 패턴 | 문제 |
|------|------|
| root에서 `cd && build` 체이닝 | 병렬화 무효화 |
| `../../packages/` 상대 import | 패키지 경계 침범 |
| `prebuild`로 수동 빌드 | 의존성 그래프 우회 |
| `--parallel` 플래그 사용 | 의존성 그래프 무시 |
| `outputs` 미설정 | 캐시 미작동 |
| env 변수 미선언 | 잘못된 캐시 히트 |
| root `.env` | 변수 소유권 불명확 |
| `turbo build` (축약형) in 코드 | `turbo run build` 사용해야 함 |
