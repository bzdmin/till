/**
 * The one experiment that retires Till's last protocol unknown: does our
 * signature produce an authorization the token actually accepts?
 *
 * Simulation costs nothing, so it runs first and always. Broadcast happens
 * only with --broadcast, and only after simulation passes.
 */
import { formatUnits } from "viem";
import { buildAuthorization, signAuthorization } from "../src/chain/authorization.js";
import { assertDomainMatches, balanceOf, localDomainSeparator } from "../src/chain/token.js";
import { SelfBroadcast } from "../src/settlement/selfBroadcast.js";
import { buyer, prices, seller, token, usd1 } from "../src/config.js";

const broadcast = process.argv.includes("--broadcast");
const amount = usd1(prices.skill);
const fmt = (v: bigint) => formatUnits(v, token.decimals);

console.log(`token       ${token.address}`);
console.log(`domain      "${token.name}" / version "${token.version}"`);

console.log("\n[1] domain guard");
await assertDomainMatches();
console.log(`    ok - local separator matches on-chain`);
console.log(`    ${localDomainSeparator()}`);

console.log("\n[2] balances before");
const before = { a: await balanceOf(buyer.address), b: await balanceOf(seller.address) };
console.log(`    A ${fmt(before.a)} USD1    B ${fmt(before.b)} USD1`);

console.log("\n[3] buyer signs ReceiveWithAuthorization");
const auth = buildAuthorization(buyer.address, seller.address, amount);
const signed = await signAuthorization(buyer, auth);
console.log(`    ${fmt(amount)} USD1   A -> B`);
console.log(`    valid until ${new Date(Number(signed.validBefore) * 1000).toISOString()}`);
console.log("    authorization signed (withheld until inclusion)");

const adapter = new SelfBroadcast();

console.log("\n[4] simulate (free)");
await adapter.simulate(signed);
console.log("    ok - the token accepts this authorization");

if (!broadcast) {
  console.log("\nsimulation passed. re-run with --broadcast to settle for real.");
  process.exit(0);
}

console.log("\n[5] broadcast");
const receipt = await adapter.settle(signed);
console.log(`    tx    ${receipt.txHash}`);
console.log(`    block ${receipt.blockNumber}`);
console.log(`    https://bscscan.com/tx/${receipt.txHash}`);

console.log("\n[6] balances after");
const after = { a: await balanceOf(buyer.address), b: await balanceOf(seller.address) };
console.log(`    A ${fmt(after.a)} USD1    B ${fmt(after.b)} USD1`);
console.log(`    moved ${fmt(before.a - after.a)} USD1`);
