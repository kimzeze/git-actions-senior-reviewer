# Senior Reviewer

PR이 열리면 멀티 에이전트 팀이 병렬로 코드를 리뷰하고, 검증된 결과를 PR 코멘트 + Slack으로 전달하는 AI 코드 리뷰 시스템입니다.

---

## 목차

- [왜 만들었나](#왜-만들었나)
- [어떻게 동작하나](#어떻게-동작하나)
- [아키텍처](#아키텍처)
- [멀티 에이전트 파이프라인](#멀티-에이전트-파이프라인)
- [적응형 스케일링](#적응형-스케일링)
- [리뷰 출력 예시](#리뷰-출력-예시)
- [빠른 시작 가이드](#빠른-시작-가이드)
- [설정 옵션](#설정-옵션)
- [비용 추정](#비용-추정)
- [프로젝트 구조](#프로젝트-구조)
- [개발 가이드](#개발-가이드)
- [새 레포에 적용하기](#새-레포에-적용하기)
- [트러블슈팅](#트러블슈팅)

---

## 왜 만들었나

코드 생산량이 늘어나면서 코드 리뷰가 병목이 되었습니다. 많은 PR이 깊은 리뷰 대신 훑어보기에 그치고, 사람이 놓치기 쉬운 버그가 프로덕션까지 올라가는 문제가 반복되었습니다.

Senior Reviewer는 **모든 PR에 신뢰할 수 있는 시니어 리뷰어를 자동으로 붙여주는 것**을 목표로 합니다.

- PR 승인은 여전히 사람이 합니다
- AI는 사람 리뷰어가 놓치기 쉬운 버그, 보안 취약점, 품질 이슈를 잡아냅니다
- 대규모 PR일수록 더 깊은 분석을, 사소한 변경에는 경량 패스를 적용합니다

### 참고한 것들

- [Anthropic Code Review](https://www.anthropic.com/engineering/code-review) — 멀티 에이전트 병렬 리뷰 + 오탐 필터링 방식
- [LINE NEXT AI Code Review](https://techblog.lycorp.co.jp/ko/building-ai-code-review-platform-with-claude-code-action) — Caller-Executor 중앙 관리 패턴

---

## 어떻게 동작하나

```
1. 개발자가 PR을 연다
2. GitHub Actions가 Senior Reviewer를 트리거한다
3. PR의 diff와 메타데이터를 수집한다
4. PR 크기에 따라 리뷰 모드를 결정한다 (lightweight / standard / full)
5. 전문 에이전트들이 병렬로 코드를 분석한다
   ├── Bug Detector — 로직 오류, 런타임 에러, React/Next.js 버그
   ├── Security Checker — XSS, 인젝션, 인증 우회, 데이터 유출
   └── Code Quality — 성능, 타입 안전성, 접근성, 아키텍처
6. Synthesizer가 모든 발견사항을 검증한다
   - 실제 diff와 대조하여 오탐 제거
   - 중복 병합, 심각도 최종 결정
   - nitpick은 최대 3개로 제한
7. 검증된 결과를 PR에 게시한다
   - 인라인 코멘트 (해당 줄에 직접)
   - 요약 코멘트 (전체 개요 + 통계)
8. Slack으로 알림을 보낸다
```

---

## 아키텍처

LINE NEXT의 **Caller-Executor 패턴**을 채택했습니다.

```
┌─────────────────────────────────────────────────┐
│  대상 레포 (frontend-aptimizer 등)                │
│                                                   │
│  .github/workflows/senior-review.yml (Caller)    │
│  → 15줄 YAML, 시크릿 전달만 담당                    │
└──────────────────────┬──────────────────────────┘
                       │ workflow_call
                       ▼
┌─────────────────────────────────────────────────┐
│  fe-senior-reviewer (이 레포)                     │
│                                                   │
│  .github/workflows/review-executor.yml (Executor)│
│  → 리뷰 로직 전체를 실행                            │
│  → 프롬프트, 에이전트, 설정 모두 중앙 관리            │
└─────────────────────────────────────────────────┘
```

**장점:**
- 리뷰 로직을 한 곳에서 관리 — 수정하면 모든 레포에 즉시 반영
- 대상 레포는 Caller workflow 하나만 추가하면 끝
- 프롬프트, 에이전트 설정이 코드와 분리되어 독립적으로 개선 가능

---

## 멀티 에이전트 파이프라인

```
                    PR Context
                        │
              ┌─────────┼─────────┐
              ▼         ▼         ▼
         ┌────────┐ ┌────────┐ ┌────────┐
         │  Bug   │ │Security│ │ Code   │
         │Detector│ │Checker │ │Quality │
         └───┬────┘ └───┬────┘ └───┬────┘
              │         │         │        ← 병렬 실행
              └─────────┼─────────┘
                        ▼
                 ┌─────────────┐
                 │ Synthesizer │  ← 검증 + 필터링 + 순위 매김
                 └──────┬──────┘
                        ▼
              ┌─────────┼─────────┐
              ▼                   ▼
         ┌─────────┐        ┌─────────┐
         │ GitHub  │        │  Slack  │
         │ Comment │        │  Alert  │
         └─────────┘        └─────────┘
```

### 에이전트별 역할

| 에이전트 | 역할 | 중점 항목 |
|---------|------|----------|
| **Bug Detector** | 버그 탐색 | 로직 오류, null 접근, 비동기 버그, React Hook 오용, SSR/CSR 불일치 |
| **Security Checker** | 보안 점검 | XSS, 인젝션, 인증 우회, 환경변수 유출, Server Action 검증 누락 |
| **Code Quality** | 품질 분석 | 불필요한 리렌더링, 타입 안전성, 접근성, 에러 처리, 번들 크기 |
| **Synthesizer** | 검증/종합 | 오탐 제거, 중복 병합, 심각도 조정, nitpick 제한 (최대 3개) |

### 에이전트 간 통신

에이전트끼리는 직접 통신하지 않습니다. 병렬로 독립 실행되고, Synthesizer만 모든 결과를 취합합니다.

```
에이전트 → 독립 실행 → AgentFinding[] → Synthesizer → 최종 결과
```

### 구조화된 출력

모든 에이전트는 Claude의 **Tool Use** 패턴을 사용하여 JSON 구조를 강제합니다. 프롬프트에 "JSON으로 답해줘"라고 하는 것보다 훨씬 안정적입니다.

```typescript
// Claude가 반드시 이 스키마를 따르는 결과를 반환
tool_choice: { type: "tool", name: "report_findings" }
```

---

## 적응형 스케일링

PR 크기에 따라 리뷰의 깊이와 비용이 자동으로 조절됩니다.

| 모드 | 조건 | 에이전트 | 모델 | 예상 비용 |
|------|------|---------|------|----------|
| **lightweight** | ≤50줄 변경, ≤3개 파일 | Bug Detector 1개만 | Sonnet | ~$0.02 |
| **standard** | ≤500줄, ≤20개 파일 | 3개 병렬 + Synthesizer | Sonnet | ~$0.10 |
| **full** | 500줄 초과 또는 20개 파일 초과 | 3개 병렬 + Synthesizer | Sonnet + Sonnet | ~$0.80 |

---

## 리뷰 출력 예시

### PR 요약 코멘트

```markdown
## 🔍 Senior Reviewer — 코드 리뷰 결과

| 항목 | 값 |
|------|------|
| PR | #42 사용자 인증 미들웨어 리팩토링 |
| 리뷰 모드 | standard |
| 변경 규모 | +180/-45 (8개 파일) |
| 소요 시간 | 35.2초 |
| 토큰 사용량 | 24,500 (~$0.12) |

### 발견사항 요약

| 심각도 | 건수 |
|--------|------|
| 🚨 Critical | 1 |
| ⚠️ Warning | 2 |
| 💡 Info | 1 |
```

### 인라인 코멘트

```markdown
🚨 **[CRITICAL] 인증 미들웨어 우회 가능** (보안)

`getSession()`이 null을 반환할 때 early return 없이 다음 로직이 실행됩니다.
인증되지 않은 사용자가 보호된 라우트에 접근할 수 있습니다.

**수정 제안:**
\```suggestion
const session = await getSession();
if (!session) {
  return NextResponse.redirect(new URL('/login', request.url));
}
\```
```

### Slack 알림

리뷰 완료 시 Slack으로 요약 알림이 전송됩니다. 크리티컬 이슈가 있으면 빨간색, 워닝만 있으면 노란색, 이슈 없으면 녹색으로 표시됩니다.

---

## 빠른 시작 가이드

### 1단계: 이 레포를 GitHub에 올리기

이미 `aptimizer-co/fe-senior-reviewer`에 올라가 있습니다.

### 2단계: Organization Secrets 설정

GitHub Organization → Settings → Secrets and variables → Actions에서:

| 시크릿 | 필수 | 설명 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | **필수** | Anthropic API 키 ([console.anthropic.com](https://console.anthropic.com)) |
| `REVIEWER_TOKEN` | **필수** | `fe-senior-reviewer` private 레포 checkout용 PAT (Contents Read-only) |
| `SLACK_WEBHOOK_URL` | 선택 | Slack Incoming Webhook URL |

> **중요:** Organization-level secret으로 설정해야 모든 레포에서 사용할 수 있습니다.
> 각 secret의 Repository access에 대상 레포를 추가해야 합니다.
> 레포별로 설정해도 됩니다 (Settings → Secrets and variables → Actions).

### 3단계: 대상 레포에 Caller Workflow 추가

`frontend-aptimizer` 레포에 `.github/workflows/senior-review.yml` 파일을 생성합니다:

```yaml
name: Senior Code Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review]

jobs:
  review:
    if: github.event.pull_request.draft == false
    uses: aptimizer-co/fe-senior-reviewer/.github/workflows/review-executor.yml@main
    with:
      service_name: "frontend-aptimizer"
      review_model: "auto"
      exclude_patterns: "*.test.ts,*.test.tsx,*.stories.tsx,pnpm-lock.yaml,*.md"
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      REVIEWER_TOKEN: ${{ secrets.REVIEWER_TOKEN }}
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### 4단계: PR을 열어서 확인

PR을 열면 GitHub Actions에서 `Senior Code Review` 워크플로우가 자동으로 실행되고, 리뷰 결과가 PR 코멘트로 달립니다.

---

## 설정 옵션

### Workflow Inputs

Caller workflow에서 Executor에 전달하는 설정입니다.

| Input | 기본값 | 설명 |
|-------|--------|------|
| `service_name` | `"default"` | 서비스 식별자. 향후 서비스별 프롬프트 오버라이드에 사용 |
| `review_model` | `"auto"` | 모델 오버라이드. `auto`면 스케일러가 자동 결정. `claude-sonnet-4-6`, `claude-opus-4-6` 지정 가능 |
| `exclude_patterns` | `""` | 리뷰 제외 파일 패턴 (콤마 구분). 예: `*.test.ts,pnpm-lock.yaml` |

### Secrets

| Secret | 필수 | 설명 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | **필수** | Anthropic API 키 |
| `REVIEWER_TOKEN` | **필수** | `fe-senior-reviewer` checkout용 PAT (Fine-grained, Contents Read-only) |
| `SLACK_WEBHOOK_URL` | 선택 | Slack 알림용 Incoming Webhook URL |

### 환경변수 (로컬 실행 시)

`.env.example`을 `.env`로 복사하여 사용합니다.

```bash
cp .env.example .env
```

| 변수 | 설명 |
|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API 키 |
| `GITHUB_TOKEN` | GitHub Personal Access Token (repo, pull_request 권한) |
| `PR_NUMBER` | 리뷰할 PR 번호 |
| `REPO_OWNER` | GitHub Organization 또는 사용자 이름 |
| `REPO_NAME` | 레포지토리 이름 |
| `SLACK_WEBHOOK_URL` | Slack Webhook URL (선택) |
| `SERVICE_NAME` | 서비스 식별자 (선택, 기본값: `default`) |
| `REVIEW_MODEL` | 모델 오버라이드 (선택, 기본값: `auto`) |
| `EXCLUDE_PATTERNS` | 제외 패턴, 콤마 구분 (선택) |

---

## 비용 추정

Claude API 토큰 사용량 기준 (Sonnet 기준: input $3/M, output $15/M):

| PR 크기 | 리뷰 모드 | API 호출 수 | 예상 토큰 | 예상 비용 |
|---------|----------|------------|----------|----------|
| 소규모 (≤50줄) | lightweight | 1 | ~5K | ~$0.02 |
| 중규모 (≤500줄) | standard | 4 (3+synthesizer) | ~25K | ~$0.10 |
| 대규모 (500줄+) | full | 4 (3+synthesizer) | ~60K | ~$0.80 |

**월간 예상 (하루 5개 PR 기준):**
- 소규모 위주: ~$3/월
- 혼합: ~$15/월
- 대규모 위주: ~$60/월

---

## 프로젝트 구조

```
fe-senior-reviewer/
├── .github/
│   └── workflows/
│       └── review-executor.yml          # Reusable workflow (Executor)
├── caller-templates/
│   └── review-caller.yml               # 대상 레포용 Caller 템플릿
├── src/
│   ├── index.ts                         # 메인 엔트리포인트
│   ├── config/
│   │   ├── index.ts                     # 환경변수 → ReviewConfig
│   │   └── types.ts                     # 타입 정의 (PRContext, AgentFinding 등)
│   ├── github/
│   │   ├── client.ts                    # Octokit 래퍼
│   │   ├── diff-parser.ts              # Unified diff → 구조화된 ParsedFile[]
│   │   ├── pr-context.ts               # PR 메타데이터 + diff + 파일 목록 수집
│   │   └── review-poster.ts            # 인라인 코멘트 + 요약 코멘트 게시
│   ├── agents/
│   │   ├── types.ts                     # 에이전트 인터페이스 + tool_use 스키마
│   │   ├── base-agent.ts               # 추상 베이스 (Claude API 호출 로직)
│   │   ├── bug-detector.ts             # 🐛 버그 탐색 에이전트
│   │   ├── security-checker.ts         # 🔒 보안 점검 에이전트
│   │   ├── code-quality.ts             # ✨ 코드 품질 에이전트
│   │   └── synthesizer.ts              # 🧪 검증/필터링 메타 에이전트
│   ├── orchestrator/
│   │   ├── index.ts                     # 멀티 에이전트 오케스트레이션
│   │   └── scaler.ts                    # 적응형 스케일링 (lightweight/standard/full)
│   ├── slack/
│   │   └── client.ts                    # Slack Incoming Webhook 알림
│   └── utils/
│       └── logger.ts                    # 구조화된 JSON 로깅
├── dist/                                # 빌드 출력 (tsup, 단일 파일)
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── .env.example
└── .gitignore
```

---

## 개발 가이드

### 의존성

```bash
pnpm install
```

### 빌드

```bash
pnpm build           # tsup으로 dist/index.js 생성
```

### 타입 체크

```bash
pnpm typecheck       # tsc --noEmit
```

### 로컬에서 테스트 실행

```bash
# .env 파일 설정 후
cp .env.example .env
# 환경변수 편집...

pnpm build && pnpm start
```

### 기술 스택

| 도구 | 용도 |
|------|------|
| **TypeScript** | 타입 안전한 코드 |
| **tsup** | 번들러 (단일 ESM 파일로 빌드) |
| **@anthropic-ai/sdk** | Claude API 호출 |
| **@octokit/rest** | GitHub API (PR 정보, 코멘트 작성) |
| **zod** | 런타임 설정 검증 |

### 에이전트 프롬프트 수정하기

각 에이전트의 시스템 프롬프트는 해당 파일의 `systemPrompt` 프로퍼티에 있습니다:

- `src/agents/bug-detector.ts` — 버그 탐색 프롬프트
- `src/agents/security-checker.ts` — 보안 점검 프롬프트
- `src/agents/code-quality.ts` — 코드 품질 프롬프트
- `src/agents/synthesizer.ts` — 검증 프롬프트

프롬프트를 수정한 후 `pnpm build`로 재빌드하면 모든 대상 레포에 즉시 반영됩니다.

---

## 새 레포에 적용하기

Senior Reviewer를 다른 레포에 적용하려면 **2가지만 하면** 됩니다:

### 1. Caller Workflow 추가

대상 레포에 `.github/workflows/senior-review.yml` 생성:

```yaml
name: Senior Code Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review]

jobs:
  review:
    if: github.event.pull_request.draft == false
    uses: aptimizer-co/fe-senior-reviewer/.github/workflows/review-executor.yml@main
    with:
      service_name: "your-service-name"    # 레포 식별자
      exclude_patterns: "*.test.ts,*.md"   # 제외할 파일 패턴
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      REVIEWER_TOKEN: ${{ secrets.REVIEWER_TOKEN }}
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### 2. 시크릿 확인

`ANTHROPIC_API_KEY`와 `REVIEWER_TOKEN`이 Organization-level로 설정되어 있으면 해당 secret의 Repository access에 새 레포만 추가하면 됩니다.
레포별로 관리한다면 해당 레포의 Settings → Secrets에 추가.

---

## 트러블슈팅

### 워크플로우가 실행되지 않아요

- **Draft PR인지 확인**: Draft PR은 건너뜁니다. Ready for review로 변경하면 트리거됩니다.
- **Workflow permissions 확인**: 레포 Settings → Actions → General → Workflow permissions에서 "Read and write permissions" 활성화가 필요합니다.
- **Reusable workflow 접근 권한**: `fe-senior-reviewer` 레포가 private이면 Organization Settings → Actions → General에서 "Allow enterprise, and select non-enterprise, parsing workflows" 또는 레포를 internal로 설정해야 합니다.

### 코멘트가 안 달려요

- **GITHUB_TOKEN 권한**: workflow에서 `permissions: pull-requests: write`가 설정되어 있는지 확인.
- **API rate limit**: GitHub Actions의 GITHUB_TOKEN은 시간당 1,000 요청 제한이 있습니다. 대량 PR 시 참고.

### API 에러가 나요

- **ANTHROPIC_API_KEY 확인**: 시크릿이 올바르게 설정되어 있는지 확인. [console.anthropic.com](https://console.anthropic.com)에서 키 상태 확인.
- **Rate limit**: Anthropic API rate limit에 걸릴 수 있습니다. Actions 로그에서 429 에러 확인.

### 리뷰가 너무 느려요

- 기본적으로 에이전트 3개가 **병렬 실행**되므로 소요 시간은 가장 느린 에이전트 기준입니다.
- 대규모 PR (1000줄+)은 토큰이 많아 응답이 느릴 수 있습니다. `review_model: "claude-sonnet-4-6"`으로 고정하면 속도가 빨라집니다.
- workflow timeout은 30분으로 설정되어 있습니다.

### Slack 알림이 안 와요

- `SLACK_WEBHOOK_URL` 시크릿이 설정되어 있는지 확인.
- Slack App의 Incoming Webhook이 활성화되어 있는지 확인.
- Actions 로그에서 Slack 전송 에러 메시지 확인.

---

## 라이선스

Private — aptimizer-co 내부 사용
