export type RawRankingRow = {
  userId: string;
  walletAddress: string | null;
  delBalance: number | null;
  achievementPurchasePrice: number | null;
};

export type RankingItem = {
  walletAddress: string;
  delBalance: number;
  achievementTotal: number;
  totalAsset: number;
};