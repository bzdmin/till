import { formatUnits } from "viem";
import { signWithAgenticWallet } from "../src/buyer/agenticWallet.js";
import { decodeHeader, toSignedAuthorization, type PaymentPayload } from "../src/seller/challenge.js";
import { publicClient } from "../src/chain/client.js";
import { tokenAbi, balanceOf } from "../src/chain/token.js";
import { seller, token } from "../src/config.js";

const url = process.argv[2] ?? "https://till-counter.fly.dev/skills/btc-brief?symbol=ETHUSDT";
const raw = await (await fetch(url)).text();
const signed = await signWithAgenticWallet(raw);
const auth = await toSignedAuthorization(decodeHeader<PaymentPayload>(signed.headerValue));

console.log("method detected :", auth.method);
console.log("from            :", auth.from);
console.log("to              :", auth.to);
console.log("value           :", formatUnits(auth.value, token.decimals), "USD1");
console.log("validBefore     :", auth.validBefore.toString(), " now:", Math.floor(Date.now() / 1000));
console.log("payer balance   :", formatUnits(await balanceOf(auth.from), token.decimals), "USD1");
console.log("nonce used?     :", await publicClient.readContract({
  address: token.address, abi: tokenAbi, functionName: "authorizationState", args: [auth.from, auth.nonce],
}));

const fn = auth.method === "receive" ? "receiveWithAuthorization" : "transferWithAuthorization";
try {
  await publicClient.simulateContract({
    address: token.address, abi: tokenAbi, functionName: fn,
    args: [auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, auth.v, auth.r, auth.s],
    account: seller,
  });
  console.log("\nSIMULATION PASSED for", fn);
} catch (e) {
  console.log("\nFULL ERROR for " + fn + ":\n" + (e as Error).message.split("\n").slice(0, 6).join("\n"));
}
