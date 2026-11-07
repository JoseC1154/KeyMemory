// Deterministic raw-note editing, Undo, transport cancellation and persistence tests.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','phrase.js'),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
const note=(patch={})=>({note:60,velocity:91,channel:0,start:0,duration:200,...patch});
const imported=()=>({notes:[note(),note({note:64,start:300.125,duration:100.625}),note({note:67,start:600.5,duration:150.25})],duration:1000.875,sourceBpm:120});
function memory(value=null){return{value,writes:0,removes:0,fail:false,getItem(){return this.value;},setItem(key,text){this.writes++;if(this.fail)throw Error('unavailable');this.value=text;},removeItem(){this.removes++;this.value=null;}};}
function setup(storage=memory()){
 let time=0,id=0,silences=0;const timers=new Map(),sounds=[],controls=[],beats=[],changes=[];
 const context={window:{},Date,console};vm.createContext(context);vm.runInContext(code,context);
 const engine=context.window.KeyMemoryPhrase.create({storage,now:()=>time,setTimer:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},clearTimer:id=>timers.delete(id),onChange:s=>changes.push(plain(s)),onSilence:()=>silences++,onSound:(...args)=>sounds.push(args),onControl:c=>controls.push(c),onBeat:b=>beats.push(b)});
 function advance(ms){const end=time+ms;for(let i=0;;i++){assert(i<100000);const entry=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;const [id,t]=entry;timers.delete(id);time=Math.max(time,t.at);t.fn();}time=end;}
 return{engine,storage,timers,sounds,controls,beats,changes,advance,s:()=>plain(engine.snapshot()),get silences(){return silences;},jump:ms=>time+=ms,on:(note=60,channel=0)=>engine.input({kind:'on',note,channel,time}),off:(note=60,channel=0)=>engine.input({kind:'off',note,channel,time}),cc:(controller,value,channel=0)=>engine.input({kind:'control',controller,value,channel,time})};
}
const remove=(h,index)=>h.engine.deleteNote(index,h.s().noteRevision),undo=h=>h.engine.undoDelete(h.s().noteRevision);
function unchanged(h,fn){const before={s:h.s(),value:h.storage.value,writes:h.storage.writes,removes:h.storage.removes,silences:h.silences,timers:[...h.timers],changes:h.changes.length,counts:[h.sounds.length,h.controls.length,h.beats.length]};assert.equal(fn(),false);assert.deepEqual({s:h.s(),value:h.storage.value,writes:h.storage.writes,removes:h.storage.removes,silences:h.silences,timers:[...h.timers],changes:h.changes.length,counts:[h.sounds.length,h.controls.length,h.beats.length]},before);}
const phraseState=s=>({duration:s.duration,origin:s.origin,controllers:s.controllers,initialControllers:s.initialControllers,options:s.options});

// Revisions are session-local and mandatory. Rejections never touch transport or emit.
let h=setup();assert.equal(h.s().noteRevision,0);assert.equal(h.s().undoDeleteCount,0);
unchanged(h,()=>h.engine.deleteNote(0,0));unchanged(h,()=>h.engine.undoDelete(0));
assert(h.engine.importPhrase(imported()));assert.equal(h.s().noteRevision,1);
for(const index of [-1,.5,3,NaN,Infinity,null,undefined,'0',{},true])unchanged(h,()=>h.engine.deleteNote(index,h.s().noteRevision));
for(const revision of [-1,0,2,1.5,NaN,Infinity,null,undefined,'1',{},true]){unchanged(h,()=>h.engine.deleteNote(0,revision));unchanged(h,()=>h.engine.undoDelete(revision));}
assert(remove(h,1));assert.equal(h.s().noteRevision,2);assert.equal(h.s().undoDeleteCount,1);
unchanged(h,()=>h.engine.deleteNote(1,1));unchanged(h,()=>h.engine.undoDelete(1));
assert(undo(h));assert.equal(h.s().noteRevision,3);assert.equal(h.s().undoDeleteCount,0);assert.deepEqual(h.s().notes,imported().notes);

