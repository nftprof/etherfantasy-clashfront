#!/usr/bin/env node
// D62 — the Living World atlas: one self-contained HTML page (docs/living-world/atlas/index.html) that DRAWS the
// seeded world per region: castles, every castle + estate POI coloured by kind (size by threat), harbours/ports, the
// sea lanes inside the region, and the region's season (threat-peak boss, Ascension nights). Generated from the
// committed data; deterministic (same data → same bytes). Inline SVG + a little JS; no external scripts.
import fs from "node:fs";
const rd = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const OUT = (() => { const i = process.argv.indexOf("--out"); return i > 0 ? process.argv[i + 1] : "docs/living-world/atlas/index.html"; })();
const CP = rd("data/living-world/castle-pois.json"), CC = rd("data/living-world/castle-context.json"), L = rd("data/living-world/sea-air-lanes.json");
const SB = rd("data/living-world/season-beats.json").cycles[0], TB = rd("data/living-world/threat-bosses.json").regions, EN = rd("data/living-world/i18n/en.json");
const ZR = rd("/home/user/cf-overworld/data/zone-registry.json").zones, ZN = Object.fromEntries(ZR.map((z) => [z.zoneId, z]));
const r1 = (x) => Math.round(x * 10) / 10;
const zones = {};
const Z = (z) => (zones[z] ||= { name: (ZN[z] && ZN[z].name) || z, layer: (ZN[z] && ZN[z].tier) || "", castles: [], pois: [], ports: [], lanes: [] });
for (const c of CC.castles) Z(c.zone).castles.push([c.name || c.id, c.kind, r1(c.at[0]), r1(c.at[1])]);
for (const c of CP.byCastle) for (const p of c.pois) Z(c.zone).pois.push([p.lwKind, r1(p.at[0]), r1(p.at[1]), p.threat, 1]);
for (const f of fs.readdirSync("data/living-world/estate-pois").sort()) { const E = rd("data/living-world/estate-pois/" + f); for (const p of E.parcels) for (const n of p.nodes) Z(E.zone).pois.push([n.k, r1(n.at[0]), r1(n.at[1]), n.threat, 0]); }
const portAt = Object.fromEntries(L.ports.map((p) => [p.id, p]));
for (const p of L.ports) Z(p.zone).ports.push([p.name || p.id, p.kind, r1(p.at[0]), r1(p.at[1])]);
for (const l of L.lanes) { const a = portAt[l.from], b = portAt[l.to]; if (l.mode === "SEA" && a.zone === b.zone) Z(a.zone).lanes.push([r1(a.at[0]), r1(a.at[1]), r1(b.at[0]), r1(b.at[1]), l.krakenRisk]); }
for (const [z, B] of Object.entries(SB)) if (zones[z]) { const peak = B.find((b) => b.beat === "THREAT_PEAK"); zones[z].season = { peakDay: peak ? peak.day + 1 : null, boss: TB[z] ? EN["boss." + TB[z].boss] : null, ascension: B.filter((b) => b.beat === "ASCENSION_NIGHT").map((b) => b.day + 1), storm: B.some((b) => b.beat === "STORM_FRONT") }; }
const order = Object.keys(zones).filter((z) => zones[z].pois.length).sort((a, b) => zones[b].pois.length - zones[a].pois.length);
const DATA = Object.fromEntries(order.map((z) => [z, zones[z]]));
const KINDS = ["WILD_LAIR", "AIRDROP_ZONE", "VENT", "AIRSHIP_DOCK", "MERCENARY_POST", "CARAVAN_WAYPOINT", "HARBOUR", "BARBARIAN_CAMP", "WAR_CAMP", "SALVAGE_SITE", "LANDING_SPOT", "GUARDIAN_PERCH"];
const total = order.reduce((n, z) => n + DATA[z].pois.length, 0);

