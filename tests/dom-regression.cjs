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
win.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.activateMode=activateMode; window.renderPiano=renderPiano; window.testState = () => ({targetMidi,chordAnswer,activeMode,builderStep,builderTargets:[...builderTargets],builderNotes:[...builderNotes],semitoneAnswer,deadline,countdown,builderPhase,dictionaryVoicing:[...dictionaryVoicing],dictionaryTimedOut,selected:[...selected]});');
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
  assert.equal(state().targetMidi,target,`${mode} wrong keeps target`);
  assert.equal(next.hidden,true,`${mode} immediate retry has no next button`);
  const answer=mode==='degrees'?[...win.document.querySelectorAll('.key')].map(k=>+k.dataset.midi).find(m=>m%12===state().chordAnswer):state().targetMidi;
  press(answer);assert(key(answer).classList.contains('selected'),`${mode} correct green`);
}
// Immediate wrong→wrong→correct retries preserve prompts, deadlines and builder phase.
for(const mode of ['find','semitones','degrees','remember','builder']){
 setTimed(true);win.activateMode(mode);if(mode==='remember')advance(1800);
 const before=state(),prompt=win.document.getElementById('trainingPrompt').textContent;
 const wrongs=[...win.document.querySelectorAll('.key')].map(k=>+k.dataset.midi).filter(m=>m%12!==(mode==='degrees'?before.chordAnswer:before.targetMidi%12));
 advance(500);press(wrongs[0]);advance(100);press(wrongs[0]);press(wrongs[1]);
 assert.equal(state().targetMidi,before.targetMidi,mode+' retains target');assert.equal(state().chordAnswer,before.chordAnswer);
 assert.equal(state().deadline,before.deadline,mode+' wrong does not reset deadline');assert.equal(state().countdown,before.countdown,mode+' wrong does not stop/restart timer');
 assert.equal(win.document.getElementById('trainingPrompt').textContent,prompt,mode+' prompt unchanged');assert.equal(next.hidden,true);
 if(mode==='builder'){assert.equal(state().builderPhase,'question');assert.equal(state().builderStep,before.builderStep);assert.deepEqual(state().builderNotes,before.builderNotes);}
 advance(850);assert(key(wrongs[0]).classList.contains('wrongAnswer'),mode+' original timer cannot clear newer flash');advance(100);assert(!key(wrongs[0]).classList.contains('wrongAnswer'));assert(!key(wrongs[1]).classList.contains('wrongAnswer'));
 const answer=mode==='degrees'?[...win.document.querySelectorAll('.key')].map(k=>+k.dataset.midi).find(m=>m%12===state().chordAnswer):state().targetMidi;
 press(answer);assert(key(answer).classList.contains('selected'));assert.equal(state().countdown,null);
 setTimed(false);
}
// Wrong feedback can fade after success without touching its new correct selection.
win.activateMode('find');const retryTarget=state().targetMidi;const retryWrong=48+(retryTarget+1)%12;press(retryWrong);press(retryTarget);advance(1000);assert(key(retryTarget).classList.contains('selected'));
// Toggle timer after an error leaves an immediately answerable question.
win.activateMode('builder');const toggleTarget=state().targetMidi;press(48);setTimed(true);advance(250);press(49);assert.equal(state().targetMidi,toggleTarget);setTimed(false);advance(11000);assert.equal(state().targetMidi,toggleTarget);press(toggleTarget);assert.equal(state().builderPhase,'answered');
// Errors must not defer the original deadline or bypass the timeout gate.
setTimed(true);win.activateMode('builder');const timeoutTarget=state().targetMidi,originalDeadline=state().deadline;advance(9000);press(48);assert.equal(state().deadline,originalDeadline);advance(1000);assert.equal(state().targetMidi,null);assert.match(win.document.getElementById('trainingPrompt').textContent,/Time is up/);press(timeoutTarget);assert.equal(state().builderNotes.length,1);advance(1800);assert.equal(state().targetMidi,timeoutTarget);setTimed(false);
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
 const target=state().targetMidi;press(target===48?49:48);
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
win.activateMode('builder');const wrong=state().targetMidi===48?49:48;press(wrong);const old=key(wrong);
const answer=state().targetMidi;press(answer);old.dispatchEvent(new win.Event('animationend'));assert(key(answer).classList.contains('selected'));
win.activateMode('free');press(48);press(52);assert.equal(win.document.querySelectorAll('.key.selected').length,2);press(48);assert.equal(win.document.querySelectorAll('.key.selected').length,1);
win.activateMode('dictionary');assert.equal(win.document.querySelectorAll('.key.chordTone').length,3);
win.document.getElementById('toggleChordNotes').click();[48,52,55].forEach(press);win.document.getElementById('checkChordAnswer').click();assert.match(win.document.getElementById('trainingPrompt').textContent,/Correct/);
// Dictionary retry is per physical inversion: wrong notes never enter the selection.
const check=win.document.getElementById('checkChordAnswer'),toggle=win.document.getElementById('toggleChordNotes');
const change=(id,value)=>{const node=win.document.getElementById(id);node.value=value;node.dispatchEvent(new win.Event('change'));};
for(const [inversion,expected] of [[0,[48,52,55]],[1,[52,55,60]],[2,[55,60,64]]]){
 win.activateMode('dictionary');change('dictionaryRoot','0');change('dictionaryQuality','major');change('dictionaryInversion',String(inversion));
 assert.deepEqual(Array.from(state().dictionaryVoicing),expected);toggle.click();setTimed(true);const deadline=state().deadline,countdown=state().countdown;
 press(expected[0]);const wrong=[...win.document.querySelectorAll('.key')].map(k=>+k.dataset.midi).find(m=>!expected.includes(m));
 advance(300);press(wrong);press(wrong);assert(key(wrong).classList.contains('wrongAnswer'));assert(!key(wrong).classList.contains('selected'));assert.deepEqual(Array.from(state().selected),[expected[0]]);
 check.click();assert.equal(check.disabled,false);assert.equal(state().deadline,deadline);assert.equal(state().countdown,countdown);assert.deepEqual(Array.from(state().selected),[expected[0]]);
 // Repeated premature Check also keeps the same clock and previous correct notes.
 advance(250);check.click();assert.equal(state().deadline,deadline);assert.equal(check.disabled,false);
 expected.slice(1).forEach(press);check.click();assert.equal(check.disabled,true);assert.match(win.document.getElementById('trainingPrompt').textContent,/Correct/);assert.equal(state().countdown,null);
 press(expected[0]);press(wrong);assert.equal(check.disabled,true);assert.deepEqual(Array.from(state().selected).sort((a,b)=>a-b),expected);
 advance(1100);assert(!key(wrong).classList.contains('wrongAnswer'));assert(key(expected[0]).classList.contains('selected'));
 setTimed(false);toggle.click();toggle.click();assert.equal(check.disabled,false);assert.equal(state().selected.length,0);
}
// Dictionary incomplete/error attempts cannot postpone timeout; timed new practice resets cleanly.
setTimed(true);win.activateMode('dictionary');toggle.click();const dictDeadline=state().deadline;advance(9000);press(49);check.click();assert.equal(state().deadline,dictDeadline);advance(1000);assert.equal(state().dictionaryTimedOut,true);assert.equal(check.disabled,true);press(48);assert.equal(state().selected.length,0);advance(1800);assert.equal(state().dictionaryTimedOut,false);assert.equal(check.disabled,false);setTimed(false);
// Mode changes remove dictionary red feedback and can't affect free exploration.
press(49);win.activateMode('free');press(49);advance(1000);assert(key(49).classList.contains('selected'));assert(!key(49).classList.contains('wrongAnswer'));
console.log('PASS: five immediate-retry answer modes; wrong→wrong→correct; unchanged prompts/phase/deadline; red wrong/green correct; repeated errors; five complete untimed chords; timed completion/restart/toggle; timeout retry; navigation cancellation; stale animation; Free Play and exact dictionary inversions, incomplete-check retry, success lock, timeout retry. CSS animation timing requires browser QA.');
win.close();
