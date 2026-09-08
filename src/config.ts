import "dotenv/config";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { parseUnits, type Address, type Hex } from "viem";

const req = (k: string): string => {
  const v = process.env[k];
  if (!v || !v.trim()) throw new Error(`missing ${k} in .env`);
  return v.trim();
};

const asKey = (k: string): Hex => {
  const v = req(k);
  const hex = (v.startsWith("0x") ? v : `0x${v}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`${k} is not a 32-byte private key`);
  return hex;
};

export const token = {
  address: req("TOKEN_ADDRESS") as Address,
  decimals: Number(req("TOKEN_DECIMALS")),
  /** EIP-712 domain fields. Verified against the on-chain DOMAIN_SEPARATOR at boot. */
  name: req("TOKEN_EIP712_NAME"),
  version: req("TOKEN_EIP712_VERSION"),
};

export const chain = {
  id: Number(req("CHAIN_ID")),
  rpcUrl: req("RPC_URL"),
};

/**
 * Agent A. Signs authorizations; never sends a transaction, so it holds no BNB.
 *
 * Only the buyer needs this key, so a seller-only deployment may omit it. The
 * proxy turns an absent key into a readable error at the point of use rather
 * than a crash at boot or a null dereference later.
 */
export const buyer: PrivateKeyAccount = process.env.BUYER_PRIVATE_KEY
  ? privateKeyToAccount(asKey("BUYER_PRIVATE_KEY"))
  : new Proxy({} as PrivateKeyAccount, {
      get() {
        throw new Error("BUYER_PRIVATE_KEY is not set: this process can sell, but not buy");
      },
    });

/** Agent B. Broadcasts receiveWithAuthorization and pays the gas. */
export const seller = privateKeyToAccount(asKey("SELLER_PRIVATE_KEY"));

export const usd1 = (amount: string) => parseUnits(amount, token.decimals);

export const prices = {
  skill: req("SKILL_PRICE"),
  deepDive: req("DEEP_DIVE_PRICE"),
  dailyCap: req("MANDATE_DAILY_CAP"),
};


/** SIGNER=agentic routes signing through the Binance Agentic Wallet CLI. */
export const useAgenticWallet = (process.env.SIGNER ?? "local").toLowerCase() === "agentic";
