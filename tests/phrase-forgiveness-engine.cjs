// Deterministic grading only: simulated clock/MIDI, not physical latency validation.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','phrase.js'),'utf8');
function setup(storage={value:null,getItem(){return this.value;},setItem(key,value){this.value=value;},removeItem(){this.value=null;}}){
 let time=0,id=0;const timers=new Map(),wrongs=[];
 const context={window:{},Date,console};vm.createContext(context);vm.runInContext(code,context);
 const engine=context.window.KeyMemoryPhrase.create({storage,now:()=>time,setTimer:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},clearTimer:key=>timers.delete(key),onWrong:(note,message)=>wrongs.push({note,message})});
 function advance(ms){assert(ms>=0);const end=time+ms;for(let count=0;;count++){assert(count<100000,'bounded timer execution');const next=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const [key,timer]=next;time=Math.max(time,timer.at);timers.delete(key);timer.fn();}time=end;}
 return{engine,storage,advance,wrongs,s:()=>engine.snapshot(),get time(){return time;},on:(note,eventTime=time)=>engine.input({kind:'on',note,velocity:100,channel:0,time:eventTime}),off:note=>engine.input({kind:'off',note,channel:0})};
}
function fixture(options={},notes=[{note:60,start:3000,duration:100}]){
 const h=setup();assert(h.engine.importPhrase({sourceBpm:120,duration:5000,notes:notes.map(note=>({velocity:100,channel:0,...note}))}));assert(h.engine.setOptions({rhythm:true,...options}));return h;
}
function begin(h){assert(h.engine.practice());h.advance(240000/h.s().options.playBpm);assert.equal(h.s().state,'practice');}
const raw=h=>JSON.stringify(h.s().notes);

// Validation accepts both inclusive endpoints and legacy non-step values.
let h=fixture();assert.equal(h.s().options.tolerance,200);
for(const tolerance of [80,90,150,200,333,400,990,1000]){assert(h.engine.setOptions({tolerance}));assert.equal(h.s().options.tolerance,tolerance);}
for(const tolerance of [79,1001,-1,NaN,Infinity,'200',null]){const before=h.s().options.tolerance;assert.equal(h.engine.setOptions({tolerance}),false);assert.equal(h.s().options.tolerance,before);}

// Tolerance remains real playback milliseconds, independent of tempo/section.
for(const config of [{sourceBpm:120,playBpm:120,sectionStart:0},{sourceBpm:120,playBpm:240,sectionStart:500},{sourceBpm:300,playBpm:30,sectionStart:500}]){
 const target=(3000-config.sectionStart)*config.sourceBpm/config.playBpm;
 for(const tolerance of [80,200,1000]){
  for(const offset of [-tolerance,tolerance]){h=fixture({...config,tolerance});const original=raw(h);begin(h);assert.equal(h.s().targetTime,target);h.advance(target+offset);assert.equal(h.on(60),true);assert.equal(h.s().state,'complete');assert.equal(h.wrongs.length,0);assert.equal(raw(h),original);}
  h=fixture({...config,tolerance});begin(h);h.advance(target-tolerance-1);h.on(60);assert.equal(h.s().state,'wait-release');assert.match(h.wrongs[0].message,/Timing missed/);
  h=fixture({...config,tolerance});begin(h);h.advance(target+tolerance);assert.equal(h.s().state,'practice','upper boundary has not expired');h.advance(1);assert.equal(h.s().state,'countin','missing note restarts after inclusive upper boundary');assert.equal(h.wrongs.length,1);assert.match(h.wrongs[0].message,/Timing missed/);assert.equal(h.s().progress,0);
 }
}

// A larger window never accepts a wrong pitch, and restart waits for release.
for(const rhythm of [false,true]){h=fixture({rhythm,tolerance:1000});begin(h);h.advance(3000);const original=raw(h);h.on(61);assert.equal(h.s().state,'wait-release');assert.match(h.wrongs[0].message,/Wrong note/);h.advance(1000);assert.equal(h.s().state,'wait-release');h.off(61);assert.equal(h.s().state,'countin');assert.equal(raw(h),original);}

// Notes-only singles have no onset deadline. Chords still have a finite grace.
h=fixture({rhythm:false,tolerance:80});begin(h);h.advance(15000);assert.equal(h.s().state,'practice');h.on(60);assert.equal(h.s().state,'complete');
const chord=[{note:60,start:1000,duration:100},{note:64,start:1070,duration:100}];
for(const config of [{tolerance:80,sourceBpm:120,playBpm:120},{tolerance:400,sourceBpm:120,playBpm:120},{tolerance:80,sourceBpm:300,playBpm:30}]){
 const grace=Math.max(180,config.tolerance,80*config.sourceBpm/config.playBpm);
 h=fixture({rhythm:false,...config},chord);begin(h);h.on(60);h.advance(grace-1);h.on(64);assert.equal(h.s().state,'complete');assert.equal(h.wrongs.length,0);
 h=fixture({rhythm:false,...config},chord);begin(h);h.on(60);h.advance(grace);assert.equal(h.s().state,'wait-release');assert.match(h.wrongs[0].message,/chord notes together/);h.off(60);assert.equal(h.s().state,'countin');
}

// Chord group-end (last rolled onset), not just group-start, extends rhythm bounds.
h=fixture({tolerance:200},chord);begin(h);h.advance(1200);h.on(60);h.advance(70);h.on(64);assert.equal(h.s().state,'complete');assert.equal(h.wrongs.length,0);

// Stored defaults/custom tolerances and rhythm survive reload without note edits.
for(const tolerance of [80,200,333,1000]){h=fixture({rhythm:true,tolerance,sectionStart:500,sectionEnd:4500,playBpm:240});const original=raw(h),loaded=setup(h.storage);assert.equal(loaded.s().options.tolerance,tolerance);assert.equal(loaded.s().options.rhythm,true);assert.equal(loaded.s().options.sectionStart,500);assert.equal(loaded.s().options.playBpm,240);assert.equal(raw(loaded),original);}

// Known limitations, not claims of fixes:
// - First-note early forgiveness does not extend into the four-beat count-in.
//   A key held across its end requests release/restart; pre-start events cannot answer.
// - lateGuard runs on dispatch time. An in-window MIDI timestamp delivered after
//   the deadline callback already restarted practice cannot recover the old attempt.
// - Chords also have a first-key grace deadline, so two keys can each fall inside
//   the +/- onset window yet be too far apart to complete the chord.
console.log('PASS: Phrase forgiveness validation/default/persistence; inclusive tempo/section rhythm boundaries; late timeout; wrong-pitch protection; notes-only/chord grace. Simulated clock and MIDI only; count-in/dispatch limitations documented.');
