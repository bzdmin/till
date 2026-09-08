/** Runs the deep-dive and its acceptance check with no payment. Free. */
import { produceDeepDive } from "../src/skill/deepdive.js";
import { acceptStance } from "../src/seller/acceptance.js";

const t0 = Date.now();
const stance = await produceDeepDive();
const latency = Date.now() - t0;
console.log(JSON.stringify({ ...stance, signature: stance.signature?.slice(0, 22) + "..." }, null, 2));
const acceptance = await acceptStance(stance, latency);
console.log("\nacceptance:", acceptance.ok ? "PASS" : "FAIL", acceptance.failures, `${latency}ms`);