const html = `<title>Living World Atlas</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral+SC:wght@500;700&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400&display=swap">
<style>
/* layout: a map-room sheet; region tabs on top, the chart left, the region's ledger right (stacks on phones) */
:root{
 --ground:#eef1f2; --sheet:#fbfcfc; --ink:#1d2a33; --muted:#5d6b75; --rule:#cfd8dd; --sea:#d6e6ef; --lane:#3f7fa6;
 --castle:#1d2a33; --focus:#b5532b;
 --k-lair:#7a5a3a; --k-drop:#c08a1e; --k-vent:#b5532b; --k-dock:#6a5fb0; --k-merc:#2f7d6d; --k-caravan:#8c7a4a;
 --k-harbour:#2b6f9e; --k-camp:#a23b3b; --k-war:#5b3a6e; --k-salvage:#4f7d8c; --k-landing:#7b8f2a; --k-perch:#d18a00;
 --display:"Spectral SC", Georgia, serif; --body:"IBM Plex Sans", system-ui, sans-serif; --mono:"IBM Plex Mono", ui-monospace, monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--ground:#11181d;--sheet:#172129;--ink:#e3eaee;--muted:#9aa9b3;--rule:#2b3a44;--sea:#1b3242;--lane:#7bb6da;--castle:#e3eaee;--focus:#e08a5f;color-scheme:dark}}
:root[data-theme="dark"]{--ground:#11181d;--sheet:#172129;--ink:#e3eaee;--muted:#9aa9b3;--rule:#2b3a44;--sea:#1b3242;--lane:#7bb6da;--castle:#e3eaee;--focus:#e08a5f;color-scheme:dark}
body{background:var(--ground);color:var(--ink);font:15px/1.5 var(--body);padding-inline:16px;padding-block:20px 32px}
.wrap{max-width:1180px;margin:0 auto;display:grid;gap:16px}
h1{font:700 1.9rem/1.1 var(--display);letter-spacing:.02em;margin:0;text-wrap:balance}
.lede{color:var(--muted);margin:0;max-width:68ch}
.tabs{display:flex;flex-wrap:wrap;gap:6px}
.tabs button{font:600 .82rem var(--body);letter-spacing:.04em;padding:6px 10px;border:1px solid var(--rule);background:var(--sheet);color:var(--ink);border-radius:4px;cursor:pointer}
.tabs button[aria-pressed="true"]{border-color:var(--ink);box-shadow:inset 0 -2px 0 var(--ink)}
.tabs button:focus-visible,.legend label:focus-within{outline:2px solid var(--focus);outline-offset:2px}
.main{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px}
@media (max-width:820px){.main{grid-template-columns:minmax(0,1fr)}}
.chart{background:var(--sheet);border:1px solid var(--rule);border-radius:6px;padding:8px;min-width:0}
.chart svg{width:100%;height:auto;display:block}
.ledger{display:grid;gap:12px;align-content:start;min-width:0}
.ledger h2{font:700 1.35rem var(--display);margin:0}
.meta{font:.78rem var(--mono);color:var(--muted);letter-spacing:.03em;text-transform:uppercase}
.season{border-top:1px solid var(--rule);padding-top:10px;display:grid;gap:4px}
.season b{font-weight:600}
.legend{display:grid;gap:4px;border-top:1px solid var(--rule);padding-top:10px}
.legend label{display:flex;align-items:center;gap:8px;font-size:.86rem;cursor:pointer}
.legend .n{margin-left:auto;font:.78rem var(--mono);color:var(--muted);font-variant-numeric:tabular-nums}
.sw{width:10px;height:10px;border-radius:50%;flex:none}
.note{font-size:.8rem;color:var(--muted)}
@media (prefers-reduced-motion:no-preference){.chart circle{transition:opacity .2s}}
</style>
<div class="wrap">
 <header style="display:grid;gap:6px">
  <span class="meta">Clash Front · seeded living world · ${total.toLocaleString("en")} castle + estate POIs across ${order.length} regions</span>
  <h1>Living World Atlas</h1>
  <p class="lede">Every point is a seeded POI. Size shows its threat; filled dots are castle POIs, rings are estate POIs. Lines are the region's sea lanes, darker where the Kraken is likelier. Pick a region, and switch kinds on or off in the ledger.</p>
 </header>
 <nav class="tabs" id="tabs" aria-label="Regions"></nav>
 <section class="main">
  <div class="chart"><svg id="map" role="img" aria-label="Region map"></svg></div>
  <aside class="ledger" id="ledger"></aside>
 </section>
 <p class="note">Generated by tools/living-world/atlas.mjs from the committed seeds (castle-pois, estate-pois, sea-air-lanes, season-beats, threat-bosses). Single parcels (24,646 lazily seeded POIs) are not drawn.</p>
</div>
<script>
const DATA=${JSON.stringify(DATA)};
const KINDS=${JSON.stringify(KINDS)};
const VAR={WILD_LAIR:"--k-lair",AIRDROP_ZONE:"--k-drop",VENT:"--k-vent",AIRSHIP_DOCK:"--k-dock",MERCENARY_POST:"--k-merc",CARAVAN_WAYPOINT:"--k-caravan",HARBOUR:"--k-harbour",BARBARIAN_CAMP:"--k-camp",WAR_CAMP:"--k-war",SALVAGE_SITE:"--k-salvage",LANDING_SPOT:"--k-landing",GUARDIAN_PERCH:"--k-perch"};
const LABEL=k=>k.toLowerCase().replace(/_/g," ").replace(/^./,c=>c.toUpperCase());
const off=new Set();let zone=Object.keys(DATA)[0];
try{const h=location.hash.slice(1);if(DATA[h])zone=h}catch(e){}
const NS="http://www.w3.org/2000/svg",el=(t,a)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e};
function draw(){
 const Z=DATA[zone],svg=document.getElementById("map");svg.textContent="";
 const pts=[...Z.pois.map(p=>[p[1],p[2]]),...Z.castles.map(c=>[c[2],c[3]]),...Z.ports.map(p=>[p[2],p[3]])];
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),pad=8,x0=Math.min(...xs)-pad,y0=Math.min(...ys)-pad,w=Math.max(...xs)-x0+pad,h=Math.max(...ys)-y0+pad;
 svg.setAttribute("viewBox",x0+" "+y0+" "+w+" "+h);svg.setAttribute("aria-label",Z.name+" region map");
 const u=Math.max(w,h)/400;
 svg.appendChild(el("rect",{x:x0,y:y0,width:w,height:h,fill:"var(--sea)",opacity:".35"}));
 for(const l of Z.lanes)svg.appendChild(el("line",{x1:l[0],y1:l[1],x2:l[2],y2:l[3],stroke:"var(--lane)","stroke-width":u*(1+l[4]*6),"stroke-opacity":.35+l[4]*2,"stroke-dasharray":u*4+" "+u*3}));
 const g=el("g",{});svg.appendChild(g);
 for(const p of Z.pois){if(off.has(p[0]))continue;const r=u*(1.4+p[3]/14),c=el("circle",{cx:p[1],cy:p[2],r,fill:p[4]?"var("+VAR[p[0]]+")":"none",stroke:"var("+VAR[p[0]]+")","stroke-width":u*.9,opacity:p[4]?.95:.75});const t=el("title",{});t.textContent=LABEL(p[0])+", threat "+p[3]+(p[4]?" (castle)":" (estate)");c.appendChild(t);g.appendChild(c)}
 for(const p of Z.ports){const s=el("rect",{x:p[2]-u*2.5,y:p[3]-u*2.5,width:u*5,height:u*5,fill:"var(--lane)",transform:"rotate(45 "+p[2]+" "+p[3]+")"});const t=el("title",{});t.textContent=(p[0]||"Port")+" ("+p[1].toLowerCase().replace(/_/g," ")+")";s.appendChild(t);svg.appendChild(s)}
 for(const c of Z.castles){const s=el("path",{d:"M"+(c[2]-u*4)+" "+(c[3]+u*3)+"h"+u*8+"v"+(-u*5)+"l"+(-u*2)+" "+(-u*2)+"l"+(-u*2)+" "+u*2+"l"+(-u*2)+" "+(-u*2)+"l"+(-u*2)+" "+u*2+"z",fill:"var(--castle)"});const t=el("title",{});t.textContent=c[0]+" ("+c[1].toLowerCase()+")";s.appendChild(t);svg.appendChild(s)}
 ledger();
}
function ledger(){
 const Z=DATA[zone],n={};for(const p of Z.pois)n[p[0]]=(n[p[0]]||0)+1;
 const S=Z.season||{};
 const L=document.getElementById("ledger");
 const pl=(n,w)=>n.toLocaleString("en")+" "+w+(n===1?"":"s");
 L.innerHTML='<div><span class="meta">'+zone+" · "+Z.layer+'</span><h2></h2></div><div class="meta">'+pl(Z.castles.length,"castle")+" · "+pl(Z.pois.length,"POI")+" · "+pl(Z.ports.length,"port")+" · "+pl(Z.lanes.length,"sea lane")+'</div><div class="season"><span class="meta">Season (28-day cycle)</span><span>Threat peak: day '+(S.peakDay||"–")+(S.boss?", <b></b>":"")+"</span><span>Ascension nights: days "+((S.ascension||[]).join(", ")||"–")+"</span>"+(S.storm?"<span>Storm front: day 22</span>":"")+'</div><fieldset class="legend" style="border:0;margin:0;padding:10px 0 0"><legend class="meta" style="padding:0">POI kinds</legend></fieldset>';
 L.querySelector("h2").textContent=Z.name;if(S.boss)L.querySelector(".season b").textContent=S.boss;
 const F=L.querySelector(".legend");
 for(const k of KINDS){if(!n[k])continue;const id="k-"+k;const lab=document.createElement("label");lab.innerHTML='<input type="checkbox" id="'+id+'"'+(off.has(k)?"":" checked")+'><span class="sw" style="background:var('+VAR[k]+')"></span><span></span><span class="n">'+n[k]+"</span>";lab.children[2].textContent=LABEL(k);lab.querySelector("input").addEventListener("change",e=>{e.target.checked?off.delete(k):off.add(k);draw()});F.appendChild(lab)}
}
const tabs=document.getElementById("tabs");
for(const z of Object.keys(DATA)){const b=document.createElement("button");b.type="button";b.textContent=DATA[z].name;b.dataset.z=z;b.addEventListener("click",()=>{zone=z;try{history.replaceState(null,"","#"+z)}catch(e){}sync();draw()});tabs.appendChild(b)}
function sync(){for(const b of tabs.children)b.setAttribute("aria-pressed",b.dataset.z===zone?"true":"false")}
sync();draw();
</script>
`;
fs.mkdirSync("docs/living-world/atlas", { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`atlas: ${order.length} regions, ${total} POIs → ${OUT} (${Math.round(html.length / 1024)} KB)`);
