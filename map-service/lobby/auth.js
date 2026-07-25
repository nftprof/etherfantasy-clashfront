// PG (Pentagon Games) identity integration for the lobby.
// ---------------------------------------------------------------------------
// The client logs the user in through Pentagon Games and obtains an
// `access_token` (a Bearer JWT). The lobby NEVER trusts a client-supplied name:
// it verifies the token against the PG account API and uses the canonical
// username that comes back. That makes the displayed identity spoof-proof.
//
// Docs: https://blockchainsuperheroes.github.io/pg-identity-docs/
//   Login   : POST /user/login            -> result.access_token (Bearer JWT)
//   Profile : GET  /user                  -> result {id, username, ...}   (self)
//   Friends : GET  /user/friends?item_per_page=500 -> result.items[]      (graph)
//   Pending : GET  /user/friends/pending
// Base URL : https://api.account.pentagon.games
//
// All endpoints are overridable via env so we can point at staging or adjust if
// the self-profile path differs (confirm `PROFILE_PATH` against the live API).
// ---------------------------------------------------------------------------
import fs from "fs";

const PG = {
  base: process.env.PG_API_BASE || "https://api.account.pentagon.games",
  loginPath: process.env.PG_LOGIN_PATH || "/user/login",      // POST {type,username,password} + app key
  profilePath: process.env.PG_PROFILE_PATH || "/user/info",   // GET (Bearer + app key) → result.username
  friendsPath: process.env.PG_FRIENDS_PATH || "/user/friends",
  // X-PG-App-Key: pk_live_… (server-side only). File fallback so a pm2 restart without env
  // (the classic --update-env clobber) can't silently kill ALL logins ("app-key-missing").
  appKey: process.env.PG_APP_KEY || (() => { try { return fs.readFileSync(`${process.env.HOME}/.pg_app_key`, "utf8").trim(); } catch { return ""; } })(),
  // Dev escape hatch: when true, an unreachable PG API falls back to decoding the
  // JWT body locally (NO signature check) so the lobby is demoable offline.
  // MUST be false in production.
  allowInsecureDev: (process.env.PG_DEV_FALLBACK || "0") === "1",
  timeoutMs: parseInt(process.env.PG_TIMEOUT_MS || "6000", 10),
};
const appKeyHeader = () => (PG.appKey ? { "X-PG-App-Key": PG.appKey } : {});

function decodeJwtBody(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch { return null; }
}

async function pgGet(path, token) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), PG.timeoutMs);
  try {
    const r = await fetch(PG.base + path, {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json", ...appKeyHeader() },
      signal: ctrl.signal,
    });
    if (!r.ok) return { ok: false, status: r.status };
    const body = await r.json().catch(() => null);
    return { ok: true, body };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  } finally { clearTimeout(to); }
}

// Pull a canonical {id, username} out of whatever shape the profile call returns.
function normaliseProfile(body, fallbackJwt) {
  const r = (body && (body.result || body.data || body)) || {};
  const id = r.id ?? r.user_id ?? r.uid ?? (fallbackJwt && (fallbackJwt.id ?? fallbackJwt.sub)) ?? null;
  const username =
    r.username ?? r.name ?? r.display_name ??
    (fallbackJwt && (fallbackJwt.username ?? fallbackJwt.name)) ?? null;
  // wallet (mm_address) — the on-chain identity used to gate land editing via the NFT-data API
  const wallet = r.mm_address ?? r.wallet ?? r.address ?? r.eth_address ??
    (fallbackJwt && (fallbackJwt.mm_address ?? fallbackJwt.wallet)) ?? null;
  return {
    id: id != null ? String(id) : null,
    username: username ? String(username) : null,
    wallet: wallet && /^0x[0-9a-fA-F]{40}$/.test(String(wallet)) ? String(wallet).toLowerCase() : null,
  };
}

// Verify a PG access token and return the canonical identity.
// Returns { ok:true, id, username } or { ok:false, reason }.
export async function verifyToken(token) {
  if (!token || typeof token !== "string" || token.length < 4) return { ok: false, reason: "no-token" };

  // Dev/local login: `dev:SomeName`. ONLY honoured when PG_DEV_FALLBACK=1, so it is
  // inert in production. Lets the lobby be demoed/tested without reaching the PG API.
  if (token.startsWith("dev:")) {
    if (!PG.allowInsecureDev) return { ok: false, reason: "dev-login-disabled" };
    const name = token.slice(4).trim().slice(0, 24) || "Player";
    return { ok: true, id: "dev-" + name.toLowerCase(), username: name, source: "dev" };
  }

  const jwt = decodeJwtBody(token); // used only for fallback / id hints

  const res = await pgGet(PG.profilePath, token);
  if (res.ok && res.body) {
    const id = normaliseProfile(res.body, jwt);
    if (id.username) return { ok: true, id: id.id, username: id.username, wallet: id.wallet, source: "pg" };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: "rejected-by-pg" };

  // PG unreachable (our sandbox blocks it; the box will reach it). Dev fallback only.
  if (PG.allowInsecureDev && jwt) {
    const id = normaliseProfile({}, jwt);
    if (id.username) return { ok: true, id: id.id, username: id.username, wallet: id.wallet, source: "jwt-dev" };
    if (id.id) return { ok: true, id: id.id, username: "Player-" + id.id.slice(-4), source: "jwt-dev" };
  }
  return { ok: false, reason: res.error ? "pg-unreachable" : ("pg-status-" + (res.status || "?")) };
}

// Fetch the user's accepted friends (for party invites). Best-effort; never throws.
// Returns [{id, username}] (extra fields dropped for the lobby's purposes).
export async function fetchFriends(token) {
  const res = await pgGet(`${PG.friendsPath}?item_per_page=500`, token);
  if (!res.ok || !res.body) return [];
  const items = (res.body.result && res.body.result.items) || res.body.items || [];
  return items
    .map((f) => ({ id: f.id != null ? String(f.id) : null, username: f.username || f.name || "" }))
    .filter((f) => f.id && f.username);
}

// First-party login: exchange email+password for a PG access token (server-side, with the app
// key), then verify it to the canonical identity. The app key never leaves the server.
export async function loginPassword(email, password) {
  if (!PG.appKey) return { ok: false, reason: "app-key-missing" };
  if (!email || !password) return { ok: false, reason: "missing-credentials" };
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), PG.timeoutMs);
  try {
    const r = await fetch(PG.base + PG.loginPath, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...appKeyHeader() },
      body: JSON.stringify({ type: "email", username: email, password, login_from: "efmoba" }),
      signal: ctrl.signal,
    });
    const body = await r.json().catch(() => null);
    const token = body && ((body.result && body.result.access_token) || body.access_token);
    if (!r.ok || !token) return { ok: false, reason: (body && (body.message || body.error)) || ("login-failed-" + r.status) };
    const id = await verifyToken(token);
    return id.ok ? { ...id, token } : id;
  } catch (e) {
    return { ok: false, reason: "pg-unreachable" };
  } finally { clearTimeout(to); }
}

export const pgConfig = PG;
