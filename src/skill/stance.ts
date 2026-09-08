import { seller } from "../config.js";
import { fetchCandles, type Candle } from "./klines.js";

export type Call = "wait" | "reduce" | "hold-the-range";

export interface Stance {
  symbol: string;
  interval: string;
  asOf: string;
  call: Call;
  reasons: [string, string];
  evidence: {
    last: number;
    rangeHigh: number;
    rangeLow: number;
    positionInRange: number; // 0 = at the low, 1 = at the high
    realizedVol: number; // stdev of hourly log returns, as a percentage
  };
  signer: string;
  /** Present only on the deep-dive: the per-timeframe calls behind the headline. */
  timeframes?: { interval: string; call: Call; positionInRange: number; realizedVol: number }[];
  agreement?: "unanimous" | "majority" | "split";
  signature?: string;
}

const pct = (n: number) => Number((n * 100).toFixed(2));
const round = (n: number, dp = 2) => Number(n.toFixed(dp));

/**
 * The good being sold.
 *
 * Deliberately deterministic: the same candles always produce the same call.
 * That is what lets the acceptance predicate check the deliverable, and it
 * means no model call can time out mid-demo. The buyer is paying for the
 * stance, not the candles - it can fetch those itself for free.
 */
export function computeStance(candles: Candle[], symbol: string, interval: string): Stance {
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1]!;
  const rangeHigh = Math.max(...candles.map((c) => c.high));
  const rangeLow = Math.min(...candles.map((c) => c.low));
  const span = rangeHigh - rangeLow;
  const positionInRange = span === 0 ? 0.5 : (last - rangeLow) / span;

  const returns = closes.slice(1).map((c, i) => Math.log(c / closes[i]!));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
  const realizedVol = Math.sqrt(variance);

  // Elevated is relative to this window's own median absolute return, so the
  // rule does not carry a hardcoded volatility level that ages badly.
  const absSorted = returns.map(Math.abs).sort((a, b) => a - b);
  const medianAbs = absSorted[Math.floor(absSorted.length / 2)]!;
  const elevated = realizedVol > medianAbs * 1.5;

  let call: Call;
  let reasons: [string, string];

  if (positionInRange >= 0.8) {
    call = elevated ? "reduce" : "hold-the-range";
    reasons = [
      `Price is ${pct(positionInRange)}% through the last ${candles.length} ${interval} candles (range ${round(rangeLow)}-${round(rangeHigh)}), i.e. near its high.`,
      elevated
        ? `Realized volatility ${pct(realizedVol)}% is above this window's median move, so the upper edge is not a quiet one.`
        : `Realized volatility ${pct(realizedVol)}% is at or below this window's median move, so the edge is holding calmly.`,
    ];
  } else if (positionInRange <= 0.2) {
    call = elevated ? "wait" : "hold-the-range";
    reasons = [
      `Price is ${pct(positionInRange)}% through the last ${candles.length} ${interval} candles (range ${round(rangeLow)}-${round(rangeHigh)}), i.e. near its low.`,
      elevated
        ? `Realized volatility ${pct(realizedVol)}% is above this window's median move; the low is being tested, not defended.`
        : `Realized volatility ${pct(realizedVol)}% is subdued, so the low is being held rather than broken.`,
    ];
  } else {
    call = "hold-the-range";
    reasons = [
      `Price sits ${pct(positionInRange)}% through the last ${candles.length} ${interval} candles (range ${round(rangeLow)}-${round(rangeHigh)}) - mid-range, no edge in play.`,
      `Realized volatility ${pct(realizedVol)}% ${elevated ? "is elevated but directionless from mid-range" : "is unremarkable"}.`,
    ];
  }

  return {
    symbol,
    interval,
    asOf: new Date(candles[candles.length - 1]!.openTime).toISOString(),
    call,
    reasons,
    evidence: {
      last: round(last),
      rangeHigh: round(rangeHigh),
      rangeLow: round(rangeLow),
      positionInRange: round(positionInRange, 4),
      realizedVol: pct(realizedVol),
    },
    signer: seller.address,
  };
}

/** Canonical form for signing - field order fixed, signature excluded. */
export const canonical = (s: Stance) =>
  JSON.stringify({
    symbol: s.symbol,
    interval: s.interval,
    asOf: s.asOf,
    call: s.call,
    reasons: s.reasons,
    evidence: s.evidence,
    timeframes: s.timeframes ?? null,
    agreement: s.agreement ?? null,
    signer: s.signer,
  });

/** Agent B signs its own view. This is the part Agent A cannot produce itself. */
export async function produceStance(symbol = "BTCUSDT", interval = "1h"): Promise<Stance> {
  const candles = await fetchCandles(symbol, interval, 48);
  const stance = computeStance(candles, symbol, interval);
  stance.signature = await seller.signMessage({ message: canonical(stance) });
  return stance;
}
