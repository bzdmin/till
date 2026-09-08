import { EventEmitter } from "node:events";

export type TapeRow =
  | { kind: "intent"; text: string }
  | { kind: "decision"; skill: string; reasoning: string; source: "claude" | "rules" }
  | { kind: "402"; price: string; asset: string; payTo: string; network: string }
  | { kind: "signer"; signer: "agentic" | "local"; label: string; wallet: string }
  | { kind: "mandate"; allowed: boolean; reason: string; spent: string; remaining: string }
  | { kind: "receipt"; adapter: string; txHash: string; explorer: string }
  | { kind: "deliverable"; call: string; reasons: string[]; signer: string }
  | { kind: "refused"; reason: string; remaining: string }
  | { kind: "settled_no_goods"; txHash: string; failures: string[] }
  | { kind: "balances"; a: string; b: string };

/**
 * The tape binds intent to 402 to receipt to deliverable. A display that only
 * shows balances is a toy - the point is that each row can be traced to the
 * one before it.
 */
export class Tape extends EventEmitter {
  readonly rows: (TapeRow & { at: number })[] = [];

  push(row: TapeRow) {
    const stamped = { ...row, at: Date.now() };
    this.rows.push(stamped);
    this.emit("row", stamped);
    return stamped;
  }
}

export const tape = new Tape();
