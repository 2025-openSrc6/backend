const BINANCE_BASE_URL = 'https://api.binance.com/api/v3';

const SYMBOL_MAP = {
  PAXG: 'PAXGUSDT',
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
} as const;

type SupportedAsset = keyof typeof SYMBOL_MAP;

interface BinanceKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

interface BinanceTicker {
  symbol: string;
  price: string;
  priceChangePercent: string;
  volume: string;
}

export async function fetchKlines(
  asset: SupportedAsset,
  interval: string = '1m',
  limit: number = 100,
): Promise<BinanceKline[]> {
  const symbol = SYMBOL_MAP[asset];
  const url = `${BINANCE_BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`);
  }

  const data = await response.json();

  return data.map((kline: (string | number)[]) => ({
    openTime: kline[0] as number,
    open: parseFloat(kline[1] as string),
    high: parseFloat(kline[2] as string),
    low: parseFloat(kline[3] as string),
    close: parseFloat(kline[4] as string),
    volume: parseFloat(kline[5] as string),
    closeTime: kline[6] as number,
  }));
}

export async function fetchCurrentPrice(asset: SupportedAsset): Promise<BinanceTicker> {
  const symbol = SYMBOL_MAP[asset];
  const url = `${BINANCE_BASE_URL}/ticker/24hr?symbol=${symbol}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    symbol: data.symbol,
    price: data.lastPrice,
    priceChangePercent: data.priceChangePercent,
    volume: data.volume,
  };
}

export async function fetchMultipleKlines(
  assets: SupportedAsset[],
  interval: string = '1m',
  limit: number = 100,
): Promise<Map<SupportedAsset, BinanceKline[]>> {
  const results = new Map<SupportedAsset, BinanceKline[]>();

  const promises = assets.map(async (asset) => {
    const klines = await fetchKlines(asset, interval, limit);
    results.set(asset, klines);
  });

  await Promise.all(promises);
  return results;
}

export { type SupportedAsset, type BinanceKline, type BinanceTicker };
