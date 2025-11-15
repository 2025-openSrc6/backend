'use client';

import { useState } from 'react';
import { createRound } from '@/lib/api-client';

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
        roundNumber: Number(formData.get('roundNumber')),
        type: (formData.get('type') as '1MIN' | '6HOUR' | '1DAY') ?? '6HOUR',
        startTime: new Date(formData.get('startTime') as string).toISOString(),
        lockTime: new Date(formData.get('lockTime') as string).toISOString(),
        endTime: new Date(formData.get('endTime') as string).toISOString(),
        status: 'SCHEDULED',
      });

      if (response.success) {
        setSuccess(true);
        e.currentTarget.reset();
        console.log('라운드 생성 성공:', response.data);
      } else {
        setError(response.error || '라운드 생성 실패');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류 발생');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <h2 className="text-2xl font-bold">새 라운드 생성</h2>

      <div>
        <label className="block text-sm font-medium">라운드 번호</label>
        <input
          type="number"
          min={1}
          name="roundNumber"
          placeholder="1"
          required
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">라운드 타입</label>
        <select name="type" required className="w-full px-3 py-2 border rounded-md">
          <option value="1MIN">1분</option>
          <option value="6HOUR">6시간</option>
          <option value="1DAY">1일</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">시작 시간</label>
        <input
          type="datetime-local"
          name="startTime"
          required
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">베팅 마감 시간</label>
        <input
          type="datetime-local"
          name="lockTime"
          required
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">라운드 종료 시간</label>
        <input
          type="datetime-local"
          name="endTime"
          required
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      {error && <div className="p-3 bg-red-100 text-red-700 rounded-md">{error}</div>}

      {success && (
        <div className="p-3 bg-green-100 text-green-700 rounded-md">라운드가 생성되었습니다!</div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? '생성 중...' : '라운드 생성'}
      </button>
    </form>
  );
}
