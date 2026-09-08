import { verifyMessage } from "viem";
import { canonical, type Stance } from "../skill/stance.js";
import { seller } from "../config.js";

export interface AcceptanceResult {
  ok: boolean;
  failures: string[];
  latencyMs: number;
}

const MAX_LATENCY_MS = 10_000;

/**
 * Till's answer to the gap x402 does not close: financial finality is not
 * fulfillment. Settlement proves the transfer, never that the work was good.
 *
 * We do not pretend otherwise and we do not fake an escrow. We check what can
 * actually be checked, and when it fails after settlement the tape says
 * SETTLED_NO_GOODS rather than hiding it.
 */
export async function acceptStance(stance: Stance, latencyMs: number): Promise<AcceptanceResult> {
  const failures: string[] = [];

  if (!stance.call) failures.push("missing call");
  if (!["wait", "reduce", "hold-the-range"].includes(stance.call)) failures.push(`unknown call "${stance.call}"`);
  if (!Array.isArray(stance.reasons) || stance.reasons.length !== 2) failures.push("expected exactly two reasons");
  else if (stance.reasons.some((r) => !r || !r.trim())) failures.push("empty reason");
  if (!stance.evidence || typeof stance.evidence.last !== "number") failures.push("missing evidence");
  if (latencyMs > MAX_LATENCY_MS) failures.push(`latency ${latencyMs}ms over ${MAX_LATENCY_MS}ms`);

  // The deep-dive costs 50x the brief, so it must actually carry more.
  if (stance.timeframes) {
    if (stance.timeframes.length < 3) failures.push("deep-dive has fewer than three timeframes");
    if (!stance.agreement) failures.push("deep-dive is missing its agreement verdict");
  }

  if (!stance.signature) failures.push("deliverable is not signed");
  else {
    const valid = await verifyMessage({
      address: seller.address,
      message: canonical(stance),
      signature: stance.signature as `0x${string}`,
    });
    if (!valid) failures.push("signature does not verify against the seller");
  }

  return { ok: failures.length === 0, failures, latencyMs };
}
