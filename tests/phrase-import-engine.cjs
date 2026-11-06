// Deterministic import/transport/storage tests, not model accuracy or audible MIDI QA.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','phrase.js'),'utf8');
const KEY='keymemory.phrase.v1',plain=value=>JSON.parse(JSON.stringify(value));
const note=(patch={})=>({note:60,velocity:91,channel:0,start:0,duration:200,...patch});
const phrase=(patch={})=>({notes:[note()],duration:1000,...patch});
const baseline=()=>Array.from({length:16},(_,channel)=>[7,11,64].map(controller=>({channel,controller,value:controller===7?100:controller===11?127:0}))).flat();
function memory(value=null){return{value,writes:0,removes:0,getItem(){return this.value;},setItem(key,text){assert.equal(key,KEY);this.writes++;this.value=text;},removeItem(){this.removes++;this.value=null;}};}
function setup(storage=memory()){
 let time=0,id=0,silences=0;const timers=new Map(),sounds=[],controls=[],beats=[],changes=[],wrongs=[];
 const context={window:{},Date,console};vm.createContext(context);vm.runInContext(code,context);
 const engine=context.window.KeyMemoryPhrase.create({storage,viewProjection:true,now:()=>time,
  setTimer:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},clearTimer:id=>timers.delete(id),
  onChange:s=>changes.push(plain(s)),onWrong:(...args)=>wrongs.push(args),onSilence:()=>silences++,
  onSound:(note,velocity,duration,at,meta)=>sounds.push({note,velocity,duration,at,meta:plain(meta),calledAt:time}),
  onControl:c=>controls.push({...c,calledAt:time}),onBeat:b=>beats.push({...b,calledAt:time})});
 function advance(ms){const end=time+ms;for(let i=0;;i++){
  assert(i<100000,'bounded timer execution');
  const entry=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
  if(!entry)break;const [id,t]=entry;timers.delete(id);time=Math.max(time,t.at);t.fn();
 }time=end;}
 return{engine,storage,timers,sounds,controls,beats,changes,wrongs,advance,jump:ms=>time+=ms,
  s:()=>plain(engine.snapshot()),get time(){return time;},get silences(){return silences;},
  on:(note=60,channel=0,velocity=100)=>engine.input({kind:'on',note,channel,velocity,time}),
  off:(note=60,channel=0)=>engine.input({kind:'off',note,channel,time}),
  cc:(controller,value,channel=0)=>engine.input({kind:'control',controller,value,channel,time})};
}
function preserved(h){const {error,...snapshot}=h.s();return{snapshot,stored:h.storage?.value,writes:h.storage?.writes,removes:h.storage?.removes,silences:h.silences,timers:[...h.timers],counts:[h.sounds.length,h.controls.length,h.beats.length]};}
function rejectsWithoutMutation(h,payload,label){
 const before=preserved(h),changes=h.changes.length;
 assert.equal(h.engine.importPhrase(payload),false,label);
 assert.deepEqual(preserved(h),before,`${label}: previous phrase, transport, audio and storage stay intact`);
 assert.equal(h.changes.length,changes+1,`${label}: report one error`);assert(h.s().error);
}
function assertNeutral(snapshot){assert.deepEqual(snapshot.controllers,[]);assert.deepEqual(snapshot.initialControllers,baseline());}

// Empty state is also atomic on rejection. Undefined, malformed and sparse inputs never throw.
let h=setup();assert.equal(h.s().origin,'midi');rejectsWithoutMutation(h,undefined,'missing payload');rejectsWithoutMutation(h,{},'missing fields');
assert.equal(h.storage.writes,0);assert.equal(h.s().notes.length,0);

// Complete validation precedes replacement, even when a late note or getter fails.
h=setup();assert(h.engine.importPhrase(phrase()));
assert(h.engine.setOptions({metronome:false,sourceBpm:90,playBpm:180,transpose:2,rhythm:true,tolerance:333,sectionStart:25,sectionEnd:900}));
const bad=[null,true,1,'phrase',[],{},phrase({notes:null}),phrase({notes:{}}),phrase({notes:[]}),phrase({notes:new Array(2)}),
 phrase({notes:[note(),null]}),phrase({notes:[note(),undefined]}),phrase({notes:[[]]}),phrase({notes:[42]}),
 phrase({notes:Array.from({length:10001},()=>note())})];
