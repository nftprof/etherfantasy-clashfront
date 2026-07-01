/* ============================================================================
   EF_TOUCH — shared mobile / touch control layer for BOTH game modes
   ----------------------------------------------------------------------------
   Loaded via <script src="shared/ef_touch.js"> by index.html (MOBA) and
   pve.html (EF Hunt). Generic UI only — every game-specific action is supplied
   by the host page through EF_TOUCH.init(cfg). Provides:
     · auto mobile/touch detection (override with ?touch=1 / ?touch=0)
     · a left virtual JOYSTICK that reports a normalized direction each frame
     · a right-side BUTTON bank (primary + collapsible extras) the host wires up
     · LANDSCAPE enforcement: a "rotate your device" gate in portrait, plus a
       one-tap "fullscreen + lock landscape" entry
   The host page reads nothing per-frame: EF_TOUCH runs its own rAF and calls
   cfg.onMove(nx,nz) every frame while the stick is held (nx,nz in [-1,1],
   screen axes: +x right, +z screen-down), and cfg.onMoveEnd() on release.
   Exposes window.EF_TOUCH = { init(cfg), active, joy:{x,z,on} }.
   ============================================================================ */
(function(){
var T={active:false,joy:{x:0,z:0,on:false},_cfg:null,_raf:0,_last:{x:0,z:1}};
/* normalized aim direction: live stick if held, else last meaningful direction (default forward +z) */
T.aimDir=function(){var live=T.joy.on&&(Math.abs(T.joy.x)+Math.abs(T.joy.z))>1e-3;var v=live?{x:T.joy.x,z:T.joy.z}:T._last;var l=Math.hypot(v.x,v.z)||1;return{x:v.x/l,z:v.z/l};};

function qp(k){try{return new URLSearchParams(location.search).get(k);}catch(e){return null;}}
function isTouch(){
 var p=qp('touch'); if(p==='1')return true; if(p==='0')return false;
 var coarse=matchMedia&&matchMedia('(pointer:coarse)').matches;
 var touch=('ontouchstart'in window)||(navigator.maxTouchPoints>0);
 var small=Math.min(screen.width,screen.height)<=1024;
 return !!(touch&&(coarse||small));
}
function E(tag,parent,css,txt){var e=document.createElement(tag);if(css)e.style.cssText=css;if(txt!=null)e.innerHTML=txt;if(parent)parent.appendChild(e);return e;}

function injectCSS(){
 var s=E('style',document.head);
 s.textContent=[
 '#efTouch{position:fixed;inset:0;z-index:9000;pointer-events:none;font-family:inherit;-webkit-user-select:none;user-select:none;touch-action:none}',
 '#efTouch .pe{pointer-events:auto}',
 '#efJoy{position:absolute;left:max(18px,env(safe-area-inset-left));bottom:max(20px,env(safe-area-inset-bottom));width:34vmin;max-width:170px;height:34vmin;max-height:170px;border-radius:50%;background:rgba(20,18,32,.45);border:2px solid rgba(160,140,210,.5);box-shadow:0 0 24px rgba(0,0,0,.4)}',
 '#efKnob{position:absolute;left:50%;top:50%;width:42%;height:42%;margin:-21% 0 0 -21%;border-radius:50%;background:radial-gradient(circle at 35% 30%,#b69cff,#6a4bd0);box-shadow:0 2px 10px rgba(0,0,0,.5);transition:transform .03s}',
 '#efBtns{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));display:flex;flex-wrap:wrap-reverse;justify-content:flex-end;gap:10px;width:46vmin;max-width:280px}',
 '#efBtns .eb{width:14vmin;max-width:74px;height:14vmin;max-height:74px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:4.4vmin;line-height:1;border:2px solid rgba(255,255,255,.22);box-shadow:0 3px 12px rgba(0,0,0,.45);background:rgba(30,26,46,.72)}',
 '#efBtns .eb .sub{font-size:2.0vmin;font-weight:600;opacity:.85;margin-top:2px}',
 '#efBtns .eb:active{filter:brightness(1.35);transform:scale(.93)}',
 '#efBtns .eb.lg{width:16.5vmin;max-width:86px;height:16.5vmin;max-height:86px;font-size:5vmin}',
 '#efBtns .eb.sm{width:10.5vmin;max-width:56px;height:10.5vmin;max-height:56px;font-size:3.4vmin}',
 '#efBtns .eb.xl{width:19vmin;max-width:98px;height:19vmin;max-height:98px;font-size:5.6vmin}',
 '#efBtns .eb.sm .sub{font-size:1.6vmin}',
 '#efBtns.cluster{position:absolute;inset:0;width:auto;max-width:none;display:block}',
 '#efBtns .ebcd{position:absolute;inset:0;border-radius:50%;display:none;align-items:center;justify-content:center;color:#ffe9a8;font-weight:800;font-size:4.6vmin;text-shadow:0 1px 2px #000;pointer-events:none}',
 '#efBtns .eb.off{filter:grayscale(.8) brightness(.5)}',
 '#efExtra{position:absolute;right:max(16px,env(safe-area-inset-right));top:max(58px,calc(env(safe-area-inset-top) + 54px));display:none;flex-direction:column;gap:8px}',
 '#efExtra.show{display:flex}',
 '#efExtra .eb{width:11vmin;max-width:58px;height:11vmin;max-height:58px;border-radius:14px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:3.6vmin;background:rgba(30,26,46,.82);border:1px solid rgba(255,255,255,.2)}',
 '#efExtraTgl{position:absolute;right:max(16px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));width:11vmin;max-width:52px;height:11vmin;max-height:52px;border-radius:14px;background:rgba(30,26,46,.82);border:1px solid rgba(255,255,255,.25);color:#fff;font-size:5vmin;display:flex;align-items:center;justify-content:center}',
 '#efRotate{position:fixed;inset:0;z-index:9500;background:#0a0a12;color:#e3e9f2;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;font-family:inherit}',
 '#efRotate.show{display:flex}',
 '#efRotate .ic{font-size:64px;animation:efspin 2.4s ease-in-out infinite}',
 '@keyframes efspin{0%,40%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}',
 '#efRotate h2{margin:18px 0 6px;font-size:22px}#efRotate p{color:#9a8ab0;max-width:340px;margin:0}',
 '#efFs{margin-top:22px;background:linear-gradient(90deg,#7a2adf,#df6b2a);color:#fff;border:0;border-radius:10px;padding:12px 26px;font-size:16px;font-weight:600}'
 ].join('\n');
}

function buildUI(cfg){
 var root=E('div',document.body);root.id='efTouch';T._root=root;
 /* joystick */
 var joy=E('div',root,null);joy.id='efJoy';joy.className='pe';
 var knob=E('div',joy);knob.id='efKnob';
 initJoystick(joy,knob);
 /* primary button cluster — AoV-style: if any button supplies a `pos` it becomes an absolutely
    placed cluster (diamond of skills + corner attack + small utilities); otherwise a simple flex
    row (back-compat for other games). Each button may supply `cd()` -> {secs,frac,off} so the
    layer greys it out, draws a radial cooldown sweep, and shows the seconds remaining each frame. */
 var bw=E('div',root,null);bw.id='efBtns';
 if((cfg.buttons||[]).some(function(b){return b.pos;}))bw.className='cluster';
 T._btns=[];
 (cfg.buttons||[]).forEach(function(b){
  var el=E('div',bw,null,(b.label||'')+(b.sub?'<span class="sub">'+b.sub+'</span>':''));
  el.className='eb pe'+(b.big?' lg':'')+(b.size?(' '+b.size):'');
  if(b.pos){el.style.position='absolute';if(b.pos.right!=null)el.style.right=b.pos.right;
   if(b.pos.bottom!=null)el.style.bottom=b.pos.bottom;}
  if(b.color)el.style.background='radial-gradient(circle at 35% 30%,'+b.color+'cc,'+b.color+'66)';
  var cd=E('div',el);cd.className='ebcd';
  tap(el,function(){ if(el.classList.contains('off'))return; if(b.onTap)b.onTap(); });
  T._btns.push({b:b,el:el,cd:cd});
 });
 /* extras toggle + drawer */
 if(cfg.extra&&cfg.extra.length){
  var tgl=E('div',root,null,'⋯');tgl.id='efExtraTgl';tgl.className='pe';
  var dr=E('div',root,null);dr.id='efExtra';
  cfg.extra.forEach(function(b){var el=E('div',dr,null,b.label||'');el.className='eb pe';tap(el,function(){if(b.onTap)b.onTap();dr.classList.remove('show');});});
  tap(tgl,function(){dr.classList.toggle('show');});
 }
 /* fullscreen entry button (small, top-left-ish via extras area not used) */
 /* rotate gate */
 var rot=E('div',document.body);rot.id='efRotate';
 E('div',rot,null,'🔄').className='ic';
 E('h2',rot,null,'Rotate to landscape');
 E('p',rot,null,'EtherFantasy plays best in landscape. Turn your device sideways — then tap below to go full-screen.');
 var fs=E('button',rot,null,'▶ Play full-screen');fs.id='efFs';
 fs.addEventListener('click',goFullscreen);
 T._rot=rot;
 checkOrient();
 addEventListener('resize',checkOrient);addEventListener('orientationchange',function(){setTimeout(checkOrient,120);});
}

function tap(el,fn){
 el.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();fn();},{passive:false});
}

