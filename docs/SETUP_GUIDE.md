# Senior Reviewer 새 레포 적용 가이드

이 문서를 AI 코딩 어시스턴트에게 제공하면, 대상 레포에 Senior Reviewer를 세팅할 수 있습니다.
사람이 직접 해야 하는 단계는 `[수동]`으로 표시되어 있습니다.

---

## 개요

Senior Reviewer는 PR이 열리면 AI가 자동으로 코드 리뷰하는 시스템입니다.
대상 레포에 **caller workflow 파일 하나**만 추가하면 동작합니다.

- 리뷰 로직은 `aptimizer-co/senior-reviewer` 레포에서 중앙 관리됩니다.
- 대상 레포는 `team`과 `stacks`를 지정하여 맞춤 리뷰를 받습니다.

---

## 사전 조건 확인

아래 항목이 이미 설정되어 있는지 확인하세요. 설정되어 있지 않다면 `[수동]` 단계를 먼저 완료해야 합니다.

### 체크리스트 (Organization 관리자가 최초 1회 설정)

- [ ] `[수동]` `senior-reviewer` 레포 → Settings → Actions → General → Access → **"Accessible from repositories in the 'aptimizer-co' organization"** 활성화
- [ ] `[수동]` Organization-level secret 등록 완료:
  - `ANTHROPIC_API_KEY` — Anthropic API 키 ([console.anthropic.com](https://console.anthropic.com))
  - `REVIEWER_TOKEN` — `senior-reviewer` 레포의 Contents Read-only 권한이 있는 Fine-grained PAT
  - `SLACK_WEBHOOK_URL` (선택) — Slack Incoming Webhook URL

> 이 항목들이 이미 완료되어 있다면 "적용 단계"로 바로 진행하세요.

---

## 적용 단계

### Step 1. `[수동]` Org Secret에 대상 레포 접근 권한 추가

GitHub Organization Settings → Secrets and variables → Actions에서 아래 secret들의 **Repository access**에 대상 레포를 추가합니다.

| Secret | 작업 |
|--------|------|
| `ANTHROPIC_API_KEY` | 대상 레포 선택 → Update secret |
| `REVIEWER_TOKEN` | 대상 레포 선택 → Update secret |
| `SLACK_WEBHOOK_URL` (선택) | 대상 레포 선택 → Update secret |

> 각 secret 클릭 → **Selected repositories** → 대상 레포 추가 → **Update secret**

### Step 2. `[수동]` 대상 레포 Workflow 권한 확인

대상 레포 → Settings → Actions → General → **Workflow permissions**:
- **"Read and write permissions"** 선택 (PR에 코멘트를 달기 위해 필요)

### Step 3. Caller Workflow 파일 생성

대상 레포에 `.github/workflows/senior-review.yml` 파일을 생성합니다.

아래 템플릿에서 `[변경 필요]` 부분을 대상 레포에 맞게 수정하세요.

```yaml
name: Senior Code Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review]

jobs:
  review:
    if: github.event.pull_request.draft == false
    uses: aptimizer-co/senior-reviewer/.github/workflows/review-executor.yml@main
    with:
      service_name: "your-service-name"  # [변경 필요] 레포 식별자
      review_model: "auto"
      exclude_patterns: "*.test.ts,*.test.tsx,*.stories.tsx,pnpm-lock.yaml,*.md"  # [변경 필요] 필요에 따라 조정
      team: ""       # [변경 필요] 아래 "team/stacks 선택 가이드" 참고
      stacks: ""     # [변경 필요] 아래 "team/stacks 선택 가이드" 참고
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      REVIEWER_TOKEN: ${{ secrets.REVIEWER_TOKEN }}
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Step 4. PR을 열어서 확인

main 브랜치에 caller workflow가 머지된 후, 새로운 PR을 열면 `Senior Code Review` 워크플로우가 자동으로 실행됩니다.

---

## team / stacks 선택 가이드

### team

대상 레포의 팀에 맞는 값을 선택합니다. 해당 팀 프롬프트가 없으면 경고 로그만 남기고 진행됩니다.

| 값 | 설명 | 상태 |
|----|------|------|
| `"frontend"` | 프론트엔드 팀 — 컴포넌트 아키텍처, 상태 관리, a11y 등 | 사용 가능 |
| `"backend"` | 백엔드 팀 | 향후 추가 예정 |
| `""` (빈 문자열) | 팀 프롬프트 없이 범용 리뷰 | 기본값 |

### stacks

대상 레포에서 사용하는 기술 스택을 쉼표로 구분하여 나열합니다.

| 값 | 설명 |
|----|------|
| `nextjs-app-router` | Next.js App Router (RSC, async API, Suspense 등) |
| `react-performance` | React 성능 최적화 (워터폴, 번들, 리렌더링) |
| `tanstack-query` | TanStack Query (캐시, Mutation, SSR) |
| `tailwindcss` | Tailwind CSS (유틸리티 클래스 규칙) |
| `turborepo` | Turborepo (패키지 태스크, 의존성, 캐시) |

### 조합 예시

```yaml
# Next.js + TanStack Query 프론트엔드 레포
team: "frontend"
stacks: "nextjs-app-router,react-performance,tanstack-query,tailwindcss"

# Turborepo 모노레포 루트
team: "frontend"
stacks: "turborepo"

# 범용 리뷰 (팀/스택 지정 없이)
team: ""
stacks: ""
```

---

## 검증 체크리스트

적용 완료 후 아래 항목을 확인하세요.

### AI가 확인할 항목

- [ ] `.github/workflows/senior-review.yml` 파일이 올바른 경로에 생성됨
- [ ] YAML 문법이 유효함
- [ ] `uses:` 경로가 `aptimizer-co/senior-reviewer/.github/workflows/review-executor.yml@main`과 정확히 일치
- [ ] `service_name`이 대상 레포에 맞게 설정됨
- [ ] `team`과 `stacks`가 대상 레포의 기술 스택과 일치
- [ ] `exclude_patterns`에 리뷰 불필요한 파일 패턴이 포함됨
- [ ] secrets 3개가 모두 참조됨 (`ANTHROPIC_API_KEY`, `REVIEWER_TOKEN`, `SLACK_WEBHOOK_URL`)
- [ ] `if: github.event.pull_request.draft == false` 조건이 포함됨
- [ ] main 브랜치에 머지할 PR이 생성됨

### 사람이 확인할 항목

- [ ] `[수동]` Organization secret의 Repository access에 대상 레포가 추가됨
  - ANTHROPIC_API_KEY
  - REVIEWER_TOKEN
  - SLACK_WEBHOOK_URL (사용하는 경우)
- [ ] `[수동]` 대상 레포 Settings → Actions → Workflow permissions → "Read and write permissions" 활성화
- [ ] `[수동]` PR을 열어서 `Senior Code Review` 워크플로우가 실행되는지 확인
- [ ] `[수동]` 리뷰 코멘트가 PR에 정상적으로 달리는지 확인
- [ ] `[수동]` Slack 알림이 정상적으로 오는지 확인 (사용하는 경우)

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `workflow was not found` | `senior-reviewer`가 private이고 접근 권한 없음 | 레포 Settings → Actions → Access → "Accessible from repositories in the organization" 활성화 |
| 워크플로우 미실행 | Draft PR | Ready for review로 변경 |
| 코멘트 안 달림 | Workflow permissions 부족 | 대상 레포 Settings → Actions → "Read and write permissions" |
| API 에러 | Secret 미설정 또는 만료 | Organization secret 확인, PAT 갱신 |
| 프롬프트 미로드 경고 | team/stacks에 존재하지 않는 값 입력 | 사용 가능한 값 목록 확인 (위 표 참고) |
