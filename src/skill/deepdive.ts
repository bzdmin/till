import { seller } from "../config.js";
import { fetchCandles } from "./klines.js";
import { canonical, computeStance, type Call, type Stance } from "./stance.js";

const WINDOWS: [string, number][] = [
  ["1h", 48],
  ["4h", 42],
  ["1d", 30],
];

/**
 * The deep-dive. Genuinely more work than the brief, which is what makes the
 * higher price honest: three independent reads plus whether they agree.
 *
 * A single-timeframe call can be right about the hour and wrong about the week.
 * Agreement across horizons is the thing a buyer cannot get from one brief,
 * and it is the only reason to pay more.
 */
export async function produceDeepDive(symbol = "BTCUSDT"): Promise<Stance> {
  const stances = await Promise.all(
    WINDOWS.map(async ([interval, limit]) =>
      computeStance(await fetchCandles(symbol, interval, limit), symbol, interval),
    ),
  );

  const calls = stances.map((s) => s.call);
  const tally = new Map<Call, number>();
  for (const c of calls) tally.set(c, (tally.get(c) ?? 0) + 1);
  const [headline, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]!;

  const agreement = count === calls.length ? "unanimous" : count > 1 ? "majority" : "split";
  const short = stances[0]!;

  const stance: Stance = {
    symbol,
    interval: "1h+4h+1d",
    asOf: short.asOf,
    call: agreement === "split" ? "hold-the-range" : headline,
    reasons: [
      `Across 1h, 4h and 1d the calls are ${calls.join(" / ")} - ${agreement}.`,
      agreement === "unanimous"
        ? `Every horizon agrees on ${headline}, so the short-term read is not fighting the trend.`
        : agreement === "majority"
          ? `${count} of ${calls.length} horizons say ${headline}; the dissenting timeframe is the risk to size around.`
          : `No two horizons agree, which is itself the signal - there is no position worth taking here.`,
    ],
    evidence: short.evidence,
    timeframes: stances.map((s) => ({
      interval: s.interval,
      call: s.call,
      positionInRange: s.evidence.positionInRange,
      realizedVol: s.evidence.realizedVol,
    })),
    agreement,
    signer: seller.address,
  };

  stance.signature = await seller.signMessage({ message: canonical(stance) });
  return stance;
}
