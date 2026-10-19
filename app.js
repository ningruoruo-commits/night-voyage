/* Copyright (c) 2026 若若 | SPDX-License-Identifier: MIT | See LICENSE. */

"use strict";
// ───────────── 节点资源 ─────────────
let CONFIG;
try { CONFIG = OrbitData.validateConfig(window.ORBIT_CONFIG); }
catch (error) { const warning=document.createElement('p'); warning.id='configError'; warning.setAttribute('role','alert'); warning.textContent='配置无效：请检查 config.js 的七个固定槽位、名称长度、颜色和刷新间隔。'; document.body.prepend(warning); throw error; }
const FAM=CONFIG.members.map(member=>({...member}));
document.title=CONFIG.title+' · 独立模拟展示';
document.querySelector('.brand').replaceChildren(document.createElement('i'),document.createTextNode(CONFIG.brand));
document.querySelector('#activityDetail summary').textContent=CONFIG.central.name+' · 模拟节律';
document.querySelector('#activityDetail p').textContent=CONFIG.central.name+' / '+FAM[0].name+' · 合成的 24 小时样例';
function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(className)n.className=className;return n;}
const safeColor=value=>/^#[0-9a-f]{6}$/i.test(value||'')?value:'#9aa3ae';
function colored(tag,text,color,className){const n=node(tag,text,className);n.style.color=safeColor(color);return n;}
const byKey=Object.fromEntries(FAM.map((f,i)=>[f.key,Object.assign(f,{i})]));
// 六个节点一圈，中继站在正中
const SPOTS=[[0,-.74],[.76,-.36],[.72,.42],[0,.8],[-.72,.42],[-.76,-.36],[0,.02]];
FAM.forEach((f,i)=>{f.x=SPOTS[i][0];f.y=SPOTS[i][1];f.r=.22;f.organs=[];f.cpu=0;f.mb=0;f.procs=0;f.busy=false;f.ping=-99});
function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0}
function rng(seed){let s=seed>>>0||1;return()=>(s=Math.imul(s,1664525)+1013904223>>>0)/4294967296}
function rgba(hex,a){const n=parseInt(hex.slice(1),16);return`rgba(${n>>16&255},${n>>8&255},${n&255},${a})`}
const $=id=>document.getElementById(id);
// ───────────── 3D：中心信标是主星，节点资源是绕着她转的行星 ─────────────
const VIEW={tilt:1.18,D:4.4,cy:1,sy:0,ct:1,st:0,offY:-.04,px:0,py:0};
const STAR={key:'observer',name:CONFIG.central.name,color:CONFIG.central.color,x:0,y:0,sr:.135,ps:1,t:0,v:[0,0,0],isStar:true,organs:[],spinA:0,ob:.25,r:.3};
// 轨道半径 / 倾角 / 升交点
const ORB={member1:[.87,0,0],member2:[.91,0,0],member3:[.95,0,0],member4:[.99,0,0],member5:[1.03,0,0],member6:[1.07,0,0],member7:[.83,0,0]};
const RINGED={member1:1,member6:1};
function setView(dt){
  // Fixed viewpoint: the central star and orbital lanes never travel with a selected member.
  const yaw=-.12,tilt=VIEW.tilt;
  VIEW.cy=Math.cos(yaw);VIEW.sy=Math.sin(yaw);VIEW.ct=Math.cos(tilt);VIEW.st=Math.sin(tilt);
}
// 世界坐标(y 朝上) → 视图基 [右, 屏幕向下, 朝向镜头]
function V3(x,y,z){const x3=x*VIEW.cy-z*VIEW.sy,z3=x*VIEW.sy+z*VIEW.cy;return[x3,z3*VIEW.st-y*VIEW.ct,z3*VIEW.ct+y*VIEW.st]}
function P3(x,y,z){const v=V3(x,y,z),s=VIEW.D/(VIEW.D-v[2]);return{x:v[0]*s*.94,y:v[1]*s*.84+VIEW.offY,s,t:v[2],v}}
function orbitPos(f,a){const R=f.orR,x0=Math.cos(a)*R,z0=Math.sin(a)*R,y1=-z0*Math.sin(f.inc),z1=z0*Math.cos(f.inc),cn=Math.cos(f.node),sn=Math.sin(f.node);
  return[(x0*cn-z1*sn)*AX,y1,x0*sn+z1*cn]}
function spherePts(n,seed,band){const R=rng(seed),a=new Float32Array(n*4),ph=R()*6.28,fr=5+R()*6;
  for(let i=0;i<n;i++){const y=1-2*(i+.5)/n,r=Math.sqrt(Math.max(0,1-y*y)),th=i*2.399963+R()*.25,k=1+(R()-.5)*.05;
    a[i*4]=Math.cos(th)*r*k;a[i*4+1]=y*k;a[i*4+2]=Math.sin(th)*r*k;
    a[i*4+3]=band?.35+.65*(.5+.5*Math.sin(y*fr+ph+Math.sin(th*3)*.25))*(.6+.4*R()):.4+.6*R()}
  return a}
function ringPts(n,seed){const R=rng(seed),a=new Float32Array(n*3);for(let i=0;i<n;i++){const th=R()*6.283,rr=1.45+Math.pow(R(),.7)*.65;a[i*3]=Math.cos(th)*rr;a[i*3+1]=Math.sin(th)*rr;a[i*3+2]=.3+.7*R()}return a}
function updateOrbits(dt){
  // Continuous phase spacing. Projected glow overlap must never lock orbital motion.
  const tau=Math.PI*2,gapGoal=tau/FAM.length,proposed=new Map();
  for(const f of FAM){
    const next=FAM[(f.i+1)%FAM.length],gap=((next.ang-f.ang)%tau+tau)%tau;
    const spacing=Math.max(.65,Math.min(1.2,1+(gap-gapGoal)*.65));
    const target=orbitSpeed*spacing;
    if(f.orbitRate==null)f.orbitRate=target;
    f.orbitRate+=(target-f.orbitRate)*(1-Math.exp(-dt*5));
    proposed.set(f,f.ang+dt*f.w*(reducedMotion?0:f.orbitRate));
  }
  for(const f of FAM){if(f.orR==null)continue;f.ang=proposed.get(f);f.spinA+=dt*f.spin;
    const w=orbitPos(f,f.ang),p=P3(w[0],w[1],w[2]);f.wx=w[0];f.wy=w[1];f.wz=w[2];f.x=p.x;f.y=p.y;f.ps=p.s;f.t=p.t;f.v=p.v;f.r=f.sr*2.7*p.s;
    const k=f.sr*p.s;
    for(const o of f.organs){if(o.ma==null)continue;o.ma+=dt*o.msp;const c=Math.cos(o.ma)*o.md,s=Math.sin(o.ma)*o.md,m=V3(c,s*o.mi,s);
      o.mx=f.x+m[0]*k;o.my=f.y+m[1]*k;o.front=m[2]>0}}
  const p=P3(0,0,0);STAR.x=p.x;STAR.y=p.y;STAR.ps=p.s;STAR.t=p.t;STAR.v=p.v;STAR.spinA+=dt*.28;STAR.r=STAR.sr*2.2*p.s;
}
const SANS=getComputedStyle(document.documentElement).getPropertyValue("--sans"),MONO=getComputedStyle(document.documentElement).getPropertyValue("--mono");
const pad=n=>String(n).padStart(2,"0");
function fmtMB(m){return m>=1024?(m/1024).toFixed(2)+"G":Math.round(m)+"M"}
function fmtBps(b){return b>=1048576?(b/1048576).toFixed(1)+"M":b>=1024?(b/1024).toFixed(1)+"k":Math.round(b)+"B"}
function fmtLeft(s){if(!isFinite(s))return"—";s=Math.max(0,Math.round(s));const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),x=s%60;return(d?d+"d ":"")+pad(h)+":"+pad(m)+":"+pad(x)}

// ───────────── 数据 ─────────────
const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion=motionQuery.matches;
motionQuery.addEventListener('change',e=>{reducedMotion=e.matches});
const pointerDepth={x:0,y:0};
let patrolKey=null;
function syncPatrol(f){
  if(!f||patrolKey===f.key)return;patrolKey=f.key;
  document.documentElement.style.setProperty('--patrol',f.color);
  for(const id of ['bars','pRadar','logIn']){const panel=$(id).closest('.panel');if(panel){panel.classList.add('patrol-panel');panel.style.setProperty('--patrol',f.color)}}
}
let activityReady=false,lastActivity=0,homeUntil=0;
function observeActivity(raw,fresh){
 const stamp=typeof raw==='string'?Date.parse(raw):typeof raw==='number'?raw*1000:NaN;
 if(!fresh||!Number.isFinite(stamp)||stamp>Date.now()+60000)return false;
 if(!activityReady){activityReady=true;lastActivity=stamp;return false;}
 if(stamp<=lastActivity)return false;lastActivity=stamp;return true;
}
function welcomeActivity(){
  homeUntil=now+8;const home=byKey.member7;
  goTo(home);addLog('her','检测到中心信标新活动 · 返回中继','#ff7aa8');
  pulses.push({x:home.x,y:home.y,born:now,c:'#ff7aa8',big:1});pulses.push({x:STAR.x,y:STAR.y,born:now,c:'#ff7aa8',big:1});
  if(reducedMotion){homeUntil=0;setFocusTitle(home)}
}
let LIVE=null,online=false,dataMode='demo',inputExpires=0,lastInputError='';
let generation=0;
function clearTransientData(){
 generation++;LOG.length=0;seenEv.clear();seenT.clear();seenN.clear();firstEv=true;
 activityReady=false;lastActivity=0;homeUntil=0;wfGate=workflowGate();wfHistory.length=0;wfSignals.length=0;wfModel=null;wfLastSample=null;wfSelected=null;crab.tags=[];spi.tag=null;spi.plan=[];spi.cur={f:byKey.member7};spi.t=1;spi.at=null;drone.tag=null;packets.length=0;
 sentinelState.seen.clear();sentinelState.alert=null;sentinelState.pending=null;sentinelState.demoActive=false;sentinelState.mode='scan';sentinelState.since=performance.now();
 sceneDemoStart=null;sceneDemoBeat=-1;$('sentinelDemo').disabled=false;$('sentinelDemo').textContent='全景演示';
 for(const f of FAM)f.organs=[];
 for(const id of ['logFull','processDetail','instrumentText','tip'])$(id)?.replaceChildren();
 $('tip').style.display='none';$('logDialog').close();$('instrumentDialog')?.close();
 tickerPending=null;$('tk').replaceChildren();
}
function enterDemo(error=''){
 clearTransientData();dataMode='demo';inputExpires=0;lastInputError=error;LIVE=OrbitData.createDemo(CONFIG);online=true;absorb();
}
async function pull(){
 if(dataMode==='local'&&Date.now()>inputExpires){enterDemo('本地输入已过期，已清除并恢复模拟');return;}
 if(dataMode==='demo')LIVE=OrbitData.createDemo(CONFIG);
 online=true;absorb();
}
window.OrbitDemo=Object.freeze({
 setSnapshot(raw){
  try{const next=OrbitData.validateSnapshot(raw);if(dataMode!=='local')clearTransientData();LIVE=next;dataMode='local';inputExpires=Date.now()+15000;lastInputError='';online=true;absorb();return{ok:true};}
  catch(error){enterDemo('输入格式无效，已清除并恢复模拟');return{ok:false,error:'INVALID_SNAPSHOT'};}
 },
 useDemo(){enterDemo();return{ok:true};},
 getStatus(){return{mode:dataMode,expiresAt:inputExpires||null,error:lastInputError,workflowEvents:wfModel?.events.length||0,workflowSignals:wfSignals.length,audioEnabled:roomAudio.on,audioState:roomAudio.ctx?.state||'not-created',activeVoices:roomAudio.voices.size,reducedMotion};}
});
function absorb(){
  for(const g of LIVE.groups){const f=byKey[g.key];if(!f)continue;
    f.cpu=g.cpu;f.mb=g.mb;f.procs=g.procs;f.busy=g.busy;
    const old=new Map(f.organs.map(o=>[o.name,o]));
    f.organs=g.organs.slice(0,9).map(o=>{const prev=old.get(o.name);const R=rng(hash(f.key+o.name));const a=R()*6.283,d=.25+R()*.62;
      return Object.assign(prev||{ox:Math.cos(a)*d,oy:Math.sin(a)*d*.8,ph:R()*6.28,ma:R()*6.283,md:1.55+R()*1.1,msp:(.22+R()*.4)*(R()<.5?-1:1),mi:(R()-.5)*.9},o)});
  }
  LIVE.sent=LIVE.sent||{house:{},beacon:{}};
  pushWave();
  if(!skyReady)buildSky();
  renderPanels();if(focusKey)showProcesses(focusKey);
  if(observeActivity(LIVE.activity&&LIVE.activity.last_input,online))welcomeActivity();
  updateWorkflow(LIVE);
}
const H_=()=>LIVE&&LIVE.sent&&LIVE.sent.house||{},T_=()=>LIVE&&LIVE.sent&&LIVE.sent.beacon||{};
function badChecks(){return(H_().checks||[]).filter(c=>c.sev&&c.sev!=="ok")}

// ───────────── 天空 ─────────────
const sky=$("sky"),cx=sky.getContext("2d"),hole=$("hole");
let W=0,H=0,DPR=1,S=1,CX=0,CY=0,HW=0,HH=0,AX=1,skyReady=false,MOBILE=false;
const cam={x:0,y:0,z:1};
const sprites=[];let GLOW=[];
function resize(){
  MOBILE=innerWidth<=1000;
  const b=sky.getBoundingClientRect(),hb=hole.getBoundingClientRect();
  W=b.width;H=b.height;DPR=Math.min(devicePixelRatio||1,MOBILE?2:1.6);
  sky.width=W*DPR;sky.height=H*DPR;
  HW=hb.width;HH=hb.height;CX=hb.left-b.left+HW/2;CY=hb.top-b.top+HH/2+(MOBILE?0:-10);
  AX=Math.max(.78,Math.min(1.45,HW/HH*.95));
  S=Math.min(HW/(AX*2.55),(HH-70)/2.2)*(MOBILE?1:1.06);
  resizePanels();
  if(skyReady)buildSky();
}
addEventListener("resize",()=>{clearTimeout(resize.t);resize.t=setTimeout(resize,150)});
function buildSky(){
  skyReady=true;sprites.length=0;
  GLOW=FAM.map(f=>{const c=document.createElement("canvas");c.width=c.height=32;const g=c.getContext("2d"),r=g.createRadialGradient(16,16,0,16,16,16);
    r.addColorStop(0,rgba(f.color,1));r.addColorStop(.25,rgba(f.color,.35));r.addColorStop(1,rgba(f.color,0));g.fillStyle=r;g.fillRect(0,0,32,32);return c});
  const maxMb=Math.max(...FAM.map(f=>f.mb||1));
  FAM.forEach(f=>{
    const o=ORB[f.key];f.orR=o[0];f.inc=o[1];f.node=o[2];
    if(f.ang==null){const R=rng(hash(f.key+"orb"));f.ang=-.45+f.i*Math.PI*2/7;f.spinA=R()*6.283;f.ob=(R()-.5)*.7;f.w=.078;f.spin=.42+R()*.38}
    f.sr=(f.key==="member7"?.066:.074)+.05*Math.sqrt((f.mb||20)/maxMb);
    if(!f.pts){f.pts=spherePts(MOBILE?520:1000,hash(f.key),true);if(RINGED[f.key])f.ring=ringPts(MOBILE?160:280,hash(f.key+"ring"))}
  });
  if(!STAR.pts)STAR.pts=spherePts(MOBILE?900:1800,hash("observer"),false);
  updateOrbits(0);
}
function W2S(x,y){return[(x-cam.x)*S*cam.z+CX,(y-cam.y)*S*cam.z+CY]}
function bez(a,c,b,t){const u=1-t;return{x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y}}
function ease(t){return t<.5?2*t*t:1-(-2*t+2)**2/2}

// ───────────── 三只小爬虫 ─────────────
// 1) Rover 巡游角色。哪团忙去哪团，戳一戳，挂标签
const CLAWD=["..XXXXXXX..","..XXXXXXX..","XX.XXXXX.XX","XXXXXXXXXXX","..XXXXXXX..","..XXXXXXX.."];
const crab={x:.25,y:.15,from:null,to:null,t:1,dur:2.6,dwell:0,at:null,trails:[],tags:[],walkPh:0};
let focusKey=null,hoverKey=null,line=0;
function pickNext(){
  if(focusKey)return byKey[focusKey];
  const pool=FAM.filter(f=>f!==crab.at);
  const w=pool.map(f=>.6+Math.log1p(f.cpu*4)+(f.busy?2.5:0)+Math.log1p(f.procs)*.25);
  let r=Math.random()*w.reduce((a,b)=>a+b);for(let i=0;i<pool.length;i++){if((r-=w[i])<0)return pool[i]}return pool[0];
}
function ringDockOffset(f,side){
 const st=DUST_STYLE[f.key]||[1.5,.5],r=f.sr*(f.ps||1)*(st[0]+st[1])+28/(S*cam.z);
 return{x:side*r*.88,y:r*.48};
}
function goTo(f){
  if(!f)return;const from={x:crab.x,y:crab.y},off=ringDockOffset(f,1),to={x:f.x+off.x,y:f.y+off.y};crab.off=off;
  const mx=(from.x+to.x)/2,my=(from.y+to.y)/2,nx=-(to.y-from.y),ny=to.x-from.x,bend=(Math.random()-.5)*.9;
  crab.from=from;crab.to=to;crab.ctrl={x:mx+nx*bend,y:my+ny*bend};crab.t=0;crab.dur=1.8+Math.hypot(to.x-from.x,to.y-from.y)*1.1;
  crab.target=f;crab.tags=[];crab.at=null;syncPatrol(f);
  crab.trails.push({from,to,ctrl:crab.ctrl,born:now,life:14});if(crab.trails.length>5)crab.trails.shift();
  addLog("walk",pad(f.i+1)+" · rover → "+f.name,f.color);line=3;
  if(reducedMotion){crab.x=to.x;crab.y=to.y;crab.t=1;arrive(f)}
}
function arrive(f){
  const currentGeneration=generation;
  crab.at=f;crab.dwell=focusKey?9:5+Math.random()*2.5;f.ping=now;
  crab.tags=f.organs.slice(0,MOBILE?4:6).map((o,i)=>({o,born:reducedMotion?now-1:now+.15+i*.16}));
  addLog("scan",`${f.name} · ${f.procs} procs · ${fmtMB(f.mb)}`,f.color);
  const hot=f.organs.filter(o=>o.cpu>.5);
  hot.slice(0,2).forEach((o,i)=>setTimeout(()=>currentGeneration===generation&&addLog("wave",`${o.name} ${o.cpu.toFixed(1)}%`,"#ffd479"),500+i*500));
  const fat=f.organs.find(o=>o.mb>200);if(fat)setTimeout(()=>currentGeneration===generation&&addLog("flag",`${fat.name} 胖了 ${fmtMB(fat.mb)}`,"#ff7088"),1400);
  line=hot.length?8:5;setFocusTitle(f);
}
function roleScreen(x,y){let [sx,sy]=W2S(x,y);
 for(let pass=0;pass<3;pass++)for(const f of [STAR,...FAM]){if(f.sx==null)continue;const dx=sx-f.sx,dy=sy-f.sy,d=Math.hypot(dx,dy),r=f.rp*((DUST_STYLE[f.key]||[1.5,.5])[0]+(DUST_STYLE[f.key]||[1.5,.5])[1])+(MOBILE?20:28);if(d<r){const a=d>.1?Math.atan2(dy,dx):.7;sx=f.sx+Math.cos(a)*r;sy=f.sy+Math.sin(a)*r}}
 return [Math.max(CX-HW/2+52,Math.min(CX+HW/2-52,sx)),Math.max(CY-HH/2+100,Math.min(CY+HH/2-108,sy))];
}
function drawCrab(sx,sy,scale,walking){
  const px=Math.max(2.4,2.9*scale),w=11*px,h=6*px,ox=sx-w/2,oy=sy-h/2-px;
  cx.save();cx.translate(sx,sy);
  const n=MOBILE?18:26;cx.strokeStyle="rgba(120,230,220,.55)";cx.lineWidth=1;
  for(let i=0;i<n;i++){const a=i/n*6.283+now*.15,len=(14+7*Math.sin(now*3+i*1.7))*scale*.85+(crab.at?8:0)*scale*.65,r0=w*.62;
    const bx=Math.cos(a+.25*Math.sin(now*2+i))*(r0+len),by=Math.sin(a+.25*Math.sin(now*2+i))*(r0+len);
    cx.beginPath();cx.moveTo(Math.cos(a)*r0,Math.sin(a)*r0);cx.quadraticCurveTo(Math.cos(a+.15)*(r0+len*.6),Math.sin(a+.15)*(r0+len*.6),bx,by);cx.stroke();
    cx.fillStyle="rgba(190,255,245,.8)";cx.fillRect(bx-1,by-1,2,2)}
  cx.strokeStyle="rgba(120,230,220,.75)";cx.lineWidth=1.2;cx.beginPath();cx.ellipse(0,0,w*.62,w*.5,0,0,6.283);cx.stroke();
  cx.fillStyle="rgba(10,40,44,.55)";cx.fill();cx.restore();
  cx.fillStyle="#e8774d";
  CLAWD.forEach((row,y)=>{[...row].forEach((ch,x)=>{if(ch==="X")cx.fillRect(ox+x*px,oy+y*px,px+.5,px+.5)})});
  const lp=walking?Math.sin(crab.walkPh)>0:false;
  [2,4,6,8].forEach((x,i)=>{const up=walking&&((i%2===0)===lp)?-px*.6:0;cx.fillRect(ox+x*px,oy+6*px+up,px,px*1.4)});
  cx.fillStyle="#140805";const blink=(now%4.3)<.12;
  [[3,1],[7,1]].forEach(([x,y])=>cx.fillRect(ox+x*px,oy+y*px+(blink?px*.8:0),px,blink?px*.25:px*1.1));
  label(sx,sy+h+px*3+4,byKey.member1.name+" · rover","#e8774d");
}
function label(x,y,t,c){cx.font=`9px ${MONO}`;cx.textAlign="center";cx.fillStyle=rgba(c,.85);cx.fillText(t,x,y)}