// Load supports exact fractional/zero-duration notes, identical unisons and channel duplicates.
const seed=setup();seed.engine.importPhrase(imported());const data=JSON.parse(seed.storage.value);
data.origin='midi';data.notes=[note({start:1.25,duration:0}),note({start:1.25,duration:200.625}),note({start:1.25,duration:200.625}),note({channel:1,start:1.25,duration:200.625}),note({note:72,start:800.125,duration:0})];
data.controllers=[{controller:64,value:127,channel:1,time:0.125},{controller:7,value:50,channel:0,time:333.125},{controller:11,value:64,channel:15,time:500.625},{controller:64,value:0,channel:1,time:999.25}];
data.initialControllers=data.initialControllers.map(c=>({...c,value:c.controller===64?64:c.channel+32}));
data.options={...data.options,meterNumerator:6,meterDenominator:8,sourceBpm:90,playBpm:180,transpose:7,rhythm:true,tolerance:333,sectionStart:25.125,sectionEnd:1500,gridOriginMs:12.625,gridConfirmed:true,loopPadEnd:true,loopSnap:'bar',countInBars:2,metronome:false};data.sourceBpm=90;
h=setup(memory(JSON.stringify(data)));const original=h.s(),context=phraseState(original),remaining=plain(original.notes);
for(const index of [2,0,2,1,0]){remaining.splice(index,1);const revision=h.s().noteRevision,writes=h.storage.writes,silences=h.silences;assert(remove(h,index));assert.deepEqual(h.s().notes,remaining);assert.deepEqual(phraseState(h.s()),context);assert.equal(h.s().noteRevision,revision+1);assert.equal(h.storage.writes,writes+1);assert.equal(h.silences,silences+1);const saved=JSON.parse(h.storage.value);assert.deepEqual(saved.notes,remaining);assert.deepEqual(saved.options,context.options);assert.deepEqual(saved.controllers,context.controllers);assert.deepEqual(saved.initialControllers,context.initialControllers);assert.equal(saved.duration,context.duration);assert.equal(saved.origin,context.origin);}
assert.equal(h.s().notes.length,0);assert.equal(h.s().undoDeleteCount,5);assert.equal(h.storage.removes,0);
const emptyReload=setup(h.storage);assert.deepEqual(emptyReload.s().notes,[]);assert.deepEqual(phraseState(emptyReload.s()),context);assert.equal(emptyReload.s().undoDeleteCount,0,'Undo is deliberately session-local');
for(let i=0;i<5;i++){assert(undo(h));assert.deepEqual(phraseState(h.s()),context);}
assert.deepEqual(h.s().notes,original.notes);assert.equal(h.s().noteRevision,original.noteRevision+10);unchanged(h,()=>undo(h));
// Mutating an exposed snapshot cannot corrupt either remaining notes or Undo entries.
assert(remove(h,0));const exposed=h.engine.snapshot();exposed.notes[0].velocity=1;exposed.options.transpose=-10;assert(undo(h));assert.deepEqual(h.s().notes,original.notes);assert.deepEqual(phraseState(h.s()),context);

// Timeline IDs address the same raw array even with transposition, sustain and tied onsets.
const view=require('../phrase-view.js'),selection=h.s(),timeline=view.prepareTimeline(selection,selection.options);
for(const n of timeline.notes){const raw=selection.notes[n.id];assert.equal(n.midi,raw.note+selection.options.transpose);assert.equal(n.channel,raw.channel);assert.equal(n.start,raw.start);}
const selected=timeline.notes.find(n=>n.channel===1);assert(selected);const expected=selection.notes.filter((_,i)=>i!==selected.id);
assert(h.engine.deleteNote(selected.id,selection.noteRevision));assert.deepEqual(h.s().notes,expected);assert(undo(h));assert.deepEqual(h.s().notes,selection.notes);

// Undo is bounded to the most recent 100 removals, including fully emptied phrases.
h=setup();const many=Array.from({length:105},(_,i)=>note({note:i%128,start:i*2+.125,duration:.625}));assert(h.engine.importPhrase({notes:many,duration:1000}));
for(let i=0;i<105;i++)assert(remove(h,0));assert.equal(h.s().undoDeleteCount,100);
for(let i=0;i<100;i++)assert(undo(h));assert.deepEqual(h.s().notes,many.slice(5));assert.equal(h.s().undoDeleteCount,0);unchanged(h,()=>undo(h));

