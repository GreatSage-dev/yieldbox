import { createHash } from "node:crypto";

export interface GatePolicy {
  maxSlippageBps: number;       // default: 100 (1.0%)
  maxOracleLagMs: number;       // default: 3000ms
  maxSpendAtomic: bigint;       // ceiling per-op spend
  whitelistedDestinations: Set<string>;
  antiReplayWindowMs?: number;  // default: 60_000ms
}

export interface GateCheckInput {
  intentId: string;
  destination: string;
  amountAtomic: string;
  availableYieldAtomic: string;
  oracleTimestampMs: number;
  expectedSlippageBps?: number;
}

export interface GateReceipt {
  passed: boolean;
  gatePassed: number;
  reason?: string;
  intentHash: string;
  timestamp: string;
}

// In-memory ring buffer for Gate 0 anti-replay / velocity tracking
const seenIntents = new Map<string, number>();
const DEFAULT_REPLAY_WINDOW_MS = 60_000;

export class DeterministicRiskGate {
  private policy: GatePolicy & { antiReplayWindowMs: number };

  constructor(policy?: Partial<GatePolicy>) {
    this.policy = {
      maxSlippageBps: policy?.maxSlippageBps ?? 100,
      maxOracleLagMs: policy?.maxOracleLagMs ?? 3000,
      maxSpendAtomic: policy?.maxSpendAtomic ?? 50_000_000n, // $50 USDC default max single op
      whitelistedDestinations: policy?.whitelistedDestinations ?? new Set([
        "https://api.deepseek.com/v1/chat/completions",
        "https://api.perplexity.ai/chat/completions",
        "https://api.paybox.sh/x402/bazaar",
        "https://api.anthropic.com/v1/messages",
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // Base USDC
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Solana USDC
      ]),
      antiReplayWindowMs: policy?.antiReplayWindowMs ?? DEFAULT_REPLAY_WINDOW_MS,
    };
  }

  public verify(input: GateCheckInput): GateReceipt {
    const now = Date.now();

    // Input shape validation: prevent null/undefined dereference
    if (!input || typeof input !== "object") {
      return {
        passed: false,
        gatePassed: 0,
        reason: "REJECT_GATE_0: INVALID_INPUT_SHAPE",
        intentHash: "",
        timestamp: new Date().toISOString(),
      };
    }

    if (typeof input.intentId !== "string" || input.intentId.trim().length === 0) {
      return {
        passed: false,
        gatePassed: 0,
        reason: "REJECT_GATE_0: INVALID_INTENT_ID",
        intentHash: "",
        timestamp: new Date().toISOString(),
      };
    }

    if (typeof input.destination !== "string" || input.destination.trim().length === 0) {
      return {
        passed: false,
        gatePassed: 0,
        reason: "REJECT_GATE_0: INVALID_DESTINATION",
        intentHash: "",
        timestamp: new Date().toISOString(),
      };
    }

    // Validate atomic amounts: strictly non-negative integer digits
    const numericRegex = /^(0|[1-9][0-9]*)$/;
    if (typeof input.amountAtomic !== "string" || !numericRegex.test(input.amountAtomic)) {
      return {
        passed: false,
        gatePassed: 0,
        reason: "REJECT_GATE_0: INVALID_AMOUNT_FORMAT (Must be non-negative integer string)",
        intentHash: "",
        timestamp: new Date().toISOString(),
      };
    }

    if (typeof input.availableYieldAtomic !== "string" || !numericRegex.test(input.availableYieldAtomic)) {
      return {
        passed: false,
        gatePassed: 0,
        reason: "REJECT_GATE_0: INVALID_AVAILABLE_YIELD_FORMAT (Must be non-negative integer string)",
        intentHash: "",
        timestamp: new Date().toISOString(),
      };
    }

    const intentHash = createHash("sha256")
      .update(`${input.intentId}:${input.destination}:${input.amountAtomic}`)
      .digest("hex");

    // Gate 0: Anti-Replay & Idempotency Check (Solves the PayBox double-charge flaw)
    this.cleanExpiredIntents(now);
    if (seenIntents.has(intentHash)) {
      return {
        passed: false,
        gatePassed: 0,
        reason: "REJECT_GATE_0: DUPLICATE_INTENT_BLOCKED (Anti-replay window active)",
        intentHash,
        timestamp: new Date().toISOString(),
      };
    }

    // Parse atomic amounts safely using BigInt (Zero floating point math)
    const amount = BigInt(input.amountAtomic);
    const availableYield = BigInt(input.availableYieldAtomic);

    if (amount <= 0n) {
      return {
        passed: false,
        gatePassed: 0,
        reason: "REJECT_GATE_0: INVALID_NON_POSITIVE_AMOUNT",
        intentHash,
        timestamp: new Date().toISOString(),
      };
    }

    // Gate 1: Yield-Budget Boundary (The Principal Iron Wall)
    if (amount > availableYield) {
      return {
        passed: false,
        gatePassed: 1,
        reason: `REJECT_GATE_1: YIELD_BUDGET_EXCEEDED (Requested ${amount} exceeds available yield ${availableYield}. Principal is cold and untouchable)`,
        intentHash,
        timestamp: new Date().toISOString(),
      };
    }

    if (amount > this.policy.maxSpendAtomic) {
      return {
        passed: false,
        gatePassed: 1,
        reason: `REJECT_GATE_1: SINGLE_OP_CAP_EXCEEDED (Requested ${amount} > ceiling ${this.policy.maxSpendAtomic})`,
        intentHash,
        timestamp: new Date().toISOString(),
      };
    }

    // Gate 2: Oracle Freshness (Pyth / MoonX timestamp latency)
    if (
      typeof input.oracleTimestampMs !== "number" ||
      !Number.isFinite(input.oracleTimestampMs) ||
      Number.isNaN(input.oracleTimestampMs) ||
      input.oracleTimestampMs <= 0
    ) {
      return {
        passed: false,
        gatePassed: 2,
        reason: "REJECT_GATE_2: INVALID_ORACLE_TIMESTAMP (Timestamp must be a positive finite number)",
        intentHash,
        timestamp: new Date().toISOString(),
      };
    }

    const oracleLag = now - input.oracleTimestampMs;
    if (oracleLag > this.policy.maxOracleLagMs || oracleLag < -5000) {
      return {
        passed: false,
        gatePassed: 2,
        reason: `REJECT_GATE_2: ORACLE_STALE (Oracle lag ${oracleLag}ms exceeds max allowed ${this.policy.maxOracleLagMs}ms)`,
        intentHash,
        timestamp: new Date().toISOString(),
      };
    }

    // Gate 3: Slippage & Market Depth
    const slippage = input.expectedSlippageBps ?? 0;
    if (
      typeof slippage !== "number" ||
      !Number.isFinite(slippage) ||
      Number.isNaN(slippage) ||
      slippage < 0
    ) {
      return {
        passed: false,
        gatePassed: 3,
        reason: "REJECT_GATE_3: INVALID_SLIPPAGE (Expected slippage must be a non-negative finite number)",
        intentHash,
        timestamp: new Date().toISOString(),
      };
    }

    if (slippage > this.policy.maxSlippageBps) {
      return {
        passed: false,
        gatePassed: 3,
        reason: `REJECT_GATE_3: SLIPPAGE_EXCEEDED (Expected ${slippage} bps exceeds max limit ${this.policy.maxSlippageBps} bps)`,
        intentHash,
        timestamp: new Date().toISOString(),
      };
    }

    // Gate 4: Target Destination Whitelist
    const isWhitelisted = this.checkDestinationWhitelisted(input.destination);
    if (!isWhitelisted) {
      return {
        passed: false,
        gatePassed: 4,
        reason: `REJECT_GATE_4: UNTRUSTED_DESTINATION (Target ${input.destination} is not in verified rail whitelist)`,
        intentHash,
        timestamp: new Date().toISOString(),
      };
    }

    // Mark intent as executed/in-flight inside replay window
    seenIntents.set(intentHash, now);

    return {
      passed: true,
      gatePassed: 4,
      intentHash,
      timestamp: new Date().toISOString(),
    };
  }

