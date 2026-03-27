# TanStack Query 리뷰 규칙

이 프로젝트는 TanStack Query(React Query)를 사용합니다. 아래 규칙을 적용하세요.

---

## Query Key 규칙 (CRITICAL)

Query Key는 캐싱, 중복 제거, 무효화의 핵심입니다. 잘못된 키 설계는 데이터 불일치 버그로 이어집니다.

### 항상 배열 형태 사용

```tsx
// BAD
useQuery({ queryKey: 'users', queryFn: fetchUsers })

// GOOD
useQuery({ queryKey: ['users'], queryFn: fetchUsers })
```

### 의존하는 모든 변수를 키에 포함

쿼리 함수가 사용하는 모든 변수가 키에 있어야 합니다. 누락되면 다른 변수 값에 대해 같은 캐시를 반환합니다.

```tsx
// BAD: status가 키에 없음 — status 변경해도 같은 캐시 반환
useQuery({
  queryKey: ['todos'],
  queryFn: () => fetchTodos(status),
})

// GOOD: status를 키에 포함
useQuery({
  queryKey: ['todos', { status }],
  queryFn: () => fetchTodos(status),
})
```

### 계층적 키 구성

일반 → 구체적 순서로 구성합니다. 이렇게 하면 상위 키로 관련 쿼리를 한번에 무효화할 수 있습니다.

```tsx
// 계층 구조 예시
['users']                          // 전체 유저 목록
['users', userId]                  // 특정 유저
['users', userId, 'posts']         // 특정 유저의 포스트
['users', userId, 'posts', { sort: 'recent' }]  // 필터 포함
```

### Query Key Factory 패턴

복잡한 애플리케이션에서는 키를 중앙에서 관리하는 factory를 사용합니다.

```tsx
export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters: Filters) => [...userKeys.lists(), filters] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
}

// 사용
useQuery({ queryKey: userKeys.detail(userId), queryFn: ... })

// 무효화: 모든 유저 관련 쿼리
queryClient.invalidateQueries({ queryKey: userKeys.all })
```

### 키에 직렬화 불가능한 값 금지

함수, Date 객체, class 인스턴스, Symbol을 키에 넣으면 안 됩니다. Date는 ISO 문자열로 변환합니다.

```tsx
// BAD
queryKey: ['events', new Date()]

// GOOD
queryKey: ['events', date.toISOString()]
```

---

## 캐시 설정 (CRITICAL)

### staleTime 적절히 설정

기본값 `0ms`는 마운트마다 refetch합니다. 데이터 특성에 따라 설정합니다.

| 데이터 유형 | staleTime |
|------------|-----------|
| 실시간 (채팅, 주가) | 0 |
| 자주 변경 (알림) | 30초~1분 |
| 사용자 생성 (게시물) | 1~5분 |
| 참조 데이터 (카테고리) | 10~30분 |
| 정적 (설정, 코드 테이블) | Infinity |

```tsx
// BAD: 설정 데이터를 기본값(0ms)으로 사용 — 불필요한 refetch
useQuery({ queryKey: ['config'], queryFn: fetchConfig })

// GOOD
useQuery({
  queryKey: ['config'],
  queryFn: fetchConfig,
  staleTime: 30 * 60 * 1000, // 30분
})
```

### 타겟 무효화 사용

광범위한 무효화 대신 영향받는 쿼리만 정확히 무효화합니다.

```tsx
// BAD: 모든 캐시 무효화
queryClient.invalidateQueries()

// GOOD: 관련 쿼리만 무효화
queryClient.invalidateQueries({ queryKey: ['todos'] })
```

### placeholderData vs initialData 구분

- `initialData`: 실제 캐시 데이터로 저장됨, staleTime이 적용됨. SSR이나 확실한 초기 데이터에 사용.
- `placeholderData`: 임시 표시용, 캐시되지 않음. 미리보기나 이전 페이지 데이터에 사용.

```tsx
// 페이지네이션에서 이전 데이터 유지
import { keepPreviousData } from '@tanstack/react-query'

useQuery({
  queryKey: ['todos', page],
  queryFn: () => fetchTodos(page),
  placeholderData: keepPreviousData,
})
```

---

## Mutation 규칙 (HIGH)

### mutation 성공 후 반드시 관련 쿼리 무효화

데이터를 변경한 뒤 관련 쿼리를 무효화하지 않으면 UI에 stale 데이터가 표시됩니다.

