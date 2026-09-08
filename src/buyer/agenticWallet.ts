import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";

const run = promisify(execFile);

export interface AgenticSignature {
  headerName: string;
  headerValue: string;
  wallet: string;
  expiresAt: number;
}

interface PreviewOption {
  index: number;
  status: "READY_TO_SIGN" | "ACTION_REQUIRED" | "NOT_SIGNABLE";
  reasons: string[];
  tokenSymbol?: string;
  amount?: string;
  currentBalance?: string;
  userWalletAddress?: string;
  assetTransferMethod?: string;
}

/**
 * Resolve baw's actual entrypoint once.
 *
 * The `baw` shim is a .cmd on Windows, which Node will only run via a shell -
 * and a shell concatenates arguments without escaping, which destroys the 402
 * JSON we pass in. Running dist/index.js under node keeps argv intact.
 */
let entry: string | null | undefined;
const resolveEntry = async (): Promise<string | null> => {
  if (entry !== undefined) return entry;
  if (process.env.BAW_ENTRY) return (entry = process.env.BAW_ENTRY);
  try {
    const { stdout } = await run("npm", ["root", "-g"], { shell: process.platform === "win32" });
    const candidate = join(stdout.trim(), "@binance", "agentic-wallet", "dist", "index.js");
    entry = existsSync(candidate) ? candidate : null;
  } catch {
    entry = null;
  }
  return entry;
};

/** `baw` is a CLI, so every call is a subprocess. */
const baw = async (args: string[]): Promise<any> => {
  const resolved = await resolveEntry();
  const [cmd, argv] = resolved
    ? [process.execPath, [resolved, ...args]]
    : ["baw", args]; // last resort; arguments containing spaces may not survive
  const { stdout } = await run(cmd, argv, {
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    shell: resolved ? false : process.platform === "win32",
  });
  const parsed = JSON.parse(stdout);
  if (!parsed.success) throw new Error(`baw ${args[0]} ${args[1]}: ${JSON.stringify(parsed)}`);
  return parsed.data;
};

export async function isConnected(): Promise<boolean> {
  try {
    return (await baw(["wallet", "status", "--json"])).status === "CONNECTED";
  } catch {
    return false;
  }
}

/**
 * Signs an x402 payment with the Binance Agentic Wallet.
 *
 * Till never sees a private key on this path - the wallet holds it, previews
 * what would be signed, and returns only the replay header. The mandate has
 * already run by the time we get here: the owner's budget decides whether to
 * ask for a signature, and the wallet decides whether it can produce one.
 * Two independent refusals, neither able to override the other.
 */
export async function signWithAgenticWallet(paymentRequirements: string): Promise<AgenticSignature> {
  const preview = await baw([
    "x402-payment",
    "preview",
    "--paymentRequirements",
    paymentRequirements,
    "--json",
  ]);

  const options: PreviewOption[] = preview.options ?? [];
  const ready = options.find((o) => o.status === "READY_TO_SIGN");
  if (!ready) {
    const why = options
      .map((o) => `${o.status}${o.reasons?.length ? ` (${o.reasons.join(", ")})` : ""}`)
      .join("; ");
    throw new Error(`agentic wallet will not sign: ${why || "no options returned"}`);
  }

  const signed = await baw([
    "x402-payment",
    "sign",
    "--paymentId",
    preview.paymentId,
    "--selectedIndex",
    String(ready.index),
    "--json",
  ]);

  return {
    headerName: signed.paymentHeaderName,
    headerValue: signed.paymentHeaderValue,
    wallet: ready.userWalletAddress ?? "",
    expiresAt: signed.signatureExpiresAt,
  };
}
