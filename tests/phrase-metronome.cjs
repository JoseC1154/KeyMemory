// Deterministic engine clock/callback tests, not audible or physical MIDI verification.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','phrase.js'),'utf8');
function setup(storage){
 let time=0,id=0,clickSilences=0;const timers=new Map(),beats=[],sounds=[];
 storage ||= {value:null,getItem(){return this.value;},setItem(k,v){this.value=v;},removeItem(){this.value=null;}};
 const context={window:{},Date,console};vm.createContext(context);vm.runInContext(code,context);
 const engine=context.window.KeyMemoryPhrase.create({storage,now:()=>time,setTimer:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},clearTimer:id=>timers.delete(id),onBeat:b=>beats.push({...b,calledAt:time}),onSound:(...args)=>sounds.push(args),onMetronomeSilence:()=>clickSilences++});
 function advance(ms){const end=time+ms;for(let count=0;;count++){assert(count<100000,'bounded scheduling');const t=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!t)break;timers.delete(t[0]);time=Math.max(time,t[1].at);t[1].fn();}time=end;}
 return {engine,beats,sounds,timers,storage,advance,jump:ms=>time+=ms,now:()=>time,clickSilences:()=>clickSilences,on:(note=60)=>engine.input({kind:'on',note,velocity:87,channel:2,time}),off:(note=60)=>engine.input({kind:'off',note,channel:2,time})};
}
const plain=v=>JSON.parse(JSON.stringify(v));
function phrase(h){h.engine.record();h.advance(1500);h.on();h.advance(2100);h.off();h.engine.stop();}
// Three count-in beats followed by an anchored uninterrupted recording grid.
let h=setup();h.engine.setOptions({sourceBpm:100});h.engine.record();h.advance(1800);assert.equal(h.engine.snapshot().state,'recording');h.on();h.advance(4200);h.off();
assert.deepEqual(h.beats.filter(b=>b.countIn).map(b=>b.at),[0,600,1200]);
assert.deepEqual(h.beats.filter(b=>!b.countIn).map(b=>b.at),[1800,2400,3000,3600,4200,4800,5400,6000]);
assert(h.beats.some(b=>b.at>b.calledAt),'beats use lookahead absolute times');
h.engine.stop();assert.deepEqual(plain(h.engine.snapshot().notes),[{note:60,velocity:87,channel:2,start:0,duration:4200}]);
// Playback uses playback BPM, preserves recorded note duration scaling and raw storage.
const raw=plain(h.engine.snapshot().notes);h.engine.setOptions({playBpm:200});h.beats.length=0;h.engine.play();const origin=h.now();h.advance(3000);
assert.deepEqual(h.beats.filter(b=>b.countIn).map(b=>b.at-origin),[0,300,600]);
assert.deepEqual(h.beats.filter(b=>!b.countIn).map(b=>b.at-origin),[900,1200,1500,1800,2100,2400,2700]);
assert.equal(h.sounds[0][2],2100);assert.deepEqual(plain(h.engine.snapshot().notes),raw);
// Live toggles do not stop transport, alter notes/controllers or restart the grid.
h=setup();h.engine.record();h.advance(1500);h.on();h.advance(200);assert(h.engine.setMetronome(false));assert.equal(h.clickSilences(),1);assert.equal(h.engine.snapshot().state,'recording');const count=h.beats.length;h.advance(1300);assert.equal(h.beats.length,count);assert(h.engine.setOptions({metronome:true}));h.advance(1000);assert.equal(h.engine.snapshot().state,'recording');assert(h.beats.length>count);assert(h.beats.slice(count).every(b=>(b.at-1500)%500===0));h.off();h.engine.stop();assert.equal(h.engine.snapshot().notes[0].duration,2500);
// Muted metronome still keeps all count-in and recording limits; note playback is unaffected.
h=setup();h.engine.setMetronome(false);h.engine.record();h.advance(1499);assert.equal(h.engine.snapshot().state,'record-countin');h.advance(1);h.on();h.advance(119999);assert.equal(h.engine.snapshot().state,'recording');h.advance(1);assert.equal(h.engine.snapshot().state,'idle');assert.equal(h.engine.snapshot().duration,120000);assert.equal(h.beats.length,0);assert.equal(h.timers.size,0);h.engine.play();h.advance(1500);assert.equal(h.engine.snapshot().state,'playing');assert.equal(h.sounds.length,1);assert.equal(h.beats.length,0);h.engine.stop();
// Option survives saves; legacy options lacking the new field load enabled.
assert.equal(setup(h.storage).engine.snapshot().options.metronome,false);const data=JSON.parse(h.storage.value);delete data.options.metronome;h.storage.value=JSON.stringify(data);assert.equal(setup(h.storage).engine.snapshot().options.metronome,true);
// Practice retains four count-in beats and keeps clicking while awaiting an answer.
h=setup();phrase(h);h.beats.length=0;h.engine.practice();const practiceOrigin=h.now();h.advance(4000);assert.equal(h.engine.snapshot().state,'practice');assert.deepEqual(h.beats.filter(b=>b.countIn).map(b=>b.at-practiceOrigin),[0,500,1000,1500]);assert.deepEqual(h.beats.filter(b=>!b.countIn).map(b=>b.at-practiceOrigin),[2000,2500,3000,3500,4000]);h.on();assert.equal(h.engine.snapshot().state,'complete');assert.equal(h.timers.size,0);const finished=h.beats.length;h.advance(5000);assert.equal(h.beats.length,finished);
// Waiting for held keys has no continuing clicks; releasing restarts four beats.
h=setup();phrase(h);h.engine.practice();h.advance(500);h.on(65);h.advance(1500);assert.equal(h.engine.snapshot().state,'wait-release');const waiting=h.beats.length;h.advance(3000);assert.equal(h.beats.length,waiting);h.off(65);assert.equal(h.engine.snapshot().state,'countin');h.advance(2000);assert.equal(h.engine.snapshot().state,'practice');h.engine.stop();assert.equal(h.timers.size,0);
// Late pumps skip stale clicks instead of bursting them; Stop cancels every pump.
h=setup();h.engine.record();h.jump(4200);h.advance(0);assert(h.beats.slice(1).every(b=>b.at>=4175));h.engine.stop();assert.equal(h.timers.size,0);const stopped=h.beats.length;h.advance(5000);assert.equal(h.beats.length,stopped);assert.equal(h.engine.setMetronome('false'),false);
console.log('PASS: Phrase independent metronome option; live toggle/click-only cancellation callback; continuing recording/playback/practice BPM grid; 3/4 count-ins; 120s after count; raw MIDI unchanged; persistence/legacy defaults; lookahead/stalls/stop cancellation. Engine callbacks only, not audible QA.');
