# App Router

아래와 같은 방식으로 확장할 수 있습니다

```
├── 📁 app/                          # Next.js 14 App Router
│   ├── 📁 (routes)/                 # 페이지 라우트
│   │   ├── 📁 page.tsx              # 메인 페이지 (도영)
│   │   ├── 📁 rankings/             # 랭킹 페이지 (도영)
│   │   ├── 📁 shop/                 # NFT 샵 (영민)
│   │   └── 📁 chart/                # 차트 페이지 (현준)
│   │
│   ├── 📁 api/                      # Backend API Routes
│   │
│   ├── layout.tsx                   # Root Layout (공통)
│   ├── providers.tsx                # Context Providers (도영/영민)
│   └── globals.css                  # Global Styles (공통)
```
