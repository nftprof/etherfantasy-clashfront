// Authoritative shop/items. Mirrors the client ITEMS table + applyItem/build-path
// logic (index.html), operating on the pure-data hero. Gold is server-held, so the
// shop can't be cheated. ⚠ KEEP IN SYNC with the client ITEMS list.
import { dist } from "./state.js";

export const ITEMS = [
  { n: "⚔ Long Sword", g: 300, dmg: 12 },
  { n: "🪓 War Axe", g: 700, dmg: 30, from: "⚔ Long Sword" },
  { n: "🦺 Guard Vest", g: 300, hp: 160 },
  { n: "🛡 Tower Plate", g: 750, hp: 420, from: "🦺 Guard Vest" },
  { n: "👢 Swift Boots", g: 250, ms: 2.5 },
  { n: "🧤 Frenzy Gloves", g: 500, as: 0.25 },
  { n: "🔮 Ether Orb", g: 400, mp: 110 },
  { n: "🗡 Ether Fang", g: 1300, dmg: 34, as: 0.2, from: "🪓 War Axe" },
];
export const MAXITEMS = 6;

function applyItem(h, it) {
  if (it.dmg) h.dmg += it.dmg;
  if (it.hp) { h.maxHp += it.hp; h.hp += it.hp; }
  if (it.ms) h.speed += it.ms;                         // move-speed bonus → hero.speed
  if (it.as) h.atkSpd = +(h.atkSpd + it.as).toFixed(2);
  if (it.mp) { h.maxMp += it.mp; h.mp += it.mp; }
}
function removeItem(h, it) {
  if (it.dmg) h.dmg -= it.dmg;
  if (it.hp) { h.maxHp -= it.hp; h.hp = Math.min(h.hp, h.maxHp); }
  if (it.ms) h.speed -= it.ms;
  if (it.as) h.atkSpd = +(h.atkSpd - it.as).toFixed(2);
  if (it.mp) { h.maxMp -= it.mp; h.mp = Math.min(h.mp, h.maxMp); }
}
function findComp(h, it) {
  if (!it.from) return -1;
  const its = h.items || [];
  for (let i = 0; i < its.length; i++) if (its[i].n === it.from) return i;
  return -1;
}
function itemCost(it, hasComp) {
  if (!hasComp || !it.from) return it.g;
  const c = ITEMS.find((x) => x.n === it.from);
  return Math.max(0, it.g - (c ? c.g : 0)); // build-path discount: component is consumed
}

// server-side purchase: gold-gated, must be near own base, honors build paths + slot cap
export function buyItem(world, h, i) {
  if (!h || h.kind !== "hero" || h.state === "dead") return false;
  const it = ITEMS[i]; if (!it) return false;
  const sp = world.spawn[h.team];
  if (sp && dist(h, sp) > 22) return false;             // only shoppable near base/fountain
  h.items = h.items || [];
  const ci = findComp(h, it), cost = itemCost(it, ci >= 0);
  if (h.gold < cost) return false;
  if (ci < 0 && h.items.length >= MAXITEMS) return false;
  h.gold -= cost;
  if (ci >= 0) { removeItem(h, h.items[ci]); h.items.splice(ci, 1); } // upgrade consumes component
  h.items.push(it); applyItem(h, it);
  return true;
}