  private checkDestinationWhitelisted(destination: string): boolean {
    if (this.policy.whitelistedDestinations.has(destination)) {
      return true;
    }

    let destUrl: URL | null = null;
    try {
      destUrl = new URL(destination);
    } catch {
      // Non-URL destination (e.g. EVM or Solana address)
    }

    if (destUrl) {
      // Disallow userinfo/credentials in destination URLs
      if (destUrl.username || destUrl.password) {
        return false;
      }

      for (const prefix of this.policy.whitelistedDestinations) {
        try {
          const prefixUrl = new URL(prefix);
          // Strict origin matching (protocol, hostname, port must match exactly)
          if (destUrl.origin !== prefixUrl.origin) {
            continue;
          }
          // Pathname must either match exactly or be an explicit subpath segment
          const prefixPath = prefixUrl.pathname;
          const destPath = destUrl.pathname;
          if (destPath === prefixPath) {
            return true;
          }
          const normalizedPrefix = prefixPath.endsWith("/") ? prefixPath : `${prefixPath}/`;
          if (destPath.startsWith(normalizedPrefix)) {
            return true;
          }
        } catch {
          // Whitelist item is not a URL, continue checking
        }
      }
      return false;
    }

    // Non-URL addresses: require strict exact match (case-insensitive for hex addresses)
    const lowerDest = destination.toLowerCase();
    for (const allowed of this.policy.whitelistedDestinations) {
      if (allowed.toLowerCase() === lowerDest) {
        return true;
      }
    }

    return false;
  }

  private cleanExpiredIntents(now: number) {
    const windowMs = this.policy.antiReplayWindowMs;
    for (const [hash, ts] of seenIntents.entries()) {
      if (now - ts > windowMs) {
        seenIntents.delete(hash);
      }
    }
    // Safety cap to prevent memory exhaustion
    if (seenIntents.size > 10_000) {
      const excess = seenIntents.size - 10_000;
      let count = 0;
      for (const key of seenIntents.keys()) {
        seenIntents.delete(key);
        count++;
        if (count >= excess) break;
      }
    }
  }

  public resetSeenIntents(): void {
    seenIntents.clear();
  }
}
