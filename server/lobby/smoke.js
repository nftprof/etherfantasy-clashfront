import { WebSocket } from "ws";
const URL = process.env.URL || "ws://localhost:8099";
function client(name){
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(URL); const log=[]; let launched=false;
    const to=setTimeout(()=>reject(new Error(name+" timeout; saw "+log.join(","))),6000);
    ws.on("message",d=>{ const m=JSON.parse(d); log.push(m.t);
      if(m.t==="hello") ws.send(JSON.stringify({t:"auth",token:"dev:"+name}));
      else if(m.t==="auth-ok") ws.send(JSON.stringify({t:"quick",mode:"1v1"}));
      else if(m.t==="room"){ const me=m.players.find(p=>p.username===name); if(me&&!me.ready) ws.send(JSON.stringify({t:"ready",ready:true})); }
      else if(m.t==="launch"){ launched=true; clearTimeout(to); resolve({name,party:m.party,team:m.team,seats:m.seats.length}); }
      else if(m.t==="auth-failed"){ clearTimeout(to); reject(new Error(name+" auth-failed "+m.reason)); }
    });
    ws.on("error",e=>{clearTimeout(to);reject(e);});
  });
}
const [a,b]=await Promise.all([client("Alice"),client("Bob")]);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log("FAIL",m));};
ok(a.party && a.party===b.party,"both launched with same party");
ok(a.team!==b.team,"opposite teams");
ok(a.seats===2 && b.seats===2,"both see 2 seats");
console.log(`E2E: Alice(team ${a.team}) + Bob(team ${b.team}) party=${a.party}`);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail?1:0);