```tsx
// BAD: 무효화 없음
const mutation = useMutation({
  mutationFn: updateTodo,
})

// GOOD: 관련 쿼리 무효화
const mutation = useMutation({
  mutationFn: updateTodo,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] })
  },
})
```

모든 경우에 `onSettled`에서 무효화하면 성공/실패 모두 대응됩니다.

### 낙관적 업데이트 시 롤백 처리

낙관적 업데이트를 구현할 때는 반드시 `onError`에서 이전 데이터로 롤백해야 합니다.

```tsx
useMutation({
  mutationFn: updateTodo,
  onMutate: async (newTodo) => {
    await queryClient.cancelQueries({ queryKey: ['todos'] })
    const previous = queryClient.getQueryData(['todos'])
    queryClient.setQueryData(['todos'], (old) => /* 낙관적 업데이트 */)
    return { previous }  // 롤백 컨텍스트
  },
  onError: (err, newTodo, context) => {
    queryClient.setQueryData(['todos'], context?.previous)  // 롤백
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] })  // 서버 동기화
  },
})
```

### useMutationState로 크로스 컴포넌트 추적

mutation 상태를 다른 컴포넌트에서 참조해야 할 때 prop drilling 대신 `useMutationState`를 사용합니다. 이를 위해 mutation에 `mutationKey`를 설정합니다.

---

## 에러 처리 (HIGH)

### Error Boundary + useQueryErrorResetBoundary

Suspense 쿼리(`useSuspenseQuery`)는 Error Boundary와 함께 사용합니다. `useQueryErrorResetBoundary`로 "다시 시도" 기능을 구현합니다.

```tsx
function App() {
  const { reset } = useQueryErrorResetBoundary()
  return (
    <ErrorBoundary onReset={reset} fallbackRender={({ resetErrorBoundary }) => (
      <div>
        에러가 발생했습니다.
        <button onClick={resetErrorBoundary}>다시 시도</button>
      </div>
    )}>
      <Suspense fallback={<Loading />}>
        <UserList />
      </Suspense>
    </ErrorBoundary>
  )
}
```

---

## Prefetching (MEDIUM)

### 사용자 의도 기반 프리페치

클릭 전에 호버/포커스 시점에 데이터를 프리페치하면 체감 속도가 향상됩니다.

```tsx
<Link
  href={`/users/${id}`}
  onMouseEnter={() => queryClient.prefetchQuery({
    queryKey: ['users', id],
    queryFn: () => fetchUser(id),
  })}
>
  {user.name}
</Link>
```

### 프리페치 시 staleTime 설정

프리페치 데이터가 즉시 stale 처리되지 않도록 `staleTime`을 설정합니다.

---

## 성능 최적화 (LOW)

### select로 데이터 변환

컴포넌트가 쿼리 데이터의 일부만 필요하면 `select`로 필터/변환합니다. structural sharing으로 결과가 같으면 리렌더하지 않습니다.

```tsx
// BAD: 전체 데이터 구독 — 관련 없는 변경에도 리렌더
const { data: todos } = useQuery({ queryKey: ['todos'], queryFn: fetchTodos })
const completedCount = todos?.filter(t => t.done).length

// GOOD: 필요한 값만 구독
const { data: completedCount } = useQuery({
  queryKey: ['todos'],
  queryFn: fetchTodos,
  select: (todos) => todos.filter(t => t.done).length,
})
```

### 쿼리 취소에 AbortSignal 전달

queryFn에서 fetch를 호출할 때 AbortSignal을 전달하면, 컴포넌트 언마운트 시 자동으로 요청이 취소됩니다.

```tsx
useQuery({
  queryKey: ['todos'],
  queryFn: ({ signal }) => fetch('/api/todos', { signal }).then(r => r.json()),
})
```

---

## SSR 통합 (MEDIUM)

### Dehydrate/Hydrate 패턴

서버에서 프리페치한 데이터를 클라이언트로 전달하여 중복 요청과 콘텐츠 깜빡임을 방지합니다.

```tsx
// Server Component
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'

export default async function Page() {
  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TodoList />
    </HydrationBoundary>
  )
}
```

### 서버에서 staleTime > 0 설정

서버에서 prefetch한 데이터의 staleTime이 0이면 클라이언트 마운트 시 즉시 refetch합니다. 서버 데이터를 활용하려면 staleTime을 적절히 설정합니다.