for(const value of [undefined,null,NaN,Infinity,-Infinity,-1,0,120000.001,'1000',true])bad.push(phrase({duration:value}));
for(const value of [null,NaN,Infinity,-Infinity,29.999,300.001,'120',true])bad.push(phrase({sourceBpm:value}));
for(const [field,values] of Object.entries({
 note:[undefined,null,-1,128,60.5,NaN,Infinity,-Infinity,'60',true],
 velocity:[undefined,null,0,-1,128,1.5,NaN,Infinity,-Infinity,'91',true],
 channel:[undefined,null,-1,16,.5,NaN,Infinity,-Infinity,'0',true],
 start:[undefined,null,-.001,NaN,Infinity,-Infinity,'0',true,1000,1001],
 duration:[undefined,null,0,-.001,NaN,Infinity,-Infinity,'200',true,1000.001]
}))for(const value of values)bad.push(phrase({notes:[note(),note({[field]:value})]}));
bad.push(phrase({notes:[note({start:900,duration:100.000002})]}));
bad.push(phrase({notes:[note({start:1000,duration:Number.MIN_VALUE})]}));
bad.push(Object.defineProperty({},'notes',{get(){throw Error('unreadable payload');}}));
bad.push(phrase({notes:[note(),Object.defineProperty(note(),'velocity',{get(){throw Error('unreadable note');}})]}));
bad.forEach((payload,i)=>rejectsWithoutMutation(h,payload,`invalid payload ${i}`));

// Invalid imports do not stop a playing loop, its lookahead or pending callback identities.
assert(h.engine.play({loop:true}));h.advance(1400);
assert.equal(h.s().state,'playing');const oldSounds=h.sounds.length;
rejectsWithoutMutation(h,phrase({notes:[note(),note({velocity:0})]}),'invalid while looping');
h.advance(600);assert(h.sounds.length>oldSounds);assert(h.s().looping);h.engine.stop();

// Positive duration, finite BPM and integer MIDI bounds are inclusive; timing is never rounded.
const poly=phrase({duration:1000.875,notes:[
 note({note:72,velocity:127,channel:15,start:700.125,duration:10.375}),
 note({note:60,velocity:1,channel:0,start:100.125,duration:300.625}),
 note({note:64,velocity:87,channel:2,start:100.125,duration:100.25}),
 note({note:60,velocity:81,channel:3,start:120.375,duration:500.125})
]});
const expectedNotes=plain(poly.notes).sort((a,b)=>a.start-b.start);
poly.notes.forEach(Object.freeze);Object.freeze(poly.notes);Object.freeze(poly);
let beforeChanges=h.changes.length,beforeWrites=h.storage.writes,beforeSilences=h.silences;
assert(h.engine.importPhrase(poly));
assert.deepEqual(h.s().notes,expectedNotes);assert.equal(h.s().duration,1000.875);assertNeutral(h.s());
assert.deepEqual(h.s().options,{meterNumerator:4,meterDenominator:4,gridOriginMs:0,gridConfirmed:false,loopSnap:'free',countInBars:1,loopPadEnd:false,metronome:false,sourceBpm:120,playBpm:120,transpose:0,rhythm:false,tolerance:333,sectionStart:0,sectionEnd:1000.875});
assert.equal(h.s().state,'idle');assert.equal(h.s().error,'');assert.equal(h.s().progress,0);assert.equal(h.s().total,0);assert.equal(h.s().elapsed,0);
assert.equal(h.s().countIn,0);assert.deepEqual(h.s().target,[]);assert.equal(h.s().looping,false);
assert.equal(h.changes.length,beforeChanges+1);assert.equal(h.storage.writes,beforeWrites+1);assert.equal(h.silences,beforeSilences+1);assert.equal(h.s().saved,true);
assert.equal(JSON.parse(h.storage.value).version,3);assert.equal(JSON.parse(h.storage.value).sourceBpm,120);
assert.equal(h.s().origin,'audio');assert.equal(JSON.parse(h.storage.value).origin,'audio');

