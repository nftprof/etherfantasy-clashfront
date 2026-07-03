/**
 * Battle-engine wire client — the overworld side of the R1/R10 contract
 * (docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md).
 *
 * Allocate direction: POST the battle context to the engine's
 * /internal/v1/matches/allocate with `Authorization: Bearer <CF_BATTLE_API_TOKEN>`
 * and `Idempotency-Key: <battleId>`, 5 s timeout. Failures (network/5xx) are
 * thrown to the caller, which marks the battle FALLBACK — the sim's instant
 * resolution then settles it next tick. Never brick a battle.
 *
 * Callback direction: the engine POSTs the match result to us signed with
 * `X-CF-Signature: v1=<hex(hmacSHA256(CF_BATTLE_HMAC_SECRET, rawBody))>`;
 * verification is constant-time over the RAW request body.
 *
 * Wall clock is allowed here (timeouts, replay windows) — this is a server
 * boundary, never the sim.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface BattleEngineConfig {
  /** Full allocate endpoint URL (env BATTLE_ENGINE_URL) — unset = feature OFF. */
  url: string;
  /** Static bearer for the allocate direction (env CF_BATTLE_API_TOKEN). */
  token: string;
  /** HMAC secret for the result-callback direction (env CF_BATTLE_HMAC_SECRET). */
  hmacSecret: string;
  /**
   * Absolute result-callback URL override (env PUBLIC_BASE_URL +
   * /internal/battle-result). Default: http://127.0.0.1:<our port>/internal/battle-result
   * — engine and overworld share the box for MVP.
   */
  callbackUrl?: string;
  /** Injectable fetch — tests mock the engine. */
  fetchImpl?: typeof fetch;
}

/** Allocate POST timeout (contract: fall back to instant resolve on failure). */
export const ALLOCATE_TIMEOUT_MS = 5000;

/** `v1=<hex(hmacSHA256(secret, rawBody))>` — the X-CF-Signature value. */
export function signCallbackBody(secret: string, rawBody: string | Buffer): string {
  return `v1=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

/** Constant-time X-CF-Signature verification over the RAW request body. */
export function verifyCallbackSignature(secret: string, rawBody: Buffer, header: unknown): boolean {
  if (typeof header !== 'string' || header === '') return false;
  const expected = Buffer.from(signCallbackBody(secret, rawBody));
  const presented = Buffer.from(header.trim());
  return expected.length === presented.length && timingSafeEqual(expected, presented);
}

/**
 * POST the allocate context. Resolves with the engine's matchId on 2xx;
 * THROWS on timeout/network error/non-2xx (caller falls back to instant).
 * Idempotent on the engine side by battleId — re-sending is always safe.
 */
export async function allocateBattle(
  cfg: BattleEngineConfig,
  battleId: string,
  payload: Record<string, unknown>,
): Promise<{ matchId?: string }> {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ALLOCATE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(cfg.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.token}`,
        'idempotency-key': battleId,
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`allocate returned HTTP ${res.status}`);
    }
    let matchId: string | undefined;
    try {
      const json = (await res.json()) as Record<string, unknown>;
      if (typeof json['matchId'] === 'string') matchId = json['matchId'];
    } catch {
      /* body optional — a 2xx without a matchId still counts as allocated */
    }
    return { ...(matchId !== undefined ? { matchId } : {}) };
  } finally {
    clearTimeout(timer);
  }
}
