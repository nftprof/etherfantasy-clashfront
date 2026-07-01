/* ============================================================================
   EF_CORE — shared game-agnostic engine layer for ALL EtherFantasy game modes
   ----------------------------------------------------------------------------
   Load AFTER three.js (+ model_calibration.js if present):
     <script src="shared/ef_core.js"></script>
   Exposes window.EF_CORE. Everything here is the "look & feel" that must be
   IDENTICAL across modes: model calibration, animation selection, character
   voices, SFX synthesis, and the per-element skill KITS + ultimate "supers".

   What is SHARED (lives here)            | What each GAME owns (do NOT put here)
   --------------------------------------- -------------------------------------
   · model facing/size/material fixes     | · level curve / xp thresholds
   · clip canon + anim state selection    | · item shop, gear, economy
   · character voice (name-slice TTS)     | · monster/enemy stat scaling
   · SFX + music synthesis                | · map, spawns, win/lose rules
   · KITS: element→Q/W/E ability table    | · how gold/CT is earned
   · SUPER (R) ultimate per element group | · netcode, AI, difficulty
   · ability cd/mana/range/base-damage    | · power MULTIPLIER applied to base dmg

   GAMES PARAMETERIZE THE COMBAT PRIMITIVES. buildKit(type, P) takes a P object
   of the host game's effect fns: {fxRing, aoe, dash, castAt, lineShot}. The kit
   STRUCTURE (which element casts what, names, cooldowns, mana, scaling shape) is
   shared; the actual damage/visuals run through the host's primitives so each
   game keeps its own feel of impact, its own `power` scalar, its own level math.
   ============================================================================ */
