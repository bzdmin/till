/** Public Binance market data. No key, no auth - this is the free evidence. */

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const ENDPOINT = "https://api.binance.com/api/v3/klines";

/**
 * Does Binance list this pair? Checked before the 402 is quoted, so a typo
 * never reaches settlement.
 *
 * Only a real 400 from Binance is "unlisted". A 429 / timeout is not an
 * answer, and the demo pairs are seeded so a rate-limit cannot 400 ETHUSDT.
 */
const known = new Map<string, boolean>(
  ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"].map((s) => [s, true]),
);
const inflight = new Map<string, Promise<boolean>>();

export async function symbolExists(symbol: string): Promise<boolean> {
  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) return false;
  const cached = known.get(symbol);
  if (cached !== undefined) return cached;

  const pending = inflight.get(symbol);
  if (pending) return pending;

  const check = probe(symbol).finally(() => inflight.delete(symbol));
  inflight.set(symbol, check);
  return check;
}

async function probe(symbol: string): Promise<boolean> {
  const res = await fetch(`${ENDPOINT}?symbol=${symbol}&interval=1h&limit=1`, {
    signal: AbortSignal.timeout(8000),
  });
  if (res.ok) {
    known.set(symbol, true);
    return true;
  }
  // Binance answers 400 for a pair it does not list. 429 / 418 / 451 / 5xx
  // are the API being unhappy, not an answer, and must not become a 400 on
  // the counter.
  if (res.status === 400) {
    known.set(symbol, false);
    return false;
  }
  throw new Error(`binance ${res.status}`);
}

/** Best-effort warmup. Seeded pairs need no network; anything else is cached
 *  if Binance answers, and ignored if it does not. */
export async function warmSymbols(symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]): Promise<void> {
  await Promise.all(symbols.map((s) => symbolExists(s).catch(() => false)));
}

export async function fetchCandles(symbol = "BTCUSDT", interval = "1h", limit = 48): Promise<Candle[]> {
  const url = `${ENDPOINT}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`klines ${res.status}: ${await res.text()}`);
  const raw = (await res.json()) as unknown[][];
  return raw.map((k) => ({
    openTime: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
}
