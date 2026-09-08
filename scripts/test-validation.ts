/**
 * Free adversarial check on the counter.
 *
 * Every case below must be rejected *before* the seller broadcasts anything.
 * Nothing here is a valid payment, so if the seller's balance moves, the
 * "never settle something we did not advertise" guard is broken.
 */
import { formatUnits, type Address } from "viem";
import { buildAuthorization, signAuthorization } from "../src/chain/authorization.js";
import { balanceOf } from "../src/chain/token.js";
import { encodeHeader, type Challenge, type PaymentPayload } from "../src/seller/challenge.js";
import { buyer, seller, token, usd1 } from "../src/config.js";

const base = process.env.SELLER_URL ?? "http://localhost:3000";
const url = `${base}/skills/brief`;
const fmt = (v: bigint) => formatUnits(v, token.decimals);

const challenge = (await (await fetch(url)).json()) as Challenge;
const required = challenge.accepts[0]!;

const payloadFor = async (over: {
  value?: bigint;
  to?: Address;
  validForSeconds?: number;
  asset?: Address;
}): Promise<PaymentPayload> => {
  const auth = buildAuthorization(
    buyer.address,
    over.to ?? (required.payTo as Address),
    over.value ?? BigInt(required.amount),
    over.validForSeconds ?? 300,
  );
  const signed = await signAuthorization(buyer, auth);
  return {
    x402Version: 2,
    resource: { url },
    accepted: over.asset ? { ...required, asset: over.asset } : required,
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
};

const before = { a: await balanceOf(buyer.address), b: await balanceOf(seller.address) };
console.log(`balances before   A ${fmt(before.a)}   B ${fmt(before.b)}\n`);

const cases: [string, string][] = [];

const run = async (name: string, header: string) => {
  const res = await fetch(url, { headers: { "x-payment": header } });
  const body = (await res.json()) as { error?: string };
  const rejected = res.status >= 400;
  cases.push([name, `${rejected ? "REJECTED" : "!! ACCEPTED"} ${res.status} - ${body.error ?? "?"}`]);
};

await run("garbage header", "not-base64-at-all");
await run("underpays (0.05 vs 0.10)", encodeHeader(await payloadFor({ value: usd1("0.05") })));
await run("pays the wrong address", encodeHeader(await payloadFor({ to: buyer.address })));
await run("expired authorization", encodeHeader(await payloadFor({ validForSeconds: -60 })));
await run("wrong asset", encodeHeader(await payloadFor({ asset: "0x55d398326f99059fF775485246999027B3197955" })));

for (const [name, result] of cases) console.log(`  ${name.padEnd(28)} ${result}`);

const after = { a: await balanceOf(buyer.address), b: await balanceOf(seller.address) };
console.log(`\nbalances after    A ${fmt(after.a)}   B ${fmt(after.b)}`);
const moved = before.a !== after.a || before.b !== after.b;
console.log(moved ? "\nFAIL - money moved on an invalid payment" : "\nPASS - nothing settled, no money moved");
process.exit(moved || cases.some(([, r]) => r.startsWith("!!")) ? 1 : 0);
