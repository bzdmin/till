import { publicClient, walletClient } from "../chain/client.js";
import { tokenAbi } from "../chain/token.js";
import { seller, token } from "../config.js";
import type { SignedAuthorization } from "../chain/authorization.js";
import type { SettlementAdapter, SettlementReceipt } from "./provider.js";

const fn = (a: SignedAuthorization) =>
  a.method === "receive" ? ("receiveWithAuthorization" as const) : ("transferWithAuthorization" as const);

const args = (a: SignedAuthorization) =>
  [a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, a.v, a.r, a.s] as const;

/**
 * Till acts as its own facilitator.
 *
 * The seller submits, because receiveWithAuthorization requires
 * msg.sender == to. The seller pays gas; the buyer never sends a transaction
 * and never needs BNB.
 */
export class SelfBroadcast implements SettlementAdapter {
  readonly name = "selfbroadcast";

  async simulate(auth: SignedAuthorization): Promise<void> {
    await publicClient.simulateContract({
      address: token.address,
      abi: tokenAbi,
      functionName: fn(auth),
      args: args(auth),
      account: seller,
    });
  }

  async settle(auth: SignedAuthorization): Promise<SettlementReceipt> {
    // Never broadcast something we have not already watched succeed.
    await this.simulate(auth);

    const txHash = await walletClient.writeContract({
      address: token.address,
      abi: tokenAbi,
      functionName: fn(auth),
      args: args(auth),
      account: seller,
      chain: walletClient.chain,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new Error(`settlement reverted: ${txHash}`);
    return { adapter: this.name, txHash, blockNumber: receipt.blockNumber.toString() };
  }
}
