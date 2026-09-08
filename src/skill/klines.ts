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
 * Does Binance list this pair?
 *
 * Checked before settlement, never after. Taking payment and then failing to
 * fetch candles because of a typo is a SETTLED_NO_GOODS the buyer did nothing
 * to deserve, so the counter refuses an unknown symbol with a 400 instead.
 */
export async function symbolExists(symbol: string): Promise<boolean> {
  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) return false;
  try {
    const res = await fetch(`${ENDPOINT}?symbol=${symbol}&interval=1h&limit=1`, {
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
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