// 2) 机房哨兵：一圈一圈逐节点巡检，向检查节点报告
const spi={x:-.2,y:.35,from:null,to:null,ctrl:null,t:1,dur:1,dwell:.5,plan:[],round:0,at:null,tag:null,ph:0,trail:[]};
function spiNext(){
  if(!spi.plan.length){
    spi.round++;const order=["member1","member2","member3","member4","member5","member6","member7"];
    spi.plan=order.map(k=>({f:byKey[k]}));
    const bad=badChecks();if(bad.length)spi.plan.push({f:byKey.member4,report:bad});
  }
  const p=spi.plan.shift();spi.cur=p;
  const off=ringDockOffset(p.f,-1),to={x:p.f.x+off.x,y:p.f.y+off.y};spi.off=off;spi.tf=p.f;
  spi.from={x:spi.x,y:spi.y};spi.to=to;
  const nx=-(to.y-spi.y),ny=to.x-spi.x;spi.ctrl={x:(spi.x+to.x)/2+nx*.25,y:(spi.y+to.y)/2+ny*.25};
  spi.t=0;spi.dur=.7+Math.hypot(to.x-spi.x,to.y-spi.y)*.75;spi.at=null;spi.tag=null;
}
function spiArrive(){
  const p=spi.cur;spi.at=p.f;
  if(p.report){
    const c=p.report[0];spi.tag={t:`→ ${byKey.member4.name}：${c.name} ${c.detail||c.sev}`,c:"#ff5f6d",born:now};spi.dwell=3.2;
    pulses.push({x:spi.x,y:spi.y,born:now,c:"#ff5f6d",big:1});
    addLog("flag",`哨兵 → ${byKey.member4.name} · ${c.name} ${c.detail||""}`,"#ff5f6d");
  }else{
    const h=H_();spi.dwell=.55;pulses.push({x:p.f.x,y:p.f.y,born:now,c:"#ff5f6d"});
    if(p.f.key==="member7"){spi.tag={t:`✓ ${h.healthy??"?"}/${h.total??"?"} · 第${(h.rounds||0).toLocaleString()}轮`,c:"#ff9aa4",born:now};spi.dwell=1.8;
      addLog("ping",`机房哨兵 巡完一圈 ${h.healthy??"?"}/${h.total??"?"}`,"#ff5f6d")}
  }
}
function drawSpider(sx,sy,sc,moving,g=cx,caption=true){
 const u=Math.max(2.1,2.6*sc),ph=spi.ph,mode=sentinelState?.mode||'scan',alert=mode==='startled',carry=['rush','exchange'].includes(mode),accent=alert?'#ffd0a0':'#f6a5e1';
 g.save();g.translate(sx,sy);g.scale(u,u);g.lineCap='round';g.lineJoin='round';
 // Feet stay planted in screen coordinates; each alternating group takes a real step.
 const heading=Number.isFinite(spi.heading)?spi.heading:0;
 let rig=spi.plantedRig;
 if(!rig||Math.hypot(sx-rig.x,sy-rig.y)>90||Math.abs(rig.u-u)>.1||now-rig.time>.5){
  rig=spi.plantedRig={x:sx,y:sy,u,time:now,angle:heading,feet:[],group:0};
 }
 const dt=Math.max(0,Math.min(.06,now-rig.time)),dx=sx-rig.x,dy=sy-rig.y;
 const velocity=dt>.001?{x:dx/dt,y:dy/dt}:{x:0,y:0};
 const rawSpeed=Math.hypot(velocity.x,velocity.y),speed=Math.min(180,rawSpeed);
 if(rawSpeed>180){velocity.x*=180/rawSpeed;velocity.y*=180/rawSpeed;}
 const turn=Math.atan2(Math.sin(heading-rig.angle),Math.cos(heading-rig.angle));
 rig.angle+=turn*(1-Math.exp(-dt*12));
 const angle=rig.angle,c=Math.cos(angle),sn=Math.sin(angle);
 const world=(x,y)=>({x:sx+u*(x*c-y*sn),y:sy+u*(x*sn+y*c)});
 const local=(x,y)=>({x:((x-sx)*c+(y-sy)*sn)/u,y:(-(x-sx)*sn+(y-sy)*c)/u});
 const stepping=rig.feet.some(f=>f.swing);
 const candidates=[];
 for(let j=0;j<8;j++){
  const side=j<4?-1:1,i=j%4,home=world(side*[5.4,6.9,7,5.2][i],[-8,-3.2,3,7.5][i]);
  let foot=rig.feet[j];if(!foot)foot=rig.feet[j]={x:home.x,y:home.y,swing:false,group:(i+(side>0?1:0))%2};
  const error=Math.hypot(home.x-foot.x,home.y-foot.y)/u;
  candidates.push({foot,home,error,side,i});
 }
 if(!stepping){
  const ready=candidates.filter(q=>q.error>(moving?1.35:2.2));
  if(ready.length){
   if(!ready.some(q=>q.foot.group===rig.group))rig.group=1-rig.group;
   for(const q of candidates){if(q.foot.group!==rig.group||q.error<.65)continue;
    const f=q.foot,lead=moving?Math.min(.08,1.5*u/Math.max(1,speed)):0;
    f.fromX=f.x;f.fromY=f.y;f.toX=q.home.x+velocity.x*lead;f.toY=q.home.y+velocity.y*lead;
    f.start=now;f.duration=Math.max(.075,Math.min(.15,9/Math.max(45,speed)));f.swing=true;
   }rig.group=1-rig.group;
  }
 }
 const joints=[];
 g.rotate(angle);
 for(const q of candidates){
  const f=q.foot;let lift=0;
  const reach=Math.hypot(f.x-sx,f.y-sy)/u;
  // A moving target can accelerate sharply: catch up before a leg overextends.
  if(!f.swing&&(reach>12.5||local(f.x,f.y).x*q.side<.8||q.error>3.8)&&!candidates.some(z=>z.foot.swing&&z.foot.group!==f.group)){
   f.fromX=f.x;f.fromY=f.y;f.toX=q.home.x+velocity.x*Math.min(.045,1.5*u/Math.max(1,speed));f.toY=q.home.y+velocity.y*Math.min(.045,1.5*u/Math.max(1,speed));f.start=now;f.duration=.085;f.swing=true;
  }
  if(f.swing){
   const t=Math.min(1,(now-f.start)/f.duration),e=t*t*(3-2*t);
   f.x=f.fromX+(f.toX-f.fromX)*e;f.y=f.fromY+(f.toY-f.fromY)*e;lift=Math.sin(t*Math.PI)*1.5;
   if(t>=1){f.swing=false;f.x=f.toX;f.y=f.toY;}
  }
  const foot=local(f.x,f.y),rx=q.side*.65,ry=-2.7+q.i*1.8;
  // Two-link elbow bends strongly while the toe lifts, then straightens on landing.
  let ddx=foot.x-rx,ddy=foot.y-lift-ry;
  let d=Math.hypot(ddx,ddy);
  if(d>9){ddx*=9/d;ddy*=9/d;d=9;}
  if(d<.01){ddx=q.side*.01;ddy=0;d=.01;}
  const tx=rx+ddx,ty=ry+ddy,L=4.6,bend=Math.sqrt(Math.max(0,L*L-d*d*.25));
  const kx=(rx+tx)*.5+(-ddy/d)*bend*q.side,ky=(ry+ty)*.5+(ddx/d)*bend*q.side;
  g.strokeStyle=accent;g.lineWidth=.23;g.shadowColor=accent;g.shadowBlur=2.4;g.globalAlpha=f.swing?1:.72;
  g.beginPath();g.moveTo(rx,ry);g.lineTo(kx,ky);g.lineTo(tx,ty);g.stroke();joints.push([kx,ky,.27],[tx,ty,f.swing?.24:.3]);
 }
 rig.x=sx;rig.y=sy;rig.time=now;
 g.globalAlpha=.9;g.lineWidth=.28;g.beginPath();g.moveTo(-.65,-3);g.lineTo(-.65,2.2);g.lineTo(0,3);g.lineTo(.65,2.2);g.lineTo(.65,-3);g.stroke();
 g.strokeStyle='#b6f5ff';g.lineWidth=.2;g.beginPath();g.moveTo(0,-2.7);g.lineTo(0,1.7);g.stroke();
 joints.push([0,2.3,.46],[0,-3,.3]);
 g.fillStyle='#defaff';g.shadowColor='#e3a8ed';g.shadowBlur=3.5;
 for(const [x,y,r] of joints){g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();}
 if(carry){g.strokeStyle='#a7f5ff';g.lineWidth=.28;g.save();g.translate(0,4.3);g.rotate(Math.PI/4);g.strokeRect(-.7,-.7,1.4,1.4);g.restore();}
 g.restore();
 if(caption){g.save();g.font='10px '+SANS;g.textAlign='center';g.fillStyle=accent;g.fillText('机房哨兵',sx,sy+u*9+5);g.restore();}
}

// 3) 信标哨兵：在最外圈绕着飞，隔一阵朝外面的世界射一束光，看 beacon 有没有重置
const drone={a:-1.2,fire:0,next:6,tag:null,x:0,y:0};
function drawDrone(sx,sy,sc){
  const px=Math.max(1.6,1.8*sc);cx.save();cx.translate(sx,sy+Math.sin(now*2.2)*px);
  cx.fillStyle="#e9eef4";cx.fillRect(-px*3,-px*2,px*6,px*4);cx.fillRect(-px*4,-px*1,px,px*2);cx.fillRect(px*3,-px*1,px,px*2);
  const lx=Math.cos(drone.look||0)*px*.9,ly=Math.sin(drone.look||0)*px*.6;
  cx.fillStyle="#0a0d12";cx.fillRect(-px*1.5,-px*1.2,px*3,px*2.4);
  cx.fillStyle=drone.fire>0?"#ff7aa8":"#5fe0d0";cx.fillRect(-px*.6+lx,-px*.6+ly,px*1.2,px*1.2);
  cx.fillStyle="#e9eef4";cx.fillRect(-px*.3,-px*3.6,px*.6,px*1.6);
  cx.fillStyle=(now%1.2)<.6?"#ff5f6d":"#3a1015";cx.fillRect(-px*.6,-px*4.4,px*1.2,px*1);
  // 小翅膀
  cx.strokeStyle="rgba(233,238,244,.6)";cx.lineWidth=1;const fl=Math.sin(now*30)*px*.8;
  cx.beginPath();cx.moveTo(-px*4,-px);cx.lineTo(-px*6.5,-px*2.2+fl);cx.moveTo(px*4,-px);cx.lineTo(px*6.5,-px*2.2+fl);cx.stroke();
  cx.restore();label(sx,sy+px*6+6,"信标哨兵","#dfe7ee");
}

