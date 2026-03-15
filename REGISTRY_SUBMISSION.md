# MCP registry submission metadata (mcp.so)

Use this when submitting [x402-mcp](https://github.com/merkleworks/x402-mcp) to the MCP registry (e.g. [mcp.so](https://mcp.so)).

---

## Submission fields

| Field | Value |
|-------|--------|
| **Name** | x402 Payment-Gated HTTP |
| **Description** | Allows AI agents to call payment-gated HTTP APIs using the x402 protocol. Send a request; if the server returns 402 Payment Required, the server handles the challenge, payment, and retry with proof, then returns the API response. |
| **Category** | Infrastructure / Payments / APIs |
| **Repository** | https://github.com/merkleworks/x402-mcp |
| **Install command** | `npx @merkleworks/x402-mcp` (or `npx x402-mcp` if an unscoped package is published) |

## Tools exposed

| Tool | Description |
|------|-------------|
| **paid_http_request** | Execute HTTP requests to payment-gated APIs. If the server returns 402, runs the x402 flow (parse challenge → pay → retry with proof) and returns the final response. |

Additional tools: `discover_x402_api`, `pay_x402_endpoint`, `parse_x402_challenge`, `verify_x402_proof` (see [mcp.json](mcp.json)).

---

## One-line start

```bash
npx @merkleworks/x402-mcp
```

The server runs on stdio and is intended to be started by the AI client (Cursor, Claude, etc.) via MCP configuration; see [README.md](README.md#connecting-from-ai-clients).
