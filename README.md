# ⚡ YIELD-BOX: AUTONOMOUS CASHFLOW VAULT FOR PAYBOX AGENTS

### An Endowment Budget Governor for AI Agents
**Built for the MoonPay Hackathons (Chapter 1) · Portal: [developer.paybox.sh](https://developer.paybox.sh)**

---

## 1. THE PROBLEM & THE ENDOWMENT MODEL

Every autonomous agent funded with a flat wallet balance suffers from the **Depleting Wallet Trap**:
* A developer deposits $200–$500 USDC into an agent's operational wallet.
* The agent enters an unconstrained recursive loop, hits rate-limit retries, or queries expensive x402 endpoints.
* Within days, the balance drops to $0.00. **The agent runs out of funds and halts.**

Funding an autonomous agent with an unrestricted consumable balance creates runaway financial risk.

**YieldBox applies the University Endowment Model to agent spending:**
Institutions like Harvard and Yale never spend their core capital; they lock principal and operate exclusively off accrued yield. 

YieldBox brings this budgetary discipline to PayBox:
1. **Principal Protection:** The creator designates a principal balance ($1,000 USDC). The plugin acts as a budget governor, ensuring the agent only requests spends from accrued yield.
2. **Yield-Calibrated Work Allowance:** The vault deterministically computes a streaming work allowance calibrated to **5.10% APY** (based on the Short-Term US Treasuries / Ondo USDY benchmark rate: `principal × 5.10% × elapsed_time / 365 days`). This provides a predictable operational allowance settled in native Base USDC without cross-chain oracle delay.
3. **The Yield-Only Work Envelope:** The agent is restricted to spending accrued yield to pay for x402 HTTP micro-services and inference queries.
4. **Idle State on Depletion:** If accrued yield reaches zero, the agent transitions to an idle state until new yield accrues, preventing runaway balance exhaustion.

---

## 2. THE THREE REPRODUCIBLE ANCHORS

### 1. REPRODUCIBLE CASHFLOW MATH & SETTLEMENT RAIL
* **Settlement Token on Base:** Native Base USDC ([`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`](https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)).
* **Yield Benchmark:** 5.10% APY (calibrated to Ondo USDY / US Short-Term Treasuries benchmark).
* **Deterministic Cashflow Math:**
  * Principal Base: $1,000.00 USDC (`1,000,000,000` atomic units, 6 decimals).
  * Annual Allowance: $51.00 USDC.
  * Daily Work Budget: $0.1397 USDC (`139,726` atomic units/day).
  * Accrual Velocity: ~1.617 atomic units per second.
  * Agent Purchasing Power: Finances ~280 x402 micro-queries per day at $0.0005/request.

### 2. CANONICAL PAYBOX x402 PROPOSAL SPECIFICATION
* **Protocol Standard:** Conforms strictly to PayBox Hosted Plugin Protocol `2026-07-28`.
* **Unsigned Proposal Output:** Emits the canonical `io.paybox/transactionProposal` schema:
  ```json
  {
    "io.paybox/transactionProposal": {
      "version": "1",
      "expiresAt": "2026-10-17T21:32:02Z",
      "kind": "x402",
      "chain": "eip155:8453",
      "request": {
        "url": "https://api.deepseek.com/v1/chat/completions",
        "method": "GET"
      },
      "payment": {
        "asset": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        "maxAmount": "50000"
      }
    }
  }
  ```
* **Tested Conformance:** Validated via `scripts/test.mjs` double-build hash verification and MCP JSON-RPC conformance suite (`status: "passed"`).

### 3. SYNCHRONOUS OVERSPEND REFUSAL
* **Invariant:** `RequestedSpendAtomic <= AvailableHarvestedYieldAtomic`.
* **Synchronous Code Execution:** When an agent with $5.00 available yield requests a $10.00 payment, the check halts synchronously in code before any proposal is constructed:
  ```text
  REJECT_GATE_1: YIELD_BUDGET_EXCEEDED (Requested 10000000 exceeds available yield 5000000. Principal 1000000000 is strictly locked).
  ```

---

## 3. THE 5-GATE FLIGHT ENVELOPE

Before any x402 proposal is generated, the request must clear 5 deterministic checks:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AGENT INTENT INGRESS                            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ GATE 0: ANTI-REPLAY & IDEMPOTENCY BUFFER                               │
│ • SHA-256 intent hash tracking with 60s sliding window.                │
│ • Blocks rapid duplicate agent retries and repeat micro-charges.       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ [Pass]
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ GATE 1: THE PRINCIPAL IRON WALL & SPEND CEILING                        │
│ • Asserts: RequestedAmount <= AvailableHarvestedYield.                 │
│ • Asserts: RequestedAmount <= MaxSingleOpCap ($50 USDC).               │
│ • Protects the designated principal allocation.                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ [Pass]
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ GATE 2: ORACLE FRESHNESS ENVELOPE                                      │
│ • For dynamic quotes/fiat conversions: (Now - OracleTimestamp) <= 3s. │
│ • Rejects stale caller-provided pricing feeds before proposal creation.│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ [Pass]
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ GATE 3: SLIPPAGE & LIQUIDITY DEPTH BOUNDARY                            │
│ • For dynamic routing/swaps: Asserts CallerExpectedSlippage <= 100 bps │
│ • Rejects quotes exceeding the 1.0% policy slippage cap.               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ [Pass]
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ GATE 4: STRICT RAIL & ENDPOINT WHITELIST                               │
│ • Asserts destination matches verified origin/subpath or token address.│
│ • Blocks unapproved domains, prefix spoofing, and address extensions.  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ [All 5 Gates Cleared]
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ CANONICAL PAYBOX TRANSACTION PROPOSAL ASSEMBLED                        │
│ • Yield deducted from ledger only AFTER proposal construction.         │
│ • Emits `io.paybox/transactionProposal` ready for PayBox validation.   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. MCP TOOLS EXPOSED TO THE AGENT

YieldBox exposes 3 standard Model Context Protocol (MCP) tools over stdio:

| Tool Name | Type | Description |
| :--- | :--- | :--- |
| `yieldbox_status` | Read-only | Returns the cashflow gauge, principal allocation, available yield, and agent operational state. |
| `yieldbox_harvest` | State-updating | Credits accrued streaming yield into the agent's spendable work envelope. |
| `yieldbox_spend_x402` | Proposal | Verifies the 5-gate flight envelope before generating an unsigned PayBox x402 payment proposal (`proposeX402`). |

---

## 5. REPRODUCIBLE VERIFICATION & TESTS

All logic is verified via runnable Node 24 scripts:

### 1. Run the 15-Assertion Adversarial & Live Base On-Chain Suite:
```bash
npm run test:gates
```
Output:
```text
[TEST 1] Asserting Principal Iron Wall: Attempting to spend $10 when yield is $5...
✔ PASSED: Overspend blocked synchronously (<1ms in-memory). Principal untouched.

[TEST 15] Live Base Mainnet RPC Verification: Querying https://mainnet.base.org...
✔ PASSED: Connected to Base Mainnet (Block #52743415). Verified Base USDC on-chain (Decimals: 6).

================================================================================
   ALL 15 ADVERSARIAL & LIVE ON-CHAIN ASSERTIONS PASSED WITH ZERO FLUFF.        
================================================================================
```

### 2. Run the Full PayBox Conformance & Double-Build Determinism Suite:
```bash
npm test
```
Output:
```text
{"reportVersion":1,"starterVersion":"1.0.2","protocolVersion":"2026-07-28","status":"passed","sampleCall":{"tool":"yieldbox_status","status":"passed"},"discoveredToolCount":3}
```

---

## 6. CODEBASE SECURITY REVIEW & REFACTORING LOG

During development, the codebase underwent an adversarial code review covering edge cases, race conditions, and boundary bypasses:

### Patches Implemented:
1. **Gate 4 URL Prefix & Subdomain Hardening:** Replaced loose prefix matching with strict `new URL()` origin equality and normalized path checks, preventing subdomain spoofing (`api.deepseek.com.evil.com`) and address extensions.
2. **Gate 2 & 3 Input Validation:** Added strict numeric typeguards rejecting `NaN`, `undefined`, and infinite values for oracle timestamps and slippage.
3. **Gate 0 Replay Window Refactor:** Removed 5-second bucket salting from the intent digest to eliminate window boundary flap. Replays are now tracked using deterministic SHA-256 hashes with a 60-second sliding expiration and a 10,000-entry memory cap.
4. **Ledger Input Validation:** Added positive integer regex checks (`/^[1-9][0-9]*$/`) to `deductYield` and `harvest`, preventing negative amounts from decreasing spent totals.
5. **Transactional Atomicity:** Inverted proposal generation and ledger debiting. Unsigned proposals are assembled first; yield is deducted from the ledger only upon successful proposal creation.
6. **Decimal Formatting Safety:** Hardened `formatUnits` against 0-decimal precision and negative number representation.

---

## 7. PRODUCTION SUBMISSION ARTIFACT

The standalone compiled bundle is ready for hosted deployment:
```text
dist/plugin.mjs (395.4 KiB, Self-contained ESM for Node 24)
```
Upload `dist/plugin.mjs` directly in the [developer.paybox.sh](https://developer.paybox.sh) portal.