// ───────────── 画面 ─────────────
let now=0,lastT=0,frames=0,fpsT=0,fc=0;
const beams=[],packets=[],pulses=[],flows=[];
const NODES=FAM.concat(STAR);
[[0,7],[1,7],[2,7],[3,7],[4,7],[5,7],[6,7],[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[6,0],[3,6]].forEach(([a,b])=>beams.push({a,b,t:Math.random(),sp:.05+Math.random()*.07,bend:(Math.random()-.5)*.45}));
const HEX="0123456789abcdef";const hex=n=>[...Array(n)].map(()=>HEX[Math.random()*16|0]).join("");
const RAIN=[...Array(8)].map((_,i)=>({x:i,off:Math.random()*100,sp:18+Math.random()*30,s:[...Array(40)].map(()=>HEX[Math.random()*16|0])}));

let sceneDemoStart=null,sceneDemoBeat=-1;
function sceneDemoAge(){return sceneDemoStart===null?-1:now-sceneDemoStart;}
function sceneDemoOn(){const t=sceneDemoAge();return t>=0&&t<24;}
let autoWorkKey=null,orbitSpeed=6;
function activeWorkItems(){
 if(!wfModel||wfModel.freshness!=='fresh'||Date.now()-wfModel.sampled>60000)return [];
 const latest=new Map();
 for(const e of wfModel.events){if(!e.wire||!e.token)continue;const prev=latest.get(e.token);if(!prev||e.time>=prev.time)latest.set(e.token,e);}
 return [...latest.values()].filter(e=>e.kind==='working'&&Date.now()-e.time<86400000).sort((a,b)=>a.time-b.time);
}
function cameraWork(){
 const jobs=activeWorkItems(),same=jobs.find(e=>e.key===autoWorkKey),job=same||jobs[0];
 autoWorkKey=job?job.key:null;
 return job?{key:job.key,label:byKey[job.key].name+' · '+(job.kind==='invocation'?'闹钟调用中':'处理中'),count:jobs.length}:null;
}
function drawWorkFocus(){
 const work=cameraWork(),jobs=activeWorkItems();cx.save();cx.textAlign='center';cx.font='11px '+SANS;
 for(const e of jobs){const f=byKey[e.key];if(!f)continue;const q=W2S(f.x,f.y),r=f.sr*f.ps*S*cam.z*1.15;
 cx.strokeStyle=f.color;cx.globalAlpha=.65;cx.lineWidth=2;cx.beginPath();cx.arc(q[0],q[1],r,now*.9,now*.9+1.1);cx.stroke();}
 const msg=focusKey?'选中 · '+byKey[focusKey].name:work?(work.label+(work.count>1?' · 另有 '+(work.count-1)+' 项':'')):'中心信标居中 · 轨道公转';
 cx.globalAlpha=.9;cx.fillStyle=work?'#e7d7ff':'#94b9c9';if(!MOBILE)cx.fillText(msg,CX,CY-HH/2+36);cx.restore();
}

function frame(ts){
  requestAnimationFrame(frame);
  if(document.hidden||!skyReady)return;
  if(reducedMotion&&ts-lastT<100)return;
  const dt=reducedMotion?0:Math.min(.05,(ts-lastT)/1000||.016);lastT=ts;now+=dt;fc++;
  frames++;if(ts-fpsT>1000){$("fps").textContent=frames+" fps";frames=0;fpsT=ts}
  const work=cameraWork(),foc=focusKey?byKey[focusKey]:null;
  setView(dt);updateOrbits(dt);
  cam.x=0;cam.y=0;cam.z=1;
  cx.setTransform(DPR,0,0,DPR,0,0);
  cx.fillStyle="#02050c";cx.fillRect(0,0,W,H);
  const nebula=cx.createRadialGradient(CX,CY,0,CX,CY,Math.max(HW,HH)*.72);nebula.addColorStop(0,"rgba(48,23,76,.52)");nebula.addColorStop(.4,"rgba(11,32,54,.36)");nebula.addColorStop(1,"rgba(2,5,12,0)");
  cx.fillStyle=nebula;cx.fillRect(CX-HW/2-20,CY-HH/2-20,HW+40,HH+40);
  drawBackdrop(dt);
  cx.save();cx.beginPath();cx.rect(CX-HW/2,CY-HH/2,HW,HH);cx.clip();
  // Keep the actual 3D orbits, without the central radar grid.
  drawOrbits(foc);
  drawDistantWave();
  cx.globalCompositeOperation="lighter";
  // 流光
  const last=LIVE&&LIVE.hist.length?LIVE.hist[LIVE.hist.length-1]:{tx:20000},speed=.6+Math.min(2.5,Math.log10(1+last.tx/2000));
  for(const b of beams){b.t=(b.t+dt*b.sp*speed*.5)%1;const A=NODES[b.a],B=NODES[b.b];
    const c={x:(A.x+B.x)/2+(B.y-A.y)*b.bend,y:(A.y+B.y)/2-(B.x-A.x)*b.bend};b.c=c;
    const dim=sceneDemoOn()?.40:foc?(foc!==A&&foc!==B?.17:.52):.27;
    cx.globalAlpha=.08*dim;cx.strokeStyle=A.color;cx.lineWidth=.8;cx.beginPath();
    for(let j=0;j<=24;j++){const p=bez(A,c,B,j/24),[x,y]=W2S(p.x,p.y);j?cx.lineTo(x,y):cx.moveTo(x,y)}cx.stroke();
    let prev=null;for(let j=0;j<22;j++){const tt=b.t-j*.006;if(tt<0)break;const p=bez(A,c,B,tt),q=W2S(p.x,p.y);
      if(prev){cx.globalAlpha=dim*.9*(1-j/22);cx.strokeStyle=A.color;cx.lineWidth=1.6-j*.05;cx.beginPath();cx.moveTo(prev[0],prev[1]);cx.lineTo(q[0],q[1]);cx.stroke()}prev=q}
  }
  cx.globalAlpha=1;
  // 汇向中心信标主星的粒子流（谁 CPU 高谁流得多）
  if(!reducedMotion&&fc%2===0)FAM.forEach(f=>{if(Math.random()<(sceneDemoOn()?.42:.08+Math.min(.5,f.cpu*.15)))flows.push({f,t:0,sp:.25+Math.random()*.3,o:(Math.random()-.5)*.12})});
  const K=STAR;
  for(let i=flows.length-1;i>=0;i--){const p=flows[i];p.t+=dt*p.sp;if(p.t>=1){flows.splice(i,1);continue}
    const x=p.f.x+(K.x-p.f.x)*p.t+p.o*Math.sin(p.t*3.14),y=p.f.y+(K.y-p.f.y)*p.t-p.o*Math.sin(p.t*3.14),[sx,sy]=W2S(x,y);
    cx.globalAlpha=Math.sin(p.t*3.14)*.32;cx.fillStyle=p.f.color;cx.fillRect(sx-1,sy-1,2,2)}
  cx.globalCompositeOperation="source-over";cx.globalAlpha=1;
  // 天体：按远近排序，近的挡住远的
  const active=foc||crab.at||crab.target;
  const bodies=FAM.concat(STAR,cloudScene()).sort((a,b)=>a.t-b.t);
  for(const bd of bodies){if(bd.cloud)drawDepthCloud(bd);else drawBody(bd,bd.isStar?1:foc&&foc!==bd?.5:active&&active!==bd?.82:1);}
  // 信息包：沿着流光跑的小标签
  if(!reducedMotion&&fc%40===0&&packets.length<(MOBILE?3:6)){const b=beams[Math.random()*beams.length|0],A=NODES[b.a],o=A.organs[Math.random()*A.organs.length|0];
    packets.push({b,t:0,sp:.12+Math.random()*.1,txt:Math.random()<.45?"0x"+hex(4):(o?o.name:hex(6)),c:A.color})}
  cx.font=`9px ${MONO}`;cx.textAlign="left";
  for(let i=packets.length-1;i>=0;i--){const p=packets[i];p.t+=dt*p.sp;if(p.t>=1||!p.b.c){packets.splice(i,1);continue}
    const A=NODES[p.b.a],B=NODES[p.b.b],q=bez(A,p.b.c,B,p.t),[sx,sy]=W2S(q.x,q.y),a=Math.sin(p.t*3.14);
    cx.globalAlpha=a;cx.fillStyle=p.c;cx.fillRect(sx-2,sy-2,4,4);
    if(!focusKey||![A.key,B.key].includes(focusKey))continue;
    const tw=cx.measureText(p.txt).width+8;cx.fillStyle="rgba(4,6,10,.8)";cx.fillRect(sx+6,sy-14,tw,13);cx.strokeStyle=rgba(p.c,.6);cx.strokeRect(sx+6.5,sy-13.5,tw-1,12);
    cx.fillStyle=p.c;cx.fillText(p.txt,sx+10,sy-4.5)}
  cx.globalAlpha=1;
  drawLock(foc||crab.at||crab.target);
  // 脉冲
  for(let i=pulses.length-1;i>=0;i--){const p=pulses[i],a=now-p.born,life=p.big?1.6:1;if(a>life){pulses.splice(i,1);continue}
    const[sx,sy]=W2S(p.x,p.y);cx.strokeStyle=rgba(p.c,.7*(1-a/life));cx.lineWidth=1.2;cx.beginPath();cx.arc(sx,sy,(p.big?14:8)+a*(p.big?70:40),0,6.283);cx.stroke()}
  // A short fading wake follows actual movement instead of drawing the whole planned route.
  crab.softTrail=crab.softTrail||[];
  const ct=crab.softTrail,cp=ct[ct.length-1];
  if(!cp||Math.hypot(crab.x-cp.x,crab.y-cp.y)>.003)ct.push({x:crab.x,y:crab.y,born:now});
  while(ct.length&&(now-ct[0].born>1.7||ct.length>60))ct.shift();
  cx.save();cx.lineCap='round';cx.globalCompositeOperation='lighter';
  for(let j=1;j<ct.length;j++){
   const p=ct[j],old=ct[j-1],fade=Math.pow(Math.max(0,1-(now-p.born)/1.7),1.8),a=W2S(old.x,old.y),b=W2S(p.x,p.y);
   cx.beginPath();cx.moveTo(...a);cx.lineTo(...b);cx.strokeStyle=rgba('#e8aa82',fade*.08);cx.lineWidth=3;cx.stroke();
   cx.strokeStyle=rgba('#f2bd98',fade*.45);cx.lineWidth=.65;cx.stroke();
  }cx.restore();
  // 信标哨兵：外圈轨道
  stepDrone(dt);
  // Rover 走路
  let walking=false;
  if(crab.to&&crab.t<1){if(crab.target&&crab.off){crab.to.x=crab.target.x+crab.off.x;crab.to.y=crab.target.y+crab.off.y}crab.t=Math.min(1,crab.t+dt/crab.dur);const p=bez(crab.from,crab.ctrl,crab.to,ease(crab.t));crab.x=p.x;crab.y=p.y;walking=true;crab.walkPh+=dt*22;if(crab.t>=1)arrive(crab.target)}
  else if(crab.at){if(crab.off){crab.x=crab.at.x+crab.off.x;crab.y=crab.at.y+crab.off.y}crab.dwell-=dt;if(crab.dwell<=0&&now>=homeUntil)goTo(pickNext())}
  const[csx,csy]=roleScreen(crab.x,crab.y);
  const sc=Math.sqrt(cam.z)*(MOBILE?.72:.95);
  // The house crawler is drawn once, on the cross-screen overlay.
  const[dsx,dsy]=roleScreen(drone.x,drone.y);drawDrone(dsx,dsy,sc);tagBox(dsx,dsy-26,drone.tag);
  drawCrab(csx,csy,sc*1.1,walking);
  drawNearDust();drawScan();drawHerClock();drawPlanetInteraction();drawWorkflow();drawLabels(foc);drawWorkFocus();
  if(fc%6===0)$("fCoord").textContent=`CAM ${cam.x.toFixed(3)} ${cam.y.toFixed(3)} · Z ${cam.z.toFixed(2)} · ${hex(8).toUpperCase()}`;
  cx.restore();
  if(fc%2===0)drawPanels(dt*2);
  drawSentinelRoute(dt);drawSceneDemo();
}
function drawSceneDemo(){
 const t=sceneDemoAge();if(t<0)return;
 if(t>=24){sceneDemoStart=null;const b=$('sentinelDemo');b.disabled=false;b.textContent='全景演示';return;}
 const g=sentinelG,sb=sky.getBoundingClientRect(),fade=Math.min(1,t*2,(24-t)*2),beat=Math.floor(t/3);
 if(beat!==sceneDemoBeat){sceneDemoBeat=beat;roomAudio.play('scene');}
 g.save();g.globalAlpha=fade;g.globalCompositeOperation='lighter';
 // Stage every instrument without changing its real values.
 const panels=[...Object.values(PC).map(p=>p.c),$('log'),$('memList'),$('code')].filter(Boolean);
 panels.forEach((el,i)=>{const r=el.getBoundingClientRect();if(r.width<5||r.height<5)return;const q=(t*.5+i*.17)%1;
  g.save();g.beginPath();g.rect(r.left,r.top,r.width,r.height);g.clip();const y=r.top+q*r.height;
  const glow=g.createLinearGradient(0,y-12,0,y+12);glow.addColorStop(0,'rgba(100,210,255,0)');glow.addColorStop(.5,'rgba(100,210,255,.18)');glow.addColorStop(1,'rgba(100,210,255,0)');g.fillStyle=glow;g.fillRect(r.left,y-12,r.width,24);g.strokeStyle='rgba(155,231,255,.75)';g.lineWidth=1;g.beginPath();g.moveTo(r.left,y);g.lineTo(r.right,y);g.stroke();g.restore();});
 // Relay packets around all members; labels explicitly say visual rehearsal.
 FAM.forEach((f,i)=>{const next=FAM[(i+1)%FAM.length],a=W2S(f.x,f.y),b=W2S(next.x,next.y),phase=(t*.36+i/FAM.length)%1;
  const ax=sb.left+a[0],ay=sb.top+a[1],bx=sb.left+b[0],by=sb.top+b[1],cx0=(ax+bx)/2,cy0=Math.min(ay,by)-35;
  g.strokeStyle=rgba(f.color,.16);g.lineWidth=1;g.beginPath();g.moveTo(ax,ay);g.quadraticCurveTo(cx0,cy0,bx,by);g.stroke();
  const x=(1-phase)**2*ax+2*(1-phase)*phase*cx0+phase**2*bx,y=(1-phase)**2*ay+2*(1-phase)*phase*cy0+phase**2*by;
  g.shadowColor=f.color;g.shadowBlur=12;g.fillStyle=f.color;g.beginPath();g.arc(x,y,2.5,0,Math.PI*2);g.fill();g.shadowBlur=0;
  const r=f.sr*f.ps*S*cam.z*1.35;g.strokeStyle=rgba(f.color,.7);g.beginPath();g.arc(ax,ay,r,t*1.5+i,t*1.5+i+1);g.stroke();});
 // Rover and the outer sentinel participate in the same visual relay.
 const crabP=roleScreen(crab.x,crab.y),droneP=roleScreen(drone.x,drone.y);
 for(const [j,pt] of [crabP,droneP].entries()){g.strokeStyle=j?'#b8e9ff':'#f4ac87';g.lineWidth=1.3;g.beginPath();g.arc(sb.left+pt[0],sb.top+pt[1],20+(t*14%20),t+j,t+j+2.5);g.stroke();}
 g.globalCompositeOperation='source-over';g.shadowBlur=0;g.textAlign='center';g.font='11px '+SANS;
 const label='全景演示 · 主星升空 / 全员流光 / 哨兵互动 / 仪表扫描';const w=g.measureText(label).width+20,x=innerWidth/2,y=innerHeight-24;
 g.fillStyle='rgba(4,15,29,.9)';g.fillRect(x-w/2,y-15,w,23);g.fillStyle='#c5efff';g.fillText(label,x,y);g.restore();
}

function tagBox(x,y,tg){if(!tg)return;const age=now-tg.born;if(age>4.5)return;const a=Math.min(1,age*4)*Math.min(1,(4.5-age)*2);
  cx.font=`10px ${SANS}`;const tw=cx.measureText(tg.t).width+12;cx.globalAlpha=a;cx.fillStyle="rgba(6,6,10,.88)";cx.fillRect(x-tw/2,y-15,tw,17);
  cx.strokeStyle=tg.c;cx.strokeRect(x-tw/2+.5,y-14.5,tw-1,16);cx.fillStyle=tg.c;cx.textAlign="center";cx.fillText(tg.t,x,y-3);cx.globalAlpha=1}
function stepDrone(dt){
  const R=1.13,orb=a=>[Math.cos(a)*R*AX,.16+Math.sin(a*2)*.05,Math.sin(a)*R];drone.a+=dt*(drone.fire>0?.02:.11);
  const p=P3(...orb(drone.a));drone.x=p.x;drone.y=p.y;
  const[ox,oy]=W2S(STAR.x,STAR.y),[qx,qy]=roleScreen(drone.x,drone.y),dl=Math.hypot(qx-ox,qy-oy)||1;drone.look=Math.atan2(qy-oy,qx-ox);
  // 轨道（三维投影）
  cx.save();cx.strokeStyle="rgba(223,231,238,.1)";cx.setLineDash([2,6]);cx.lineWidth=1;cx.beginPath();
  for(let j=0;j<=96;j++){const q=P3(...orb(j/96*6.283)),[x,y]=W2S(q.x,q.y);j?cx.lineTo(x,y):cx.moveTo(x,y)}cx.stroke();cx.restore();
  drone.next-=dt;
  if(drone.next<=0&&drone.fire<=0){drone.fire=2.2;drone.next=12+Math.random()*6;addLog("x","信标哨兵 → demo-beacon","#dfe7ee")}
  if(drone.fire>0){drone.fire-=dt;const sx=qx,sy=qy,dx=(qx-ox)/dl,dy=(qy-oy)/dl,len=Math.max(W,H);
    const k=Math.min(1,(2.2-drone.fire)*3);cx.save();cx.globalCompositeOperation="lighter";
    const g=cx.createLinearGradient(sx,sy,sx+dx*len*k,sy+dy*len*k);g.addColorStop(0,"rgba(255,122,168,.75)");g.addColorStop(1,"rgba(255,122,168,0)");
    cx.strokeStyle=g;cx.lineWidth=2;cx.beginPath();cx.moveTo(sx,sy);cx.lineTo(sx+dx*len*k,sy+dy*len*k);cx.stroke();
    for(let i=0;i<5;i++){const u=((now*1.6+i/5)%1)*k*len*.5;cx.fillStyle="rgba(255,190,210,.9)";cx.fillRect(sx+dx*u-1.5,sy+dy*u-1.5,3,3)}cx.restore();
    if(drone.fire<=0){const t=T_();drone.tag={t:`beacon · 没重置 · 周用量 ${t.weekly_used??"?"}%`,c:"#dfe7ee",born:now};
      addLog("x",`beacon 无新重置 · 周用量 ${t.weekly_used??"?"}%`,"#dfe7ee")}}
}
const NEBULA_SPRITES=["#5b3b8f","#164f71","#7c2f65"].map(color=>{const c=document.createElement('canvas');c.width=c.height=192;const g=c.getContext('2d'),r=g.createRadialGradient(96,96,0,96,96,96);r.addColorStop(0,rgba(color,.55));r.addColorStop(.38,rgba(color,.28));r.addColorStop(1,rgba(color,0));g.fillStyle=r;g.fillRect(0,0,192,192);return c});
let GALAXY_CACHE=null,GALAXY_KEY="";
function buildGalaxyField(){
  const c=document.createElement("canvas"),w=Math.max(320,Math.ceil(HW)),h=Math.max(320,Math.ceil(HH));c.width=w;c.height=h;
  const g=c.getContext("2d"),R=rng(831701),pal=["#6c75ce","#387ca2","#9563b5","#e4b8d0"],sc=Math.min(w,h);
  const point=(r,a)=>{const x=Math.cos(a)*r,y=Math.sin(a)*r*.48;return[w*.5+x*.91-y*.42,h*.48+x*.42+y*.91]};
  // Cached procedural stellar disc: dust lanes, spiral arms and sparse foreground stars.
  g.globalCompositeOperation="lighter";
  for(let arm=0;arm<3;arm++)for(let i=0;i<38;i++){
    const u=i/37,r=sc*(.07+u*.68),a=arm*2.094+u*5.2,[x,y]=point(r,a),sz=sc*(.07+.07*u);
    g.globalAlpha=.12*(1-u*.55);g.drawImage(NEBULA_SPRITES[arm%3],x-sz,y-sz,sz*2,sz*2);
  }
  for(let i=0;i<(MOBILE?2200:4200);i++){
    const u=Math.pow(R(),.68),arm=i%3,a=arm*2.094+u*5.2+(R()-.5)*(.2+u*.45),r=sc*(.05+u*.7);
    let[x,y]=point(r,a);x+=(R()-.5)*sc*.035;y+=(R()-.5)*sc*.035;
    const fade=Math.pow(1-u,.45),s=R()<.035?1.65:.45+R()*.7;
    g.globalAlpha=(.1+R()*.42)*fade;g.fillStyle=pal[i%4];g.fillRect(x,y,s,s);
  }
  g.globalCompositeOperation="source-over";
  for(let j=0;j<3;j++){g.beginPath();for(let i=0;i<60;i++){const u=i/59,[x,y]=point(sc*(.12+u*.65),j*2.094+u*5.2+.19);i?g.lineTo(x,y):g.moveTo(x,y)}
    g.lineWidth=sc*.018;g.strokeStyle="rgba(2,5,16,.17)";g.stroke();}
  g.globalCompositeOperation="lighter";
  for(let i=0;i<280;i++){const x=R()*w,y=R()*h,s=R()<.025?1.7:.6;g.globalAlpha=.12+R()*.42;g.fillStyle=i%3?"#abc4e5":"#edd9ff";g.fillRect(x,y,s,s);}
  GALAXY_CACHE=c;GALAXY_KEY=HW+"x"+HH+":"+MOBILE;
}
function drawGalaxy(){
  if(!GALAXY_CACHE||GALAXY_KEY!==HW+"x"+HH+":"+MOBILE)buildGalaxyField();
  cx.save();cx.beginPath();cx.rect(CX-HW/2,CY-HH/2,HW,HH);cx.clip();
  const px=reducedMotion?0:pointerDepth.x*3,py=reducedMotion?0:pointerDepth.y*3;
  const driftX=reducedMotion?0:Math.sin(now*.025)*8,driftY=reducedMotion?0:Math.cos(now*.018)*5;
  cx.globalAlpha=.8;cx.drawImage(GALAXY_CACHE,CX-HW/2-10+px+driftX,CY-HH/2-10+py+driftY,HW+20,HH+20);
  cx.globalCompositeOperation="lighter";
  for(let i=0;i<18;i++){const a=i*2.399,r=(.22+(i%7)*.075)*Math.min(HW,HH),x=CX+Math.cos(a)*r,y=CY+Math.sin(a)*r*.68;
    const b=.18+.22*(.5+.5*Math.sin(now*.45+i));cx.globalAlpha=b;cx.fillStyle=i%2?"#a6dfff":"#d1bbff";cx.fillRect(x-1,y-1,2,2);
    if(i%4===0){cx.globalAlpha=b*.45;cx.fillRect(x-4,y-.4,8,.8);cx.fillRect(x-.4,y-4,.8,8);}}
  cx.restore();
}

const DEPTH_CLOUDS=['#355a83','#76538f','#397580'].map((color,k)=>{
 const c=document.createElement('canvas');c.width=c.height=192;const g=c.getContext('2d'),R=rng(190717+k);
 for(let i=0;i<38;i++){const x=28+R()*136,y=55+R()*82,r=12+R()*42,d=g.createRadialGradient(x,y,0,x,y,r);
 d.addColorStop(0,rgba(color,.24));d.addColorStop(.4,rgba(color,.12));d.addColorStop(1,rgba(color,0));g.fillStyle=d;g.fillRect(x-r,y-r,r*2,r*2);}
 return c;
});
function cloudScene(){
 const arr=[],tm=reducedMotion?0:now;
 for(let i=0;i<(MOBILE?10:16);i++){const a=i*2.399+tm*(.009+(i%3)*.003),r=.38+(i%5)*.19;
 const p=P3(Math.cos(a)*r*AX,Math.sin(i*2.1+tm*.021)*.18,Math.sin(a)*r);
 arr.push({...p,cloud:true,i,size:.32+(i%4)*.07,angle:Math.sin(tm*.026+i)*.25,alpha:.24+(i%3)*.035});}
 return arr;
}
function clipCloudStage(){cx.beginPath();cx.rect(CX-HW/2+18,CY-HH/2+55,Math.max(1,HW-36),Math.max(1,HH-110));cx.clip();}
function drawDepthCloud(c){
 const [x,y]=W2S(c.x,c.y),sz=c.size*c.s*S*cam.z;
 cx.save();clipCloudStage();cx.globalCompositeOperation='source-over';cx.globalAlpha=c.alpha;
 cx.translate(x,y);cx.rotate(c.angle);const breathe=1+.06*Math.sin((reducedMotion?0:now)*.09+c.i);
 cx.drawImage(DEPTH_CLOUDS[c.i%3],-sz*1.5,-sz*.75,sz*3,sz*1.5*breathe);cx.restore();
}
function drawNearDust(){
 const tm=reducedMotion?0:now,R=rng(9817);cx.save();clipCloudStage();cx.globalCompositeOperation='lighter';
 for(let i=0;i<(MOBILE?14:26);i++){const speed=.5+R(),x=CX-HW/2+((R()*HW+tm*speed*1.5)%HW),y=CY-HH/2+((R()*HH-tm*speed*.55)%HH+HH)%HH;
 const z=.7+R()*1.4;cx.globalAlpha=.12+R()*.16;cx.fillStyle=i%3?'#adcedc':'#c3b5db';cx.beginPath();cx.arc(x+(reducedMotion?0:pointerDepth.x*5),y,z,0,6.283);cx.fill();}
 cx.restore();
}

function drawBackdrop(dt){
  drawGalaxy();cx.fillStyle="rgba(200,215,230,.35)";const R=rng(7);
  for(let i=0;i<160;i++){const depth=.2+(i%3)*.3,px=reducedMotion?0:pointerDepth.x*depth*3,py=reducedMotion?0:pointerDepth.y*depth*3;
    const x=R()*W-cam.x*S*depth*.12+px,y=R()*H-cam.y*S*depth*.12+py;const tw=.5+.5*Math.sin(now*(.5+R())+i);cx.globalAlpha=.1+tw*depth*.45;const size=i%3===2?1.5:1;cx.fillRect(((x%W)+W)%W,((y%H)+H)%H,size,size)}
  cx.globalAlpha=1;
  // 两侧的十六进制雨（只在洞口边上）
  if(!MOBILE){cx.font=`10px ${MONO}`;cx.textAlign="center";
    const l=CX-HW/2+10,r=CX+HW/2-10;
    RAIN.forEach((c,i)=>{c.off+=dt*c.sp;const x=i<4?l+i*13:r-(i-4)*13;
      for(let j=0;j<c.s.length;j++){const y=((j*14+c.off)%(c.s.length*14))+CY-HH/2;if(y>CY+HH/2||y<CY-HH/2+110)continue;
        const head=Math.floor(c.off/14)%c.s.length===(c.s.length-j)%c.s.length;cx.fillStyle=head?"rgba(180,255,240,.6)":"rgba(95,224,208,.09)";
        if(Math.random()<.004)c.s[j]=HEX[Math.random()*16|0];cx.fillText(c.s[j],x,y)}})}
}
// 黄道面：三维网格、刻度、扫描
const planePt=(r,a,y=0)=>{const p=P3(Math.cos(a)*r*AX,y,Math.sin(a)*r);return W2S(p.x,p.y)};
function drawPlane(){
  cx.save();cx.lineWidth=1;
  [.2,.45,.7,.95,1.2].forEach((r,i)=>{cx.strokeStyle=`rgba(95,224,208,${i===4?.13:.05})`;cx.setLineDash(i%2?[2,5]:[]);cx.beginPath();
    for(let j=0;j<=96;j++){const[x,y]=planePt(r,j/96*6.283);j?cx.lineTo(x,y):cx.moveTo(x,y)}cx.stroke()});
  cx.setLineDash([]);
  for(let k=0;k<24;k++){const a=k/24*6.283,[x0,y0]=planePt(.16,a),[x1,y1]=planePt(1.2,a);cx.strokeStyle=`rgba(95,224,208,${k%6===0?.09:.03})`;cx.beginPath();cx.moveTo(x0,y0);cx.lineTo(x1,y1);cx.stroke()}
  cx.font=`8px ${MONO}`;cx.textAlign="center";
  for(let d=0;d<360;d+=5){const a=d/180*Math.PI,big=d%30===0,[x0,y0]=planePt(1.2,a),[x1,y1]=planePt(big?1.25:1.218,a);
    cx.strokeStyle=big?"rgba(95,224,208,.34)":"rgba(95,224,208,.13)";cx.beginPath();cx.moveTo(x0,y0);cx.lineTo(x1,y1);cx.stroke();
    if(big&&!MOBILE){const[xl,yl]=planePt(1.32,a);cx.fillStyle="rgba(95,224,208,.32)";cx.fillText(pad(d)+"°",xl,yl+3)}}
  // 主星脚下的光柱 + 旋转瞄准环
  const[ox,oy]=W2S(STAR.x,STAR.y),[fx,fy]=planePt(0,0,-.32),rr=STAR.sr*STAR.ps*S*cam.z*2.5;
  const pg=cx.createLinearGradient(ox,oy,fx,fy);pg.addColorStop(0,"rgba(255,122,168,.28)");pg.addColorStop(1,"rgba(255,122,168,0)");
  cx.strokeStyle=pg;cx.lineWidth=3;cx.beginPath();cx.moveTo(ox,oy);cx.lineTo(fx,fy);cx.stroke();
  cx.translate(ox,oy);cx.scale(1,.55+VIEW.st*.45);
  cx.rotate(now*.25);cx.strokeStyle="rgba(232,119,77,.45)";cx.lineWidth=1.5;
  for(let i=0;i<4;i++){cx.beginPath();cx.arc(0,0,rr,i*Math.PI/2+.15,i*Math.PI/2+1.2);cx.stroke()}
  cx.rotate(-now*.6);cx.strokeStyle="rgba(95,224,208,.4)";cx.lineWidth=1;
  for(let i=0;i<48;i++){const a=i/48*6.283,l=i%4===0?7:3;cx.beginPath();cx.moveTo(Math.cos(a)*(rr+6),Math.sin(a)*(rr+6));cx.lineTo(Math.cos(a)*(rr+6+l),Math.sin(a)*(rr+6+l));cx.stroke()}
  cx.setTransform(DPR,0,0,DPR,0,0);
  // 环形示波：CPU 历史绕着主星躺在黄道面上
  const hist=LIVE&&LIVE.hist||[];if(hist.length>4){cx.beginPath();const n=hist.length,mx=Math.max(15,...hist.map(p=>p.cpu));
    for(let i=0;i<=n;i++){const p=hist[i%n],a=i/n*6.283+now*.05,v=p.cpu/mx*.05+Math.sin(now*6+i)*.003,[x,y]=planePt(.26+v,a);i?cx.lineTo(x,y):cx.moveTo(x,y)}
    cx.strokeStyle="rgba(255,212,121,.4)";cx.lineWidth=1;cx.stroke()}
  cx.restore();
}
function drawSweep(){
  const a0=now*.55%6.283,r=1.2;cx.save();cx.globalCompositeOperation="lighter";const[ox,oy]=planePt(0,0);
  for(let i=0;i<18;i++){const a=a0-i*.035,[x1,y1]=planePt(r,a),[x2,y2]=planePt(r,a-.035);cx.fillStyle=`rgba(95,224,208,${.05*(1-i/18)})`;cx.beginPath();cx.moveTo(ox,oy);cx.lineTo(x1,y1);cx.lineTo(x2,y2);cx.closePath();cx.fill()}
  const[ex,ey]=planePt(r,a0);cx.strokeStyle="rgba(150,255,240,.35)";cx.lineWidth=1;cx.beginPath();cx.moveTo(ox,oy);cx.lineTo(ex,ey);cx.stroke();
  // 扫到谁谁亮一下
  FAM.forEach(f=>{if(f.wx==null)return;let d=Math.atan2(f.wz,f.wx/AX)-a0;d=((d%6.283)+6.283)%6.283;if(d>6.1&&now-f.ping>1.5)f.ping=now-.3});
  cx.restore();
}
// 轨道、尾迹、落到黄道面的投影线
function drawOrbits(foc){
 cx.save();cx.globalCompositeOperation="lighter";const active=foc||crab.at||crab.target;
 for(const f of FAM){if(f.orR==null)continue;const dim=foc&&foc!==f?.62:1,current=f===active,front=new Path2D(),back=new Path2D();let prev=null;
 for(let j=0;j<=96;j++){const w=orbitPos(f,j/96*6.283),p=P3(...w),q=W2S(p.x,p.y),path=p.t>0?front:back;if(prev){path.moveTo(...prev);path.lineTo(...q)}prev=q;}
 cx.strokeStyle=f.color;cx.lineWidth=.55;
 cx.globalAlpha=.018*dim;cx.stroke(back);cx.globalAlpha=.065*dim;cx.stroke(front);
 const tail=MOBILE?28:40;prev=null;
 for(let k=0;k<tail;k++){const w=orbitPos(f,f.ang-k*.033),p=P3(...w),q=W2S(p.x,p.y),fade=Math.pow(1-k/tail,1.8);
 if(prev){cx.beginPath();cx.moveTo(...prev);cx.lineTo(...q);
 cx.strokeStyle=f.color;cx.globalAlpha=dim*fade*(current?.13:.07);cx.lineWidth=8*(1-k/tail)+1;cx.stroke();
 cx.globalAlpha=dim*fade*(current?.85:.58);cx.lineWidth=2*(1-k/tail)+.3;cx.stroke();
 if(k<10){cx.strokeStyle="#cde9ff";cx.globalAlpha=dim*fade*.25;cx.lineWidth=.6;cx.stroke();}}
 prev=q;}
 const R=rng(hash(f.key+'orbitdust'));
 for(let j=0;j<(MOBILE?75:130);j++){const u=R(),a=f.ang-u*1.55,w=orbitPos(f,a),p=P3(...w),q=W2S(p.x,p.y),fade=Math.pow(1-u,1.8);
 const spread=(1+u*5),dx=(R()-.5)*spread,dy=(R()-.5)*spread,sz=.5+R()*.8;
 cx.fillStyle=f.color;cx.globalAlpha=dim*fade*(p.t>0?.65:.25);cx.fillRect(q[0]+dx,q[1]+dy,sz,sz);}
 for(let j=0;j<3;j++){const a=f.ang-1.4-j*1.9+(reducedMotion?0:now*.035),w=orbitPos(f,a),p=P3(...w),q=W2S(p.x,p.y);
 cx.fillStyle=f.color;cx.globalAlpha=dim*(p.t>0?.65:.25);cx.fillRect(q[0]-1,q[1]-1,2,2);}
 }cx.restore();
}
const STARGLOW=(()=>{const c=document.createElement("canvas");c.width=c.height=128;const g=c.getContext("2d"),r=g.createRadialGradient(64,64,0,64,64,64);
  r.addColorStop(0,"rgba(184,66,112,.3)");r.addColorStop(.12,"rgba(214,78,136,.24)");r.addColorStop(.35,"rgba(208,72,126,.1)");r.addColorStop(.6,"rgba(255,190,120,.07)");r.addColorStop(1,"rgba(255,122,168,0)");
  g.fillStyle=r;g.fillRect(0,0,128,128);return c})();
function herGlow(){const lu=LIVE&&LIVE.activity&&LIVE.activity.last_input?Date.parse(LIVE.activity.last_input):NaN;if(!Number.isFinite(lu))return .75;const m=(Date.now()-lu)/60000;return m<5?1.15:m<30?1:m<120?.85:.7}
function drawRing(f,sx,sy,rp,dim,front){
  const a=f.ring,n=a.length/3,cs=Math.cos(f.spinA*.35),ss=Math.sin(f.spinA*.35),co=Math.cos(f.ob),so=Math.sin(f.ob),cy=VIEW.cy,sw=VIEW.sy,ct=VIEW.ct,st=VIEW.st,d=MOBILE?1.4:1.2;
  cx.fillStyle=f.color;
  for(let i=0;i<n;i++){const x=a[i*3],z=a[i*3+1],x1=x*cs-z*ss,z1=x*ss+z*cs,x2=x1*co,y2=x1*so,x3=x2*cy-z1*sw,z3=x2*sw+z1*cy,dn=z3*st-y2*ct,tw=z3*ct+y2*st;
    if((tw>0)!==front)continue;cx.globalAlpha=dim*a[i*3+2]*(front?.8:.35);cx.fillRect(sx+x3*rp-d/2,sy+dn*rp-d/2,d,d)}
}
function drawMoons(f,dim,front){
  for(const o of f.organs){if(o.mx==null||o.front!==front)continue;const[x,y]=W2S(o.mx,o.my);o.sx=x;o.sy=y;
    const s=Math.min(5.5,2+Math.sqrt(o.mb)*.14)*Math.sqrt(cam.z)*(.7+.3*f.ps)*(front?1:.75),pulse=.55+.45*Math.sin(now*(1.2+o.cpu*2)+o.ph),hot=Math.min(1,o.cpu/2),dd=dim*(front?1:.5);
    cx.globalAlpha=dd*.22*(.4+pulse);cx.drawImage(GLOW[f.i],x-s*2.6,y-s*2.6,s*5.2,s*5.2);
    cx.globalAlpha=dd*(.7+.3*pulse);cx.fillStyle=hot>.4&&pulse>.7?"#fff":f.color;cx.fillRect(x-s/2,y-s/2,s,s)}
}
function drawCorona(sx,sy,rp,a){cx.strokeStyle="#ff9cc0";cx.lineWidth=1;
  for(let i=0;i<40;i++){const an=i/40*6.283+now*.05,fl=.5+.5*Math.sin(now*1.7+i*2.3),l=rp*(1.25+fl*(.6+.5*Math.sin(i*7.1)));
    cx.globalAlpha=Math.min(1,a*.2*fl);cx.beginPath();cx.moveTo(sx+Math.cos(an)*rp*1.05,sy+Math.sin(an)*rp*1.05);cx.lineTo(sx+Math.cos(an)*l,sy+Math.sin(an)*l);cx.stroke()}}
function drawStarHolo(sx,sy,rp,dim){
  cx.lineWidth=1;
  [[1.6,.12,now*.4,"#ffb6cf"],[1.9,1.15,-now*.3,"#ffd479"]].forEach(([k,inc,rot,c],ri)=>{
    const pt=a=>{const x=Math.cos(a)*k,z0=Math.sin(a)*k,y=-z0*Math.sin(inc),z=z0*Math.cos(inc),xr=x*Math.cos(rot)-z*Math.sin(rot),zr=x*Math.sin(rot)+z*Math.cos(rot),v=V3(xr,y,zr);return[sx+v[0]*rp,sy+v[1]*rp,v[2]]};
    cx.strokeStyle=c;cx.globalAlpha=dim*.3;cx.beginPath();for(let j=0;j<=72;j++){const q=pt(j/72*6.283);j?cx.lineTo(q[0],q[1]):cx.moveTo(q[0],q[1])}cx.stroke();
    for(let m=0;m<3;m++){const q=pt(now*(ri?-1.1:.9)+m*2.094);cx.globalAlpha=dim*(q[2]>0?.95:.35);cx.fillStyle=c;cx.fillRect(q[0]-1.5,q[1]-1.5,3,3)}});
}
function drawPlanetHolo(f,sx,sy,rp,dim){
  const active=f===crab.at||f===crab.target||f.key===focusKey,rot=now*.55+f.i;
  for(const[k,inc,dir]of[[1.42,.42,1],[1.68,-.28,-1]]){
    const pt=a=>{const x=Math.cos(a)*k,z0=Math.sin(a)*k,y=-z0*Math.sin(inc),z=z0*Math.cos(inc),xr=x*Math.cos(rot*dir)-z*Math.sin(rot*dir),zr=x*Math.sin(rot*dir)+z*Math.cos(rot*dir),v=V3(xr,y,zr);return[sx+v[0]*rp,sy+v[1]*rp,v[2]]};
    cx.strokeStyle=f.color;cx.globalAlpha=dim*(active?.4:.14);cx.lineWidth=1;cx.beginPath();for(let j=0;j<=48;j++){const q=pt(j/48*6.283);j?cx.lineTo(q[0],q[1]):cx.moveTo(q[0],q[1])}cx.stroke();
    for(let m=0;m<2;m++){const q=pt(now*dir*1.5+m*3.142);cx.globalAlpha=dim*(q[2]>0?(active?.95:.65):.2);cx.fillStyle=f.color;cx.fillRect(q[0]-1.5,q[1]-1.5,3,3)}
  }
}
function drawSurface(f,sx,sy,rp,dim){
  cx.save();cx.beginPath();cx.arc(sx,sy,rp,0,6.283);cx.clip();dim=Math.min(1,dim*1.35);const spin=f.spinA;
  if(f.key==='member1'||f.key==='member6'){
    for(let k=-4;k<=4;k++){cx.globalAlpha=dim*(k%2?.13:.065);cx.fillStyle=k%2?f.color:'#ffffff';const y=sy+k*rp*.2+Math.sin(spin*.7+k)*rp*.035;cx.fillRect(sx-rp,y,rp*2,rp*.1)}
    if(f.key==='member1'){cx.globalAlpha=dim*.24;cx.fillStyle='#fff0b5';cx.beginPath();cx.ellipse(sx+Math.sin(spin*.65)*rp*.42,sy+rp*.24,rp*.24,rp*.11,-.2,0,6.283);cx.fill()}
  }else if(f.key==='member2'){
    cx.fillStyle='#d9f6ff';cx.globalAlpha=dim*.22;cx.beginPath();cx.ellipse(sx,sy-rp*.8,rp*.66,rp*.24,0,0,6.283);cx.fill();cx.globalAlpha=dim*.11;cx.beginPath();cx.ellipse(sx,sy+rp*.84,rp*.6,rp*.2,0,0,6.283);cx.fill();
    cx.strokeStyle='#c7f2ff';cx.lineWidth=1;for(let k=-2;k<=2;k++){cx.globalAlpha=dim*.12;cx.beginPath();cx.ellipse(sx,sy+k*rp*.27,rp*.94,rp*.16,0,0,6.283);cx.stroke()}
  }else if(f.key==='member3'){
    for(let k=0;k<6;k++){const a=k*1.71+spin*.35,x=sx+Math.cos(a)*rp*.43,y=sy+Math.sin(a*1.37)*rp*.48;cx.globalAlpha=dim*(k%2?.18:.12);cx.fillStyle=k%2?'#9dffc7':'#2ea58d';cx.beginPath();cx.ellipse(x,y,rp*(.16+(k%3)*.035),rp*(.1+(k%2)*.035),a*.35,0,6.283);cx.fill()}
    cx.strokeStyle='#d2fff0';cx.lineWidth=1;for(let k=-1;k<=1;k++){cx.globalAlpha=dim*.12;cx.beginPath();cx.ellipse(sx,sy+k*rp*.36,rp*.9,rp*.15,spin*.08,0,6.283);cx.stroke()}
  }else if(f.key==='member4'){
    cx.strokeStyle='#ffd0e7';cx.lineWidth=rp*.07;for(let k=0;k<3;k++){cx.globalAlpha=dim*.13;cx.beginPath();cx.ellipse(sx,sy,rp*(.35+k*.2),rp*(.12+k*.05),spin*.15+k*.6,0,6.283);cx.stroke()}
    const R=rng(hash(f.key+'spark'));for(let k=0;k<18;k++){const x=sx+(R()-.5)*rp*1.7,y=sy+(R()-.5)*rp*1.7,s=.6+R()*1.5;cx.globalAlpha=dim*(.16+R()*.38);cx.fillStyle=k%3?'#ffd3ec':'#ffffff';cx.fillRect(x,y,s,s)}
  }else if(f.key==='member5'){
    const R=rng(hash(f.key+'craters'));for(let k=0;k<8;k++){const x=sx+(R()-.5)*rp*1.45,y=sy+(R()-.5)*rp*1.45,r=rp*(.045+R()*.075);cx.globalAlpha=dim*.22;cx.fillStyle='#4b3612';cx.beginPath();cx.arc(x,y,r,0,6.283);cx.fill();cx.globalAlpha=dim*.25;cx.strokeStyle='#ffeaa0';cx.lineWidth=1;cx.stroke()}
  }else if(f.key==='member7'){
    cx.strokeStyle='#e5f4ff';cx.lineWidth=1;for(let k=-2;k<=2;k++){cx.globalAlpha=dim*.13;cx.beginPath();cx.ellipse(sx,sy+k*rp*.27,rp*.92,rp*.15,0,0,6.283);cx.stroke();cx.beginPath();cx.ellipse(sx,sy,rp*.25,rp,spin*.08+k*.38,0,6.283);cx.stroke()}
    const R=rng(hash(f.key+'city'));for(let k=0;k<16;k++){const x=sx+(R()-.5)*rp*1.5,y=sy+(R()-.5)*rp*1.5;cx.globalAlpha=dim*(.2+R()*.35);cx.fillStyle=k%2?'#ffffff':'#9eeeff';cx.fillRect(x,y,1.2,1.2)}
  }
  cx.restore();
}
// 粒子球：明暗朝向主星，背面被球体挡住
// Procedural spherical material: continuous terrain/clouds with directional illumination.
function terrainNoise(x,y,z,seed){
 const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=x-ix,fy=y-iy,fz=z-iz;
 const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),w=fz*fz*(3-2*fz);
 const H=(a,b,c)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263)^Math.imul(c,2147483647)^seed;n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
 const mix=(a,b,t)=>a+(b-a)*t;
 return mix(mix(mix(H(ix,iy,iz),H(ix+1,iy,iz),u),mix(H(ix,iy+1,iz),H(ix+1,iy+1,iz),u),v),mix(mix(H(ix,iy,iz+1),H(ix+1,iy,iz+1),u),mix(H(ix,iy+1,iz+1),H(ix+1,iy+1,iz+1),u),v),w);
}
function terrainFbm(x,y,z,seed){let value=0,amp=.56;for(let i=0;i<4;i++){value+=amp*terrainNoise(x,y,z,seed+i*179);x=x*2.03+7.1;y=y*2.03-3.7;z=z*2.03+1.3;amp*=.5;}return value/.56/1.875;}
function buildPlanetAtlas(f){
 if(f.atlas)return f.atlas;
 const w=256,h=128,data=new Uint8ClampedArray(w*h*4),seed=hash(f.key+'material-v2'),R=rng(seed);
 const cells=Array.from({length:30},()=>{const y=R()*2-1,a=R()*Math.PI*2,r=Math.sqrt(1-y*y);return{x:r*Math.cos(a),y,z:r*Math.sin(a),r:.045+R()*.16,v:R()};});
 const clamp=x=>Math.max(0,Math.min(1,x)),blend=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*clamp(t));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const lon=x/w*Math.PI*2,lat=(y/(h-1)-.5)*Math.PI,cl=Math.cos(lat),X=cl*Math.cos(lon),Y=Math.sin(lat),Z=cl*Math.sin(lon);
  const large=terrainFbm(X*2.3,Y*2.3,Z*2.3,seed),fine=terrainFbm(X*12,Y*12,Z*12,seed+31),warp=terrainFbm(X*4+large,Y*4,Z*4,seed+77);
  let rgb,relief=fine,spec=0;
  if(f.key==='member1'){
   const bands=.5+.5*Math.sin(lat*12+(warp-.5)*4.3+Math.sin(lon*3)*.35),ribbon=clamp((fine-.46)*4);
   rgb=blend([107,61,38],[225,188,119],bands);rgb=blend(rgb,[244,225,181],ribbon*.42);
   const dl=Math.atan2(Math.sin(lon-1.0),Math.cos(lon-1.0)),dx=dl/.34,dy=(lat-.2)/.16,dist=dx*dx+dy*dy;
   if(dist<2.8){const swirl=.5+.5*Math.sin(Math.atan2(dy,dx)*2+Math.sqrt(dist)*9+fine*3);rgb=blend(rgb,blend([141,64,38],[239,184,112],swirl),Math.exp(-dist*.8)*.8);}
  }else if(f.key==='member2'){
   const vein=Math.abs(terrainNoise(X*7+warp,Y*7,Z*7,seed)-.5),crack=clamp((.055-vein)*19);
   rgb=blend([75,138,177],[209,236,243],clamp((large-.25)*1.9));rgb=blend(rgb,[19,71,116],crack*.8);rgb=blend(rgb,[234,250,255],clamp((fine-.57)*4)*.6);spec=.18;
  }else if(f.key==='member3'){
   const land=large>.51,coast=clamp((large-.49)*25);
   rgb=land?blend([46,99,72],[141,155,90],clamp((large-.51)*6)):blend([12,43,81],[29,113,147],clamp((large-.27)*3));
   if(land&&coast<.65)rgb=blend([145,169,109],rgb,coast);
   const clouds=clamp((terrainFbm(X*6+warp,Y*6,Z*6,seed+400)-.57)*7);rgb=blend(rgb,[225,237,227],clouds*.85);spec=land?.015:.3;
   if(Math.abs(Y)>.94)rgb=blend(rgb,[219,236,231],(Math.abs(Y)-.94)*15);
  }else if(f.key==='member4'){
   const a=lon+2*(warp-.5),flow=terrainFbm(Math.cos(a)*cl*4,Y*4+Math.sin(a*2)*.45,Math.sin(a)*cl*4,seed+80);
   rgb=blend([78,29,74],[204,115,155],clamp((flow-.24)*2.4));rgb=blend(rgb,[243,189,204],clamp((fine+flow*.55-.83)*5));spec=.035;
  }else if(f.key==='member6'){
   let best=-2,second=-2,cell=cells[0];for(const c of cells){const d=X*c.x+Y*c.y+Z*c.z;if(d>best){second=best;best=d;cell=c;}else if(d>second)second=d;}
   const edge=clamp((.012-(best-second))*75);rgb=blend([46,35,88],[157,130,198],cell.v*.85+fine*.15);rgb=blend(rgb,[211,198,242],edge*.6);spec=.12+cell.v*.15;relief=cell.v;
  }else if(f.key==='member5'){
   rgb=blend([91,73,53],[192,166,120],large*.9+fine*.1);let crater=0,rim=0;
   for(const c of cells){const dist=Math.sqrt(Math.max(0,2-2*(X*c.x+Y*c.y+Z*c.z)))/c.r;if(dist<1.3){crater=Math.max(crater,Math.exp(-dist*dist*3)*.55);rim=Math.max(rim,Math.exp(-Math.pow((dist-.9)/.13,2))*.35);}}
   rgb=rgb.map(v=>v*(1-crater+rim));relief=fine*.5+rim-crater;
  }else if(f.key==='member7'){
   const rock=clamp((large-.28)*2);rgb=blend([55,78,99],[180,196,200],rock);const vein=Math.abs(warp-.51);if(vein<.025)rgb=blend(rgb,[143,174,197],.5);rgb=rgb.map(v=>v*(.86+fine*.3));spec=.07;
  }else{
   const cloud=terrainFbm(X*3.2+(warp-.5),Y*3.2,Z*3.2,seed+501);
   rgb=blend([161,116,153],[232,211,202],clamp((cloud-.25)*2.4));rgb=blend(rgb,[176,184,217],clamp((fine-.57)*4)*.4);rgb=blend(rgb,[244,228,219],clamp((warp-.57)*5)*.55);spec=.12;
  }
  const i=(y*w+x)*4;data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=Math.round(clamp(spec)*255);
 }
 return f.atlas={w,h,data};
}
function planetMaterial(f,L){
 const tick=Math.floor(now*5),key=tick+':'+MOBILE;
 if(f.materialKey===key&&f.material)return f.material;
 const atlas=buildPlanetAtlas(f),n=MOBILE?88:128,c=f.material||(f.material=document.createElement('canvas'));
 if(c.width!==n)c.width=c.height=n;
 const g=c.getContext('2d'),im=g.createImageData(n,n),out=im.data,spin=(f.spinA||0)*.12;
 const hx=L[0],hy=L[1],hz=L[2]+1,hm=Math.hypot(hx,hy,hz),tau=Math.PI*2;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const nx=(x+.5-n/2)/(n/2),ny=(y+.5-n/2)/(n/2),rr=nx*nx+ny*ny;if(rr>=1)continue;
  const nz=Math.sqrt(1-rr),lon=((Math.atan2(nx,nz)+spin)%tau+tau)%tau,lat=Math.asin(ny);
  const u=lon/tau*atlas.w,v=(lat/Math.PI+.5)*(atlas.h-1),ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy;
  const i00=(iy*atlas.w+ix)*4,i10=(iy*atlas.w+(ix+1)%atlas.w)*4,i01=(Math.min(atlas.h-1,iy+1)*atlas.w+ix)*4,i11=(Math.min(atlas.h-1,iy+1)*atlas.w+(ix+1)%atlas.w)*4;
  const d=nx*L[0]+ny*L[1]+nz*L[2],light=.21+.79*Math.pow(Math.max(0,d),.78),limb=.86+.14*nz,sp=Math.pow(Math.max(0,(nx*hx+ny*hy+nz*hz)/hm),30)*atlas.data[i00+3]/255;
  const idx=(y*n+x)*4;for(let j=0;j<3;j++){const A=atlas.data[i00+j]*(1-fx)+atlas.data[i10+j]*fx,B=atlas.data[i01+j]*(1-fx)+atlas.data[i11+j]*fx;out[idx+j]=Math.min(255,((A*(1-fy)+B*fy)*light*limb*1.12)+sp*80);}
  out[idx+3]=255;
 }
 g.putImageData(im,0,0);f.materialKey=key;return c;
}

