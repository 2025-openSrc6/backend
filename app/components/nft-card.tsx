'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Zap, Check } from 'lucide-react';

interface NFT {
  id: number;
  name: string;
  image: string;
  price: number;
  rarity: string;
  description: string;
}

interface NFTCardProps {
  nft: NFT;
  isConnected: boolean;
  userPoints: number;
  onPurchase: (nftId: number, price: number) => void;
}

export function NFTCard({ nft, isConnected, userPoints, onPurchase }: NFTCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const canAfford = userPoints >= nft.price;

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'Legendary':
        return 'bg-secondary/20 text-secondary border-secondary/30';
      case 'Epic':
        return 'bg-primary/20 text-primary border-primary/30';
      case 'Rare':
        return 'bg-accent/20 text-accent-foreground border-accent/30';
      default:
        return 'bg-muted/20 text-muted-foreground border-muted/30';
    }
  };

  const handlePurchase = async () => {
    setIsPurchasing(true);
    // Simulate minting delay
    await new Promise((resolve) => setTimeout(resolve, 1500));
    onPurchase(nft.id, nft.price);
    setIsPurchasing(false);
  };

  return (
    <Card
      className="group relative overflow-hidden border-border/50 bg-card hover:border-primary/50 transition-all duration-300"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-secondary/0 group-hover:from-primary/10 group-hover:to-secondary/10 transition-all duration-500" />

      <CardContent className="p-0 relative">
        {/* Image container */}
        <div className="relative aspect-square overflow-hidden">
          <Image
            src={nft.image || '/placeholder.svg'}
            alt={nft.name}
            fill
            sizes="(max-width: 768px) 100vw, 400px"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />

          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent opacity-60" />

          {/* Rarity badge */}
          <div className="absolute top-3 right-3">
            <Badge className={getRarityColor(nft.rarity)}>
              <Sparkles className="h-3 w-3 mr-1" />
              {nft.rarity}
            </Badge>
          </div>

          {/* Hover overlay */}
          {isHovered && (
            <div className="absolute inset-0 bg-background/90 flex items-center justify-center transition-opacity duration-300">
              <p className="text-sm text-muted-foreground px-4 text-center text-pretty">
                {nft.description}
              </p>
            </div>
          )}
        </div>

        {/* Info section */}
        <div className="p-4">
          <h3 className="font-bold text-lg mb-2 text-foreground">{nft.name}</h3>

          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-secondary" />
            <span className="font-mono font-bold text-foreground">
              {nft.price.toLocaleString()}
            </span>
            <span className="text-sm text-muted-foreground">Points</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 relative">
        <Button
          onClick={handlePurchase}
          disabled={!isConnected || !canAfford || isPurchasing}
          className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isPurchasing ? (
            <>
              <div className="h-4 w-4 mr-2 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Minting...
            </>
          ) : !isConnected ? (
            'Connect Wallet'
          ) : !canAfford ? (
            'Insufficient Points'
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Mint NFT
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
