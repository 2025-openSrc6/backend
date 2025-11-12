# 차트 모듈 구현 가이드

**작성자**: 김현준
**작성일**: 2025-11-11
**대상**: 개발팀 전체

---

## 📚 문서 네비게이션

### 설계 문서
1. [ERD 다이어그램](./chart-erd-diagram.md) - 데이터베이스 스키마
2. [UI 목업](./chart-ui-mockup.md) - 화면 설계

### 구현 참고
3. [스키마 파일](../db/schema/index.ts) - Drizzle 스키마
4. [개인작업본 README](../개인작업본/README.md) - 전체 개요 (비공개)

---

## 🎯 구현 우선순위

### Week 2 (11/12 - 11/18): 기본 기능
- [ ] **Priority 1**: ChartData 테이블 마이그레이션
- [ ] **Priority 2**: GET /api/chart/price/:asset 엔드포인트
- [ ] **Priority 3**: 기본 PriceChart 컴포넌트 (Recharts)
- [ ] **Priority 4**: useChartStore 상태 관리

### Week 3 (11/19 - 11/25): 핵심 기능
- [ ] **Priority 1**: WebSocket 실시간 스트리밍
- [ ] **Priority 2**: VolatilitySnapshots 계산 로직
- [ ] **Priority 3**: BettingMarkers 연동
- [ ] **Priority 4**: VolatilityPanel 컴포넌트

---

## 🗄️ 데이터베이스 마이그레이션

### 1. 스키마 생성

```bash
# 마이그레이션 파일 생성
npm run db:generate
```

**생성 파일**: `drizzle/0002_add_chart_tables.sql`

### 2. 마이그레이션 적용

```bash
# 로컬 개발
npm run db:migrate

# 프로덕션 (Cloudflare D1)
npx wrangler d1 migrations apply deltax-db --remote
```

### 3. 스키마 검증

```bash
# Drizzle Studio로 확인
npm run db:studio
# → http://localhost:4983
```

---

## 📡 API 엔드포인트 구현

### 1. 가격 조회 API

**파일**: `app/api/chart/price/[asset]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { chartData } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: { asset: string } }
) {
  try {
    const { asset } = params;

    // 최신 가격 조회
    const latestPrice = await db
      .select()
      .from(chartData)
      .where(eq(chartData.asset, asset))
      .orderBy(desc(chartData.timestamp))
      .limit(1);

    if (latestPrice.length === 0) {
      return NextResponse.json(
        { error: 'No data found for asset' },
        { status: 404 }
      );
    }

    return NextResponse.json(latestPrice[0]);
  } catch (error) {
    console.error('Price API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**테스트**:
```bash
curl http://localhost:3000/api/chart/price/PAXG
```

### 2. 히스토리 조회 API

**파일**: `app/api/chart/historical/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { chartData } from '@/db/schema';
import { eq, gte, asc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const asset = searchParams.get('asset');
    const range = searchParams.get('range') || '24h';

    if (!asset) {
      return NextResponse.json(
        { error: 'Asset parameter required' },
        { status: 400 }
      );
    }

    // 시간 범위 계산
    const startTime = getStartTime(range);

    // 데이터 조회
    const data = await db
      .select()
      .from(chartData)
      .where(
        eq(chartData.asset, asset),
        gte(chartData.timestamp, startTime)
      )
      .orderBy(asc(chartData.timestamp));

    return NextResponse.json(data);
  } catch (error) {
    console.error('Historical API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function getStartTime(range: string): Date {
  const now = Date.now();
  const ranges: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };

  return new Date(now - (ranges[range] || ranges['24h']));
}
```

---

## 🎨 컴포넌트 구현

### 1. PriceChart 컴포넌트

**파일**: `app/components/chart/PriceChart.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useChartStore } from '@/store/useChartStore';

interface PriceChartProps {
  asset: 'PAXG' | 'BTC' | 'ETH' | 'SOL';
}

