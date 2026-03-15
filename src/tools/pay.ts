import type {
  Challenge,
  ParsedChallenge,
  DelegationResult,
  Proof,
} from "../types.js";
import {
  base64urlDecode,
  base64urlEncode,
  sha256hex,
  canonicalize,
  hashHeaders,
  hashBody,
  buildUnsignedTx,
} from "../crypto.js";

/**
 * Full x402 payment flow:
 * 1. Call endpoint → receive 402 challenge
 * 2. Parse challenge
 * 3. Build partial transaction
 * 4. Send to delegator
 * 5. Broadcast transaction
 * 6. Retry with X402-Proof header
 * 7. Return API response
 */
export async function payX402Endpoint(params: {
  url: string;
  method: string;
  body?: string;
  headers?: Record<string, string>;
  delegatorUrl?: string;
  broadcastUrl?: string;
}): Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
  txid?: string;
  proof?: Proof;
}> {
  const {
    url,
    method,
    body,
    headers: customHeaders = {},
    delegatorUrl,
    broadcastUrl = "https://api.whatsonchain.com/v1/bsv/main",
  } = params;

  // Step 1: Make initial request
  const initialRes = await fetch(url, {
    method,
    headers: customHeaders,
    body: body || undefined,
    signal: AbortSignal.timeout(15_000),
  });

  if (initialRes.status !== 402) {
    const responseBody = await initialRes.text();
    return {
      status: initialRes.status,
      headers: Object.fromEntries(initialRes.headers.entries()),
      body: responseBody,
    };
  }

  // Step 2: Parse 402 challenge
  const challengeHeader = initialRes.headers.get("x402-challenge");
  if (!challengeHeader) {
    throw new Error("Received 402 but no X402-Challenge header present");
  }

  const parsed = parseChallenge(challengeHeader);
  const { challenge } = parsed;

  // Validate expiry
  if (Date.now() / 1000 > challenge.expires_at) {
    throw new Error(
      `Challenge expired at ${new Date(challenge.expires_at * 1000).toISOString()}`
    );
  }

  // Resolve delegator URL
  const resolvedDelegatorUrl = delegatorUrl || `${new URL(url).origin}`;
  const delegatorEndpoint = `${resolvedDelegatorUrl}/delegate/x402`;

  // Step 3: Build partial transaction
  const partialTxHex = challenge.template
    ? challenge.template.rawtx_hex
    : buildUnsignedTx(
        challenge.nonce_utxo.txid,
        challenge.nonce_utxo.vout,
        challenge.payee_locking_script_hex,
        challenge.amount_sats
      );

  // Step 4: Send to delegator
  const delegationResult = await delegate(delegatorEndpoint, {
    partial_tx: partialTxHex,
    nonce_utxo: {
      txid: challenge.nonce_utxo.txid,
      vout: challenge.nonce_utxo.vout,
    },
    challenge_sha256: parsed.sha256Hex,
  });

  // Step 5: Broadcast transaction
  await broadcast(broadcastUrl, delegationResult.rawtx);

  // Step 6: Build proof and retry
  const parsedUrl = new URL(url);
  const reqBinding = {
    domain: parsedUrl.host,
    method: method.toUpperCase(),
    path: parsedUrl.pathname,
    query: parsedUrl.search ? parsedUrl.search.slice(1) : "",
    req_headers_sha256: hashHeaders(customHeaders),
    req_body_sha256: hashBody(body),
  };

  const proof: Proof = {
    v: "1",
    scheme: "bsv-tx-v1",
    txid: delegationResult.txid,
    rawtx_b64: Buffer.from(delegationResult.rawtx, "hex").toString("base64"),
    challenge_sha256: parsed.sha256Hex,
    request: reqBinding,
  };

  const proofB64 = base64urlEncode(Buffer.from(JSON.stringify(proof), "utf-8"));

  const retryRes = await fetch(url, {
    method,
    headers: {
      ...customHeaders,
      "X402-Proof": proofB64,
    },
    body: body || undefined,
    signal: AbortSignal.timeout(15_000),
  });

  const retryBody = await retryRes.text();

  return {
    status: retryRes.status,
    headers: Object.fromEntries(retryRes.headers.entries()),
    body: retryBody,
    txid: delegationResult.txid,
    proof,
  };
}

function parseChallenge(header: string): ParsedChallenge {
  const compactMatch = header.match(/^v\d+\.[^.]+\.(.+)$/);
  const payload = compactMatch ? compactMatch[1] : header;
  const rawBytes = base64urlDecode(payload);
  const sha256Hex = sha256hex(rawBytes);
  const challenge = JSON.parse(rawBytes.toString("utf-8")) as Challenge;
  return { challenge, rawBytes: new Uint8Array(rawBytes), sha256Hex };
}

async function delegate(
  endpoint: string,
  req: { partial_tx: string; nonce_utxo: { txid: string; vout: number }; challenge_sha256: string }
): Promise<DelegationResult> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Delegator returned ${res.status}: ${errBody}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const txid = data.txid as string;
  const rawtx = (data.completed_tx ?? data.rawtx_hex ?? data.rawtx) as string;

  if (!txid || !rawtx) {
    throw new Error(`Delegator response missing txid or rawtx: ${JSON.stringify(data)}`);
  }

  return { txid, rawtx, accepted: true };
}

async function broadcast(baseUrl: string, rawtxHex: string): Promise<string> {
  const res = await fetch(`${baseUrl}/tx/raw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txhex: rawtxHex }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Broadcast failed (${res.status}): ${errBody}`);
  }

  const txid = (await res.text()).replace(/"/g, "").trim();
  return txid;
}
