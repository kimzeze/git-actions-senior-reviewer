# React 성능 최적화 리뷰 규칙

Vercel Engineering의 React/Next.js 성능 최적화 가이드라인을 기반으로 합니다. 아래 규칙을 적용하세요.

---

## 워터폴 제거 (CRITICAL)

### await를 실제 사용 시점으로 미루기

Promise를 생성하고 즉시 await하면 불필요한 순차 실행이 됩니다.

```tsx
// BAD: 즉시 await — 순차 실행
async function load() {
  const user = await getUser()    // 1초
  const posts = await getPosts()  // 1초 → 총 2초
}

// GOOD: Promise 생성 후 나중에 await
async function load() {
  const userPromise = getUser()
  const postsPromise = getPosts()
  const [user, posts] = await Promise.all([userPromise, postsPromise]) // 총 1초
}
```

### 부분 의존성이 있는 병렬 요청

A의 결과가 B에 필요하지만 C는 독립적인 경우, C는 A와 병렬로 시작해야 합니다.

```tsx
// BAD: 전부 순차
const a = await fetchA()
const b = await fetchB(a.id)
const c = await fetchC()

// GOOD: A와 C를 병렬, B는 A 이후
const [a, c] = await Promise.all([fetchA(), fetchC()])
const b = await fetchB(a.id)
```

### Suspense로 스트리밍

느린 컴포넌트를 Suspense로 감싸면 나머지 페이지는 즉시 전송됩니다. 가장 효과적인 워터폴 해결책입니다.

---

## 번들 크기 최적화 (CRITICAL)

### Barrel file에서 직접 import

`index.ts`에서 re-export하는 barrel file에서 import하면 사용하지 않는 모듈까지 번들에 포함될 수 있습니다.

```tsx
// BAD: barrel file에서 전체 import
import { Button } from '@/components'

// GOOD: 직접 import
import { Button } from '@/components/button'
```

### Dynamic import으로 코드 분할

무거운 컴포넌트(차트, 에디터, 모달 등)는 dynamic import로 로드합니다.

```tsx
import dynamic from 'next/dynamic'

const HeavyChart = dynamic(() => import('@/components/chart'), {
  loading: () => <Skeleton />,
})
```

### 서드파티 스크립트 지연 로드

분석(Analytics), 로깅, 챗봇 등은 하이드레이션 이후에 로드합니다.

```tsx
// BAD: 최상위에서 바로 초기화
import Analytics from 'heavy-analytics'
Analytics.init()

// GOOD: useEffect 또는 next/script의 lazyOnload
useEffect(() => {
  import('heavy-analytics').then(m => m.init())
}, [])
```

### 호버/포커스 시 프리로드

링크나 버튼에 대해 `onMouseEnter`/`onFocus` 시점에 관련 모듈을 preload하면 체감 속도가 향상됩니다.

---

## 서버 성능 (HIGH)

### React.cache()로 요청 단위 중복 제거

같은 요청 내에서 동일한 데이터를 여러 컴포넌트가 필요로 할 때, `React.cache()`로 중복 호출을 방지합니다.

```tsx
import { cache } from 'react'

export const getUser = cache(async (id: string) => {
  return await db.users.findUnique({ where: { id } })
})
```

### Client에 전달하는 데이터 최소화

Server → Client Component로 전달하는 데이터에서 불필요한 필드를 제거합니다. 전체 객체 대신 필요한 필드만 선택합니다.

```tsx
// BAD: 전체 user 객체 (비밀번호, 내부 ID 등 포함)
<ClientComponent user={fullUser} />

// GOOD: 필요한 필드만
<ClientComponent user={{ name: fullUser.name, avatar: fullUser.avatar }} />
```

### after()로 비차단 작업 실행

로깅, 분석 전송 등 응답에 영향을 주지 않는 작업은 `after()`로 응답 이후에 실행합니다.

```tsx
import { after } from 'next/server'

export async function POST(req: Request) {
  const result = await processData()

  after(async () => {
    await logAnalytics(result)  // 응답 이후 실행
  })

  return Response.json(result)
}
```

---

## 리렌더 최적화 (MEDIUM)

