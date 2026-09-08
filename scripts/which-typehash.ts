/** Which EIP-3009 typehash did the Agentic Wallet actually sign? */
import { recoverTypedDataAddress, serializeSignature } from "viem";
import { signWithAgenticWallet } from "../src/buyer/agenticWallet.js";
import { decodeHeader, type PaymentPayload } from "../src/seller/challenge.js";
import { chain, token } from "../src/config.js";

const raw = await (await fetch("http://localhost:3000/skills/btc-brief")).text();
const signed = await signWithAgenticWallet(raw);
const p = decodeHeader<PaymentPayload>(signed.headerValue);
const a = p.payload.authorization;
const sig = typeof p.payload.signature === "string"
  ? p.payload.signature
  : serializeSignature({ r: p.payload.signature.r, s: p.payload.signature.s, v: BigInt(p.payload.signature.v) });

const fields = [
  { name: "from", type: "address" }, { name: "to", type: "address" },
  { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
] as const;

const domain = { name: token.name, version: token.version, chainId: chain.id, verifyingContract: token.address };
const message = {
  from: a.from, to: a.to, value: BigInt(a.value),
  validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce,
};

console.log(`signer claims to be: ${a.from}\n`);
for (const primaryType of ["ReceiveWithAuthorization", "TransferWithAuthorization"] as const) {
  try {
    const recovered = await recoverTypedDataAddress({
      domain, types: { [primaryType]: fields } as any, primaryType, message, signature: sig as `0x${string}`,
    });
    const match = recovered.toLowerCase() === a.from.toLowerCase();
    console.log(`${primaryType.padEnd(28)} -> ${recovered} ${match ? "  <<< MATCH" : ""}`);
  } catch (e) {
    console.log(`${primaryType.padEnd(28)} -> error: ${(e as Error).message.split("\n")[0]}`);
  }
}
