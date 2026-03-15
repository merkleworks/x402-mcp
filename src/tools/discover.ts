import type { WellKnownManifest, Challenge } from "../types.js";
import { base64urlDecode } from "../crypto.js";

/**
 * Discover x402 endpoints on a host.
 *
 * Strategy:
 * 1. Try /.well-known/x402 manifest (preferred)
 * 2. Fall back to probing the URL directly for a 402 challenge
 */
export async function discoverX402Api(
  url: string
): Promise<{
  source: "well-known" | "probe";
  manifest?: WellKnownManifest;
  challenge?: Challenge;
  endpoints: Array<{
    url: string;
    method: string;
    price_sats: number;
    description?: string;
  }>;
}> {
  const parsed = new URL(url);
  const baseUrl = `${parsed.protocol}//${parsed.host}`;

  // 1. Try .well-known/x402
  try {
    const wellKnownUrl = `${baseUrl}/.well-known/x402`;
    const res = await fetch(wellKnownUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      const manifest = (await res.json()) as WellKnownManifest;
      return {
        source: "well-known",
        manifest,
        endpoints: (manifest.endpoints ?? []).map((ep) => ({
          url: `${baseUrl}${ep.path}`,
          method: ep.method,
          price_sats: ep.price_sats,
          description: ep.description,
        })),
      };
    }
  } catch {
    // .well-known not available — fall through to probe
  }

  // 2. Probe the URL itself for a 402 response
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 402) {
      const challengeHeader = res.headers.get("x402-challenge");
      if (challengeHeader) {
        const challenge = parseChallenge(challengeHeader);
        return {
          source: "probe",
          challenge,
          endpoints: [
            {
              url,
              method: challenge.method,
              price_sats: challenge.amount_sats,
              description: `Payable endpoint discovered via 402 probe`,
            },
          ],
        };
      }
    }

    return {
      source: "probe",
      endpoints: [],
    };
  } catch (err) {
    throw new Error(
      `Failed to discover x402 endpoints at ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function parseChallenge(header: string): Challenge {
  // Strip compact prefix if present: v1.bsv-tx.<base64url>
  const compactMatch = header.match(/^v\d+\.[^.]+\.(.+)$/);
  const payload = compactMatch ? compactMatch[1] : header;
  const decoded = base64urlDecode(payload);
  return JSON.parse(decoded.toString("utf-8")) as Challenge;
}