// Successful replacement invalidates stale selections and all Undo; failed replacement does not.
for(const action of ['load','import','clear','record']){
 h=setup();h.engine.importPhrase(imported());assert(remove(h,1));const revision=h.s().noteRevision;
 if(action==='load')assert(h.engine.load());
 if(action==='import')assert(h.engine.importPhrase(imported()));
 if(action==='clear')assert(h.engine.clear());
 if(action==='record'){h.engine.setOptions({countInBars:0});h.engine.record();h.on(72);h.advance(25.125);h.off(72);h.engine.stop();}
 assert.equal(h.s().noteRevision,revision+1,action);assert.equal(h.s().undoDeleteCount,0,action);unchanged(h,()=>h.engine.deleteNote(0,revision));unchanged(h,()=>h.engine.undoDelete(revision));unchanged(h,()=>undo(h));
}
h=setup();h.engine.importPhrase(imported());remove(h,1);let rev=h.s().noteRevision;
assert.equal(h.engine.importPhrase({notes:[],duration:1000}),false);assert.equal(h.s().noteRevision,rev);assert.equal(h.s().undoDeleteCount,1);
h.storage.value='{broken';assert.equal(h.engine.load(),false);assert.equal(h.s().noteRevision,rev);assert.equal(h.s().undoDeleteCount,1);
h.storage.value=null;assert.equal(h.engine.load(),false);assert.equal(h.s().noteRevision,rev);assert.equal(h.s().undoDeleteCount,1);assert(undo(h));

// Record/count-in (even delayed transitions) reject edits; empty/cancelled takes keep history.
for(const elapsed of [0,500,2000,2050]){
 h=setup();h.engine.importPhrase(imported());remove(h,1);const before=h.s();h.engine.record();h.advance(elapsed);
 unchanged(h,()=>remove(h,0));unchanged(h,()=>undo(h));assert.equal(h.engine.load(),false);
 h.engine.stop();assert.equal(h.s().noteRevision,before.noteRevision);assert.equal(h.s().undoDeleteCount,1);assert.deepEqual(h.s().notes,before.notes);assert(undo(h));assert.deepEqual(h.s().notes,imported().notes);
}
h=setup();h.engine.importPhrase(imported());remove(h,0);h.engine.record();h.jump(2100);unchanged(h,()=>remove(h,0));unchanged(h,()=>undo(h));h.engine.stop();assert(undo(h));

// Storage failure does not lose the edit or its Undo; a later write can recover persistence.
h=setup();h.engine.importPhrase(imported());h.storage.fail=true;assert(remove(h,1));assert.equal(h.s().saved,false);assert.match(h.s().error,/session/);assert.equal(h.s().undoDeleteCount,1);assert(undo(h));assert.deepEqual(h.s().notes,imported().notes);assert.equal(h.s().saved,false);
assert(remove(h,1));h.storage.fail=false;assert(undo(h));assert.equal(h.s().saved,true);assert.equal(h.s().error,'');assert.deepEqual(JSON.parse(h.storage.value).notes,imported().notes);

// Every playing/practicing state cancels pending callbacks and silences queued audio on edit.
for(const edit of ['delete','undo'])for(const action of ['play-countin','playing','looping','countin','practice','wait-release','complete']){
 h=setup();h.engine.importPhrase({notes:[note(),note({note:64}),note({note:67,start:500})],duration:1000});
 if(edit==='undo')remove(h,2);
 if(['play-countin','playing','looping'].includes(action)){h.engine.play({loop:action==='looping'});h.advance(action==='play-countin'?1950:2100);}
 else if(action==='wait-release'){h.on(65);h.engine.practice();}
 else{h.engine.practice();h.advance(action==='countin'?400:2000);if(action==='practice')h.on(60);if(action==='complete'){h.on(60);h.on(64);h.on(67);}}
 const snapshot=h.s(),queued=[...h.timers.values()].map(t=>t.fn),counts=[h.sounds.length,h.controls.length,h.beats.length],silences=h.silences;
 // Stale calls during playback/practice must not cancel anything.
 unchanged(h,()=>h.engine.deleteNote(0,snapshot.noteRevision-1));unchanged(h,()=>h.engine.undoDelete(snapshot.noteRevision-1));
 assert(edit==='delete'?remove(h,0):undo(h));assert.equal(h.silences,silences+1);assert.equal(h.s().state,'idle');assert.equal(h.timers.size,0);assert.equal(h.s().looping,false);assert.equal(h.s().progress,0);assert.equal(h.s().total,0);assert.equal(h.s().countIn,0);assert.deepEqual(h.s().target,[]);assert.equal(h.s().targetTime,null);assert.equal(h.s().elapsed,0);assert.deepEqual(phraseState(h.s()),phraseState(snapshot));
 const changes=h.changes.length;for(const fn of queued)fn();h.advance(10000);assert.deepEqual([h.sounds.length,h.controls.length,h.beats.length],counts);assert.equal(h.changes.length,changes);assert.equal(h.timers.size,0);
}

