import { createHash } from "node:crypto";
import type { Challenge, Proof } from "../types.js";
import {
  base64urlDecode,
  sha256hex,
  hashHeaders,
  hashBody,
} from "../crypto.js";

/**
 * Parse an X402-Challenge header into structured JSON.
 */
export function parseX402Challenge(challengeHeader: string): {
  challenge: Challenge;
  sha256: string;
  expired: boolean;
} {
  const compactMatch = challengeHeader.match(/^v\d+\.[^.]+\.(.+)$/);
  const payload = compactMatch ? compactMatch[1] : challengeHeader;
  const rawBytes = base64urlDecode(payload);
  const sha256 = sha256hex(rawBytes);
  const challenge = JSON.parse(rawBytes.toString("utf-8")) as Challenge;
  const expired = Date.now() / 1000 > challenge.expires_at;

  return { challenge, sha256, expired };
}

/**
 * Verify an X402-Proof header against a known challenge and request details.
 *
 * This performs structural and binding validation (steps 1-12 from the spec).
 * It does NOT verify mempool acceptance (step 13) or client signatures (step 14)
 * since those require network/key access.
 */
export function verifyX402Proof(params: {
  proofHeader: string;
  challengeHeader: string;
  requestUrl: string;
  requestMethod: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
}): {
  valid: boolean;
  errors: string[];
  proof?: Proof;
  challenge?: Challenge;
} {
  const errors: string[] = [];

  // 1. Decode proof
  let proof: Proof;
  try {
    const proofBytes = base64urlDecode(params.proofHeader);
    proof = JSON.parse(proofBytes.toString("utf-8")) as Proof;
  } catch (err) {
    return { valid: false, errors: ["Failed to decode proof: " + String(err)] };
  }

  // 2. Validate version and scheme
  if (proof.v !== "1") errors.push(`Unexpected proof version: ${proof.v}`);
  if (proof.scheme !== "bsv-tx-v1") errors.push(`Unexpected scheme: ${proof.scheme}`);

  // 3. Parse challenge
  let challenge: Challenge;
  let challengeSha256: string;
  try {
    const parsed = parseX402Challenge(params.challengeHeader);
    challenge = parsed.challenge;
    challengeSha256 = parsed.sha256;
  } catch (err) {
    return {
      valid: false,
      errors: [...errors, "Failed to parse challenge: " + String(err)],
      proof,
    };
  }

  // 4. Validate challenge_sha256 matches
  if (proof.challenge_sha256 !== challengeSha256) {
    errors.push(
      `challenge_sha256 mismatch: proof=${proof.challenge_sha256}, expected=${challengeSha256}`
    );
  }

  // 5. Validate request binding
  const url = new URL(params.requestUrl);
  const expectedDomain = url.host;
  const expectedMethod = params.requestMethod.toUpperCase();
  const expectedPath = url.pathname;
  const expectedQuery = url.search ? url.search.slice(1) : "";

  if (proof.request.domain !== expectedDomain) {
    errors.push(`domain mismatch: ${proof.request.domain} vs ${expectedDomain}`);
  }
  if (proof.request.method !== expectedMethod) {
    errors.push(`method mismatch: ${proof.request.method} vs ${expectedMethod}`);
  }
  if (proof.request.path !== expectedPath) {
    errors.push(`path mismatch: ${proof.request.path} vs ${expectedPath}`);
  }
  if (proof.request.query !== expectedQuery) {
    errors.push(`query mismatch: ${proof.request.query} vs ${expectedQuery}`);
  }

  // 6. Validate request hashes
  const expectedHeadersHash = hashHeaders(params.requestHeaders ?? {});
  const expectedBodyHash = hashBody(params.requestBody);

  if (proof.request.req_headers_sha256 !== expectedHeadersHash) {
    errors.push("req_headers_sha256 mismatch");
  }
  if (proof.request.req_body_sha256 !== expectedBodyHash) {
    errors.push("req_body_sha256 mismatch");
  }

  // 7. Validate challenge binding matches proof request
  if (challenge.domain !== proof.request.domain) {
    errors.push("challenge domain does not match proof request domain");
  }
  if (challenge.method !== proof.request.method) {
    errors.push("challenge method does not match proof request method");
  }
  if (challenge.path !== proof.request.path) {
    errors.push("challenge path does not match proof request path");
  }

  // 8. Validate expiry
  if (Date.now() / 1000 > challenge.expires_at) {
    errors.push(`Challenge expired at ${new Date(challenge.expires_at * 1000).toISOString()}`);
  }

  // 9. Validate rawtx is present and txid matches
  if (!proof.rawtx_b64) {
    errors.push("proof missing rawtx_b64");
  } else {
    try {
      const rawtxBuf = Buffer.from(proof.rawtx_b64, "base64");
      // Double SHA-256 to compute txid
      const hash1 = createHash("sha256").update(rawtxBuf).digest();
      const hash2 = createHash("sha256").update(hash1).digest();
      const computedTxid = Buffer.from(hash2).reverse().toString("hex");

      if (proof.txid !== computedTxid) {
        errors.push(`txid mismatch: proof=${proof.txid}, computed=${computedTxid}`);
      }
    } catch (err) {
      errors.push("Failed to decode/verify rawtx_b64: " + String(err));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    proof,
    challenge,
  };
}
