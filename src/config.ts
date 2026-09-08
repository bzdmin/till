import "dotenv/config";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { parseUnits, type Address, type Hex } from "viem";

/** Non-secret settings carry the values this project actually runs on, so a
 *  fresh clone can do anything read-only without writing a .env first. */
const opt = (k: string, fallback: string): string => (process.env[k] || fallback).trim();

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
  address: opt("TOKEN_ADDRESS", "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d") as Address,
  decimals: Number(opt("TOKEN_DECIMALS", "18")),
  /** EIP-712 domain fields. Verified against the on-chain DOMAIN_SEPARATOR at boot. */
  name: opt("TOKEN_EIP712_NAME", "World Liberty Financial USD"),
  version: opt("TOKEN_EIP712_VERSION", "1"),
};

export const chain = {
  id: Number(opt("CHAIN_ID", "56")),
  rpcUrl: opt("RPC_URL", "https://bsc-dataseed.binance.org"),
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

/**
 * Agent B. Broadcasts the settlement and pays the gas.
 *
 * Absent on a read-only deployment and on a fresh clone, so this fails at the
 * point of use rather than at import. Discovery and verification touch no
 * wallet, and someone trying the repo should not need a key to run them.
 */
export const seller: PrivateKeyAccount = process.env.SELLER_PRIVATE_KEY
  ? privateKeyToAccount(asKey("SELLER_PRIVATE_KEY"))
  : new Proxy({} as PrivateKeyAccount, {
      get() {
        throw new Error("SELLER_PRIVATE_KEY is not set: this process cannot sell or settle");
      },
    });

export const usd1 = (amount: string) => parseUnits(amount, token.decimals);

export const prices = {
  skill: opt("SKILL_PRICE", "0.10"),
  deepDive: opt("DEEP_DIVE_PRICE", "5.00"),
  dailyCap: opt("MANDATE_DAILY_CAP", "1.00"),
};


/** SIGNER=agentic routes signing through the Binance Agentic Wallet CLI. */
export const useAgenticWallet = (process.env.SIGNER ?? "local").toLowerCase() === "agentic";
