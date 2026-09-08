import express from "express";
import { prices, seller } from "../config.js";
import { SelfBroadcast } from "../settlement/selfBroadcast.js";
import { assertDomainMatches } from "../chain/token.js";
import { produceStance } from "../skill/stance.js";
import { produceDeepDive } from "../skill/deepdive.js";
import { acceptStance } from "./acceptance.js";
import {
  buildChallenge,
  decodeHeader,
  encodeHeader,
  toSignedAuthorization,
  validatePayment,
  type PaymentPayload,
} from "./challenge.js";

const app = express();
const adapter = new SelfBroadcast();
const PORT = Number(process.env.PORT ?? 3000);
/** What the 402 advertises as the resource. Must be the address buyers can reach. */
const base = () => process.env.SELLER_PUBLIC_URL ?? `http://localhost:${PORT}`;

const skills = {
  "btc-brief": {
    price: prices.skill,
    description: "Signed BTC stance for the last 48h - a call plus two reasons, from public Binance klines.",
    produce: () => produceStance(),
  },
  "deep-dive": {
    price: prices.deepDive,
    description:
      "Signed BTC stance across 1h, 4h and 1d, plus whether the horizons agree. Three reads, not one.",
    produce: () => produceDeepDive(),
  },
} as const;

type SkillName = keyof typeof skills;

/**
 * The counter.
 *
 * No payment header means the request gets a price, not the goods. That 402
 * is the entire advertisement - there is no registry and no catalog.
 *
 * With a payment header the order is deliberate: settle, then produce, then
 * check. Settlement first is x402's native coupling; the body is never
 * released against an unsettled authorization.
 */
app.get("/skills/:name", async (req, res) => {
  const name = req.params.name as SkillName;
  const skill = skills[name];
  if (!skill) return res.status(404).json({ error: `no such skill: ${name}` });

  const url = `${base()}/skills/${name}`;
  const challenge = buildChallenge(url, skill.description, skill.price);
  const required = challenge.accepts[0]!;

  // x402 v2 names this PAYMENT-SIGNATURE; our own client used X-PAYMENT first.
  const header = req.get("payment-signature") ?? req.get("x-payment");
  if (!header) {
    return res.status(402).set("payment-required", encodeHeader(challenge)).json(challenge);
  }

  let payload: PaymentPayload;
  try {
    payload = decodeHeader<PaymentPayload>(header);
  } catch {
    return res.status(400).json({ error: "payment header is not valid base64 JSON" });
  }

  const invalid = validatePayment(payload, required);
  if (invalid) return res.status(400).json({ error: invalid });

  let auth;
  try {
    auth = await toSignedAuthorization(payload);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  let receipt;
  try {
    receipt = await adapter.settle(auth);
  } catch (e) {
    return res.status(402).json({ error: "settlement failed", detail: (e as Error).message.split("\n")[0] });
  }

  const startedAt = Date.now();
  let stance;
  try {
    stance = await skill.produce();
  } catch (e) {
    // Paid and could not deliver. Say so plainly - x402 cannot claw back.
    return res
      .status(502)
      .set("payment-response", encodeHeader(receipt))
      .json({ error: "SETTLED_NO_GOODS", detail: (e as Error).message, receipt });
  }

  const acceptance = await acceptStance(stance, Date.now() - startedAt);
  if (!acceptance.ok) {
    return res
      .status(502)
      .set("payment-response", encodeHeader(receipt))
      .json({ error: "SETTLED_NO_GOODS", failures: acceptance.failures, receipt });
  }

  return res
    .status(200)
    .set("payment-response", encodeHeader(receipt))
    .json({ stance, receipt, acceptance });
});

app.get("/", (_req, res) => {
  res.json({
    agent: "Agent B",
    address: seller.address,
    counter: Object.entries(skills).map(([name, s]) => ({
      url: `${base()}/skills/${name}`,
      price: `${s.price} USD1`,
      description: s.description,
    })),
  });
});

await assertDomainMatches();
app.listen(PORT, () => {
  console.log(`Agent B - the counter - http://localhost:${PORT}`);
  console.log(`  ${seller.address}`);
  for (const [name, s] of Object.entries(skills)) console.log(`  /skills/${name}  ${s.price} USD1`);
});