### 콜백에서만 쓰는 상태를 구독하지 않기

이벤트 핸들러에서만 참조하는 값은 상태 대신 ref로 관리합니다.

```tsx
// BAD: position 변경마다 리렌더
const [position, setPosition] = useState({ x: 0, y: 0 })
// position은 onDragEnd에서만 사용

// GOOD: ref로 관리
const positionRef = useRef({ x: 0, y: 0 })
```

### useMemo/useCallback 올바른 사용

- 무거운 연산 결과: `useMemo` 사용
- 자식 컴포넌트에 전달하는 함수: `useCallback` 사용
- 단순 계산이나 참조 안정성이 불필요한 곳에서는 사용하지 않기

### useEffect 의존성에 원시값 사용

객체나 배열을 의존성에 넣으면 매 렌더마다 새 참조가 생겨 무한 실행될 수 있습니다.

```tsx
// BAD: 객체가 매 렌더마다 새로 생성
useEffect(() => { ... }, [{ id, name }])

// GOOD: 원시값 사용
useEffect(() => { ... }, [id, name])
```

### 파생 상태는 boolean으로 구독

큰 객체의 일부 조건만 필요하면 boolean으로 파생하여 리렌더를 줄입니다.

```tsx
// BAD: items 배열 전체 변경에 반응
const items = useStore(state => state.items)
const hasItems = items.length > 0

// GOOD: boolean만 구독
const hasItems = useStore(state => state.items.length > 0)
```

### functional setState로 안정적 콜백

이전 상태에 의존하는 업데이트는 functional 형태를 사용합니다. useCallback 의존성에서 상태를 제거할 수 있습니다.

```tsx
// BAD: count가 의존성에 포함
const increment = useCallback(() => setCount(count + 1), [count])

// GOOD: 의존성 불필요
const increment = useCallback(() => setCount(c => c + 1), [])
```

### startTransition으로 비긴급 업데이트

검색 결과 필터링 등 즉각적이지 않아도 되는 업데이트는 `startTransition`으로 감싸서 사용자 입력의 응답성을 유지합니다.

---

## 렌더링 성능 (MEDIUM)

### 정적 JSX를 컴포넌트 밖으로 추출

렌더링마다 변하지 않는 JSX는 컴포넌트 외부 상수로 추출합니다.

```tsx
// BAD: 매 렌더마다 새 JSX 생성
function Component() {
  return <div>{/* ... */}<Footer /></div>
}

// GOOD: 정적 부분 추출
const footer = <Footer />
function Component() {
  return <div>{/* ... */}{footer}</div>
}
```

### 조건부 렌더링에 삼항 연산자 사용

`&&` 연산자는 falsy 값(`0`, `''`)이 렌더링될 수 있습니다.

```tsx
// BAD: count가 0이면 "0"이 화면에 표시됨
{count && <Badge count={count} />}

// GOOD
{count > 0 ? <Badge count={count} /> : null}
```

### content-visibility으로 긴 목록 최적화

화면 밖의 콘텐츠에 `content-visibility: auto`를 적용하면 렌더링 비용을 줄일 수 있습니다.

---

## JavaScript 성능 (LOW-MEDIUM)

### 반복 조회에 Map/Set 사용

배열에서 반복적으로 `find()`, `includes()`를 호출하면 O(n)입니다. Map이나 Set으로 O(1) 조회를 사용합니다.

```tsx
// BAD: O(n) 반복 조회
users.filter(u => selectedIds.includes(u.id))

// GOOD: O(1) 조회
const selectedSet = new Set(selectedIds)
users.filter(u => selectedSet.has(u.id))
```

### 여러 배열 순회를 하나로 합치기

`filter().map()` 체인은 배열을 2번 순회합니다. `reduce()`나 단일 루프로 합칠 수 있습니다.

### 조기 반환으로 불필요한 연산 방지

함수 초반에 빠른 종료 조건을 확인하여 불필요한 연산을 방지합니다.

### 정렬 대신 루프로 min/max 찾기

`array.sort()[0]`은 O(n log n)입니다. `Math.min(...)`이나 단일 루프는 O(n)입니다.