function initJoystick(base,knob){
 var R,cx,cy,id=null;
 function start(e){var b=base.getBoundingClientRect();R=b.width/2;cx=b.left+R;cy=b.top+R;id=e.pointerId;base.setPointerCapture&&base.setPointerCapture(id);move(e);}
 function move(e){if(id===null||e.pointerId!==id)return;
  var dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy)||1;var cl=Math.min(len,R);
  var ux=dx/len,uy=dy/len;knob.style.transform='translate('+(ux*cl)+'px,'+(uy*cl)+'px)';
  /* small dead-zone: ignore jitter / a light resting finger near centre so the hero doesn't
     drift on a barely-touched stick; rescale beyond it so output still ramps a clean 0->1 (no
     speed loss at the rim). The knob keeps tracking the finger fully for tactile feel. */
  var mag=cl/R,DZ=0.12,m=mag<=DZ?0:(mag-DZ)/(1-DZ);
  T.joy.x=ux*m;T.joy.z=uy*m;T.joy.on=true;
  if(mag>0.25){T._last.x=ux;T._last.z=uy;}}
 function end(e){if(e.pointerId!==id)return;id=null;knob.style.transform='translate(0,0)';T.joy.on=false;T.joy.x=T.joy.z=0;if(T._cfg&&T._cfg.onMoveEnd)T._cfg.onMoveEnd();}
 base.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();start(e);},{passive:false});
 base.addEventListener('pointermove',function(e){e.preventDefault();move(e);},{passive:false});
 base.addEventListener('pointerup',end);base.addEventListener('pointercancel',end);base.addEventListener('lostpointercapture',end);
}

