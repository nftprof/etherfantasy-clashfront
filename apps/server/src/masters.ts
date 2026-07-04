/**
 * EF Masters API client (docs/09 §7) — the roster a player can command.
 *
 * Clash Front is a CONSUMER of the LIVE `api.etherfantasy.com` Masters service:
 * a governor's officer pool is gated to the Masters their wallet actually owns
 * or rents. This module is the server-boundary fetch only — it NEVER runs inside
 * the deterministic sim tick. Results are handed to `Game.loginPg` which
 * reconciles them into the officer pool (see game.ts `syncOfficersFromMasters`).
 *
 * Feature is ACTIVE only when a wallet is known (PG login yields `mm_address`)
 * AND the API is reachable; every failure path returns `undefined` so callers
 * fall back to the demo roster — the game must never brick on an API hiccup.
 */

/** One Master as returned by GET /api/gameplay/masters/active/{wallet} (docs/09 §7). */
export interface OwnedMaster {
  masterId: number | string; // EF masterId (e.g. 3001) — the champion key the MOBA client maps
  tokenId?: number;
  name: string; // display name, e.g. 'Choco'
  slug?: string; // champion slug, e.g. 'choco'
  joinChance?: number; // % availability roll (docs/09 §7, open semantics)
  alive?: boolean;
  koUntil?: string | null; // ISO ts while KO'd; null/absent = available
  source?: 'owned' | 'rented';
  rentalExpires?: string; // ISO ts; RENTED only
}

/** Default EF Masters API base (env MASTERS_API_URL). */
export const MASTERS_API_URL_DEFAULT = 'https://api.etherfantasy.com';

/** GET /api/gameplay/masters/active/{wallet} timeout — same 5 s budget as PG. */
const MASTERS_TIMEOUT_MS = 5000;

function isOwnedMaster(v: unknown): v is OwnedMaster {
  if (v === null || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  const idOk = typeof m['masterId'] === 'number' || typeof m['masterId'] === 'string';
  return idOk && typeof m['name'] === 'string' && m['name'] !== '';
}

/** Keep only the canonical fields — never trust arbitrary upstream keys into state. */
function normalize(m: OwnedMaster): OwnedMaster {
  return {
    masterId: m.masterId,
    ...(typeof m.tokenId === 'number' ? { tokenId: m.tokenId } : {}),
    name: m.name,
    ...(typeof m.slug === 'string' ? { slug: m.slug } : {}),
    ...(typeof m.joinChance === 'number' ? { joinChance: m.joinChance } : {}),
    ...(typeof m.alive === 'boolean' ? { alive: m.alive } : {}),
    ...(m.koUntil !== undefined ? { koUntil: m.koUntil } : {}),
    ...(m.source === 'owned' || m.source === 'rented' ? { source: m.source } : {}),
    ...(typeof m.rentalExpires === 'string' ? { rentalExpires: m.rentalExpires } : {}),
  };
}

/**
 * Fetch the active Masters for a wallet. Returns:
 *   - `OwnedMaster[]` (possibly empty)  — API reachable; the authoritative roster
 *   - `undefined`                        — unreachable / non-200 / unparseable
 *
 * The empty-vs-undefined distinction is load-bearing downstream: an EMPTY list
 * means "wallet owns nothing" (playability fallback), `undefined` means "could
 * not reach the API" (keep whatever officers exist).
 */
export async function fetchActiveMasters(
  apiUrl: string,
  wallet: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OwnedMaster[] | undefined> {
  const base = apiUrl.replace(/\/+$/, '');
  const url = `${base}/api/gameplay/masters/active/${encodeURIComponent(wallet)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MASTERS_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (res.status !== 200) return undefined;
    const json = (await res.json()) as { masters?: unknown };
    if (!Array.isArray(json.masters)) return undefined;
    return json.masters.filter(isOwnedMaster).map(normalize);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
