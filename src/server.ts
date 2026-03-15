#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/** Cast record values to string (zod infers Record<string, unknown>). */
function asStringRecord(rec: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!rec) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = String(v);
  return out;
}
import { discoverX402Api } from "./tools/discover.js";
import { payX402Endpoint } from "./tools/pay.js";
import { parseX402Challenge, verifyX402Proof } from "./tools/verify.js";

const server = new McpServer({
  name: "x402-mcp",
  version: "0.1.0",
});

// ── discover_x402_api ──────────────────────────────────────────────────────────

server.tool(
  "discover_x402_api",
  "Discover x402 payable API endpoints on a host. Fetches /.well-known/x402 manifest or probes the URL for a 402 challenge. Returns a list of payable endpoints with their prices in satoshis.",
  {
    url: z.string().url().describe("Base URL or specific endpoint URL to discover x402 APIs on"),
  },
  async ({ url }) => {
    try {
      const result = await discoverX402Api(url);

      const lines: string[] = [];
      lines.push(`Source: ${result.source}`);

      if (result.manifest) {
        if (result.manifest.name) lines.push(`Service: ${result.manifest.name}`);
        if (result.manifest.description) lines.push(`Description: ${result.manifest.description}`);
        if (result.manifest.delegator_url) lines.push(`Delegator: ${result.manifest.delegator_url}`);
      }

      lines.push("");
      lines.push(`Found ${result.endpoints.length} payable endpoint(s):`);

      for (const ep of result.endpoints) {
        lines.push(`  ${ep.method} ${ep.url} — ${ep.price_sats} sats${ep.description ? ` (${ep.description})` : ""}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: result,
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// ── pay_x402_endpoint ──────────────────────────────────────────────────────────

server.tool(
  "pay_x402_endpoint",
  "Call an x402-gated API endpoint with automatic payment. Sends the request, handles the 402 challenge, constructs a BSV payment transaction, delegates for fee completion, broadcasts to the network, and retries with proof. Returns the API response after successful payment.",
  {
    url: z.string().url().describe("The full URL of the x402-gated endpoint"),
    method: z
      .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
      .default("GET")
      .describe("HTTP method"),
    body: z
      .string()
      .optional()
      .describe("Request body (for POST/PUT/PATCH)"),
    headers: z
      .record(z.string(), z.string())
      .optional()
      .describe("Additional HTTP headers as key-value pairs"),
    delegator_url: z
      .string()
      .url()
      .optional()
      .describe("Override delegator URL (defaults to same origin as endpoint)"),
    broadcast_url: z
      .string()
      .url()
      .optional()
      .describe("Override broadcast API URL (defaults to WhatsOnChain mainnet)"),
  },
  async ({ url, method, body, headers, delegator_url, broadcast_url }) => {
    try {
      const result = await payX402Endpoint({
        url,
        method,
        body: body ?? undefined,
        headers: asStringRecord(headers),
        delegatorUrl: delegator_url,
        broadcastUrl: broadcast_url,
      });

      const lines: string[] = [];
      lines.push(`HTTP ${result.status}`);
      if (result.txid) lines.push(`Transaction: ${result.txid}`);
      lines.push("");
      lines.push("Response Headers:");
      for (const [k, v] of Object.entries(result.headers)) {
        lines.push(`  ${k}: ${v}`);
      }
      lines.push("");
      lines.push("Response Body:");
      lines.push(result.body);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          status: result.status,
          txid: result.txid,
          body: result.body,
        },
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Payment failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// ── parse_x402_challenge ───────────────────────────────────────────────────────

server.tool(
  "parse_x402_challenge",
  "Parse an X402-Challenge header value into structured JSON. Decodes the base64url payload and returns the challenge fields: nonce UTXO, price, payee, expiry, request binding, and whether the challenge has expired.",
  {
    challenge_header: z
      .string()
      .describe("The raw X402-Challenge header value (base64url or compact v1.bsv-tx.* format)"),
  },
  async ({ challenge_header }) => {
    try {
      const result = parseX402Challenge(challenge_header);

      const lines: string[] = [];
      lines.push(`Scheme: ${result.challenge.scheme}`);
      lines.push(`Price: ${result.challenge.amount_sats} sats`);
      lines.push(`Expired: ${result.expired}`);
      lines.push(`Expires: ${new Date(result.challenge.expires_at * 1000).toISOString()}`);
      lines.push(`Domain: ${result.challenge.domain}`);
      lines.push(`Method: ${result.challenge.method}`);
      lines.push(`Path: ${result.challenge.path}`);
      lines.push(`Nonce UTXO: ${result.challenge.nonce_utxo.txid}:${result.challenge.nonce_utxo.vout}`);
      lines.push(`Challenge SHA-256: ${result.sha256}`);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: result,
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Parse error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// ── verify_x402_proof ──────────────────────────────────────────────────────────

server.tool(
  "verify_x402_proof",
  "Verify an X402-Proof header against a challenge and request details. Performs structural validation, binding checks, hash verification, and expiry checks. Does not verify mempool acceptance or client signatures (those require network access).",
  {
    proof_header: z
      .string()
      .describe("The raw X402-Proof header value (base64url encoded)"),
    challenge_header: z
      .string()
      .describe("The raw X402-Challenge header value that the proof should match"),
    request_url: z
      .string()
      .url()
      .describe("The URL of the original request"),
    request_method: z
      .string()
      .describe("The HTTP method of the original request"),
    request_headers: z
      .record(z.string(), z.string())
      .optional()
      .describe("The headers of the original request"),
    request_body: z
      .string()
      .optional()
      .describe("The body of the original request"),
  },
  async ({ proof_header, challenge_header, request_url, request_method, request_headers, request_body }) => {
    try {
      const result = await verifyX402Proof({
        proofHeader: proof_header,
        challengeHeader: challenge_header,
        requestUrl: request_url,
        requestMethod: request_method,
        requestHeaders: asStringRecord(request_headers),
        requestBody: request_body ?? undefined,
      });

      const lines: string[] = [];
      lines.push(`Valid: ${result.valid}`);

      if (result.errors.length > 0) {
        lines.push("");
        lines.push("Errors:");
        for (const e of result.errors) {
          lines.push(`  - ${e}`);
        }
      }

      if (result.proof) {
        lines.push("");
        lines.push(`Proof txid: ${result.proof.txid}`);
        lines.push(`Proof scheme: ${result.proof.scheme}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: result,
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Verification error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// ── Start server ───────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("x402-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
