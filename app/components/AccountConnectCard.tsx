"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Wallet } from "lucide-react"

type Props = {
  isConnected: boolean
  walletAddress: string
  onConnect: () => void
  onDisconnect: () => void
}

export function AccountConnectCard({ isConnected, walletAddress, onConnect, onDisconnect }: Props) {
  return (
    <Card className="bg-slate-900/40 p-5 text-slate-50">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">계좌 / 지갑 연동</h2>
          <p className="text-sm text-slate-400">
            Sui 지갑을 연결해서 베팅 리워드랑 NFT 구매를 한 계정에 묶어둘 수 있어.
          </p>
          {isConnected && (
            <p className="mt-2 text-xs font-mono text-cyan-200">connected: {walletAddress}</p>
          )}
        </div>
        {isConnected ? (
          <Button
            onClick={onDisconnect}
            variant="outline"
            className="border-slate-700 bg-slate-900/40 text-slate-100"
          >
            <Wallet className="mr-2 h-4 w-4" />
            연결 해제
          </Button>
        ) : (
          <Button onClick={onConnect} className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white">
            <Wallet className="mr-2 h-4 w-4" />
            지갑 연결
          </Button>
        )}
      </div>
    </Card>
  )
}