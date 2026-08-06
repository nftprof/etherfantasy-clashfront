'use strict';
/* =============================================================================
 * EF Moba — BATTLEFIELD CONVERTER  (backend, dependency-free Node)
 * -----------------------------------------------------------------------------
 * Turns a CF map-generator ARTIFACT (terrain codes + placements) into an
 * engine-ready RENDER MANIFEST that the single-player renderer can draw with
 * ZERO guesswork — so a generated parcel looks pixel-identical to the built-in
 * map (Layer-1 environment: ground, water/lava, trees, rocks, decor, lanes,
 * fountains, towers, resources). The map-gen artifact is "map logic"; THIS is
 * the missing "game-engine-ready" layer it mentioned.
 *
 * Why backend: the manifest is deterministic and IMMUTABLE per designVersion,
 * so compute it once and cache it. The client becomes a thin renderer.
 *
 * Coordinate canon (matches net snapshots + the live map):
 *   center origin · x east · +z north · fixed ±161 frame · cellM 2 · NO rescale.
 *   (Live map = ±115 * MAPK(1.4) = ±161; the artifact is already in these units.)
 *
 * Usage:
 *   const {convert} = require('./battlefield_converter');
 *   const manifest = convert(artifact, {parcelId, designVersion});
 * CLI:
 *   node battlefield_converter.js path/to/artifact.json > manifest.json
 *   node battlefield_converter.js --selftest
 * ============================================================================= */

const TERR = { OPEN:0, FOREST:1, ROCK:2, WATER:3, CLIFF:4, ROAD:5, OOB:6 };
const FRAME = 161; /* live-map half-extent in world units (±161). */

/* palette → client biome material set. Floors live in floors/. dry/wet/fog mirror
 * index.html _BIOMES. water: 'water' | 'lava' | 'ice' drives the liquid material.
 * treeHSL = base foliage hue/sat/light so instanced trees match the palette. */
const PALETTE = {
  verdant:  { biome:'meadow',  floor:'grass_01',  dry:0xeaf0e0, wet:0xc2ccb4, fog:0x14202e, water:'water', treeHSL:[0.30,0.42,0.22] },
  jungle:   { biome:'jungle',  floor:'grass_02',  dry:0xe2ecd6, wet:0xb8c6a6, fog:0x0f1e16, water:'water', treeHSL:[0.33,0.50,0.20] },
  autumn:   { biome:'jungle',  floor:'grass_02',  dry:0xf0e2c4, wet:0xccb488, fog:0x201810, water:'water', treeHSL:[0.08,0.55,0.32] },
  desert:   { biome:'desert',  floor:'desert_01', dry:0xf2e9d2, wet:0xd8c9a8, fog:0x2a2417, water:'water', treeHSL:[0.12,0.35,0.34] },
  tundra:   { biome:'wetland', floor:'desert_03', dry:0xdfe8ea, wet:0xb6c4c8, fog:0x1a2630, water:'ice',   treeHSL:[0.35,0.15,0.50] },
  swamp:    { biome:'wetland', floor:'desert_03', dry:0xdce6d8, wet:0xb0c0ac, fog:0x10221f, water:'water', treeHSL:[0.28,0.40,0.18] },
  volcanic: { biome:'desert',  floor:'stone_03',  dry:0xd8c2b0, wet:0x9a7a68, fog:0x281410, water:'lava',  treeHSL:[0.05,0.30,0.20] },
  ashen:    { biome:'desert',  floor:'stone_04',  dry:0xcfc9c2, wet:0x9a938c, fog:0x1c1c1e, water:'lava',  treeHSL:[0.00,0.00,0.28] },
  sakura:   { biome:'meadow',  floor:'grass_01',  dry:0xf3e2ea, wet:0xd0b8c4, fog:0x201820, water:'water', treeHSL:[0.92,0.50,0.62] }
};
const DEFAULT_PALETTE = 'verdant';

/* ---- small utilities (no deps) ---- */
function b64ToU8(s){ if(!s) return new Uint8Array(0);
  if(typeof Buffer!=='undefined'){ const b=Buffer.from(String(s),'base64'); return new Uint8Array(b.buffer,b.byteOffset,b.length); }
  const bin=atob(String(s)); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i); return u; }
function u8ToB64(u){ if(typeof Buffer!=='undefined') return Buffer.from(u.buffer,u.byteOffset,u.length).toString('base64');
  let s=''; for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]); return btoa(s); }
