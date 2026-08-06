/* ============================================================================
   EF_BATTLEFIELD_RENDERER — the shared 3D battlefield/scene builder.
   ----------------------------------------------------------------------------
   CANONICAL HOME (2026-07-12): this MOBA repo. Owned by the MOBA game-dev session.
   Consumed by: the MOBA client (arena), the CF parcel designer preview, and Hunt.
   It WAS extracted from index.html into the CF designer; now unified here so a fix
   either side applies everywhere. Global stays `window.EF_BATTLEFIELD` (the CF
   designer already calls that; renaming the global would break it). Only the FILE
   name changed (ef_battlefield.js → ef_battlefield_renderer.js). See
   HANDOFF/SHARED-BATTLEFIELD-RENDERER-SPLIT.md.

   THE POINT: the CF parcel designer's 3D preview must show the FINAL look, not an
   approximation. So the preview runs THIS module — the same builder the game uses —
   and can never drift from it. Every tuned constant lives in TUNED below.

   Usage (browser, three.js r128):
     <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
     <script src="shared/ef_battlefield_renderer.js"></script>
     const bf = EF_BATTLEFIELD.buildBattlefield(scene, {
        manifest,               // REQUIRED — output of tools/battlefield_converter.cjs
        THREE,                  // REQUIRED — r128
        floorsBase: 'floors/',  // where grass_01.png / desert_01.png … are hosted
        addLights: true,        // set false if the host scene already has the rig
        addFog:    true
     });
     // bf.group     — everything added (remove this one Object3D to tear down)
     // bf.heightAt(x,z) — sample the terrain (use for placing anything else)
     // bf.setFocus(x,z) — move the char-rig fill pool to the subject (hero-follow host)
     // bf.dispose() — free geometries/textures

   Input is the MANIFEST (not the raw artifact): run the artifact through
   tools/battlefield_converter.cjs first — it synthesises the heightfield, resolves
   the palette→material set, and derives tree/rock/scatter placements.
   Schema: docs/briefs/BATTLEFIELD-RENDER-PARITY.md

   Renders the nine layers (see docs/briefs/MAP-AUTHORING-GUIDE.md):
     1 ground draped on the heightfield (+ polygon clip via the OOB mask)
     2 tiled photographic floor texture (non-square repeat + slight rotation)
     3 baked per-vertex dirt/meadow/rim/rock splotches
     4 one radial ground-glow overlay (warm centre → cool vignette)
     5 fog + matching background + the light rig (incl. the web-34 char rig)
     6 worn Catmull-Rom lane ribbons (meander, width wobble, faded ends)
     7 layered low-poly trees (trunk + two cones, per-tree HSL)
     8 rock ridges (clustered, baked-shaded boulders)
     9 seeded instanced scatter (grass tufts / flowers / bushes / rocks)
     + fountain pads with the baked rune/ripple texture
   ============================================================================ */