const DUST_STYLE={
 member1:[1.42,1.12,-.42,.38,2600,['#fff1cf','#eacb8e','#b78b50']],
 member2:[1.48,.55,-.26,-.55,1250,['#e4f7ff','#9dd9ed','#488aa9']],
 member3:[1.55,.40,-.55,.75,1050,['#d7f9e7','#81c9ad','#397b70']],
 member4:[1.40,.75,-.18,-.85,1550,['#ffe1ed','#e8a7cd','#a65b8b']],
 member5:[1.55,.48,-.62,-.30,1100,['#fff0bd','#d5be77','#927d44']],
 member6:[1.43,.90,-.33,.62,1900,['#f0e6ff','#bca8e7','#7763aa']],
 member7:[1.50,.42,-.48,1.0,1000,['#edf4fa','#b7cad6','#6f8596']],
 observer:[1.48,.70,-.38,-.45,1700,['#ffe7f2','#e8b6d3','#a5759b']]
};
function renderDustRing(g,f,sx,sy,rp,dim,front){
 const cfg=DUST_STYLE[f.key]||DUST_STYLE.member7,[inner,width,tilt,node,count,pal]=cfg;
 if(!f.dustRing){const R=rng(71721+(f.key==='member1'?0:hash(f.key)%10000));f.dustRing=Array.from({length:MOBILE?Math.round(count*.54):count},()=>{
 const u=R(),r=inner+Math.pow(u,.8)*width;
 return {a:R()*6.283,r,h:(R()-.5)*.025,seed:R(),size:R()<.035?1.7:.8+R()*.65};});}
 const tm=reducedMotion?0:now,cn=Math.cos(node),sn=Math.sin(node),ct=Math.cos(tilt),st=Math.sin(tilt);
 g.save();g.globalCompositeOperation='lighter';
 for(const d of f.dustRing){
 const a=d.a+tm*.13/Math.pow(d.r,1.5),xx=Math.cos(a)*d.r,zz=Math.sin(a)*d.r,yy=-zz*st+d.h,z=zz*ct;
 const v=V3(xx*cn-z*sn,yy,xx*sn+z*cn);if((v[2]>0)!==front)continue;
 const u=(d.r-inner)/width,radial=Math.sin(u*Math.PI),gap=u>.482&&u<.572?.14:1;
 const density=.65+.35*Math.pow(.5+.5*Math.sin(a*2.0+.9),2);
 const alpha=Math.min(1,dim*(front?1.65:.7)*(.5+d.seed*.5)*Math.pow(Math.max(0,radial),.6)*gap*density);
 const x=sx+v[0]*rp,y=sy+v[1]*rp,size=d.size*Math.max(.8,Math.min(1.5,rp/28));
 g.fillStyle=d.seed>.92?pal[0]:d.seed>.45?pal[1]:pal[2];g.globalAlpha=alpha;g.fillRect(x-size/2,y-size/2,size,size);
 if(d.seed>.985){g.globalAlpha=alpha*.10;g.beginPath();g.arc(x,y,size*3.3,0,6.283);g.fill();}
 }
 g.restore();
}

function drawParticleRing(f,sx,sy,rp,dim,front){
 const tick=Math.floor(now*8+(f.i||0)*.13),key=tick+':'+MOBILE;
 if(f.dustCacheKey!==key){
  if(!f.dustLayers)f.dustLayers=[0,1].map(()=>{const c=document.createElement('canvas');c.width=c.height=256;return c;});
  for(let k=0;k<2;k++){const g=f.dustLayers[k].getContext('2d');g.clearRect(0,0,256,256);renderDustRing(g,f,128,128,48,1,!!k);}
  f.dustCacheKey=key;
 }
 cx.save();
 // Clip dust against every closer opaque planet, using this frame's projection.
 const cut=new Path2D();cut.rect(0,0,W,H);
 for(const other of [STAR,...FAM]){if(other===f||other.t<=f.t)continue;
 const q=W2S(other.x,other.y),rr=other.sr*other.ps*S*cam.z+1.5;
 cut.moveTo(q[0]+rr,q[1]);cut.arc(q[0],q[1],rr,0,Math.PI*2);}
 cx.clip(cut,'evenodd');cx.globalAlpha=dim;cx.globalCompositeOperation='lighter';const r=rp*128/48;
 cx.drawImage(f.dustLayers[front?1:0],sx-r,sy-r,r*2,r*2);cx.restore();
}
function drawOrbitalAura(f,sx,sy,rp,dim,front){drawParticleRing(f,sx,sy,rp,dim,front);}
function drawAtmosphere(f,sx,sy,rp,dim,L){
 const col=f.isStar?'#efb4d1':f.color,la=Math.atan2(L[1],L[0]);
 if(!f.atmosphereSprite){const c=document.createElement('canvas');c.width=c.height=160;const g=c.getContext('2d');
 for(let j=0;j<64;j++){const a=j/64*6.283,w=.1+.9*Math.max(0,Math.cos(a));g.strokeStyle=col;g.beginPath();g.arc(80,80,65,a,a+6.283/64+.01);
 g.globalAlpha=w*.07;g.lineWidth=12;g.stroke();g.globalAlpha=w*.16;g.lineWidth=5;g.stroke();g.globalAlpha=w*.65;g.lineWidth=1.6;g.stroke();}
 f.atmosphereSprite=c;}
 cx.save();cx.globalCompositeOperation='lighter';cx.globalAlpha=dim;cx.translate(sx,sy);cx.rotate(la);
 const r=(rp+.9)*80/65;cx.drawImage(f.atmosphereSprite,-r,-r,r*2,r*2);cx.restore();
}

