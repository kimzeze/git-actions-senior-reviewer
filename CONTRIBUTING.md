# Contributing Guide

## 워크플로우

```
1. Issue 작성 → 2. 브랜치 생성 → 3. 작업 → 4. PR → 5. 리뷰 → 6. 머지
```

**PR은 반드시 Issue가 먼저 있어야 합니다.** Issue 없이 PR을 올리지 마세요.

## Issue

- 모든 작업은 Issue부터 시작합니다.
- 타입과 우선순위를 선택하고, 설명에 배경/상세/완료 조건을 작성합니다.
- Assignee는 본인으로 지정합니다.

## Branch

`타입/이슈번호-설명` 형식을 사용합니다.

```
feat/12-add-slack-alert
fix/15-review-posting-duplicate
docs/18-update-readme
refactor/20-extract-validator
```

## Commit

[Conventional Commits](https://www.conventionalcommits.org/)를 따릅니다.

```
feat: Slack 알림 기능 추가
fix: 리뷰 코멘트 중복 게시 해결
docs: README 새 레포 적용 가이드 업데이트
refactor: validateFindings 함수 분리
chore: tsup 버전 업데이트
```

- 스코프는 선택: `feat(agent): 병렬 실행 지원`
- 한국어/영어 혼용 가능, 팀 내 통일만 되면 OK

## Pull Request

- PR 제목도 Conventional Commits 형식: `feat: Slack 알림 기능 추가`
- 본문에 `closes #이슈번호`로 Issue를 연결합니다.
- Assignee는 본인으로 지정합니다.

## Label

| Label | 용도 |
|-------|------|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `docs` | 문서 |
| `refactor` | 리팩토링 |
| `chore` | 기타 (CI, 설정 등) |
| `P0` | 즉시 처리 (서비스 장애) |
| `P1` | 높음 (이번 주 내) |
| `P2` | 보통 (백로그) |
