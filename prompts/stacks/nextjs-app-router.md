# Next.js App Router 리뷰 규칙

이 프로젝트는 Next.js App Router를 사용합니다. 아래 규칙을 추가로 적용하세요.

---

## Server/Client Component 경계 (CRITICAL)

### async Client Component 금지

Client Component(`'use client'`)는 async가 될 수 없습니다. 비동기 데이터가 필요하면 Server Component에서 fetch하거나, 클라이언트에서 useEffect/TanStack Query를 사용합니다.

```tsx
// BAD: Client Component에서 async 사용
'use client'
export default async function Dashboard() {
  const data = await fetchData() // 런타임 에러
}

// GOOD: Server Component로 분리
export default async function Dashboard() {
  const data = await fetchData()
  return <DashboardClient data={data} />
}
```

### 직렬화 불가능한 props 전달 금지

Server → Client Component로 전달하는 props는 JSON 직렬화 가능해야 합니다. 함수, Date, Map, Set, class 인스턴스를 prop으로 전달하면 안 됩니다.

```tsx
// BAD: 함수를 Server → Client로 전달
<ClientComponent onSubmit={handleSubmit} /> // Server Action이 아닌 일반 함수

// BAD: Date 객체 전달
<ClientComponent date={new Date()} />

// GOOD: ISO 문자열로 변환
<ClientComponent dateStr={new Date().toISOString()} />
```

**예외:** Server Action(`'use server'` 함수)은 Client Component에 prop으로 전달할 수 있습니다.

### 'use client' 디렉티브 위치

- 파일 최상단에만 위치 가능
- 서버에서 가능한 작업(데이터 fetching, 메타데이터)을 Client Component에서 하고 있지 않은지 확인
- 클라이언트 경계는 가능한 한 아래로 밀어내기 (leaf component에 가깝게)

---

## Async API 패턴 (Next.js 15+) (CRITICAL)

### params, searchParams는 Promise

Next.js 15+에서 `params`와 `searchParams`는 Promise입니다. await하지 않으면 런타임 에러가 발생합니다.

```tsx
// BAD (Next.js 15+)
export default function Page({ params }: { params: { id: string } }) {
  return <div>{params.id}</div>
}

// GOOD
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <div>{id}</div>
}
```

### cookies(), headers()도 async

```tsx
// BAD
const cookieStore = cookies()

// GOOD
const cookieStore = await cookies()
```

---

## 데이터 패턴 (HIGH)

### Server Component에서 직접 fetch 우선

읽기 작업은 Server Component에서 직접 수행합니다. Client Component에서 API Route를 호출하는 것보다 효율적입니다.

```tsx
// BAD: 불필요한 API Route 경유
// app/api/users/route.ts + Client Component에서 fetch('/api/users')

// GOOD: Server Component에서 직접
async function UsersPage() {
  const users = await db.users.findMany()
  return <UserList users={users} />
}
```

### 데이터 워터폴 방지

순차적 await는 워터폴을 만듭니다. 독립적인 요청은 Promise.all로 병렬화합니다.

```tsx
// BAD: 워터폴 — user 완료 후 posts 시작
const user = await getUser(id)
const posts = await getPosts(id)

// GOOD: 병렬 실행
const [user, posts] = await Promise.all([getUser(id), getPosts(id)])
```

### Suspense로 스트리밍

느린 데이터는 Suspense로 감싸서 나머지 페이지를 먼저 전송합니다.

```tsx
export default function Page() {
  return (
    <div>
      <Header />
      <Suspense fallback={<Skeleton />}>
        <SlowDataSection />
      </Suspense>
    </div>
  )
}
```

---

## 하이드레이션 에러 방지 (HIGH)

### 브라우저 전용 API

`window`, `document`, `localStorage` 등은 서버에서 존재하지 않습니다. 조건부로 사용하거나 `'use client'` + `useEffect` 안에서 사용합니다.

```tsx
// BAD: SSR에서 에러
const width = window.innerWidth

// GOOD
const [width, setWidth] = useState(0)
useEffect(() => setWidth(window.innerWidth), [])
```

### 날짜/시간 불일치

서버와 클라이언트에서 `new Date()`, `Date.now()` 결과가 다릅니다. 서버에서 렌더링한 시간과 클라이언트 하이드레이션 시 시간이 불일치하면 에러가 발생합니다.

### 잘못된 HTML 중첩

`<p>` 안에 `<div>`, `<a>` 안에 `<a>` 등 유효하지 않은 HTML 중첩은 하이드레이션 에러를 유발합니다.

---

## 에러 처리 (HIGH)

### error.tsx 활용

- `error.tsx`: 해당 라우트 세그먼트의 에러를 잡음
- `global-error.tsx`: 루트 레이아웃 에러를 잡음 (자체 `<html>`, `<body>` 필요)
- `not-found.tsx`: 404 페이지

### Server Action에서의 redirect/notFound

Server Action 내에서 `redirect()`, `notFound()`, `unauthorized()`, `forbidden()`은 내부적으로 에러를 throw합니다. try/catch 안에서 사용하면 catch에 잡힙니다.

```tsx
// BAD: redirect가 catch에 잡힘
async function action() {
  try {
    await saveData()
    redirect('/success')
  } catch (e) {
    // redirect도 여기에 잡힘!
  }
}

// GOOD: unstable_rethrow 사용
import { unstable_rethrow } from 'next/navigation'

async function action() {
  try {
    await saveData()
    redirect('/success')
  } catch (e) {
    unstable_rethrow(e)
    // 여기서부터 실제 에러 처리
  }
}
```

---

## Suspense 경계 (MEDIUM)

### useSearchParams는 반드시 Suspense 필요

`useSearchParams()`를 사용하는 컴포넌트는 `<Suspense>`로 감싸야 합니다. 감싸지 않으면 전체 페이지가 CSR로 빠집니다.

```tsx
// BAD: Suspense 없이 사용
export default function Page() {
  return <SearchResults />  // useSearchParams 내부 사용
}

// GOOD
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <SearchResults />
    </Suspense>
  )
}
```

---

## Route Handler 규칙 (MEDIUM)

### page.tsx와 route.ts 공존 불가

같은 라우트 세그먼트에 `page.tsx`와 `route.ts`를 동시에 둘 수 없습니다.

### Server Action vs Route Handler

- 폼 처리, 데이터 변경 → Server Action 사용
- 외부 서비스에서 호출되는 API, Webhook → Route Handler 사용
- 클라이언트에서 데이터 읽기 → Server Component 또는 TanStack Query + Route Handler

---

## 이미지/폰트 최적화 (MEDIUM)

### next/image 필수

`<img>` 태그 대신 반드시 `next/image`를 사용합니다.

- 리모트 이미지는 `remotePatterns` 설정 필요
- LCP 이미지에는 `priority` 속성 추가
- `sizes` 속성으로 반응형 이미지 최적화

### next/font 사용

- CSS `@import`나 `<link>` 대신 `next/font` 사용
- Google Fonts는 빌드 타임에 다운로드되어 외부 요청 없음
- 컴포넌트마다 import하지 말고 루트 레이아웃에서 한 번만 설정

---

## 메타데이터 (LOW)

- 메타데이터는 Server Component에서만 설정 가능
- 동적 메타데이터는 `generateMetadata` 함수 사용
- `generateMetadata`에서 fetch한 데이터를 `React.cache()`로 감싸면 페이지 컴포넌트와 중복 요청 방지