// Decimal-seconds edits tolerate <=1e-6 ms end overflow, clipping only the copied duration.
const decimal=phrase({duration:1.001*1000,notes:[note({start:.001*1000,duration:1*1000}),note({note:64,start:100.125,duration:200.625})]});
decimal.notes.forEach(Object.freeze);Object.freeze(decimal.notes);Object.freeze(decimal);
assert(decimal.notes[0].start+decimal.notes[0].duration>decimal.duration);
assert(h.engine.importPhrase(decimal));
assert.deepEqual(h.s().notes,[{...decimal.notes[0],duration:decimal.duration-decimal.notes[0].start},decimal.notes[1]]);
assert.equal(decimal.notes[0].duration,1000,'caller data remains untouched');
assert.equal(h.s().notes[0].start+h.s().notes[0].duration,h.s().duration);
assert.deepEqual(setup(h.storage).s().notes,h.s().notes,'clipped timing survives v2 reload');
assert(h.engine.importPhrase(phrase({duration:1,notes:[note({duration:1+1e-6})]})));
assert.equal(h.s().notes[0].duration,1);
rejectsWithoutMutation(h,phrase({duration:1,notes:[note({duration:1+1.000001e-6})]}),'overflow above 1e-6 ms');
// Subtracting start can itself round back above the end: correct only this exceptional copy.
const roundingEnd=52/37,roundingStart=21/53,roundedLength=roundingEnd-roundingStart;
assert(roundingStart+roundedLength>roundingEnd,'fixture exercises subtraction/addition rounding');
const roundingNote=Object.freeze(note({start:roundingStart,duration:roundedLength+5e-7}));
assert(h.engine.importPhrase(phrase({duration:roundingEnd,notes:[roundingNote]})));
const clipped=h.s().notes[0];assert(clipped.duration>0);assert(clipped.start+clipped.duration<=roundingEnd);
assert.equal(clipped.duration,roundedLength-Number.EPSILON*roundingEnd);
assert.equal(roundingNote.duration,roundedLength+5e-7);assert.equal(clipped.start,roundingStart);

// Copies isolate both caller input and snapshots. Only supported note fields are retained.
const mutable=phrase({notes:[note({ignored:'metadata'})],controllers:[{controller:64,value:127,channel:0,time:0}],options:{transpose:12}});
assert(h.engine.importPhrase(mutable));mutable.notes[0].note=1;mutable.notes.push(note({note:2}));mutable.duration=500;
const exposed=h.engine.snapshot();exposed.notes[0].velocity=1;exposed.options.transpose=20;exposed.initialControllers[0].value=0;
assert.deepEqual(h.s().notes,[note()]);assert.equal(h.s().duration,1000);assert.equal(h.s().options.transpose,0);assertNeutral(h.s());
const customIteration=[note()];customIteration[Symbol.iterator]=function*(){yield note({note:1});yield note({note:2});};
assert(h.engine.importPhrase(phrase({notes:customIteration})));assert.deepEqual(h.s().notes,[note()],'validate actual array items, not a replaced iterator');
for(const sourceBpm of [undefined,30,120.5,300]){
 assert(h.engine.importPhrase(phrase({sourceBpm})));assert.equal(h.s().options.sourceBpm,sourceBpm??120);assert.equal(h.s().options.playBpm,sourceBpm??120);
 const reload=setup(h.storage);assert.deepEqual(reload.s().notes,h.s().notes);assert.deepEqual(reload.s().options,h.s().options);assertNeutral(reload.s());assert(reload.s().saved);assert.equal(reload.s().origin,'audio');
}
assert(h.engine.importPhrase(phrase({duration:.125,notes:[note({note:0,velocity:1,channel:0,duration:.125})]})));
assert.equal(h.s().duration,.125);assert(h.engine.play());h.advance(2101);assert.equal(h.sounds.at(-1).duration,.125);