export function PriceChart({ asset }: PriceChartProps) {
  const { historicalData, fetchHistoricalData, config } = useChartStore();
  const data = historicalData.get(asset) || [];

  useEffect(() => {
    // 데이터 로드
    fetchHistoricalData(asset, config.timeRange);
  }, [asset, config.timeRange]);

  return (
    <div className="p-4 bg-card rounded-lg border">
      <h3 className="text-lg font-semibold mb-4">{asset} Price Chart</h3>

      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
          />
          <YAxis
            tickFormatter={(price) => `$${price.toFixed(2)}`}
          />
          <Tooltip
            labelFormatter={(ts) => new Date(ts).toLocaleString()}
            formatter={(price: number) => [`$${price.toFixed(2)}`, 'Price']}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#FFD700"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### 2. ChartStore (Zustand)

**파일**: `store/useChartStore.ts`

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type AssetType = 'PAXG' | 'BTC' | 'ETH' | 'SOL';
export type TimeRange = '1h' | '24h' | '7d' | '30d' | 'all';

interface ChartData {
  id: number;
  asset: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartState {
  // 설정
  config: {
    timeRange: TimeRange;
    selectedAssets: AssetType[];
  };

  // 데이터
  historicalData: Map<AssetType, ChartData[]>;
  isLoading: boolean;
  error: string | null;

  // 액션
  setTimeRange: (range: TimeRange) => void;
  setSelectedAssets: (assets: AssetType[]) => void;
  fetchHistoricalData: (asset: AssetType, range: TimeRange) => Promise<void>;
}

export const useChartStore = create<ChartState>()(
  devtools((set, get) => ({
    // 초기 상태
    config: {
      timeRange: '24h',
      selectedAssets: ['PAXG', 'BTC'],
    },
    historicalData: new Map(),
    isLoading: false,
    error: null,

    // 액션
    setTimeRange: (range) =>
      set((state) => ({
        config: { ...state.config, timeRange: range },
      })),

    setSelectedAssets: (assets) =>
      set((state) => ({
        config: { ...state.config, selectedAssets: assets },
      })),

    fetchHistoricalData: async (asset, range) => {
      set({ isLoading: true, error: null });

      try {
        const response = await fetch(
          `/api/chart/historical?asset=${asset}&range=${range}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }

        const data = await response.json();

        set((state) => {
          const newMap = new Map(state.historicalData);
          newMap.set(asset, data);
          return { historicalData: newMap, isLoading: false };
        });
      } catch (error) {
        set({
          error: (error as Error).message,
          isLoading: false,
        });
      }
    },
  }))
);
```

---

## 🔌 WebSocket 구현 (Week 3)

### Server Side

**파일**: `app/api/chart/realtime/route.ts`

```typescript
import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';

let io: SocketIOServer | null = null;

export async function GET(req: Request) {
  if (!io) {
    const httpServer: HTTPServer = (global as any).httpServer;
    io = new SocketIOServer(httpServer, {
      path: '/api/chart/realtime',
      cors: { origin: '*' },
    });

    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      socket.on('subscribe', (assets: string[]) => {
        assets.forEach((asset) => {
          socket.join(`asset:${asset}`);
        });
        console.log('Subscribed to:', assets);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });

    // 실시간 가격 업데이트 (1초마다)
    setInterval(async () => {
      const assets = ['PAXG', 'BTC', 'ETH', 'SOL'];

      for (const asset of assets) {
        const price = await fetchLatestPrice(asset);
        io?.to(`asset:${asset}`).emit('price-update', price);
      }
    }, 1000);
  }

  return new Response('WebSocket server running', { status: 200 });
}

async function fetchLatestPrice(asset: string) {
  // 실제로는 CoinGecko/Binance API 호출
  // 여기서는 예시로 랜덤 데이터
  const basePrice = asset === 'PAXG' ? 2650 : 45000;
  const change = (Math.random() - 0.5) * 10;

  return {
    asset,
    timestamp: Date.now(),
    price: basePrice + change,
    volume: Math.random() * 1000000,
  };
}
```

### Client Side

**파일**: `hooks/useWebSocket.ts`

```typescript
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useChartStore } from '@/store/useChartStore';

export function useWebSocket(assets: string[]) {
  const socketRef = useRef<Socket | null>(null);
  const { updateRealtimeData } = useChartStore();

  useEffect(() => {
    // WebSocket 연결
    const socket = io({
      path: '/api/chart/realtime',
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      socket.emit('subscribe', assets);
    });

    socket.on('price-update', (data) => {
      updateRealtimeData(data.asset, data);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [assets]);

  return socketRef.current;
}
```

---

## 🧪 테스트 가이드

### 1. API 테스트

```bash
# 가격 조회
curl http://localhost:3000/api/chart/price/PAXG

# 히스토리 조회
curl "http://localhost:3000/api/chart/historical?asset=BTC&range=24h"
```

### 2. 컴포넌트 테스트

**파일**: `__tests__/components/PriceChart.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { PriceChart } from '@/components/chart/PriceChart';

describe('PriceChart', () => {
  it('renders chart title', () => {
    render(<PriceChart asset="PAXG" />);
    expect(screen.getByText('PAXG Price Chart')).toBeInTheDocument();
  });

  it('fetches data on mount', async () => {
    const { fetchHistoricalData } = useChartStore.getState();
    render(<PriceChart asset="BTC" />);
    // fetchHistoricalData가 호출되었는지 검증
  });
});
```

---

## 📦 패키지 설치

```bash
# 차트 라이브러리
npm install recharts

# 상태 관리
npm install zustand

# WebSocket
npm install socket.io socket.io-client

# UI 컴포넌트
npx shadcn-ui@latest add button card select

# 타입
npm install -D @types/node
```

---

## 🚀 개발 서버 실행

```bash
# 개발 서버 시작
npm run dev

# 브라우저에서 열기
# http://localhost:3000/chart
```

---

## 📝 체크리스트

### Week 2 시작 전
- [ ] 팀원들에게 설계 문서 공유
- [ ] ERD 승인 받기
- [ ] UI 목업 피드백 받기
- [ ] 다른 모듈과의 인터페이스 협의

### Week 2 개발
- [ ] 데이터베이스 마이그레이션
- [ ] API 엔드포인트 2개 구현
- [ ] PriceChart 컴포넌트 구현
- [ ] useChartStore 구현
- [ ] 기본 테스트 작성

### Week 3 개발
- [ ] WebSocket 서버 구현
- [ ] 실시간 가격 업데이트
- [ ] VolatilityPanel 구현
- [ ] BettingMarkers 연동
- [ ] 통합 테스트

---

## 🐛 트러블슈팅

### 문제 1: Drizzle 마이그레이션 실패

```bash
# 해결방법: 스키마 리셋
npm run db:drop
npm run db:push
```

### 문제 2: WebSocket 연결 안 됨

```typescript
// 해결방법: CORS 설정 확인
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL,
    credentials: true,
  },
});
```

### 문제 3: Recharts 차트가 안 보임

```typescript
// 해결방법: ResponsiveContainer 높이 명시
<ResponsiveContainer width="100%" height={400}>
  <LineChart data={data}>...</LineChart>
</ResponsiveContainer>
```

---

## 📞 연락처

**담당자**: 김현준
**역할**: 차트 모듈
**Slack**: @hyeonjun (예시)

**질문/이슈**:
- 설계 관련: chart-erd-diagram.md 참고
- 구현 관련: 이 문서 참고
- 버그: GitHub Issues

---

**문서 버전**: 1.0
**마지막 업데이트**: 2025-11-11
