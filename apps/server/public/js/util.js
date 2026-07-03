/**
 * Pure helpers shared by the Clash Front MVP client (no DOM, no network).
 * Class weights / preset costs mirror packages/shared/balance.json — the server
 * remains authoritative (ArmyView.strength); these power previews only.
 */

export const CT_UNITS_PER_CT = 10_000;

/** balance.json units.classBase (strength weight per soldier). */
export const CLASS_WEIGHT = { INFANTRY: 10, ARCHER: 9, CAVALRY: 14, SPEAR: 9, SIEGE: 4, MARINE: 10, SHIP: 16 };

/** balance.json units.trainCtUnitsPerSoldier. */
export const UNIT_COST = { INFANTRY: 20_000, ARCHER: 30_000, CAVALRY: 60_000 };

/** sim-engine DEMO_ARMY_PRESETS mirror (labels + costs for the raise buttons). */
export const PRESETS = {
  STANDARD: { label: 'Standard army', units: [['INFANTRY', 100], ['ARCHER', 60], ['CAVALRY', 40]] },
  SCOUTS: { label: 'Scout riders', units: [['CAVALRY', 30]] },
};

export function presetCostCt(preset) {
  const p = PRESETS[preset];
  return p.units.reduce((n, [c, k]) => n + UNIT_COST[c] * k, 0) / CT_UNITS_PER_CT;
}

/** balance.json `provisions` ⚙ + TIE_THRESHOLD mirror (docs/04 §7c) — previews only. */
export const PROV = {
  ctPerFood: 1000, ctPerGold: 2000, ctPerWood: 2000,
  battleFoodNeedPer100: 400,
  ccTiers: [{ gold: 50, wood: 50, name: 'Camp' }, { gold: 100, wood: 100, name: 'Palisade' },
    { gold: 200, wood: 200, name: 'Fortified camp' }],
  tieThreshold: 0.15,
};

/** CT cost (ct_units) of a provision order at balance prices. */
export function provisionCostCtUnits(o) {
  return (o.food || 0) * PROV.ctPerFood + (o.gold || 0) * PROV.ctPerGold + (o.wood || 0) * PROV.ctPerWood;
}

/** Food one battle consumes for a side of `troops` soldiers (⚙ battleFoodNeedPer100). */
export function battleFoodNeed(troops) {
  return Math.ceil((troops * PROV.battleFoodNeedPer100) / 100);
}

/** Highest command-center tier the carried gold+wood affords ({tier:0,name:null} = none). */
export function ccTierFor(troops, gold, wood) {
  let best = { tier: 0, name: null };
  PROV.ccTiers.forEach((t, i) => {
    if (gold >= Math.ceil((t.gold * troops) / 100) && wood >= Math.ceil((t.wood * troops) / 100)) {
      best = { tier: i + 1, name: t.name };
    }
  });
  return best;
}

/** balance.json `development` + `developmentEffects` ⚙ mirror (F4) — previews only. */
export const DEV = {
  maxLevel: 10,
  growth: 1.6,
  base: { AGRICULTURE: 1_000_000, ECONOMY: 1_200_000, DEFENSE: 1_500_000, MILITARY: 1_300_000 },
};

/** Display metadata for the four development tracks (docs/08 DevelopmentTrack). */
export const DEV_TRACKS = [
  { track: 'AGRICULTURE', icon: '🌾', label: 'Agriculture', effect: '+400 🍞/day per level' },
  { track: 'DEFENSE', icon: '🛡', label: 'Defense', effect: '+10%/lvl garrison defense' },
  { track: 'ECONOMY', icon: '💰', label: 'Economy', effect: '+14 CT/day per level' },
  { track: 'MILITARY', icon: '⚔', label: 'Military', effect: '−5%/lvl raise cost (max 30%)' },
];

/** CT cost (ct_units) of the NEXT level on a track (⚙ base × growth^level). */
export function devCostCtUnits(track, level) {
  return Math.round(DEV.base[track] * Math.pow(DEV.growth, level));
}

/**
 * balance.json `economy` + `training` ⚙ mirror (FS3) — FALLBACK only: the live
 * values arrive on GET /api/economy (`shares` + `musterPenalty`) and win when
 * present (store.econ). Kept in sync so the enrich/raze previews degrade
 * gracefully if that fetch fails.
 */
export const ECON = {
  loot: 0.3, landYield: 0.2, lordsLandlord: 0.15, lordsSeat: 0.1, burn: 0.2, treasury: 0.05,
  landYieldSelfPct: 0.6, enrichYieldPctPerDay: 0.1, enrichLootPct: 0.35, razeSalvagePct: 0.4,
};
/** balance.json training.musterPenalty ⚙ mirror — mustering armies fight at this fraction. */
export const MUSTER_PENALTY = 0.7;

/** "~lo–hi" fuzzy-band label (F1). */
export function fmtBand(b) {
  return `~${b.lo}–${b.hi}`;
}

/** Band midpoint (the client's working estimate for fuzzy strengths). */
export function bandMid(b) {
  return Math.round((b.lo + b.hi) / 2);
}

/** Best-known strength of an ArmyView: exact, else fuzzy-band midpoint (F1). */
export function strengthEst(a) {
  if (a.strength !== undefined) return a.strength;
  if (a.strengthBand) return bandMid(a.strengthBand);
  return 0;
}

/** Best-known troop count (fuzzy views only carry strength; ≈10 strength/soldier). */
export function troopsEst(a) {
  if (a.troops !== undefined) return a.troops;
  if (a.strengthBand) return Math.max(1, Math.round(bandMid(a.strengthBand) / 10));
  return 0;
}

