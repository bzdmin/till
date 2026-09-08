import { parseSignature, toHex, type Address, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { chain, token } from "../config.js";

export interface Authorization {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
}

export type AuthorizationMethod = "receive" | "transfer";

export interface SignedAuthorization extends Authorization {
  v: number;
  r: Hex;
  s: Hex;
  /**
   * Which EIP-3009 variant the signature covers.
   *
   * `receive` binds msg.sender to the payee, so only the seller can submit it -
   * that is what closes Attack I-B. `transfer` is caller-unbound and is what
   * the x402 convention (and the Binance Agentic Wallet) signs. The digests
   * differ, so submitting one against the other reverts as an invalid
   * signature.
   */
  method: AuthorizationMethod;
}

const types = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

const randomNonce = (): Hex => toHex(crypto.getRandomValues(new Uint8Array(32)));

export function buildAuthorization(
  from: Address,
  to: Address,
  value: bigint,
  validForSeconds = 300,
): Authorization {
  const now = Math.floor(Date.now() / 1000);
  return {
    from,
    to,
    value,
    validAfter: 0n,
    validBefore: BigInt(now + validForSeconds),
    nonce: randomNonce(),
  };
}

/**
 * The buyer's payment. This signature IS the payment - whoever broadcasts it
 * is acting as the facilitator. Treat it as a bearer credential: never log it
 * before the transaction is included.
 *
 * ReceiveWithAuthorization (not TransferWithAuthorization) binds the caller to
 * the payee, so only the seller can submit it. That closes the front-run.
 */
export async function signAuthorization(
  account: PrivateKeyAccount,
  auth: Authorization,
): Promise<SignedAuthorization> {
  const signature = await account.signTypedData({
    domain: {
      name: token.name,
      version: token.version,
      chainId: chain.id,
      verifyingContract: token.address,
    },
    types,
    primaryType: "ReceiveWithAuthorization",
    message: auth,
  });
  const { v, r, s } = parseSignature(signature);
  return { ...auth, v: Number(v), r, s, method: "receive" };
}
