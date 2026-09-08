/** The spoken-demo check: does the rules path pick sensibly with no model? */
import { chooseSkill } from "../src/buyer/intent.js";

const catalog = [
  { name: "btc-brief", price: "0.10", description: "Signed BTC stance for the last 48h." },
  { name: "deep-dive", price: "5.00", description: "48h vs 7d structure across timeframes." },
];

const phrases = [
  "I need a BTC stance",
  "What should I do with my BTC position right now?",
  "quick read please",
  "Give me a thorough multi-timeframe read before I size up.",
  "deep dive",
  "banana",
];

for (const p of phrases) {
  const d = await chooseSkill(p, catalog);
  console.log(`  "${p}"`.padEnd(58) + `-> ${d.skill.padEnd(10)} [${d.source}]`);
  console.log(`   ${" ".repeat(55)}${d.reasoning}`);
}
