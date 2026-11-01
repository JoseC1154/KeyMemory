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
win.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.activateMode=activateMode; window.renderPiano=renderPiano; window.testState = () => ({targetMidi,chordAnswer,activeMode,builderStep,builderTargets:[...builderTargets],builderNotes:[...builderNotes],semitoneAnswer});');
const level=win.document.getElementById('builderLevel');level.value='sevenths';
const state=()=>win.testState();
const key=m=>win.document.querySelector(`[data-midi="${m}"]`);
const press=m=>key(m).click();
const next=win.document.getElementById('nextChallenge');
const timer=win.document.getElementById('timerEnabled');
const setTimed=value=>{timer.checked=value;timer.dispatchEvent(new win.Event('change'));};
for(const mode of ['find','semitones','degrees','remember','builder']){
  win.activateMode(mode);if(mode==='remember')advance(1800);
  const target=state().targetMidi;
  const wrong=[...win.document.querySelectorAll('.key')].map(k=>+k.dataset.midi).find(m=>m%12!==(mode==='degrees'?state().chordAnswer:target%12));
  press(wrong);
  assert(key(wrong).classList.contains('wrongAnswer'),`${mode} wrong is red`);
  assert(!key(wrong).classList.contains('selected'),`${mode} wrong is not green`);
  assert.equal(key(wrong).getAttribute('aria-pressed'),'false');
  advance(300);win.renderPiano();assert(key(wrong).classList.contains('wrongAnswer'),`${mode} red survives resize`);
  advance(650);assert(!key(wrong).classList.contains('wrongAnswer'));
  next.click();if(mode==='remember')advance(1800);
  const answer=mode==='degrees'?[...win.document.querySelectorAll('.key')].map(k=>+k.dataset.midi).find(m=>m%12===state().chordAnswer):state().targetMidi;
  press(answer);assert(key(answer).classList.contains('selected'),`${mode} correct green`);
}
// Both white and black keys use the same red overlay, without green selection.
for(const midi of [48,49]) {
  win.activateMode('builder');
  if(state().targetMidi===midi) { win.activateMode('builder'); }
  // Builder targets are above the root; 48 and 49 cannot be third/fifth/seventh.
  press(midi);assert(key(midi).classList.contains('wrongAnswer'));assert(!key(midi).classList.contains('selected'));
}
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
assert.match(css,/\.key\.wrongAnswer::after/);
assert.match(css,/wrongKeyFade 950ms linear forwards/);
assert.match(css,/52\.63% \{ opacity: \.85;/);
win.activateMode('builder');
// Repeated wrong answers retry the same step without adding notes.
for(let attempt=0;attempt<3;attempt++){
 const target=state().targetMidi;press(target===48?49:48);next.click();
 assert.equal(state().builderStep,1);assert.equal(state().targetMidi,target);assert.equal(state().builderNotes.length,1);
}
for(let chord=0;chord<5;chord++){
 for(let step=1;step<=3;step++){press(state().targetMidi);if(step<3)next.click();}
 assert.equal(state().builderStep,4);assert.match(win.document.getElementById('trainingPrompt').textContent,/Completed/);assert.equal(next.hidden,false);assert.equal(next.textContent,'Build another chord');
 assert.equal(win.document.querySelectorAll('.key.chordTone').length,4);
 next.click();assert.equal(state().builderStep,1);assert.notEqual(state().targetMidi,null);
}
setTimed(true);
for(let step=1;step<=3;step++){press(state().targetMidi);advance(step===2?4000:1800);}
assert.equal(state().builderStep,4);assert.equal(next.hidden,false);
advance(4000);assert.equal(state().builderStep,1);
for(let step=1;step<=3;step++){press(state().targetMidi);advance(step===2?4000:1800);}
setTimed(false);assert.equal(next.hidden,false);next.click();assert.equal(state().builderStep,1);
advance(3000);assert.equal(state().builderStep,1);
// Timeout retries and navigation cancel any pending auto-advance.
setTimed(true);const target=state().targetMidi;advance(10000+1800);assert.equal(state().targetMidi,target);
press(state().targetMidi);win.activateMode('find');advance(1800);assert.equal(state().activeMode,'find');
setTimed(false);
// Old animation completion only affects its old node, not a new selection.
win.activateMode('builder');const wrong=state().targetMidi===48?49:48;press(wrong);const old=key(wrong);next.click();
const answer=state().targetMidi;press(answer);old.dispatchEvent(new win.Event('animationend'));assert(key(answer).classList.contains('selected'));
win.activateMode('free');press(48);press(52);assert.equal(win.document.querySelectorAll('.key.selected').length,2);press(48);assert.equal(win.document.querySelectorAll('.key.selected').length,1);
win.activateMode('dictionary');assert.equal(win.document.querySelectorAll('.key.chordTone').length,3);
win.document.getElementById('toggleChordNotes').click();[48,52,55].forEach(press);win.document.getElementById('checkChordAnswer').click();assert.match(win.document.getElementById('trainingPrompt').textContent,/Correct/);
console.log('PASS: five answer modes; red wrong/green correct; repeated errors; five complete untimed chords; timed completion/restart/toggle; timeout retry; navigation cancellation; stale animation; Free Play and dictionary. CSS animation timing requires browser QA.');
win.close();