/** Marching steps the army's carried food covers. */
export function foodSteps(a) {
  return a.foodPerStep > 0 ? Math.floor(a.provisions.food / a.foodPerStep) : 999;
}

export function fmtProv(p) {
  return `🍞${p.food} 🪙${p.gold} 🪵${p.wood}`;
}

/** Approximate army strength from unit stacks (× morale/100), like the server's armyStrength. */
export function strengthOf(units, morale = 100) {
  const base = units.reduce((n, s) => n + (CLASS_WEIGHT[s.unitClass] ?? 8) * s.count, 0);
  return Math.round(base * (morale / 100));
}

export function fmtCT(ctUnits) {
  return (ctUnits / CT_UNITS_PER_CT).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' CT';
}

/** ms → compact wall-clock duration ("42s", "3m 10s", "1h 04m"). */
export function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function shortId(id) {
  return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

/** '#rrggbb' → [r,g,b]. */
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Mix hex color toward black (t<0) or white (t>0), t in [-1,1]. */
export function shade(hex, t) {
  const [r, g, b] = rgb(hex);
  const to = t < 0 ? 0 : 255;
  const k = Math.abs(t);
  const f = (v) => Math.round(v + (to - v) * k);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/**
 * BFS shortest path over the parcel graph (same graph the server marches on).
 * Returns parcelIds excluding `from`, including `to`; undefined if unreachable.
 */
export function bfsPath(neighborsOf, from, to) {
  if (from === to) return [];
  const prev = new Map();
  const seen = new Set([from]);
  const queue = [from];
  for (let qi = 0; qi < queue.length; qi++) {
    for (const n of neighborsOf(queue[qi]) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      prev.set(n, queue[qi]);
      if (n === to) {
        const path = [n];
        let p = queue[qi];
        while (p !== from) { path.push(p); p = prev.get(p); }
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return undefined;
}

export function pointInPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A point guaranteed inside the polygon (55/648 demo parcels are concave with
 * their centroid OUTSIDE — dots/fires would render on the neighbor). Uses the
 * midpoint of the widest span where the bbox mid-line crosses the polygon.
 */
export function innerPoint(poly, centroid) {
  if (pointInPoly(poly, centroid[0], centroid[1])) return centroid;
  let mny = 1e9, mxy = -1e9;
  for (const [, y] of poly) { if (y < mny) mny = y; if (y > mxy) mxy = y; }
  const my = (mny + mxy) / 2;
  const xs = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > my) !== (yj > my)) xs.push(xi + ((my - yi) / (yj - yi)) * (xj - xi));
  }
  xs.sort((a, b) => a - b);
  let best = null, bestW = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > bestW) { bestW = xs[i + 1] - xs[i]; best = [(xs[i] + xs[i + 1]) / 2, my]; }
  }
  return best ?? centroid;
}

/** Cubic ease-in-out for camera flights. */
export function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Officer avatars ("personal touch", PO 2026-07-03) ─────────────────────────
// Convention: static portrait at /avatars/<slug>.png (slug = lowercase base
// name, join-suffix stripped: "Irene 2" → irene, "Death_Jinook" → death_jinook).
// FUTURE: per-officer NFT image URLs — swap the source in officerAvatarUrl()
// only; every render site goes through avatarHtml().

const HERO_BASES = new Set(['irene', 'kai', 'leah']);
/** URLs that 404'd once this session — never re-probed (no console spam). */
export const missingAvatars = new Set();

function officerSlug(name) {
  return String(name ?? '').replace(/\s+\d+$/, '').trim().toLowerCase();
}

/** The single avatar-source lookup (future: officer.imageUrl from the NFT). */
export function officerAvatarUrl(officer) {
  const slug = officerSlug(officer?.name);
  if (!slug) return null;
  // Hero portraits ship as pre-downscaled 256px JPEGs (source FACE_*.jpg kept alongside).
  const ext = HERO_BASES.has(slug) ? 'jpg' : 'png';
  return `/avatars/${encodeURIComponent(slug)}.${ext}`;
}

export function isHeroOfficer(name) {
  return HERO_BASES.has(officerSlug(name));
}

/** Deterministic medallion hue from the officer's name. */
export function nameHue(name) {
  let h = 0;
  const s = officerSlug(name);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0) % 360;
}

/**
 * Round officer avatar: portrait image when present, else a generated
 * medallion (initials on a name-hued disc). Ring color = officer type
 * (gold Hero / silver Master). The <img> onerror registers the miss and
 * removes itself — initials underneath show through; nothing re-probes.
 */
export function avatarHtml(officer, px = 18) {
  const name = officer?.name ?? '?';
  const url = officerAvatarUrl(officer);
  const initials = esc(
    officerSlug(name).split(/[_\s-]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?',
  );
  const cls = isHeroOfficer(name) ? 'av-hero' : 'av-master';
  const img = url && !missingAvatars.has(url)
    ? `<img src="${url}" alt="" loading="lazy" onerror="this.dispatchEvent(new CustomEvent('avmiss',{bubbles:true}));this.remove()">`
    : '';
  return `<span class="avatar ${cls}" style="--av:${px}px;--avh:${nameHue(name)}" title="${esc(name)}"><i>${initials}</i>${img}</span>`;
}

/** One-time wiring: record 404'd avatar URLs so re-renders skip the <img> entirely. */
export function initAvatarMissTracking() {
  document.addEventListener('avmiss', (e) => {
    const src = e.target?.getAttribute?.('src');
    if (src) missingAvatars.add(src);
  });
}

/** Warm the browser cache for the always-present Hero portraits. */
export function preloadHeroAvatars() {
  for (const slug of HERO_BASES) {
    const url = officerAvatarUrl({ name: slug });
    const img = new Image();
    img.onerror = () => missingAvatars.add(url);
    img.src = url;
  }
}
