/* ============================================================================
   MODEL CALIBRATION — single shared source of truth for BOTH game modes
   ----------------------------------------------------------------------------
   Loaded via <script src="model_calibration.js"> by:
     · index.html  (EtherFantasy MOBA)
     · pve.html    (EF Hunt)
     · audit.html  (model QA tool — http://localhost:8000/audit.html)
   Exposes window.MODEL_CAL = { FACE_FIX, SIZE_FIX, FORCE_OPAQUE, CANON }.

   Conventions (apply when consuming):
   · KEYS are the model's base name: filename minus the "<id>_" prefix and
     extension ("26_Omnom.glb" → "Omnom", "hero/Irene_Set_….glb" → "Irene_Set_…").
   · FACE_FIX values REPLACE the auto-computed head-bone facing offset
     (radians, applied as visual.rotation.y = moveAngle + offset).
   · SIZE_FIX multiplies the normalized height (bone-bbox normalization).
   · FORCE_OPAQUE: render ignoring texture alpha (alphaTest 0) — for models
     whose texture alpha channel is ~0 everywhere (they'd vanish as cutout).
   · CANON: regex aliases mapping studio clip names to engine states.
   Also REQUIRED for correct rendering of this asset set (implement, don't skip):
   · ignore bones with |world pos| > 1e5 in sizing AND facing (corrupted exports);
   · hide meshes whose geometry bounds exceed 1e5 (garbage eye meshes etc.);
   · hide non-skinned meshes named /^cube(\.\d+)?$/i and /collider|collision/i;
   · alphaMode:BLEND materials → transparent=false, alphaTest=.5, depthWrite=true;
   · strip animation tracks that target NON-bone nodes (baked root motion —
     Irene exports drag the Armature through world space; the game moves units).
   Audited 2026-06-12/13 with the user via audit.html (129 pets + 7 hero glbs).
   ============================================================================ */