// Maximum 10,000 notes / 120 seconds persist and reload; one extra rejects atomically.
const maximum=phrase({duration:120000,sourceBpm:30,notes:Array.from({length:10000},(_,i)=>note({note:i%128,velocity:i%127+1,channel:i%16,start:i*11+.125,duration:1.625}))});
assert(h.engine.importPhrase(maximum));assert.equal(h.s().notes.length,10000);assert.equal(h.s().duration,120000);
assert.equal(setup(h.storage).s().notes.length,10000);
rejectsWithoutMutation(h,{...maximum,notes:[...maximum.notes,note()]},'10001 notes');
assert(h.engine.importPhrase(phrase({duration:120000,notes:[note({note:127,velocity:127,channel:15,start:119999.75,duration:.25})]})));
assert.equal(h.s().notes[0].start+h.s().notes[0].duration,120000);

// Existing v1 and v2 data stay readable. Import replaces recorded pedal/volume, not live MIDI state.
for(const version of [1,2]){
 const legacy={version,notes:[note({note:55})],duration:1000,sourceBpm:90,
  options:{metronome:false,sourceBpm:90,playBpm:180,transpose:7,rhythm:true,tolerance:456,sectionStart:50,sectionEnd:500}};
 if(version===2){legacy.controllers=[{controller:64,value:0,channel:2,time:700},{controller:7,value:20,channel:0,time:300}];legacy.initialControllers=baseline().map(c=>({...c,value:c.controller===64?127:20}));}
 const storage=memory(JSON.stringify(legacy));h=setup(storage);assert.equal(h.s().notes[0].note,55);assert.equal(h.s().options.transpose,7);assert.equal(h.s().origin,'midi');
 assert(h.engine.importPhrase(poly));assertNeutral(h.s());assert.equal(h.s().options.tolerance,456);assert.equal(h.s().options.metronome,false);
 assert.equal(h.s().options.sourceBpm,120);assert.equal(h.s().options.transpose,0);assert.equal(h.s().options.rhythm,false);
 const reloaded=setup(storage);assert.deepEqual(reloaded.s().notes,expectedNotes);assertNeutral(reloaded.s());assert.equal(JSON.parse(storage.value).version,3);assert.equal(storage.writes,1);assert.equal(reloaded.s().origin,'audio');
}
h=setup();h.cc(64,127,2);h.cc(7,25,2);assert(h.engine.importPhrase(phrase()));assertNeutral(h.s());
h.engine.record();h.advance(2000);h.on(62,2);h.advance(100);h.off(62,2);h.engine.stop();
assert.equal(h.s().origin,'midi');assert.equal(JSON.parse(h.storage.value).origin,'midi');assert.equal(setup(h.storage).s().origin,'midi');
assert.equal(h.s().initialControllers.find(c=>c.controller===64&&c.channel===2).value,127,'live pedal state still seeds the next real recording');
assert.equal(h.s().initialControllers.find(c=>c.controller===7&&c.channel===2).value,25);

// Provenance follows the saved phrase, survives empty/cancelled takes, and resets only with new content.
h=setup();h.engine.importPhrase(phrase());h.engine.record();h.advance(2000);h.advance(100);h.engine.stop();
assert.equal(h.s().origin,'audio');assert.equal(JSON.parse(h.storage.value).origin,'audio');
h.engine.record();h.advance(500);h.engine.stop();assert.equal(h.s().origin,'audio');
h.engine.clear();assert.equal(h.s().origin,'midi');assert.equal(h.s().notes.length,0);assert.equal(setup(h.storage).s().origin,'midi');
h.engine.importPhrase(phrase());assert.equal(h.s().origin,'audio');
for(const origin of [null,'unknown','',42,{},[]]){
 const data=JSON.parse(h.storage.value);data.origin=origin;h.storage.value=JSON.stringify(data);
 const {error,...before}=h.s(),silences=h.silences,writes=h.storage.writes;
 assert.equal(h.engine.load(),false,'unknown persisted provenance is rejected');
 const {error:afterError,...after}=h.s();assert.deepEqual(after,before);assert(afterError);assert.equal(h.silences,silences);assert.equal(h.storage.writes,writes);
 assert(h.engine.importPhrase(phrase()));
}

