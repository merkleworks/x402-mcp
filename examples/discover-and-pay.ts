#!/usr/bin/env node
/**
 * Example: discover x402 endpoints on a host, then pay for and call the first one.
 *
 * Run from repo root after: npm install && npm run build
 *
 *   npx tsx examples/discover-and-pay.ts https://your-x402-api.example.com
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: npx tsx examples/discover-and-pay.ts <base-url>");
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/server.js"],
  cwd: repoRoot,
});

const client = new Client({ name: "discover-and-pay-example", version: "1.0.0" });

async function main() {
  await client.connect(transport);

  console.log("Discovering x402 endpoints at:", baseUrl);
  const discovery = await client.callTool("discover_x402_api", { url: baseUrl });

  const content = discovery.content;
  if (Array.isArray(content) && content.length > 0 && "text" in content[0]) {
    console.log("\n--- Discovery result ---\n");
    console.log(content[0].text);
  }

  const structured = (discovery as { structuredContent?: unknown }).structuredContent as
    | { endpoints?: Array<{ url: string; method: string; price_sats: number }> }
    | undefined;
  const endpoints = structured?.endpoints ?? [];

  if (endpoints.length === 0) {
    console.log("\nNo payable endpoints found. Exiting.");
    return;
  }

  const first = endpoints[0];
  console.log("\n--- Paying for first endpoint ---");
  console.log(`${first.method} ${first.url} (${first.price_sats} sats)\n`);

  const payResult = await client.callTool("pay_x402_endpoint", {
    url: first.url,
    method: first.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  });

  const payContent = payResult.content;
  if (Array.isArray(payContent) && payContent.length > 0 && "text" in payContent[0]) {
    console.log("--- API response ---\n");
    console.log(payContent[0].text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