(function(){
var P=Math.PI,H=P/2;
window.MODEL_CAL={
FACE_FIX:{
 /* humanoid hero costumes (studio rig) — facing dialed in audit; verify Kai/Leah & adjust */
 Irene_Set_Balance_Mythic:H,Irene_Set_Destroy_Mythic:H,Irene_Set_Fatal_Mythic:H,
 Irene_Set_Quick_Mythic:H,Irene_Token_000001:0,Irene_Token_000002:H,Irene_Token_000003:H,
 Kai_Set_Default:0,Leah_Set_Default:0,
 Lectrobe:P,Lollipunch:P,Omnom:P,Aquary:P,Berrball:P,Blockall:P,Cesstoid:P,Clothom:2.967,
 Coronoid:P,Cryptise:P,Dillow:P,Dredrock:P,Dusprite:P,Endorr:P,Fuenago:P,Geckelic:P,
 Geerex:P,Greipawn:P,Grubgas:P,Inkami:P,Intelix:P,Krubble:P,Mawverize:P,Mianari:P,
 Mindallion:P,Moranagi:P,Morinori:P,Occlusk:0,Odwing:P,Onchor:P,Palytid:P,Pistaccoul:P,
 Pudde:P,Pyrode:P,Redhandit:P,Reflecter:P,Silvyx:P,Spoxin:P,Squake:P,Surinari:P,
 Tygloo:P,Vexigon:P,Vibe:P,Vivorin:P,Watadzumi:P,Watuber:P,Yumee:P,Blockid:P,
 Inchapp:P,Finray:P,Dorentu:P,Pricktile:P,Naviumi:0,Hambrisk:P,Moonara:P,
 Wallopop:P,Snobbit:P,Nova:P,Kelpony:P,Mirrie:0,
 Candeliria:P,Dracobra:P,Mas_Bellbird:H,Mas_Lucy:P,Mas_Maple:0,Mon_Goblin_Gold:P,Boss_Centaur_Warrior_Fire:0},
SIZE_FIX:{
 Irene_Set_Balance_Mythic:1.4,Irene_Set_Destroy_Mythic:1.4,Irene_Set_Fatal_Mythic:1.4,
 Irene_Set_Quick_Mythic:1.4,Irene_Token_000001:1.5,Irene_Token_000002:1.5,Irene_Token_000003:1.5,
 Kai_Set_Default:1.4,Leah_Set_Default:1.2,
 Tebeno:0.8,Chulember:1.3,Krubble:0.95,Tipsillar:0.8,Geckno:0.8,Blockid:0.85,
 Iquander:0.9,Mindallion:0.8,Krakowee:0.85,Felistar:0.85,Thermolophus:1.2,Dusprite:0.85,
 Clothom:0.85,Pistaccoul:0.8,Kikapole:0.95,Vexigon:0.9,Keradon:1.2,Greipawn:0.85,
 Vernirox:1.4,Quadrossal:1.7,Zedakazm:1.5,Armadigoal:0.85,Vermillios:0.75,Pigperus:0.95,
 Piggicius:0.95,Foxeez:0.85,Vivorin:0.9,Roichirp:0.75,Watuber:0.95,Vaudequin:1.8,
 Windora:0.9,Helichrome:0.8,Onchor:0.85,Sully:0.9,Geenee:0.8,Quillster:1.3,
 Diloom:0.8,Baulder:0.85,Fauneek:0.8,Vibe:0.9,Mintol:0.8,
 Omnom:0.8,Lectrobe:0.75,Mirrie:0.9,Dynamouse:0.8,Lollipunch:0.75,Odwing:0.85,
 Tygloo:0.75,Pudde:0.8,Mushmite:0.85,Polynimo:0.8,Fuirrel:0.8,Dillow:0.95,
 Pyrode:0.95,Nageel:0.9,Moranagi:0.9,Moldec:0.9,Oculid:0.95,Silvyx:0.8,
 Coronoid:0.8,Watadzumi:1.1,Geckelic:0.95,Blockall:1.4,Eekape:0.8,Geerex:0.9,
 Dredrock:0.9,Yumee:0.8,Wrektric:0.85,Reflecter:0.9,Mawverize:0.9,Occlusk:0.85,
 Palytid:0.8,Mechloo:1.1,Squake:0.95,Mianari:0.8,Morinori:0.8,Gremin:0.8,
 Spoxin:0.8,Intelix:0.9,Inkami:0.9,Redhandit:0.9,Endorr:0.8,Berrball:0.8,
 Sonectid:0.8,Cryptise:0.75,Cesstoid:0.8,Barkindle:0.9,Ruffski:0.95,Matara:0.8,
 Inchapp:0.8,Pangrass:0.9,
 Spoulder:0.8,Batflare:0.8,Finray:0.85,Dorentu:1.1,Pricktile:0.75,Yarmeow:0.8,
 Naviumi:0.9,Juphant:0.85,Elekitt:0.9,Hambrisk:0.85,Clawcount:0.8,Snowler:0.8,Wallopop:0.75,
 Snobbit:0.65,Eriegle:0.8,Mytier:0.95,Deefyn:0.8,Nova:0.85,Boss_Centaur_Warrior_Fire:1.7,
 Kyari:0.9,Cobrus:0.85,Dracobra:1.4},
FORCE_OPAQUE:{Inchapp:1},
/* PER-MODEL COLOUR GRADE — pull off-palette models (e.g. the soft "watercolour" pentapets) toward
   the rest of the roster so everything reads as ONE game. Applied non-destructively at load via a
   tiny fragment-shader patch in applyModel (no texture re-bake, ~zero per-frame cost). Keyed by the
   same model key as SIZE_FIX/FACE_FIX (keyOf). Each entry is any subset of:
     sat  : saturation   (1 = unchanged, >1 richer, <1 washed out)
     con  : contrast     (1 = unchanged)
     bri  : brightness   (1 = unchanged)
     tint : hex colour multiplied in by `tintAmt` (0..1) — e.g. warm 0xffe9d0, cool 0xd6e6ff
     tintAmt : 0 = no tint
   EMPTY by default = NOTHING changes. Add a model to start grading it, e.g.:
     // Diloom:{ sat:1.18, con:1.08, bri:1.02, tint:0xffe6c8, tintAmt:0.12 },
   Tune until the watercolour pets sit in the same palette as Irene/Kai/Leah. */
COLOR_ADJ:{},/* per-MODEL overrides (most specific) — add a model name here to fine-tune just that one */
/* PER-CLASS grade (hero / monster / pet / line) — sits between the floor and per-model. Each field is
   optional; any of: sat, con (contrast), bri (brightness), lift (lift blacks), tint (hex) + tintAmt. */
CLASS_ADJ:{
  hero:{    sat:1.02, con:1.13, bri:1.30, tint:0xffece0, tintAmt:0.31 },  /* heroes: bright, warm, high-contrast → pop */
  monster:{ sat:0.80, con:1.10, bri:0.99, tint:0xffece0, tintAmt:0.09 },  /* enemies: muted, cooler → read as "other"  */
  pet:{     sat:1.00, con:1.05, bri:0.98, tint:0xffece0, tintAmt:0.25 },  /* pets: full colour, warm, soft             */
  line:{    sat:0.90, con:1.06, bri:1.02, tint:0xffece0, tintAmt:0.18 }   /* soldiers: between hero & monster           */
},
/* GLOBAL COLOUR FLOOR — applied to EVERY model first; CLASS_ADJ then per-model COLOR_ADJ override on
   top, field by field. EASY KNOBS (set on the floor, a class, or one model): sat=saturation,
   con=contrast, bri=brightness, lift=raise the shadow floor (no pure black), tint=hex colour +
   tintAmt=0..1 warmth/coolness. Identity (sat1/con1/bri1/lift0/tintAmt0) disables that layer. */
COLOR_FLOOR:{ sat:1.0, con:1.0, bri:1.0, lift:0.03, tint:0xffece0, tintAmt:0.05 },
/* NO_COMBAT — pets that should NOT fight: they amble around the owner as passive wild critters.
   By default the 6 social-only exports (Kyari/Cobrus/Finray/Pricktile/Yarmeow/Naviumi) still fight
   with a procedural lunge; add a key here (e.g. yarmeow:1) ONLY if that lunge looks bad for it. */
NO_COMBAT:{ /* geckno:1  ← example: flip a pet to roam-only */ },
/* AIR units (flyers): melee units CAN'T hit them; ranged (archers/mages), other air units, and
   towers CAN. Air units can hit everything (land + air). The game also auto-treats any mon whose
   type includes "Flyer" as air; this set OVERRIDES per model name (1 = air, 0 = force grounded).
   Edit freely — these are the obvious no-legs flyers; add/remove as you decide. */
AIR:{Vivorin:0,Windora:1,Gremin:1,Inkami:1,Tebeno:1,Clothom:1,Roichirp:0,Sully:1,
 Batflare:0,Eriegle:0,Deefyn:1,Finray:1,Moonara:1,Keradon:1,Quadrossal:1,Helichrome:1,
 Vibe:1,Nova:1,Omnom:1,Lectrobe:1,Polynimo:1,Pyrode:0,Silvyx:1,Yumee:0,Dracobra:1,Mawverize:0},
/* BASIC ATTACK type (audit T-key): 1 = RANGED (archer/mage — bow/bolt/magic basic; CAN hit
   air), 0 = MELEE (cannot hit flyers). Consumed in index.html applyModel → u.ranged → canHitAir.
   Undefined falls back to the unit's innate range (range>4 already counts as ranged). */
ATK:{Chulember:1,Dusprite:1,Clothom:1,Quadrossal:1,Vermillios:1,Spoulder:1,Batflare:1,
 Vaudequin:1,Pricktile:1,Yarmeow:1,Baulder:1,Elekitt:1,Moonara:1,Wallopop:1,Snobbit:1,
 Inchapp:1,Deefyn:1,Nova:1,Mintol:1,Omnom:1,Kyari:1,Lectrobe:1,Dynamouse:1,Odwing:1,
 Pudde:1,Pyrode:1,Nageel:1,Moranagi:1,Dredrock:1,Florost:1,Yumee:1,Candeliria:1,
 Wrektric:1,Aquary:1,Spoxin:1,Redhandit:0},
/* canonical clip aliases: [engineState, regex] — first unclaimed match wins */
CANON:[['idle',/idle/],['walk',/walk/],['run',/run|fly/],
 ['melee claw',/attack|claw|angry|bite|punch|kick/],['spell cast',/skill|spell|buff|shot/],
 ['die',/(^|[_ ])die|death/],['hit',/(^|[_ ])hit/],['win',/win|social|happy/]],
/* PER-MODEL clip overrides: force a canonical state to a specific clip by name-substring,
   in priority order. For archers like Irene the basic attack & skills must be BOW shots,
   never the melee kick the generic "shortest clip" rule would pick. Matched by key PREFIX
   (case-insensitive). value: { state: [substr,...] } — first clip whose name contains an
   earlier substr wins. */
ANIM_FORCE:{
 /* Irene — archer: basic & skills are BOW shots, never the melee kick */
 irene:{ 'melee claw':['attack_01','tumbshot','repeatshot','multi_shot','shot'],
         'spell cast':['multi_shot','repeatshot','tumbshot','shot','skill1'] },
 /* Kai — swordsman melee. Updated rig now HAS 01_Run → prefer it for locomotion (Dash is fallback) */
 kai:{ run:['run','dash'], walk:['walk','run','dash'],
       'melee claw':['attack_01','attack_02','sword_stamp','uppecut','cutout'],
       'spell cast':['whirlwind','sword_buff','cutout','skill1','skill'] },
 /* Leah — mage: ranged magic primary, staff melee for basic attack */
 leah:{ 'melee claw':['attack_01','attack_02','attack_03'],
        'spell cast':['magic_missile','flame_throwing','skill1','skill'] }
},
/* apply ANIM_FORCE onto a clip dict (lowercased keys). key = keyOf(modelName). */
forceClips:function(C,key){ if(!key) return; var k=String(key).toLowerCase();
 var FA=this.ANIM_FORCE, rule=null;
 for(var p in FA){ if(k.indexOf(p)===0){ rule=FA[p]; break; } }
 if(!rule) return; var names=Object.keys(C);
 for(var state in rule){ var prefs=rule[state], hit=null;
  for(var i=0;i<prefs.length && !hit;i++){ hit=names.find(function(n){return n.indexOf(prefs[i])>=0;}); }
  if(hit) C[state]=C[hit]; }
},
/* per-model PLAYBACK RATE for looping locomotion clips (idle/walk/run). Some studio takes are
   authored faster/slower than this game's movement speed — e.g. Kai's 01_Run cycles too quick,
   so the legs "sprint" while the hero glides at normal speed. value = timeScale multiplier for
   that state (1 = native, <1 = slower). Matched by key PREFIX (lowercased). */
ANIM_RATE:{ kai:{ run:0.6 }, irene:{ run:0.45 }, leah:{ run:0.6 } },
rateFor:function(key,state){ if(!key) return 1; var k=String(key).toLowerCase();
 for(var p in this.ANIM_RATE){ if(k.indexOf(p)===0){ var r=this.ANIM_RATE[p];
  if(r && typeof r[state]==='number') return r[state]; } }
 return 1; },
/* look up a model's colour grade (merged with identity defaults). Returns null when the model has
   no entry → applyModel skips the shader patch entirely (zero cost, no visual change). Matched by
   key PREFIX (case-insensitive) so "Diloom" covers "Diloom"/"Diloom_F2"/etc. */
colorAdjFor:function(key,cls){
 var F=this.COLOR_FLOOR||{};
 var b={ sat:(typeof F.sat==='number'?F.sat:1), con:(typeof F.con==='number'?F.con:1),
         bri:(typeof F.bri==='number'?F.bri:1), lift:(typeof F.lift==='number'?F.lift:0),
         tint:(F.tint!=null?F.tint:0xffffff), tintAmt:(typeof F.tintAmt==='number'?F.tintAmt:0) };
 var ov=function(e){ if(!e)return; if(typeof e.sat==='number')b.sat=e.sat; if(typeof e.con==='number')b.con=e.con;
   if(typeof e.bri==='number')b.bri=e.bri; if(typeof e.lift==='number')b.lift=e.lift;
   if(e.tint!=null)b.tint=e.tint; if(typeof e.tintAmt==='number')b.tintAmt=e.tintAmt; };
 if(cls&&this.CLASS_ADJ)ov(this.CLASS_ADJ[cls]);/* class layer (hero/monster/pet/line) */
 var e=null; if(key){ var k=String(key).toLowerCase();
  for(var p in this.COLOR_ADJ){ if(k.indexOf(String(p).toLowerCase())===0){ e=this.COLOR_ADJ[p]; break; } } }
 ov(e);/* per-model override (most specific) */
 /* identity → null so applyModel skips the shader patch entirely (zero cost, no visual change) */
 if(b.sat===1&&b.con===1&&b.bri===1&&b.lift===0&&b.tintAmt===0)return null;
 return b; },
/* normalize any glb path/filename to a calibration key */
keyOf:function(name){return String(name).split('/').pop()
 .replace(/\.(glb|vrm)$/i,'').replace(/^\d+_/,'');}
};
})();