// Import cannot replace a recording or its count-in, including a delayed transition callback.
for(const elapsed of [0,500,1999]){
 h=setup();h.engine.importPhrase(phrase());h.engine.record();h.advance(elapsed);
 rejectsWithoutMutation(h,poly,'record count-in rejects replacement');h.advance(2000-elapsed);h.on(67);h.advance(250);h.off(67);h.engine.stop();
 assert.deepEqual(h.s().notes,[note({note:67,velocity:100,duration:250})]);
}
h=setup();h.engine.importPhrase(phrase());h.engine.record();h.jump(2100);rejectsWithoutMutation(h,poly,'late record count-in remains protected');h.advance(0);
assert.equal(h.s().state,'recording');h.on(65);h.advance(99.25);rejectsWithoutMutation(h,poly,'live recording remains protected');
h.advance(.75);h.off(65);h.engine.stop();assert.deepEqual(h.s().notes,[note({note:65,velocity:100,start:100,duration:100})]);

// Successful import cancels every transport state and already-dispatched lookahead via onSilence.
for(const action of ['play-countin','playing','looping','practice-countin','practice','wait-release','complete']){
 h=setup();h.engine.importPhrase(phrase({notes:[note(),note({note:64,start:0})]}));
 if(action==='play-countin'||action==='playing'||action==='looping'){
  h.engine.play({loop:action==='looping'});h.advance(action==='play-countin'?1900:2100);
 }else if(action==='wait-release'){h.on(65);h.engine.practice();}
 else{h.engine.practice();h.advance(action==='practice-countin'?400:2000);if(action==='practice')h.on(60);if(action==='complete'){h.on(60);h.on(64);}}
 const queued=[...h.timers.values()].map(t=>t.fn),counts=[h.sounds.length,h.controls.length,h.beats.length];
 const silence=h.silences,writes=h.storage.writes,changes=h.changes.length;
 assert(h.engine.importPhrase(poly),action);assert.equal(h.silences,silence+1);assert.equal(h.storage.writes,writes+1);assert.equal(h.changes.length,changes+1);
 assert.equal(h.timers.size,0);assert.equal(h.s().state,'idle');assert.equal(h.s().progress,0);assert.equal(h.s().total,0);assert.equal(h.s().countIn,0);assert.equal(h.s().targetTime,null);assert.equal(h.s().looping,false);
 for(const fn of queued)fn();h.advance(10000);
 assert.deepEqual([h.sounds.length,h.controls.length,h.beats.length],counts,`${action}: no stale audio`);assert.equal(h.timers.size,0);assert.equal(h.s().state,'idle');assert.equal(h.changes.length,changes+1);
}

// A physically held key survives import, including per-channel duplicate pitches.
h=setup();h.on(60,0);h.on(60,1);assert(h.engine.importPhrase(phrase()));assert(h.engine.practice());assert.equal(h.s().state,'wait-release');
h.off(60,0);assert.equal(h.s().state,'wait-release');h.off(60,1);assert.equal(h.s().state,'countin');h.advance(2000);
assert.equal(h.on(60),true);assert.equal(h.s().state,'complete');h.engine.importPhrase(phrase());h.engine.record();h.advance(2000);
assert.equal(h.on(60),undefined,'preheld key does not become a recorded attack');assert.equal(h.s().recordedCount,0);
h.off(60);h.on(60);h.advance(100);h.off(60);h.engine.stop();assert.equal(h.s().notes.length,1);

// Polyphonic playback preserves rests, independent releases and channels; no pedal extension.
h=setup();assert(h.engine.importPhrase(poly));const stored=h.storage.value;
h.engine.play();h.advance(3000);
assert.deepEqual(h.sounds.map(s=>[s.note,s.velocity,s.at,s.duration,s.meta.channel,s.meta.keyDuration]),expectedNotes.map(n=>[n.note,n.velocity,2000+n.start,n.duration,n.channel,n.duration]));
assert.equal(h.controls.length,48);assert(h.controls.every(c=>c.initial));assert.deepEqual(h.s().notes,expectedNotes);assert.equal(h.storage.value,stored);
h.advance(102);assert.equal(h.s().state,'idle');

