'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wallet, Zap, LogOut, ArrowRight, Sparkles, BarChart3, Activity } from 'lucide-react';

import { RankingList } from '@/components/RankingList';
import { AccountConnectCard } from '@/components/AccountConnectCard';
import { PointsPanel } from '@/components/PointsPanel';
import { DashboardMiniChart } from '@/components/DashboardMiniChart';
import {
  useCurrentWallet,
  useConnectWallet,
  useWallets,
  useDisconnectWallet,
} from '@mysten/dapp-kit';

// 메인 트레이드 대시보드 (Basevol 스타일 레이아웃 레퍼런스)
export default function HomePage() {
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [points, setPoints] = useState(12000);
  const [timeframe, setTimeframe] = useState<'1M' | '6H' | '1D'>('1D');

  const { currentWallet } = useCurrentWallet();
  const { mutate: connectWallet } = useConnectWallet();
  const { mutate: disconnectWallet } = useDisconnectWallet();
  const wallets = useWallets();

  // 페이지 로드 시 쿠키에서 주소 읽어서 상태 복원
  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.user) {
          setIsConnected(true);
          setWalletAddress(data.data.user.suiAddress);
        }
      })
      .catch(() => {
        // 에러 무시 (로그인 안 된 상태일 수 있음)
      });
  }, []);

  // currentWallet 상태 동기화
  useEffect(() => {
    if (currentWallet?.accounts[0]?.address) {
      const address = currentWallet.accounts[0].address;
      setIsConnected(true);
      setWalletAddress(address);
    } else if (!currentWallet) {
      setIsConnected(false);
      setWalletAddress('');
    }
  }, [currentWallet]);

  const handleConnect = async () => {
    // 사용 가능한 지갑이 없으면 에러 처리
    if (wallets.length === 0) {
      alert('사용 가능한 지갑이 없습니다. Sui 지갑 확장 프로그램을 설치해주세요.');
      return;
    }

    // 첫 번째 사용 가능한 지갑 사용
    const wallet = wallets[0];

    try {
      // 지갑의 connect 메서드를 직접 호출
      if (wallet.features && wallet.features['standard:connect']) {
        const connectFeature = wallet.features['standard:connect'];
        const result = await connectFeature.connect();

        if (result.accounts && result.accounts.length > 0) {
          const address = result.accounts[0].address;

          // API 호출
          const response = await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ suiAddress: address }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              setIsConnected(true);
              setWalletAddress(address);
            } else {
              // 에러 응답 처리
              alert(data.error?.message || '로그인에 실패했습니다.');
            }
          } else {
            const error = await response.json();
            alert(error.error?.message || '로그인에 실패했습니다.');
          }
        }
      } else {
        // fallback: useConnectWallet 사용
        connectWallet(
          { wallet },
          {
            onSuccess: async (result) => {
              const address = result.accounts[0].address;

              // API 호출
              const response = await fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ suiAddress: address }),
              });

              if (response.ok) {
                const data = await response.json();
                if (data.success) {
                  setIsConnected(true);
                  setWalletAddress(address);
                } else {
                  // 에러 응답 처리
                  alert(data.error?.message || '로그인에 실패했습니다.');
                }
              } else {
                const error = await response.json();
                alert(error.error?.message || '로그인에 실패했습니다.');
              }
            },
            onError: (error) => {
              console.error('지갑 연결 실패:', error);
              alert('지갑 연결에 실패했습니다. 다시 시도해주세요.');
            },
          },
        );
      }
    } catch (error) {
      console.error('지갑 연결 중 오류:', error);
      alert('지갑 연결 중 오류가 발생했습니다.');
    }
  };

  const handleDisconnect = async () => {
    // 로그아웃 API 호출
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {
      // 에러 무시
    });

    // 지갑 연결 해제
    if (currentWallet) {
      // 지갑의 disconnect 기능을 직접 호출
      if (currentWallet.features && currentWallet.features['standard:disconnect']) {
        const disconnectFeature = currentWallet.features['standard:disconnect'];
        await disconnectFeature.disconnect();
      } else {
        // fallback: useDisconnectWallet 사용
        disconnectWallet();
      }
    } else {
      // useDisconnectWallet 사용
      disconnectWallet();
    }

    setIsConnected(false);
    setWalletAddress('');
  };

  const displayAddress =
    walletAddress.length > 10
      ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`
      : walletAddress;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#02040a] text-slate-50 px-2 py-3 sm:px-4 sm:py-6">
      {/* 배경 그라디언트 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-[-10rem] h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-purple-500/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#020617,_#000)] opacity-70" />
      </div>

      {/* 전체 레이아웃 컨테이너 */}
      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col rounded-[32px] px-3 pb-6 pt-3 shadow-[0_0_80px_rgba(0,0,0,0.85)] lg:px-6">
        {/* 상단 글로벌 헤더 */}
        <header className="mb-3 flex items-center justify-between rounded-[24px] border border-slate-800/80 bg-slate-950/80 px-4 shadow-lg shadow-black/40 backdrop-blur-md lg:px-5">
          {/* 로고 + 타이틀 */}
          <div className="flex items-center gap-3">
            <div className="relative h-18 w-18 overflow-hidden rounded-2xl ">
              <Image
                src="/logo.png"
                alt="DeltaX Logo"
                fill
                className="object-contain p-1.5"
                priority
              />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-sm font-extrabold tracking-[0.22em] text-transparent lg:text-base">
                DELTA X
              </span>
            </div>
          </div>

          {/* 헤더 오른쪽: 타임프레임 탭 + 연결 상태 */}
          <div className="flex items-center gap-3">
            {/* 타임프레임 탭 */}
            <Tabs
              value={timeframe}
              onValueChange={(v) => setTimeframe(v as '1M' | '6H' | '1D')}
              className="hidden rounded-full border border-slate-700/70 bg-slate-900/70 px-1 py-0.5 text-xs text-slate-300 sm:block"
            >
              <TabsList className="h-7 bg-transparent">
                <TabsTrigger value="1M" className="h-6 rounded-full px-3 text-[11px]">
                  1 MIN
                </TabsTrigger>
                <TabsTrigger value="6H" className="h-6 rounded-full px-3 text-[11px]">
                  6 HOUR
                </TabsTrigger>
                <TabsTrigger value="1D" className="h-6 rounded-full px-3 text-[11px]">
                  1 DAY
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* 연결 상태 뱃지 */}
            {isConnected ? (
              <Card className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-950/60 px-3 py-1.5 text-xs shadow-md shadow-emerald-500/25">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="font-semibold text-emerald-100">Connected</span>
                </div>
                <span className="max-w-[120px] truncate font-mono text-[11px] text-emerald-200/80 max-sm:hidden">
                  {displayAddress}
                </span>
                <Button
                  onClick={handleDisconnect}
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-6 w-6 rounded-full text-emerald-300 hover:bg-emerald-500/10 hover:text-red-300"
                >
                  <LogOut className="h-3 w-3" />
                </Button>
              </Card>
            ) : (
              <Button
                onClick={handleConnect}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-purple-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-500/40 transition-all hover:from-cyan-400 hover:to-purple-400 hover:shadow-cyan-400/50"
              >
                <Wallet className="h-4 w-4" />
                <span>지갑 연결</span>
              </Button>
            )}
          </div>
        </header>

        {/* 메인 그리드: 좌측 마켓 / 중앙 차트 / 우측 내 정보 */}
        <div className="mt-3 grid flex-1 gap-4 rounded-[24px] bg-slate-950/60 p-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)_minmax(0,1.3fr)] lg:p-4">
          {/* 중앙: 차트 & 라운드 요약 (Basevol 메인 영역 느낌) */}
          <section className="flex flex-col gap-4 lg:col-span-2">
            {/* 상단: 라운드/타임프레임 헤더 */}
            <Card className="border border-slate-800/80 rounded-2xl bg-slate-950/80 p-4 shadow-xl shadow-black/40">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                    <Sparkles className="h-3 w-3 text-cyan-400" /> 실시간 라운드 현황
                  </div>
                  <h1 className="mt-2 text-lg font-semibold text-slate-50 lg:text-xl">
                    {timeframe === '1D' && '1 DAY 라운드 변동성 차트'}
                    {timeframe === '6H' && '6 HOUR 라운드 변동성 차트'}
                    {timeframe === '1M' && '1 MIN 라운드 스캘핑 차트'}
                  </h1>
                </div>
              </div>

              <DashboardMiniChart />
            </Card>

            {/* 하단: 랭킹 보드 */}
            <Card className="border border-slate-800/80 rounded-2xl bg-slate-950/80 p-4 shadow-xl shadow-black/40">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">Leaderboard 🏆</h2>
                  <p className="text-[11px] text-slate-500">
                    DEL 보유량 + NFT/뱃지 등 Achievements의 총자산 기준 상위 유저입니다.
                  </p>
                </div>
                <span className="rounded-full bg-slate-900/80 px-2 py-1 text-[10px] text-slate-400">
                  데모 랭킹
                </span>
              </div>

              <RankingList />
            </Card>
          </section>

          {/* 우측: 내 계정 / 포인트 / 퀵 액션 */}
          <section className="flex flex-col gap-4">
            <PointsPanel points={points} />

            <Card className="border border-slate-800/80 rounded-2xl bg-slate-950/80 p-4 shadow-lg shadow-black/40">
              <h3 className="mb-3 border-b border-slate-800 pb-2 text-sm font-semibold text-slate-200">
                Quick Actions ⚡
              </h3>
              <div className="flex flex-col gap-2.5">
                <Button className="w-full justify-between rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-xs font-semibold text-slate-950 shadow-md shadow-cyan-500/30 hover:from-cyan-400 hover:to-emerald-400 hover:shadow-cyan-400/40">
                  오늘 라운드 참여
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-between rounded-xl border-purple-500/40 bg-slate-950/60 text-xs font-semibold text-purple-200 hover:bg-slate-900/80"
                >
                  NFT 상점 보기
                  <Wallet className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-between rounded-xl border-slate-700 bg-slate-950/60 text-[11px] font-medium text-slate-200 hover:bg-slate-900/80"
                >
                  지난 라운드 히스토리
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </Card>

            <Card className="border border-slate-800/80 rounded-2xl bg-slate-950/80 p-4 shadow-lg shadow-black/40">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <BarChart3 className="h-4 w-4 text-cyan-400" />
                  마켓 스냅샷
                </div>
                <span className="rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] text-slate-500">
                  데모 데이터
                </span>
              </div>
              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex items-center justify-between rounded-lg bg-slate-900/70 px-2.5 py-2">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GOLD 변동률
                  </span>
                  <span className="font-mono text-xs text-emerald-300">+1.42%</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-900/70 px-2.5 py-2">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> BTC 변동률
                  </span>
                  <span className="font-mono text-xs text-red-300">-0.87%</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-900/70 px-2.5 py-2">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    풀 규모 (DEL)
                  </span>
                  <span className="font-mono text-xs text-cyan-300">1,234,000</span>
                </div>
              </div>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
