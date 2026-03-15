# x402-mcp

MCP server for the [x402 protocol](https://github.com/ruidasilva/merkleworks-x402-spec) — allows AI agents to discover and call x402-gated APIs automatically.

**Published on GitHub:** [Merkleworks/x402-mcp](https://github.com/merkleworks/x402-mcp) · [ruidasilva/x402-mcp](https://github.com/ruidasilva/x402-mcp)

## Install

**One-line (run without installing):**

```bash
npx @merkleworks/x402-mcp
```

Or install globally from npm (when published):

```bash
npm install -g @merkleworks/x402-mcp
x402-mcp
```

From source, see [Quick Start](#quick-start) below.

## Tools

| Tool | Description |
|------|-------------|
| `discover_x402_api` | Fetch `/.well-known/x402` or probe a URL for payable endpoints and prices |
| `pay_x402_endpoint` | Full payment flow: request → 402 challenge → build tx → delegate → broadcast → retry with proof |
| `parse_x402_challenge` | Decode an `X402-Challenge` header into structured JSON |
| `verify_x402_proof` | Verify an `X402-Proof` header against a challenge and request binding |

## Quick Start

```bash
cd x402-mcp
npm install
npm run build
npm start
```

For development (no build step):

```bash
npm run dev
```

## Connecting from AI Clients

### Claude Desktop / Claude Code

Add to `~/.claude/claude_desktop_config.json` (or the MCP settings file):

```json
{
  "mcpServers": {
    "x402": {
      "command": "node",
      "args": ["/absolute/path/to/x402-mcp/dist/server.js"]
    }
  }
}
```

Or using tsx for development:

```json
{
  "mcpServers": {
    "x402": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/x402-mcp/src/server.ts"]
    }
  }
}
```

### Cursor

Add to your workspace `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "x402": {
      "command": "node",
      "args": ["/absolute/path/to/x402-mcp/dist/server.js"]
    }
  }
}
```

### OpenAI Agents (via MCP bridge)

OpenAI agents can connect to MCP servers using the `mcp` tool type in the Responses API:

```python
from openai import OpenAI

client = OpenAI()

response = client.responses.create(
    model="gpt-4.1",
    tools=[
        {
            "type": "mcp",
            "server_label": "x402",
            "server_url": "http://localhost:8402/sse",  # requires MCP-to-SSE bridge
            "require_approval": "never",
        }
    ],
    input="Discover payable endpoints at https://api.example.com",
)
```

To expose the stdio MCP server over SSE for OpenAI, use `@modelcontextprotocol/server-sse`:

```bash
npx @modelcontextprotocol/server-sse --port 8402 -- node dist/server.js
```

### Generic MCP Client (Node.js)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/server.js"],
  cwd: "/path/to/x402-mcp",
});

const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(transport);

// Discover endpoints
const discovery = await client.callTool("discover_x402_api", {
  url: "https://api.example.com",
});
console.log(discovery);

// Pay for an endpoint
const result = await client.callTool("pay_x402_endpoint", {
  url: "https://api.example.com/api/expensive-resource",
  method: "GET",
});
console.log(result);
```

## Protocol Overview

The x402 protocol uses HTTP 402 to gate API access behind BSV micropayments:

1. Client requests a protected endpoint
2. Server responds `402 Payment Required` with an `X402-Challenge` header
3. Client constructs a BSV transaction spending the challenge's nonce UTXO
4. Client sends the partial transaction to a delegator for fee completion
5. Client broadcasts the completed transaction
6. Client retries the request with an `X402-Proof` header
7. Server verifies the proof and returns the response

This MCP server automates the entire flow so AI agents can pay for API calls seamlessly.

## Examples

See the [examples/](examples/) folder for runnable scripts:

- **[discover-and-pay](examples/discover-and-pay.ts)** — discover payable endpoints on a host, then call the first one with automatic payment. Run from repo root: `npx tsx examples/discover-and-pay.ts https://your-x402-api.example.com`

## Configuration

The `pay_x402_endpoint` tool accepts optional overrides:

- `delegator_url` — defaults to the same origin as the endpoint
- `broadcast_url` — defaults to WhatsOnChain mainnet API

For the `/.well-known/x402` manifest format, see the [protocol spec](https://github.com/ruidasilva/merkleworks-x402-spec).

## Publishing to npm

From the repo root:

```bash
npm run build
npm publish --access public
```

Scoped packages (`@merkleworks/...`) require `--access public` unless you use a paid npm org. After publishing, users can install with `npm install -g @merkleworks/x402-mcp` or run with `npx @merkleworks/x402-mcp`.

## License

Apache-2.0
