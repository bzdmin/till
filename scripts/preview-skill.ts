/** Runs the skill and the acceptance predicate with no payment. Free. */
import { produceStance } from "../src/skill/stance.js";
import { acceptStance } from "../src/seller/acceptance.js";

const t0 = Date.now();
const stance = await produceStance();
const latency = Date.now() - t0;

console.log(JSON.stringify({ ...stance, signature: stance.signature?.slice(0, 22) + "..." }, null, 2));
const acceptance = await acceptStance(stance, latency);
console.log("\nacceptance:", acceptance.ok ? "PASS" : "FAIL", acceptance.failures, `${latency}ms`);
