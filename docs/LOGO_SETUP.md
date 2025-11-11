# 프로젝트 로고 설정 가이드

## 📌 현재 상태

로고 파일이 다음 위치에 저장되어 있습니다:
```
public/logo.png (898KB)
```

---

## 🎨 로고 적용 방법

### 1️⃣ Favicon 설정 (브라우저 탭)

**파일: `app/layout.tsx`**

```typescript
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'DeltaX - 금과 비트코인 예측 게임',
  description: 'AI 기반 금과 비트코인 가격 예측 게임 플랫폼',
  icons: {
    icon: '/logo.png',  // ← favicon 설정
  },
}
```

---

### 2️⃣ 메인 페이지에 로고 표시

**파일: `app/page.tsx` 또는 `app/layout.tsx`**

```typescript
import Image from 'next/image'

export default function Home() {
  return (
    <div>
      <Image
        src="/logo.png"
        alt="DeltaX Logo"
        width={200}
        height={200}
        priority
      />
    </div>
  )
}
```

---

### 3️⃣ 네비게이션 바에 로고

**파일: `app/components/header.tsx` (예시)**

```typescript
import Image from 'next/image'
import Link from 'next/link'

export function Header() {
  return (
    <header className="flex items-center justify-between p-4 bg-black">
      <Link href="/">
        <Image
          src="/logo.png"
          alt="DeltaX"
          width={50}
          height={50}
        />
      </Link>
      {/* 네비게이션 메뉴 */}
    </header>
  )
}
```

---

### 4️⃣ 로고 크기 정리

로고를 다양한 크기로 사용할 경우:

```typescript
// 작은 크기 (헤더)
<Image src="/logo.png" alt="Logo" width={50} height={50} />

// 중간 크기 (페이지 섹션)
<Image src="/logo.png" alt="Logo" width={200} height={200} />

// 큰 크기 (히어로 섹션)
<Image src="/logo.png" alt="Logo" width={400} height={400} />
```

---

## 📂 현재 파일 구조

```
public/
└── logo.png  ← 여기에 로고가 저장됨

app/
├── layout.tsx
├── page.tsx
├── shop/
│   └── page.tsx  ← NFT Shop 페이지
└── components/
    ├── nft-shop.tsx
    ├── nft-card.tsx
    ├── theme-provider.tsx
    └── ui/
        ├── button.tsx
        ├── card.tsx
        ├── badge.tsx
        └── ... (다른 UI 컴포넌트들)
```

---

## 🌐 NFT Shop 페이지 접속

로고 설정 후 다음 경로에서 NFT Shop을 볼 수 있습니다:

```
http://localhost:3000/shop
```

---

## 💡 추가 팁

### 다크모드에 맞는 로고 사용

```typescript
<div className="dark:block hidden">
  <Image src="/logo-dark.png" alt="Logo" />
</div>
<div className="dark:hidden block">
  <Image src="/logo-light.png" alt="Logo" />
</div>
```

### 로고 최적화

```typescript
import Image from 'next/image'

<Image
  src="/logo.png"
  alt="DeltaX Logo"
  width={200}
  height={200}
  quality={90}
  priority  // 초기 로드 우선순위
/>
```

---

## ✅ 체크리스트

- [ ] `public/logo.png` 확인
- [ ] `app/layout.tsx`에 favicon 설정
- [ ] 메인 페이지에 로고 표시
- [ ] `/shop` 경로에서 NFT Shop 확인
- [ ] 브라우저 탭에 로고 아이콘 표시 확인

---

**로고가 정상적으로 표시되지 않으면 다음을 확인하세요:**
1. `public/` 폴더 위치 확인
2. `logo.png` 파일명 정확성
3. Next.js 개발 서버 재시작

