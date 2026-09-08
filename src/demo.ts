/**
 * The 45-second loop, end to end.
 *
 * Beat 1: buyer asks for a stance, mandate allows it, payment settles on BSC,
 *         the signed stance comes back.
 * Beat 2: buyer asks for the deep-dive, mandate refuses it before signing,
 *         and the remaining cap is unchanged.
 *
 * --rehearse runs only the refusal, which touches no network and costs
 * nothing. Use it to practise the shot.
 */
import { formatUnits } from "viem";
import { BuyerAgent } from "./buyer/agent.js";
import { mandateFrom } from "./buyer/mandate.js";
import { balanceOf } from "./chain/token.js";
import { buyer, prices, seller, token, useAgenticWallet } from "./config.js";
import { tape, type TapeRow } from "./tape.js";

const rehearse = process.argv.includes("--rehearse");
const base = process.env.SELLER_URL ?? "http://localhost:3000";
const fmt = (v: bigint) => formatUnits(v, token.decimals);

const render = (row: TapeRow) => {
  switch (row.kind) {
    case "intent":       return `\n  A  "${row.text}"`;
    case "decision":     return `  ?  chose ${row.skill}  [${row.source}]\n     ${row.reasoning}`;
    case "signer":       return `  #  signed by ${row.label}
     ${row.wallet}`;
    case "402":        return `  B  402 Payment Required - ${row.price} to ${row.payTo.slice(0, 10)}… on ${row.network}`;
    case "mandate":      return `  ~  mandate: ${row.allowed ? "ALLOW" : "BLOCK"} - ${row.reason}`;
    case "receipt":      return `  $  settled via ${row.adapter}\n     ${row.explorer}`;
    case "deliverable":  return `  B  ${row.call.toUpperCase()}\n${row.reasons.map((r) => `       - ${r}`).join("\n")}`;
    case "refused":      return `  X  REFUSED - ${row.reason}\n     cap unchanged, ${row.remaining} USD1 remaining`;
    case "settled_no_goods": return `  !  SETTLED_NO_GOODS - paid, not delivered: ${row.failures.join("; ")}`;
    case "balances":     return `  =  A ${row.a} USD1    B ${row.b} USD1`;
  }
};
tape.on("row", (row: TapeRow) => console.log(render(row)));

const mandate = mandateFrom(prices.dailyCap, prices.dailyCap, [seller.address]);
const agent = new BuyerAgent(mandate, useAgenticWallet);

console.log(`Till - the counter at ${base}`);
console.log(`  A ${buyer.address}`);
console.log(`  B ${seller.address}`);
console.log(`  mandate: ${prices.dailyCap} USD1/day cap`);
if (!rehearse) console.log(`  opening balances: A ${fmt(await balanceOf(buyer.address))}   B ${fmt(await balanceOf(seller.address))}`);

if (!rehearse) {
  const r = await agent.request("What should I do with my BTC position right now?", base);
  if (r.status !== "delivered") console.log(`  !  ${r.status}: ${r.reason ?? ""}`);
}

await agent.request("Give me a thorough multi-timeframe read before I size up.", base);

console.log(
  `\n  spent ${formatUnits(mandate.spentTotal, token.decimals)} of ${prices.dailyCap} USD1` +
    (rehearse ? "   (rehearsal - nothing was paid)" : ""),
);
