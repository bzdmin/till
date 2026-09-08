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
