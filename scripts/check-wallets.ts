import { formatEther, formatUnits } from "viem";
import { publicClient } from "../src/chain/client.js";
import { balanceOf } from "../src/chain/token.js";
import { buyer, seller, token } from "../src/config.js";

const rows = [
  { label: "BUYER  (Agent A)", role: "signs, sends no tx", account: buyer },
  { label: "SELLER (Agent B)", role: "broadcasts, pays gas", account: seller },
];

for (const { label, role, account } of rows) {
  const [bnb, usd1] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    balanceOf(account.address),
  ]);
  console.log(`${label} - ${role}`);
  console.log(`  ${account.address}`);
  console.log(`  BNB   ${formatEther(bnb)}`);
  console.log(`  USD1  ${formatUnits(usd1, token.decimals)}\n`);
}