(function(){
"use strict";
var EF={};

/* ---- 1. MODEL CALIBRATION (re-exports model_calibration.js if loaded) ------ */
EF.CAL = window.MODEL_CAL || null;   /* facing/size/opaque maps + keyOf() */

/* ---- 2. ANIMATION -----------------------------------------------------------
   Studio clips arrive named '01_Run','Battleidle','01_Attack_01','Social_02'…
   canonClips maps them onto engine states and prefers a clip that actually
   MOVES and is SHORTEST (punchier). ANIM_TARGET speeds over-long action takes
   so one swing fits a game beat. animName() is the per-frame state policy. */
EF.CANON = [['idle',/idle/],['walk',/walk/],['run',/run|fly/],
 ['melee claw',/attack|claw|angry|bite|punch|kick/],['spell cast',/skill|spell|buff|shot/],
 ['die',/(^|[_ ])die|death/],['hit',/(^|[_ ])hit/],['win',/win|social|happy/]];
EF.ANIM_TARGET = {'melee claw':0.8,'spell cast':1.1,'win':2.2,'die':1.4,'hit':0.4};
EF.clipMaxMove = function(c){ if(!c||!c.tracks) return 0; var mx=0;
 for(var i=0;i<c.tracks.length;i++){var t=c.tracks[i]; if(!/\.quaternion$/.test(t.name)) continue;
  var v=t.values, n=v.length/4; if(n<2) continue;
  for(var k=1;k<n;k++){var a=v[0]*v[k*4]+v[1]*v[k*4+1]+v[2]*v[k*4+2]+v[3]*v[k*4+3];
   var ang=2*Math.acos(Math.min(1,Math.abs(a)))*180/Math.PI; if(ang>mx) mx=ang;}}
 return mx; };
EF.canonClips = function(C){ var M=EF.CANON, ks=Object.keys(C);
 for(var i=0;i<M.length;i++){var k=M[i][0], re=M[i][1]; if(C[k]) continue;
  var matches=ks.filter(function(n){return re.test(n);}); if(!matches.length) continue;
  var good=matches.filter(function(n){return EF.clipMaxMove(C[n])>8;});
  var pool=good.length?good:matches;
  pool.sort(function(a,b){return C[a].duration-C[b].duration;});
  C[k]=C[pool[0]];}};
/* strip animation tracks bound to NON-bone nodes (baked root motion + the
   armature tip-over rotation). Needs THREE.PropertyBinding (r128). */
EF.stripNonBoneTracks = function(gltf){ try{
  var hasBones=false; gltf.scene.traverse(function(o){ if(o.isBone) hasBones=true; });
  if(!hasBones) return;
  (gltf.animations||[]).forEach(function(cl){ cl.tracks=cl.tracks.filter(function(tr){
   try{ var pn=THREE.PropertyBinding.parseTrackName(tr.name);
    var node=THREE.PropertyBinding.findNode(gltf.scene,pn.nodeName);
    return !node||node.isBone; }catch(e){ return true; } }); });
 }catch(e){} };
/* per-frame state choice. u uses standard fields: _atk,_moving,emoteT,kind,state,clips */
EF.animName = function(u){
 if(u.emoteT>0 && !u._moving && !u._atk && u.clips['win']) return 'win';
 if(u._atk) return u.clips['melee claw']?'melee claw':(u.clips['spell cast']?'spell cast':'idle');
 if(u.kind==='pet' && u.state==='gather' && !u._moving) return u.clips['dig']?'dig':(u.clips['eat']?'eat':'idle');
 if(u._moving) return u.clips['run']?'run':(u.clips['fly']?'fly':(u.clips['walk']?'walk':'idle'));
 return u.clips['idle']?'idle':Object.keys(u.clips)[0]; };

/* ---- 3. CHARACTER VOICE (synth, no files) -----------------------------------
   Every line is the character saying a SLICE of its own name at a per-scenario
   speed/pitch/volume. Each name hashes to a consistent voice identity. */
EF.VOICE = (function(){
 var last={}, V={mute:false, vol:0.7};
 function gate(min){var t=(performance.now()); if(last.t&&t-last.t<min) return false; last.t=t; return true;}
 function syls(name){return name.match(/[^aeiouyAEIOUY]*[aeiouyAEIOUY]+(?:[^aeiouyAEIOUY](?![aeiouyAEIOUY]))?/g)||[name];}
 function hash(s){var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h;}
 function speak(name,o){ if(V.mute||!name) return; o=o||{};
  try{ if(!o.force && !gate(260)) return;
   name=String(name).split('_')[0];           /* 'Irene_Set_…' speaks as 'Irene' */
   var sy=syls(name), txt;
   switch(o.part||'auto'){
    case 'full': txt=name; break;
    case 'first': txt=sy[0]; break;
    case 'mid': txt=sy[Math.min(1,sy.length-1)]; break;
    case 'last': txt=(sy.length>1?sy.slice(Math.max(1,sy.length-2)).join(''):sy[0]).toLowerCase()+'…'; break;
    default: var r=Math.random(); txt=r<0.18?name:(r<0.55?sy[0]:sy[(Math.random()*sy.length)|0]); }
   if(o.repeat) txt=(txt+'! ').repeat(o.repeat).trim();
   var h=hash(name), u=new SpeechSynthesisUtterance(txt);
   u.pitch=Math.max(.1,Math.min(2,(0.75+((h%80)/80)*0.9)*(o.pitch||1)*(0.94+Math.random()*0.12)));
   u.rate =Math.max(.3,Math.min(3,(0.95+(((h>>3)%40)/100))*(o.rate||1)*(0.9+Math.random()*0.2)));
   u.volume=Math.max(0,Math.min(1,V.vol*(o.vol!==undefined?o.vol:0.9)));
   if(!o.queue) speechSynthesis.cancel(); speechSynthesis.speak(u);
  }catch(e){} }
 return { speak:speak, setMute:function(m){V.mute=m;}, setVol:function(v){V.vol=v;}, _state:V };
})();

/* ---- 4. SFX + MUSIC (WebAudio synth) ----------------------------------------
   makeSfx(AC, gainNode) returns the sound bank bound to the host's audio graph. */
EF.makeSfx = function(AC, g){
 var last={};
 function gate(k,min){var t=AC.currentTime*1000; if(last[k]&&t-last[k]<min) return false; last[k]=t; return true;}
 function tone(freq,dur,type,vol,slide){ var o=AC.createOscillator(),ga=AC.createGain();
  o.type=type||'square'; o.frequency.setValueAtTime(freq,AC.currentTime);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30,freq+slide),AC.currentTime+dur);
  ga.gain.setValueAtTime(vol||.12,AC.currentTime); ga.gain.exponentialRampToValueAtTime(.001,AC.currentTime+dur);
  o.connect(ga); ga.connect(g); o.start(); o.stop(AC.currentTime+dur+.02); }
 function noise(dur,vol){ var n=Math.floor(AC.sampleRate*dur),buf=AC.createBuffer(1,n,AC.sampleRate),d=buf.getChannelData(0);
  for(var i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
  var s=AC.createBufferSource(); s.buffer=buf; var f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=900;
  var ga=AC.createGain(); ga.gain.value=vol||.14; s.connect(f); f.connect(ga); ga.connect(g); s.start(); }
 return {
  tone:tone, noise:noise,
  attack:function(){ if(gate('atk',140)){ noise(.09,.12); tone(170,.08,'square',.07,-60);} },
  shoot:function(){ if(gate('sht',140)) tone(720,.12,'sawtooth',.06,-420); },
  cast:function(){ if(gate('cst',120)){ tone(320,.22,'sine',.12,520); noise(.12,.06);} },
  super:function(){ tone(110,.5,'sawtooth',.16,-40); tone(440,.4,'sine',.1,660); noise(.3,.12); },
  coin:function(){ tone(1230,.07,'square',.09); setTimeout(function(){tone(1840,.1,'square',.08);},60); },
  level:function(){ [440,554,659,880].forEach(function(f,i){ setTimeout(function(){tone(f,.16,'triangle',.1);},i*80);}); },
  death:function(){ tone(220,.6,'sawtooth',.14,-160); noise(.4,.1); },
  equip:function(){ [660,880,1320].forEach(function(f,i){ setTimeout(function(){tone(f,.14,'sine',.1);},i*70);}); },
  click:function(){ if(gate('clk',80)) tone(880,.04,'square',.05); },
  buy:function(){ tone(980,.06,'square',.08); setTimeout(function(){tone(1470,.09,'square',.07);},70); },
  alarm:function(){ tone(880,.16,'square',.13); setTimeout(function(){tone(640,.22,'square',.13);},170); }
 };
};

/* ---- 5. SKILLS: element kits + ultimates ------------------------------------
   ELEMENT_COLORS + KITS are pure data. buildKit(type, P) binds the Q/W/E + R(super)
   to the host game's combat primitives P = {fxRing, aoe, dash, castAt, lineShot}.
   Base damage uses `lvl` and an optional `power` scalar the game passes in
   (each game scales differently — power is where that difference lives). */
EF.ELEMENT_COLORS = {Fire:0xff6622,Water:0x3aa0ff,Leaf:0x44c264,Lightning:0xffe04a,Earth:0xb98a4a,
 Ice:0x9fe0ff,Combat:0xff5d5d,Toxin:0xa6e23a,Telepath:0xe06ad6,Insect:0x9acd32,Rock:0x9a8a78,
 Phantom:0x9b59b6,Dragon:0x6a5acd,Iron:0x9aa6b2,Flyer:0x7ec8ff,Mystic:0xd36ad3,Neutral:0xdddddd};
EF.KITS = {
 Fire:['Searing area bursts that melt clustered foes.',['Fireball','nova'],['Flame Nova','ring'],['Ember Rush','dash']],
 Water:['Chilling waves that control the fight.',['Aqua Burst','nova'],['Frost Ring','ring'],['Tide Dash','dash']],
 Leaf:['Natures barrage and choking spores.',['Seed Barrage','line'],['Spore Cloud','ring'],['Vine Dash','dash']],
 Lightning:['Blistering speed and shocking strikes.',['Chain Bolt','line'],['Overcharge','buff'],['Flash Blink','blink']],
 Earth:['Heavy, crushing earth power.',['Boulder Toss','nova'],['Earthquake','ring'],['Burrow Dash','dash']],
 Ice:['Freezing shards and biting storms.',['Ice Shard','line'],['Blizzard','ring'],['Glacier Dash','dash']],
 Combat:['Relentless front-line melee pressure.',['Power Strike','ring'],['War Cry','buff'],['Charge','dash']],
 Toxin:['Poison clouds and area denial.',['Venom Spit','nova'],['Toxic Cloud','ring'],['Slither','dash']],
 Telepath:['Psychic blasts and short warps.',['Mind Blast','nova'],['Psy Field','ring'],['Teleport','blink']],
 Insect:['Swarming stings that whittle foes.',['Sting Volley','line'],['Swarm','buff'],['Skitter','dash']],
 Rock:['Stone and rubble that smash lines.',['Rockfall','nova'],['Quake','ring'],['Boulder Roll','dash']],
 Phantom:['Haunting shadow magic and phasing.',['Shadow Ball','nova'],['Haunt','ring'],['Phase','blink']],
 Dragon:['Draconic devastation in a line.',['Dragon Breath','line'],['Dragon Roar','ring'],['Wing Dash','dash']],
 Iron:['Armored assault and fortification.',['Iron Slug','nova'],['Fortify','buff'],['Steel Dash','dash']],
 Flyer:['Aerial speed, gusts and dives.',['Gust','line'],['Tailwind','buff'],['Dive','dash']],
 Mystic:['Arcane bursts and blink magic.',['Arcane Bolt','nova'],['Hex','ring'],['Blink','blink']],
 Neutral:['A balanced, adaptable fighter.',['Strike','nova'],['Rally','buff'],['Quick Dash','dash']]
};
/* archetype factories: (name,col,P,power) -> ability {n,d,num,cd,mp,prev,size,self,f} */
EF.ARCH = {
 nova:function(n,col,P,pw){return {n:n,d:'Lob a blast that erupts for area damage at the cursor.',num:'75 +14/lvl dmg',cd:6,mp:35,prev:'ring',size:5.5,
  f:function(h,pt){P.castAt(h,pt,col,function(){P.fxRing(pt,col,5.5);P.aoe(h,pt,5.5,(75+h.level*14)*(pw||1));});}};},
 line:function(n,col,P,pw){return {n:n,d:'Fire a piercing shot in a straight line.',num:'65 +11/lvl dmg',cd:6,mp:30,prev:'line',size:26,
  f:function(h,pt){P.lineShot(h,pt,26,(65+h.level*11)*(pw||1));}};},
 ring:function(n,col,P,pw){return {n:n,d:'Slam the ground, damaging and slowing nearby foes.',num:'38 +8/lvl dmg · 2.5s slow',cd:10,mp:40,self:1,
  f:function(h){P.fxRing(h.grp.position,col,8);P.aoe(h,h.grp.position,8,(38+h.level*8)*(pw||1),2.5);}};},
 buff:function(n,col,P,pw){return {n:n,d:'Empower yourself with attack speed for a few seconds.',num:'2x attack speed · 5s',cd:14,mp:40,self:1,
  f:function(h){h.hasteT=5;P.fxRing(h.grp.position,col,4);}};},
 dash:function(n,col,P,pw){return {n:n,d:'Dash toward the cursor.',num:'15 range',cd:7,mp:22,prev:'line',size:15,
  f:function(h,pt){P.dash(h,pt,15);P.fxRing(h.grp.position,col,3);}};},
 blink:function(n,col,P,pw){return {n:n,d:'Teleport instantly to the target point.',num:'17 range',cd:13,mp:50,prev:'ring',size:3,
  f:function(h,pt){P.fxRing(h.grp.position,col,3);P.dash(h,pt,17,true);P.fxRing(h.grp.position,col,3);}};}
};
EF.buildSuper = function(type,col,P,pw){ pw=pw||1;
 var dmgT=['Fire','Lightning','Dragon','Insect','Neutral','Flyer'],
     ctrlT=['Water','Ice','Earth','Rock','Toxin'], warT=['Combat','Iron','Leaf'];
 if(dmgT.indexOf(type)>=0) return {n:'☄ Cataclysm Burst',d:'SUPER: huge blast at the cursor.',num:'220 +30/lvl · r12',cd:110,mp:100,prev:'ring',size:12,sup:1,
  f:function(h,pt){P.castAt(h,pt,col,function(){P.fxRing(pt,col,12);P.aoe(h,pt,12,(220+h.level*30)*pw);});}};
 if(ctrlT.indexOf(type)>=0) return {n:'❄ World Freeze',d:'SUPER: massive slow slam.',num:'140 +18/lvl · 4s slow · r16',cd:110,mp:100,self:1,sup:1,
  f:function(h){P.fxRing(h.grp.position,col,16);P.aoe(h,h.grp.position,16,(140+h.level*18)*pw,4);}};
 if(warT.indexOf(type)>=0) return {n:'⚔ Avatar of War',d:'SUPER: heal 30% + attack-speed surge.',num:'+30% HP · 2x atkspd 8s',cd:110,mp:100,self:1,sup:1,
  f:function(h){h.hp=Math.min(h.maxHp,h.hp+h.maxHp*.3);h.hasteT=8;if(h.drawBar)h.drawBar();P.fxRing(h.grp.position,col,8);}};
 return {n:'🌀 Void Shift',d:'SUPER: teleport far and detonate.',num:'160 +22/lvl · 40 range',cd:110,mp:100,prev:'ring',size:8,sup:1,
  f:function(h,pt){P.dash(h,pt,40,true);P.fxRing(h.grp.position,col,8);P.aoe(h,h.grp.position,8,(160+h.level*22)*pw);}};
};
/* P = host combat primitives, pw = host power scalar (default 1). Returns {color,type,desc,abs:[Q,W,E,R]} */
EF.buildKit = function(type,P,pw){ var K=EF.KITS[type]||EF.KITS.Neutral, col=EF.ELEMENT_COLORS[type]||0xdddddd;
 var mk=function(s){return EF.ARCH[s[1]](s[0],col,P,pw);};
 return {color:col,type:type,desc:K[0],abs:[mk(K[1]),mk(K[2]),mk(K[3]),EF.buildSuper(type,col,P,pw)]}; };

/* ---- 6. SUPER cooldown growth (shared pacing shape) ------------------------ */
EF.superCd = function(gameT){ return Math.min(200,110+gameT/10); };

window.EF_CORE = EF;
})();