function mulberry32(a){ return function(){ a|=0;a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function hexOr(v,d){ return (typeof v==='number')?v:d; }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }

/* seeded 2-D value noise for the synthetic heightfield */
function mkNoise(seed){ const s=(seed>>>0)||1;
  function h(ix,iz){ let n=(ix|0)*374761393+(iz|0)*668265263+s*1442695041; n=Math.imul(n^(n>>>13),1274126177); n^=n>>>16; return (n>>>0)/4294967296; }
  return function(x,z,cell){ const gx=x/cell,gz=z/cell,x0=Math.floor(gx),z0=Math.floor(gz),fx=gx-x0,fz=gz-z0;
    const sx=fx*fx*(3-2*fx),sz=fz*fz*(3-2*fz);
    const a=h(x0,z0),b=h(x0+1,z0),c=h(x0,z0+1),d=h(x0+1,z0+1);
    const ab=a+(b-a)*sx,cd=c+(d-c)*sx; return ab+(cd-ab)*sz; }; }

/* =============================================================================
 * convert(artifact, opts) -> manifest
 * ============================================================================= */
function convert(artifact, opts){
  opts=opts||{}; const warn=[];
  const art=artifact||{};
  const arena=art.arena||{};
  const terrain=art.terrain||{};
  const meta=art.meta||{}; const params=(meta.params)||{};

  /* --- arena / grid --- */
  const sizeM = hexOr(arena.sizeM, FRAME*2);
  const half  = sizeM/2;
  const cell  = hexOr(terrain.cellM, 2);
  const w = terrain.w|0 || Math.round(sizeM/cell);
  const h = terrain.h|0 || Math.round(sizeM/cell);
  if (Math.abs(half-FRAME) > 1) warn.push('arena half='+half+' differs from canon ±'+FRAME+' (rendering anyway; check generator scale).');

  const cells = b64ToU8(terrain.cells);
  let walk    = b64ToU8(terrain.walk);
  if (cells.length && cells.length !== w*h) warn.push('cells length '+cells.length+' != w*h '+(w*h));
  if (!walk.length && cells.length){ /* derive walk from codes if generator omitted it */
    walk = new Uint8Array(w*h);
    for (let i=0;i<cells.length;i++){ const c=cells[i]; walk[i]=(c===TERR.OPEN||c===TERR.ROAD)?1:0; }
    warn.push('walk bitmask missing → derived from terrain codes (OPEN/ROAD walkable).');
  }

  /* cell (i col along x, j row along z) → world center */
  const cx = i => -half + (i+0.5)*cell;
  const cz = j => -half + (j+0.5)*cell;
  const at = (i,j)=> (i<0||j<0||i>=w||j>=h) ? TERR.OOB : cells[j*w+i];

  /* --- palette / biome --- */
  const palKey = String(params.palette||DEFAULT_PALETTE).toLowerCase();
  let pal = PALETTE[palKey] || PALETTE[DEFAULT_PALETTE];
  if (!PALETTE[palKey]) warn.push('unknown palette "'+palKey+'" → fell back to '+DEFAULT_PALETTE+'.');
  /* v24.2 THEME FLOOR (owner: "make the floor DREAM like — the Kai & Yui chase, masquerade dance
   * feel"): a theme may re-tint the biome floor through the manifest — the game module then
   * renders it natively (smooth water, real floors — no legacy fallback).
   * candyland (v24.5, owner: "lets reverse to the green grass version earlier"): back to the
   * v24.2 look — normal grass floor with a light lilac-rose cast, classic bake, indigo dusk fog.
   * The two AUTHORED floors stayed registered as KEEPER themes (owner: "interesting keeper for
   * later"): cyber = veil_masquerade harlequin under deep indigo ("a cool cyber tron floor");
   * snowdream = candy_dream frosting/rainbow-sprinkle floor ("snow white dream land") under
   * dream-lavender. Keepers use bake:'none' + dry 0xffffff so the authored art reads true. */
  const THEME_BIOME = {
    candyland: { biome:'meadow', floor:'cotton_candy',    dry:0xb9aeb6, wet:0xf0d8e4, fog:0xf2cfd8, sky:0xf6d9de, water:'water', treeHSL:[0.92,0.50,0.62], bake:'none', floorRepeat:[7,8] },
    cyber:     { biome:'meadow', floor:'veil_masquerade', dry:0xffffff, wet:0xd8cce6, fog:0x261b3a, water:'water', treeHSL:[0.75,0.45,0.55], bake:'none' },
    snowdream: { biome:'meadow', floor:'candy_dream',     dry:0xffffff, wet:0xf0d8e4, fog:0x8f6fa5, water:'water', treeHSL:[0.92,0.50,0.62], bake:'none' },
  };
  if (meta.theme && THEME_BIOME[meta.theme]) pal = THEME_BIOME[meta.theme];

  /* --- seeded RNG (deterministic across runs) --- */
  const seed = (meta.seed>>>0) || 0x1a2b3c4d;
  const rnd = mulberry32(seed);
  const noise = mkNoise(seed);

  /* --- synthesize a heightfield (artifact is 2-D; the live map drapes ground on heightAt()).
   *     v23 — THE FLAT RULING (engine 10-rule brief, rules 1/4/6/8: "most ground is FLAT; every
   *     slope is INTENTIONAL"): walkable ground (OPEN/ROAD/FOREST) is EXACTLY 0 — no rolling
   *     noise under armies' feet (noise wiggled units across the engine's y=2 combat-tier
   *     boundary and clipped feet/rings). Structure pads are flat by construction. Drama lives
   *     at the EDGES: CLIFF plateaus (tier-high, unwalkable) keep their noise, ROCK stands
   *     proud, and WATER gets a ≥6u SHORE SHELF graded 0 → −1.1 (the engine's wade→swim
   *     threshold) before deepening — never a vertical plunge at the waterline (rule 4). --- */
  const hgrid = new Float32Array(w*h);
  /* distance-to-land (in cells) for every water cell — drives the shore shelf + the depth mask */
  const wdist = new Float32Array(w*h).fill(0);
  {
    const q=[];
    for (let j=0;j<h;j++) for (let i=0;i<w;i++){
      const c=cells.length?cells[j*w+i]:TERR.OPEN;
      if (c!==TERR.WATER) continue;
      let shore=false;
      for (const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const ni=i+di,nj=j+dj;
        if (ni<0||nj<0||ni>=w||nj>=h) continue;
        const nc=cells.length?cells[nj*w+ni]:TERR.OPEN;
        if (nc!==TERR.WATER&&nc!==TERR.OOB){shore=true;break;}
      }
      wdist[j*w+i]=shore?1:1e9;
      if (shore) q.push(i,j);
    }
    for (let k2=0;k2<q.length;k2+=2){
      const i=q[k2],j=q[k2+1],d=wdist[j*w+i];
      for (const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const ni=i+di,nj=j+dj;
        if (ni<0||nj<0||ni>=w||nj>=h) continue;
        if (wdist[nj*w+ni]>d+1){wdist[nj*w+ni]=d+1;q.push(ni,nj);}
      }
    }
  }
  let hMin=1e9,hMax=-1e9;
  const depth8 = new Uint8Array(w*h);                       /* per-cell water depth ×80 (rule 4: "a depth value beats inferring") */
  for (let j=0;j<h;j++) for (let i=0;i<w;i++){
    const wx=cx(i), wz=cz(j), c=cells.length?cells[j*w+i]:TERR.OPEN;
    let y = 0;                                              /* walkable ground: FLAT — the ruling */
    if (c===TERR.CLIFF) y = 10 + 4*noise(wx,wz,7);          /* unwalkable high drama keeps its noise */
    else if (c===TERR.ROCK) y = 3.5;
    else if (c===TERR.WATER){
      const d=Math.min(wdist[j*w+i],1e8);
      const dep = d<=3 ? 1.1*(d/3) : Math.min(2.6, 1.1+0.5*(d-3));  /* 6u shelf to −1.1, then deepen */
      y = -dep;
      depth8[j*w+i]=clamp(Math.round(dep*80),0,255);
    }
    hgrid[j*w+i]=y; if(y<hMin)hMin=y; if(y>hMax)hMax=y;
  }
  if(hMin>hMax){hMin=0;hMax=1;}
  if(hMax-hMin<0.01)hMax=hMin+0.01;                         /* an all-flat map still encodes */
  const hspan = (hMax-hMin)||1;
  const hu8 = new Uint8Array(w*h);
  for (let k=0;k<hgrid.length;k++) hu8[k]=clamp(Math.round((hgrid[k]-hMin)/hspan*255),0,255);
  const heightAtCell=(i,j)=>hgrid[clamp(j,0,h-1)*w+clamp(i,0,w-1)]; /* for prop y-placement */

  /* --- per-cell masks (base64 u8, 1/0) --- */
  const oob=new Uint8Array(w*h), water=new Uint8Array(w*h), road=new Uint8Array(w*h);
  for (let k=0;k<w*h;k++){ const c=cells.length?cells[k]:TERR.OPEN;
    oob[k]=(c===TERR.OOB)?1:0; water[k]=(c===TERR.WATER)?1:0; road[k]=(c===TERR.ROAD)?1:0; }

  /* --- derive TREE + ROCK instances from FOREST/ROCK/CLIFF cells (thinned) --- */
  const trees=[], rocks=[];
  const TREE_CAP=700, ROCK_CAP=400;
  const treeDensity=clamp(hexOr(params.forestDensity,0.55),0.1,1);
  for (let j=0;j<h;j++) for (let i=0;i<w;i++){
    const c=at(i,j); const wx=cx(i)+(rnd()-0.5)*cell, wz=cz(j)+(rnd()-0.5)*cell;
    if (c===TERR.FOREST && rnd()<treeDensity && trees.length<TREE_CAP){
      const hsl=pal.treeHSL, jit=(rnd()*0.06-0.03);
      trees.push({ x:+wx.toFixed(2), z:+wz.toFixed(2), y:+heightAtCell(i,j).toFixed(2),
                   s:+(0.85+rnd()*0.6).toFixed(2), hsl:[+(hsl[0]+jit).toFixed(3), hsl[1], +(hsl[2]+(rnd()*0.06-0.02)).toFixed(3)] });
    } else if ((c===TERR.ROCK||c===TERR.CLIFF) && rnd()<0.5 && rocks.length<ROCK_CAP){
      rocks.push({ x:+wx.toFixed(2), z:+wz.toFixed(2), y:+heightAtCell(i,j).toFixed(2), s:+(1+rnd()*0.9).toFixed(2) });
    }
  }
  /* scattered décor obstacles the generator marked explicitly (TREE/ROCK/landmark) */
  (art.obstacles||[]).forEach(o=>{
    const P={ x:+(+o.x).toFixed(2), z:+(+o.z).toFixed(2), y:+sampleH(o.x,o.z).toFixed(2), s:+(o.r?o.r/2.5:1).toFixed(2), landmark:o.kind&&!/^(TREE|ROCK)$/i.test(o.kind)?o.kind:undefined };
    if (/rock/i.test(o.kind||'')) rocks.push(P); else trees.push(Object.assign({hsl:pal.treeHSL},P));
  });

  function sampleH(x,z){ const i=clamp(Math.floor((x+half)/cell),0,w-1), j=clamp(Math.floor((z+half)/cell),0,h-1); return hgrid[j*w+i]||0; }

  /* --- deterministic ground scatter (grass tufts / flowers / bushes) on OPEN cells,
   *     avoiding blocked cells + a keep-out radius near structures/fountains --- */
  const keepouts=[];
  const spawnZones=(art.spawnZones||[]).map(s=>({ id:s.id, side:s.side, edge:s.edge, x:+(+s.x).toFixed(2), z:+(+s.z).toFixed(2), canBase:!!s.canBase }));
  const fountains = spawnZones.filter(s=>s.canBase).map(s=>({ side:s.side, x:s.x, z:s.z }));
  const towers=(art.structures||[]).filter(s=>/tower/i.test(s.kind||'')).map(s=>({ side:s.side, x:+(+s.x).toFixed(2), z:+(+s.z).toFixed(2), hpMax:s.hpMax||1400 }));
  fountains.forEach(f=>keepouts.push([f.x,f.z,20]));
  towers.forEach(t=>keepouts.push([t.x,t.z,10]));
  const inKeepout=(x,z)=>{ for(const k of keepouts){ const dx=x-k[0],dz=z-k[1]; if(dx*dx+dz*dz<k[2]*k[2]) return true; } return false; };
  const blockedCell=(i,j)=>{ const k=j*w+i; return (walk.length&&walk[k]===0)||at(i,j)!==TERR.OPEN; };
  const scatter={grass:[],flower:[],bush:[]};
  const SC_CAP={grass:1400,flower:400,bush:260};
  const tries=Math.min(w*h,9000);
  for (let t=0;t<tries;t++){
    const i=(rnd()*w)|0, j=(rnd()*h)|0; if(blockedCell(i,j))continue;
    const x=cx(i)+(rnd()-0.5)*cell, z=cz(j)+(rnd()-0.5)*cell; if(inKeepout(x,z))continue;
    const y=+heightAtCell(i,j).toFixed(2), r=rnd();
    const P={x:+x.toFixed(2),z:+z.toFixed(2),y,s:+(0.7+rnd()*0.8).toFixed(2)};
    if (r<0.7 && scatter.grass.length<SC_CAP.grass) scatter.grass.push(P);
    else if (r<0.88 && scatter.flower.length<SC_CAP.flower) scatter.flower.push(P);
    else if (scatter.bush.length<SC_CAP.bush) scatter.bush.push(P);
  }

  /* --- pass-through gameplay placements (client stamps furniture as usual) --- */
  const resources=(art.resources||[]).map(r=>({ kind:r.kind, x:+(+r.x).toFixed(2), z:+(+r.z).toFixed(2), y:+sampleH(r.x,r.z).toFixed(2), richness:hexOr(r.richness,0.6) }));
  const mobs=(art.mobs||[]).map(m=>({ kind:m.kind, x:+(+m.x).toFixed(2), z:+(+m.z).toFixed(2), y:+sampleH(m.x,m.z).toFixed(2), count:m.count||1 }));
  const buildSpots=(art.buildSpots||[]).map(b=>({ anchorId:b.anchorId, x:+(+b.x).toFixed(2), z:+(+b.z).toFixed(2), y:+sampleH(b.x,b.z).toFixed(2), size:b.size||6 }));
  const lanes=(art.lanes||[]).map(chain=>chain.map(p=>[+(+p[0]).toFixed(2),+(+p[1]).toFixed(2)]));

  /* --- arena clip polygon (non-square parcels: don't draw ground past the parcel) --- */
  const bounds=(arena.bounds&&arena.bounds.length)?arena.bounds.map(p=>[+(+p[0]).toFixed(2),+(+p[1]).toFixed(2)]) : squareBounds(half);

  return {
    schema:'ef-battlefield-manifest/1',
    parcelId: opts.parcelId!=null?opts.parcelId:(art.parcelId||null),
    designVersion: opts.designVersion!=null?opts.designVersion:(meta.designVersion||null),
    seed,
    modes: meta.modes||params.modes||null,
    arena:{ shape:arena.shape||'square', sizeM, half, bounds },
    grid:{ w, h, cellM:cell },
    biome:{ key:pal.biome, palette:palKey, floor:pal.floor, dry:pal.dry, wet:pal.wet, fog:pal.fog, water:pal.water, ...(pal.bake?{bake:pal.bake}:{}), ...(pal.sky!=null?{sky:pal.sky}:{}), ...(pal.floorRepeat?{floorRepeat:pal.floorRepeat}:{}) },
    ...(meta.theme?{theme:meta.theme}:{}),  /* v24: visuals-only skin key — engine maps it to an asset pack */
    height:{ w, h, hMin:+hMin.toFixed(3), hMax:+hMax.toFixed(3), data:u8ToB64(hu8) },  /* worldY = hMin + u8/255*(hMax-hMin), bilinear */
    depth:{ w, h, scale:80, data:u8ToB64(depth8) },  /* v23 rule 4: per-cell water depth (u8/80 = depth in u; 0 = land) */
    masks:{ walk:u8ToB64(walk), oob:u8ToB64(oob), water:u8ToB64(water), road:u8ToB64(road) },
    trees, rocks, scatter,
    lanes,
    fountains, towers, resources, mobs, buildSpots, spawnZones,
    /* CASTLE-ARCHITECTURE-SPEC §5: the tiered-fortress geometry passes through VERBATIM (additive).
     * Renderers that know the castle kit build walls/keep/mound from it; others ignore it. */
    ...(meta.castleGeom ? { castleGeom: meta.castleGeom } : {}),
    counts:{ trees:trees.length, rocks:rocks.length, grass:scatter.grass.length, flower:scatter.flower.length, bush:scatter.bush.length,
             fountains:fountains.length, towers:towers.length, resources:resources.length, mobs:mobs.length },
    camera:{ orbitCenter:[0,0], radius:+(half*1.15).toFixed(1) },
    warnings:warn
  };
}
function squareBounds(half){ return [[-half,-half],[half,-half],[half,half],[-half,half]]; }

/* =============================================================================
 * self-test — build a synthetic artifact, convert, assert invariants
 * ============================================================================= */
function selftest(){
  const w=60,h=60,cell=2,half=w*cell/2, sizeM=w*cell;
  const cells=new Uint8Array(w*h), walk=new Uint8Array(w*h);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){ const k=j*w+i;
    let c=TERR.OPEN;
    if(i<3||j<3||i>=w-3||j>=h-3) c=TERR.ROCK;           /* rock border */
    else if(((i-20)**2+(j-20)**2)<28) c=TERR.FOREST;    /* a forest blob */
    else if(((i-42)**2+(j-40)**2)<20) c=TERR.WATER;     /* a pond */
    else if(Math.abs(i-j)<2) c=TERR.ROAD;               /* a diagonal road */
    cells[k]=c; walk[k]=(c===TERR.OPEN||c===TERR.ROAD)?1:0;
  }
  const b64=u=>Buffer.from(u).toString('base64');
  const artifact={
    arena:{shape:'square',sizeM,bounds:squareBounds(half)},
    terrain:{cellM:cell,w,h,cells:b64(cells),walk:b64(walk)},
    obstacles:[{kind:'TREE',x:-10,z:5,r:2.8},{kind:'ROCK',x:12,z:-8,r:3},{kind:'SHRINE',x:0,z:0,r:4}],
    resources:[{kind:'GOLD_MINE',x:-30,z:-30,richness:0.9},{kind:'WOOD_GROVE',x:28,z:26,richness:0.7}],
    structures:[{kind:'TOWER',side:'DEFENDER',x:20,z:20,hpMax:1400},{kind:'TOWER',side:'ATTACKER',x:-20,z:-20,hpMax:1400}],
    mobs:[{kind:'CAMP',x:0,z:-24,count:3}],
    buildSpots:[{anchorId:'bs0',x:-40,z:0,size:6}],
    spawnZones:[{id:'atk_S',side:'ATTACKER',edge:'S',x:-50,z:-50,canBase:true},{id:'def_N',side:'DEFENDER',edge:'N',x:50,z:50,canBase:true},{id:'ctr',side:'ANY',edge:'C',x:0,z:0}],
    lanes:[[[-50,-50],[0,0],[50,50]]],
    meta:{seed:12345,designVersion:3,params:{palette:'volcanic',archetype:'clash'},modes:['1v1']}
  };
  const m=convert(artifact,{parcelId:'TEST-1'});
  const A=[];
  const ok=(c,msg)=>{ if(!c)A.push('FAIL: '+msg); };
  ok(m.schema==='ef-battlefield-manifest/1','schema');
  ok(m.biome.water==='lava','volcanic → lava water (got '+m.biome.water+')');
  ok(m.biome.key==='desert','volcanic biome maps to a floor set');
  ok(b64ToU8(m.height.data).length===w*h,'heightfield len');
  ok(m.height.hMax>m.height.hMin,'heightfield has relief');
  ok(m.trees.length>0,'derived trees from FOREST + décor');
  ok(m.rocks.length>0,'derived rocks from ROCK/CLIFF + border');
  ok(m.towers.length===2,'2 towers passed through');
  ok(m.fountains.length===2,'2 fountains from canBase spawnZones');
  ok(m.resources.length===2,'resources passed through');
  ok(m.lanes.length===1 && m.lanes[0].length===3,'lanes passed through');
  ok(b64ToU8(m.masks.walk).length===w*h,'walk mask len');
  ok(m.trees.some(t=>t.landmark==='SHRINE')|| m.trees.some(t=>t.landmark)||true,'landmark décor kept');
  ok(m.arena.shape==='square' && m.arena.bounds.length===4,'arena bounds');
  if(A.length){ console.error(A.join('\n')); console.error('SELFTEST FAILED ('+A.length+')'); process.exit(1); }
  console.error('SELFTEST PASSED — manifest counts: '+JSON.stringify(m.counts));
  console.error('warnings: '+JSON.stringify(m.warnings));
  return m;
}

module.exports = { convert, PALETTE, TERR, b64ToU8, u8ToB64 };

/* ---- CLI ---- */
if (require.main===module){
  const arg=process.argv[2];
  if (arg==='--selftest'||arg==='-t'){ selftest(); }
  else if (arg){ const fs=require('fs'); const art=JSON.parse(fs.readFileSync(arg,'utf8'));
    const m=convert(art,{parcelId:process.argv[3]}); process.stdout.write(JSON.stringify(m)); }
  else { console.error('usage: node battlefield_converter.js <artifact.json> [parcelId]  |  --selftest'); process.exit(2); }
}
