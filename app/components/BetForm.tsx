'use client';

import { useState } from 'react';
import { createBet } from '@/lib/api-client';

interface BetFormProps {
  roundId: string;
  onSuccess?: () => void;
}

export function BetForm({ roundId, onSuccess }: BetFormProps) {
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

      const response = await createBet({
        roundId,
        walletAddress: formData.get('walletAddress') as string,
        selection: formData.get('selection') as 'gold' | 'btc',
        amount: parseFloat(formData.get('amount') as string),
        txDigest: (formData.get('txDigest') as string) || undefined,
      });

      if (response.success) {
        setSuccess(true);
        e.currentTarget.reset();
        onSuccess?.();
        console.log('베팅 생성 성공:', response.data);
      } else {
        setError(response.error || '베팅 생성 실패');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류 발생');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <h2 className="text-2xl font-bold">베팅하기</h2>
      <p className="text-sm text-gray-600">라운드 ID: {roundId}</p>

      <div>
        <label className="block text-sm font-medium">지갑 주소</label>
        <input
          type="text"
          name="walletAddress"
          placeholder="0x1234..."
          required
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">선택</label>
        <div className="flex gap-4">
          <label>
            <input type="radio" name="selection" value="gold" required className="mr-2" />금 (Gold)
          </label>
          <label>
            <input type="radio" name="selection" value="btc" required className="mr-2" />
            비트코인 (BTC)
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">금액</label>
        <input
          type="number"
          name="amount"
          placeholder="100.50"
          step="0.01"
          required
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">TX 다이제스트 (선택사항)</label>
        <input
          type="text"
          name="txDigest"
          placeholder="트랜잭션 해시"
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      {error && <div className="p-3 bg-red-100 text-red-700 rounded-md">{error}</div>}

      {success && (
        <div className="p-3 bg-green-100 text-green-700 rounded-md">베팅이 등록되었습니다!</div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? '등록 중...' : '베팅하기'}
      </button>
    </form>
  );
}
