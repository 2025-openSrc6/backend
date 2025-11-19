import { z } from 'zod';

const BINANCE_BASE_URL = 'https://api.binance.com/api/v3';

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

// Rate limit tracking
class RateLimitTracker {
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly windowMs = 60000; // 1 minute
  private readonly maxRequests = 1200; // Binance limit

  async checkAndWait(): Promise<void> {
    const now = Date.now();

    // Reset window if expired
    if (now - this.windowStart >= this.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    // If we're at the limit, wait until window resets
    if (this.requestCount >= this.maxRequests) {
      const waitTime = this.windowMs - (now - this.windowStart);
      console.warn(`Rate limit reached. Waiting ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.windowStart = Date.now();
    }

    this.requestCount++;
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      windowStart: this.windowStart,
      remainingRequests: this.maxRequests - this.requestCount,
    };
  }
}

const rateLimitTracker = new RateLimitTracker();

// Exponential backoff retry utility
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = RETRY_CONFIG.maxRetries,
  delay: number = RETRY_CONFIG.initialDelayMs,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    // Check if error is retryable (network errors, 5xx, 429)
    const isRetryable =
      error instanceof Error &&
      (error.message.includes('fetch failed') ||
        error.message.includes('429') ||
        error.message.includes('5'));

    if (!isRetryable) {
      throw error;
    }

    console.warn(
      `Retrying after ${delay}ms... (${RETRY_CONFIG.maxRetries - retries + 1}/${RETRY_CONFIG.maxRetries})`,
    );

    await new Promise((resolve) => setTimeout(resolve, delay));

    const nextDelay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);

    return retryWithBackoff(fn, retries - 1, nextDelay);
  }
}

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
  // Check rate limit before making request
  await rateLimitTracker.checkAndWait();

  return retryWithBackoff(async () => {
    const symbol = SYMBOL_MAP[asset];
    const url = `${BINANCE_BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

    const response = await fetch(url);

    // Handle rate limit response from server
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
      console.warn(`Server rate limit hit. Waiting ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      throw new Error(`Binance API error: 429`);
    }

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
  });
}

export async function fetchCurrentPrice(asset: SupportedAsset): Promise<BinanceTicker> {
  // Check rate limit before making request
  await rateLimitTracker.checkAndWait();

  return retryWithBackoff(async () => {
    const symbol = SYMBOL_MAP[asset];
    const url = `${BINANCE_BASE_URL}/ticker/24hr?symbol=${symbol}`;

    const response = await fetch(url);

    // Handle rate limit response from server
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
      console.warn(`Server rate limit hit. Waiting ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      throw new Error(`Binance API error: 429`);
    }

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
  });
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

// Export rate limit stats for monitoring
export function getRateLimitStats() {
  return rateLimitTracker.getStats();
}

export { type SupportedAsset, type BinanceKline, type BinanceTicker };
