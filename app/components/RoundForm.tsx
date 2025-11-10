"use client";

import { useState } from "react";
import { createRound } from "@/lib/api-client";

export function RoundForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData(e.currentTarget);

      const response = await createRound({
        roundKey: formData.get("roundKey") as string,
        timeframe: formData.get("timeframe") as string,
        lockingStartsAt: formData.get("lockingStartsAt") as string,
        lockingEndsAt: formData.get("lockingEndsAt") as string,
        status: "scheduled",
      });

      if (response.success) {
        setSuccess(true);
        e.currentTarget.reset();
        console.log("라운드 생성 성공:", response.data);
      } else {
        setError(response.error || "라운드 생성 실패");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류 발생");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <h2 className="text-2xl font-bold">새 라운드 생성</h2>

      <div>
        <label className="block text-sm font-medium">라운드 키</label>
        <input
          type="text"
          name="roundKey"
          placeholder="round-2025-01-10-1h"
          required
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">타임프레임</label>
        <select name="timeframe" required className="w-full px-3 py-2 border rounded-md">
          <option value="1m">1분</option>
          <option value="5m">5분</option>
          <option value="1h">1시간</option>
          <option value="6h">6시간</option>
          <option value="1d">1일</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">잠금 시작 시간</label>
        <input
          type="datetime-local"
          name="lockingStartsAt"
          required
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">잠금 종료 시간</label>
        <input
          type="datetime-local"
          name="lockingEndsAt"
          required
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      {error && <div className="p-3 bg-red-100 text-red-700 rounded-md">{error}</div>}

      {success && <div className="p-3 bg-green-100 text-green-700 rounded-md">라운드가 생성되었습니다!</div>}

      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "생성 중..." : "라운드 생성"}
      </button>
    </form>
  );
}
