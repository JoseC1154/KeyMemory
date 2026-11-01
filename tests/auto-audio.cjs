// Deterministic automatic progression and contextual audio; not audible/device QA.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function setup(){
 const w=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{runScripts:'outside-only',url:'https://keymemory.test/'}).window,d=w.document;
 w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}};
 let now=0,id=0;const timers=new Map(),resumes=[],frequencies=[],envelopes=[],oscillators=[];
 w.Date.now=()=>now;w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};w.clearInterval=id=>timers.delete(id);
 function advance(ms){const end=now+ms;for(;;){const t=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!t)break;const [k,v]=t;now=v.time;if(v.repeat)v.time+=v.repeat;else timers.delete(k);v.fn();}now=end;}
 w.AudioContext=class{get currentTime(){return now/1000;}destination={};resume(){return new Promise((resolve,reject)=>resumes.push({resolve,reject}));}createOscillator(){const o={frequency:{set value(v){frequencies.push(v);}},stops:[],connect(){},disconnect(){},start(){},stop(t){this.stops.push(t);}};oscillators.push(o);return o;}createGain(){const events=[];envelopes.push(events);return{gain:{setValueAtTime(v,t){events.push(['set',v,t]);},linearRampToValueAtTime(v,t){events.push(['ramp',v,t]);},cancelAndHoldAtTime(){}},connect(){},disconnect(){}};}};
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.test={get:()=>({mode:activeMode,target:targetMidi,phase:builderPhase,step:builderStep,notes:[...builderNotes],selected:[...selected],hear:currentHearNotes(),pending:pendingAdvance,deadline,countdown,chordAnswer,semitoneStart,reference:[...referenceNotes],voicing:[...dictionaryVoicing],dictionaryPractice,lesson:builderLesson}),mode:activateMode,lessons:ALL_BUILDER_LESSONS,start:id=>{activateMode("builder");cancelChallenge();builderLesson=ALL_BUILDER_LESSONS.find(l=>l.id===id);builderRoot=48;builderTargets=builderLesson.intervals.map(i=>48+i);builderNotes=[48];builderStep=1;builderAdvancePending=false;builderQuestion();}};');
 const api=w.test,get=()=>api.get(),el=id=>d.getElementById(id),press=m=>{assert(d.querySelector(`[data-midi="${m}"]`));d.querySelector(`[data-midi="${m}"]`).click();},timed=v=>{el('timerEnabled').checked=v;el('timerEnabled').dispatchEvent(new w.Event('change'));},hear=()=>el('hearBuilder').click(),flush=()=>new Promise(r=>setImmediate(r));
 async function resolve(i=resumes.length-1){resumes[i].resolve();await flush();}async function reject(i=resumes.length-1){resumes[i].reject(Error('unavailable'));await flush();}
 return{w,d,api,get,el,press,timed,hear,advance,resolve,reject,frequencies,resumes,envelopes,oscillators,close:()=>w.close()};
}
const actualAnswer=h=>h.get().mode==='degrees'?[...h.d.querySelectorAll('.key')].map(k=>+k.dataset.midi).find(m=>m%12===h.get().chordAnswer):h.get().target;
function checkEnvelope(h,mode,noteCount,offset=0){
 const hold=mode==='builder'?5:noteCount===1?1:2,release=mode==='builder'?.35:.15;
 for(let i=offset;i<offset+noteCount;i++){
  const e=h.envelopes[i],start=e[0][2];
  assert.deepEqual(e.slice(0,4),[['set',0,start],['ramp',.12/noteCount,start+.03],['set',.12/noteCount,start+hold],['ramp',0,start+hold+release]],mode+' independent duration envelope');
  assert(Math.abs(h.oscillators[i].stops[0]-(start+hold+release+.02))<1e-8,mode+' scheduled stop');
 }
}
(async()=>{
 // All answer modes automatically continue with timer OFF. Errors never schedule advancement.
 for(const mode of ['find','remember','semitones','degrees','builder']){
  const h=setup();h.api.mode(mode);if(mode==='remember')h.advance(1800);const target=h.get().target,prompt=h.el('trainingPrompt').textContent;
  const wrong=[...h.d.querySelectorAll('.key')].map(k=>+k.dataset.midi).find(m=>m%12!==(mode==='degrees'?h.get().chordAnswer:target%12));
  h.press(wrong);h.advance(12000);assert.equal(h.get().target,target);assert.equal(h.get().pending,null);assert.equal(h.el('trainingPrompt').textContent,prompt);
  h.press(actualAnswer(h));assert.equal(h.get().pending.reason,'success');assert(h.el('nextChallenge').hidden);h.advance(1799);assert.equal(h.get().target,null);h.advance(1);assert(h.get().target!==null);if(mode==='builder')assert.equal(h.get().step,2);h.close();
 }
 // All 34 families progress through every stage and start a new chord without ANY Next clicks.
 let combinations=0;{const h=setup();for(const lesson of h.api.lessons){h.api.start(lesson.id);for(let i=1;i<lesson.intervals.length;i++){assert.equal(h.get().target,48+lesson.intervals[i]);h.press(h.get().target);const wait=i===1?1800:4000;h.advance(wait-1);assert.equal(h.get().target,null);if(i<lesson.intervals.length-1){h.advance(1);assert(h.get().target!==null);}}assert.equal(h.get().phase,'complete');h.advance(1);assert.equal(h.get().phase,'question');combinations++;}h.close();}
 // Explicit timer toggles and inspecting settings do not cancel pending successes.
 {const h=setup();h.api.mode('find');h.press(actualAnswer(h));h.advance(500);h.timed(true);h.el('openSettings').click();h.advance(500);h.timed(false);h.el('closeSettings').click();h.advance(799);assert.equal(h.get().target,null);h.advance(1);assert(h.get().target!==null);h.close();}
 // Dictionary completion auto-detects exactly one set, locks duplicate clicks, retries same chosen chord.
 {const h=setup();h.api.mode('dictionary');h.el('dictionaryInversion').value='1';h.el('dictionaryInversion').dispatchEvent(new h.w.Event('change'));const voicing=Array.from(h.get().voicing);assert.deepEqual(voicing,[52,55,60]);h.el('toggleChordNotes').click();assert(h.el('checkChordAnswer').hidden);h.press(49);h.advance(2000);assert.equal(h.get().pending,null);h.press(52);h.press(55);assert.equal(h.get().pending,null);h.press(60);assert(h.el('checkChordAnswer').disabled);assert.match(h.el('trainingPrompt').textContent,/Correct/);h.advance(500);h.press(60);h.el('checkChordAnswer').click();h.advance(1299);assert.equal(h.get().selected.length,3);h.advance(1);assert.equal(h.get().selected.length,0);assert.deepEqual(Array.from(h.get().voicing),voicing);assert.equal(h.get().dictionaryPractice,true);assert(!h.el('checkChordAnswer').disabled);h.close();}
 // Contextual Hear notes/labels across all seven modes and before/after selections.
 for(const mode of ['free','find','remember','semitones','degrees','builder','dictionary']){
  const h=setup();h.api.mode(mode);assert.equal(h.el('hearBuilder').hidden,false);let notes;
  if(mode==='free'){assert(h.el('hearBuilder').disabled);h.hear();assert.equal(h.resumes.length,0);h.press(48);h.press(55);notes=[48,55];}
  else if(mode==='find'||mode==='remember'){notes=[h.get().target];assert.match(h.el('hearBuilder').getAttribute('aria-label'),/audio hint/);}
  else if(mode==='semitones'){notes=[h.get().semitoneStart];assert.match(h.el('hearBuilder').getAttribute('aria-label'),/starting note/);}
  else if(mode==='degrees'){notes=Array.from(h.get().reference);assert(notes.length>=3);assert.match(h.el('hearBuilder').getAttribute('aria-label'),/reference chord/);}
  else if(mode==='builder')notes=Array.from(h.get().notes);
  else notes=Array.from(h.get().voicing);
  assert.deepEqual(Array.from(h.get().hear),notes);h.hear();await h.resolve();assert.deepEqual(h.frequencies,notes.map(m=>440*2**((m-69)/12)));checkEnvelope(h,mode,notes.length);
  if(mode==='dictionary'){h.el('toggleChordNotes').click();assert(h.el('hearBuilder').disabled);h.press(h.get().voicing[0]);assert.match(h.el('hearBuilder').getAttribute('aria-label'),/selected notes/);assert.deepEqual(Array.from(h.get().hear),[h.get().voicing[0]]);}
  else if(mode==='free'){h.el('clearNotes').click();assert(h.el('hearBuilder').disabled);}
  else {if(mode==='remember')h.advance(1800);const correct=actualAnswer(h);h.press(correct);const expected=mode==='builder'?[...h.get().notes,correct]:[correct];assert.deepEqual(Array.from(h.get().hear),expected);const offset=h.frequencies.length;h.hear();await h.resolve();assert.deepEqual(h.frequencies.slice(offset),expected.map(m=>440*2**((m-69)/12)));checkEnvelope(h,mode,expected.length,offset);}
  h.close();
 }
 // Hear requested before a correct answer resolves after it: don't cut sound or advance early.
 {const h=setup();h.api.mode('find');const target=actualAnswer(h);h.hear();h.press(target);h.advance(6000);assert.equal(h.get().target,null);await h.resolve();assert.deepEqual(h.frequencies,[440*2**((target-69)/12)]);h.advance(1799);assert.equal(h.get().target,null);h.advance(1);assert(h.get().target!==null);h.close();}
 // Completing a builder foundation while Hear awaits resume must preserve requested playback.
 {const h=setup();h.api.start('dominant7');h.press(h.get().target);h.advance(1800);h.hear();h.press(h.get().target);assert.equal(h.get().phase,'triad');h.advance(6000);assert.equal(h.get().phase,'triad');await h.resolve();assert.equal(h.frequencies.length,2);h.advance(5499);assert.equal(h.get().phase,'triad');h.advance(1);assert.equal(h.get().phase,'question');h.close();}
 // Pending rejection resumes ordinary success flow; old resumed work cannot corrupt a newer mode.
 {const h=setup();h.api.mode('semitones');h.hear();h.press(actualAnswer(h));h.advance(3000);await h.reject();h.advance(1799);assert.equal(h.get().target,null);h.advance(1);assert(h.get().target!==null);h.close();}
 {const h=setup();h.api.mode('find');h.hear();h.api.mode('free');h.press(52);h.hear();await h.resolve(1);await h.resolve(0);assert.deepEqual(h.frequencies,[440*2**((52-69)/12)]);assert.equal(h.get().mode,'free');h.close();}
 // Dictionary can finish while a partial-selection Hear is pending, without cutting it off.
 {const h=setup();h.api.mode('dictionary');h.el('toggleChordNotes').click();h.press(48);h.hear();h.press(52);h.press(55);assert(h.el('checkChordAnswer').disabled);h.advance(5000);assert.equal(h.get().selected.length,3);await h.resolve();assert.deepEqual(h.frequencies,[440*2**((48-69)/12)]);h.advance(1799);assert.equal(h.get().selected.length,3);h.advance(1);assert.equal(h.get().selected.length,0);h.close();}
 // Non-builder group sound has a two-second hold + .15 release + .15 scheduling margin.
 {const h=setup();h.api.mode('dictionary');h.el('toggleChordNotes').click();[48,52,55].forEach(h.press);h.hear();await h.resolve();checkEnvelope(h,'dictionary',3);h.advance(2299);assert.equal(h.get().selected.length,3);h.advance(1);assert.equal(h.get().selected.length,0);h.close();}
 {const h=setup();h.api.mode('degrees');h.hear();h.press(actualAnswer(h));await h.resolve();checkEnvelope(h,'degrees',3);h.advance(2299);assert.equal(h.get().target,null);h.advance(1);assert(h.get().target!==null);h.close();}
 // Free Play single selections also use a short one-second hold, not builder sustain.
 {const h=setup();h.api.mode('free');h.press(52);h.hear();await h.resolve();checkEnvelope(h,'free',1);h.close();}
 // Timeout during pending playback waits for audio; disabling timeout progression cancels only timeout.
 {const h=setup();h.api.mode('find');h.timed(true);h.advance(9000);const deadline=h.get().deadline;h.hear();h.advance(1000);assert.equal(h.get().deadline,deadline);assert.equal(h.get().pending.reason,'timeout');await h.resolve();h.advance(1799);assert.equal(h.get().target,null);h.advance(1);assert(h.get().target!==null);h.close();}
 {const h=setup();h.api.mode('find');h.timed(true);h.advance(10000);assert.equal(h.get().target,null);h.timed(false);h.advance(5000);assert.equal(h.get().target,null);h.close();}
 console.log(`PASS: untimed automatic success in5 modes; all${combinations} families automatic with no Next; dictionary exact-set autodetect/duplicate lock/same-chord restart; contextual Hear7modes; independent1s single/2s group/5s builder envelopes and1.8/2.3/5.5s progression; empty/selected/reference/lastcorrect frequencies; settings/timer preservation; resume/success/timeout/navigation races. Fake audio/clock only.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
