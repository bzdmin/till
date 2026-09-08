/**
 * Discover x402 counters on the B402 Bazaar, rank them defensively, then check
 * what each one actually serves before trusting any of it.
 *
 * Free - public catalog, public endpoints, no payment.
 *   npm run bazaar -- "crypto market data"
 */
import { searchBazaar, scoreListings, verifyListing } from "../src/buyer/bazaar.js";

const query = process.argv.slice(2).join(" ") || "crypto market data";
const listings = await searchBazaar(query, 25);
const scored = scoreListings(listings);

console.log(`query: "${query}"`);
console.log(`${listings.length} listings returned, ${scored.length} advertise USD1 via eip3009\n`);

const top = scored.slice(0, 6);
let payable = 0;

for (const [i, s] of top.entries()) {
  console.log(`${String(i + 1).padStart(2)}. ${s.resource}`);
  console.log(`    ${s.priceUsd1.toFixed(4)} USD1   payee ${s.payTo.slice(0, 12)}…   score ${s.score}`);
  s.notes.forEach((n) => console.log(`      · ${n}`));

  const v = await verifyListing(s);
  if (v.matchesListing) {
    payable++;
    console.log(`      ✓ verified: serves x402 v2, USD1 on BSC - payable`);
  } else {
    console.log(`      ✗ ${v.problem}`);
  }
}

console.log(
  `\n${payable} of ${top.length} checked listings actually serve what they advertise.` +
    (payable === 0 ? "\nNothing here is payable. The buyer signs nothing." : ""),
);