/* A periodic visual awakening, unrelated to presence or execution state. */
let observerDust=null,observerMask=null;
function drawBeaconAwakening(f,sx,sy,rp,dim){
 f.awakenBounds=null;const phase=sceneDemoOn()?sceneDemoAge():(now%40)-5;if(reducedMotion||phase<0||phase>18)return false;
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
 const appear=smooth(Math.min(phase/2,(18-phase)/2)),progress=phase<11?smooth((phase-2)/5):1-smooth((phase-11)/5);
 if(!observerDust){const R=rng(58319);observerDust=Array.from({length:2100},(_,i)=>{const y=1-2*(i+.5)/2100,a=i*2.399963229728653,rr=Math.sqrt(1-y*y);return{x:Math.cos(a)*rr,y,z:Math.sin(a)*rr,a:R()*Math.PI*2,q:R(),k:R()};});}
 const centerY=sy-rp*1.3*progress,radius=rp*(1+.68*progress);
 f.sy=centerY;f.rp=radius;f.awakenBounds={x:sx-radius*1.18,y:centerY-radius*1.15,w:radius*2.36,h:radius*2.3};
 cx.save();cx.globalCompositeOperation='source-over';
 // Reveal the same sphere particles from top to bottom; no separate reservoir.
 if(appear<1){const material=planetMaterial(f,[-.55,-.4,.73]);if(!observerMask)observerMask=document.createElement('canvas');if(observerMask.width!==material.width||observerMask.height!==material.height){observerMask.width=material.width;observerMask.height=material.height;}const mg=observerMask.getContext('2d');mg.globalCompositeOperation='source-over';mg.clearRect(0,0,observerMask.width,observerMask.height);mg.drawImage(material,0,0);const mask=mg.createLinearGradient(0,0,0,observerMask.height);mask.addColorStop(Math.max(0,appear-.09),'rgba(255,255,255,0)');mask.addColorStop(Math.min(1,appear+.09),'rgba(255,255,255,1)');mg.globalCompositeOperation='destination-in';mg.fillStyle=mask;mg.fillRect(0,0,observerMask.width,observerMask.height);cx.globalAlpha=dim;cx.drawImage(observerMask,sx-rp,sy-rp,rp*2,rp*2);}
 cx.globalCompositeOperation='lighter';
 const halo=cx.createRadialGradient(sx,centerY,radius*.55,sx,centerY,radius*1.4);halo.addColorStop(0,'rgba(148,195,255,0)');halo.addColorStop(.6,'rgba(159,196,255,.09)');halo.addColorStop(1,'rgba(139,175,255,0)');cx.globalAlpha=dim*appear;cx.fillStyle=halo;cx.fillRect(sx-radius*1.4,centerY-radius*1.4,radius*2.8,radius*2.8);
 const transit=Math.sin(progress*Math.PI);
 for(let i=0;i<observerDust.length;i++){
 const p=observerDust[i],reveal=Math.max(0,Math.min(1,(appear-(p.y+1)/2)*10+1)),u=phase<11?smooth((phase-2-p.q*.9)/4.1):1-smooth((phase-11-p.q*.9)/4.1);
 const a=now*.25+u*Math.PI*2+p.y*.65*Math.sin(u*Math.PI),co=Math.cos(a),si=Math.sin(a),x=p.x*co+p.z*si,z=p.z*co-p.x*si;
 const r=rp*(1+.68*u+.32*Math.sin(u*Math.PI)*p.q),cy=sy-rp*1.3*u;
 const px=sx+x*r*(1+z*.1)+Math.sin(p.a+u*5)*rp*.18*Math.sin(u*Math.PI),py=cy+p.y*r*(1+z*.1);
 const alpha=dim*reveal*(.28+.72*(z+1)/2)*(.9+.1*Math.sin(phase*2+p.a)),sz=(.8+p.k*.9)*(rp/42);
 cx.globalAlpha=alpha;cx.fillStyle=p.q>.85?'#ffe0f4':p.q>.45?'#e7f7ff':'#9fceff';cx.fillRect(px-sz/2,py-sz/2,sz,sz);
 if(i%5===0&&transit>.05){cx.globalAlpha=alpha*.28*transit;cx.strokeStyle='#bfdeff';cx.lineWidth=.7;cx.beginPath();cx.moveTo(px,py);cx.lineTo(px+z*4*transit,py+3*transit);cx.stroke();}
 if(i%71===0&&z>.3){cx.globalAlpha=alpha*.4;cx.fillRect(px-3,py,6,.6);cx.fillRect(px,py-3,.6,6);}
 }
 cx.restore();cx.globalAlpha=1;cx.globalCompositeOperation='source-over';return true;
}

function drawBody(f,dim){
 const star=!!f.isStar,[sx,sy]=W2S(f.x,f.y),rp=f.sr*f.ps*S*cam.z;f.sx=sx;f.sy=sy;f.rp=rp;
 if(!f.pts||sx<-rp*6||sx>W+rp*6||sy<-rp*6||sy>H+rp*6)return;
 if(star&&drawBeaconAwakening(f,sx,sy,rp,dim))return;
 let L=[-.55,-.4,.73];
 if(!star){const dx=-f.v[0],dy=-f.v[1],dz=-f.v[2],m=Math.hypot(dx,dy,dz)||1;L=[dx/m,dy/m,dz/m];L[2]=Math.max(.22,L[2]);const z=Math.hypot(...L);L=L.map(v=>v/z);}
 cx.save();cx.globalAlpha=dim;cx.globalCompositeOperation='source-over';
 drawOrbitalAura(f,sx,sy,rp,dim,false);
 if(!star&&f.key===focusKey)drawMoons(f,dim,false);
 
 cx.globalAlpha=1;cx.drawImage(planetMaterial(f,L),sx-rp,sy-rp,rp*2,rp*2);
 cx.globalCompositeOperation='lighter';
 // Thin atmospheric crescent, not a uniformly luminous shell.
 const la=Math.atan2(L[1],L[0]);cx.strokeStyle=star?'#e4a8c3':f.color;
 cx.globalAlpha=dim*.36;cx.lineWidth=1.4;cx.beginPath();cx.arc(sx,sy,rp+.6,la-1.2,la+1.2);cx.stroke();
 cx.globalAlpha=dim*.07;cx.lineWidth=4;cx.stroke();
 const A=f.pts,cs=Math.cos(f.spinA||0),ss=Math.sin(f.spinA||0);
 for(let i=0;i<A.length;i+=12){const x=A[i]*cs-A[i+2]*ss,z=A[i]*ss+A[i+2]*cs,y=A[i+1];if(z<0||z>.28)continue;
 const d=x*L[0]+y*L[1]+z*L[2];if(d<.05)continue;cx.globalAlpha=dim*d*.24;cx.fillStyle=star?'#efbfd4':f.color;cx.fillRect(sx+x*rp-.4,sy+y*rp-.4,.8,.8);}
 
 drawAtmosphere(f,sx,sy,rp,dim,L);drawOrbitalAura(f,sx,sy,rp,dim,true);
 if(!star&&f.key===focusKey)drawMoons(f,dim,true);
 cx.restore();cx.globalAlpha=1;cx.globalCompositeOperation='source-over';
}
function drawLock(f){
 if(!f||f.sx==null||!f.rp)return;
 const chosen=f.key===focusKey,pulse=.75+.25*Math.sin(now*2),r=f.rp+4;
 cx.save();cx.translate(f.sx,f.sy);cx.strokeStyle=f.color;cx.fillStyle=f.color;cx.lineCap='round';
 // Two short, quiet rim accents; no surrounding dial or rotating target.
 for(const [a,len] of [[-.9,.55],[2.05,.32]]){
  cx.globalAlpha=(chosen?.65:.28)*pulse;cx.lineWidth=1.2;cx.beginPath();cx.arc(0,0,r,a,a+len);cx.stroke();
 }
 if(chosen){cx.globalAlpha=.85;cx.beginPath();cx.arc(0,r+7,1.6,0,Math.PI*2);cx.fill();}
 cx.restore();
}

function drawDistantWave(){
 if(reducedMotion)return;const t=(now*.045)%1;cx.save();cx.strokeStyle=rgba('#83b9df',.07*Math.sin(t*Math.PI));cx.lineWidth=1;
 cx.beginPath();cx.ellipse(CX,CY,S*(.7+t*.7)*AX,S*(.7+t*.7)*.8,-.14,0,Math.PI*2);cx.stroke();cx.restore();
}
const labelRects=[];
function drawLabels(foc){
 const bounds={l:CX-HW/2+8,r:CX+HW/2-8,t:CY-HH/2+70,b:CY+HH/2-82};labelRects.length=0;
 const bodies=[STAR,...FAM],rolePoints=[roleScreen(crab.x,crab.y),roleScreen(spi.x,spi.y),roleScreen(drone.x,drone.y)],ordered=[STAR,...FAM.slice().sort((a,b)=>(b===foc)-(a===foc)||b.t-a.t)];
 for(const f of ordered){if(f.sx==null)continue;const w=f.model?(MOBILE?134:156):(MOBILE?76:94),h=34,gap=f.rp+16;
  const opts=[[0,-gap-h/2],[0,gap+h/2],[gap+w/2,0],[-gap-w/2,0],[0,-gap-h*1.8],[0,gap+h*1.8]];
  for(let ring=1;ring<=2;ring++)for(let j=0;j<8;j++){const a=j*Math.PI/4;opts.push([Math.cos(a)*(gap+w*.6+ring*20),Math.sin(a)*(gap+h+ring*22)])}
  let best=null,score=Infinity;
  for(let i=0;i<opts.length;i++){const [dx,dy]=opts[i],x=Math.max(bounds.l+w/2,Math.min(bounds.r-w/2,f.sx+dx)),y=Math.max(bounds.t+h/2,Math.min(bounds.b-h/2,f.sy+dy));
   const box={x:x-w/2,y:y-h/2,w,h};let cost=i*.1;
   if(STAR.awakenBounds){const r=STAR.awakenBounds;if(box.x<r.x+r.w+5&&box.x+w+5>r.x&&box.y<r.y+r.h+5&&box.y+h+5>r.y)cost+=120;}
   for(const r of labelRects)if(box.x<r.x+r.w+5&&box.x+w+5>r.x&&box.y<r.y+r.h+5&&box.y+h+5>r.y)cost+=100;
   for(const q of bodies)if(q!==f&&q.sx!=null&&Math.abs(x-q.sx)<w/2+q.rp&&Math.abs(y-q.sy)<h/2+q.rp)cost+=20;
   for(const q of rolePoints)if(Math.abs(x-q[0])<w/2+34&&Math.abs(y-q[1])<h/2+32)cost+=85;
   if(cost<score){score=cost;best={...box,x0:x,y0:y}}}
  labelRects.push(best);f.labelBox=best;
  const lu=LIVE?.activity?.last_input?Date.parse(LIVE.activity.last_input):NaN,mins=Number.isFinite(lu)?Math.max(0,Math.round((Date.now()-lu)/60000)):null;
  const state=f.isStar?(mins==null?'暂无活动信号':mins<1?'刚刚来过':mins<60?mins+' 分钟前':Math.round(mins/60)+' 小时前'):(f.external?'未启用':f.busy?'正在想事情':f.cpu>1?'忙碌':'安静'),showState=f.external||f.isStar||f===foc||f.busy||f.cpu>1;
  cx.save();cx.globalAlpha=foc&&foc!==f?.5:1;cx.shadowColor='rgba(0,0,0,.95)';cx.shadowBlur=5;
  const nameFont=`600 ${MOBILE?12:14}px ${SANS}`,modelFont=`${MOBILE?9:10}px ${SANS}`,labelY=best.y0+(showState?-2:3);
  cx.font=nameFont;const nameText=f.name,nameWidth=cx.measureText(nameText).width;
  if(f.model){cx.font=modelFont;const modelWidth=cx.measureText(f.model).width,left=best.x0-(nameWidth+7+modelWidth)/2;cx.textAlign='left';cx.font=nameFont;cx.fillStyle=f.color;cx.fillText(nameText,left,labelY);cx.font=modelFont;cx.fillStyle='#b6c9da';cx.fillText(f.model,left+nameWidth+7,labelY)}
  else{cx.font=nameFont;cx.textAlign='center';cx.fillStyle=f.color;cx.fillText(nameText,best.x0,labelY)}
  cx.textAlign='center';
  if(showState){cx.font=`10px ${SANS}`;cx.fillStyle='#a2abbc';cx.fillText(state,best.x0,best.y0+12)}
  if(f===foc){cx.shadowBlur=0;cx.globalAlpha=.55;cx.fillStyle=f.color;cx.fillRect(best.x0-14,best.y0+20,28,1)}cx.restore();
 }
}
function drawScan(){
  if(reducedMotion)return;
  const top=CY-HH/2,y=top+((now*60)%(HH+40))-20;
  const g=cx.createLinearGradient(0,y-18,0,y+2);g.addColorStop(0,"rgba(95,224,208,0)");g.addColorStop(1,"rgba(95,224,208,.035)");
  cx.fillStyle=g;cx.fillRect(CX-HW/2,y-18,HW,20);cx.fillStyle="rgba(150,255,240,.08)";cx.fillRect(CX-HW/2,y+1,HW,1);
  cx.font=`8px ${MONO}`;cx.textAlign="left";cx.fillStyle="rgba(150,255,240,.5)";cx.fillText(`SCAN y=${Math.round(y-top)}`,CX-HW/2+4,y-3);
}
function drawHerClock(){
 if(!LIVE||!$('activityDetail').open)return;const c=$('activityChart'),g=c.getContext('2d'),u=LIVE.activity.observer||[],m=LIVE.activity.member1||[],mx=Math.max(4,...u,...m);
 g.clearRect(0,0,240,66);for(let h=0;h<24;h++){g.fillStyle='#de7aa6';g.fillRect(h*10,48-(u[h]||0)/mx*38,3,(u[h]||0)/mx*38);g.fillStyle='#e5ad6d';g.fillRect(h*10+4,48-(m[h]||0)/mx*38,3,(m[h]||0)/mx*38)}
 g.fillStyle='#a2abbc';g.font='10px sans-serif';g.fillText('0时',0,63);g.fillText('12时',112,63);g.fillText('23时',216,63);
}

// ───────────── 小屏幕们 ─────────────
const PC={};["pHouse","pWave","pX","pRadar","pHeat"].forEach(id=>{const c=$(id);PC[id]={c,g:c.getContext("2d"),w:0,h:0}});
function resizePanels(){for(const k in PC){const p=PC[k],w=p.c.clientWidth,h=p.c.clientHeight;p.w=w;p.h=h;p.c.width=Math.max(1,w*DPR);p.c.height=Math.max(1,h*DPR);p.g.setTransform(DPR,0,0,DPR,0,0)}}
function clr(p){p.g.clearRect(0,0,p.w,p.h);return p.g}
const WAVE={rx:[],tx:[],cpu:[],dw:[]},WN=160;let waveAcc=0;
function drawPanels(dt){
  if(!LIVE)return;
  drawHouse();drawX();drawRadar();drawHeat();
  waveAcc+=dt;while(waveAcc>.06){waveAcc-=.06;pushWave()}drawWave();
}
function pushWave(){
 // Recorded samples only; motion is a reading highlight, not invented telemetry.
 const hist=(LIVE.hist||[]).slice(-WN);
 WAVE.rx=hist.map(q=>Math.log10(1+Math.max(0,q.rx||0)));
 WAVE.tx=hist.map(q=>Math.log10(1+Math.max(0,q.tx||0)));
 WAVE.cpu=hist.map(q=>Math.max(0,q.cpu||0));
 WAVE.dw=hist.map(q=>Math.log10(1+Math.max(0,q.dw||0)));
}
function drawWave(){
  const p=PC.pWave,g=clr(p),w=p.w,h=p.h;if(w<10)return;const top=Math.max(28,h-67);
  g.strokeStyle="#141a21";g.lineWidth=1;for(let i=1;i<4;i++){g.beginPath();g.moveTo(0,top*i/4);g.lineTo(w,top*i/4);g.stroke()}
  for(let x=(-(now*24)%20+20)%20;x<w;x+=20){g.beginPath();g.moveTo(x,0);g.lineTo(x,top);g.stroke()}
  const line=(arr,col,lane)=>{if(arr.length<2)return;
   const mx=Math.max(.1,...arr),lh=top/4,base=(lane+1)*lh-2,points=arr.map((v,i)=>[i*w/Math.max(1,arr.length-1),base-Math.min(1,v/mx)*(lh-3)]);
   g.save();g.strokeStyle=col;g.shadowColor=col;g.shadowBlur=8;g.lineWidth=1.5;g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();g.globalAlpha=.12;g.lineWidth=5;g.stroke();g.globalAlpha=1;const fade=g.createLinearGradient(0,base-lh,0,base);fade.addColorStop(0,rgba(col,.19));fade.addColorStop(1,rgba(col,0));g.lineTo(w,base);g.lineTo(points[0][0],base);g.closePath();g.fillStyle=fade;g.fill();
   g.shadowBlur=7;const j=reducedMotion?points.length-1:Math.floor(now*38+lane*13)%points.length,pt=points[j];if(!reducedMotion){for(let k=1;k<12;k++){const prev=points[(j-k+points.length)%points.length];g.globalAlpha=(1-k/12)*.65;g.fillStyle=col;g.beginPath();g.arc(prev[0],prev[1],1.4,0,7);g.fill();}}g.globalAlpha=1;g.fillStyle='#e9fbff';g.beginPath();g.arc(pt[0],pt[1],2.1,0,7);g.fill();g.restore();
  };
  line(WAVE.rx,'#5ec4ff',0);line(WAVE.tx,'#ff7aa8',1);line(WAVE.cpu,'#ffd479',2);line(WAVE.dw,'#6fe3b4',3);
  const L=LIVE.hist||[],q=L[L.length-1]||{},H=LIVE.host;g.font=`9px ${MONO}`;g.textAlign="left";
  [["RX",fmtBps(q.rx||0)+"/s","#5ec4ff"],["TX",fmtBps(q.tx||0)+"/s","#ff7aa8"],["CPU",(q.cpu??0).toFixed(1)+"%","#ffd479"],["DISK·W",fmtBps(q.dw||0)+"/s","#6fe3b4"]].forEach(([k,v,c],i)=>{
    const x=(i%2)*w/2,y=top+10+(i>1?20:0);g.fillStyle=c;g.fillRect(x,y-5,5,2);g.fillStyle="#8793a3";g.fillText(k,x+9,y,w/2-12);g.fillStyle="#d9dee6";g.fillText(v,x+9,y+10,w/2-12)});
  const bars=[["MEM",H.mem_used/Math.max(1,H.mem_total)],["SWAP",H.swap_total?H.swap_used/H.swap_total:0],["DISK",H.disk_used/Math.max(1,H.disk_total)]];
  const bw=(w-12)/3;bars.forEach(([k,v],i)=>{const x=i*(bw+6),y=h-8;g.fillStyle="#141a21";g.fillRect(x,y,bw,4);
    g.fillStyle=v>.85?"#ff7088":v>.7?"#e2b46d":"#6fe3b4";g.fillRect(x,y,bw*v,4);g.fillStyle="#8a929e";g.fillText(`${k} ${Math.round(v*100)}%`,x,y-4,bw)});
  const sc=Math.max(0,Math.round(100-(bars[0][1]*35+bars[1][1]*25+bars[2][1]*25+(H.cpu/100)*15)));
  $("sigTag").textContent=`余裕 ${sc}`;$("sigTag").className=sc>60?"":sc>35?"y":"r";
}
function drawHouse(){
 const p=PC.pHouse,g=clr(p),w=p.w,h=p.h,hs=H_();if(w<20||h<35)return;
 const checks=hs.checks||[],bad=badChecks()[0],cx=35,cy=Math.min(37,h*.34),r=Math.min(27,h*.25);
 const ok=Number(hs.healthy)||0,total=Number(hs.total)||0,col=bad?'#e8b17d':'#80d6c1';
 g.lineWidth=3;g.strokeStyle='#88bed514';g.beginPath();g.arc(cx,cy,r,-Math.PI*.8,Math.PI*.8);g.stroke();
 g.strokeStyle=col;g.lineCap='round';g.beginPath();g.arc(cx,cy,r,-Math.PI*.8,-Math.PI*.8+Math.PI*1.6*(total?ok/total:0));g.stroke();g.lineCap='butt';
 if(!reducedMotion){g.save();const a=now*1.6;g.strokeStyle=col;g.shadowColor=col;g.shadowBlur=8;g.lineWidth=1.5;g.beginPath();g.arc(cx,cy,r+4,a,a+.65);g.stroke();g.restore();}
 g.font='500 19px '+MONO;g.fillStyle='#e0edf4';g.textAlign='center';g.fillText(total?Math.round(ok/total*100)+'%':'—',cx,cy+5);
 g.textAlign='left';g.font='10px '+SANS;g.fillStyle='#aec2d0';g.fillText('检查通过',76,cy-8);
 g.font='500 17px '+MONO;g.fillStyle=col;g.fillText(ok+' / '+(hs.total??'—'),76,cy+13);
 const cols=10,rows=4,top=Math.max(cy+r+9,h-39),cw=(w-8)/cols,ch=Math.max(3,(h-top-11)/rows);
 checks.slice(0,40).forEach((c,i)=>{const x=4+i%cols*cw,y=top+Math.floor(i/cols)*ch,c0=c.sev==='ok'?'#80d6c1':c.sev==='warn'?'#e8b17d':'#f48caa';g.fillStyle=rgba(c0,.36);g.fillRect(x,y,cw-3,Math.max(2,ch-2));
 if(!reducedMotion){const scan=(now*11)%40,d=(scan-i+40)%40;if(d<6){g.save();g.shadowColor=c0;g.shadowBlur=7;g.fillStyle=rgba(c0,(1-d/6)*.8);g.fillRect(x,y,cw-3,Math.max(2,ch-2));g.restore();}}});
 g.font='7px '+MONO;g.fillStyle='#718b9d';g.fillText('CHECK MATRIX',4,h-1);g.textAlign='right';g.fillText('#'+(hs.rounds??'—'),w-2,h-1);g.textAlign='left';
 $('hsTag').textContent=(hs.healthy??'?')+'/'+(hs.total??'?');$('hsTag').className=bad?'y':'';
}

const sentinelCanvas=$('sentinelOverlay'),sentinelG=sentinelCanvas.getContext('2d');
let sentinelScreen=null,sentinelLastTime=performance.now();
const sentinelState={mode:'scan',site:'house',since:performance.now(),duration:3,from:null,pending:null,alert:null,bag:[],demoSeen:0,seen:new Set()};

