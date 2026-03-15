# x402-mcp

MCP server for the [x402 protocol](https://github.com/ruidasilva/merkleworks-x402-spec). Lets AI agents (Claude, Cursor, etc.) discover and call payment-gated HTTP APIs automatically.

**Repository:** [merkleworks/x402-mcp](https://github.com/merkleworks/x402-mcp)

---

## MCP Server

This repository provides a **Model Context Protocol (MCP)** server that enables AI agents to call payment-gated HTTP APIs using the x402 protocol.

**Tools exposed:**

- **`x402_http_request`** — Execute HTTP requests to APIs requiring payment via the x402 protocol. If the server returns 402, the tool parses the challenge, constructs the payment, retries with proof, and returns the final response.

**Example agent flow:**

```
agent → tool call → x402_http_request → 402 challenge → payment → retry → response
```

**Automatic discovery:** The server is discoverable by MCP-aware frameworks without manual registry submission:

- **Repository descriptor:** [mcp.json](mcp.json) at the repo root (name, description, `install: npx x402-mcp`, tools).
- **npm:** Run with `npx x402-mcp`; package keywords include `mcp`, `model-context-protocol`, `ai-tools`, `x402`.
- **Well-known:** [.well-known/mcp.json](.well-known/mcp.json) can be hosted at `https://demo.x402.merkleworks.io/.well-known/mcp.json` for domain-based discovery.

---

## Overview of x402

x402 is a protocol that gates HTTP APIs behind micropayments using **HTTP 402 Payment Required**:

1. **Request** — Client calls the API.
2. **402 challenge** — Server responds with `402 Payment Required` and an `X402-Challenge` header (nonce UTXO, price, payee, expiry).
3. **Payment** — Client builds a BSV transaction, delegates fees (optional), and broadcasts.
4. **Retry** — Client retries the request with an `X402-Proof` header.
5. **Response** — Server verifies the proof and returns the API response.

This flow lets APIs charge per request in satoshis without pre-registration or cards.

---

## What this MCP server does

This server exposes **Model Context Protocol (MCP)** tools so AI agents can:

- **`paid_http_request`** — Send an HTTP request; if the server returns 402, run the full x402 flow (parse challenge → pay → retry with proof) and return the final response. Primary tool for calling payment-gated APIs.
- **`discover_x402_api`** — List payable endpoints (from `/.well-known/x402` or by probing for 402).
- **`pay_x402_endpoint`** — Call a known x402 endpoint with full control (method, body, headers, delegator).
- **`parse_x402_challenge`** — Decode an `X402-Challenge` header.
- **`verify_x402_proof`** — Check an `X402-Proof` against a challenge and request.

Agents use **`paid_http_request`** for a single “call this URL; pay if 402” step.

---

## Installation

**Run with a single command (recommended):**

```bash
npx x402-mcp
```

Or install globally:

```bash
npm install -g x402-mcp
x402-mcp
```

From source:

```bash
git clone https://github.com/merkleworks/x402-mcp.git
cd x402-mcp
npm install
npm run build
npm start
```

---

## Usage example

**Agent → tool call → `x402_http_request` → x402 flow (if 402) → API response**

1. The agent calls the tool with `url`, `method`, and optional `headers` and `body`.
2. The server sends the HTTP request.
3. If the response is **402**, the server parses the challenge, builds the payment, delegates/broadcasts, then retries with the proof.
4. The tool returns the final response (status, body, and payment txid if paid).

---

## Example tool call

**Tool:** `x402_http_request`

**Input schema:**

| Field    | Type   | Required | Description                                      |
|----------|--------|----------|--------------------------------------------------|
| `url`    | string | yes      | Full URL of the API endpoint                     |
| `method` | string | no       | HTTP method (default: `GET`)                     |
| `headers`| object | no       | Optional HTTP headers (key-value strings)        |
| `body`   | string or object | no | Optional request body (string or JSON object)    |

**Example (GET):**

```json
{
  "tool": "x402_http_request",
  "input": {
    "url": "https://demo.x402.merkleworks.io/v1/expensive",
    "method": "GET"
  }
}
```

**Example (POST with JSON body):**

```json
{
  "tool": "x402_http_request",
  "input": {
    "url": "https://api.example.com/v1/query",
    "method": "POST",
    "headers": { "Content-Type": "application/json" },
    "body": { "query": "example" }
  }
}
```

More examples: [examples/](examples/), including [example_agent_call.json](examples/example_agent_call.json).

---

## Connecting from AI clients

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "x402": {
      "command": "npx",
      "args": ["@merkleworks/x402-mcp"]
    }
  }
}
```

Or with a local build:

```json
{
  "mcpServers": {
    "x402": {
      "command": "node",
      "args": ["/path/to/x402-mcp/dist/server.js"]
    }
  }
}
```

### Claude Desktop / Claude Code

Add to your MCP config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "x402": {
      "command": "npx",
      "args": ["@merkleworks/x402-mcp"]
    }
  }
}
```

### Generic MCP client (Node.js)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["@merkleworks/x402-mcp"],
});

const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(transport);

const result = await client.callTool("paid_http_request", {
  url: "https://demo.x402.merkleworks.io/v1/expensive",
  method: "GET",
});
console.log(result);
```

---

## Tools reference

| Tool                  | Description                                                                 |
|-----------------------|-----------------------------------------------------------------------------|
| `paid_http_request`   | Execute HTTP request; if 402, run x402 flow and return final response      |
| `discover_x402_api`   | Discover payable endpoints (/.well-known/x402 or probe)                     |
| `pay_x402_endpoint`   | Call x402 endpoint with full control (delegator, broadcast URL, etc.)      |
| `parse_x402_challenge`| Decode X402-Challenge header                                                |
| `verify_x402_proof`   | Verify X402-Proof against challenge and request                             |

---

## Protocol summary

1. Client requests a protected endpoint.
2. Server responds **402** with `X402-Challenge`.
3. Client builds a BSV tx, optionally uses a delegator for fees, then broadcasts.
4. Client retries with `X402-Proof`.
5. Server verifies and returns the response.

This MCP server implements that flow so agents can pay for API calls without manual steps.

---

## Configuration

- **`pay_x402_endpoint`** (and thus **`paid_http_request`** when it pays) use the same origin as the request URL for the delegator by default. Override with `delegator_url` / `broadcast_url` when using `pay_x402_endpoint` directly.
- Discovery manifest format: [protocol spec](https://github.com/ruidasilva/merkleworks-x402-spec) and `/.well-known/x402`.

---

## Examples

- **[example_agent_call.json](examples/example_agent_call.json)** — Example `paid_http_request` call for agents.
- **[discover-and-pay](examples/discover-and-pay.ts)** — Discover endpoints then pay and call the first. Run: `npx tsx examples/discover-and-pay.ts https://your-x402-api.example.com`

---

## MCP registry (mcp.json)

The repo includes **`mcp.json`** for MCP registries (e.g. [mcp.so](https://mcp.so)): name, description, repository, install command, and tool list.

---

## License

Apache-2.0
