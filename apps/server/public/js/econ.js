/**
 * 💰 Economy dashboard (FS3) — the circular-economy telemetry window over
 * GET /api/economy. One modal, two audiences: players hunting the gold rush
 * (warzone loot heat → click to fly there) and the balance team reading
 * supply/flows ("cannot tune what it cannot see").
 *
 * Refreshes on open + every 30 s while open (the server caches the payload
 * 10 s); the fetched payload is also stashed on store.econ so the enrich/raze
 * previews read live ⚙ shares instead of their balance mirrors.
 */
import { api } from './net.js';
import { esc, fmtCT } from './util.js';

const REFRESH_MS = 30_000;

/** Supply components in bar order — keys of eco.supply. Together they sum to `minted` (E5 identity). */
const SEGS = [
  { key: 'wallets', label: 'Wallets', color: '#4f8fe8' },
  { key: 'territoryTreasuries', label: 'Territory treasuries', color: '#58b06b' },
  { key: 'enrichmentPools', label: 'Enrichment pools', color: '#d9a441' },
  { key: 'unclaimedLordYield', label: 'Unclaimed lord yield', color: '#9a7fd1' },
  { key: 'treasury', label: 'System treasury', color: '#7d8a99' },
  { key: 'burned', label: 'Burned', color: '#e0483c' },
];

/** ledger reason → human label (unknown reasons fall back to prettified snake_case). */
const REASONS = {
  raise_training: '⚔ Army training',
  raise_provisions: '🍞 Raise provisions',
  provision: '🛒 Provisions',
  develop: '🏗 Development',
  enrich: '✨ Enrichment',
  claim: '🏳 Land claims',
  repair: '🔧 Repairs',
};
const reasonLabel = (r) => REASONS[r] ?? esc(r.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));

export function createEcon({ store, map, ui }) {
  const el = document.createElement('div');
  el.id = 'econ';
  el.hidden = true;
  document.body.appendChild(el);

  let timer = null;
  let lastEco = null;

  async function refresh() {
    try {
      lastEco = await api('/api/economy');
      store.econ = lastEco; // live ⚙ shares for the enrich/raze previews
      render();
    } catch (e) {
      el.innerHTML = boxOpen() + `<div class="eco-err">Economy telemetry unreachable — ${esc(e.message)}</div></div>`;
    }
  }

  const boxOpen = () =>
    `<div class="eco-box"><button class="close" data-eco="close">✕</button><h2>💰 War economy</h2>`;

  function render() {
    const eco = lastEco;
    if (!eco || el.hidden) return;
    const s = eco.supply;
    const minted = Math.max(1, s.minted);
    const pct = (v) => (100 * v) / minted;
    const pctTxt = (v) => `${pct(v) < 9.95 ? pct(v).toFixed(1) : Math.round(pct(v))}%`;

    // supply identity — stacked bar + legend (segments sum exactly to minted)
    let html = boxOpen() +
      `<p class="sub">tick <b class="num">${eco.tick.toLocaleString('en-US')}</b> · minted <b class="num">${fmtCT(s.minted)}</b>` +
      ` · circulating <b class="num">${fmtCT(s.circulating)}</b> · burned <b class="num">${fmtCT(s.burned)}</b> (${pctTxt(s.burned)})</p>` +
      `<div class="eco-scroll">` +
      `<h3>Supply — where every minted CT sits</h3><div class="eco-bar">` +
      SEGS.map((g) => `<span style="width:${pct(s[g.key] ?? 0)}%;background:${g.color}" title="${g.label}"></span>`).join('') +
      `</div>` +
      SEGS.map((g) =>
        `<div class="eco-row"><span class="dot" style="background:${g.color}"></span>` +
        `<span class="grow">${g.label}</span><span class="num">${fmtCT(s[g.key] ?? 0)}</span>` +
        `<span class="num dim">${pctTxt(s[g.key] ?? 0)}</span></div>`).join('');

    // flows by reason — top 6 sinks through the splitter, all-time volume
    const flows = Object.entries(eco.flowsByReason ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const fmax = Math.max(1, ...flows.map(([, v]) => v));
    html += `<h3>Spend flows by reason</h3>` + (flows.length === 0
      ? `<div class="eco-empty">No spends yet — the war chest is unopened.</div>`
      : flows.map(([r, v]) =>
        `<div class="eco-row"><span class="grow">${reasonLabel(r)}</span>` +
        `<span class="fbar"><span style="width:${Math.max(2, (100 * v) / fmax)}%"></span></span>` +
        `<span class="num">${fmtCT(v)}</span></div>`).join(''));

    // warzone heat — LOOT-bucket inflow per parcel over the rolling window; the gold rush finder
    const hot = (eco.topParcelsByLootInflow ?? []).slice(0, 8);
    html += `<h3>Warzone heat — loot inflow, last ${Math.round((eco.lootWindowTicks * (store.meta.tickMs || 5000)) / 60_000)} min <span class="dim">(click to fly there)</span></h3>` +
      (hot.length === 0
        ? `<div class="eco-empty">No loot flowing — too quiet. Start a war.</div>`
        : hot.map((p, i) => {
          const t = store.terrByParcel.get(p.parcelId);
          const owner = t && t.governorKind !== 'SYSTEM' ? esc(store.playerName(t.governorId)) : 'wild';
          return `<div class="eco-row hot" data-parcel="${p.parcelId}"><span class="rank">${i + 1}</span>` +
            `<span class="grow">${esc(t?.name ?? p.parcelId)} <span class="dim">· ${owner}</span></span>` +
            `<span class="num gold">${fmtCT(p.lootCtUnits)}</span></div>`;
        }).join(''));

    // settlement journal — head + last-24h totals by kind
    const kinds = Object.entries(eco.journal?.last24hByKind ?? {}).sort((a, b) => b[1] - a[1]);
    html += `<h3>Settlement journal</h3>` +
      `<div class="eco-row"><span class="grow">Head seq</span><span class="num">${eco.journal.headSeq.toLocaleString('en-US')}</span></div>` +
      `<div class="eco-row"><span class="grow">Checksum</span><span class="num dim">${esc(String(eco.journal.checksum).slice(0, 16))}…</span></div>` +
      (kinds.length
        ? `<div class="eco-kinds">${kinds.map(([k, v]) => `<span class="chip">${esc(k)} <b class="num">${fmtCT(v)}</b></span>`).join('')}</div>`
        : `<div class="eco-empty">No journal entries in the last day.</div>`) +
      `</div></div>`;
    el.innerHTML = html;
  }

  function open() {
    el.hidden = false;
    el.innerHTML = boxOpen() + `<div class="eco-empty">Fetching the ledgers…</div></div>`;
    refresh();
    clearInterval(timer);
    timer = setInterval(refresh, REFRESH_MS);
  }
  function close() {
    el.hidden = true;
    clearInterval(timer);
    timer = null;
  }
  function toggle() { el.hidden ? open() : close(); }

  el.addEventListener('click', (e) => {
    if (e.target === el) { close(); return; } // backdrop
    if (e.target.closest('[data-eco="close"]')) { close(); return; }
    const row = e.target.closest('[data-parcel]');
    if (row) { // gold rush: fly to the warzone
      close();
      map.gotoParcel(row.dataset.parcel);
      map.pulseAt(row.dataset.parcel, '#d9a441');
      ui.openCard(row.dataset.parcel);
    }
  });

  return { open, close, toggle, refresh };
}
