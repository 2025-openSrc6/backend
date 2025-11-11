// store/useChartStore.ts
// 차트 모듈 상태 관리 (Zustand)

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type {
  AssetType,
  TimeRange,
  ChartType,
  ViewMode,
  PriceData,
  VolatilityMetrics,
  ComparisonData,
  BettingMarker,
  ChartConfig,
} from '@/types/chart';

interface ChartState {
  // 설정
  config: ChartConfig;

  // 실시간 데이터
  realtimeData: Map<AssetType, PriceData>;
  historicalData: Map<AssetType, PriceData[]>;

  // 변동성 데이터
  volatilityData: Map<AssetType, VolatilityMetrics>;

  // 비교 데이터
  comparisonData: ComparisonData | null;

  // 베팅 마커
  bettingMarkers: BettingMarker[];

  // 로딩 상태
  isLoading: boolean;
  error: string | null;

  // WebSocket 연결 상태
  wsConnected: boolean;
  wsReconnecting: boolean;
}

interface ChartActions {
  // 설정 변경
  setViewMode: (mode: ViewMode) => void;
  setChartType: (type: ChartType) => void;
  setTimeRange: (range: TimeRange) => void;
  setSelectedAssets: (assets: AssetType[]) => void;
  toggleVolatility: () => void;
  toggleBettingMarkers: () => void;

  // 데이터 업데이트
  updateRealtimeData: (asset: AssetType, data: PriceData) => void;
  setHistoricalData: (asset: AssetType, data: PriceData[]) => void;
  updateVolatilityData: (asset: AssetType, metrics: VolatilityMetrics) => void;
  setComparisonData: (data: ComparisonData) => void;

  // 베팅 마커
  addBettingMarker: (marker: BettingMarker) => void;
  updateBettingMarker: (id: string, updates: Partial<BettingMarker>) => void;
  removeBettingMarker: (id: string) => void;

  // 상태 관리
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setWsConnected: (connected: boolean) => void;
  setWsReconnecting: (reconnecting: boolean) => void;

  // 유틸리티
  reset: () => void;
  fetchHistoricalData: (asset: AssetType, range: TimeRange) => Promise<void>;
  fetchVolatilityData: (asset: AssetType) => Promise<void>;
  fetchComparisonData: (assets: AssetType[], range: TimeRange) => Promise<void>;
}

type ChartStore = ChartState & ChartActions;

const initialState: ChartState = {
  config: {
    viewMode: 'dual',
    chartType: 'line',
    timeRange: '24h',
    selectedAssets: ['PAXG', 'BTC'],
    showVolume: true,
    showVolatility: true,
    showBettingMarkers: true,
    showTechnicalIndicators: false,
    colors: {
      PAXG: '#FFD700',
      BTC: '#F7931A',
      ETH: '#627EEA',
      SOL: '#14F195',
    },
  },
  realtimeData: new Map(),
  historicalData: new Map(),
  volatilityData: new Map(),
  comparisonData: null,
  bettingMarkers: [],
  isLoading: false,
  error: null,
  wsConnected: false,
  wsReconnecting: false,
};

export const useChartStore = create<ChartStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // 설정 변경
        setViewMode: (mode) =>
          set((state) => ({
            config: { ...state.config, viewMode: mode },
          })),

        setChartType: (type) =>
          set((state) => ({
            config: { ...state.config, chartType: type },
          })),

        setTimeRange: (range) =>
          set((state) => ({
            config: { ...state.config, timeRange: range },
          })),

        setSelectedAssets: (assets) =>
          set((state) => ({
            config: { ...state.config, selectedAssets: assets },
          })),

        toggleVolatility: () =>
          set((state) => ({
            config: {
              ...state.config,
              showVolatility: !state.config.showVolatility,
            },
          })),

        toggleBettingMarkers: () =>
          set((state) => ({
            config: {
              ...state.config,
              showBettingMarkers: !state.config.showBettingMarkers,
            },
          })),

        // 데이터 업데이트
        updateRealtimeData: (asset, data) =>
          set((state) => {
            const newMap = new Map(state.realtimeData);
            newMap.set(asset, data);
            return { realtimeData: newMap };
          }),

        setHistoricalData: (asset, data) =>
          set((state) => {
            const newMap = new Map(state.historicalData);
            newMap.set(asset, data);
            return { historicalData: newMap };
          }),

        updateVolatilityData: (asset, metrics) =>
          set((state) => {
            const newMap = new Map(state.volatilityData);
            newMap.set(asset, metrics);
            return { volatilityData: newMap };
          }),

        setComparisonData: (data) => set({ comparisonData: data }),

        // 베팅 마커
        addBettingMarker: (marker) =>
          set((state) => ({
            bettingMarkers: [...state.bettingMarkers, marker],
          })),

        updateBettingMarker: (id, updates) =>
          set((state) => ({
            bettingMarkers: state.bettingMarkers.map((marker) =>
              marker.id === id ? { ...marker, ...updates } : marker
            ),
          })),

        removeBettingMarker: (id) =>
          set((state) => ({
            bettingMarkers: state.bettingMarkers.filter((m) => m.id !== id),
          })),

        // 상태 관리
        setLoading: (loading) => set({ isLoading: loading }),
        setError: (error) => set({ error }),
        setWsConnected: (connected) => set({ wsConnected: connected }),
        setWsReconnecting: (reconnecting) => set({ wsReconnecting: reconnecting }),

        // 유틸리티
        reset: () => set(initialState),

        // API 호출
        fetchHistoricalData: async (asset, range) => {
          set({ isLoading: true, error: null });
          try {
            const response = await fetch(
              `/api/chart/historical?asset=${asset}&range=${range}`
            );
            if (!response.ok) throw new Error('Failed to fetch historical data');
            const data = await response.json();
            get().setHistoricalData(asset, data);
          } catch (error) {
            set({ error: (error as Error).message });
          } finally {
            set({ isLoading: false });
          }
        },

        fetchVolatilityData: async (asset) => {
          try {
            const response = await fetch(`/api/chart/volatility?asset=${asset}`);
            if (!response.ok) throw new Error('Failed to fetch volatility data');
            const data = await response.json();
            get().updateVolatilityData(asset, data);
          } catch (error) {
            console.error('Volatility fetch error:', error);
          }
        },

        fetchComparisonData: async (assets, range) => {
          set({ isLoading: true, error: null });
          try {
            const response = await fetch(
              `/api/chart/compare?assets=${assets.join(',')}&range=${range}`
            );
            if (!response.ok) throw new Error('Failed to fetch comparison data');
            const data = await response.json();
            set({ comparisonData: data });
          } catch (error) {
            set({ error: (error as Error).message });
          } finally {
            set({ isLoading: false });
          }
        },
      }),
      {
        name: 'chart-storage',
        partialize: (state) => ({
          config: state.config,
        }),
      }
    )
  )
);