function sentinelRemember(key){sentinelState.seen.add(key);if(sentinelState.seen.size>64)sentinelState.seen.delete(sentinelState.seen.values().next().value);}
function sentinelNextSite(){
 const st=sentinelState;if(st.pending)return 'log';
 if(!st.bag.length){st.bag=['house','log','wave','member1','member2','member3','member5','member6','member7'];for(let i=st.bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[st.bag[i],st.bag[j]]=[st.bag[j],st.bag[i]];}}
 let site=st.bag.pop();if(site===st.site&&st.bag.length){st.bag.unshift(site);site=st.bag.pop();}return site;
}
function drawSentinelRoute(dt){
  const g=sentinelG,d=Math.min(devicePixelRatio||1,1.5),vw=innerWidth,vh=innerHeight;
  if(sentinelCanvas.width!==Math.round(vw*d)||sentinelCanvas.height!==Math.round(vh*d)){sentinelCanvas.width=Math.round(vw*d);sentinelCanvas.height=Math.round(vh*d);}
  g.setTransform(d,0,0,d,0,0);g.clearRect(0,0,vw,vh);
  const a=$('pHouse').getBoundingClientRect(),b=$('log').getBoundingClientRect(),sb=sky.getBoundingClientRect();
  if(a.width<10||b.width<10||a.bottom<0||a.top>vh)return;
  const f=byKey.member4,off=ringDockOffset(f,-1),q=roleScreen(f.x+off.x,f.y+off.y);
  const A={x:a.right+20,y:a.top+Math.min(a.height*.36,45)},B={x:b.right+20,y:b.top+Math.min(b.height*.48,60)},C={x:sb.left+q[0],y:sb.top+q[1]};
  const wave=$('pWave').getBoundingClientRect(),st=sentinelState,stamp=performance.now();
  const spot=site=>{
    if(site==='house')return A;if(site==='log')return B;
    if(site==='wave')return{x:wave.right+20,y:wave.top+wave.height*.45};
    const v=byKey[site]||byKey.member4,off=ringDockOffset(v,-1),pt=roleScreen(v.x+off.x,v.y+off.y);return{x:sb.left+pt[0],y:sb.top+pt[1]};
  };
  const go=(site,urgent=false)=>{st.site=site;st.mode=urgent?'rush':'travel';st.since=stamp;st.from={...(sentinelScreen||A)};const dst=spot(site);st.dock={...dst};st.duration=Math.max(1.4,Math.min(5.5,Math.hypot(dst.x-st.from.x,dst.y-st.from.y)/(urgent?205:100)));};
  // Read-only visual reaction to fresh public health samples. Never dispatch a real task here.
  if(wfModel&&wfModel.freshness==='fresh'&&Date.now()-wfModel.sampled<60000){
    const bad=badChecks(),inc=wfModel.house&&wfModel.house.incident;
    if(bad.length){const signature=bad.map(c=>(c.name||c.key||'?')+':'+c.sev).sort().join('|'),key=inc&&!inc.closed?'incident:'+inc.token:'checks:'+hash(signature);
      if(!st.demoActive&&!st.seen.has(key)&&(!st.alert||st.alert.key!==key))st.pending={key,demo:false};
    }else if(st.pending&&!st.pending.demo&&!st.pending.routine)st.pending=null;
  }
  if((!wfModel||wfModel.freshness!=='fresh'||Date.now()-wfModel.sampled>=60000)&&st.pending&&!st.pending.demo)st.pending=null;
  // A fresh, real health round drives an automatic visual report, never a task dispatch.
  if(wfModel&&wfModel.freshness==='fresh'&&Date.now()-wfModel.sampled<60000){const round=wfModel.house?.rounds;if(round!=null&&st.reportRound!==round&&!st.alert&&!st.pending&&st.mode!=='exchange'&&st.mode!=='rush'){st.reportRound=round;st.pending={key:'round:'+round,routine:true,demo:false};}}

  sentinelCanvas.dataset.routeMode=st.mode;sentinelCanvas.dataset.pendingReport=st.pending?.key||'';
  const age=(stamp-st.since)/1000;
  if(!reducedMotion){
    if(st.mode==='scan'&&age>1.2&&st.pending&&['house','log'].includes(st.site)){
      st.alert=st.pending;st.pending=null;if(!st.alert.routine&&!st.alert.demo)sentinelRemember(st.alert.key);st.mode='startled';st.since=stamp;st.from={...(sentinelScreen||spot(st.site))};if(st.alert.routine)go('member4',true);
    }else if(st.mode==='scan'&&age>st.duration)go(sentinelNextSite());
    else if(st.mode==='startled'&&age>1.45)go('member4',true);
    else if((st.mode==='travel'||st.mode==='rush')&&age>=st.duration&&sentinelScreen&&Math.hypot(sentinelScreen.x-(st.dock||spot(st.site)).x,sentinelScreen.y-(st.dock||spot(st.site)).y)<9){st.mode=st.mode==='rush'?'exchange':'scan';st.since=stamp;st.duration=2.3+Math.random()*1.8;}
    else if(st.mode==='exchange'&&age>=6){if(st.alert?.demo){if(!sceneDemoOn()){$('sentinelDemo').textContent='全景演示';$('sentinelDemo').disabled=false;}st.demoActive=false;}st.alert=null;go(sentinelNextSite());}
  }
  const phaseAge=Math.max(0,(stamp-st.since)/1000),progress=Math.min(1,phaseAge/st.duration),destination=st.dock||spot(st.site);
  let target={...destination},moving=['travel','rush'].includes(st.mode)&&!reducedMotion,stage;
  const mix=(p,q,u)=>({x:p.x+(q.x-p.x)*u+Math.sin(Math.PI*u)*(st.mode==='rush'?12:32),y:p.y+(q.y-p.y)*u-Math.sin(Math.PI*u)*18});
  if(moving)target=mix(st.from,destination,ease(progress));
  if(st.mode==='startled')target={...st.from,y:st.from.y-Math.sin(Math.min(1,phaseAge/.55)*Math.PI)*7};
  const siteName=({house:'机房屏',log:'日志屏',wave:'信号屏'})[st.site]||(byKey[st.site]&&byKey[st.site].name)||'巡检点';
  stage=st.mode==='startled'?'发现异常！':st.mode==='rush'?(st.alert?.routine?'送巡检报告给'+byKey.member4.name:'带着异常去找'+byKey.member4.name):st.mode==='exchange'?(phaseAge<2.25?'递交光包':phaseAge<4.5?byKey.member4.name+'回应光信号':'光包交接完成 ✓'):st.mode==='travel'?'前往'+siteName:'检查'+siteName;
  const t=st.mode==='rush'?14+Math.min(.999,progress)*2:st.mode==='exchange'?16+phaseAge*(2/3):-1;
  const wall=performance.now(),elapsed=Math.min(.1,Math.max(.001,(wall-sentinelLastTime)/1000));sentinelLastTime=wall;
  if(!sentinelScreen)sentinelScreen={...target};
  const old={...sentinelScreen},blend=1-Math.exp(-elapsed*10);
  let support=1;const rig=spi.plantedRig;
   if(rig&&rig.feet.length){let reach=0;rig.feet.forEach((foot,j)=>{if(foot.swing)return;const co=Math.cos(rig.angle),si=Math.sin(rig.angle),xx=((foot.x-sentinelScreen.x)*co+(foot.y-sentinelScreen.y)*si)/rig.u,yy=(-(foot.x-sentinelScreen.x)*si+(foot.y-sentinelScreen.y)*co)/rig.u,side=j<4?-1:1;reach=Math.max(reach,Math.hypot(xx-side*.65,yy-(-2.7+(j%4)*1.8)));});support=Math.max(.32,Math.min(1,1-(reach-7.2)/3));}
   const mx=(target.x-sentinelScreen.x)*blend,my=(target.y-sentinelScreen.y)*blend,ml=Math.hypot(mx,my),limit=(st.mode==='rush'?145:105)*support*elapsed,ratio=ml>limit?limit/ml:1;
   sentinelScreen.x+=mx*ratio;sentinelScreen.y+=my*ratio;
  const dx=sentinelScreen.x-old.x,dy=sentinelScreen.y-old.y,dist=Math.hypot(dx,dy);
  const rect=st.site==='house'?a:st.site==='log'?b:st.site==='wave'?wave:null,look=rect?{x:rect.left+rect.width*.5,y:rect.top+rect.height*.5}:(()=>{const v=byKey[st.site]||f,pt=W2S(v.x,v.y);return{x:sb.left+pt[0],y:sb.top+pt[1]};})();
  moving=!reducedMotion&&dist/elapsed>3;
   const desired=moving?Math.atan2(dy,dx)+Math.PI/2:Math.atan2(look.y-sentinelScreen.y,look.x-sentinelScreen.x)+Math.PI/2;
  if(spi.heading==null)spi.heading=desired;
  const turn=Math.atan2(Math.sin(desired-spi.heading),Math.cos(desired-spi.heading));spi.heading+=turn*(1-Math.exp(-elapsed*7));
  if(moving)spi.ph+=Math.min(dist,.1*180)*.12;
  target={...sentinelScreen};
  spi.cur={report:null};
  const seg=[st.from||target,destination];
  g.save();
  spi.softTrail=spi.softTrail||[];const tail=spi.softTrail,last=tail[tail.length-1];
  if(!last||Math.hypot(target.x-last.x,target.y-last.y)>1.5){
   if(last&&Math.hypot(target.x-last.x,target.y-last.y)>80)tail.length=0;
   tail.push({x:target.x,y:target.y,born:now});
  }
  while(tail.length&&(now-tail[0].born>1.1||tail.length>40))tail.shift();
  g.lineCap='round';
  for(let j=1;j<tail.length;j++){
   const p=tail[j],a=tail[j-1],fade=Math.pow(Math.max(0,1-(now-p.born)/1.1),2);
   g.beginPath();g.moveTo(a.x,a.y);g.lineTo(p.x,p.y);g.strokeStyle='rgba(117,221,255,'+(fade*.3)+')';g.lineWidth=.65;g.stroke();
  }
  const screen=st.mode==='scan'?rect:null;
  if(screen){g.strokeStyle='rgba(140,239,255,.60)';g.lineWidth=1;g.strokeRect(screen.left-2,screen.top-2,screen.width+4,screen.height+4);const yy=screen.top+(now*.4%1)*screen.height;g.fillStyle='rgba(112,223,255,.07)';g.fillRect(screen.left,yy,screen.width,4);
    g.strokeStyle='rgba(144,237,255,.25)';g.beginPath();g.moveTo(target.x,target.y);g.lineTo(screen.left+12,yy);g.stroke();}
  spi.ack=t>=19&&t<20;
  if(t>=14&&t<20){
    const st=W2S(f.x,f.y),px=sb.left+st[0],py=sb.top+st[1],r=f.sr*f.ps*S*cam.z;
    const entrance=Math.min(1,(t-14)/1.3),exit=Math.min(1,(20-t)/.5),alpha=entrance*exit;
    const angle=Math.atan2(target.y-py,target.x-px),rr=r*1.24;
    g.save();g.globalAlpha=alpha;
    const glow=g.createRadialGradient(px,py,r*.9,px,py,r*1.65);glow.addColorStop(0,'rgba(255,151,208,0)');glow.addColorStop(.5,'rgba(255,160,219,.30)');glow.addColorStop(1,'rgba(255,151,208,0)');g.fillStyle=glow;g.beginPath();g.arc(px,py,r*1.65,0,6.283);g.fill();
    g.strokeStyle='rgba(255,201,236,.9)';g.lineWidth=2;g.beginPath();g.arc(px,py,rr,angle-.55,angle+.55);g.stroke();
    const end={x:px+Math.cos(angle)*rr,y:py+Math.sin(angle)*rr},ctrl={x:(target.x+end.x)/2,y:Math.min(target.y,end.y)-24};
    g.strokeStyle='rgba(151,224,255,.58)';g.lineWidth=1.6;g.shadowColor='#88daff';g.shadowBlur=7;g.beginPath();g.moveTo(target.x,target.y);g.quadraticCurveTo(ctrl.x,ctrl.y,end.x,end.y);g.stroke();g.shadowBlur=0;
    sentinelCanvas.dataset.handoffStage=t<16?'approach':t<17.5?'send':t<19?'reply':'complete';
    const send=t>=16&&t<17.5,reply=t>=17.5&&t<19;
    if(t<16){const v=(now*.9)%1,ox=(1-v)**2*target.x+2*(1-v)*v*ctrl.x+v*v*end.x,oy=(1-v)**2*target.y+2*(1-v)*v*ctrl.y+v*v*end.y;g.fillStyle='#c5f3ff';g.shadowColor='#86d9ff';g.shadowBlur=12;g.beginPath();g.arc(ox,oy,2.5,0,Math.PI*2);g.fill();g.shadowBlur=0;}
    if(send||reply){let v=send?(t-16)/1.5:1-(t-17.5)/1.5;v=Math.max(0,Math.min(1,v));const ox=(1-v)*(1-v)*target.x+2*(1-v)*v*ctrl.x+v*v*end.x,oy=(1-v)*(1-v)*target.y+2*(1-v)*v*ctrl.y+v*v*end.y;
      g.shadowBlur=10;g.shadowColor=send?'#a6f2ff':'#ffb5e5';g.fillStyle=send?'#d0fbff':'#ffd9ef';g.save();g.translate(ox,oy);g.rotate(Math.PI/4);g.fillRect(-4,-4,8,8);g.restore();g.shadowBlur=0;
      if(reply){g.strokeStyle='rgba(255,181,228,.65)';g.lineWidth=1.3;g.beginPath();g.arc(px,py,rr+(t-17.5)*12,angle-.8,angle+.8);g.stroke();}
    }
    g.font='11px '+SANS;g.textAlign='center';g.fillStyle='#ffd1e9';g.fillText(t<16?byKey.member4.name+' · 看向巡游者':t<17.5?'递交光包':t<19?byKey.member4.name+' · 回应光信号':byKey.member4.name+' · 交接完成',px,py-r-18);
    if(t>=19){g.strokeStyle='rgba(178,244,255,.6)';g.beginPath();g.arc(target.x,target.y,19+(t-19)*8,-2.5,-.6);g.stroke();}
    g.restore();
  }
  drawSpider(target.x,target.y,MOBILE?.82:1.05,moving,g,true);
   sentinelCanvas.dataset.walkSpeed=(dist/elapsed).toFixed(1);sentinelCanvas.dataset.walking=String(moving);
   roomAudio.tick(st,phaseAge,moving);
  if(['startled','rush','exchange'].includes(st.mode)){
    const delivered=st.mode==='exchange'&&phaseAge>=4.5;
    if(delivered&&st.alert){sentinelCanvas.dataset.lastVisualHandoff=st.alert.key;sentinelCanvas.dataset.handoffKind=st.alert.demo?'demo':st.alert.routine?'routine':'anomaly';}
    const pop=st.mode==='startled'?Math.min(1,phaseAge*5):delivered?1+Math.sin(Math.min(1,(phaseAge-4.5)/.35)*Math.PI)*.18:1,bx=target.x,by=target.y-35;
    g.save();g.translate(bx,by);g.scale(pop,pop);
    if(delivered){g.fillStyle='rgba(12,53,41,.94)';g.strokeStyle='#79f4b5';g.lineWidth=1.5;g.beginPath();g.roundRect(-11,-14,22,25,6);g.fill();g.stroke();}
    if(delivered){
      // This check marks the visual handoff only, never repair or actual dispatch success.
      g.strokeStyle='#a7ffd0';g.lineWidth=3;g.lineCap='round';g.lineJoin='round';g.shadowColor='#63eeab';g.shadowBlur=5;
      g.beginPath();g.moveTo(-6,-1);g.lineTo(-1,4);g.lineTo(7,-6);g.stroke();
    }else{g.fillStyle='#c8f4ff';g.shadowColor='#69ceff';g.shadowBlur=9;g.font='bold 25px '+SANS;g.textAlign='center';g.fillText(st.alert?.routine?'·':'!',0,7);}
    g.restore();
    if(st.mode==='startled'){g.strokeStyle='rgba(156,226,255,.8)';g.lineWidth=1.2;for(const side of [-1,1]){g.beginPath();g.moveTo(bx+side*16,by-4);g.lineTo(bx+side*23,by-9);g.stroke();}}
  }
  const tx=sb.left+CX,ty=sb.top+(MOBILE?CY+HH/2-112:CY-HH/2+55);
  g.font='9px '+SANS;g.textAlign='center';const txt=(st.demoActive?'动态演示 · ':st.alert&&!st.alert.routine?'采样异常 · ':'巡检动画 · ')+stage,tw=g.measureText(txt).width+12;g.fillStyle='rgba(3,14,26,.84)';g.fillRect(tx-tw/2,ty-11,tw,16);g.fillStyle='#a2d8e9';g.fillText(txt,tx,ty);
  g.restore();
}
function drawX(){
  const p=PC.pX,g=clr(p),w=p.w,h=p.h,t=T_();if(w<10)return;
  const r=Math.min(h*.36,w*.22),ox=r+4,oy=r+4;
  g.strokeStyle="#316278";g.lineWidth=1;[1,.66,.33].forEach(k=>{g.beginPath();g.arc(ox,oy,r*k,0,6.283);g.stroke()});
  g.beginPath();g.moveTo(ox-r,oy);g.lineTo(ox+r,oy);g.moveTo(ox,oy-r);g.lineTo(ox,oy+r);g.stroke();
  const a0=now*1.4%6.283;
  for(let i=0;i<14;i++){g.fillStyle=`rgba(223,231,238,${.38*(1-i/14)})`;g.beginPath();g.moveTo(ox,oy);g.arc(ox,oy,r,a0-(i+1)*.06,a0-i*.06);g.closePath();g.fill()}
  g.save();g.strokeStyle='#9ef5ff';g.shadowColor='#66e6ff';g.shadowBlur=7;g.beginPath();g.moveTo(ox,oy);g.lineTo(ox+Math.cos(a0)*r,oy+Math.sin(a0)*r);g.stroke();g.restore();
  const logs=t.log||[];logs.forEach((l,i)=>{const R=rng(hash(l.t+i)),a=R()*6.283,d=.3+R()*.6,x=ox+Math.cos(a)*r*d,y=oy+Math.sin(a)*r*d;
    let da=((a0-a)%6.283+6.283)%6.283,lit=Math.max(0,1-da/2.5);g.fillStyle=`rgba(${/重置|新帖/.test(l.msg)?"255,122,168":"95,224,208"},${.25+lit*.75})`;g.fillRect(x-1.5,y-1.5,3,3)});
  // 周用量弧
  const used=t.weekly_used??0,gx=ox*2+(w-ox*2)/2+4,gy=oy,gr=Math.min(r*.78,(w-ox*2)/2-8);
  g.lineWidth=3;g.strokeStyle="#141a21";g.beginPath();g.arc(gx,gy,gr,Math.PI*.75,Math.PI*2.25);g.stroke();
  const shown=used;g.strokeStyle=used>85?"#ff7088":used>60?"#e2b46d":"#69ddff";
  g.beginPath();g.arc(gx,gy,gr,Math.PI*.75,Math.PI*(.75+1.5*shown/100));g.save();g.shadowColor=g.strokeStyle;g.shadowBlur=8;g.stroke();g.restore();g.lineWidth=1;
  if(!reducedMotion){const a=now*1.4;g.strokeStyle='rgba(118,226,255,.55)';g.beginPath();g.arc(gx,gy,gr+5,a,a+.45);g.stroke();}
  g.fillStyle="#dcecf5";g.font=`700 ${gr>30?14:11}px ${MONO}`;g.textAlign="center";g.fillText(used+"%",gx,gy+4);
  g.font=`8px ${MONO}`;g.fillStyle="#6b7380";g.fillText("WEEKLY",gx,gy+gr+10);
  const rs=t.resets_at?new Date(t.resets_at)/1000-Date.now()/1000:NaN,nx=t.x&&t.x.next?t.x.next-Date.now()/1000:NaN;
  const by=oy*2+12;g.textAlign="left";g.font=`9px ${MONO}`;
  [["RESET",fmtLeft(rs),"#ff7aa8"],["NEXT·X",fmtLeft(nx).slice(-5),"#dfe7ee"],["POST","…"+(t.last_signal||"—"),"#8a929e"]].forEach(([k,v,c],i)=>{
    const y=by+i*12;if(y>h-2)return;g.fillStyle="#6b7380";g.fillText(k,0,y);g.fillStyle=c;g.fillText(v,46,y,w-46)});
  $("xsTag").textContent=drone.fire>0?"射击中":"盯梢";$("xsTag").className=drone.fire>0?"r":"";
}
function drawRadar(){
 const p=PC.pRadar,g=clr(p),w=p.w,h=p.h;if(w<20||h<30)return;
 const top=5,row=(h-18)/FAM.length,left=34,right=w-42,bw=right-left;
 const max=Math.max(1,...FAM.map(f=>Math.max(0,Number(f.cpu)||0)));
 g.font='9px '+SANS;g.lineWidth=.5;
 FAM.forEach((f,i)=>{const y=top+i*row,v=Math.max(0,Number(f.cpu)||0),fill=bw*v/max;
 g.fillStyle='#b5c9d7';g.fillText(f.name,0,y+8);
 g.fillStyle='#97bbd012';g.fillRect(left,y+3,bw,4);
 const grad=g.createLinearGradient(left,0,right,0);grad.addColorStop(0,rgba(f.color,.25));grad.addColorStop(1,rgba(f.color,.85));g.fillStyle=grad;g.fillRect(left,y+3,fill,4);
 if(fill>1){g.save();g.shadowColor=f.color;g.shadowBlur=7;g.fillStyle='#dceef5';g.fillRect(left+fill-1,y+2,1,6);g.restore();if(!reducedMotion){const xx=left+((now*.65+i*.19)%1)*fill,tail=Math.min(24,fill);g.save();g.beginPath();g.rect(left,y+2,fill,6);g.clip();const gleam=g.createLinearGradient(xx-tail,0,xx,0);gleam.addColorStop(0,rgba(f.color,0));gleam.addColorStop(1,'#efffff');g.fillStyle=gleam;g.fillRect(xx-tail,y+3,tail,4);g.restore();}}
 g.textAlign='right';g.font='9px '+MONO;g.fillStyle='#d2e2ec';g.fillText(f.external?'—':v.toFixed(1)+'%',w,y+8);g.textAlign='left';g.font='9px '+SANS;
 });g.font='7px '+MONO;g.fillStyle='#69879a';g.fillText('CPU / RELATIVE SCALE',0,h-1);g.textAlign='right';g.fillText('MAX '+max.toFixed(1)+'%',w,h-1);g.textAlign='left';
}

function drawHeat(){
 const p=PC.pHeat,g=clr(p),w=p.w,h=p.h;if(w<20||h<35)return;
 const hist=LIVE.hist||[],cols=24,rows=FAM.length,left=29,cw=(w-left)/cols,rh=(h-16)/rows,per=Math.max(1,Math.ceil(hist.length/cols));
 g.font='8px '+SANS;
 FAM.forEach((f,row)=>{g.fillStyle='#94aebf';g.fillText(f.name,0,row*rh+rh*.7);if(f.external){g.fillText('未接入',left,row*rh+rh*.7);return;}
 for(let col=0;col<cols;col++){const end=hist.length-(cols-1-col)*per,start=Math.max(0,end-per),seg=end>0?hist.slice(start,end):[],v=seg.length?seg.reduce((a,q)=>a+((q.g||{})[f.key]||0),0)/seg.length:0,value=Math.min(1,Math.log1p(Math.max(0,v)*3)/2.4);
 g.fillStyle=seg.length?rgba(f.color,.09+value*.71):'#a7c7d706';g.fillRect(left+col*cw,row*rh+1,Math.max(1,cw-1.5),Math.max(2,rh-3));}});
 if(!reducedMotion){const x=left+((now*.19)%1)*(w-left);g.save();g.beginPath();g.rect(left,0,w-left,h-17);g.clip();const trail=g.createLinearGradient(x-24,0,x,0);trail.addColorStop(0,'#9ceeff00');trail.addColorStop(1,'#9ceeff38');g.fillStyle=trail;g.fillRect(x-24,0,24,h-17);g.shadowColor='#9ceeff';g.shadowBlur=7;g.fillStyle='#b9f5ffa0';g.fillRect(x,0,1,h-17);g.restore();}
 g.font='7px '+MONO;g.fillStyle='#6b899d';g.fillText('HISTORY',left,h-1);g.textAlign='right';g.fillText('NOW',w,h-1);g.textAlign='left';
 $('heatSpan').textContent=hist.length?Math.round(hist.length*(LIVE.tick||10)/60)+'m':'—';
}

