import { z } from 'zod';

const BINANCE_BASE_URL = 'https://api.binance.com/api/v3';

const SYMBOL_MAP = {
  PAXG: 'PAXGUSDT',
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
} as const;

type SupportedAsset = keyof typeof SYMBOL_MAP;

// Zod schemas for runtime validation
const BinanceKlineRawSchema = z.tuple([
  z.number(), // openTime
  z.string(), // open
  z.string(), // high
  z.string(), // low
  z.string(), // close
  z.string(), // volume
  z.number(), // closeTime
  z.string(), // quote asset volume
  z.number(), // number of trades
  z.string(), // taker buy base asset volume
  z.string(), // taker buy quote asset volume
  z.string(), // ignore
]);

const BinanceKlineArraySchema = z.array(BinanceKlineRawSchema);

const BinanceTickerSchema = z.object({
  symbol: z.string(),
  lastPrice: z.string(),
  priceChangePercent: z.string(),
  volume: z.string(),
});

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

  // Validate response data with Zod
  const validatedData = BinanceKlineArraySchema.parse(data);

  return validatedData.map((kline) => ({
    openTime: kline[0],
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
    volume: parseFloat(kline[5]),
    closeTime: kline[6],
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

  // Validate response data with Zod
  const validatedData = BinanceTickerSchema.parse(data);

  return {
    symbol: validatedData.symbol,
    price: validatedData.lastPrice,
    priceChangePercent: validatedData.priceChangePercent,
    volume: validatedData.volume,
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
