/**
 * API 클라이언트 - 프론트엔드에서 DB 작업을 하기 위한 헬퍼
 */

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * 새로운 라운드를 생성합니다
 */
export async function createRound(roundData: {
  roundKey: string;
  timeframe: string;
  lockingStartsAt: string;
  lockingEndsAt: string;
  status?: string;
}) {
  const response = await fetch("/api/rounds", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(roundData),
  });

  if (!response.ok) {
    throw new Error(`Failed to create round: ${response.statusText}`);
  }

  return (await response.json()) as ApiResponse<any>;
}

/**
 * 모든 라운드를 조회합니다
 */
export async function fetchRounds() {
  const response = await fetch("/api/rounds", {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch rounds: ${response.statusText}`);
  }

  return (await response.json()) as ApiResponse<any[]>;
}

/**
 * 새로운 베팅을 생성합니다
 */
export async function createBet(betData: {
  roundId: number;
  walletAddress: string;
  selection: "gold" | "btc";
  amount: string | number;
  txDigest?: string;
}) {
  const response = await fetch("/api/bets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(betData),
  });

  if (!response.ok) {
    throw new Error(`Failed to create bet: ${response.statusText}`);
  }

  return (await response.json()) as ApiResponse<any>;
}

/**
 * 특정 라운드의 베팅을 조회합니다
 */
export async function fetchBets(roundId?: number) {
  const url = new URL("/api/bets", window.location.origin);
  if (roundId) {
    url.searchParams.set("roundId", roundId.toString());
  }

  const response = await fetch(url.toString(), {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch bets: ${response.statusText}`);
  }

  return (await response.json()) as ApiResponse<any[]>;
}

/**
 * DB 연결 상태를 확인합니다
 */
export async function checkHealth() {
  const response = await fetch("/api/health", {
    method: "GET",
  });

  return (await response.json()) as ApiResponse<null>;
}
