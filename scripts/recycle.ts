/**
 * Sends Agent B's USD1 back to Agent A so the demo can be re-shot.
 *
 * The float is small and the money only ever moves between two wallets we
 * own, so this is what makes the video re-recordable.
 */
import { formatUnits } from "viem";
import { publicClient, walletClient } from "../src/chain/client.js";
import { balanceOf, tokenAbi } from "../src/chain/token.js";
import { buyer, seller, token } from "../src/config.js";

const fmt = (v: bigint) => formatUnits(v, token.decimals);

const amount = await balanceOf(seller.address);
if (amount === 0n) {
  console.log("Agent B holds no USD1 - nothing to recycle.");
  process.exit(0);
}

console.log(`returning ${fmt(amount)} USD1   B -> A`);
const hash = await walletClient.writeContract({
  address: token.address,
  abi: tokenAbi,
  functionName: "transfer",
  args: [buyer.address, amount],
  account: seller,
  chain: walletClient.chain,
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(`  ${receipt.status}  ${hash}`);
console.log(`  A ${fmt(await balanceOf(buyer.address))} USD1    B ${fmt(await balanceOf(seller.address))} USD1`);
