import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { chain } from "../config.js";

export const bsc = defineChain({
  id: chain.id,
  name: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: [chain.rpcUrl] } },
});

export const publicClient = createPublicClient({ chain: bsc, transport: http(chain.rpcUrl) });

export const walletClient = createWalletClient({ chain: bsc, transport: http(chain.rpcUrl) });
