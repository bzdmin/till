/** The spoken-demo check: does the rules path pick sensibly with no model? */
import { chooseSkill } from "../src/buyer/intent.js";

const catalog = [
  { name: "btc-brief", price: "0.10", description: "Signed BTC stance for the last 48h." },
  { name: "deep-dive", price: "5.00", description: "48h vs 7d structure across timeframes." },
];

const phrases = [
  "I need a BTC stance",
  "what's ETH doing?",
  "should I hold my solana?",
  "quick read on doge",
  "Give me a thorough multi-timeframe read on SOL before I size up.",
  "deep dive on BNB",
  "how is SUIUSDT looking",
  "banana",
];

for (const p of phrases) {
  const d = await chooseSkill(p, catalog);
  console.log(`  "${p}"`.padEnd(62) + `-> ${d.skill.padEnd(10)} ${d.symbol.padEnd(9)} [${d.source}]`);
}
