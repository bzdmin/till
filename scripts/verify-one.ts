/** Point the verifier at any x402 URL. Free. */
import { verifyListing } from "../src/buyer/bazaar.js";
const url = process.argv[2];
if (!url) { console.error("usage: tsx scripts/verify-one.ts <url>"); process.exit(1); }
const v = await verifyListing({
  resource: url, description: "", payTo: "", priceUsd1: 0,
  operatorListings: 1, uniquePayers: null, totalCalls: null, score: 0, notes: [],
});
console.log(url);
console.log(`  reachable ${v.reachable}  status ${v.status}  x402 v${v.servedVersion}`);
console.log(`  networks  ${v.servedNetworks.join(", ") || "-"}`);
console.log(`  payable with USD1 on BSC via eip3009: ${v.matchesListing ? "YES" : "no"}`);
if (v.problem) console.log(`  problem   ${v.problem}`);
