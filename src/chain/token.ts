import { encodeAbiParameters, keccak256, toHex, type Address } from "viem";
import { publicClient } from "./client.js";
import { chain, token } from "../config.js";

export const tokenAbi = [
  {
    type: "function",
    name: "receiveWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  { type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const DOMAIN_TYPEHASH = keccak256(
  toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);

/** Rebuild the domain separator from our config, exactly as the token does. */
export const localDomainSeparator = () =>
  keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [
        DOMAIN_TYPEHASH,
        keccak256(toHex(token.name)),
        keccak256(toHex(token.version)),
        BigInt(chain.id),
        token.address,
      ],
    ),
  );

/**
 * The boot guard.
 *
 * Comparing name/version as strings is not enough - a token can expose a
 * version() that means something else entirely (USD1 returns 2; its EIP-712
 * domain version is "1"). Reconstructing the separator checks name, version,
 * chainId and address in a single equality, and cannot be fooled that way.
 * A mismatch means every signature we produce would revert, so we refuse.
 */
export async function assertDomainMatches(): Promise<void> {
  const onchain = await publicClient.readContract({
    address: token.address,
    abi: tokenAbi,
    functionName: "DOMAIN_SEPARATOR",
  });
  const local = localDomainSeparator();
  if (onchain.toLowerCase() !== local.toLowerCase()) {
    throw new Error(
      `EIP-712 domain mismatch - refusing to sign.\n` +
        `  on-chain ${onchain}\n  local    ${local}\n` +
        `  check TOKEN_EIP712_NAME / TOKEN_EIP712_VERSION / CHAIN_ID / TOKEN_ADDRESS`,
    );
  }
}

export const balanceOf = (address: Address) =>
  publicClient.readContract({ address: token.address, abi: tokenAbi, functionName: "balanceOf", args: [address] });
