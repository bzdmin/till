import { formatUnits, parseUnits, type Address } from "viem";
import { token } from "../config.js";

export interface MandateConfig {
  dailyCap: bigint;
  perCallMax: bigint;
  allowlist: Address[];
}

export interface MandateDecision {
  allowed: boolean;
  reason: string;
  spent: bigint;
  remaining: bigint;
}

/**
 * The owner's authorization layer, checked before the buyer will sign.
 *
 * Deliberately local arithmetic with no network call: this is the one beat of
 * the demo that cannot fail on stage. It is a guardrail, not a product -
 * money moves first, and then is refused.
 */
export class Mandate {
  private spent = 0n;

  constructor(private cfg: MandateConfig) {}

  get config() {
    return this.cfg;
  }

  get spentTotal() {
    return this.spent;
  }

  get remaining() {
    return this.cfg.dailyCap - this.spent;
  }

  private fmt = (v: bigint) => Number(formatUnits(v, token.decimals)).toFixed(2);

  check(payTo: Address, amount: bigint): MandateDecision {
    const base = { spent: this.spent, remaining: this.remaining };

    if (!this.cfg.allowlist.some((a) => a.toLowerCase() === payTo.toLowerCase())) {
      return { allowed: false, reason: `${payTo} is not on the allowlist`, ...base };
    }
    if (amount > this.cfg.perCallMax) {
      return {
        allowed: false,
        reason: `${this.fmt(amount)} exceeds the per-call maximum of ${this.fmt(this.cfg.perCallMax)} USD1`,
        ...base,
      };
    }
    if (amount > this.remaining) {
      return {
        allowed: false,
        reason: `${this.fmt(amount)} would exceed the daily cap - ${this.fmt(this.remaining)} USD1 remaining of ${this.fmt(this.cfg.dailyCap)}`,
        ...base,
      };
    }
    return { allowed: true, reason: `within cap - ${this.fmt(this.remaining)} USD1 remaining`, ...base };
  }

  /** Only called after settlement succeeds, so a failed rail never burns budget. */
  record(amount: bigint) {
    this.spent += amount;
  }
}

export const mandateFrom = (dailyCap: string, perCallMax: string, allowlist: Address[]) =>
  new Mandate({
    dailyCap: parseUnits(dailyCap, token.decimals),
    perCallMax: parseUnits(perCallMax, token.decimals),
    allowlist,
  });
