/**
 * Sends Agent B's USD1 to another address - used to fund the Binance Agentic
 * Wallet, which becomes the buyer once the x402 signing moves off a local key.
 *
 * Agent A cannot do this itself: it holds no BNB by design and has never sent
 * a transaction.
 */
import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import { publicClient, walletClient } from "../src/chain/client.js";
import { balanceOf, tokenAbi } from "../src/chain/token.js";
import { seller, token } from "../src/config.js";

const to = process.argv[2] as Address | undefined;
const amountArg = process.argv[3];
if (!to || !isAddress(to)) {
  console.error("usage: tsx scripts/fund.ts <address> [amount]   (default: B's whole balance)");
  process.exit(1);
}

const fmt = (v: bigint) => formatUnits(v, token.decimals);
const held = await balanceOf(seller.address);
const amount = amountArg ? parseUnits(amountArg, token.decimals) : held;

if (amount === 0n) { console.log("Agent B holds no USD1."); process.exit(0); }
if (amount > held) { console.error(`Agent B holds only ${fmt(held)} USD1.`); process.exit(1); }

console.log(`sending ${fmt(amount)} USD1   B -> ${to}`);
const hash = await walletClient.writeContract({
  address: token.address, abi: tokenAbi, functionName: "transfer",
  args: [to, amount], account: seller, chain: walletClient.chain,
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(`  ${receipt.status}  https://bscscan.com/tx/${hash}`);
console.log(`  B now holds ${fmt(await balanceOf(seller.address))} USD1`);
console.log(`  ${to} now holds ${fmt(await balanceOf(to))} USD1`);
