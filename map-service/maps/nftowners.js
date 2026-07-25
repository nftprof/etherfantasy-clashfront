// nftowners.js — REAL on-chain land ownership via the PG NFT-data API (owner 2026-07-21).
//
// nft-data.pentagon.games returns per item: { tokenId, owner, transferable, standard, name, image,
// updatedAt }. Two collections:
//   • PARCELS (Polygon) 0x383f… — each land parcel. VERIFIED: the l3 snapshot's tokenId === our
//     parcelId, so a wallet's owned tokenIds ARE the parcelIds it may edit — no translation table.
//   • ESTATE  (Ethereum) 0x28cd… — the L2 estate tokens (a whole estate).
//
// The land-editor gates "can this wallet edit this parcel?" on parcelId ∈ this wallet's parcels.
// Config (env, all optional — sane PG defaults): NFT_DATA_URL, NFT_PARCELS_CONTRACT, NFT_ESTATE_CONTRACT.
// fetchImpl is injectable so tests never hit the network (the sandbox blocks it; the box reaches it).

const NFT_DATA_URL = () => (process.env.NFT_DATA_URL || "https://nft-data.pentagon.games").replace(/\/$/, "");
export const PARCELS_CONTRACT = () => (process.env.NFT_PARCELS_CONTRACT || "0x383fb8793294d82b3c20bf04c10f4b9b9cb2aca7").toLowerCase();
export const ESTATE_CONTRACT = () => (process.env.NFT_ESTATE_CONTRACT || "0x28cd2990f34db387d011d7cc693a2bcedd8dc654").toLowerCase();

const isWallet = (w) => /^0x[0-9a-fA-F]{40}$/.test(String(w || ""));
const TTL = 120_000;
const _cache = new Map();  // wallet → { at, parcels:Set<string>, estates:[{tokenId,name}] }

// Pull every page of a collection query (a wallet-scoped query returns only that wallet's items,
// so this is small — capped at 200 pages / 20k items as a runaway guard). Never throws.
async function fetchAllItems(contract, query, fetchImpl) {
  const f = fetchImpl || fetch;
  const out = [];
  for (let page = 1; page <= 200; page++) {
    const url = `${NFT_DATA_URL()}/api/v1/collection/${contract}/items?${query}&page=${page}&limit=100`;
    let d = null;
    try { const r = await f(url, { signal: AbortSignal.timeout(8000) }); if (r && r.ok) d = await r.json(); }
    catch { break; }
    const items = (d && (d.items || (d.result && d.result.items) || d.data || (Array.isArray(d) ? d : null))) || [];
    if (!Array.isArray(items) || !items.length) break;
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

// The parcels + estates a wallet owns, cached ~2 min. { parcels:Set<parcelId>, estates:[{tokenId,name}] }.
export async function landOfWallet(wallet, fetchImpl) {
  const w = String(wallet || "").toLowerCase();
  if (!isWallet(w)) return { parcels: new Set(), estates: [], invalid: true };
  const c = _cache.get(w);
  if (c && Date.now() - c.at < TTL) return c;
  const [parcelItems, estateItems] = await Promise.all([
    fetchAllItems(PARCELS_CONTRACT(), `owner=${w}`, fetchImpl),
    fetchAllItems(ESTATE_CONTRACT(), `owner=${w}`, fetchImpl),
  ]);
  const rec = {
    at: Date.now(),
    parcels: new Set(parcelItems.map((i) => String(i.tokenId))),   // tokenId === parcelId
    estates: estateItems.map((i) => ({ tokenId: String(i.tokenId), name: i.name || null })),
  };
  if (_cache.size > 300) _cache.clear();
  _cache.set(w, rec);
  return rec;
}

// Does this wallet own this parcel? (the edit-gate primitive)
export async function walletOwnsParcel(wallet, parcelId, fetchImpl) {
  if (!isWallet(wallet)) return false;
  const land = await landOfWallet(wallet, fetchImpl);
  return land.parcels.has(String(parcelId));
}

export const _clearCache = () => _cache.clear();  // tests
