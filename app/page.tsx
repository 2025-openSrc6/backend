"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Wallet, Zap } from "lucide-react"
import { RankingList } from "@/components/RankingList"
import { AccountConnectCard } from "@/components/AccountConnectCard"
import { PointsPanel } from "@/components/PointsPanel"
import { DashboardMiniChart } from "@/components/DashboardMiniChart"

export default function HomePage() {
  const [isConnected, setIsConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState("")
  const [points, setPoints] = useState(12000)

  const handleConnect = () => {
    setIsConnected(true)
    setWalletAddress("0x742d...9f3a")
  }

  const handleDisconnect = () => {
    setIsConnected(false)
    setWalletAddress("")
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-cyan-500/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10">
              <Image src="/logo.png" alt="DeltaX Logo" fill className="object-contain" priority />
            </div>
            <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-lg font-semibold text-transparent">
              DeltaX Dashboard
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isConnected && (
              <Card className="flex items-center gap-2 bg-slate-900/50 px-4 py-2 text-cyan-200">
                <Zap className="h-4 w-4 text-cyan-400" />
                <span className="font-mono text-sm font-semibold">{points.toLocaleString()} PTS</span>
              </Card>
            )}

            {isConnected ? (
              <Button
                onClick={handleDisconnect}
                className="bg-slate-900/60 text-cyan-100 hover:bg-slate-800/80"
              >
                <Wallet className="mr-2 h-4 w-4" />
                {walletAddress}
              </Button>
            ) : (
              <Button
                onClick={handleConnect}
                className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white"
              >
                <Wallet className="mr-2 h-4 w-4" />
                지갑 연결
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* 목업 차트 */}
      <section className="mx-auto max-w-6xl px-4 pt-6">
        <DashboardMiniChart />
      </section>

      {/* Main Content */}
      <main className="mx-auto flex max-w-6xl gap-6 px-4 py-8">
        {/* Left: main sections */}
        <div className="flex-1 space-y-6">
          <AccountConnectCard
            isConnected={isConnected}
            walletAddress={walletAddress}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />

          <RankingList />
        </div>

        {/* Right: points / quick actions */}
        <div className="w-72 space-y-6">
          <PointsPanel points={points} />
          <Card className="bg-slate-900/40 p-4 text-slate-100">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Quick Actions</h3>
            <div className="flex flex-col gap-2">
              <Button variant="outline" className="border-slate-700 bg-slate-900/30 text-slate-100">
                오늘 라운드 참여
              </Button>
              <Button variant="outline" className="border-slate-700 bg-slate-900/30 text-slate-100">
                NFT 상점 가기
              </Button>
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}