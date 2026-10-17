import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { proposeX402, x402OutputSchema, atomicAmount } from "./paybox.js";
import { DeterministicRiskGate } from "./gates.js";
import { globalVault } from "./vault.js";

const PROTOCOL_VERSION = "2026-07-28";
const gate = new DeterministicRiskGate();

function createServer() {
  const server = new McpServer(
    { name: "yield-box", version: "1.0.0" },
    { supportedProtocolVersions: [PROTOCOL_VERSION] },
  );

  // Tool 1: yieldbox_status
  server.registerTool(
    "yieldbox_status",
    {
      title: "YieldBox Living Status",
      description: "Inspect the autonomous cashflow vault, principal lock status, and available agent work budget.",
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({
        principalLockedUsd: z.string(),
        availableYieldUsd: z.string(),
        agentStatus: z.string(),
        livingGauge: z.string(),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const state = globalVault.getState();
      const available = globalVault.getAvailableYieldAtomic();
      const principalUsd = globalVault.formatUnits(BigInt(state.principalLockedAtomic));
      const availableUsd = globalVault.formatUnits(available);
      const gauge = globalVault.getLivingGauge();

      return {
        content: [{ type: "text", text: gauge }],
        structuredContent: {
          principalLockedUsd: principalUsd,
          availableYieldUsd: availableUsd,
          agentStatus: state.agentStatus,
          livingGauge: gauge,
        },
      };
    },
  );

  // Tool 2: yieldbox_harvest
  server.registerTool(
    "yieldbox_harvest",
    {
      title: "Harvest Accrued Yield",
      description: "Harvest streaming yield from tokenized T-Bills or staking into the agent's working cashflow envelope.",
      inputSchema: z.object({
        harvestAmountUsdc: z.string().describe("Amount of USDC yield to harvest into work envelope (e.g. '2.50')"),
      }).strict(),
      outputSchema: z.object({
        harvestedUsd: z.string(),
        newAvailableYieldUsd: z.string(),
        livingGauge: z.string(),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ harvestAmountUsdc }) => {
      const atomic = atomicAmount(harvestAmountUsdc, 6);
      const res = globalVault.harvest(atomic);
      const gauge = globalVault.getLivingGauge();

      return {
        content: [{ type: "text", text: `[YIELD HARVESTED] Successfully credited $${harvestAmountUsdc} USDC to agent work envelope.\n\n${gauge}` }],
        structuredContent: {
          harvestedUsd: harvestAmountUsdc,
          newAvailableYieldUsd: globalVault.formatUnits(BigInt(res.totalAvailable)),
          livingGauge: gauge,
        },
      };
    },
  );

  // Tool 3: yieldbox_spend_x402
  server.registerTool(
    "yieldbox_spend_x402",
    {
      title: "Propose Paid x402 Service (Deterministic Flight Envelope)",
      description: "Intercepts and gates agent x402 payment requests. Verifies the 4-gate silicon boundary before emitting an unsigned proposal for PayBox MPC.",
      inputSchema: z.object({
        url: z.url().max(2048).describe("The paid x402 HTTPS endpoint"),
        amountUsdc: z.string().describe("Amount of USDC to pay (e.g. '0.05')"),
        chain: z.enum(["eip155:8453", "solana:mainnet"]).default("eip155:8453"),
      }).strict(),
      outputSchema: x402OutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ url, amountUsdc, chain }) => {
      const atomic = atomicAmount(amountUsdc, 6);
      const available = globalVault.getAvailableYieldAtomic().toString();

      // Deterministic Gate Check: 4 Hard Rules with Zero Model in Path
      const receipt = gate.verify({
        intentId: `x402-${url}`,
        destination: url,
        amountAtomic: atomic,
        availableYieldAtomic: available,
        oracleTimestampMs: Date.now(), // fresh live oracle
        expectedSlippageBps: 0,
      });

      if (!receipt.passed) {
        throw new Error(`DETERMINISTIC_GATE_HALT: ${receipt.reason}`);
      }

      // Construct PayBox proposal FIRST to validate schema/limits before deducting ledger
      const proposal = proposeX402({
        chain,
        url,
        maxAmount: atomic,
      });

      // Deduct from yield ledger only after proposal construction succeeds
      globalVault.deductYield(atomic);

      return proposal;
    },
  );

  return server;
}

serveStdio(createServer, { legacy: "reject" });