// Undo cannot restore a pitch outside the current transposed range. Its refusal only
// reports an error, retaining history and every pending playback callback for a retry.
for(const [edge,transpose,direction] of [[127,12,'lower'],[0,-12,'raise']]){
 h=setup();const original=[note({note:edge}),note({note:60,start:300})];assert(h.engine.importPhrase({notes:original,duration:1000}));assert(remove(h,0));
 assert(h.engine.setOptions({transpose}));assert(h.engine.play({loop:true}));h.advance(2100);
 const before=h.s(),timers=[...h.timers],silences=h.silences,writes=h.storage.writes,stored=h.storage.value,changes=h.changes.length,counts=[h.sounds.length,h.controls.length,h.beats.length];
 unchanged(h,()=>h.engine.undoDelete(before.noteRevision-1));
 assert.equal(undo(h),false);assert.match(h.s().error,new RegExp('Reset transpose to 0 or '+direction+'.*then Undo'));
 assert.deepEqual({...h.s(),error:before.error},before);assert.deepEqual([...h.timers],timers);assert.equal(h.silences,silences);assert.equal(h.storage.writes,writes);assert.equal(h.storage.value,stored);assert.equal(h.changes.length,changes+1);assert.deepEqual([h.sounds.length,h.controls.length,h.beats.length],counts);
 assert.equal(h.s().undoDeleteCount,1);assert(h.engine.setOptions({transpose:0}));assert(undo(h));assert.deepEqual(h.s().notes,original);assert.equal(h.s().noteRevision,before.noteRevision+1);assert.equal(h.s().undoDeleteCount,0);assert.equal(h.s().error,'');
}
// The inclusive MIDI endpoints are still valid when restoring a transposed note.
for(const [pitch,transpose] of [[115,12],[12,-12]]){
 h=setup();const original=[note({note:pitch}),note({note:60,start:300})];assert(h.engine.importPhrase({notes:original,duration:1000}));assert(remove(h,0));assert(h.engine.setOptions({transpose}));assert(undo(h));assert.deepEqual(h.s().notes,original);assert.equal(h.s().options.transpose,transpose);assert.equal(h.s().error,'');
}

// Physical held keys and observed controller baselines survive edits and Undo.
h=setup();h.engine.importPhrase(imported());h.on(60,0);h.on(60,1);h.cc(7,45,2);h.cc(64,127,2);assert(remove(h,1));assert(undo(h));h.engine.practice();assert.equal(h.s().state,'wait-release');h.off(60,0);assert.equal(h.s().state,'wait-release');h.off(60,1);assert.equal(h.s().state,'countin');h.engine.stop();h.engine.setOptions({countInBars:0});h.engine.record();h.on(72,2);h.advance(25);h.off(72,2);h.engine.stop();assert.equal(h.s().initialControllers.find(c=>c.channel===2&&c.controller===7).value,45);assert.equal(h.s().initialControllers.find(c=>c.channel===2&&c.controller===64).value,127);
console.log('PASS: Raw-index note deletion/revision checks, exact bounded Undo, fractional/zero durations/unisons/channels, controllers/options preservation, last-note Undo, replacement invalidation, recording protection, storage failures and silent transport cancellation. Fake clock/MIDI/audio only.');