function loop(){
 if(T.joy.on&&T._cfg&&T._cfg.onMove)T._cfg.onMove(T.joy.x,T.joy.z);
 /* per-frame cooldown / disabled visuals (grey-out + radial sweep + seconds) */
 var L=T._btns;
 if(L)for(var i=0;i<L.length;i++){var R=L[i],b=R.b;if(!b.cd)continue;
  var s=b.cd()||{};var secs=(s.secs>0)?s.secs:0;var disabled=!!s.off||secs>0;
  if(R._off!==disabled){R._off=disabled;R.el.classList.toggle('off',disabled);}
  if(secs>0){var deg=Math.max(0,Math.min(1,s.frac||0))*360;
   R.cd.style.display='flex';R.cd.textContent=Math.ceil(secs);
   R.cd.style.background='conic-gradient(rgba(6,8,14,.6) '+deg+'deg, rgba(0,0,0,0) '+deg+'deg)';}
  else if(R._shown!==false){R._shown=false;R.cd.style.display='none';R.cd.style.background='none';}
  if(secs>0)R._shown=true;}
 T._raf=requestAnimationFrame(loop);
}

function checkOrient(){
 if(!T.active||!T._rot){return;}
 /* in menu mode (champion select / lobby) we hide the controls AND the rotate gate so
    they never cover the menu UI — the gate only matters once a match is running */
 if(T._menu){T._rot.classList.remove('show');return;}
 var portrait=(innerHeight>innerWidth);
 T._rot.classList.toggle('show',portrait);
}
function goFullscreen(){
 var el=document.documentElement;
 var rq=el.requestFullscreen||el.webkitRequestFullscreen||el.mozRequestFullScreen;
 if(rq){try{var p=rq.call(el);if(p&&p.then)p.then(lockLand,lockLand);else lockLand();}catch(e){lockLand();}}
 else lockLand();
}
function lockLand(){
 try{if(screen.orientation&&screen.orientation.lock)screen.orientation.lock('landscape').catch(function(){});}catch(e){}
 setTimeout(checkOrient,200);
}

T.init=function(cfg){
 if(!isTouch())return false;
 T.active=true;T._cfg=cfg||{};
 document.documentElement.classList.add('ef-touch');
 injectCSS();buildUI(T._cfg);
 cancelAnimationFrame(T._raf);loop();
 return true;
};
T.isTouch=isTouch;
/* show/hide the on-screen controls. Host calls show(false) during menus (champion select,
   lobby, game-over) and show(true) when a match is live, so the joystick + button bank +
   rotate gate never obscure the menu UI. No-op on non-touch devices. */
T.show=function(on){ if(!T.active)return; T._menu=!on;
 if(T._root)T._root.style.display=on?'':'none';
 checkOrient(); };
window.EF_TOUCH=T;
})();
