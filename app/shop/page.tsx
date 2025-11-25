'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Wallet, LogOut, ArrowLeft, ShoppingBag, Filter } from 'lucide-react';
import { ShopItem } from '@/db/schema/shopItems';
import { ShopItemCard } from '@/components/shop-item-card';
import { toast } from 'sonner';

export default function ShopPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [points, setPoints] = useState(12000); // Mock points
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('ALL');

  // Mock User ID for purchase
  const userId = 'test-user-id';

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/nfts/shop');
      const data = await res.json();
      if (data.success) {
        setItems(data.data.items);
      }
    } catch (error) {
      console.error('Failed to fetch items:', error);
      toast.error('상점 아이템을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    setIsConnected(true);
    setWalletAddress('0x742d...9f3a');
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setWalletAddress('');
  };

  const handlePurchase = async (item: ShopItem) => {
    if (!isConnected) {
      toast.error('지갑을 먼저 연결해주세요.');
      return;
    }

    if (points < item.price) {
      toast.error('잔액이 부족합니다.');
      return;
    }

    try {
      const res = await fetch('/api/nfts/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, itemId: item.id }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(`${item.name} 구매 완료!`);
        setPoints(data.data.newBalance); // Update balance
      } else {
        toast.error(data.message || '구매 실패');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      toast.error('구매 중 오류가 발생했습니다.');
    }
  };

  const filteredItems = activeCategory === 'ALL'
    ? items
    : items.filter(item => item.category === activeCategory);

  const categories = [
    { id: 'ALL', label: '전체' },
    { id: 'NFT', label: 'NFT' },
    { id: 'NICKNAME', label: '닉네임' },
    { id: 'COLOR', label: '컬러' },
    { id: 'BOOST', label: '부스트' },
  ];

  const displayAddress =
    walletAddress.length > 10
      ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`
      : walletAddress;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#02040a] text-slate-50 px-2 py-3 sm:px-4 sm:py-6">
      {/* Background Gradients */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-[-10rem] h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-purple-500/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#020617,_#000)] opacity-70" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col rounded-[32px] px-3 pb-6 pt-3 shadow-[0_0_80px_rgba(0,0,0,0.85)] lg:px-6">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between rounded-[24px] border border-slate-800/80 bg-slate-950/80 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur-md lg:px-5">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-900/50 hover:bg-slate-800 transition-colors border border-slate-800">
              <ArrowLeft className="h-5 w-5 text-slate-400" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-slate-900 border border-slate-800">
                <Image
                  src="/logo.png"
                  alt="DeltaX Logo"
                  fill
                  className="object-contain p-1"
                  priority
                />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-100 leading-none">NFT SHOP</h1>
                <p className="text-[11px] text-slate-500 font-medium mt-1">Digital Assets & Upgrades</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isConnected ? (
              <>
                <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-slate-900/80 border border-slate-800 px-3 py-1.5">
                  <span className="text-xs text-slate-400">Balance:</span>
                  <span className="text-sm font-bold text-cyan-400">{points.toLocaleString()} DEL</span>
                </div>
                <Card className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-950/60 px-3 py-1.5 text-xs shadow-md shadow-emerald-500/25">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="font-semibold text-emerald-100">Connected</span>
                  </div>
                  <span className="max-w-[100px] truncate font-mono text-[11px] text-emerald-200/80 hidden sm:block">
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
              </>
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

        {/* Main Content */}
        <div className="flex flex-col gap-6">
          {/* Banner */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-800/60 bg-slate-950/60 p-6 sm:p-10">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-transparent" />
            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300 mb-4">
                <ShoppingBag className="h-3 w-3" />
                New Arrivals
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white mb-4 leading-tight">
                Upgrade Your <br />
                <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                  Digital Experience
                </span>
              </h2>
              <p className="text-slate-400 max-w-md text-sm sm:text-base leading-relaxed">
                닉네임 변경권부터 한정판 NFT까지. DEL 토큰으로 다양한 아이템을 구매하고 혜택을 누리세요.
              </p>
            </div>
          </div>

          {/* Categories & Items */}
          <div className="flex flex-col gap-6">
            <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
              <div className="flex items-center justify-between mb-6">
                <TabsList className="h-10 bg-slate-950/80 border border-slate-800/80 p-1 rounded-xl">
                  {categories.map((cat) => (
                    <TabsTrigger
                      key={cat.id}
                      value={cat.id}
                      className="rounded-lg px-4 text-xs font-medium data-[state=active]:bg-slate-800 data-[state=active]:text-slate-100 text-slate-500"
                    >
                      {cat.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Filter className="h-3 w-3" />
                  <span>{filteredItems.length} Items</span>
                </div>
              </div>

              <TabsContent value={activeCategory} className="mt-0">
                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-[280px] rounded-2xl bg-slate-900/50 animate-pulse" />
                    ))}
                  </div>
                ) : filteredItems.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredItems.map((item) => (
                      <ShopItemCard
                        key={item.id}
                        item={item}
                        onPurchase={handlePurchase}
                        disabled={!isConnected}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <ShoppingBag className="h-12 w-12 mb-4 opacity-20" />
                    <p>해당 카테고리에 아이템이 없습니다.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
