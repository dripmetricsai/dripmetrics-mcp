/**
 * DripMetrics MCP buyer demo — buys one VPIN reading for $0.05 (USDC on Base).
 *
 * Setup (any empty directory):
 *   npm init -y && npm pkg set type=module
 *   npm install @modelcontextprotocol/sdk agents @x402/core @x402/evm viem tsx
 *   WALLET_KEY=0x... npx tsx buy-vpin.ts
 *
 * WALLET_KEY is a Base mainnet private key holding at least $0.05 of USDC.
 * The key never leaves this process: it signs an EIP-3009 USDC transfer
 * authorization locally, and only the signed payload goes over the wire.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { withX402Client } from "agents/x402";
import { privateKeyToAccount } from "viem/accounts";

const MCP_URL = "https://mcp.dripmetrics.ai/mcp";
const METRIC = { id: "metrics/vpin", params: { pair: "BTC-USD", window: "1h" } };

function firstText(result: { content?: unknown }): unknown {
  const content = result.content as Array<{ type: string; text?: string }> | undefined;
  const text = content?.find((c) => c.type === "text")?.text;
  return text ? JSON.parse(text) : undefined;
}

async function main() {
  const key = process.env.WALLET_KEY;
  if (!key) {
    throw new Error("Set WALLET_KEY to a Base wallet private key (0x...) holding a little USDC.");
  }

  const client = new Client({ name: "dripmetrics-buyer-demo", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)));

  // 1. Discovery is free.
  const listing = await client.callTool({
    name: "list_metrics",
    arguments: { family: "Exchange metrics" },
  });
  const catalog = firstText(listing) as { count: number };
  console.log(`Catalog: ${catalog.count} exchange metrics available.`);

  // 2. Quote is free too — the exact challenge the API will issue, no payment made.
  const quote = await client.callTool({
    name: "get_payment_requirements",
    arguments: METRIC,
  });
  const requirements = firstText(quote) as {
    accepts?: Array<{ amount: string; network: string; payTo: string }>;
  };
  const offer = requirements.accepts?.[0];
  if (offer) {
    console.log(
      `Quote for ${METRIC.id}: ${Number(offer.amount) / 1e6} USDC on ${offer.network} to ${offer.payTo}`,
    );
  }

  // 3. The paid fetch. withX402Client detects the 402 in _meta["x402/error"],
  //    signs it with the local key, and retries with _meta["x402/payment"].
  const paying = withX402Client(client, {
    account: privateKeyToAccount(key as `0x${string}`),
    network: "eip155:8453", // Base mainnet
  });

  const result = await paying.callTool(
    async (accepts) => {
      console.log(`Approving payment of ${Number(accepts[0]?.amount ?? 0) / 1e6} USDC...`);
      return true;
    },
    { name: "get_metric", arguments: METRIC },
  );

  if (result.isError) {
    console.error("Paid call failed:", JSON.stringify(firstText(result), null, 2));
    process.exitCode = 1;
    return;
  }

  const reading = firstText(result) as { value?: number; computedAt?: string };
  const receipt = result._meta?.["x402/payment-response"] as
    | { transaction?: string; network?: string }
    | undefined;

  console.log(`VPIN (${METRIC.params.pair}, ${METRIC.params.window}): ${reading.value}`);
  console.log(`Computed at: ${reading.computedAt}`);
  if (receipt?.transaction) {
    console.log(`Paid: https://basescan.org/tx/${receipt.transaction}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .then(() => process.exit());
