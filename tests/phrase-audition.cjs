'use strict';
const assert = require('node:assert/strict');
const {create} = require('../phrase-audition.js');
const vm=require('node:vm'),fs=require('node:fs');
const browser={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../phrase-audition.js'),'utf8'),browser);assert.equal(typeof browser.window.KeyMemoryPhraseAudition.create,'function');
const near = (a,b) => assert(Math.abs(a-b)<1e-9, `${a} != ${b}`);
class Envelope {
 constructor(hold) { this.value=1; this.events=[]; if(!hold)this.cancelAndHoldAtTime=undefined; }
 add(kind,value,time){this.events.push({kind,value,time});this.events.sort((a,b)=>a.time-b.time);}
 at(time){let prior={time:0,value:this.value};for(const e of this.events){if(time<e.time)return e.kind==='linear'?prior.value+(e.value-prior.value)*(time-prior.time)/(e.time-prior.time):prior.value;prior=e;}return prior.value;}
 setValueAtTime(v,t){this.add('set',v,t);} linearRampToValueAtTime(v,t){this.add('linear',v,t);}
 cancelScheduledValues(t){this.events=this.events.filter(e=>e.time<t);}
 cancelAndHoldAtTime(t){const v=this.at(t),next=this.events.find(e=>e.time>=t);this.cancelScheduledValues(t);this.add(next?.kind==='linear'?'linear':'set',v,t);}
}
function context(hold=true){return {currentTime:1,state:'running',destination:{},oscillators:[],gains:[],
 createGain(){const g={gain:new Envelope(hold),connect(target){this.target=target;},disconnect(){this.disconnected=true;}};this.gains.push(g);return g;},
 createOscillator(){const o={frequency:{value:0},connect(g){this.gain=g;},disconnect(){this.disconnected=true;},start(t){this.startAt=t;},stop(t){this.stopAt=t;}};this.oscillators.push(o);return o;},
 advance(t){this.currentTime=t;for(const o of this.oscillators)if(!o.ended&&o.stopAt<=t){o.ended=true;o.onended?.();}}
};}
const note=(extra={})=>({note:69,velocity:127,duration:100,...extra});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
(async()=>{
 for(const hold of [false,true])for(const t of [1.003,1.006,1.05,1.1,1.112]){
  const c=context(hold),a=create({getContext:async()=>c});assert.equal(await a.play([note()]),1);
  const o=c.oscillators[0],p=o.gain.gain;const before=p.at(t),history=p.at(t-.001);c.currentTime=t;a.stop();
  near(p.at(t),before);near(p.at(t-.001),history);const end=Math.min(1.124,t+.018);near(p.at((t+end)/2),before/2);near(p.at(end),0);near(o.stopAt,end);
  c.currentTime=t+.001;a.stop();near(o.stopAt,end);c.advance(end);assert(o.disconnected);assert(o.gain.disconnected);
 }
 for(const hold of [false,true]){
  const c=context(hold),a=create({getContext:async()=>c});await a.play([note({duration:0})]);const o=c.oscillators[0];near(o.stopAt,1.03);near(o.gain.gain.at(1.006),.12);near(o.gain.gain.at(1.018),.06);c.currentTime=1.012;a.stop();near(o.gain.gain.at(1.012),.09);
  await a.play([note({offset:200})]);const future=c.oscillators.at(-1);a.stop();near(future.stopAt,c.currentTime);assert(future.disconnected);
 }
 {
  const c=context(),a=create({getContext:async()=>c});assert.equal(await a.play(Array.from({length:100},(_,i)=>note({note:i%128,duration:10000}))),64);
  near(c.gains.reduce((s,g)=>s+g.gain.at(1.01),0),.3);for(const o of c.oscillators){assert(o.stopAt<=1.6+1e-9);assert.equal(o.gain.target,c.destination);}
  c.currentTime=1.01;assert.equal(await a.play([note()]),0);c.advance(1.03);assert.equal(await a.play([note({offset:360}),note({offset:800}),note({duration:-1}),note({note:128})]),1);
  near(c.oscillators.at(-1).frequency.value,440);
 }
 {
  const c=context(),d1=deferred(),d2=deferred();let calls=0;const a=create({getContext:()=>++calls===1?d1.promise:d2.promise});const p1=a.play([note()]),p2=a.play([note({note:60})]);d2.resolve(c);assert.equal(await p2,1);d1.resolve(c);assert.equal(await p1,0);assert.equal(c.oscillators.length,1);
 }
 {
  const c=context(),d=deferred();c.state='suspended';c.resume=()=>d.promise;const a=create({getContext:async()=>c});const pending=a.play([note()]);await Promise.resolve();a.stop();c.state='running';d.resolve();assert.equal(await pending,0);assert.equal(c.oscillators.length,0);
 }
 {
  const c=context(),d=deferred();let allow=true;c.state='suspended';c.resume=()=>d.promise;const a=create({getContext:async()=>c,canPlay:()=>allow});const pending=a.play([note()]);await Promise.resolve();allow=false;c.state='running';d.resolve();assert.equal(await pending,0);assert.equal(c.oscillators.length,0);
 }
 {
  const c=context(),d=deferred();let allow=true;const a=create({getContext:()=>d.promise,canPlay:()=>allow});const p=a.play([note()]);allow=false;d.resolve(c);assert.equal(await p,0);assert.equal(await a.play([note()]),0);
  const b=create({getContext:async()=>c});await b.play([note()]);c.currentTime=1.003;const gain=c.gains.at(-1).gain;await b.play([]);near(gain.at(1.021),0);
 }
 {
  const c=context(),a=create({getContext:async()=>c});for(let i=0;i<500;i++){c.advance(1+i*.001);await a.play([note()]);const active=c.oscillators.filter(o=>!o.disconnected);assert(active.length<=64);assert(active.reduce((s,o)=>s+o.gain.gain.at(c.currentTime+.006),0)<=.3+1e-9);}
  a.stop();c.advance(3);assert(c.oscillators.every(o=>o.disconnected&&Number.isFinite(o.stopAt)));
 }
 assert.equal(await create({getContext:async()=>{throw Error('unavailable');}}).play([note()]),0);
 assert.equal(await create({getContext:async()=>null}).play([note()]),0);
 console.log('PASS phrase audition: native/fallback envelope continuity, zero duration, polyphony and gain bounds, offsets, latest async wins, resume cancellation, mute, repeated stop and bounded lifetime.');
})().catch(error=>{console.error(error);process.exitCode=1;});
