import { type Address, type Hex } from "viem";
import { chain, token, seller, usd1 } from "../config.js";
import type { SignedAuthorization } from "../chain/authorization.js";

/** Wire shape copied from a live CoinMarketCap 402, not invented. */
export interface PaymentRequirement {
  scheme: "exact";
  network: string;
  asset: Address;
  payTo: Address;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string; assetTransferMethod: "eip3009" };
  amount: string;
}

export interface Challenge {
  x402Version: 2;
  resource: { url: string; description: string; mimeType: "application/json" };
  accepts: PaymentRequirement[];
  error: "Payment required";
}

export interface PaymentPayload {
  x402Version: 2;
  resource: { url: string };
  accepted: PaymentRequirement;
  payload: {
    authorization: {
      from: Address;
      to: Address;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: Hex;
    };
    signature: { v: number; r: Hex; s: Hex };
  };
}

export const network = `eip155:${chain.id}`;

export function buildChallenge(url: string, description: string, price: string): Challenge {
  return {
    x402Version: 2,
    resource: { url, description, mimeType: "application/json" },
    accepts: [
      {
        scheme: "exact",
        network,
        asset: token.address,
        payTo: seller.address,
        maxTimeoutSeconds: 30,
        extra: { name: token.name, version: token.version, assetTransferMethod: "eip3009" },
        amount: usd1(price).toString(),
      },
    ],
    error: "Payment required",
  };
}

export const encodeHeader = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

export const decodeHeader = <T>(header: string): T => JSON.parse(Buffer.from(header, "base64").toString("utf8")) as T;

export const toSignedAuthorization = (p: PaymentPayload): SignedAuthorization => ({
  from: p.payload.authorization.from,
  to: p.payload.authorization.to,
  value: BigInt(p.payload.authorization.value),
  validAfter: BigInt(p.payload.authorization.validAfter),
  validBefore: BigInt(p.payload.authorization.validBefore),
  nonce: p.payload.authorization.nonce,
  v: p.payload.signature.v,
  r: p.payload.signature.r,
  s: p.payload.signature.s,
});

/**
 * What the seller checks before it will broadcast anything.
 *
 * The signature itself is validated by the token contract, not here - this
 * only confirms the buyer signed for the thing we actually advertised.
 */
export function validatePayment(payload: PaymentPayload, required: PaymentRequirement): string | null {
  const a = payload.payload.authorization;
  if (payload.x402Version !== 2) return "unsupported x402Version";
  if (payload.accepted.asset.toLowerCase() !== required.asset.toLowerCase()) return "wrong asset";
  if (payload.accepted.network !== required.network) return "wrong network";
  if (a.to.toLowerCase() !== required.payTo.toLowerCase()) return "authorization pays the wrong address";
  if (BigInt(a.value) !== BigInt(required.amount)) return "amount does not match the price";
  if (BigInt(a.validBefore) <= BigInt(Math.floor(Date.now() / 1000))) return "authorization has expired";
  return null;
}
