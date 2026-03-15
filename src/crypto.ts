import { createHash } from "node:crypto";

/** SHA-256 hash of a buffer, returned as hex string. */
export function sha256hex(data: Buffer | Uint8Array | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  return createHash("sha256").update(buf).digest("hex");
}

/** Base64url decode (no padding) → Buffer. */
export function base64urlDecode(str: string): Buffer {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  return Buffer.from(s, "base64");
}

/** Buffer → base64url string (no padding). */
export function base64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Canonical JSON per RFC 8785 (JCS): sorted keys, no whitespace. */
export function canonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "boolean" || typeof obj === "number") return JSON.stringify(obj);
  if (typeof obj === "string") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map((v) => canonicalize(v)).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const entries = keys.map((k) => {
    const v = (obj as Record<string, unknown>)[k];
    if (v === undefined) return null;
    return JSON.stringify(k) + ":" + canonicalize(v);
  }).filter((e) => e !== null);
  return "{" + entries.join(",") + "}";
}

/** Hash canonical request headers per x402 spec §3.1. */
const HEADER_ALLOWLIST = [
  "accept",
  "content-length",
  "content-type",
  "x402-client",
  "x402-idempotency-key",
];

export function hashHeaders(headers: Record<string, string>): string {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (HEADER_ALLOWLIST.includes(lower)) {
      normalized[lower] = v.trim().replace(/\s+/g, " ");
    }
  }
  const sorted = Object.keys(normalized).sort();
  const canonical = sorted.map((k) => `${k}:${normalized[k]}\n`).join("");
  return sha256hex(canonical);
}

/** Hash request body per x402 spec §3.2. */
export function hashBody(body: string | null | undefined): string {
  return sha256hex(body ?? "");
}

/**
 * Build an unsigned partial BSV transaction (Profile A).
 * Input 0: nonce UTXO. Output 0: payee output.
 */
export function buildUnsignedTx(
  nonceTxid: string,
  nonceVout: number,
  payeeLockingScriptHex: string,
  amountSats: number
): string {
  const parts: Buffer[] = [];

  // version (uint32le)
  const version = Buffer.alloc(4);
  version.writeUInt32LE(1);
  parts.push(version);

  // input count varint(1)
  parts.push(Buffer.from([0x01]));

  // input: prev txid (reversed)
  const txidBytes = Buffer.from(nonceTxid, "hex");
  const reversed = Buffer.from(txidBytes).reverse();
  parts.push(reversed);

  // prev vout (uint32le)
  const vout = Buffer.alloc(4);
  vout.writeUInt32LE(nonceVout);
  parts.push(vout);

  // scriptSig length (varint 0 — unsigned)
  parts.push(Buffer.from([0x00]));

  // sequence (uint32le)
  const seq = Buffer.alloc(4);
  seq.writeUInt32LE(0xffffffff);
  parts.push(seq);

  // output count varint(1)
  parts.push(Buffer.from([0x01]));

  // output value (uint64le)
  const value = Buffer.alloc(8);
  value.writeBigUInt64LE(BigInt(amountSats));
  parts.push(value);

  // output script
  const scriptBuf = Buffer.from(payeeLockingScriptHex, "hex");
  parts.push(writeVarint(scriptBuf.length));
  parts.push(scriptBuf);

  // locktime (uint32le)
  const locktime = Buffer.alloc(4);
  locktime.writeUInt32LE(0);
  parts.push(locktime);

  return Buffer.concat(parts).toString("hex");
}

function writeVarint(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) {
    const buf = Buffer.alloc(3);
    buf[0] = 0xfd;
    buf.writeUInt16LE(n, 1);
    return buf;
  }
  const buf = Buffer.alloc(5);
  buf[0] = 0xfe;
  buf.writeUInt32LE(n, 1);
  return buf;
}
