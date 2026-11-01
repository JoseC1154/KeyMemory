// Run: node tests/dom-regression.cjs (requires jsdom).
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'), {runScripts:'outside-only'});
const win = dom.window;
win.matchMedia = ()=>({matches:false});
win.ResizeObserver = class {observe(){}};
let now=0, id=0;
const timers=new Map();
win.Date.now=()=>now;
win.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};
win.clearTimeout=id=>timers.delete(id);
win.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};
win.clearInterval=id=>timers.delete(id);
function advance(ms){const end=now+ms;for(;;){const pending=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!pending)break;const [key,timer]=pending;now=timer.time;if(timer.repeat)timer.time+=timer.repeat;else timers.delete(key);timer.fn();}now=end;}
win.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.activateMode=activateMode; window.renderPiano=renderPiano; window.builderApi={get:()=>({targetMidi,builderPhase,builderStep,builderLesson,builderRoot,notes:[...builderNotes],targets:[...builderTargets],spellings:builderTargets.map((_,i)=>builderSpelling(i)),label:builderName()}),lessons:[...TRIAD_LESSONS,...SEVENTH_LESSONS],start:(id,root)=>{cancelChallenge();activeMode="builder";builderLesson=[...TRIAD_LESSONS,...SEVENTH_LESSONS].find(l=>l.id===id);builderRoot=root;builderTargets=builderLesson.intervals.map(i=>root+i);builderNotes=[root];builderStep=1;builderAdvancePending=false;builderQuestion();}};');
const api=win.builderApi;
const get=()=>api.get();
const key=m=>win.document.querySelector(`[data-midi="${m}"]`);
const press=m=>{assert(key(m),`target ${m} is visible`);key(m).click();};
const next=win.document.getElementById('nextChallenge');
const prompt=()=>win.document.getElementById('trainingPrompt').textContent;
const timer=win.document.getElementById('timerEnabled');
const setTimed=value=>{timer.checked=value;timer.dispatchEvent(new win.Event('change'));};
const expected={major:[0,4,7],minor:[0,3,7],diminished:[0,3,6],augmented:[0,4,8],dominant7:[0,4,7,10],major7:[0,4,7,11],minor7:[0,3,7,10],minorMajor7:[0,3,7,11],halfDiminished7:[0,3,6,10],diminished7:[0,3,6,9],augmented7:[0,4,8,10],augmentedMajor7:[0,4,8,11]};
const naturals={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const letters=['C','D','E','F','G','A','B'];
let count=0;
for(const [id,intervals] of Object.entries(expected)){
 for(let root=48;root<60;root++){
  api.start(id,root);
  assert.deepEqual(Array.from(get().targets),intervals.map(i=>root+i));
  const spellings=Array.from(get().spellings);
  const rootLetter=letters.indexOf(spellings[0][0]);
  spellings.forEach((spelling,index)=>{
   assert.equal(spelling[0],letters[(rootLetter+index*2)%7]);
   const sharp=(spelling.match(/♯/g)||[]).length, flat=(spelling.match(/♭/g)||[]).length;
   assert.equal((naturals[spelling[0]]+sharp-flat+24)%12,(root+intervals[index])%12);
  });
  press(get().targetMidi);next.click();
  assert.match(prompt(),/Building .* triad: add the/);
  assert.equal(get().builderStep,2);
  assert.equal(win.document.querySelectorAll('.key.chordTone').length,2);
  // Wrong physical octave is rejected even when its note name matches.
  const otherOctave=get().targetMidi+12;
  if(key(otherOctave)){press(otherOctave);assert(key(otherOctave).classList.contains('wrongAnswer'));next.click();}
  press(get().targetMidi);
  assert.equal(get().notes.length,3);
  if(intervals.length===4){
   assert.equal(get().builderPhase,'triad');assert.match(prompt(),/You built .*triad. Next: add/);
   assert.equal(next.textContent,'Add the seventh');assert.equal(get().targetMidi,null);
   assert.equal(win.document.querySelectorAll('.key.chordTone').length,3);
   next.click();assert.equal(get().builderPhase,'question');assert.match(prompt(),/Extend .* triad: add the/);
   assert.equal(get().targetMidi,root+intervals[3]);
   press(get().targetMidi);
  }
  assert.equal(get().builderPhase,'complete');assert.match(prompt(),/Completed/);
  assert.equal(win.document.querySelectorAll('.key.chordTone').length,intervals.length);
  assert.equal(next.textContent,'Build another chord');assert.equal(next.hidden,false);
  count++;
 }
}
api.start('diminished7',48);press(get().targetMidi);next.click();press(get().targetMidi);next.click();press(get().targetMidi);
assert.match(win.document.getElementById('builderHint').textContent,/B♭♭ \(A key\)/);
api.start('minor7',48);assert(!get().label.includes('dominant'));
api.start('minorMajor7',48);assert.match(get().label,/minor-major/);
// Timed sequence stops at the triad milestone long enough to read before extension.
api.start('major7',48);setTimed(true);press(get().targetMidi);advance(1800);press(get().targetMidi);
assert.equal(get().builderPhase,'triad');advance(3999);assert.equal(get().builderPhase,'triad');advance(1);assert.equal(get().targetMidi,59);
press(59);assert.equal(get().builderPhase,'complete');advance(4000);assert.equal(get().builderPhase,'question');
// Timer changes at milestones do not strand the learner.
setTimed(false);api.start('dominant7',48);press(get().targetMidi);next.click();press(get().targetMidi);setTimed(true);advance(4000);assert.equal(get().targetMidi,58);press(58);setTimed(false);advance(5000);assert.equal(get().builderPhase,'complete');next.click();assert.equal(get().builderPhase,'question');
// Changing practice level or mode cancels old milestone callbacks.
api.start('dominant7',48);setTimed(true);press(get().targetMidi);advance(1800);press(get().targetMidi);
const level=win.document.getElementById('builderLevel');level.value='triads';level.dispatchEvent(new win.Event('change'));assert.equal(get().targets.length,3);const saved=get().targets.join();advance(4000);assert.equal(get().targets.join(),saved);
win.activateMode('free');advance(20000);assert.equal(win.document.getElementById('activeModeName').textContent,'Free Play');setTimed(false);
// Shuffled decks cover the selected families, with no immediate identical type/root.
for(const [value,total] of [['triads',4],['sevenths',8],['mixed',12]]){
 win.activateMode('builder');level.value=value;level.dispatchEvent(new win.Event('change'));
 let previous=null;const types=new Set();
 for(let i=0;i<total;i++){
  const before=get();types.add(before.builderLesson.id);
  if(previous){assert.notEqual(before.builderLesson.id,previous.id);assert.notEqual(before.builderRoot,previous.root);}
  previous={id:before.builderLesson.id,root:before.builderRoot};
  while(get().builderPhase!=='complete'){
   if(get().targetMidi!==null)press(get().targetMidi);else next.click();
  }
  next.click();
 }
 assert.equal(types.size,total);
}
// User-initiated audio plays only actual completed MIDI notes, not duplicate octaves.
const frequencies=[];
win.AudioContext=class {currentTime=0;destination={};resume(){return Promise.resolve();}createOscillator(){return {frequency:{set value(v){frequencies.push(v);}},connect(){},disconnect(){},start(){},stop(){}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}};
(async()=>{
 api.start('dominant7',48);press(get().targetMidi);next.click();press(get().targetMidi);
 assert.equal(frequencies.length,0);win.document.getElementById('hearBuilder').click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(frequencies.length,3);[48,52,55].forEach((m,i)=>assert.equal(frequencies[i],440*2**((m-69)/12)));
 next.click();press(get().targetMidi);win.document.getElementById('hearBuilder').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(frequencies.length,7);
 console.log(`PASS: ${count} family/root combinations; theory spelling/pitch equivalence; exact-octave highlighting; triad/seventh milestones; 4-second timed flow; level/mode interruption; shuffled coverage; user-initiated 3/4-note audio.`);
 win.close();
})().catch(error=>{console.error(error);win.close();process.exitCode=1;});
