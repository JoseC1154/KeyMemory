// Run: node tests/builder-lessons.cjs (requires jsdom).
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const storageKey='keymemory.builder.preferences.v1';
function setup(saved) {
 const dom=new JSDOM(html,{pretendToBeVisual:true,runScripts:'outside-only',url:'https://keymemory.test/'}),win=dom.window;
 if(saved!==undefined)win.localStorage.setItem(storageKey,saved);
 win.matchMedia=()=>({matches:false});win.ResizeObserver=class {observe(){}};
 let now=0,id=0;const timers=new Map();
 win.Date.now=()=>now;win.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};win.clearTimeout=id=>timers.delete(id);
 win.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};win.clearInterval=id=>timers.delete(id);
 function advance(ms){const end=now+ms;for(;;){const pending=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!pending)break;const [key,timer]=pending;now=timer.time;if(timer.repeat)timer.time+=timer.repeat;else timers.delete(key);timer.fn();}now=end;}
 win.eval(source+'\nwindow.activateMode=activateMode;window.builderApi={audioFixture:()=>{updateHearControl();unlockMidiAudio=()=>{};soundMidiNote=()=>{};},get:()=>({targetMidi,builderPhase,builderStep,builderLesson,builderRoot,notes:[...builderNotes],targets:[...builderTargets],spellings:builderTargets.map((_,i)=>builderSpelling(i)),label:builderLesson?builderName():null}),lessons:ALL_BUILDER_LESSONS,start:(id,root)=>{cancelChallenge();activeMode="builder";builderLesson=ALL_BUILDER_LESSONS.find(l=>l.id===id);builderRoot=root;builderTargets=builderLesson.intervals.map(i=>root+i);builderNotes=[root];builderStep=1;builderAdvancePending=false;builderQuestion();}};');
 const doc=win.document,api=win.builderApi,get=()=>api.get(),el=id=>doc.getElementById(id),key=m=>doc.querySelector(`[data-midi="${m}"]`);
 const press=m=>{assert(key(m),`target ${m} is visible`);key(m).click();};
 const change=(id,value)=>{el(id).value=value;el(id).dispatchEvent(new win.Event('change'));};
 const timed=value=>{el('timerEnabled').checked=value;el('timerEnabled').dispatchEvent(new win.Event('change'));};
 const next=()=>el('nextChallenge').click();
 function complete(){let limit=30;while(get().builderPhase!=='complete'&&limit--){if(get().targetMidi!==null)press(get().targetMidi);else next();}assert.equal(get().builderPhase,'complete');}
 return {dom,win,doc,api,get,el,key,press,change,timed,next,advance,complete};
}
// Independent interval/diatonic-degree expectations, not copied at runtime from the app.
const expected={
 major:[[0,4,7],[1,3,5]],minor:[[0,3,7],[1,3,5]],diminished:[[0,3,6],[1,3,5]],augmented:[[0,4,8],[1,3,5]],
 sus2:[[0,2,7],[1,2,5]],sus4:[[0,5,7],[1,4,5]],add9:[[0,4,7,14],[1,3,5,9]],minorAdd9:[[0,3,7,14],[1,3,5,9]],major6:[[0,4,7,9],[1,3,5,6]],minor6:[[0,3,7,9],[1,3,5,6]],sixNine:[[0,4,7,9,14],[1,3,5,6,9]],
 dominant7:[[0,4,7,10],[1,3,5,7]],major7:[[0,4,7,11],[1,3,5,7]],minor7:[[0,3,7,10],[1,3,5,7]],minorMajor7:[[0,3,7,11],[1,3,5,7]],halfDiminished7:[[0,3,6,10],[1,3,5,7]],diminished7:[[0,3,6,9],[1,3,5,7]],augmented7:[[0,4,8,10],[1,3,5,7]],augmentedMajor7:[[0,4,8,11],[1,3,5,7]],
 dominant9:[[0,4,7,10,14],[1,3,5,7,9]],dominant11:[[0,4,7,10,14,17],[1,3,5,7,9,11]],dominant13:[[0,4,7,10,14,17,21],[1,3,5,7,9,11,13]],
 major9:[[0,4,7,11,14],[1,3,5,7,9]],major11:[[0,4,7,11,14,17],[1,3,5,7,9,11]],major13:[[0,4,7,11,14,17,21],[1,3,5,7,9,11,13]],
 minor9:[[0,3,7,10,14],[1,3,5,7,9]],minor11:[[0,3,7,10,14,17],[1,3,5,7,9,11]],minor13:[[0,3,7,10,14,17,21],[1,3,5,7,9,11,13]],
 dominant7b5:[[0,4,6,10],[1,3,5,7]],dominant7sharp5:[[0,4,8,10],[1,3,5,7]],dominant7b9:[[0,4,7,10,13],[1,3,5,7,9]],dominant7sharp9:[[0,4,7,10,15],[1,3,5,7,9]],dominant7sharp11:[[0,4,7,10,18],[1,3,5,7,11]],dominant7b13:[[0,4,7,10,20],[1,3,5,7,13]]
};
const h=setup(),{win,doc,api,get,el,key,press,change,timed,next,advance,complete}=h;
assert.deepEqual(Array.from(api.lessons,l=>l.id).sort(),Object.keys(expected).sort());
const naturals={C:0,D:2,E:4,F:5,G:7,A:9,B:11},letters=['C','D','E','F','G','A','B'];
let count=0,milestones=0;
const highlights=()=>Array.from(doc.querySelectorAll('.key.chordTone'),e=>Number(e.dataset.midi)).sort((a,b)=>a-b);
for(const [id,[intervals,degrees]] of Object.entries(expected))for(let tonic=48;tonic<60;tonic++){
 api.start(id,tonic);
 assert.deepEqual(Array.from(get().targets),intervals.map(i=>tonic+i),id);
 assert.deepEqual(Array.from(get().builderLesson.degrees),degrees,id);
 const spellings=Array.from(get().spellings),rootLetter=letters.indexOf(spellings[0][0]);
 spellings.forEach((spelling,index)=>{assert.equal(spelling[0],letters[(rootLetter+degrees[index]-1)%7],id);const sharp=(spelling.match(/♯/g)||[]).length,flat=(spelling.match(/♭/g)||[]).length;assert.equal((naturals[spelling[0]]+sharp-flat+24)%12,(tonic+intervals[index])%12,id);});
 if(id==='sus2'||id==='sus4'){assert(!degrees.includes(3));assert.match(el('builderHint').textContent,/replaces the third/);assert(!get().label.includes('triad'));}
 for(let i=1;i<intervals.length;i++){
  assert.equal(get().targetMidi,tonic+intervals[i],`${id} step ${i}`);
  assert.match(el('trainingPrompt').textContent,new RegExp((intervals[i]-intervals[i-1])+' semitones? UP'));
  assert.match(el('builderHint').textContent,new RegExp('Degree '+degrees[i]+': '+intervals[i]+' semitones above the root'));
  assert.deepEqual(highlights(),intervals.slice(0,i).map(n=>tonic+n));
  const otherOctave=key(get().targetMidi+12)?get().targetMidi+12:get().targetMidi-12;
  if(key(otherOctave)){const target=get().targetMidi;press(otherOctave);assert(key(otherOctave).classList.contains('wrongAnswer'));assert.equal(get().notes.length,i);assert.equal(get().targetMidi,target);assert.equal(get().builderPhase,'question');assert.equal(el('nextChallenge').hidden,true);}
  press(get().targetMidi);
  if(i===1){assert.equal(get().builderPhase,'answered');next();assert.match(el('trainingPrompt').textContent,/Building .*: add the/);}
  else if(i<intervals.length-1){assert.equal(get().builderPhase,'triad');assert.equal(get().targetMidi,null);assert.match(el('trainingPrompt').textContent,/You built .*Next: add the/);assert.deepEqual(highlights(),intervals.slice(0,i+1).map(n=>tonic+n));next();assert.match(el('trainingPrompt').textContent,/Extend .*: add the/);milestones++;}
 }
 assert.equal(get().builderPhase,'complete');assert.match(el('trainingPrompt').textContent,/Completed/);assert.deepEqual(highlights(),intervals.map(n=>tonic+n));assert.equal(el('nextChallenge').textContent,'Build another chord');assert.equal(el('nextChallenge').hidden,false);count++;
}
api.start('diminished7',48);complete();assert.match(el('builderHint').textContent,/B♭♭ \(A key\)/);
api.start('minor7',48);assert(!get().label.includes('dominant'));api.start('minorMajor7',48);assert.match(get().label,/minor-major/);
// Every family gets timed replay, including every extension milestone and final pause.
for(const id of Object.keys(expected)){
 api.start(id,48);timed(true);const intervals=expected[id][0];
 for(let i=1;i<intervals.length;i++){
  assert.equal(get().targetMidi,48+intervals[i]);press(get().targetMidi);
  if(i===1){advance(1799);assert.equal(get().builderPhase,'answered');advance(1);}
  else if(i<intervals.length-1){advance(3999);assert.equal(get().builderPhase,'triad');advance(1);assert.equal(get().builderPhase,'question');}
 }
 assert.equal(get().builderPhase,'complete');advance(3999);assert.equal(get().builderPhase,'complete');advance(1);assert.equal(get().builderPhase,'question');timed(false);
}
// Toggle and navigation cancel old callbacks, not just the visible prompt.
api.start('dominant13',48);press(get().targetMidi);next();press(get().targetMidi);timed(true);advance(4000);assert.equal(get().targetMidi,58);press(58);timed(false);advance(4000);assert.equal(get().builderPhase,'question');assert.equal(get().targetMidi,62);
api.start('major13',48);timed(true);press(get().targetMidi);advance(1800);press(get().targetMidi);change('builderLevel','triads');const saved=get().targets.join();advance(4000);assert.equal(get().targets.join(),saved);win.activateMode('free');advance(20000);assert.equal(el('activeModeName').textContent,'Free Play');timed(false);
// Each random deck covers exactly its level, with no immediately repeated type/root.
const totals={triads:4,colors:7,sevenths:8,extended:9,altered:6,mixed:34};
for(const [value,total] of Object.entries(totals)){
 win.activateMode('builder');change('builderSelection','random');change('builderLevel',value);let previous=null;const types=new Set();
 for(let i=0;i<total;i++){const before=get();types.add(before.builderLesson.id);if(previous){assert.notEqual(before.builderLesson.id,previous.id);assert.notEqual(before.builderRoot,previous.root);}previous={id:before.builderLesson.id,root:before.builderRoot};complete();next();}
 assert.equal(types.size,total,value);
}
// Custom choices: clear safely, isolate one type, mix two, and select all per level.
let persistence;
for(const [value,total] of Object.entries(totals)){
 change('builderLevel',value);change('builderSelection','custom');el('builderClear').click();
 assert.equal(get().builderPhase,'empty');assert.equal(get().targetMidi,null);assert.equal(get().notes.length,0);assert.equal(el('nextChallenge').hidden,true);assert.equal(el('hearBuilder').hidden,false);assert.equal(el('hearBuilder').disabled,true);assert.match(el('trainingPrompt').textContent,/Select at least one/);
 timed(true);advance(25000);assert.equal(get().builderPhase,'empty');assert.equal(el('nextChallenge').hidden,true);timed(false);
 const choices=Array.from(doc.querySelectorAll('#builderTypeOptions input'),e=>e.value);assert.equal(choices.length,total);
 doc.querySelector(`#builderTypeOptions input[value="${choices[0]}"]`).click();
 for(let i=0;i<3;i++){assert.equal(get().builderLesson.id,choices[0]);const tonic=get().builderRoot;complete();next();assert.notEqual(get().builderRoot,tonic);}
 doc.querySelector(`#builderTypeOptions input[value="${choices[1]}"]`).click();let previous=null;const chosen=new Set();
 for(let i=0;i<4;i++){const id=get().builderLesson.id;assert(choices.slice(0,2).includes(id));if(previous)assert.notEqual(id,previous);chosen.add(id);previous=id;complete();next();}assert.equal(chosen.size,2);
 persistence=win.localStorage.getItem(storageKey);
 el('builderSelectAll').click();assert.equal(doc.querySelectorAll('#builderTypeOptions input:checked').length,total);
}
// Reload restores the selected level, mode and precisely the selected families.
const restored=setup(persistence);restored.win.activateMode('builder');assert.equal(restored.el('builderLevel').value,'mixed');assert.equal(restored.el('builderSelection').value,'custom');assert.equal(restored.doc.querySelectorAll('#builderTypeOptions input:checked').length,2);assert(['major','minor'].includes(restored.get().builderLesson.id));restored.win.close();
for(const invalid of ['{not json',JSON.stringify({level:'unknown',selection:'unknown',types:['no such chord']}),'null']){const test=setup(invalid);assert.equal(test.el('builderLevel').value,'triads');assert.equal(test.el('builderSelection').value,'random');test.win.activateMode('builder');assert.equal(test.get().builderPhase,'question');test.win.close();}
const emptyRestore=setup(JSON.stringify({level:'extended',selection:'custom',types:[]}));emptyRestore.win.activateMode('builder');assert.equal(emptyRestore.get().builderPhase,'empty');emptyRestore.change('builderSelection','random');assert.equal(emptyRestore.get().builderPhase,'question');emptyRestore.win.close();
// Clearing one level does not wipe choices in another. Pending feedback/answer can't leak across filters.
change('builderLevel','triads');el('builderSelectAll').click();change('builderLevel','extended');el('builderClear').click();change('builderLevel','triads');assert.equal(doc.querySelectorAll('#builderTypeOptions input:checked').length,4);
press(get().targetMidi+1);assert(doc.querySelector('.wrongAnswer'));change('builderLevel','altered');el('builderSelectAll').click();assert(!doc.querySelector('.wrongAnswer'));const target=get().targetMidi;advance(1000);assert.equal(get().targetMidi,target);
// Explicit audio uses only completed physical notes, up to a seven-note thirteenth.
// This suite isolates replay from live audition; real pointer sound has its own suite.
api.audioFixture();
const frequencies=[];
win.AudioContext=class {state="running";currentTime=0;destination={};resume(){return Promise.resolve();}createOscillator(){return {frequency:{set value(v){frequencies.push(v);}},connect(){},disconnect(){},start(){},stop(){}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}};
(async()=>{
 api.start('dominant7',48);press(get().targetMidi);next();press(get().targetMidi);assert.equal(frequencies.length,0);el('hearBuilder').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(frequencies.length,3);[48,52,55].forEach((m,i)=>assert.equal(frequencies[i],440*2**((m-69)/12)));
 next();press(get().targetMidi);el('hearBuilder').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(frequencies.length,7);
 api.start('minor13',59);complete();el('hearBuilder').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(frequencies.length,14);expected.minor13[0].forEach((n,i)=>assert.equal(frequencies[7+i],440*2**((59+n-69)/12)));
 console.log(`PASS: ${count} family/root combinations; ${milestones} intermediate milestones; independent interval/degree spelling; exact-octave answers/highlights; all families timed; 5 levels + mixed random/custom decks; empty/single/multiple/select-all/clear/persistence; interruption/red cleanup; 3/4/7-note audio.`);win.close();
})().catch(error=>{console.error(error);win.close();process.exitCode=1;});
