/** One purchase against the deployed counter, signed by the Agentic Wallet. */
import { BuyerAgent } from "../src/buyer/agent.js";
import { mandateFrom } from "../src/buyer/mandate.js";
import { prices, seller, useAgenticWallet } from "../src/config.js";
import { tape, type TapeRow } from "../src/tape.js";

const base = process.env.SELLER_URL ?? "https://till-counter.fly.dev";
const ask = process.argv.slice(2).join(" ") || "what's ETH doing right now?";

const render = (row: TapeRow) => {
  switch (row.kind) {
    case "intent": return `\n  A  "${row.text}"`;
    case "decision": return `  ?  chose ${row.skill} on ${row.symbol}  [${row.source}]\n     ${row.reasoning}`;
    case "signer": return `  #  ${row.label}\n     ${row.wallet}`;
    case "402": return `  B  402 Payment Required, ${row.price} to ${row.payTo.slice(0, 10)}...`;
    case "mandate": return `  ~  mandate ${row.allowed ? "ALLOW" : "BLOCK"}, ${row.reason}`;
    case "receipt": return `  $  settled via ${row.adapter}\n     ${row.explorer}`;
    case "deliverable": return `  B  ${row.call.toUpperCase()}\n${row.reasons.map((x) => "       - " + x).join("\n")}`;
    case "refused": return `  X  REFUSED, ${row.reason}`;
    case "balances": return `  =  A ${row.a} USD1    B ${row.b} USD1`;
    default: return "";
  }
};
tape.on("row", (x: TapeRow) => { const t = render(x); if (t) console.log(t); });

console.log(`counter ${base}`);
console.log(`signer  ${useAgenticWallet ? "binance agentic wallet" : "local key"}`);

const agent = new BuyerAgent(mandateFrom(prices.dailyCap, prices.dailyCap, [seller.address]), useAgenticWallet);
const out = await agent.request(ask, base);
if (out.status !== "delivered") console.log(`  !! ${out.status}: ${out.reason ?? ""}`);
