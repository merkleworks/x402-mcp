/**
 * x402 protocol types aligned with the normative wire specification.
 */

export interface NonceUtxo {
  txid: string;
  vout: number;
  satoshis: number;
  locking_script_hex: string;
}

export interface Challenge {
  v: string;
  scheme: string;
  nonce_utxo: NonceUtxo;
  amount_sats: number;
  payee_locking_script_hex: string;
  expires_at: number;
  domain: string;
  method: string;
  path: string;
  query: string;
  req_headers_sha256: string;
  req_body_sha256: string;
  require_mempool_accept: boolean;
  confirmations_required: number;
  template?: {
    rawtx_hex: string;
    price_sats: number;
  };
}

export interface ParsedChallenge {
  challenge: Challenge;
  rawBytes: Uint8Array;
  sha256Hex: string;
}

export interface RequestBinding {
  domain: string;
  method: string;
  path: string;
  query: string;
  req_headers_sha256: string;
  req_body_sha256: string;
}

export interface Proof {
  v: string;
  scheme: string;
  txid: string;
  rawtx_b64: string;
  challenge_sha256: string;
  request: RequestBinding;
  client_sig?: {
    alg: string;
    pubkey_hex: string;
    signature_hex: string;
  };
}

export interface DelegationRequest {
  partial_tx: string;
  nonce_utxo: { txid: string; vout: number };
  challenge_sha256: string;
}

export interface DelegationResult {
  txid: string;
  rawtx: string;
  accepted: boolean;
}

export interface WellKnownEndpoint {
  path: string;
  method: string;
  price_sats: number;
  description?: string;
  content_type?: string;
}

export interface WellKnownManifest {
  name?: string;
  description?: string;
  version?: string;
  scheme: string;
  delegator_url?: string;
  broadcast_url?: string;
  endpoints: WellKnownEndpoint[];
}