// 日志（平滑往上滚 + 打字）
let logRevision=0;const LOG=[];const VERB={walk:"#7fc8ff",scan:"#cfd6de",wave:"#ffd479",flag:"#ff7088",wake:"#6fe3b4",rest:"#8a929e",fail:"#ff7088",her:"#ff7aa8",ping:"#ff5f6d",x:"#dfe7ee",data:"#4f5865"};
function openLog(){const box=$('logFull');box.replaceChildren();LOG.slice().reverse().forEach(l=>{const p=document.createElement('p');p.textContent=l.t+'  '+l.v+'  '+l.txt;box.appendChild(p)});$('logDialog').showModal()}
$('log').addEventListener('click',openLog);$('log').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openLog()}});$('logClose').addEventListener('click',()=>$('logDialog').close());
function addLog(v,txt,color){const d=new Date();LOG.push({t:pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds()),v,txt,color,fresh:true});if(LOG.length>60)LOG.shift();renderLog()}
function renderLog(){logRevision++;const el=$('logIn');
 const rows=LOG.slice(-26).map(l=>{const row=node('div',undefined,l.fresh?'l new':'l');row.append(node('span',l.t,'t'),colored('span',l.v,l.color||VERB[l.v],'v'),colored('span',l.txt,l.color));l.fresh=false;return row;});
 el.replaceChildren(...rows);el.style.transition='none';el.style.transform='translateY(16px)';void el.offsetHeight;el.style.transition='';el.style.transform='translateY(0)';$('logRate').textContent=LOG.length+' ev';
}
let tickerPending=null;
function makeTicker(items){const box=document.createDocumentFragment();for(const [text,color]of items)box.append(colored('span',text,color||'#c1ced8'));return box;}
function updateTicker(items){if(!$('tk').childElementCount)$('tk').replaceChildren(makeTicker(items));else tickerPending=items;}

setInterval(()=>{if(!LIVE||document.hidden)return;const L=LIVE.hist||[],q=L[L.length-1]||{};
  const r=Math.random();
  if(r<.4)addLog("data",`rx ${fmtBps(q.rx||0)} tx ${fmtBps(q.tx||0)} · 0x${hex(6)}`,"#4f5865");
  else if(r<.7){const f=FAM[Math.random()*FAM.length|0],o=f.organs[Math.random()*f.organs.length|0];if(o)addLog("read",`${f.name}/${o.name} ${fmtMB(o.mb)}`,f.color)}
  else addLog("data",`cpu ${(q.cpu??0).toFixed(1)}% · mem ${fmtMB(LIVE.host.mem_used)} · ${hex(4)}`,"#4f5865")},1700);
let seenEv=new Set(),seenT=new Set(),seenN=new Set(),firstEv=true;
function renderPanels(){
  const h=LIVE.host;
  (LIVE.events||[]).forEach(e=>{const id=e.t+e.unit+e.msg;if(seenEv.has(id))return;seenEv.add(id);if(firstEv&&LOG.length>4)return;
    const who=FAM.find(f=>e.unit.startsWith(f.key+"-"));
    LOG.push({t:e.t,v:e.kind==="fail"?"fail":"rest",txt:e.unit.replace(/^(member1|member2|member3|member4|member5|member6)-/,(m,k)=>(byKey[k].external?"未启用节点":byKey[k].name)+" "),color:who?who.color:"#9aa3ae"})});
  ((T_().log)||[]).forEach(l=>{const id=l.t+l.msg;if(seenT.has(id))return;seenT.add(id);if(!firstEv)addLog("x",`beacon 水表 ${l.msg}`,"#dfe7ee")});
  ((H_().notes)||[]).forEach(l=>{const id=l.t+l.msg;if(seenN.has(id))return;seenN.add(id);if(!firstEv)addLog("ping",`机房 ${l.msg} ${l.key||""}`,"#ff5f6d")});
  firstEv=false;for(const seen of [seenEv,seenT,seenN])while(seen.size>256)seen.delete(seen.values().next().value);
  if(LOG.length>60)LOG.splice(0,LOG.length-60);renderLog();
  const mx=Math.max(...FAM.map(f=>f.mb||1));
  $('bars').replaceChildren(...FAM.map(f=>{const wrap=node('div'),lab=node('div',undefined,'lab');lab.append(colored('span',f.name+(f.busy?' ●':''),f.color));const values=node('span',undefined,'values');if(f.external)values.textContent='未启用';else values.append(node('b',fmtMB(f.mb)),node('b',f.procs+'p'),node('b',f.cpu.toFixed(1)+'%'));lab.append(values);wrap.append(lab);const bar=node('div',undefined,'bar'),fill=node('i');fill.style.width=(f.mb/mx*100).toFixed(1)+'%';fill.style.background='repeating-linear-gradient(90deg,'+f.color+' 0 9px,'+rgba(f.color,.45)+' 9px 14px)';bar.append(fill);wrap.append(bar);return wrap;}));
  $("memSum").textContent=fmtMB(FAM.reduce((a,f)=>a+f.mb,0));
  const up=Math.floor(h.uptime/86400);
  $('badge').replaceChildren(node('b',dataMode==='demo'?'● SIMULATED':'● LOCAL INPUT'),document.createTextNode(' · '+h.cores+' cores · up '+up+'d'),node('br'),document.createTextNode('内存数据 · '+(LIVE.tick||2)+'s · '+(lastInputError||'无后台连接')));
  // 跑马灯
  const hs=H_(),t=T_(),L=LIVE.hist||[],q=L[L.length-1]||{};
  const items=[...FAM.map(f=>[f.name+' · '+(f.external?'未启用':fmtMB(f.mb)+' · '+f.cpu.toFixed(1)+'%'),f.color]),
   ['模拟健康检查 '+(hs.healthy??'?')+'/'+(hs.total??'?')+' · 第 '+(hs.rounds||0)+' 轮','#ff5f6d'],
   ...badChecks().map(c=>['⚠ '+c.name+' '+(c.detail||''),'#e2b46d']),
   ['信标用量 '+(t.weekly_used??'?')+'%','#dfe7ee'],
   ['CPU '+h.cpu+'% · MEM '+fmtMB(h.mem_used)+'/'+fmtMB(h.mem_total)+' · DISK '+h.disk_used+'/'+h.disk_total+'G'],
   ['RX '+fmtBps(q.rx||0)+'/s · TX '+fmtBps(q.tx||0)+'/s'],
   [dataMode==='demo'?'所有指标均为本地合成样例':'本地输入 · 15 秒后自动清除','#ff7aa8']];
  updateTicker(items);
}
$('tk').addEventListener('animationiteration',()=>{if(tickerPending){$('tk').replaceChildren(makeTicker(tickerPending));tickerPending=null;}});

// rover.py
const CODE=["# rover.py · 模拟巡游", "scene = Server(\"本地沙盒\")", "rover = Crab(legs=4, claws=2)", "for member in scene.members:  # {N}", "    rover.walk_to(member)", "    for organ in member.organs:", "        if organ.mb > 200: flag(\"胖了\")", "        if organ.cpu > 0.5:", "            rover.wave(organ)  # {HOT}", "sentinel.patrol({CK})   # 机房哨兵", "xeye.watch(\"demo-beacon\") # {XU}", "if observer.recent_activity:   # {HER}", "    rover.drop_everything()", "    rover.return_to_hub()"];
function colorCode(row,text){
 const pattern=/(#[^\n]*|"[^"\n]*"|\b(?:for|in|if|return)\b|\b\d+(?:\.\d+)?\b)/g;let from=0;
 for(const m of text.matchAll(pattern)){row.append(document.createTextNode(text.slice(from,m.index)));row.append(node('span',m[0],m[0][0]==='#'?'c':m[0][0]==='"'?'s':/^\d/.test(m[0])?'n':'k'));from=m.index+m[0].length;}row.append(document.createTextNode(text.slice(from)));
}
function renderCode(){
  const previousCodeScroll=$("code").scrollTop;
  const lu=LIVE&&LIVE.activity.last_input?new Date(LIVE.activity.last_input):null,mins=lu?(Date.now()-lu)/60000:1e9,her=mins<15;
  if(spi.cur&&spi.t<1&&Math.random()<.25)line=9;if(drone.fire>0)line=10;
  if(her&&line!==12&&Math.random()<.15)line=12;
  const hot=crab.at?crab.at.organs.filter(o=>o.cpu>.5).length:0,hs=H_(),t=T_();
  $('code').replaceChildren(...CODE.map((lineText,i)=>{const row=node('span',undefined,'ln'+(i===line||(line===12&&i===13)?' cur':''));const content=lineText.replace('{N}',FAM.length+' 个节点').replace('{HOT}',hot+' 个活跃').replace('{CK}',String(hs.total||0)).replace('{XU}',String(t.weekly_used??0)+'%').replace('{HER}',her?'模拟活动':'无活动');colorCode(row,content);return row;}));
  const active=$('code').querySelector('.ln.cur');if(active){const box=$('code');box.scrollTop=previousCodeScroll;const r=active.getBoundingClientRect(),b=box.getBoundingClientRect();if(r.top<b.top+4||r.bottom>b.bottom-4){const y=r.top-b.top+box.scrollTop;box.scrollTo({top:Math.max(0,y-box.clientHeight*.45),behavior:reducedMotion?'auto':'smooth'});}}
  if(line===3)line=4;else if(line===5)line=6;else if(line===12)line=5;else if(line===9||line===10)line=5;
}
setInterval(renderCode,900);
function tickClock(){const d=new Date();$('clock').replaceChildren(node('b',pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())),document.createTextNode(' LOCAL · DEMO'));}
setInterval(tickClock,1000);tickClock();

// ───────────── 交互 ─────────────
function setFocusTitle(f){
  const selected=focusKey?byKey[focusKey]:null;
  if(!selected){$('fTitle').replaceChildren(document.createTextNode('00 '),node('span','全部节点'));$('fSub').textContent=CONFIG.central.name+' · 七个模拟节点 · 三个巡游角色';return;}
  $('fTitle').replaceChildren(document.createTextNode(pad(selected.i+1)+' '),node('span',selected.name));
  $("fSub").textContent=`${selected.procs} procs · ${fmtMB(selected.mb)} · ${selected.busy?"正在想事情":selected.cpu>1?"在忙":"安静"}`;
}
const tabs=$("tabs");
const allTab=node('button','全部节点','on');allTab.dataset.k='';tabs.append(allTab);for(const f of FAM){const button=node('button');button.dataset.k=f.key;const dot=node('i');dot.style.background=f.color;button.append(dot,document.createTextNode(f.name));if(f.model)button.append(node('small',f.model,'model-label'));tabs.append(button);}
tabs.onclick=e=>{const b=e.target.closest("button");if(!b)return;setTab(b.dataset.k||null)};
function showProcesses(k){const panel=$('processDetail'),f=byKey[k];panel.hidden=!f;if(!f)return;
 panel.replaceChildren();const title=document.createElement('strong');title.textContent=f.name+(f.external?' · 未启用':' · 模拟进程节点');panel.append(title);
 for(const [i,o] of f.organs.entries()){const row=document.createElement('div');row.textContent=pad(i+1)+'  '+o.name+' · '+fmtMB(o.mb)+' · '+o.cpu.toFixed(1)+'%';panel.append(row)}
}
function setTab(k){focusKey=k;showProcesses(k);[...tabs.children].forEach(b=>b.classList.toggle("on",(b.dataset.k||null)===k));
  if(k){goTo(byKey[k]);setFocusTitle(byKey[k]);if(!reducedMotion){crab.x=crab.to.x;crab.y=crab.to.y;crab.t=1;arrive(byKey[k])}}else{crab.dwell=Math.min(crab.dwell,1.5);setFocusTitle(crab.at)}
  wfHidden=true;renderWorkflow();}
sky.addEventListener("click",e=>{const b=sky.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top;
 if(Math.hypot(x-STAR.sx,y-STAR.sy)<STAR.rp+6){$('activityDetail').open=!$('activityDetail').open;return}
 const hits=FAM.filter(f=>{const r=f.labelBox;return Math.hypot(f.sx-x,f.sy-y)<f.rp+14||(r&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)}).sort((a,b)=>b.t-a.t);
 if(hits[0])setTab(focusKey===hits[0].key?null:hits[0].key);
});
sky.addEventListener("mousemove",e=>{const b=sky.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top,tip=$("tip"),hb=hole.getBoundingClientRect();
  hoverKey=null;for(const f of FAM)if(Math.hypot(f.sx-x,f.sy-y)<f.rp+12)hoverKey=f.key;
  let hit=null;FAM.filter(f=>f.key===focusKey||f.key===hoverKey).forEach(f=>f.organs.forEach(o=>{if(o.sx!=null&&Math.hypot(o.sx-x,o.sy-y)<9)hit=[f,o]}));
  if(!focusKey)showProcesses(hoverKey);
  if(!hit){tip.style.display="none";return}const[f,o]=hit;tip.style.display="block";
  tip.style.left=(e.clientX-hb.left+14)+"px";tip.style.top=(e.clientY-hb.top+12)+"px";
   tip.replaceChildren(colored('span',f.name,f.color),document.createTextNode(' / '+o.name+(o.n>1?' ×'+o.n:'')),node('br'),document.createTextNode(fmtMB(o.mb)+' · cpu '+o.cpu.toFixed(2)+'%'));});
sky.addEventListener('pointermove',e=>{const b=sky.getBoundingClientRect();pointerDepth.x=(e.clientX-b.left)/b.width*2-1;pointerDepth.y=(e.clientY-b.top)/b.height*2-1},{passive:true});
sky.addEventListener("mouseleave",()=>{$("tip").style.display="none";hoverKey=null;if(!focusKey)showProcesses(null);pointerDepth.x=pointerDepth.y=0});

// Validated local snapshot projection. No data sources are accessed here.
const WF_KEYS=FAM.map(f=>f.key);
const WF_TASKS={'heartbeat':'心跳调度','heartbeat-night':'夜间心跳调度','calendar':'日历任务调度','consolidate':'整理任务调度','memory-eval':'评估任务调度'};
function wfTime(v){if(typeof v==='number')return Number.isFinite(v)&&v>0?v*1000:null;if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v))return null;const n=Date.parse(v);return Number.isFinite(n)?n:null}
function wfHash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0).toString(16).padStart(8,'0')}
const WF_WIRE_STAGES={alarm:{scheduled:['handoff','闹钟已登记'],invoked:['invocation','闹钟调用中'],call_finished:['finished','闹钟调用完成'],failed:['failed','闹钟调用失败'],cancelled:['cancelled','闹钟已取消']},taskboard:{queued:['handoff','任务排队'],processing:['working','任务已领取 · 处理中'],review:['review','等待验收'],completed:['finished','任务完成记录'],failed:['failed','任务失败记录'],cancelled:['cancelled','任务已撤销'],verified:['verified','验收通过'],rework:['review','退回重做']},shared_task:{queued:['handoff','任务排队'],processing:['working','处理中记录'],blocked:['blocked','任务受阻'],completed:['finished','任务完成记录']}};
const WF_WIRE_SOURCES={alarm:'闹钟',taskboard:'任务板',shared_task:'共享任务'};
function wireWorkflow(rows,wall){
 const events=[],availability={};
 for(const r of Array.isArray(rows)?rows:[]){
  if(!r||Object.keys(r).sort().join(',')!=='event_id,member,result,source,stage,time')continue;
  if(!WF_KEYS.includes(r.member)||!Object.hasOwn(WF_WIRE_SOURCES,r.source)||!/^\w{32}$/.test(r.event_id)||!/^[0-9a-f]{32}$/.test(r.event_id)||!['unknown','accepted','success','failure','cancelled','available','unavailable'].includes(r.result))continue;
  const time=wfTime(r.time);if(time==null||time>wall+5000)continue;
  if(r.stage==='source_status'){if(['available','unavailable'].includes(r.result))availability[r.source]={state:wall-time>60000?'stale':r.result,time};continue}
  const def=WF_WIRE_STAGES[r.source][r.stage];if(!def)continue;
  // Completion is not verification. Only a structured review result gets a return path.
  if(r.stage==='verified'&&r.result!=='success')continue;
  const token=r.source+':'+r.event_id;
  events.push({id:token+':'+r.stage+':'+time,stream:token+':'+r.stage,time,key:r.member,kind:def[0],label:def[1],source:WF_WIRE_SOURCES[r.source],wire:r.source,stage:r.stage,token,result:({unknown:'结果未验证',accepted:'已登记',success:r.source==='alarm'?'调用成功（非业务验收）':'验收通过',failure:'失败',cancelled:'已取消'})[r.result]||'未知'});
 }
 return {events,availability};
}
function workflowModel(d,wall){
 const sampled=wfTime(d&&d.ts),age=sampled==null?Infinity:wall-sampled;
 const freshness=!d||d.ok!==true||sampled==null?'unknown':age < -5000?'unknown':age>60000?'stale':'fresh';
 const lag=(55+2*(Number.isFinite(d&&d.tick)&&d.tick>0?d.tick:10))*1000;
 const members=WF_KEYS.map(key=>{const g=(Array.isArray(d&&d.groups)?d.groups:[]).find(g=>g.key===key);return{key,procs:Number.isInteger(g&&g.procs)&&g.procs>=0?g.procs:null,tasks:[],heartbeat:'unconnected',workflow:'unconnected'}});
 const by=Object.fromEntries(members.map(m=>[m.key,m])),events=[];
 for(const t of Array.isArray(d&&d.timers)?d.timers:[]){
   const key=WF_KEYS.find(k=>typeof t.unit==='string'&&t.unit.startsWith(k+'-'));if(!key)continue;
   const kind=t.unit.slice(key.length+1),label=WF_TASKS[kind];if(!label)continue;
   const last=wfTime(t.last),next=wfTime(t.next),validLast=last!=null&&last<=wall+5000?last:null;
   const state=freshness!=='fresh'?freshness:next!=null&&wall>next+lag?'overdue':next==null?'unknown':'scheduled';
   by[key].tasks.push({unit:t.unit,label,last:validLast,next,state});
   if(validLast!=null)events.push({id:'timer:'+t.unit+':'+validLast,stream:'timer:'+t.unit,time:validLast,key,kind:'timer',label:label+'触发',source:'snapshot timer',result:'任务接收、执行及结果未接入'});
 }
 const h=d&&d.sent&&d.sent.house||{},updated=wfTime(h.updated),timer=h.timer||{},next=wfTime(timer.next),last=wfTime(timer.last);
 const checks=Array.isArray(h.checks)?h.checks:[];
 const faults=Array.isArray(h.checks)?checks.filter(c=>c.sev==='down').length:null,anomalies=Array.isArray(h.checks)?checks.filter(c=>typeof c.sev==='string'&&c.sev!=='ok'&&c.sev!=='down').length:null;
 const house={faults,anomalies,updated,healthy:Number.isInteger(h.healthy)?h.healthy:null,total:Number.isInteger(h.total)?h.total:null,rounds:Number.isInteger(h.rounds)?h.rounds:null,
   state:freshness!=='fresh'?freshness:updated==null?'unknown':(next!=null&&wall>next+lag)||(last!=null&&updated<last&&wall>last+lag)?'stale':'observed',incident:null};
 if(updated!=null&&updated<=wall+5000&&house.rounds!=null)events.push({id:'house:'+house.rounds+':'+updated,stream:'house:check',time:updated,key:'member4',kind:'check',label:'机房巡检完成',source:'sent.house.updated / rounds',result:house.healthy==null||house.total==null?'检查结果未知':house.healthy+'/'+house.total+' 项通过'});
 const i=h.incident;
 if(i&&typeof i==='object'){
   const opened=wfTime(i.opened),dispatched=wfTime(i.member4),closed=wfTime(i.closed);
   if(opened!=null&&opened<=wall+5000){
     const token='OBS-'+wfHash(String(i.name||'')+'|'+opened);
     house.incident={token,opened,dispatched:dispatched!=null&&dispatched>=opened&&dispatched<=wall+5000?dispatched:null,closed:closed!=null&&closed>=opened&&closed<=wall+5000?closed:null};
     by.member4.workflow='sentinel';
     const base={key:'member4',source:'sent.house.incident',token};
     events.push({...base,id:token+':opened:'+opened,stream:token+':opened',time:opened,kind:'opened',label:'哨兵登记异常',result:'异常记录已建立'});
     if(house.incident.dispatched!=null)events.push({...base,id:token+':dispatch:'+dispatched,stream:token+':dispatch',time:dispatched,kind:'dispatch',label:'检查节点调度已受理',result:'仅确认 alarm set 成功，未确认接收或执行'});
     if(house.incident.closed!=null)events.push({...base,id:token+':closed:'+closed,stream:token+':closed',time:closed,kind:'closed',label:'哨兵检查已恢复',result:'不能据此认定由检查节点修复'});
   }
 }
 const wire=wireWorkflow(d&&d.workflow,wall);events.push(...wire.events.filter(e=>wire.availability[e.wire]?.state==='available'));
 return{freshness,sampled,lag,members,house,wire,events:events.sort((a,b)=>a.time-b.time)};
}
function workflowGate(saved={}){
 let initialized=false;const marks={};for(const[k,v]of Object.entries(saved||{})){if(Number.isFinite(v))marks[k]=v}
 return{accept(model,wall){if(model.freshness!=='fresh')return[];const fresh=[];
   for(const e of model.events){const seen=marks[e.stream]||0;if(e.time<=seen)continue;marks[e.stream]=e.time;
     if(initialized&&wall-e.time>=0&&wall-e.time<=model.lag)fresh.push(e)}
   initialized=true;return fresh},snapshot(){return Object.fromEntries(Object.entries(marks).sort((a,b)=>b[1]-a[1]).slice(0,512))}};
}

// Visual event projection from validated, in-memory snapshots only.
let wfGate=workflowGate();const wfHistory=[],wfSignals=[];
let wfModel=null,wfLastSample=null,wfHidden=true,wfSelected=null;
const wfEscape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wfClock=t=>t==null?'未知':new Date(t).toLocaleString('zh-CN',{hour12:false});
const wfState={fresh:'采样新鲜',stale:'采样过期',unknown:'采样未知',overdue:'调度记录逾期',scheduled:'有下一次计划'};
function updateWorkflow(d){
 const wall=Date.now();wfModel=workflowModel(d,wall);document.body.dataset.sampleState=wfModel.freshness;document.body.dataset.sampleAge=String(Math.round((wall-wfModel.sampled)/1000));
 const arrived=wfGate.accept(wfModel,wall);
 for(const e of arrived){wfHistory.unshift(e);if(wfHistory.length>8)wfHistory.pop();
   if(!reducedMotion)queueWorkflowSignal(e);
 }
 while(wfSignals.length>12)wfSignals.shift();
 renderWorkflow();
}
function renderWorkflow(){}
// Each observed stage gets its own signal; arrival never invents a subsequent stage.

