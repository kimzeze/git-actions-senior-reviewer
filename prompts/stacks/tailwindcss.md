# TailwindCSS 리뷰 규칙

이 프로젝트는 TailwindCSS를 사용합니다. 아래 규칙을 적용하세요.

---

## 유틸리티 클래스 사용 (HIGH)

### 인라인 스타일 대신 유틸리티 클래스

```tsx
// BAD
<div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>

// GOOD
<div className="flex justify-center p-4">
```

### 동적 클래스에 문자열 조합 금지

Tailwind의 JIT 컴파일러는 정적 분석으로 클래스를 추출합니다. 동적 문자열 조합은 클래스가 누락됩니다.

```tsx
// BAD: JIT가 감지 못함
<div className={`text-${color}-500`}>

// GOOD: 전체 클래스명 사용
const colorMap = {
  red: 'text-red-500',
  blue: 'text-blue-500',
} as const
<div className={colorMap[color]}>
```

### cn/clsx로 조건부 클래스 관리

여러 조건부 클래스가 있을 때는 `cn()`, `clsx()`, `cva()` 등의 유틸리티를 사용합니다.

```tsx
// BAD: 복잡한 삼항 연산
<button className={`px-4 py-2 ${active ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>

// GOOD
<button className={cn(
  'px-4 py-2',
  active ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700',
  disabled && 'opacity-50 cursor-not-allowed',
)}>
```

---

## 반응형 디자인 (MEDIUM)

### 모바일 퍼스트

Tailwind는 모바일 퍼스트입니다. 기본 스타일이 모바일이고, `sm:`, `md:`, `lg:` 등으로 확장합니다.

```tsx
// BAD: 데스크탑 퍼스트
<div className="flex lg:flex md:flex sm:block">

// GOOD: 모바일 퍼스트
<div className="block sm:flex">
```

---

## 커스텀 값 (MEDIUM)

### 임의 값(arbitrary values) 반복 사용 금지

`w-[347px]` 같은 임의 값이 반복되면 `tailwind.config`에 커스텀 값을 추가합니다.

```tsx
// BAD: 임의 값 반복
<div className="w-[347px]">  // 여러 곳에서 반복
<div className="w-[347px]">

// GOOD: config에 정의
// tailwind.config.ts: theme.extend.width: { 'card': '347px' }
<div className="w-card">
```

---

## 다크 모드 (LOW)

### dark: prefix 일관성

다크 모드를 지원한다면, 색상을 지정할 때 `dark:` variant를 항상 함께 지정합니다. 한쪽만 지정하면 모드 전환 시 가독성 문제가 발생합니다.

```tsx
// BAD: 다크 모드 고려 안 됨
<p className="text-gray-900">

// GOOD: 양쪽 모두 지정
<p className="text-gray-900 dark:text-gray-100">
```
