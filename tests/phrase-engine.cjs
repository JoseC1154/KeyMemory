// Deterministic engine tests; no physical MIDI keyboard or audible sound claims.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','phrase.js'),'utf8');
function setup(existing){
 let time=0,id=0;const timers=new Map(),sounds=[],changes=[],wrongs=[];let silences=0;
 const storage=existing||{data:new Map(),getItem(k){return this.data.get(k)||null;},setItem(k,v){this.data.set(k,v);},removeItem(k){this.data.delete(k);}};
 const context={window:{},Date,console};vm.createContext(context);vm.runInContext(code,context);
 const engine=context.window.KeyMemoryPhrase.create({storage,now:()=>time,setTimer:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},clearTimer:i=>timers.delete(i),onChange:s=>changes.push(s),onWrong:(n,m)=>wrongs.push([n,m]),onSound:(n,v,d)=>sounds.push({note:n,velocity:v,duration:d,at:time}),onSilence:()=>silences++});
 function advance(ms){const end=time+ms;for(let count=0;;count++){if(count>100000)throw Error('timerloop');const entry=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;const [i,t]=entry;time=t.at;timers.delete(i);t.fn();}time=end;}
 const on=(note,velocity=100,channel=0)=>engine.input({kind:'on',note,velocity,channel}),off=(note,channel=0)=>engine.input({kind:'off',note,channel});
 return{engine,advance,on,off,s:()=>engine.snapshot(),sounds,wrongs,changes,storage,timers,get time(){return time;},get silences(){return silences;}};
}
function recordChord(h){h.engine.record();h.on(60,95);h.advance(35);h.on(64,80);h.advance(35);h.on(67,70);h.advance(430);h.off(60);h.advance(50);h.off(64);h.advance(50);h.off(67);h.advance(400);h.on(72,110);h.advance(250);h.off(72);h.engine.stop();}
// Preserve note timing, independently overlapping durations, velocity and channel.
let h=setup();recordChord(h);assert.equal(h.s().duration,1250);assert.deepEqual(JSON.parse(JSON.stringify(h.s().notes)),[{note:60,velocity:95,channel:0,start:0,duration:500},{note:64,velocity:80,channel:0,start:35,duration:515},{note:67,velocity:70,channel:0,start:70,duration:530},{note:72,velocity:110,channel:0,start:1000,duration:250}]);assert(h.s().saved);
h.engine.play();h.advance(1250);assert.deepEqual(h.sounds.map(s=>s.at),[1250,1285,1320,2250]);assert.deepEqual(h.sounds.map(s=>s.duration),[500,515,530,250]);h.advance(100);assert.equal(h.s().state,'idle');
// input() reports accepted recording/practice note-ons, never failures/releases/stale notes.
h=setup();assert.equal(h.engine.input({kind:'on',note:60}),undefined);h.off(60);h.engine.record();assert.equal(h.engine.input({kind:'on',note:60}),true);assert.equal(h.engine.input({kind:'on',note:60}),undefined);h.advance(50);assert.equal(h.engine.input({kind:'off',note:60}),undefined);h.engine.stop();h.engine.practice();h.advance(2000);assert.equal(h.engine.input({kind:'on',note:61}),undefined);h.off(61);h.advance(2000);assert.equal(h.engine.input({kind:'on',note:60}),true);assert.equal(h.s().state,'complete');
// Optional normalized receive timestamps retain timing despite late JavaScript dispatch.
h=setup();h.engine.record();h.advance(100);h.engine.input({kind:'on',note:60,velocity:90,channel:0,time:50});h.advance(300);h.engine.input({kind:'off',note:60,channel:0,time:350});h.engine.stop();assert.equal(h.s().notes[0].start,50);assert.equal(h.s().notes[0].duration,300);
// Explicit BPM ratio scales both timing and durations, transpose affects pitch only.
h=setup();recordChord(h);assert(h.engine.setOptions({sourceBpm:120,playBpm:240,transpose:2}));h.engine.play();h.advance(1000);assert.deepEqual(h.sounds.map(s=>s.note),[62,66,69,74]);assert.deepEqual(h.sounds.map(s=>s.at),[1250,1267.5,1285,1750]);assert.deepEqual(h.sounds.map(s=>s.duration),[250,257.5,265,125]);
assert(!h.engine.setOptions({transpose:100}));assert(!h.engine.setOptions({playBpm:0}));assert.equal(h.s().options.playBpm,240);
// Notes-only groups rolled chords, not sequential notes; wrong always restarts whole section.
h=setup();recordChord(h);h.engine.practice();assert.equal(h.s().countIn,4);h.advance(1500);assert.equal(h.s().countIn,1);h.advance(500);assert.equal(h.s().state,'practice');assert.equal(h.s().total,2);h.on(60);h.advance(40);h.on(64);h.advance(40);h.on(67);assert.equal(h.s().progress,1);h.off(60);h.off(64);h.off(67);h.on(71);assert.equal(h.s().state,'wait-release');assert.equal(h.s().progress,0);assert.equal(h.wrongs.length,1);h.advance(10000);assert.equal(h.s().state,'wait-release');h.off(71);assert.equal(h.s().state,'countin');assert.equal(h.s().error,'');h.advance(2000);assert.equal(h.s().progress,0);assert.equal(h.s().notes.length,4);h.on(60);h.on(64);h.on(67);h.off(60);h.off(64);h.off(67);h.on(72);assert.equal(h.s().state,'complete');assert.equal(h.s().progress,2);
// Incomplete chord cannot be arpeggiated indefinitely; duplicate layered notes do not advance.
h=setup();recordChord(h);h.engine.practice();h.advance(2000);h.on(60);h.advance(201);assert.equal(h.s().state,'wait-release');h.off(60);h.advance(2000);h.on(60);h.on(60,100,1);assert.equal(h.s().target.length,2);h.off(60);h.off(60,1);h.engine.stop();
// Rhythm mode compares onsets and detects missed windows without input.
h=setup();recordChord(h);h.engine.setOptions({rhythm:true,tolerance:100});h.engine.practice();h.advance(2000);h.on(60);h.advance(35);h.on(64);h.advance(35);h.on(67);h.off(60);h.off(64);h.off(67);h.advance(929);h.on(72);assert.equal(h.s().state,'complete');h.off(72);
h.engine.practice();h.advance(2171);assert.equal(h.s().state,'countin');assert.match(h.wrongs.at(-1)[1],/Timing/);assert.equal(h.s().notes.length,4);
// Slower playback preserves recorded chord rolls; rhythm window covers the scaled group.
h=setup();recordChord(h);h.engine.setOptions({sourceBpm:300,playBpm:30,rhythm:true,tolerance:100});h.engine.practice();h.advance(8000);h.on(60);h.advance(350);h.on(64);h.advance(350);h.on(67);assert.equal(h.s().progress,1);assert.equal(h.s().state,'practice');h.engine.stop();
// Section intersecting sustained notes clips at both boundaries, retaining chord grouping.
h=setup();recordChord(h);h.engine.setOptions({sectionStart:200,sectionEnd:550});h.engine.play();h.advance(400);assert.deepEqual(h.sounds.map(s=>s.note),[60,64,67]);assert.deepEqual(h.sounds.map(s=>s.duration),[300,350,350]);assert(h.sounds.every(s=>s.at===1250));
h.engine.setOptions({sectionStart:1100,sectionEnd:1200});h.engine.practice();h.advance(2000);assert.deepEqual(Array.from(h.s().target),[72]);h.on(72);assert.equal(h.s().state,'complete');
// Visual progress includes leading rests; stop clears held notes and count-in presses require release.
h=setup();h.engine.record();h.advance(500);h.on(60);h.advance(200);h.off(60);h.engine.stop();h.engine.setOptions({rhythm:true});h.engine.practice();h.advance(2000);assert.equal(h.s().targetTime,500);h.advance(300);assert.equal(h.s().elapsed,300);assert(h.changes.some(s=>s.state==='practice'&&s.elapsed===300));h.engine.stop();h.on(60);h.engine.practice();assert.equal(h.s().state,'wait-release');h.engine.stop({releaseHeld:true});h.engine.practice();assert.equal(h.s().state,'countin');h.on(60);h.advance(2000);assert.equal(h.s().state,'wait-release');h.off(60);assert.equal(h.s().state,'countin');h.engine.stop();h.advance(10000);assert.equal(h.s().state,'idle');
// Exactly 120s auto-finalizes held notes and bounds recording; stale timer cannot resume.
h=setup();h.engine.record();h.on(48,127,15);h.advance(119999);assert.equal(h.s().state,'recording');h.advance(1);assert.equal(h.s().state,'idle');assert.equal(h.s().duration,120000);assert.equal(h.s().notes[0].duration,120000);h.off(48,15);h.advance(999999);assert.equal(h.s().notes.length,1);
h.engine.play();h.advance(1);const count=h.sounds.length;h.engine.stop();h.advance(200000);assert.equal(h.sounds.length,count);assert.equal(h.timers.size,0);
// Note-on zero is a release. Repeated held events do not inflate recordings.
h=setup();h.engine.record();h.on(60);h.on(60);h.advance(50);h.on(60,0);h.advance(50);h.on(60);h.advance(50);h.off(60);h.engine.stop();assert.equal(h.s().notes.length,2);assert.deepEqual(Array.from(h.s().notes,n=>n.duration),[50,50]);
// Empty replacement preserves prior phrase; bounds reject impossible transpose; all options reload.
h=setup();recordChord(h);h.engine.record();h.advance(10);h.engine.stop();assert.equal(h.s().notes.length,4);assert.match(h.s().error,/previous phrase/);
h.engine.setOptions({transpose:-12,sourceBpm:90,playBpm:180,rhythm:true,tolerance:333,sectionStart:100,sectionEnd:1200});const reload=setup(h.storage);assert.equal(reload.s().notes.length,4);assert.deepEqual(JSON.parse(JSON.stringify(reload.s().options)),JSON.parse(JSON.stringify(h.s().options)));
h=setup();h.engine.record();h.on(0);h.advance(20);h.off(0);h.engine.stop();assert(!h.engine.setOptions({transpose:-1}));assert.equal(h.s().options.transpose,0);
h.engine.clear();assert.equal(h.s().notes.length,0);assert.equal(setup(h.storage).s().notes.length,0);
// Zero-length taps remain replayable; ordinary Stop preserves held keys, suspended stop clears them.
h=setup();h.engine.record();h.on(60);h.off(60);h.engine.stop();assert.equal(h.s().duration,1);assert.equal(h.s().notes[0].duration,1);assert(h.engine.play());h.advance(0);assert.equal(h.sounds.length,1);h.engine.stop();h.on(60);h.engine.practice();assert.equal(h.s().state,'wait-release');h.engine.stop();h.engine.practice();assert.equal(h.s().state,'wait-release');h.off(60);h.advance(2000);assert.equal(h.s().state,'practice');h.engine.stop();assert.equal(h.s().target.length,0);
// Delayed pre-practice note-ons cannot answer either timing mode.
for(const rhythm of [false,true]){h=setup();recordChord(h);h.engine.setOptions({rhythm});h.engine.practice();h.advance(2000);h.engine.input({kind:'on',note:60,velocity:100,channel:0,time:h.time-1});assert.equal(h.s().target.length,3);assert.equal(h.wrongs.length,0);h.off(60);h.on(60);assert.equal(h.s().target.length,2);h.engine.stop({releaseHeld:true});}
// Corrupt/unavailable storage never prevents recording; malformed oversized events are ignored.
h=setup({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}});recordChord(h);assert.equal(h.s().notes.length,4);assert(!h.s().saved);assert.match(h.s().error,/session/);
h=setup({getItem(){return '{bad';},setItem(){},removeItem(){}});assert.equal(h.s().notes.length,0);assert.match(h.s().error,/could not/);assert(!h.engine.play());
h=setup();h.engine.record();for(let i=0;i<10005;i++){h.on(60);h.off(60);}assert.equal(h.s().state,'idle');assert.equal(h.s().notes.length,10000);
console.log('PASS: Phrase engine 120s cap/event bounds; MIDI timing/durations/velocity/channel; chord rolls/layer duplicates; explicit BPM scaling/transposition guards; playback cancellation; section clipping; count-in/notes-only/rhythm; wrong/late/incomplete-chord restart after release; local persistence/errors/empty replacement. Fake clock/MIDI/audio only.');
