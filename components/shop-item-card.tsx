'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, Palette, User, Box, Hexagon, Check } from 'lucide-react';
import { ShopItem } from '@/db/schema/shopItems';

interface ShopItemCardProps {
    item: ShopItem;
    onPurchase: (item: ShopItem) => Promise<void>;
    disabled?: boolean;
}

export function ShopItemCard({ item, onPurchase, disabled }: ShopItemCardProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handlePurchase = async () => {
        setIsLoading(true);
        try {
            await onPurchase(item);
        } finally {
            setIsLoading(false);
        }
    };

    const getIcon = () => {
        switch (item.category) {
            case 'NICKNAME':
                return <User className="h-8 w-8 text-blue-400" />;
            case 'COLOR':
                return <Palette className="h-8 w-8 text-purple-400" />;
            case 'NFT':
                return <Hexagon className="h-8 w-8 text-cyan-400" />;
            case 'BOOST':
                return <Zap className="h-8 w-8 text-yellow-400" />;
            default:
                return <Box className="h-8 w-8 text-slate-400" />;
        }
    };

    const getCategoryColor = () => {
        switch (item.category) {
            case 'NICKNAME':
                return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            case 'COLOR':
                return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
            case 'NFT':
                return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
            case 'BOOST':
                return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
            default:
                return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
        }
    };

    return (
        <Card className="group relative overflow-hidden border-slate-800/80 bg-slate-950/80 p-5 transition-all hover:border-slate-700 hover:bg-slate-900/80 hover:shadow-lg hover:shadow-cyan-500/10">
            <div className="flex items-start justify-between">
                {item.imageUrl ? (
                    <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-700">
                        <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="h-full w-full object-cover"
                        />
                    </div>
                ) : (
                    <div className={`rounded-xl border p-3 ${getCategoryColor()}`}>
                        {getIcon()}
                    </div>
                )}
                {item.tier && (
                    <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                        {item.tier}
                    </Badge>
                )}
            </div>

            <div className="mt-4">
                <h3 className="font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
                    {item.name}
                </h3>
                <p className="mt-1 text-xs text-slate-400 line-clamp-2 min-h-[2.5em]">
                    {item.description || '아이템 설명이 없습니다.'}
                </p>
            </div>

            <div className="mt-5 flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Price</span>
                    <div className="flex items-center gap-1.5">
                        <span className={`text-lg font-bold ${item.currency === 'DEL' ? 'text-slate-200' : 'text-pink-400'}`}>
                            {item.price.toLocaleString()}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">{item.currency}</span>
                    </div>
                </div>

                <Button
                    onClick={handlePurchase}
                    disabled={disabled || isLoading || !item.available}
                    size="sm"
                    className={`
            h-9 px-4 font-semibold transition-all
            ${item.currency === 'DEL'
                            ? 'bg-slate-800 text-slate-200 hover:bg-cyan-600 hover:text-white'
                            : 'bg-pink-950/50 text-pink-200 hover:bg-pink-600 hover:text-white border border-pink-500/20'}
          `}
                >
                    {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        '구매'
                    )}
                </Button>
            </div>
        </Card>
    );
}