// Tempo, transposition and sections use the same engine as MIDI-recorded phrases.
assert(h.engine.setOptions({playBpm:240,transpose:2,sectionStart:200,sectionEnd:800}));h.sounds.length=0;const origin=h.time;
assert(h.engine.play({loop:true}));h.advance(1650);
const firstPass=h.sounds.slice(0,4);
assert.deepEqual(firstPass.map(s=>[s.note,s.at-origin,s.duration,s.meta.keyDuration,s.meta.channel]),[[62,1000,100.375,100.375,0],[66,1000,.1875,.1875,2],[62,1000,210.25,210.25,3],[74,1250.0625,5.1875,5.1875,15]]);
assert.deepEqual(h.sounds.slice(4,8).map(s=>s.at),firstPass.map(s=>s.at+300));assert.equal(h.s().playbackDuration,300);assert.deepEqual(h.s().notes,expectedNotes);
h.engine.stop();assert.equal(h.timers.size,0);
assert(h.engine.setOptions({playBpm:120,sectionStart:0,sectionEnd:poly.duration}));assert(h.engine.practice());h.advance(2000);
assert.deepEqual(h.s().target,[62,66]);assert.equal(h.s().total,2);h.on(62);h.on(66);assert.equal(h.s().progress,1);h.off(62);h.off(66);h.on(74);assert.equal(h.s().state,'complete');h.off(74);
assert(h.engine.setOptions({rhythm:true,tolerance:100}));assert(h.engine.practice());h.advance(2100.125);h.on(62);h.on(66);h.off(62);h.off(66);h.advance(600);h.on(74);assert.equal(h.s().state,'complete');
assert.deepEqual(h.s().notes,expectedNotes);

// Stale partial chord answers are removed, without clearing physically held notes.
h=setup();h.engine.importPhrase(phrase({notes:[note(),note({note:64})]}));h.engine.practice();h.advance(2000);h.on(60);
assert.deepEqual(h.s().target,[64]);h.engine.importPhrase(phrase({notes:[note(),note({note:67})]}));h.off(60);h.engine.practice();h.advance(2000);
assert.deepEqual(h.s().target,[60,67]);h.on(67);assert.equal(h.s().state,'practice');h.on(60);assert.equal(h.s().state,'complete');

// Saving failure cannot roll back a valid import or stop this-session playback/practice.
const failing=memory(JSON.stringify({version:1,notes:[note({note:55})],duration:1000,sourceBpm:120}));
failing.setItem=function(){this.writes++;throw Error('quota exceeded');};h=setup(failing);const oldStored=failing.value;
assert(h.engine.importPhrase(poly));assert.deepEqual(h.s().notes,expectedNotes);assertNeutral(h.s());assert.equal(h.s().saved,false);assert.match(h.s().error,/kept for this session.*saving is unavailable/i);
assert.equal(h.s().origin,'audio');
assert.equal(failing.writes,1);assert.equal(failing.value,oldStored);assert(h.engine.play());h.advance(3000);assert.equal(h.sounds.length,4);h.engine.stop();assert(h.engine.practice());h.advance(2000);assert.deepEqual(h.s().target,[60,64]);
for(const storage of [null,{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}]){
 h=setup(storage);assert(h.engine.importPhrase(phrase()));assert.equal(h.s().notes.length,1);assert.equal(h.s().saved,false);assert.match(h.s().error,/session/);assert(h.engine.play());h.advance(2100);assert.equal(h.sounds.length,1);
}

console.log(`PASS: phrase import complete validation (${bad.length} malformed payloads), atomic rejection, protected recording/count-in, fractional polyphony/copy isolation, 10k/120s bounds, neutral controllers, musical option reset and personal option preservation, v1/v2 reload and origin provenance, playback/loop/section/transpose/practice, all transport and stale callback cleanup, held keys/live MIDI state, and storage failure. Deterministic engine only; no model accuracy or audible/device claims.`);
