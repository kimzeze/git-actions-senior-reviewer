# Senior Reviewer

PR이 열리면 멀티 에이전트 팀이 병렬로 코드를 리뷰하고, 검증된 결과를 PR 코멘트 + Slack으로 전달하는 AI 코드 리뷰 시스템입니다.

<img width="903" height="1032" alt="image" src="https://github.com/user-attachments/assets/13f304b3-ef20-46c7-b7a8-0690fcb6852b" />


> **새 레포에 적용하려면?** [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md)를 참고하세요. AI 어시스턴트에게 이 파일을 제공하면 세팅을 도와줍니다.
>
> **프롬프트 추가/수정하려면?** [`docs/PROMPT_GUIDE.md`](docs/PROMPT_GUIDE.md)를 참고하세요.
>
> **시스템 아키텍처 시각화:** [architecture.html](https://kimzeze.github.io/git-actions-senior-reviewer/architecture.html)에서 바로 확인할 수 있습니다.

---

## 목차

- [왜 만들었나](#왜-만들었나)
- [어떻게 동작하나](#어떻게-동작하나)
- [아키텍처](#아키텍처)
- [멀티 에이전트 파이프라인](#멀티-에이전트-파이프라인)
- [프롬프트 시스템](#프롬프트-시스템)
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
   ├── Bug Detector — 로직 오류, 런타임 에러, 에지 케이스
   ├── Security Checker — XSS, 인젝션, 인증 우회, 데이터 유출
   └── Code Quality — 성능, 타입 안전성, 에러 처리, 구조
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
│  대상 레포 (your-app 등)                │
│                                                   │
│  .github/workflows/senior-review.yml (Caller)    │
│  → 15줄 YAML, 시크릿 전달만 담당                    │
└──────────────────────┬──────────────────────────┘
                       │ workflow_call
                       ▼
┌─────────────────────────────────────────────────┐
│  senior-reviewer (이 레포)                     │
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
| **Bug Detector** | 버그 탐색 | 로직 오류, null 접근, 비동기 버그, 상태 관리, 에지 케이스 |
| **Security Checker** | 보안 점검 | XSS, 인젝션, 인증 우회, 민감 데이터 노출, CSRF/SSRF |
| **Code Quality** | 품질 분석 | 코드 구조, 성능, TypeScript 품질, 에러 처리, 유지보수성 |
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

## 프롬프트 시스템

에이전트의 system prompt는 3개 레이어를 동적으로 합성하여 생성됩니다. 이를 통해 **하나의 리뷰 시스템으로 FE/BE 등 다양한 팀과 기술 스택에 맞춤 리뷰**를 제공합니다.

```
┌─────────────────────────────────────┐
│  Layer 1: Agent 프롬프트 (필수)       │  prompts/agents/{agent}.md
│  → 에이전트 역할/규칙 (범용)          │  없으면 에러
├─────────────────────────────────────┤
│  Layer 2: Team 프롬프트 (선택)        │  prompts/teams/{team}.md
│  → 팀 공통 코딩 규칙                 │  없으면 경고 후 스킵
├─────────────────────────────────────┤
│  Layer 3: Stack 프롬프트 (선택, 복수)  │  prompts/stacks/{stack}.md
│  → 기술 스택별 전문 규칙              │  없으면 경고 후 스킵
└─────────────────────────────────────┘
```

### 사용 가능한 프롬프트

| 분류 | 파일 | 설명 |
|------|------|------|
| **Agent** | `agents/bug-detector.md` | 버그 탐색 역할/규칙 |
| | `agents/security-checker.md` | 보안 점검 역할/규칙 |
| | `agents/code-quality.md` | 코드 품질 역할/규칙 |
| | `agents/synthesizer.md` | 검증/종합 역할/규칙 |
| **Team** | `teams/frontend.md` | FE 공통: 컴포넌트 아키텍처, 상태 관리, a11y 등 |
| **Stack** | `stacks/nextjs-app-router.md` | RSC 경계, async API, 데이터 패턴 |
| | `stacks/react-performance.md` | 워터폴 제거, 번들 최적화, 리렌더 최적화 |
| | `stacks/tanstack-query.md` | Query Key, 캐시, Mutation, SSR |
| | `stacks/tailwindcss.md` | 유틸리티 클래스, 동적 클래스 규칙 |
| | `stacks/turborepo.md` | 패키지 태스크, 의존성 관리, 캐시 |

### Caller에서 지정하는 방법

```yaml
with:
  team: "frontend"                                              # Layer 2
  stacks: "nextjs-app-router,react-performance,tanstack-query"  # Layer 3
```

팀이나 스택을 지정하지 않으면 에이전트 기본 프롬프트(범용)만으로 리뷰합니다.

### 프롬프트 추가/수정

새 팀이나 스택 프롬프트를 추가하려면:

1. `prompts/teams/` 또는 `prompts/stacks/`에 `.md` 파일 생성
2. 대상 레포의 caller workflow에서 해당 이름을 `team` 또는 `stacks`에 지정
3. `pnpm build` 후 main에 머지하면 모든 대상 레포에 반영

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

이미 `your-org/senior-reviewer`에 올라가 있습니다.

### 2단계: Organization Secrets 설정

GitHub Organization → Settings → Secrets and variables → Actions에서:

| 시크릿 | 필수 | 설명 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | **필수** | Anthropic API 키 ([console.anthropic.com](https://console.anthropic.com)) |
| `REVIEWER_TOKEN` | **필수** | `senior-reviewer` private 레포 checkout용 PAT (Contents Read-only) |
| `SLACK_WEBHOOK_URL` | 선택 | Slack Incoming Webhook URL |

> **중요:** Organization-level secret으로 설정해야 모든 레포에서 사용할 수 있습니다.
> 각 secret의 Repository access에 대상 레포를 추가해야 합니다.
> 레포별로 설정해도 됩니다 (Settings → Secrets and variables → Actions).

### 3단계: 대상 레포에 Caller Workflow 추가

`your-app` 레포에 `.github/workflows/senior-review.yml` 파일을 생성합니다:

```yaml
name: Senior Code Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review]

jobs:
  review:
    if: github.event.pull_request.draft == false
    uses: your-org/senior-reviewer/.github/workflows/review-executor.yml@main
    with:
      service_name: "your-app"
      review_model: "auto"
      exclude_patterns: "*.test.ts,*.test.tsx,*.stories.tsx,pnpm-lock.yaml,*.md"
      team: "frontend"
      stacks: "nextjs-app-router,react-performance,tailwindcss,tanstack-query"
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
| `service_name` | `"default"` | 서비스 식별자 |
| `review_model` | `"auto"` | 모델 오버라이드. `auto`면 스케일러가 자동 결정. `claude-sonnet-4-6`, `claude-opus-4-6` 지정 가능 |
| `exclude_patterns` | `""` | 리뷰 제외 파일 패턴 (콤마 구분). 예: `*.test.ts,pnpm-lock.yaml` |
| `team` | `""` | 팀 식별자. `prompts/teams/{team}.md` 로드. 예: `frontend`, `backend` |
| `stacks` | `""` | 기술 스택 (콤마 구분). `prompts/stacks/{stack}.md` 로드. 예: `nextjs-app-router,tanstack-query` |

### Secrets

| Secret | 필수 | 설명 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | **필수** | Anthropic API 키 |
| `REVIEWER_TOKEN` | **필수** | `senior-reviewer` checkout용 PAT (Fine-grained, Contents Read-only) |
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
| `TEAM` | 팀 식별자 (선택) |
| `STACKS` | 기술 스택, 콤마 구분 (선택) |

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
senior-reviewer/
├── .github/
│   └── workflows/
│       └── review-executor.yml          # Reusable workflow (Executor)
├── caller-templates/
│   └── review-caller.yml               # 대상 레포용 Caller 템플릿
├── prompts/                             # 프롬프트 파일 (3레이어 합성)
│   ├── agents/                          #   Layer 1: 에이전트 기본 역할 (필수)
│   │   ├── bug-detector.md
│   │   ├── security-checker.md
│   │   ├── code-quality.md
│   │   └── synthesizer.md
│   ├── teams/                           #   Layer 2: 팀별 공통 규칙 (선택)
│   │   └── frontend.md
│   └── stacks/                          #   Layer 3: 기술 스택별 규칙 (선택)
│       ├── nextjs-app-router.md
│       ├── react-performance.md
│       ├── tanstack-query.md
│       ├── tailwindcss.md
│       └── turborepo.md
├── docs/
│   ├── architecture.html               # 시스템 아키텍처 인터랙티브 시각화
│   └── SETUP_GUIDE.md                  # 새 레포 적용 가이드 (AI + 사람 체크리스트)
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
│   │   ├── base-agent.ts               # 추상 베이스 (프롬프트 합성 + Claude API 호출)
│   │   ├── bug-detector.ts             # 버그 탐색 에이전트
│   │   ├── security-checker.ts         # 보안 점검 에이전트
│   │   ├── code-quality.ts             # 코드 품질 에이전트
│   │   └── synthesizer.ts              # 검증/필터링 메타 에이전트
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

### 프롬프트 수정하기

에이전트 프롬프트는 `prompts/` 디렉토리의 마크다운 파일로 관리됩니다:

- `prompts/agents/*.md` — 에이전트 기본 역할/규칙 (범용)
- `prompts/teams/*.md` — 팀별 공통 코딩 규칙
- `prompts/stacks/*.md` — 기술 스택별 전문 규칙

파일을 수정한 후 `pnpm build`로 재빌드하고 main에 머지하면 모든 대상 레포에 즉시 반영됩니다.

새 팀이나 스택을 추가하려면 해당 디렉토리에 `.md` 파일을 생성하고, caller workflow에서 이름을 지정하면 됩니다.

---

## 새 레포에 적용하기

같은 organization(`your-org`) 내 레포에 Senior Reviewer를 적용하는 방법입니다.

> **전제 조건 (최초 1회, 이미 완료됨)**
>
> 아래 항목은 organization 관리자가 이미 설정해둔 상태입니다. 새 레포를 추가할 때는 다시 할 필요 없습니다.
>
> - `senior-reviewer` 레포 → Settings → Actions → General → Access → **"Accessible from repositories in the 'your-org' organization"** 활성화
> - Organization-level secrets 등록: `ANTHROPIC_API_KEY`, `REVIEWER_TOKEN`
> - `REVIEWER_TOKEN`은 `senior-reviewer` 레포의 Contents Read-only 권한이 있는 Fine-grained PAT

---

### Step 1. Org Secret에 새 레포 접근 권한 추가

Organization Settings → Secrets and variables → Actions에서 아래 secret들의 **Repository access**에 새 레포를 추가합니다.

| Secret | 추가할 레포 |
|--------|------------|
| `ANTHROPIC_API_KEY` | 새 레포 선택 |
| `REVIEWER_TOKEN` | 새 레포 선택 |
| `SLACK_WEBHOOK_URL` (선택) | 새 레포 선택 |

> 각 secret 클릭 → **Selected repositories** → 새 레포 추가 → **Update secret**

### Step 2. 대상 레포에 Caller Workflow 추가

대상 레포에 `.github/workflows/senior-review.yml` 파일을 생성합니다:

```yaml
name: Senior Code Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review]

jobs:
  review:
    if: github.event.pull_request.draft == false
    uses: your-org/senior-reviewer/.github/workflows/review-executor.yml@main
    with:
      service_name: "your-service-name"    # 레포 식별자 (자유롭게 지정)
      review_model: "auto"                 # auto, claude-sonnet-4-6, claude-opus-4-6
      exclude_patterns: "*.test.ts,*.test.tsx,*.stories.tsx,pnpm-lock.yaml,*.md"
      team: "frontend"                     # 팀 (prompts/teams/{team}.md 로드)
      stacks: "nextjs-app-router,tanstack-query"  # 스택 (쉼표 구분)
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      REVIEWER_TOKEN: ${{ secrets.REVIEWER_TOKEN }}
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Step 3. 대상 레포 Workflow 권한 확인

대상 레포 → Settings → Actions → General → **Workflow permissions**에서:

- **"Read and write permissions"** 선택 (PR에 코멘트를 달기 위해 필요)

### Step 4. PR을 열어서 확인

main 브랜치에 Caller workflow가 머지된 후, 새로운 PR을 열면 `Senior Code Review` 워크플로우가 자동으로 실행됩니다.

---

### 요약 체크리스트

새 레포 추가 시 확인할 항목:

- [ ] Org secret (`ANTHROPIC_API_KEY`, `REVIEWER_TOKEN`) Repository access에 새 레포 추가
- [ ] 대상 레포에 `.github/workflows/senior-review.yml` 생성
- [ ] 대상 레포 Workflow permissions → "Read and write permissions" 활성화
- [ ] PR 열어서 워크플로우 실행 확인

---

## 트러블슈팅

### 워크플로우가 실행되지 않아요

- **Draft PR인지 확인**: Draft PR은 건너뜁니다. Ready for review로 변경하면 트리거됩니다.
- **Workflow permissions 확인**: 레포 Settings → Actions → General → Workflow permissions에서 "Read and write permissions" 활성화가 필요합니다.
- **Reusable workflow 접근 권한**: `senior-reviewer` 레포가 private이므로, 해당 레포의 Settings → Actions → General → Access에서 **"Accessible from repositories in the 'your-org' organization"**이 활성화되어 있어야 합니다. 이 설정이 없으면 `workflow was not found` 에러가 발생합니다.

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

MIT License
