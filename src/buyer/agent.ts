import { formatUnits, type Address } from "viem";
import { buyer, token } from "../config.js";
import { buildAuthorization, signAuthorization } from "../chain/authorization.js";
import { assertDomainMatches, balanceOf } from "../chain/token.js";
import type { Challenge, PaymentPayload, PaymentRequirement } from "../seller/challenge.js";
import { encodeHeader } from "../seller/challenge.js";
import type { Mandate } from "./mandate.js";
import { tape } from "../tape.js";
import { chooseSkill, type SkillOption } from "./intent.js";

export interface PurchaseResult {
  status: "delivered" | "refused" | "settled_no_goods" | "error";
  stance?: unknown;
  txHash?: string;
  reason?: string;
}

const fmt = (v: bigint) => formatUnits(v, token.decimals);
const amt = (v: bigint) => Number(formatUnits(v, token.decimals)).toFixed(2);

/** We only sign for the scheme we have actually verified against this token. */
const pickRequirement = (challenge: Challenge): PaymentRequirement | undefined =>
  challenge.accepts.find(
    (a) =>
      a.scheme === "exact" &&
      a.extra.assetTransferMethod === "eip3009" &&
      a.asset.toLowerCase() === token.address.toLowerCase(),
  );

/**
 * Agent A.
 *
 * Asks for a skill, gets a price, checks the owner's mandate, and only then
 * signs. It never sends a transaction - the signature is the payment, and the
 * seller broadcasts it.
 */
export class BuyerAgent {
  constructor(private mandate: Mandate) {}

  /**
   * The full agent turn: read a request in plain language, decide what to buy,
   * then buy it. The decision is the agent's; the mandate is the owner's, and
   * it is consulted separately inside purchase().
   */
  async request(text: string, sellerBase: string): Promise<PurchaseResult> {
    tape.push({ kind: "intent", text });

    const counter = (await (await fetch(`${sellerBase}/`)).json()) as {
      counter: { url: string; price: string; description: string }[];
    };
    const catalog: SkillOption[] = counter.counter.map((c) => ({
      name: c.url.split("/").pop()!,
      price: c.price.replace(" USD1", ""),
      description: c.description,
    }));

    const decision = await chooseSkill(text, catalog);
    tape.push({ kind: "decision", skill: decision.skill, reasoning: decision.reasoning, source: decision.source });

    return this.purchase(`${sellerBase}/skills/${decision.skill}`, null);
  }

  async purchase(url: string, intent: string | null): Promise<PurchaseResult> {
    if (intent !== null) tape.push({ kind: "intent", text: intent });

    const challenged = await fetch(url);
    if (challenged.status !== 402) {
      return { status: "error", reason: `expected 402, got ${challenged.status}` };
    }
    const challenge = (await challenged.json()) as Challenge;
    const requirement = pickRequirement(challenge);
    if (!requirement) return { status: "error", reason: "no acceptable payment requirement offered" };

    const amount = BigInt(requirement.amount);
    tape.push({
      kind: "402",
      price: `${amt(amount)} USD1`,
      asset: requirement.asset,
      payTo: requirement.payTo,
      network: requirement.network,
    });

    const decision = this.mandate.check(requirement.payTo as Address, amount);
    tape.push({
      kind: "mandate",
      allowed: decision.allowed,
      reason: decision.reason,
      spent: amt(decision.spent),
      remaining: amt(decision.remaining),
    });

    if (!decision.allowed) {
      tape.push({ kind: "refused", reason: decision.reason, remaining: amt(decision.remaining) });
      return { status: "refused", reason: decision.reason };
    }

    // Refuse to sign against a domain we have not confirmed on-chain.
    await assertDomainMatches();

    const auth = buildAuthorization(buyer.address, requirement.payTo as Address, amount);
    const signed = await signAuthorization(buyer, auth);

    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url },
      accepted: requirement,
      payload: {
        authorization: {
          from: signed.from,
          to: signed.to,
          value: signed.value.toString(),
          validAfter: signed.validAfter.toString(),
          validBefore: signed.validBefore.toString(),
          nonce: signed.nonce,
        },
        signature: { v: signed.v, r: signed.r, s: signed.s },
      },
    };

    const paid = await fetch(url, { headers: { "x-payment": encodeHeader(payload) } });
    const body = (await paid.json()) as any;

    if (paid.status === 502 && body?.error === "SETTLED_NO_GOODS") {
      this.mandate.record(amount); // the money did leave, even though the goods did not arrive
      tape.push({ kind: "settled_no_goods", txHash: body.receipt?.txHash ?? "", failures: body.failures ?? [] });
      return { status: "settled_no_goods", txHash: body.receipt?.txHash };
    }
    if (!paid.ok) return { status: "error", reason: body?.error ?? `HTTP ${paid.status}` };

    this.mandate.record(amount);

    const txHash: string = body.receipt.txHash;
    tape.push({
      kind: "receipt",
      adapter: body.receipt.adapter,
      txHash,
      explorer: `https://bscscan.com/tx/${txHash}`,
    });
    tape.push({
      kind: "deliverable",
      call: body.stance.call,
      reasons: body.stance.reasons,
      signer: body.stance.signer,
    });
    await this.publishBalances();

    return { status: "delivered", stance: body.stance, txHash };
  }

  async publishBalances() {
    const [a, b] = await Promise.all([balanceOf(buyer.address), balanceOf(this.sellerAddress())]);
    tape.push({ kind: "balances", a: fmt(a), b: fmt(b) });
  }

  private sellerAddress(): Address {
    return this.mandate.config.allowlist[0]!;
  }
}
