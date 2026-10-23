# DripMetrics MCP Server

Pay-per-call crypto market data for agents, over [MCP](https://modelcontextprotocol.io):

```text
https://mcp.dripmetrics.ai/mcp   (Streamable HTTP)
```

Metrics cover exchange microstructure (VPIN, Kyle's lambda, roll spread,
order-flow imbalance), BTC options (GEX, expected move, variance risk
premium), Hyperliquid, Polymarket, on-chain activity, portfolio risk, and
an AI-written BTC market summary.

**No API key. No signup.** Discovery is free; paid calls cost $0.05 per
metric ($0.25 for the AI market summary) via [x402](https://www.x402.org/),
paid in **USDC on Base** or **USDG on Robinhood Chain**. Every challenge
offers both at the same price; your client picks the network it holds funds on. The same catalog is available as a plain
HTTP API at [api.dripmetrics.ai](https://api.dripmetrics.ai)
([OpenAPI](https://api.dripmetrics.ai/openapi.json)).

## Tools

| Tool | Cost | Description |
| --- | --- | --- |
| `list_metrics` | Free | Every metric with id, family, method, USD price, summary. |
| `describe_metric` | Free | Parameters, request/response schemas, price for one metric. |
| `get_payment_requirements` | Free | Dry-runs a request and returns the exact x402 challenge (amount, asset, network, payTo). |
| `get_metric` | Paid (x402) | Fetches any GET metric by id with query params. |
| `compute_portfolio_var` | Paid (x402) | POST wrapper for portfolio value-at-risk. |
| `compute_spread_greeks` | Paid (x402) | POST wrapper for options spread greeks. |

## How payment works

The MCP server holds **no wallet keys** and performs **no settlement**. Paid
tools pass the API's own x402 flow through, using the MCP + x402 convention
shared by Cloudflare's agents SDK (`withX402Client`) and Vercel's `x402-mcp`:

1. An unpaid call returns `isError: true` with the decoded 402 challenge in
   `_meta["x402/error"]` (`{ x402Version, accepts, resource, ... }`).
2. The client's x402 wallet signs it and retries the tool call with
   `_meta["x402/payment"]` set to the base64 payment payload.
3. The MCP server forwards that token verbatim as the `PAYMENT-SIGNATURE`
   header; the API verifies and settles via the CDP facilitator exactly as
   for any direct HTTP caller. Settlement receipts come back in
   `_meta["x402/payment-response"]`.

Because the challenge is relayed from the live API, quoted prices can never
drift from what the API actually charges, and validation still fails before
payment.

## Connect from Claude Code

```bash
claude mcp add --transport http dripmetrics https://mcp.dripmetrics.ai/mcp
```

## Connect from Claude Desktop (or any stdio-only client)

```json
{
  "mcpServers": {
    "dripmetrics": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.dripmetrics.ai/mcp"]
    }
  }
}
```

Claude Desktop can also add it directly as a custom connector with URL
`https://mcp.dripmetrics.ai/mcp`. Discovery tools work immediately; paid
tools return the exact payment requirements instead of a result until the
client can sign x402 payments.

## Connect from a paying agent

Any x402-capable MCP client works. With the Cloudflare agents SDK:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { withX402Client } from "agents/x402";
import { privateKeyToAccount } from "viem/accounts";

const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL("https://mcp.dripmetrics.ai/mcp")),
);

const paying = withX402Client(client, {
  account: privateKeyToAccount(process.env.WALLET_KEY as `0x${string}`),
  network: "eip155:8453", // Base USDC
});

const result = await paying.callTool(null, {
  name: "get_metric",
  arguments: { id: "metrics/vpin", params: { pair: "BTC-USD", window: "1h" } },
});
```

The wallet key stays in the agent process; it is never sent to DripMetrics.

`withX402Client` currently pays with Base USDC only: it does not expose x402
spend controls, and current x402 clients only auto-allow default stablecoins.
To pay with USDG on Robinhood Chain, allow-list it with
`spendControls.allowedAssets` on a plain `x402Client`;
`examples/buy-vpin.ts` does this with `PAY_NETWORK=eip155:4663`.

A complete runnable version — free discovery, free quote, then one paid
VPIN fetch — is in [`examples/buy-vpin.ts`](examples/buy-vpin.ts):

```bash
npm init -y && npm pkg set type=module
npm install @modelcontextprotocol/sdk @x402/core @x402/evm viem tsx
WALLET_KEY=0x... npx tsx examples/buy-vpin.ts
# or pay with USDG on Robinhood Chain:
WALLET_KEY=0x... PAY_NETWORK=eip155:4663 npx tsx examples/buy-vpin.ts
```

## Links

- Website: [dripmetrics.ai](https://dripmetrics.ai)
- HTTP API: [api.dripmetrics.ai](https://api.dripmetrics.ai)
- MCP Registry: `ai.dripmetrics/mcp` ([server.json](server.json))

## License

MIT — covers this documentation and the example client. The DripMetrics
API and MCP server themselves are a hosted service.