function queueWorkflowSignal(e,demo=false,delay=0){
 const now=performance.now(),same=wfSignals.find(x=>x.kind===e.kind&&x.key===e.key&&x.wire===e.wire&&x.demo===demo&&now-x.born<1500);
 if(same){same.count=(same.count||1)+1;return}
 wfSignals.push({...e,demo,count:1,born:now+delay,origin:delay?null:e.wire?workflowAnchor(e.wire):{x:spi.x,y:spi.y}});
 while(wfSignals.length>12)wfSignals.shift();
}
function workflowAnchor(source){const f=byKey.member7;return{x:f.x+(source==='alarm'?-.08:.08),y:f.y-.09}}
function wfCurve(a,b,t){const bend=Math.min(100,Math.hypot(b[0]-a[0],b[1]-a[1])*.22),c=[(a[0]+b[0])/2,(a[1]+b[1])/2-bend],u=1-t;return[u*u*a[0]+2*u*t*c[0]+t*t*b[0],u*u*a[1]+2*u*t*c[1]+t*t*b[1]]}
function wfTrail(a,b,t,color,alpha){
 cx.strokeStyle=color;cx.lineCap='round';
 for(let j=0;j<22;j++){const q=t-j*.012,r=q-.012;if(r<0||q>1)continue;const p=wfCurve(a,b,q),v=wfCurve(a,b,r);cx.globalAlpha=alpha*(1-j/22);cx.lineWidth=1.5+3*(1-j/22);cx.beginPath();cx.moveTo(...v);cx.lineTo(...p);cx.stroke()}
 if(t>=0&&t<=1){const p=wfCurve(a,b,t);cx.globalAlpha=alpha;cx.fillStyle='#efffff';cx.shadowColor=color;cx.shadowBlur=15;cx.beginPath();cx.arc(...p,3.4,0,Math.PI*2);cx.fill();cx.shadowBlur=0}
}
function drawPlanetInteraction(){
 if(reducedMotion||FAM.length<2)return;
 // Fast visual request/reply relay, independent of real task receipts.
 const selected=focusKey?byKey[focusKey]:null,cycle=4.8,flight=1.6,backAt=1.95;
 const flash=(f,age)=>{
  if(age<0||age>.55)return;
  const q=W2S(f.x,f.y),r=f.sr*f.ps*S*cam.z*1.30,v=age/.55,alpha=Math.sin(Math.PI*v);
  cx.strokeStyle=f.color;cx.lineWidth=1.6;cx.globalAlpha=alpha*.85;cx.shadowColor=f.color;cx.shadowBlur=9;
  for(let k=0;k<3;k++){const a=now*.7+k*Math.PI*2/3;cx.beginPath();cx.ellipse(...q,r*(1+v*.1),r*.69*(1+v*.1),-.3,a,a+.7);cx.stroke();}
  cx.shadowBlur=0;
 };
 cx.save();cx.globalCompositeOperation='lighter';cx.lineCap='round';
 for(let lane=0;lane<3;lane++){
  const clock=now+lane*1.48,round=Math.floor(clock/cycle),age=clock-round*cycle;
  const others=selected?FAM.filter(f=>f!==selected):null;
  const a=selected||FAM[(round+lane*2)%FAM.length],b=selected?others[(round+lane)%others.length]:FAM[(round+lane*2+1+round%2)%FAM.length];
  if(!a||!b||a===b)continue;
  const A=W2S(a.x,a.y),B=W2S(b.x,b.y),C=[(A[0]+B[0])/2,Math.min(A[1],B[1])-24-lane*7];
  const fade=Math.min(1,age/.12,Math.max(0,(4.2-age)/.4));
  if(fade<=0)continue;
  cx.strokeStyle=a.color;cx.globalAlpha=fade*(selected?.20:.14);cx.lineWidth=.9;
  cx.beginPath();cx.moveTo(...A);cx.quadraticCurveTo(...C,...B);cx.stroke();
  const point=t=>[(1-t)**2*A[0]+2*(1-t)*t*C[0]+t*t*B[0],(1-t)**2*A[1]+2*(1-t)*t*C[1]+t*t*B[1]];
  const outbound=age<=flight,returning=age>=backAt&&age<=backAt+flight;
  if(outbound||returning){
   const v=outbound?age/flight:1-(age-backAt)/flight,col=outbound?a.color:b.color;
   for(let j=0;j<12;j++){
    const t=v+(outbound?-1:1)*j*.009;if(t<0||t>1)continue;const q=point(t);
    cx.globalAlpha=fade*(1-j/12)*.95;cx.fillStyle=j<2?'#e2faff':col;cx.shadowColor=col;cx.shadowBlur=j<2?7:0;
    cx.beginPath();cx.arc(...q,j===0?2.2:1.1,0,Math.PI*2);cx.fill();
   }cx.shadowBlur=0;
  }
  flash(b,age-flight);flash(a,age-backAt-flight);
 }
 cx.restore();
}

function drawWorkflow(){
 if(!wfModel)return;const wall=performance.now();
 cx.save();cx.font='10px '+SANS;cx.textAlign='center';
 for(let n=wfSignals.length-1;n>=0;n--){
   const e=wfSignals[n],age=(wall-e.born)/1000;
   if(age<0)continue;if(age>6||reducedMotion){wfSignals.splice(n,1);continue}
   const sb=sky.getBoundingClientRect();
   const f=byKey[e.key],core=W2S(f.x,f.y),sentinel=sentinelScreen?[sentinelScreen.x-sb.left,sentinelScreen.y-sb.top]:W2S(byKey.member4.x,byKey.member4.y),fade=Math.min(1,age*4,Math.max(0,(6-age)/1.2));
   const color=e.kind==='opened'?'#ffb15e':e.kind==='closed'?'#7be0a8':f.color;
   cx.strokeStyle=color;cx.fillStyle=color;cx.lineWidth=1.5;cx.globalAlpha=fade;
   let anchor=core,label='';
   if(e.wire){cx.globalAlpha=fade*.65;cx.fillText(WF_WIRE_SOURCES[e.wire],sentinel[0],sentinel[1]-12);cx.beginPath();cx.arc(...sentinel,3,0,7);cx.stroke();}
   if(e.kind==='dispatch'||e.kind==='handoff'||e.kind==='verified'){
     // Dispatch stops before the core: only a separate receive receipt can light it.
     const dx=core[0]-sentinel[0],dy=core[1]-sentinel[1],len=Math.hypot(dx,dy)||1;
     const edge=[core[0]-dx/len*24,core[1]-dy/len*24];
     const a=e.kind==='verified'?core:sentinel,b=e.kind==='verified'?sentinel:edge;
     const t=age/4.2;
     cx.globalAlpha=fade*.16;cx.beginPath();cx.moveTo(...a);for(let j=1;j<=30;j++)cx.lineTo(...wfCurve(a,b,j/30));cx.stroke();
     for(let j=0;j<3;j++)wfTrail(a,b,t-j*.09,color,fade*(1-j*.2));
     anchor=wfCurve(a,b,Math.min(.7,Math.max(.3,t)));label=e.kind==='verified'?'验收回传':e.kind==='dispatch'?'调度 → '+byKey.member4.name:e.label;
   }else if(e.kind==='working'){
     for(let j=0;j<3;j++){const t=age*1.3+j*Math.PI*2/3;cx.globalAlpha=fade;cx.beginPath();cx.ellipse(...core,38,17,-.35,t,t+.9);cx.stroke();const x=core[0]+38*Math.cos(t),y=core[1]+17*Math.sin(t);cx.beginPath();cx.arc(x,y,2,0,7);cx.fill()}label=e.label||'处理开始';
   }else{
     const local=['check','opened','closed'].includes(e.kind);anchor=local?sentinel:core;
     const life=Math.min(1,age/2.2),r=local?15:(f.rp||26)*1.3;
     const shimmer=Math.max(0,1-life)*Math.min(1,age*6);
     // Brief broken trails and tiny glints travel along the existing dust, never a full ring.
     cx.save();cx.translate(...anchor);cx.rotate(-.35);cx.lineWidth=.85;cx.lineCap='round';
     for(let j=0;j<12;j++){
      const a=j*2.399+life*.8,rx=r*(1+(j%3)*.035),ry=rx*.65;
      cx.globalAlpha=shimmer*(.22+(j%4)*.09);cx.beginPath();cx.ellipse(0,0,rx,ry,0,a,a+.06);cx.stroke();
      if(j%3===0){cx.globalAlpha=shimmer*.65;cx.beginPath();cx.arc(Math.cos(a)*rx,Math.sin(a)*ry,.9,0,Math.PI*2);cx.fill();}
     }cx.restore();
     label=({timer:'调度触发',check:'巡检完成',opened:'异常登记',closed:'哨兵检查恢复',received:'收到回执',heartbeat:'心跳回执',invocation:'闹钟调用中',finished:'调用 / 状态完成',review:'待验收',blocked:'任务受阻',failed:'任务失败',cancelled:'已撤销'})[e.kind]||'';
   }
   if(e.wire&&e.label&&e.kind!=='verified')label=e.label;
   cx.globalAlpha=fade;cx.shadowBlur=0;cx.fillStyle=color;
   const caption=label+(e.count>1?' ×'+e.count:'');
   let lx=anchor[0],ly=anchor[1]-(e.kind==='verified'?42:24);
   if(e.kind==='heartbeat'&&e.key==='member1'){lx+=100;ly-=28}
   if(['heartbeat','verified','finished'].includes(e.kind)){
     const cp=roleScreen(crab.x,crab.y),half=cx.measureText(caption).width/2;
     if(Math.abs(lx-cp[0])<half+46&&Math.abs(ly-cp[1])<62)lx=cp[0]+(lx<cp[0]?-1:1)*(half+58);
   }
   cx.fillText(caption,lx,ly);
 }
 cx.restore();
}
// Local synthesized sound only. Never auto-unlock or download audio.
const roomAudio={ctx:null,master:null,on:false,last:new Map(),voices:new Set(),mode:null,delivered:null,
 tone(freq,end,duration,delay=0,level=.3,type='sine'){
  const ctx=this.ctx;if(!this.on||!ctx||ctx.state!=='running'||document.hidden)return;
  const osc=ctx.createOscillator(),amp=ctx.createGain(),at=ctx.currentTime+delay;
  osc.type=type;osc.frequency.setValueAtTime(freq,at);osc.frequency.exponentialRampToValueAtTime(Math.max(40,end),at+duration);
  amp.gain.setValueAtTime(0,at);amp.gain.linearRampToValueAtTime(level,at+.008);amp.gain.exponentialRampToValueAtTime(.0001,at+duration);
  osc.connect(amp);amp.connect(this.master);this.voices.add(osc);
  osc.onended=()=>{this.voices.delete(osc);osc.disconnect();amp.disconnect();};osc.start(at);osc.stop(at+duration+.02);
 },
 play(kind){
  if(!this.on||document.hidden||this.ctx?.state!=='running')return;
  const stamp=performance.now(),gap=kind==='scan'?1400:kind==='step'?330:kind==='click'?90:500;
  if(stamp-(this.last.get(kind)??-Infinity)<gap)return;this.last.set(kind,stamp);
  if(kind==='scan'){this.tone(1050,1450,.07,0,.18);this.tone(1450,1050,.06,.11,.12);}
  else if(kind==='alert'){this.tone(500,850,.12,0,.32);this.tone(650,1050,.14,.18,.28);}
  else if(kind==='success'){[660,880,1100].forEach((n,i)=>this.tone(n,n,.16,i*.1,.25));}
  else if(kind==='step')this.tone(180,65,.045,0,.20);
  else if(kind==='scene'){this.tone(220,1100,.3,0,.30,'triangle');this.tone(880,1320,.16,.16,.24);}
  else this.tone(820,540,.055,0,.16);
 },
 stop(){for(const voice of this.voices){try{voice.stop();}catch(e){}}this.voices.clear();},
 async toggle(){
  const button=$('soundToggle');if(button.disabled)return;button.disabled=true;
  try{
   if(this.on){this.on=false;this.stop();if(this.ctx)await this.ctx.suspend();}
   else{
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('audio unsupported');
    if(!this.ctx){this.ctx=new Audio();this.master=this.ctx.createGain();this.master.gain.value=.30;this.master.connect(this.ctx.destination);}
    await this.ctx.resume();if(this.ctx.state!=='running')throw new Error('audio blocked');if(document.hidden){await this.ctx.suspend();throw new Error('page hidden');}
    this.on=true;this.mode=null;this.delivered=null;this.last.clear();this.play('success');
   }
   button.textContent=this.on?'声音 · 开':'声音 · 关';button.setAttribute('aria-pressed',String(this.on));
  }catch(e){this.on=false;this.stop();button.textContent='声音不可用';button.setAttribute('aria-pressed','false');}
  finally{button.disabled=false;}
 },
 tick(st,phaseAge,moving){
  if(!this.on)return;
  if(st.mode!==this.mode){this.mode=st.mode;if(st.mode==='startled')this.play('alert');}
  if(st.mode==='scan')this.play('scan');
  if(moving&&st.mode==='rush')this.play('step');
  if(st.mode==='exchange'&&phaseAge>=4.5&&st.alert&&this.delivered!==st.alert.key){this.delivered=st.alert.key;this.play('success');}
 }
};
$('soundToggle').onclick=e=>{if(e.isTrusted)roomAudio.toggle();};
document.addEventListener('visibilitychange',()=>{if(document.hidden){roomAudio.stop();roomAudio.on=false;const b=$('soundToggle');b.textContent='声音 · 关';b.setAttribute('aria-pressed','false');if(roomAudio.ctx)roomAudio.ctx.suspend().catch(()=>{});}});
document.addEventListener('click',e=>{if(e.target.closest?.('button')&&e.target.id!=='soundToggle')roomAudio.play('click');});

$('sentinelDemo').onclick=()=>{
 const st=sentinelState,button=$('sentinelDemo');
 if(reducedMotion){button.textContent='已开启减少动态';setTimeout(()=>{button.textContent='全景演示';},1800);return;}
 sceneDemoStart=now;sceneDemoBeat=-1;roomAudio.play('scene');
 st.demoActive=true;st.pending={key:'visual-demo:'+Date.now(),demo:true,routine:false};st.alert=null;
 st.site='log';st.dock=null;st.mode='travel';st.since=performance.now();st.from={...(sentinelScreen||{x:innerWidth*.2,y:innerHeight*.3})};st.duration=1.6;
 button.textContent='演示播放中';button.disabled=true;
};
$('orbitSpeed').onclick=()=>{orbitSpeed=orbitSpeed===6?1:orbitSpeed===1?3:6;$('orbitSpeed').textContent='巡游 ×'+orbitSpeed;};
setInterval(()=>{if(LIVE&&!document.hidden)updateWorkflow(LIVE)},5000);

// ───────────── 开机 ─────────────
resize();
pull().then(()=>{addLog("wake","rover 上班了","#e8774d");addLog("ping","机房哨兵 上岗","#ff5f6d");addLog("x","信标哨兵 升空","#dfe7ee");
  const lu=LIVE.activity.last_input?new Date(LIVE.activity.last_input):null;
  if(lu&&(Date.now()-lu)<15*60000)addLog("her","模拟活动信号到达","#ff7aa8");
  goTo(pickNext());spiNext();setFocusTitle(null);requestAnimationFrame(frame)});
setInterval(pull,CONFIG.tickMs);



(()=>{
 const panels=[...document.querySelectorAll('.hud>.panel')];
 const modal=document.createElement('dialog');modal.id='instrumentDialog';modal.setAttribute('aria-labelledby','instrumentTitle');
 const header=node('header'),title=node('h2'),close=node('button','关闭 ×');title.id='instrumentTitle';close.type='button';close.id='instrumentClose';header.append(title,close);const canvas=node('canvas');canvas.id='instrumentMirror';const detail=node('div');detail.id='instrumentText';const note=node('p','放大镜像 · 仅查看本地数据');note.id='instrumentNote';modal.append(header,canvas,detail,note);
 document.body.append(modal);const mirror=modal.querySelector('canvas'),text=modal.querySelector('#instrumentText'),ctx=mirror.getContext('2d');let source=null,timer=null;
 function refresh(){if(!source||!modal.open)return;const canvas=source.querySelector('canvas.pc');
  if(canvas){mirror.hidden=false;mirror.style.display='block';text.hidden=true;if(mirror.width!==canvas.width||mirror.height!==canvas.height){mirror.width=canvas.width;mirror.height=canvas.height;}ctx.clearRect(0,0,mirror.width,mirror.height);if(canvas.width&&canvas.height)ctx.drawImage(canvas,0,0);}
  else{mirror.style.display='none';text.hidden=false;const original=source.querySelector('.bars,.code');if(original){const copy=original.cloneNode(true);copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));text.replaceChildren(copy);}}
 }
 function open(panel){if(panel.querySelector('#log')){document.querySelector('#log').click();return;}source=panel;modal.querySelector('h2').textContent=panel.querySelector('h3>span').textContent;modal.showModal();refresh();clearInterval(timer);timer=setInterval(refresh,100);}
 modal.querySelector('button').onclick=()=>modal.close();modal.addEventListener('close',()=>{clearInterval(timer);timer=null;source=null;});
 modal.addEventListener('click',e=>{if(e.target!==modal)return;const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();});
 panels.forEach((panel,i)=>{const runner=document.createElement('i');runner.className='edge-runner';runner.setAttribute('aria-hidden','true');panel.append(runner);
  const button=document.createElement('button');button.type='button';button.className='panel-zoom';button.textContent='⤢';button.setAttribute('aria-label','放大'+panel.querySelector('h3>span').textContent);button.title='放大仪表';panel.querySelector('h3').append(button);button.onclick=()=>open(panel);
  panel.querySelector('canvas.pc')?.addEventListener('click',()=>open(panel));
  panel.addEventListener('pointermove',e=>{const r=panel.getBoundingClientRect();panel.style.setProperty('--mx',(e.clientX-r.left)+'px');panel.style.setProperty('--my',(e.clientY-r.top)+'px');});
 });
 const previous=renderPanels;renderPanels=function(...args){const result=previous.apply(this,args);panels.forEach((p,i)=>setTimeout(()=>{p.classList.remove('sample-flash');void p.offsetWidth;p.classList.add('sample-flash');},i*65));return result;};
})();



(()=>{
 const A=roomAudio;let bus=null,noise=null,echo=null;
 const P=id=>document.getElementById(id)?.closest('.panel');
 const rnd=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.floor(Math.random()*a.length)];
 const PENTA=[523,587,659,784,880,1047,1175,1319,1568];
 function ensure(){
  const c=A.ctx;if(!c||bus)return!!bus;
  const comp=c.createDynamicsCompressor();comp.threshold.value=-18;comp.ratio.value=6;comp.attack.value=.003;comp.release.value=.2;
  bus=c.createGain();bus.gain.value=.55;bus.connect(comp);comp.connect(A.master);
  echo=c.createDelay(1);echo.delayTime.value=.23;const fb=c.createGain();fb.gain.value=.38;const wet=c.createGain();wet.gain.value=.5;
  echo.connect(fb);fb.connect(echo);echo.connect(wet);wet.connect(bus);
  noise=c.createBuffer(1,c.sampleRate,c.sampleRate);const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  return true;
 }
 function live(){return A.on&&A.ctx&&A.ctx.state==='running'&&!document.hidden&&ensure();}
 function env(g,at,lvl,dur,att=.005){g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(lvl,at+att);g.gain.exponentialRampToValueAtTime(.0001,at+dur);}
 function osc(f1,f2,dur,{d=0,lvl=.2,type='sine',wet=false,att}={}){
  const c=A.ctx,at=c.currentTime+d,o=c.createOscillator(),g=c.createGain();
  o.type=type;o.frequency.setValueAtTime(f1,at);if(f2!==f1)o.frequency.exponentialRampToValueAtTime(Math.max(30,f2),at+dur);
  env(g,at,lvl,dur,att);o.connect(g);g.connect(bus);if(wet)g.connect(echo);
  o.start(at);o.stop(at+dur+.03);A.voices.add(o);o.onended=()=>{A.voices.delete(o);o.disconnect();g.disconnect();};
 }
 function hiss(dur,{d=0,lvl=.15,f=2000,f2=f,q=4,type='bandpass'}={}){
  const c=A.ctx,at=c.currentTime+d,s=c.createBufferSource(),fl=c.createBiquadFilter(),g=c.createGain();
  s.buffer=noise;s.loop=true;fl.type=type;fl.Q.value=q;fl.frequency.setValueAtTime(f,at);fl.frequency.exponentialRampToValueAtTime(Math.max(60,f2),at+dur);
  env(g,at,lvl,dur,.004);s.connect(fl);fl.connect(g);g.connect(bus);
  s.start(at,Math.random()*.8);s.stop(at+dur+.03);A.voices.add(s);s.onended=()=>{A.voices.delete(s);s.disconnect();fl.disconnect();g.disconnect();};
 }
 function flash(p,ms=110){if(!p)return;p.classList.add('chirp');setTimeout(()=>p.classList.remove('chirp'),ms);}
 const cpu=()=>{const h=LIVE?.host;if(!h)return .2;const v=+h.cpu;return Math.min(1,Math.max(0,(v>1?v/100:v)||0));};
 let lastLog=null;
 // 每块屏幕一种嗓子：next=下一次开口时间，gap=间隔，say=怎么出声
 const voices=[
  {id:'pHouse',gap:()=>rnd(1.8,2.8),say(){osc(1320,1300,.9,{lvl:.16,wet:true});}},                         // 机房哨兵：声呐
  {id:'log',gap:()=>rnd(.5,1.5),say(){const n=3+Math.floor(Math.random()*7);for(let i=0;i<n;i++)hiss(.018,{d:i*rnd(.045,.075),lvl:.22,f:rnd(2500,4200),q:1.5,type:'highpass'});}}, // 巡逻日志：打字机
  {id:'pWave',gap:()=>rnd(.9,2),say(){const b=rnd(600,1100);[0,1,2].forEach(i=>osc(b*(1+i*.25),b*(1+i*.25)*rnd(.8,1.3),.09,{d:i*.1,lvl:.09,type:'sawtooth'}));}}, // 信号：调制解调器
  {id:'bars',gap:()=>rnd(1.2,2.2),say(){const k=1+Math.floor(Math.random()*3);for(let i=0;i<k;i++){const f=pick(PENTA)/2;osc(f,f,.5,{d:i*.14,lvl:.2,type:'triangle',att:.002});}}}, // 节点资源：木琴
  {id:'pX',gap:()=>rnd(2,4),say(){hiss(rnd(.25,.6),{lvl:.12,f:rnd(400,900),f2:rnd(2500,5000),q:6});if(Math.random()<.5)osc(1800,2400,.06,{d:.3,lvl:.08,type:'square'});}}, // 信标哨兵：无线电杂音
  {id:'pRadar',gap:()=>1.3-cpu()*.95,say(){osc(110,48,.18,{lvl:.4});osc(95,45,.16,{d:.16,lvl:.25});}},          // CPU：心跳，负载越高跳越快
  {id:'pHeat',gap:()=>rnd(.22,.7),say(){osc(rnd(2200,3600),rnd(2000,3800),.12,{lvl:.07,wet:Math.random()<.4});}}, // 节律热格：玻璃珠
  {id:'code',gap:()=>rnd(1,2.6),say(){const s=[0,4,7,12,7,4],o=pick([392,440,523]),n=2+Math.floor(Math.random()*4);for(let i=0;i<n;i++){const f=o*Math.pow(2,pick(s)/12);osc(f,f,.07,{d:i*.085,lvl:.08,type:'square'});}}} // Rover：8-bit 小螃蟹
 ];
 let t0=0;
 setInterval(()=>{
  if(!live()){t0=0;return;}
  const t=A.ctx.currentTime;if(!t0){t0=t;voices.forEach(v=>v.next=t+rnd(0,1.2));lastLog=logRevision;}
  for(const v of voices){if(t>=v.next){try{v.say();}catch(e){}flash(P(v.id));v.next=t+Math.max(.2,v.gap());}}
  if(logRevision!==lastLog){lastLog=logRevision;const v=voices[1];try{v.say();}catch(e){}flash(P(v.id),160);}
 },40);
})();
