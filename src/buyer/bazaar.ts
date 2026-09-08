import { token } from "../config.js";

const BAZAAR = "https://www.binance.com/bapi/ramp/v1/public/ramp/b402";

export interface BazaarAccept {
  scheme: string;
  network: string;
  asset: string;
  maxAmountRequired: string;
  payTo: string;
}

export interface BazaarListing {
  resource: string;
  description?: string;
  accepts?: BazaarAccept[];
  quality?: { l30DaysTotalCalls?: number; l30DaysUniquePayers?: number };
  lastUpdated?: number;
}

export interface ScoredListing {
  resource: string;
  description: string;
  payTo: string;
  priceUsd1: number;
  /** How many of the returned listings share this payTo. */
  operatorListings: number;
  uniquePayers: number | null;
  totalCalls: number | null;
  score: number;
  notes: string[];
}

/**
 * Search the B402 Bazaar. Public, unauthenticated - Binance's own catalog of
 * endpoints that accept x402 on BNB Chain.
 */
export async function searchBazaar(query: string, limit = 25): Promise<BazaarListing[]> {
  const url =
    `${BAZAAR}/bazaar/search?query=${encodeURIComponent(query)}` +
    `&network=eip155:56&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`bazaar search ${res.status}`);
  const body = (await res.json()) as { data?: { resources?: BazaarListing[]; items?: BazaarListing[] } };
  return body.data?.resources ?? body.data?.items ?? [];
}

/**
 * Rank discovered listings defensively.
 *
 * The naive agent takes the top result. That is Attack IV in
 * "Five Attacks on x402 Agentic Payment Protocol" (arXiv 2605.11781): poisoned
 * discovery metadata reached 71.8% selection, and five Sybil listings captured
 * 60.2% of agents tested. The catalog's own ranking is not a safety signal.
 *
 * So we score on things an attacker has to spend real money to fake:
 *
 *   - buyer diversity - 500 settles from 200 wallets is worth more than
 *     1,000 from three. Bazaar publishes both counts.
 *   - operator concentration - one payTo holding most of the shortlist is the
 *     Sybil shape, whoever it belongs to.
 *   - price, which is the only cost we actually bear.
 *
 * Nothing here is a verdict on the merchant. It is a statement about how much
 * the catalog alone justifies trusting them.
 */
export function scoreListings(listings: BazaarListing[]): ScoredListing[] {
  const usable = listings.filter((l) =>
    (l.accepts ?? []).some(
      (a) => a.asset?.toLowerCase() === token.address.toLowerCase() && a.scheme === "eip3009",
    ),
  );

  const perOperator = new Map<string, number>();
  for (const l of usable) {
    const payTo = ourAccept(l)!.payTo.toLowerCase();
    perOperator.set(payTo, (perOperator.get(payTo) ?? 0) + 1);
  }

  const scored = usable.map((l): ScoredListing => {
    const accept = ourAccept(l)!;
    const payTo = accept.payTo;
    const operatorListings = perOperator.get(payTo.toLowerCase()) ?? 1;
    const priceUsd1 = Number(accept.maxAmountRequired) / 10 ** token.decimals;
    const uniquePayers = l.quality?.l30DaysUniquePayers ?? null;
    const totalCalls = l.quality?.l30DaysTotalCalls ?? null;

    const notes: string[] = [];
    let score = 0;

    if (uniquePayers === null) {
      notes.push("no 30-day usage data published - unproven, not disqualifying");
    } else {
      score += Math.min(uniquePayers, 200) / 4; // up to +50 for breadth of payers
      if (totalCalls && uniquePayers >= 1) {
        const callsPerPayer = totalCalls / uniquePayers;
        if (callsPerPayer > 50) {
          score -= 15;
          notes.push(`${totalCalls} calls from only ${uniquePayers} payers - concentrated`);
        } else {
          notes.push(`${totalCalls} calls across ${uniquePayers} payers`);
        }
      }
    }

    const share = operatorListings / (usable.length || 1);
    if (share >= 0.5) {
      score -= 30;
      notes.push(`one operator holds ${operatorListings} of ${usable.length} results - dominates the shortlist`);
    } else if (operatorListings > 1) {
      score -= 5 * (operatorListings - 1);
      notes.push(`${operatorListings} listings share this payee`);
    }

    score -= priceUsd1 * 10; // cheap tiebreak; price is the only cost we bear

    return {
      resource: l.resource,
      description: (l.description ?? "").trim(),
      payTo,
      priceUsd1,
      operatorListings,
      uniquePayers,
      totalCalls,
      score: Number(score.toFixed(2)),
      notes,
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

const ourAccept = (l: BazaarListing) =>
  (l.accepts ?? []).find(
    (a) => a.asset?.toLowerCase() === token.address.toLowerCase() && a.scheme === "eip3009",
  );

export interface Verification {
  reachable: boolean;
  status: number | null;
  matchesListing: boolean;
  servedVersion: number | null;
  servedNetworks: string[];
  servedAssets: string[];
  problem: string | null;
}

/**
 * Check what the endpoint actually serves, rather than what the catalog claims.
 *
 * Bazaar indexes the metadata blob attached to a merchant's settle call, so a
 * listing is a record of one past payment - not a live contract. A merchant can
 * settle once on BSC to get indexed and serve something else entirely. Scoring
 * catalog metadata is necessary; it is not sufficient, and this is the step
 * that catches the difference before any money is signed away.
 */
export async function verifyListing(listing: ScoredListing): Promise<Verification> {
  const empty = (problem: string, status: number | null = null): Verification => ({
    reachable: status !== null,
    status,
    matchesListing: false,
    servedVersion: null,
    servedNetworks: [],
    servedAssets: [],
    problem,
  });

  let res: Response;
  try {
    res = await fetch(listing.resource, { signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    return empty(`unreachable: ${(e as Error).message}`);
  }
  if (res.status !== 402) return empty(`expected 402, served ${res.status}`, res.status);

  let body: any;
  try {
    body = await res.json();
  } catch {
    return empty("402 body is not JSON", 402);
  }

  const accepts: any[] = body.accepts ?? [];
  const servedNetworks = [...new Set(accepts.map((a) => String(a.network)))];
  const servedAssets = [...new Set(accepts.map((a) => String(a.asset ?? "").toLowerCase()))];
  const version = Number(body.x402Version);

  const payable = accepts.some(
    (a) =>
      a.asset?.toLowerCase() === token.address.toLowerCase() &&
      String(a.network) === "eip155:56" &&
      a.extra?.assetTransferMethod === "eip3009",
  );

  let problem: string | null = null;
  if (version !== 2) problem = `serves x402 v${version}; the Agentic Wallet signs v2 only`;
  else if (!payable) problem = `listing advertises USD1 on BSC, endpoint offers ${servedNetworks.join(", ") || "nothing"}`;

  return {
    reachable: true,
    status: 402,
    matchesListing: payable && version === 2,
    servedVersion: Number.isFinite(version) ? version : null,
    servedNetworks,
    servedAssets,
    problem,
  };
}