(function(){
'use strict';

/* ---- EVERY TUNED NUMBER LIVES HERE (these are the game's, verbatim) ---- */
var TUNED = {
  THREE_VERSION: 'r128',

  /* L5 — atmosphere + light rig */
  FOG_COLOR: 0x0d1420, FOG_NEAR: 175, FOG_FAR: 310,
  BIOME_FOG_MIX: 0.30,
  HEMI: { sky:0xbfd4ff, ground:0x223044, intensity:0.9 },
  SUN:  { color:0xfff2dd, intensity:0.8, pos:[60,100,40] },
  /* char lighting rig (web-34, ported from index.html): cool rim from behind-off-axis
     that separates hair/shoulders from the world, + distance-capped colored fills that
     ride the subject (setFocus). Bare hemi+sun makes characters look like props. */
  RIM:   { color:0x9fd8e6, intensity:0.55, pos:[-70,90,-50] },
  FILLS: [ { color:0xffd4a8, intensity:0.65, dist:26, off:[ 8,7, 6] },
           { color:0xa9c8ff, intensity:0.45, dist:22, off:[-9,6,-5] },
           { color:0xd4b0ff, intensity:0.35, dist:20, off:[-3,5, 9] } ],

  /* L2 — floor texture tiling (non-square + rotation = kills the tile grid) */
  FLOOR_REPEAT: [23, 25], FLOOR_ROTATION: 0.12, FLOOR_ANISO: 8,

  /* L3 — baked ground vertex-colour splotches */
  GNOISE_SEED: 20260627,
  DIRT_RGB: [0.80, 0.70, 0.55],  DIRT_EDGE: [0.30, 0.13],
  MEAD_RGB: [1.00, 1.06, 0.86],  MEAD_EDGE: [0.64, 0.85], MEAD_AMT: 0.6,
  RIM_RGB:  [1.16, 1.13, 1.00],  RIM_EDGE:  [0.10, 0.50], RIM_AMT: 0.5,
  ROCK_RGB: [0.93, 0.85, 0.77],  ROCK_EDGE: [0.45, 0.92],
  FINE_AMT: 0.10,

  /* L4 — the single radial ground-glow overlay */
  GLOW_STOPS: [
    [0.00, 'rgba(255,244,214,0.16)'],  /* warm sun pool at centre   */
    [0.32, 'rgba(255,240,205,0.05)'],
    [0.55, 'rgba(120,150,150,0.00)'],  /* CLEAR, readable mid-field */
    [0.82, 'rgba(20,34,46,0.10)'],
    [1.00, 'rgba(10,18,28,0.26)']      /* cool edge vignette        */
  ],
  GLOW_Y: 0.04, GLOW_OVERSCAN: 1.05,

  /* L6 — worn lane ribbon */
  LANE_HALFWIDTH: 4.4, LANE_Y: 0.06, LANE_TAPER: 0.14, LANE_TENSION: 0.5,
  LANE_TINT: 0xc9ad80,

  /* L7 — layered pines */
  TREE_TRUNK: { rTop:0.4, rBot:0.6, h:2.4, seg:5, color:0x4a3522, y:1.2 },
  TREE_HSL: { hue:0.30, hueVar:0.03, sat:0.42, satVar:0.16, light:0.20, lightVar:0.08 },

  /* L8 — ridge rock */
  ROCK_COLOR: 0x6e6a63,

  /* L9 — scatter caps */
  SCATTER_CAPS: { grass:1400, flower:400, bush:260, rock:400 }
};

/* ---------------- tiny helpers ---------------- */
function b64ToU8(s){ if(!s) return new Uint8Array(0);
  var bin = atob(String(s)), u = new Uint8Array(bin.length);
  for (var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
  return u; }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function smooth(e0,e1,v){ var t=clamp((v-e0)/(e1-e0),0,1); return t*t*(3-2*t); }
function mix(a,b,t){ return a+(b-a)*t; }

/* seeded value-noise — identical to the game's ground bake */
function mkNoise(seed){
  function h(ix,iz){ var n=(ix|0)*374761393+(iz|0)*668265263+seed*1442695041;
    n=Math.imul(n^(n>>>13),1274126177); n^=n>>>16; return (n>>>0)/4294967296; }
  return function(x,z,cell){
    var gx=x/cell, gz=z/cell, x0=Math.floor(gx), z0=Math.floor(gz), fx=gx-x0, fz=gz-z0;
    var sx=fx*fx*(3-2*fx), sz=fz*fz*(3-2*fz);
    var a=h(x0,z0), b=h(x0+1,z0), c=h(x0,z0+1), d=h(x0+1,z0+1);
    var ab=a+(b-a)*sx, cd=c+(d-c)*sx; return ab+(cd-ab)*sz; };
}
/* deterministic RNG (seeded → identical layout every load) */
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0;
  var t=Math.imul(a^a>>>15, 1|a); t=t+Math.imul(t^t>>>7, 61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; }

/* ============================================================================ */
function buildBattlefield(scene, opts){
  opts = opts || {};
  var THREE = opts.THREE || window.THREE;
  if (!THREE) throw new Error('EF_BATTLEFIELD: THREE (r128) required');
  var M = opts.manifest;
  if (!M || !M.grid || !M.height) throw new Error('EF_BATTLEFIELD: manifest required (run battlefield_converter.cjs)');
  var floorsBase = opts.floorsBase || 'floors/';

  var root = new THREE.Group(); root.name = 'EF_BATTLEFIELD';
  var _geos = [], _texs = [], _mats = [];
  function keepG(g){ _geos.push(g); return g; }
  function keepT(t){ _texs.push(t); return t; }
  function keepM(m){ _mats.push(m); return m; }

  var half = M.arena.half, sizeM = M.arena.sizeM;
  var W = M.grid.w, H = M.grid.h, CELL = M.grid.cellM;
  var hData = b64ToU8(M.height.data), hMin = M.height.hMin, hMax = M.height.hMax;
  var hSpan = (hMax - hMin) || 1;
  var oob = b64ToU8((M.masks && M.masks.oob) || '');
  var noise = mkNoise(TUNED.GNOISE_SEED);

  /* ---- terrain sampling (bilinear over the synthesized heightfield) ---- */
  function hAtCell(i,j){ i=clamp(i,0,W-1); j=clamp(j,0,H-1);
    return hMin + (hData[j*W+i]/255)*hSpan; }
  function heightAt(x,z){
    var fx=(x+half)/CELL-0.5, fz=(z+half)/CELL-0.5;
    var i=Math.floor(fx), j=Math.floor(fz), tx=fx-i, tz=fz-j;
    var a=hAtCell(i,j), b=hAtCell(i+1,j), c=hAtCell(i,j+1), d=hAtCell(i+1,j+1);
    return mix(mix(a,b,tx), mix(c,d,tx), tz);
  }
  var hRange = Math.max(0.001, hMax - hMin);

  /* ======================================================================
     LAYERS 1 + 2 + 3 — ground: draped on the heightfield, tiled photographic
     floor texture, baked per-vertex splotches. Built from the GRID so OOB
     cells are simply not emitted → polygon parcels are clipped for free.
     ====================================================================== */
  (function ground(){
    var gw = W+1, gh = H+1;
    var pos = new Float32Array(gw*gh*3), col = new Float32Array(gw*gh*3), uv = new Float32Array(gw*gh*2);
    for (var j=0;j<gh;j++) for (var i=0;i<gw;i++){
      var k = j*gw+i;
      var x = -half + i*CELL, z = -half + j*CELL;
      var y = heightAt(x,z);
      pos[k*3]=x; pos[k*3+1]=y; pos[k*3+2]=z;
      /* UV normalised across the arena; the texture's repeat/rotation does the tiling */
      uv[k*2]=(x+half)/sizeM; uv[k*2+1]=(z+half)/sizeM;

      /* --- L3: the bake (this is the biggest "why does theirs look good" layer) ---
         biome.bake === 'none' (optional manifest field, themed floors): the floor texture is an
         AUTHORED design (e.g. veil_masquerade) — skip the dirt/meadow/rock splotches that would
         muddy it; keep only the neutral fine luminance grain. */
      var fine = noise(x-700,z+400,12);
      var r=1,g=1,b=1;
      if (M.biome.bake !== 'none'){
        var big  = 0.62*noise(x,z,82) + 0.38*noise(x+1500,z-900,31);
        var dirt = smooth(TUNED.DIRT_EDGE[0], TUNED.DIRT_EDGE[1], big);
        var mead = smooth(TUNED.MEAD_EDGE[0], TUNED.MEAD_EDGE[1], big);
        r=mix(r,TUNED.DIRT_RGB[0],dirt); g=mix(g,TUNED.DIRT_RGB[1],dirt); b=mix(b,TUNED.DIRT_RGB[2],dirt);
        r=mix(r,TUNED.MEAD_RGB[0],mead*TUNED.MEAD_AMT); g=mix(g,TUNED.MEAD_RGB[1],mead*TUNED.MEAD_AMT); b=mix(b,TUNED.MEAD_RGB[2],mead*TUNED.MEAD_AMT);
        var hN = clamp((y-hMin)/hRange, 0, 1);
        if (hN > 0.02){
          var rim = smooth(TUNED.RIM_EDGE[0], TUNED.RIM_EDGE[1], hN) * TUNED.RIM_AMT;
          r=mix(r,TUNED.RIM_RGB[0],rim); g=mix(g,TUNED.RIM_RGB[1],rim); b=mix(b,TUNED.RIM_RGB[2],rim);
          var rock = smooth(TUNED.ROCK_EDGE[0], TUNED.ROCK_EDGE[1], hN) * (0.4 + 0.6*noise(x+300,z-200,9));
          r=mix(r,TUNED.ROCK_RGB[0],rock); g=mix(g,TUNED.ROCK_RGB[1],rock); b=mix(b,TUNED.ROCK_RGB[2],rock);
        }
      }
      var f = 0.95 + fine*TUNED.FINE_AMT; r*=f; g*=f; b*=f;
      col[k*3]=r; col[k*3+1]=g; col[k*3+2]=b;
    }
    /* emit two triangles per NON-OOB cell → clips polygon parcels automatically */
    var idx = [];
    for (var jj=0;jj<H;jj++) for (var ii=0;ii<W;ii++){
      if (oob.length && oob[jj*W+ii]===1) continue;
      var a=jj*gw+ii, b2=a+1, c=a+gw, d=c+1;
      idx.push(a,c,b2,  b2,c,d);
    }
    var geo = keepG(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col,3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uv,2));
    geo.setIndex(idx); geo.computeVertexNormals();

    /* --- L2: the photographic floor, tiled deliberately "wrong" --- */
    var tex = keepT(new THREE.TextureLoader().load(floorsBase + M.biome.floor + '.png'));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    var _fr = (M.biome.floorRepeat && M.biome.floorRepeat.length===2) ? M.biome.floorRepeat : TUNED.FLOOR_REPEAT;
    tex.repeat.set(_fr[0], _fr[1]);
    tex.center.set(0.5,0.5);
    tex.rotation = TUNED.FLOOR_ROTATION;
    tex.anisotropy = TUNED.FLOOR_ANISO;
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;

    var mat = keepM(new THREE.MeshLambertMaterial({
      map: tex, color: M.biome.dry, vertexColors: true   /* near-white biome tint lets the photo read true */
    }));
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = false; mesh.renderOrder = 0;
    root.add(mesh);
  })();

  /* ======================================================================
     LAYER 4 — ONE radial ground-glow overlay. Does most of the "cinematic" work.
     ====================================================================== */
  (function glow(){
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(128,128,10,128,128,128);
    /* dream maps (biome.sky set): warm sun pool + soft lavender edge — never the dark vignette */
    var stops = (M.biome.sky != null) ? [
      [0.00,'rgba(255,246,224,0.20)'],[0.35,'rgba(255,236,214,0.06)'],
      [0.60,'rgba(255,255,255,0.00)'],[1.00,'rgba(214,186,226,0.14)'],
    ] : TUNED.GLOW_STOPS;
    stops.forEach(function(s){ g.addColorStop(s[0], s[1]); });
    x.fillStyle = g; x.fillRect(0,0,256,256);
    var t = keepT(new THREE.CanvasTexture(c)); t.anisotropy = 2;
    var m = keepM(new THREE.MeshBasicMaterial({ map:t, transparent:true, depthWrite:false }));
    var size = sizeM * TUNED.GLOW_OVERSCAN;
    var mesh = new THREE.Mesh(keepG(new THREE.PlaneGeometry(size,size)), m);
    mesh.rotation.x = -Math.PI/2; mesh.position.y = TUNED.GLOW_Y; mesh.renderOrder = 0;
    root.add(mesh);
  })();

  /* ======================================================================
     LAYER 5 — fog + matching background + the light rig
     ====================================================================== */
  /* biome.sky (OPTIONAL manifest field, themed/dream maps): a full-strength day-lit sky.
     When present the sky colour IS the background+fog (no dark navy base mix), pushed farther
     out, and the light rig warms up. Absent = the classic dusk rig, byte-identical. */
  var DREAM = M.biome.sky != null;
  if (opts.addFog !== false){
    var fogCol;
    if (DREAM){
      fogCol = new THREE.Color(M.biome.sky);
      scene.fog = new THREE.Fog(fogCol.getHex(), TUNED.FOG_NEAR*1.7, TUNED.FOG_FAR*2.3);
    } else {
      fogCol = new THREE.Color(TUNED.FOG_COLOR);
      if (M.biome.fog != null) fogCol.lerp(new THREE.Color(M.biome.fog), TUNED.BIOME_FOG_MIX);
      scene.fog = new THREE.Fog(fogCol.getHex(), TUNED.FOG_NEAR, TUNED.FOG_FAR);
    }
    scene.background = fogCol.clone();   /* MUST equal the fog colour or the horizon seams */
  }
  var _rim = null, _fills = [];
  if (opts.addLights !== false){
    var hemi = DREAM
      ? new THREE.HemisphereLight(0xfff0e2, 0xe8c4d6, 0.82)
      : new THREE.HemisphereLight(TUNED.HEMI.sky, TUNED.HEMI.ground, TUNED.HEMI.intensity);
    var sun  = DREAM
      ? new THREE.DirectionalLight(0xffe4c0, 0.72)
      : new THREE.DirectionalLight(TUNED.SUN.color, TUNED.SUN.intensity);
    sun.position.set(TUNED.SUN.pos[0], TUNED.SUN.pos[1], TUNED.SUN.pos[2]);
    root.add(hemi); root.add(sun);
    /* char rig (web-34): cool rim from behind-off-axis + distance-capped colored fills.
       Fills default to their offsets around the arena centre; a hero-follow host calls
       bf.setFocus(x,z) each frame to keep the subject inside the coloured pool. */
    var R = TUNED.RIM;
    _rim = new THREE.DirectionalLight(R.color, R.intensity);
    _rim.position.set(R.pos[0], R.pos[1], R.pos[2]); root.add(_rim);
    TUNED.FILLS.forEach(function(F){
      var pl = new THREE.PointLight(F.color, F.intensity, F.dist, 2);
      pl.position.set(F.off[0], F.off[1], F.off[2]); pl._off = F.off;
      root.add(pl); _fills.push(pl);
    });
  }
  function setFocus(x, z){
    for (var i=0;i<_fills.length;i++){ var o=_fills[i]._off;
      _fills[i].position.set(x+o[0], o[1], z+o[2]); }
  }

  /* ======================================================================
     LAYER 6 — worn lane ribbons (trodden path, not a racing stripe)
     ====================================================================== */
  var laneMat = null;
  function getLaneMat(){
    if (laneMat) return laneMat;
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d');
    x.fillStyle = '#7a6244'; x.fillRect(0,0,128,128);
    for (var i=0;i<1500;i++){ var v=Math.random();
      x.fillStyle = v<.34?'#6b5436':(v<.67?'#8a6f4c':'#5c472d');
      x.globalAlpha = .45 + Math.random()*.4;
      var s = 1 + Math.random()*2.2;
      x.fillRect(Math.random()*128, Math.random()*128, s, s); }
    x.globalAlpha = .25;
    for (var k=0;k<7;k++){ x.fillStyle = Math.random()<.5?'#5c472d':'#8c7152';
      var yy = 12 + Math.random()*104; x.fillRect(0, yy, 128, 1+Math.random()*2); }
    x.globalAlpha = 1;
    /* fade alpha to 0 toward the two long edges (V axis) → soft trodden edges */
    var img = x.getImageData(0,0,128,128), d = img.data;
    for (var y2=0;y2<128;y2++){ var t2=y2/127, edge=Math.min(t2,1-t2)*2, a=Math.pow(Math.min(1,edge*1.7),1.5);
      for (var x2=0;x2<128;x2++){ d[(y2*128+x2)*4+3] = Math.round(d[(y2*128+x2)*4+3]*a); } }
    x.putImageData(img,0,0);
    var tex = keepT(new THREE.CanvasTexture(c)); tex.anisotropy = 4;
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
    laneMat = keepM(new THREE.MeshLambertMaterial({
      map:tex, color:TUNED.LANE_TINT, transparent:true, depthWrite:false,
      side:THREE.DoubleSide, vertexColors:true   /* itemSize-4 colour carries the END alpha taper */
    }));
    return laneMat;
  }
  (M.lanes||[]).forEach(function(chain){
    if (!chain || chain.length < 2) return;
    var pts = chain.map(function(p){ return new THREE.Vector3(p[0],0,p[1]); });
    var curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', TUNED.LANE_TENSION);
    var SEG = Math.max(28, Math.round(curve.getLength()/3));
    var cp = curve.getPoints(SEG), seed = (chain[0][0]+chain[0][1])*0.013;
    var pos=[], uv=[], col=[], idx=[], dist=0, pcx=0, pcz=0;
    for (var i=0;i<cp.length;i++){
      var p = cp[i];
      var a = cp[Math.max(0,i-1)], b = cp[Math.min(cp.length-1,i+1)];
      var tx=b.x-a.x, tz=b.z-a.z, tl=Math.hypot(tx,tz)||1, nx=-tz/tl, nz=tx/tl;
      var tt = cp.length>1 ? i/(cp.length-1) : 0;
      var taper = Math.sin(Math.PI*tt);
      /* meander the VISUAL centreline only — unit pathing still uses the original waypoints */
      var mea = taper*(2.0*Math.sin(tt*6.283+seed) + 1.0*Math.sin(tt*14.77+seed*2.3));
      var cx = p.x + nx*mea, cz = p.z + nz*mea;
      if (i>0) dist += Math.hypot(cx-pcx, cz-pcz);
      pcx=cx; pcz=cz;
      var hw = TUNED.LANE_HALFWIDTH*(1 + 0.17*Math.sin(i*0.6+seed) + 0.07*Math.sin(i*0.21+seed*3));
      var lx=cx+nx*hw, lz=cz+nz*hw, rx=cx-nx*hw, rz=cz-nz*hw;
      pos.push(lx, heightAt(lx,lz)+TUNED.LANE_Y, lz);
      pos.push(rx, heightAt(rx,rz)+TUNED.LANE_Y, rz);
      var u = dist/9; uv.push(u,0, u,1);
      var ef = Math.min(1, Math.min(tt, 1-tt)/TUNED.LANE_TAPER);
      var fa = ef*ef*(3-2*ef);   /* alpha dissolves into grass at both ends */
      col.push(1,1,1,fa, 1,1,1,fa);
    }
    for (var s2=0;s2<cp.length-1;s2++){ var o=s2*2; idx.push(o,o+1,o+2, o+1,o+3,o+2); }
    var g = keepG(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',       new THREE.Float32BufferAttribute(uv,2));
    g.setAttribute('color',    new THREE.Float32BufferAttribute(col,4)); /* 4 → vertex ALPHA */
    g.setIndex(idx); g.computeVertexNormals();
    var m = new THREE.Mesh(g, getLaneMat()); m.renderOrder = 1;
    root.add(m);
  });

  /* ======================================================================
     LAYER 7 — layered low-poly pines (trunk + TWO cones, per-tree HSL)
     ====================================================================== */
  (function trees(){
    var T = TUNED.TREE_TRUNK, HS = TUNED.TREE_HSL;
    var trunkGeo = keepG(new THREE.CylinderGeometry(T.rTop, T.rBot, T.h, T.seg));
    var trunkMat = keepM(new THREE.MeshLambertMaterial({ color:T.color }));
    (M.trees||[]).forEach(function(t){
      var g = new THREE.Group();
      var baseR = 2 + (t.s!=null ? (t.s-0.85)*2.7 : 0.8); baseR = clamp(baseR, 1.6, 3.8);
      var ht = 5 + (t.s!=null ? (t.s-0.85)*6.7 : 2);      ht = clamp(ht, 4.5, 9);
      var hsl = t.hsl || [HS.hue, HS.sat, HS.light];
      var fMat = keepM(new THREE.MeshLambertMaterial({
        color: new THREE.Color().setHSL(hsl[0], hsl[1], hsl[2]),
        flatShading: true    /* flat shading + per-tree hue = hand-crafted, not cardboard */
      }));
      var trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.set(0, T.y, 0); g.add(trunk);
      var c1 = new THREE.Mesh(keepG(new THREE.ConeGeometry(baseR, ht*0.62, 7)), fMat);
      c1.position.set(0, 2.2 + ht*0.31, 0); g.add(c1);
      var c2 = new THREE.Mesh(keepG(new THREE.ConeGeometry(baseR*0.66, ht*0.50, 7)), fMat);
      c2.position.set(0, 2.2 + ht*0.62, 0); g.add(c2);
      g.position.set(t.x, (t.y!=null?t.y:heightAt(t.x,t.z)), t.z);
      g.rotation.y = Math.random()*Math.PI*2;
      root.add(g);
    });
  })();

  /* ======================================================================
     LAYER 8 — ridge rocks (clustered, baked-shaded boulders)
     ====================================================================== */
  function makeRockGeo(){
    var pos=[], colr=[];
    var lobes=[[0,0.10,0,0.55],[0.30,-0.05,0.12,0.40],[-0.22,0.00,-0.20,0.38]];
    lobes.forEach(function(L){
      var dod = new THREE.DodecahedronGeometry(L[3],0).toNonIndexed(), p = dod.attributes.position;
      for (var i=0;i<p.count;i++){
        var h = Math.sin((i+1)*12.9898 + L[0]*78.233)*0.5+0.5, j = 0.86 + h*0.28;  /* angular faceting */
        var vx=p.getX(i)*j+L[0], vy=p.getY(i)*j+L[1], vz=p.getZ(i)*j+L[2];
        pos.push(vx,vy,vz);
        var sh = 0.62 + 0.45*clamp((vy+0.45)/1.0, 0, 1);   /* darker at the base = grounded stone */
        colr.push(sh, sh*0.97, sh*0.93);
      }
      dod.dispose();
    });
    var g = keepG(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('color',    new THREE.Float32BufferAttribute(colr,3));
    g.computeVertexNormals(); return g;
  }
  var rockGeo = makeRockGeo();
  (function ridgeRocks(){
    var mat = keepM(new THREE.MeshLambertMaterial({ color:TUNED.ROCK_COLOR, vertexColors:true, flatShading:true }));
    (M.rocks||[]).forEach(function(r){
      var m = new THREE.Mesh(rockGeo, mat);
      var s = (r.s!=null?r.s:1) * 2.6;
      m.scale.setScalar(s);
      m.position.set(r.x, (r.y!=null?r.y:heightAt(r.x,r.z)) + s*0.35, r.z);
      m.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3);
      root.add(m);
    });
  })();

  /* ======================================================================
     LAYER 9 — seeded instanced scatter (grass tufts / flowers / bushes / rocks)
     ====================================================================== */
  (function scatter(){
    var S = M.scatter || {};
    var rnd = mulberry32((M.seed>>>0) || 0x9e3779b9);

    function makeTuftGeo(){
      var pos=[], idx=[], v=0, blades=5;
      for (var b=0;b<blades;b++){
        var ang=b/blades*Math.PI*2+0.4*b, ca=Math.cos(ang), sa=Math.sin(ang);
        var hw=0.13+0.03*(b%2), h=1.2+0.3*((b*7)%3), lean=0.4*(b%2?1:-1), rad=0.12;
        var bcx=ca*rad, bcz=sa*rad;
        var blx=bcx+(-sa)*hw, blz=bcz+ca*hw, brx=bcx-(-sa)*hw, brz=bcz-ca*hw;
        var tx=bcx+ca*lean, tz=bcz+sa*lean;
        pos.push(blx,0,blz, brx,0,brz, tx,h,tz); idx.push(v,v+1,v+2); v+=3;
      }
      var g=keepG(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
      g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    function makeFlowerGeo(){
      var pos=[], idx=[], colr=[], v=0, GREEN=[0.20,0.55,0.13], WHITE=[1,1,1];
      function quad(a,b,c,d,col){
        pos.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2], d[0],d[1],d[2]);
        for (var k=0;k<4;k++) colr.push(col[0],col[1],col[2]);
        idx.push(v,v+1,v+2, v,v+2,v+3); v+=4;
      }
      var sw=0.06; quad([-sw,0,0],[sw,0,0],[sw,0.52,0],[-sw,0.52,0], GREEN);   /* stem stays green */
      var bw=0.42, y0=0.42, y1=0.92;
      for (var a2=0;a2<3;a2++){ var ang=a2/3*Math.PI, cx=Math.cos(ang)*bw, cz=Math.sin(ang)*bw;
        quad([-cx,y0,-cz],[cx,y0,cz],[cx,y1,cz],[-cx,y1,-cz], WHITE); }        /* white → instanceColor tints */
      var g=keepG(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
      g.setAttribute('color',    new THREE.Float32BufferAttribute(colr,3));
      g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    function makeBushGeo(){
      var pos=[], colr=[];
      var lobes=[[0,0.45,0,0.50],[0.42,0.30,0.10,0.38],[-0.38,0.34,-0.15,0.36],[0.08,0.70,-0.30,0.34],[-0.20,0.28,0.40,0.34]];
      lobes.forEach(function(L){
        var ico=new THREE.IcosahedronGeometry(L[3],0).toNonIndexed(), p=ico.attributes.position;
        for (var i=0;i<p.count;i++){
          var vy=p.getY(i)+L[1];
          pos.push(p.getX(i)+L[0], vy, p.getZ(i)+L[2]);
          var sh=0.82+0.30*clamp(vy/1.1,0,1);   /* lighter toward the top = leafy */
          colr.push(sh, sh*1.05, sh*0.88);
        }
        ico.dispose();
      });
      var g=keepG(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
      g.setAttribute('color',    new THREE.Float32BufferAttribute(colr,3));
      g.computeVertexNormals(); return g;
    }

    function inst(list, geo, mat, cap, scaleFn, colorFn){
      if (!list || !list.length) return;
      var n = Math.min(list.length, cap);
      var im = new THREE.InstancedMesh(geo, mat, n);
      im.castShadow = false; im.receiveShadow = false;
      var d = new THREE.Object3D();
      for (var i=0;i<n;i++){
        var p = list[i];
        d.position.set(p.x, (p.y!=null?p.y:heightAt(p.x,p.z)), p.z);
        d.rotation.set(0, rnd()*Math.PI*2, 0);
        d.scale.setScalar(scaleFn ? scaleFn(p, rnd) : (p.s||1));
        d.updateMatrix(); im.setMatrixAt(i, d.matrix);
        if (colorFn && im.setColorAt) im.setColorAt(i, colorFn(p, rnd));
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      root.add(im);
    }

    var grassMat  = keepM(new THREE.MeshLambertMaterial({ color:0x6f9b56, side:THREE.DoubleSide, flatShading:true }));
    var flowerMat = keepM(new THREE.MeshLambertMaterial({ color:0xffffff, side:THREE.DoubleSide, vertexColors:true }));
    var bushMat   = keepM(new THREE.MeshLambertMaterial({ color:0x5d8a4a, vertexColors:true, flatShading:true }));
    var srockMat  = keepM(new THREE.MeshLambertMaterial({ color:0x8b8781, vertexColors:true, flatShading:true }));
    var C = new THREE.Color();

    inst(S.grass,  makeTuftGeo(),   grassMat,  TUNED.SCATTER_CAPS.grass,  function(p,r){ return (p.s||1)*(0.8+r()*0.5); });
    inst(S.flower, makeFlowerGeo(), flowerMat, TUNED.SCATTER_CAPS.flower, function(p,r){ return (p.s||1)*(0.8+r()*0.4); },
         function(p,r){ return C.setHSL(r(), 0.62, 0.62).clone(); });   /* instanceColor = petal hue */
    inst(S.bush,   makeBushGeo(),   bushMat,   TUNED.SCATTER_CAPS.bush,   function(p,r){ return (p.s||1)*(0.9+r()*0.5); });
    inst(S.rock,   rockGeo,         srockMat,  TUNED.SCATTER_CAPS.rock,   function(p,r){ return (p.s||1)*(0.5+r()*0.4); });
  })();

  /* ======================================================================
     FOUNTAIN PADS — baked rune/ripple texture (the structures' "furniture")
     ====================================================================== */
  var _fountainTex = {};
  function fountainTex(hex){
    if (_fountainTex[hex]) return _fountainTex[hex];
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var x = c.getContext('2d');
    var cx=128, cy=128, r=(hex>>16)&255, g=(hex>>8)&255, b=hex&255;
    var rgba = function(a){ return 'rgba('+r+','+g+','+b+','+a+')'; };
    x.fillStyle='#18243a'; x.fillRect(0,0,256,256);
    var gr = x.createRadialGradient(cx,cy,0,cx,cy,128);
    gr.addColorStop(0, rgba(.5)); gr.addColorStop(.45, rgba(.12)); gr.addColorStop(1,'rgba(24,36,58,0)');
    x.fillStyle=gr; x.beginPath(); x.arc(cx,cy,128,0,7); x.fill();
    x.lineWidth=2;
    for (var i=1;i<=6;i++){ x.strokeStyle=rgba(Math.max(0,.32-i*.035)); x.beginPath(); x.arc(cx,cy,i*18+6,0,7); x.stroke(); }
    var tickR=104; x.lineWidth=3; x.strokeStyle=rgba(.55);
    for (var t=0;t<24;t++){ var a=t/24*Math.PI*2, co=Math.cos(a), si=Math.sin(a);
      x.beginPath(); x.moveTo(cx+co*(tickR-7), cy+si*(tickR-7)); x.lineTo(cx+co*(tickR+7), cy+si*(tickR+7)); x.stroke(); }
    x.fillStyle=rgba(.7); x.beginPath(); x.arc(cx,cy,7,0,7); x.fill();
    var tex = keepT(new THREE.CanvasTexture(c)); tex.anisotropy = 4;
    _fountainTex[hex] = tex; return tex;
  }
  (M.fountains||[]).forEach(function(f){
    var blue = !/def|red|r$/i.test(String(f.side||''));
    var col = blue ? 0x4aa3ff : 0xff5d5d;
    var y = heightAt(f.x, f.z);
    var pad = new THREE.Mesh(keepG(new THREE.CircleGeometry(8,28)),
      keepM(new THREE.MeshLambertMaterial({ map:fountainTex(col), emissive:col, emissiveIntensity:.18 })));
    pad.rotation.x = -Math.PI/2; pad.position.set(f.x, y+0.06, f.z); root.add(pad);
    var ring = new THREE.Mesh(keepG(new THREE.RingGeometry(7.4,8,28)),
      keepM(new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:.6, side:THREE.DoubleSide })));
    ring.rotation.x = -Math.PI/2; ring.position.set(f.x, y+0.12, f.z); root.add(ring);
  });

  /* STRUCTURE placeholders (CORE command-centre / GATE / TOWER) — in a LIVE match these arrive
     as net units (the game/sim owns them), so the game passes opts.previewStructures:false and
     renders NONE here. For a STANDALONE preview (designer / bfmod) we stamp simple placeholders so
     the parcel reads complete — "what it looks like if it exists". Owner 2026-07-12: towers + CC
     are the SAME layer (game objects), so we preview them CONSISTENTLY — all kinds or none, never
     towers-only. Source order: opts.structures (the command layer) → M.structures → M.towers
     (back-compat; those default to kind TOWER). Team tint: ATTACKER blue / DEFENDER red. */
  if (opts.previewStructures !== false){
    var _structs = opts.structures || M.structures || M.towers || [];
    _structs.forEach(function(s){
      var kind = String(s.kind || 'TOWER').toUpperCase();
      var blue = !/def|red|r$/i.test(String(s.side||''));
      var col  = blue ? 0x4aa3ff : 0xff5d5d;
      var y = heightAt(s.x, s.z);
      if (kind === 'CORE'){
        /* command centre — a broad keep, clearly bigger than a tower */
        var cbase = new THREE.Mesh(keepG(new THREE.CylinderGeometry(6.5,7.8,3,12)),
          keepM(new THREE.MeshLambertMaterial({ color:0x8a8272, flatShading:true })));
        cbase.position.set(s.x, y+1.5, s.z); root.add(cbase);
        var keep = new THREE.Mesh(keepG(new THREE.BoxGeometry(9,13,9)),
          keepM(new THREE.MeshLambertMaterial({ color:0x9a9182, flatShading:true })));
        keep.position.set(s.x, y+3+6.5, s.z); keep.rotation.y = Math.PI/4; root.add(keep);
        var roof = new THREE.Mesh(keepG(new THREE.ConeGeometry(7.6,4.5,4)),
          keepM(new THREE.MeshLambertMaterial({ color:col, flatShading:true })));
        roof.position.set(s.x, y+3+13+2, s.z); roof.rotation.y = Math.PI/4; root.add(roof);
      } else if (kind === 'GATE'){
        /* gate — a low wide wall facing the map centre */
        var yaw = Math.atan2(s.x, s.z);
        var gwall = new THREE.Mesh(keepG(new THREE.BoxGeometry(12,5,2.6)),
          keepM(new THREE.MeshLambertMaterial({ color:0x7d7768, flatShading:true })));
        gwall.position.set(s.x, y+2.5, s.z); gwall.rotation.y = yaw; root.add(gwall);
        var gstripe = new THREE.Mesh(keepG(new THREE.BoxGeometry(12.2,1.2,0.5)),
          keepM(new THREE.MeshBasicMaterial({ color:col })));
        gstripe.position.set(s.x, y+4.3, s.z); gstripe.rotation.y = yaw; root.add(gstripe);
      } else {
        /* tower (default) — the original pedestal */
        var ped = new THREE.Mesh(keepG(new THREE.CylinderGeometry(3.2,4.0,2.0,10)),
          keepM(new THREE.MeshLambertMaterial({ color:0x7d7768, flatShading:true })));
        ped.position.set(s.x, y+1.0, s.z); root.add(ped);
        var shaft = new THREE.Mesh(keepG(new THREE.CylinderGeometry(1.7,2.4,9,8)),
          keepM(new THREE.MeshLambertMaterial({ color:0x8e8778, flatShading:true })));
        shaft.position.set(s.x, y+2.0+4.5, s.z); root.add(shaft);
        var cap = new THREE.Mesh(keepG(new THREE.ConeGeometry(2.6,2.6,8)),
          keepM(new THREE.MeshLambertMaterial({ color:col, flatShading:true })));
        cap.position.set(s.x, y+2.0+9+1.3, s.z); root.add(cap);
      }
    });
  }

  scene.add(root);

  return {
    group: root,
    heightAt: heightAt,
    setFocus: setFocus,
    rim: _rim,
    fills: _fills,
    bounds: M.arena.bounds,
    tuned: TUNED,
    dispose: function(){
      scene.remove(root);
      _geos.forEach(function(g){ try{ g.dispose(); }catch(e){} });
      _texs.forEach(function(t){ try{ t.dispose(); }catch(e){} });
      _mats.forEach(function(m){ try{ m.dispose(); }catch(e){} });
      _geos = []; _texs = []; _mats = [];
    }
  };
}

window.EF_BATTLEFIELD = { buildBattlefield: buildBattlefield, TUNED: TUNED, VERSION: '3' };
})();
