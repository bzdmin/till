import express from "express";
import { formatUnits } from "viem";
import { BuyerAgent } from "../buyer/agent.js";
import { mandateFrom } from "../buyer/mandate.js";
import { balanceOf } from "../chain/token.js";
import { buyer, prices, seller, token, useAgenticWallet } from "../config.js";
import { tape, type TapeRow } from "../tape.js";

const app = express();
const PORT = Number(process.env.UI_PORT ?? 4180);
const SELLER = process.env.SELLER_URL ?? "http://localhost:3000";

const mandate = mandateFrom(prices.dailyCap, prices.dailyCap, [seller.address]);
const agent = new BuyerAgent(mandate, useAgenticWallet);
const fmt = (v: bigint) => formatUnits(v, token.decimals);
const amt = (v: bigint) => Number(formatUnits(v, token.decimals)).toFixed(2);

app.use(express.static("public"));

app.get("/api/state", async (_req, res) => {
  const [a, b] = await Promise.all([balanceOf(buyer.address), balanceOf(seller.address)]);
  res.json({
    buyer: buyer.address,
    seller: seller.address,
    balances: { a: fmt(a), b: fmt(b) },
    mandate: {
      cap: prices.dailyCap,
      spent: amt(mandate.spentTotal),
      remaining: amt(mandate.remaining),
    },
    prices: { brief: prices.skill, deepDive: prices.deepDive },
    rows: tape.rows,
  });
});

/** Server-sent events: one row at a time, in the order the agent produced them. */
app.get("/api/tape", (_req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  const send = (row: TapeRow) => res.write(`data: ${JSON.stringify(row)}\n\n`);
  tape.on("row", send);
  const beat = setInterval(() => res.write(": keepalive\n\n"), 15_000);
  _req.on("close", () => {
    tape.off("row", send);
    clearInterval(beat);
  });
});

app.use(express.json());

app.post("/api/request", async (req, res) => {
  const text = String((req.body?.text ?? "").toString().slice(0, 400)).trim();
  if (!text) return res.status(400).json({ status: "error", reason: "say what you need" });
  try {
    const result = await agent.request(text, SELLER);
    const [a, b] = await Promise.all([balanceOf(buyer.address), balanceOf(seller.address)]);
    res.json({
      ...result,
      balances: { a: fmt(a), b: fmt(b) },
      mandate: { spent: amt(mandate.spentTotal), remaining: amt(mandate.remaining) },
    });
  } catch (e) {
    res.status(500).json({ status: "error", reason: (e as Error).message });
  }
});

app.get("/api/model", (_req, res) => {
  res.json({ configured: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.listen(PORT, () => {
  console.log(`Till tape - http://localhost:${PORT}`);
  console.log(`  counter at ${SELLER}`);
});
