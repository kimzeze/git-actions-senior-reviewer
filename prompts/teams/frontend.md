# Frontend 팀 공통 리뷰 규칙

이 규칙은 프론트엔드 팀의 모든 레포에 적용됩니다. 기술 스택에 관계없이 공통으로 지켜야 할 컨벤션입니다.

---

## 컴포넌트 아키텍처

### Boolean prop 남용 금지

Boolean prop이 3개 이상이면 컴포넌트를 분리하거나 composition 패턴을 사용해야 합니다.

```tsx
// BAD: boolean prop이 UI 분기를 제어
<Button isLoading isDisabled isOutline isSmall hasIcon />

// GOOD: 명시적 variant 컴포넌트
<Button variant="outline" size="sm">
  <Spinner /> 로딩 중
</Button>
```

### Compound Component 패턴

연관된 하위 컴포넌트가 있는 복합 UI(Modal, Tabs, Accordion 등)는 Context를 통해 상태를 공유하고, 하위 컴포넌트를 자유롭게 조합할 수 있어야 합니다.

```tsx
// BAD: 모든 설정을 prop으로 전달
<Modal title="확인" body={<p>삭제하시겠습니까?</p>} footer={<Button>확인</Button>} />

// GOOD: 조합 가능한 구조
<Modal>
  <Modal.Header>확인</Modal.Header>
  <Modal.Body>삭제하시겠습니까?</Modal.Body>
  <Modal.Footer><Button>확인</Button></Modal.Footer>
</Modal>
```

### children 우선 원칙

`renderHeader`, `renderFooter` 같은 render prop보다 `children`과 composition을 사용합니다.

```tsx
// BAD
<Card renderHeader={() => <h2>제목</h2>} renderBody={() => <p>내용</p>} />

// GOOD
<Card>
  <Card.Header><h2>제목</h2></Card.Header>
  <Card.Body><p>내용</p></Card.Body>
</Card>
```

---

## 상태 관리

### Provider에서만 구현체를 알아야 한다

상태 관리 라이브러리(Zustand, Jotai 등)의 구현 세부사항은 Provider 내부에만 존재해야 합니다. 소비하는 컴포넌트는 Context interface만 의존합니다.

### Props drilling 해결

3단계 이상 prop이 전달되면 Context, composition, 또는 커스텀 Hook으로 해결합니다.

### 상태 코로케이션

상태는 그것을 사용하는 컴포넌트에 최대한 가까이 위치시킵니다. 전역 상태로 올리기 전에 해당 상태가 정말 여러 컴포넌트에서 필요한지 확인합니다.

---

## 코드 패턴

### Container/Presentational 분리

복잡한 컴포넌트는 데이터/로직을 담당하는 Container와 UI를 담당하는 Presentational 컴포넌트로 분리합니다.

```tsx
// BAD: 하나의 컴포넌트가 fetching + 상태 + UI 모두 담당
function UserProfile() {
  const { data } = useQuery(...)
  const [tab, setTab] = useState('info')
  return (/* 200줄의 JSX */)
}

// GOOD: 관심사 분리
function UserProfileContainer() {
  const { data } = useQuery(...)
  return <UserProfileView user={data} />
}

function UserProfileView({ user }: Props) {
  return (/* 순수한 UI */)
}
```

### 명시적 Variant 컴포넌트

boolean mode 대신 명시적인 variant 컴포넌트를 생성합니다.

```tsx
// BAD
<Input isSearch isLarge hasPrefix />

// GOOD
<SearchInput size="lg" prefix={<SearchIcon />} />
```

---

## TypeScript 규칙

### any 사용 금지

`any` 대신 `unknown`, 제네릭, 또는 구체적인 타입을 사용합니다. 불가피한 경우 `// eslint-disable` 주석과 함께 사유를 남깁니다.

### 타입 단언(as) 최소화

`as` 단언은 타입 시스템을 우회합니다. 타입 가드, 제네릭, 또는 타입 좁히기로 대체할 수 있는지 먼저 확인합니다.

```tsx
// BAD
const user = data as User

// GOOD
function isUser(data: unknown): data is User {
  return typeof data === 'object' && data !== null && 'id' in data
}
if (isUser(data)) { /* data는 User */ }
```

---

## 접근성(a11y) 기본 규칙

- `<div onClick>` 대신 `<button>` 사용
- 이미지에 `alt` 속성 필수
- 폼 요소에 `<label>` 연결
- 키보드로 조작 가능한 인터랙션 보장
- `aria-*` 속성은 올바른 역할에만 사용 (무분별한 추가 금지)

---

## 네이밍 컨벤션

- 컴포넌트: PascalCase (`UserProfile.tsx`)
- Hook: `use` 접두사 (`useAuth`, `useUserQuery`)
- 유틸 함수: camelCase (`formatDate`, `parseQuery`)
- 상수: SCREAMING_SNAKE_CASE (`MAX_RETRY_COUNT`)
- 타입/인터페이스: PascalCase (`UserProfile`, `AuthState`)

---

## import 규칙

- 외부 라이브러리 → 내부 모듈 → 상대 경로 순서로 정리
- barrel file(`index.ts`)에서 re-export 시 사용하지 않는 모듈이 번들에 포함되지 않도록 주의
- 순환 참조 금지
