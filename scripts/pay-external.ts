/**
 * Pay a third-party x402 endpoint with the Binance Agentic Wallet.
 *
 * Everything else in Till moves money between two wallets we control. This
 * does not: the payee is someone else's merchant, and their facilitator - not
 * ours - settles it. That is what makes it evidence rather than a rehearsal.
 *
 *   npm run pay-external -- <url>
 */
import { signWithAgenticWallet } from "../src/buyer/agenticWallet.js";
import { verifyListing } from "../src/buyer/bazaar.js";

const url = process.argv[2];
if (!url) {
  console.error("usage: tsx scripts/pay-external.ts <url>");
  process.exit(1);
}

console.log(`target: ${url}\n`);

// Never sign for an endpoint we have not checked serves what it claims.
const v = await verifyListing({
  resource: url, description: "", payTo: "", priceUsd1: 0,
  operatorListings: 1, uniquePayers: null, totalCalls: null, score: 0, notes: [],
});
console.log(`[1] verify   x402 v${v.servedVersion}, networks ${v.servedNetworks.join(", ")}`);
if (!v.matchesListing) {
  console.log(`    refusing: ${v.problem}`);
  process.exit(1);
}
console.log(`    payable with USD1 on BSC via eip3009`);

const raw = await (await fetch(url)).text();
const challenge = JSON.parse(raw);
const ours = (challenge.accepts ?? []).find(
  (a: any) => a.extra?.assetTransferMethod === "eip3009" && a.network === "eip155:56",
);
console.log(`\n[2] price    ${(Number(ours.amount) / 1e18).toFixed(4)} USD1 -> ${ours.payTo}`);

console.log(`\n[3] sign     via Binance Agentic Wallet`);
const signed = await signWithAgenticWallet(raw);
console.log(`    wallet ${signed.wallet}`);
console.log(`    header ${signed.headerName}, expires ${new Date(signed.expiresAt * 1000).toISOString()}`);

console.log(`\n[4] replay`);
const res = await fetch(url, { headers: { [signed.headerName]: signed.headerValue } });
console.log(`    HTTP ${res.status}`);

const receiptHeader = res.headers.get("payment-response");
if (receiptHeader) {
  try {
    const receipt = JSON.parse(Buffer.from(receiptHeader, "base64").toString("utf8"));
    console.log(`\n[5] settled by the merchant's facilitator`);
    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.transaction || receipt.txHash) {
      console.log(`    https://bscscan.com/tx/${receipt.transaction ?? receipt.txHash}`);
    }
  } catch {
    console.log(`\n[5] payment-response (raw): ${receiptHeader.slice(0, 200)}`);
  }
} else {
  console.log(`\n[5] no payment-response header returned`);
}

const body = await res.text();
console.log(`\n[6] goods (${body.length} bytes):`);
console.log(body.slice(0, 700));
