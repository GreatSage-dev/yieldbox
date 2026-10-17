export interface VaultState {
  assetSymbol: string;
  decimals: number;
  principalLockedAtomic: string;
  yieldAccruedAtomic: string;
  yieldSpentAtomic: string;
  lastHarvestTimestamp: string;
  agentStatus: "SELF_FUNDED_ACTIVE" | "IDLE_AWAITING_YIELD";
}

export class CashflowVault {
  private principalLocked: bigint;
  private yieldAccrued: bigint;
  private yieldSpent: bigint;
  private lastHarvest: Date;
  private assetSymbol: string;
  private decimals: number;

  constructor(initialPrincipal = "1000000000", assetSymbol = "USDC", decimals = 6) {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
      throw new Error("Vault decimals must be an integer between 0 and 255.");
    }
    if (!/^(0|[1-9][0-9]*)$/.test(initialPrincipal)) {
      throw new Error("Initial principal must be a non-negative integer string.");
    }
    // Default $1,000.00 USDC locked principal (6 decimals)
    this.principalLocked = BigInt(initialPrincipal);
    // Initial accrued yield bucket: $5.00 USDC (5_000_000 atomic)
    this.yieldAccrued = 5_000_000n;
    this.yieldSpent = 0n;
    this.lastHarvest = new Date();
    this.assetSymbol = assetSymbol;
    this.decimals = decimals;
  }

  public getAvailableYieldAtomic(): bigint {
    const available = this.yieldAccrued - this.yieldSpent;
    return available > 0n ? available : 0n;
  }

  public harvest(additionalYieldAtomic: string): { harvested: string; totalAvailable: string } {
    if (typeof additionalYieldAtomic !== "string" || !/^[1-9][0-9]*$/.test(additionalYieldAtomic)) {
      throw new Error("Harvest amount must be a positive integer string.");
    }
    const amount = BigInt(additionalYieldAtomic);
    if (amount <= 0n) throw new Error("Harvest amount must be greater than zero.");
    this.yieldAccrued += amount;
    this.lastHarvest = new Date();
    return {
      harvested: amount.toString(),
      totalAvailable: this.getAvailableYieldAtomic().toString(),
    };
  }

  public deductYield(spentAtomic: string): void {
    if (typeof spentAtomic !== "string" || !/^[1-9][0-9]*$/.test(spentAtomic)) {
      throw new Error("Deduct amount must be a positive integer string.");
    }
    const amount = BigInt(spentAtomic);
    if (amount <= 0n) {
      throw new Error("Deduct amount must be greater than zero.");
    }
    const available = this.getAvailableYieldAtomic();
    if (amount > available) {
      throw new Error(`CRITICAL_INVARIANT_VIOLATION: Attempted to spend ${amount} atomic yield, but only ${available} is available. Principal is locked.`);
    }
    this.yieldSpent += amount;
  }

  public formatUnits(atomic: bigint): string {
    const sign = atomic < 0n ? "-" : "";
    const abs = atomic < 0n ? -atomic : atomic;
    if (this.decimals === 0) return `${sign}${abs.toString()}`;
    const s = abs.toString().padStart(this.decimals + 1, "0");
    const intPart = s.slice(0, -this.decimals);
    const fracPart = s.slice(-this.decimals).replace(/0+$/, "");
    return fracPart ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
  }

  public getState(): VaultState {
    const available = this.getAvailableYieldAtomic();
    return {
      assetSymbol: this.assetSymbol,
      decimals: this.decimals,
      principalLockedAtomic: this.principalLocked.toString(),
      yieldAccruedAtomic: this.yieldAccrued.toString(),
      yieldSpentAtomic: this.yieldSpent.toString(),
      lastHarvestTimestamp: this.lastHarvest.toISOString(),
      agentStatus: available > 0n ? "SELF_FUNDED_ACTIVE" : "IDLE_AWAITING_YIELD",
    };
  }

  public getLivingGauge(): string {
    const state = this.getState();
    const available = this.getAvailableYieldAtomic();
    const principalDisplay = this.formatUnits(this.principalLocked);
    const availableDisplay = this.formatUnits(available);
    const spentDisplay = this.formatUnits(this.yieldSpent);

    return [
      "╔══════════════════════════════════════════════════════════════════════════════╗",
      "║                 YIELD-BOX: AUTONOMOUS CASHFLOW ENGINE                        ║",
      "╠══════════════════════════════════════════════════════════════════════════════╣",
      `║ 🔒 Locked Principal:   $${principalDisplay.padEnd(10)} ${state.assetSymbol} (Cold / Passkey Required)      ║`,
      `║ ⚡ Available Yield:    $${availableDisplay.padEnd(10)} ${state.assetSymbol} (Agent Working Budget)        ║`,
      `║ 💸 Total Work Spent:    $${spentDisplay.padEnd(10)} ${state.assetSymbol} (x402 APIs & Subscriptions) ║`,
      `║ 🟢 Agent State:        ${state.agentStatus.padEnd(20)} (0% Principal Risk)        ║`,
      "╚══════════════════════════════════════════════════════════════════════════════╝",
    ].join("\n");
  }
}

export const globalVault = new CashflowVault();
