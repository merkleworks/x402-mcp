# Examples

Minimal examples for using the x402 MCP server from an AI agent or script.

**Prerequisites:** Run from the repo root after `npm install` and `npm run build`.

## discover-and-pay

Shows the typical flow: discover payable endpoints on a host, then call one with automatic payment.

```bash
# From repo root
npx tsx examples/discover-and-pay.ts https://your-x402-api.example.com
```

The script:

1. Connects to the local x402-mcp server (stdio).
2. Calls `discover_x402_api` with the given URL.
3. If any endpoints are found, calls `pay_x402_endpoint` for the first one (GET).
4. Prints discovery result and payment response.

Use this as a reference for integrating x402 into your own MCP client or agent.
