"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Wallet, Zap } from "lucide-react"
import { NFTCard } from "@/components/nft-card"

// Mock NFT data
const nfts = [
  {
    id: 1,
    name: "Cyber Dragon #001",
    image: "/futuristic-cyber-dragon-nft-digital-art-neon.jpg",
    price: 5000,
    rarity: "Legendary",
    description: "A legendary cyber dragon with neon scales",
  },
  {
    id: 2,
    name: "Neon Samurai #042",
    image: "/neon-samurai-warrior-cyberpunk-nft-art.jpg",
    price: 3500,
    rarity: "Epic",
    description: "Elite warrior from the neon districts",
  },
  {
    id: 3,
    name: "Pixel Phoenix #128",
    image: "/pixel-art-phoenix-bird-fire-nft.jpg",
    price: 4200,
    rarity: "Epic",
    description: "Rising from digital ashes",
  },
  {
    id: 4,
    name: "Quantum Tiger #007",
    image: "/quantum-tiger-holographic-nft-digital-art.jpg",
    price: 2800,
    rarity: "Rare",
    description: "Prowling through quantum dimensions",
  },
  {
    id: 5,
    name: "Holo Serpent #099",
    image: "/holographic-serpent-snake-nft-futuristic.jpg",
    price: 6500,
    rarity: "Legendary",
    description: "Slithering through holographic realms",
  },
  {
    id: 6,
    name: "Cyber Wolf #256",
    image: "/cyber-wolf-robot-nft-digital-art-neon.jpg",
    price: 3000,
    rarity: "Rare",
    description: "Alpha of the digital pack",
  },
  {
    id: 7,
    name: "Neon Panther #512",
    image: "/neon-panther-cat-cyberpunk-nft-art.jpg",
    price: 3800,
    rarity: "Epic",
    description: "Silent hunter of the neon jungle",
  },
  {
    id: 8,
    name: "Plasma Eagle #333",
    image: "/plasma-eagle-bird-electric-nft-digital.jpg",
    price: 4500,
    rarity: "Epic",
    description: "Soaring through plasma storms",
  },
]

export function NFTShop() {
  const [isConnected, setIsConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState("")
  const [userPoints, setUserPoints] = useState(15000)

  const handleConnectWallet = () => {
    // Simulate wallet connection
    setIsConnected(true)
    setWalletAddress("0x742d...9f3a")
  }

  const handleDisconnectWallet = () => {
    setIsConnected(false)
    setWalletAddress("")
  }

  const handlePurchase = (nftId: number, price: number) => {
    if (userPoints >= price) {
      setUserPoints((prev) => prev - price)
      // Here you would trigger the actual NFT minting
      alert("NFT minted successfully! Check your wallet.")
    } else {
      alert("Insufficient points!")
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-cyan-500/20 backdrop-blur-xl bg-slate-950/80">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative w-16 h-16 flex-shrink-0">
                <Image
                  src="/logo.png"
                  alt="DeltaX Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-lg">
                NFT SHOP
              </h1>
            </div>

            <div className="flex items-center gap-4">
              {isConnected && (
                <Card className="px-4 py-2 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/50 backdrop-blur-sm hover:border-cyan-400/80 transition-all duration-300 shadow-lg shadow-cyan-500/20">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-cyan-400 animate-pulse" />
                    <span className="font-mono font-bold text-cyan-300">{userPoints.toLocaleString()}</span>
                    <span className="text-sm text-cyan-200/60">PTS</span>
                  </div>
                </Card>
              )}

              {isConnected ? (
                <Button
                  onClick={handleDisconnectWallet}
                  className="border border-cyan-500/50 hover:border-cyan-400 hover:bg-cyan-500/10 bg-transparent text-cyan-300 transition-all duration-300"
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  {walletAddress}
                </Button>
              ) : (
                <Button
                  onClick={handleConnectWallet}
                  className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:shadow-lg hover:shadow-cyan-500/50 transition-all duration-300 text-white font-bold"
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Connect
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-cyan-500/20">
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-0 w-80 h-80 bg-pink-500/5 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.08),transparent_70%)]" />

        <div className="container relative mx-auto px-4 py-32 md:py-40">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-6xl md:text-7xl font-black mb-4 bg-gradient-to-b from-cyan-300 via-cyan-400 to-purple-500 bg-clip-text text-transparent drop-shadow-2xl">
              DIGITAL LEGENDS
            </h1>
            <p className="text-cyan-300/80 text-lg mb-8 font-mono tracking-wider">
              [ MINT • COLLECT • DOMINATE ]
            </p>
            <div className="h-0.5 w-32 mx-auto bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-full shadow-lg shadow-cyan-500/50 mb-8" />
          </div>
        </div>
      </section>

      {/* NFT Grid */}
      <section className="relative bg-slate-950 py-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.06),transparent_70%)]" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl" />

        <div className="container relative mx-auto px-4">
          <div className="mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-2 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              LEGENDARY COLLECTION
            </h2>
            <div className="w-24 h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-full shadow-lg shadow-cyan-500/50" />
          </div>

          {!isConnected && (
            <Card className="mb-12 p-8 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 border border-cyan-500/40 backdrop-blur-sm hover:border-cyan-400/70 transition-all duration-300 shadow-lg shadow-cyan-500/10">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
                <div>
                  <h3 className="text-xl font-bold mb-2 text-cyan-300">GENESIS INITIATED</h3>
                  <p className="text-cyan-200/70 font-mono">
                    Connect wallet to activate your digital existence
                  </p>
                </div>
                <Button
                  onClick={handleConnectWallet}
                  className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:shadow-lg hover:shadow-cyan-500/60 transition-all duration-300 px-8 py-3 whitespace-nowrap font-bold text-white"
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  ACTIVATE
                </Button>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {nfts.map((nft) => (
              <NFTCard
                key={nft.id}
                nft={nft}
                isConnected={isConnected}
                userPoints={userPoints}
                onPurchase={handlePurchase}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
