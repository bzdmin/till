import type { Hex } from "viem";
import type { SignedAuthorization } from "../chain/authorization.js";

export interface SettlementReceipt {
  adapter: string;
  txHash: Hex;
  /** Decimal string, not bigint: receipts are JSON-encoded into headers and bodies. */
  blockNumber?: string;
}

/**
 * The seam between Till and whoever submits the payment.
 *
 * x402 has three roles: buyer, seller, facilitator. The buyer's signature is
 * the payment; a facilitator only broadcasts it and cannot alter the amount or
 * the payee. B402 is one facilitator, distinguished by gas sponsorship and
 * Bazaar indexing. SelfBroadcast is another. Neither is "more real" than the
 * other at the settlement layer.
 */
export interface SettlementAdapter {
  readonly name: string;
  /** Costs nothing. Must pass before broadcast is ever attempted. */
  simulate(auth: SignedAuthorization): Promise<void>;
  settle(auth: SignedAuthorization): Promise<SettlementReceipt>;
}
