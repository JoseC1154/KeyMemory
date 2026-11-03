// Deterministic automatic progression and contextual audio; not audible/device QA.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function setup(){
 const w=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{pretendToBeVisual:true,runScripts:'outside-only',url:'https://keymemory.test/'}).window,d=w.document;
 w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}};
 let now=0,id=0;const timers=new Map(),resumes=[],frequencies=[],envelopes=[],oscillators=[],contexts=[],gains=[];
 w.Date.now=()=>now;w.performance.now=()=>now;w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};w.clearInterval=id=>timers.delete(id);
 function advance(ms){const end=now+ms;for(;;){const t=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!t)break;const [k,v]=t;now=v.time;if(v.repeat)v.time+=v.repeat;else timers.delete(k);v.fn();}now=end;}
 w.AudioContext=class{
  constructor(){this.state='suspended';contexts.push(this);}
  get currentTime(){return now/1000;}destination={};
  resume(){return new Promise((resolve,reject)=>resumes.push({resolve:()=>{this.state='running';resolve();},reject}));}
  createOscillator(){assert.equal(this.state,'running','resume finishes before voices are created');const o={context:this,frequency:{set value(v){frequencies.push(v);}},starts:[],stops:[],connect(gain){this.destination=gain;},disconnect(){this.disconnected=true;},start(t){this.starts.push(t);},stop(t){this.stops.push(t);}};oscillators.push(o);return o;}
  createGain(){const events=[];envelopes.push(events);const g={gain:{value:0,setValueAtTime(v,t){events.push(['set',v,t]);},linearRampToValueAtTime(v,t){events.push(['ramp',v,t]);},cancelAndHoldAtTime(t){events.push(['hold',t]);}},connect(destination){this.destination=destination;},disconnect(){this.disconnected=true;}};gains.push(g);return g;}
 };
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.test={chooseCue:()=>soundScaleChooseCue(),stopAudio:()=>stopBuilderAudio(),unlock:()=>unlockMidiAudio(),audioState:()=>({until:builderAudioUntil,request:builderAudioRequest,pending:audioResumePending,voices:builderVoices.length,cue:scaleCueVoice,reverseDeadline:scaleReverseDeadline}),get:()=>({mode:activeMode,target:targetMidi,phase:builderPhase,step:builderStep,notes:[...builderNotes],selected:[...selected],hear:currentHearNotes(),pending:pendingAdvance,deadline,countdown,chordAnswer,semitoneStart,reference:[...referenceNotes],voicing:[...dictionaryVoicing],dictionaryPractice,lesson:builderLesson,scalePhase,scaleNotes:[...scaleNotes],scaleIndex,scaleReverseIndex}),mode:activateMode,scaleDegree:startScaleDegreeTest,scaleReverse:nextScaleReverse,scaleFixture:(phase,index=2)=>{clearScaleDelay();selected.clear();scalePhase=phase;scaleIndex=index;scaleReverseIndex=index;scaleTarget=scaleNotes[index];targetMidi=["race","degrees"].includes(phase)?scaleTarget:null;if(["preview","degree-success"].includes(phase))selected.add(scaleTarget);scaleCorrection=phase==="correction"?{stage:"degrees",index,midi:scaleTarget}:null;scaleRaceDeadline=performance.now()+10000;scaleDegreeDeadline=performance.now()+3000;renderPiano();updatePracticeChrome();},lessons:ALL_BUILDER_LESSONS,start:id=>{activateMode("builder");cancelChallenge();builderLesson=ALL_BUILDER_LESSONS.find(l=>l.id===id);builderRoot=48;builderTargets=builderLesson.intervals.map(i=>48+i);builderNotes=[48];builderStep=1;builderAdvancePending=false;builderQuestion();}};');
 const api=w.test,get=()=>api.get(),el=id=>d.getElementById(id),press=m=>{assert(d.querySelector(`[data-midi="${m}"]`));d.querySelector(`[data-midi="${m}"]`).click();},timed=v=>{el('timerEnabled').checked=v;el('timerEnabled').dispatchEvent(new w.Event('change'));},hear=()=>el('hearBuilder').click(),flush=()=>new Promise(r=>setImmediate(r));
 async function resolve(i=resumes.length-1){resumes[i].resolve();await flush();}async function reject(i=resumes.length-1){resumes[i].reject(Error('unavailable'));await flush();}
 return{w,d,api,get,el,press,timed,hear,advance,resolve,reject,frequencies,resumes,envelopes,oscillators,contexts,gains,now:()=>now,close:()=>w.close()};
}
const actualAnswer=h=>h.get().mode==='degrees'?[...h.d.querySelectorAll('.key')].map(k=>+k.dataset.midi).find(m=>m%12===h.get().chordAnswer):h.get().target;
function checkEnvelope(h,mode,noteCount,offset=0){
 const hold=mode==='builder'?5:noteCount===1?1:2,release=mode==='builder'?.35:.15;
 for(let i=offset;i<offset+noteCount;i++){
  const o=h.oscillators[i],e=h.envelopes[i],start=e[0][2];
  assert.equal(o.type,'triangle',mode+' oscillator waveform');
  assert.deepEqual(o.starts,[start],mode+' oscillator really starts at envelope onset');
  assert.equal(o.destination,h.gains[i],mode+' oscillator connects to its gain');
  assert.equal(h.gains[i].destination,o.context.destination,mode+' gain connects to AudioContext output');
  assert.deepEqual(e.slice(0,4),[['set',0,start],['ramp',.12/noteCount,start+.03],['set',.12/noteCount,start+hold],['ramp',0,start+hold+release]],mode+' independent duration envelope');
  assert(Math.abs(o.stops[0]-(start+hold+release+.02))<1e-8,mode+' scheduled stop');
 }
}
function checkSpeaker(h){
 const button=h.el('hearBuilder');assert.equal(button.textContent.trim(),'','Hear has no visible text');
 assert(button.querySelector('svg[aria-hidden="true"]'),'speaker icon is decorative');assert.equal(button.querySelector('svg').getAttribute('focusable'),'false');
 assert.match(button.getAttribute('aria-label'),/Hear/,'speaker has an accessible action name');assert(button.title.trim(),'speaker has a contextual tooltip');
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
  const h=setup();h.api.mode(mode);assert.equal(h.el('hearBuilder').hidden,false);checkSpeaker(h);let notes;
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
 // All nine mode entries stay silent until an explicit sound action. Phrase has its own transport.
 for(const mode of ['free','find','remember','semitones','degrees','builder','dictionary','scale','phrase']){
  const h=setup();h.api.mode(mode);assert.equal(h.contexts.length,0,mode+' no autoplay context');assert.equal(h.resumes.length,0,mode+' no autoplay resume');assert.equal(h.oscillators.length,0,mode+' no autoplay voice');
  if(mode==='phrase'){assert(h.el('hearBuilder').hidden,'Phrase keeps dedicated playback controls');assert(!h.el('phraseActions').hidden);}
  h.close();
 }
 // Every existing Hear mode uses a real scheduled output graph and safely replaces repeated playback.
 for(const mode of ['free','find','remember','semitones','degrees','builder','dictionary']){
  const h=setup();h.api.mode(mode);if(mode==='free')h.press(48);const count=h.get().hear.length;
  h.hear();assert.equal(h.contexts.length,1,mode+' context created on click');assert.equal(h.resumes.length,1,mode+' resume invoked synchronously in click');assert.equal(h.oscillators.length,0,mode+' awaits successful resume');
  await h.resolve();checkEnvelope(h,mode,count);h.advance(250);h.hear();
  for(let i=0;i<count;i++){assert.deepEqual(h.envelopes[i].slice(-2),[['hold',.25],['ramp',0,.28]],mode+' replacement fade');assert(Math.abs(h.oscillators[i].stops.at(-1)-.29)<1e-8,mode+' replacement stops obsolete voice');}
  await h.resolve();assert.equal(h.contexts.length,1,mode+' reuses audio context');assert.equal(h.oscillators.length,count*2);checkEnvelope(h,mode,count,count);
  h.api.mode('phrase');
  for(const o of h.oscillators){assert(Math.abs(o.stops.at(-1)-.29)<1e-8,mode+' exit stops voices');o.onended();assert(o.disconnected,'ended oscillator disconnected');assert(o.destination.disconnected,'ended gain disconnected');}
  h.close();
 }
 // Stale resumes, including old failures, cannot emit or report errors after changing any Hear mode.
 for(const mode of ['free','find','remember','semitones','degrees','builder','dictionary'])for(const outcome of ['resolve','reject']){
  const h=setup();h.api.mode(mode);if(mode==='free')h.press(48);h.hear();h.api.mode('phrase');await h[outcome]();
  assert.equal(h.oscillators.length,0,mode+' cancels pending '+outcome);assert(h.el('achievement').hidden,mode+' suppresses stale error');h.close();
 }
 // Selection/reset changes cannot resurrect obsolete requested notes after delayed audio permission.
 for(const change of ['free-clear','free-select','dictionary-practice','dictionary-root','builder-next']){
  const h=setup(),mode=change.split('-')[0];h.api.mode(mode);if(mode==='free')h.press(48);h.hear();
  if(change==='free-clear')h.el('clearNotes').click();else if(change==='free-select')h.press(52);else if(change==='dictionary-practice')h.el('toggleChordNotes').click();else if(change==='dictionary-root'){h.el('dictionaryRoot').value='2';h.el('dictionaryRoot').dispatchEvent(new h.w.Event('change'));}else h.el('nextChallenge').click();
  await h.resolve();assert.equal(h.oscillators.length,0,change+' invalidates pending audio');h.close();
 }
 // A current resume failure is recoverable on the very next click, without navigation or a new context.
 {const h=setup();h.api.mode('free');h.press(52);h.hear();assert.equal(h.el('hearBuilder').getAttribute('aria-busy'),'true');await h.reject();assert.equal(h.el('hearBuilder').getAttribute('aria-busy'),'false');assert.match(h.el('achievementText').textContent,/unavailable/);assert.match(h.el('audioStatus').textContent,/unavailable/);assert(!h.el('audioStatus').hidden);assert.equal(h.oscillators.length,0);h.hear();await h.resolve();assert.equal(h.el('hearBuilder').getAttribute('aria-busy'),'false');assert(h.el('audioStatus').hidden);assert.equal(h.contexts.length,1);checkEnvelope(h,'free',1);h.close();}
 // Vendor-prefixed AudioContext still produces connected, started output when the standard name is absent.
 {const h=setup();h.w.webkitAudioContext=h.w.AudioContext;delete h.w.AudioContext;h.api.mode('free');h.press(52);h.hear();await h.resolve();checkEnvelope(h,'free',1);h.close();}
 // Missing audio support reports an error, with no phantom voices or permanently blocked practice.
 {const h=setup();delete h.w.AudioContext;h.api.mode('find');h.hear();assert.match(h.el('achievementText').textContent,/unavailable/);assert.equal(h.oscillators.length,0);h.press(actualAnswer(h));h.advance(1800);assert.notEqual(h.get().target,null);h.close();}
 // Scale playback refers to the exact displayed/requested note, never a guessed tonic or hidden reverse cue.
 for(const phase of ['preview','race','degrees','degree-success','correction','reverse-show','reverse-success','passed','ready','degree-preview','levelup','reverse-levelup','reverse-answer']){
  const h=setup();h.api.mode('scale');h.api.scaleFixture(phase,2);checkSpeaker(h);assert(!h.el('hearBuilder').hidden);
  const audible=['preview','race','degrees','degree-success','correction','reverse-show','reverse-success','passed'].includes(phase),expected=audible?[52]:[];
  assert.deepEqual(Array.from(h.get().hear),expected,phase+' exact context');assert.equal(h.el('hearBuilder').disabled,!audible,phase+' speaker availability');
  h.hear();if(audible){assert.equal(h.el('hearBuilder').getAttribute('aria-busy'),'true');await h.resolve();assert.equal(h.el('hearBuilder').getAttribute('aria-busy'),'false');assert.deepEqual(h.frequencies,[440*2**((52-69)/12)]);checkEnvelope(h,'scale',1);}else assert.equal(h.resumes.length,0,phase+' does not reveal an unavailable cue');h.close();
 }
 // A changing preview highlight must not truncate the full note captured by the explicit click.
 {const h=setup();h.api.mode('scale');assert.deepEqual(Array.from(h.get().hear),[48]);h.hear();h.advance(650);assert.deepEqual(Array.from(h.get().hear),[50]);await h.resolve();assert.deepEqual(h.frequencies,[440*2**((48-69)/12)]);checkEnvelope(h,'scale',1);h.advance(650);assert.deepEqual(Array.from(h.get().hear),[52]);assert.equal(h.oscillators[0].stops.length,1,'visual tick leaves captured note sounding');h.close();}
 // Real Scale UI transitions cancel both pending and running notes, without late sound/error leakage.
 for(const action of ['root','type','ready','race-answer','race-error','degree-answer','degree-error','degree-next','reverse-hide','reverse-next','correction-next','settings','mode'])for(const running of [false,true]){
  const h=setup();h.api.mode('scale');
  if(action.startsWith('race-')||action==='settings'){h.el('scaleStart').click();h.el('confirmScaleRun').click();}
  else if(action.startsWith('degree-')){h.api.scaleDegree();h.el('confirmScaleDegree').click();if(action==='degree-next')h.press(h.get().target);}
  else if(action.startsWith('reverse-')){h.api.scaleReverse();if(action==='reverse-next'){h.advance(2000);h.d.querySelector('[data-degree-index="'+h.get().scaleReverseIndex+'"]').click();}}
  else if(action==='correction-next'){h.el('scaleStart').click();h.el('confirmScaleRun').click();h.press(49);}
  assert(h.get().hear.length,action+' starts with a playable context');h.hear();if(running)await h.resolve();
  if(action==='root'||action==='type'){const control=h.el(action==='root'?'scaleRoot':'scaleType');control.value=action==='root'?'2':'minorPent';control.dispatchEvent(new h.w.Event('change'));}
  else if(action==='ready')h.el('scaleStart').click();
  else if(action==='race-answer'||action==='degree-answer')h.press(h.get().target);
  else if(action==='race-error'||action==='degree-error')h.press(h.get().target===48?49:48);
  else if(action==='degree-next'||action==='reverse-next')h.advance(300);
  else if(action==='reverse-hide')h.advance(2000);
  else if(action==='correction-next')h.el('continueScaleCorrection').click();
  else if(action==='settings')h.el('openSettings').click();
  else h.api.mode('phrase');
  assert.equal(h.el('hearBuilder').getAttribute('aria-busy'),'false',action+' clears pending state');
  if(running){assert.equal(h.oscillators.length,action==='reverse-hide'?2:1);assert(Math.abs(h.oscillators[0].stops.at(-1)-(h.now()/1000+.04))<1e-8,action+' stops old audio');}
  else{await h.resolve();assert.equal(h.oscillators.length,0,action+' invalidates deferred playback');}
  h.close();
 }
 // The automatic Choose cue never creates/resumes an audio context or reveals a note pitch.
 for(const state of ['missing','suspended','closed']){
  const h=setup();h.api.mode('scale');
  if(state!=='missing'){h.api.unlock();h.contexts[0].state=state;}
  const contexts=h.contexts.length,resumes=h.resumes.length;
  h.api.scaleReverse();h.advance(2000);
  assert.equal(h.get().scalePhase,'reverse-answer');assert.equal(h.api.audioState().reverseDeadline,4000);
  assert.equal(h.contexts.length,contexts,state+' no automatic context creation');assert.equal(h.resumes.length,resumes,state+' no automatic resume');assert.equal(h.oscillators.length,0,state+' silently skips cue');
  assert(h.el('audioStatus').hidden,state+' no audio error shown');h.advance(1999);assert.equal(h.get().scalePhase,'reverse-answer');h.advance(1);assert.notEqual(h.get().scalePhase,'reverse-answer');h.close();
 }
 // Explicit Start gesture unlocks MIDI audio without starting any voice.
 {const h=setup();h.api.mode('scale');h.el('scaleStart').click();assert.equal(h.contexts.length,0);h.el('confirmScaleRun').click();assert.equal(h.contexts.length,1);assert.equal(h.resumes.length,1);assert.equal(h.oscillators.length,0);await h.resolve();assert.equal(h.contexts[0].state,'running');h.close();}
 // One connected neutral sine chime, with its own envelope, at the exact Watch-to-Choose transition.
 for(const source of ['midi','builder']){
  const h=setup();h.api.mode('scale');
  if(source==='midi')h.api.unlock();else h.hear();await h.resolve();
  h.api.scaleReverse();const offset=h.oscillators.length,resumes=h.resumes.length;
  h.advance(1999);assert.equal(h.oscillators.length,offset);h.advance(1);
  assert.equal(h.get().scalePhase,'reverse-answer');assert.equal(h.api.audioState().reverseDeadline,4000);assert.equal(h.oscillators.length,offset+1);assert.equal(h.resumes.length,resumes);
  const o=h.oscillators[offset],g=h.gains[offset];assert.equal(o.type,'sine');assert.equal(h.frequencies[offset],880);assert.equal(o.context,h.contexts[0]);assert.equal(o.destination,g);assert.equal(g.destination,o.context.destination);
  assert.deepEqual(o.starts,[2]);assert.deepEqual(h.envelopes[offset],[['set',0,2],['ramp',.055,2.008],['ramp',0,2.14]]);assert.deepEqual(o.stops,[2.16]);
  assert.equal(h.api.audioState().until,0,'cue cannot extend Hear deadline');assert.equal(h.api.audioState().pending,false);assert.equal(h.api.audioState().voices,0,'cue is separate from Hear voices');assert(h.el('hearBuilder').disabled,'hidden pitch stays unavailable');
  o.onended();assert(o.disconnected);assert(g.disconnected);assert.equal(h.api.audioState().cue,null);
  h.advance(1999);assert.equal(h.get().scalePhase,'reverse-answer');h.advance(1);assert.notEqual(h.get().scalePhase,'reverse-answer','cue cannot delay answer timeout');h.close();
 }
 // Direct cue scheduling neither replaces a Hear voice nor mutates Hear request/deadline bookkeeping.
 {const h=setup();h.api.mode('scale');h.hear();await h.resolve();h.api.scaleFixture('reverse-answer');const before=h.api.audioState(),stops=h.oscillators[0].stops.slice();h.api.chooseCue();const after=h.api.audioState();for(const key of ['until','request','pending','voices'])assert.equal(after[key],before[key],key+' unaffected by cue');assert.deepEqual(h.oscillators[0].stops,stops,'Hear is not cut by cue');h.api.stopAudio();assert.equal(h.api.audioState().cue,null,'stop clears cue ownership');assert(h.oscillators[1].stops.length>1,'stop cancels cue');h.oscillators[1].onended();assert(h.oscillators[1].disconnected);assert(h.gains[1].disconnected);h.close();}
 // Hear replaces an active cue cleanly; an ended old cue must not erase a newer cue reference.
 {const h=setup();h.api.mode('scale');h.api.unlock();await h.resolve();h.api.scaleFixture('reverse-answer');h.api.chooseCue();const old=h.oscillators[0];h.api.chooseCue();const current=h.api.audioState().cue;old.onended();assert.equal(h.api.audioState().cue,current);h.api.scaleFixture('preview');h.hear();assert.equal(h.api.audioState().cue,null);await h.resolve();checkEnvelope(h,'scale',1,2);h.close();}
 // Audio output failures remain silent and do not stop the answer clock.
 {const h=setup();h.api.mode('scale');h.api.unlock();await h.resolve();h.contexts[0].createOscillator=()=>{throw Error('output unavailable');};h.api.scaleReverse();h.advance(2000);assert.equal(h.get().scalePhase,'reverse-answer');assert(h.el('audioStatus').hidden);h.advance(2000);assert.notEqual(h.get().scalePhase,'reverse-answer');h.close();}
 // Timeout during pending playback waits for audio; disabling timeout progression cancels only timeout.
 {const h=setup();h.api.mode('find');h.timed(true);h.advance(9000);const deadline=h.get().deadline;h.hear();h.advance(1000);assert.equal(h.get().deadline,deadline);assert.equal(h.get().pending.reason,'timeout');await h.resolve();h.advance(1799);assert.equal(h.get().target,null);h.advance(1);assert(h.get().target!==null);h.close();}
 {const h=setup();h.api.mode('find');h.timed(true);h.advance(10000);assert.equal(h.get().target,null);h.timed(false);h.advance(5000);assert.equal(h.get().target,null);h.close();}
 console.log(`PASS: untimed automatic success in 5 modes; all ${combinations} builder families; dictionary exact-set/retry; speaker-only accessible Hear in 8 modes with Phrase transport separate; connected/started WebAudio graphs; independent 1s/2s/5s envelopes; Scale phase pitches and hidden-cue rules; preview sustain; 26 Scale pending/running transition cases; repeated playback/cleanup; all-mode stale resumes; failed-resume recovery; WebKit fallback; no autoplay; success/timeout races; Choose chime graph, cleanup, silent fallback, unchanged deadline and Hear isolation. Fake audio/clock only, not audible/device QA.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
