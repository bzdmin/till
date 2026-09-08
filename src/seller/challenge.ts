import { parseSignature, recoverTypedDataAddress, serializeSignature, type Address, type Hex } from "viem";
import { chain, token, seller, usd1 } from "../config.js";
import type {
  Authorization,
  AuthorizationMethod,
  SignedAuthorization,
} from "../chain/authorization.js";

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
    /**
     * Two shapes in the wild. Our local signer splits the signature; the
     * Binance Agentic Wallet returns the 65-byte hex whole. Both describe the
     * same ECDSA signature over the same authorization.
     */
    signature: { v: number; r: Hex; s: Hex } | Hex;
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

const EIP3009_FIELDS = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
] as const;

/**
 * Work out which EIP-3009 variant this signature actually covers.
 *
 * Our own client signs ReceiveWithAuthorization, which binds msg.sender to the
 * payee. The x402 convention - and the Binance Agentic Wallet - signs
 * TransferWithAuthorization, which is caller-unbound. The two produce different
 * digests, so guessing wrong reverts on-chain as "invalid signature". We
 * recover against both and use whichever resolves to the stated payer; if
 * neither does, the payload is not signed by whoever it claims.
 */
async function detectMethod(auth: Authorization, signature: Hex): Promise<AuthorizationMethod> {
  const domain = {
    name: token.name,
    version: token.version,
    chainId: chain.id,
    verifyingContract: token.address,
  };
  const message = {
    from: auth.from,
    to: auth.to,
    value: auth.value,
    validAfter: auth.validAfter,
    validBefore: auth.validBefore,
    nonce: auth.nonce,
  };

  for (const [method, primaryType] of [
    ["receive", "ReceiveWithAuthorization"],
    ["transfer", "TransferWithAuthorization"],
  ] as const) {
    try {
      const recovered = await recoverTypedDataAddress({
        domain,
        types: { [primaryType]: EIP3009_FIELDS },
        primaryType,
        message,
        signature,
      } as Parameters<typeof recoverTypedDataAddress>[0]);
      if (recovered.toLowerCase() === auth.from.toLowerCase()) return method;
    } catch {
      // try the other variant
    }
  }
  throw new Error("signature does not recover to the stated payer");
}

export async function toSignedAuthorization(p: PaymentPayload): Promise<SignedAuthorization> {
  const sig = p.payload.signature;
  const { v, r, s } = typeof sig === "string" ? parseSignature(sig) : sig;
  const hex: Hex = typeof sig === "string" ? sig : serializeSignature({ r, s, v: BigInt(v ?? 27) });

  const auth: Authorization = {
    from: p.payload.authorization.from,
    to: p.payload.authorization.to,
    value: BigInt(p.payload.authorization.value),
    validAfter: BigInt(p.payload.authorization.validAfter),
    validBefore: BigInt(p.payload.authorization.validBefore),
    nonce: p.payload.authorization.nonce,
  };

  return { ...auth, v: Number(v ?? 27), r, s, method: await detectMethod(auth, hex) };
}

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
