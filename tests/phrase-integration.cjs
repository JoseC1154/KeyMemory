// Simulated MIDI/app integration: no physical instrument or audible playback verification.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),flush=()=>new Promise(r=>setImmediate(r));
function setup(saved){
 const w=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{pretendToBeVisual:true,runScripts:'outside-only',url:'https://keymemory.test/'}).window,d=w.document;
 w.confirm=()=>true;w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}};Object.defineProperty(w,'isSecureContext',{value:true});
 if(saved)w.localStorage.setItem('keymemory.phrase.v1',saved);
 let now=1000,id=0;const timers=new Map(),sounds=[],controls=[],oscillators=[];let engine;
 w.Date.now=()=>now;w.performance.now=()=>now;
 w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};w.clearInterval=id=>timers.delete(id);
 function advance(ms){const end=now+ms;for(;;){const t=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!t)break;const[k,v]=t;now=v.time;if(v.repeat)v.time+=v.repeat;else timers.delete(k);v.fn();}now=end;}
 const port={id:'yc',name:'YC Series Port 1',state:'connected',onmidimessage:null,open(){return Promise.resolve();},close(){return Promise.resolve();}},access={inputs:new Map([['yc',port]]),onstatechange:null};
 w.navigator.requestMIDIAccess=()=>Promise.resolve(access);
 w.AudioContext=class{get currentTime(){return now/1000;}destination={};resume(){return Promise.resolve();}createOscillator(){const o={frequency:{value:0},stops:[],connect(){},disconnect(){},start(){},stop(t){this.stops.push(t);}};oscillators.push(o);return o;}createGain(){return{gain:{value:.05,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};}};
 w.eval(fs.readFileSync(path.join(root,'midi.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase.js'),'utf8'));
 const create=w.KeyMemoryPhrase.create;w.KeyMemoryPhrase.create=config=>{engine=create({...config,onSound:(...args)=>{sounds.push(args);config.onSound?.(...args);},onControl:(...args)=>{controls.push(args);config.onControl?.(...args);}});return engine;};
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.phraseTest={mode:activateMode,get:()=>({activeMode,targetMidi,selected:[...selected]})};');
 const el=id=>d.getElementById(id),click=id=>el(id).click(),change=(id,value)=>{el(id).value=String(value);el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const send=(note,velocity=100,channel=0,kind=0x90,timeStamp=now)=>port.onmidimessage?.({data:new Uint8Array([kind|channel,note,velocity]),timeStamp}),off=(note,channel=0)=>send(note,0,channel,0x80);
 async function connect(){click('connectMidi');await flush();}
 return{w,d,el,click,change,send,off,advance,connect,port,access,sounds,controls,oscillators,cc:(controller,value,channel=0)=>send(controller,value,channel,0xb0),mode:m=>w.phraseTest.mode(m),get:()=>w.phraseTest.get(),snapshot:()=>engine.snapshot(),now:()=>now,close:()=>w.close()};
}
async function beginRecord(h){
 h.click('phraseRecord');await flush();
 if(h.snapshot().state!=='record-countin')return;
 const beat=60000/h.snapshot().options.sourceBpm;
 assert.equal(h.snapshot().countIn,1);h.advance(beat);assert.equal(h.snapshot().countIn,2);h.advance(beat);assert.equal(h.snapshot().countIn,3);h.advance(beat);assert.equal(h.snapshot().state,'recording');assert.equal(h.snapshot().elapsed,0);
}
async function beginPlay(h){
 h.click('phrasePlay');await flush();if(h.snapshot().state!=='play-countin')return;
 const beat=60000/h.snapshot().options.playBpm;
 assert.equal(h.snapshot().countIn,1);h.advance(beat);assert.equal(h.snapshot().countIn,2);h.advance(beat);assert.equal(h.snapshot().countIn,3);h.advance(beat);assert.equal(h.snapshot().state,'playing');
}
async function recordExample(h){
 await beginRecord(h);assert.equal(h.snapshot().state,'recording');h.send(60,72);h.advance(500);h.off(60);h.advance(200);h.send(64,110,2);h.advance(300);h.off(64,2);h.click('phraseStop');assert.equal(h.snapshot().state,'idle');
 assert.deepEqual(JSON.parse(JSON.stringify(h.snapshot().notes)),[{note:60,velocity:72,channel:0,start:0,duration:500},{note:64,velocity:110,channel:2,start:700,duration:300}]);assert.equal(h.snapshot().duration,1000);
}
(async()=>{
 const h=setup();await h.connect();h.mode('phrase');assert.equal(h.get().activeMode,'phrase');assert(!h.el('phraseActions').hidden);assert(h.el('timerControls').hidden);assert(h.el('dictionaryActions').hidden);assert(h.el('nextChallenge').hidden);assert.equal(h.el('phraseTolerance').value,String(h.snapshot().options.tolerance),'initial tolerance has a visible option');
 await recordExample(h);assert(h.snapshot().saved);const original=JSON.stringify(h.snapshot().notes);const saved=h.w.localStorage.getItem('keymemory.phrase.v1');assert(saved);
 // Explicit cancellation protects the saved phrase; disconnected recording gives actionable feedback.
 h.w.confirm=()=>false;await beginRecord(h);assert.equal(h.snapshot().state,'idle');h.click('phraseClear');assert.equal(JSON.stringify(h.snapshot().notes),original);h.w.confirm=()=>true;
 h.click('disconnectMidi');await beginRecord(h);assert.equal(h.snapshot().state,'idle');assert.match(h.el('trainingPrompt').textContent,/Connect.*MIDI/);await h.connect();
 // Independent UI tempo/transpose settings drive actual playback events and preserve recording.
 h.click('phraseUp');h.click('phraseUp');assert.equal(h.snapshot().options.transpose,2);assert.match(h.el('phraseTransposeValue').textContent,/2/);h.change('phraseSourceBpm',120);h.click('openSettings');h.change('phrasePlayBpm',60);assert.match(h.el('practiceSummary').textContent,/Notes only.*60 BPM/);h.click('closeSettings');assert.match(h.el('practiceSummary').textContent,/Notes only.*60 BPM/);
 await beginPlay(h);assert.equal(h.snapshot().state,'playing');h.advance(0);await flush();assert.deepEqual(h.sounds[0].slice(0,3),[62,72,1000]);h.advance(1400);await flush();assert.deepEqual(h.sounds[1].slice(0,3),[66,110,600]);h.advance(700);assert.equal(h.snapshot().state,'idle');assert.equal(JSON.stringify(h.snapshot().notes),original);
 // Section values are seconds in the UI but milliseconds in the engine.
 h.change('phraseSectionStart',.7);h.change('phraseSectionEnd',1);assert.equal(h.snapshot().options.sectionStart,700);assert.equal(h.snapshot().options.sectionEnd,1000);const prior=h.sounds.length;await beginPlay(h);h.advance(0);assert.deepEqual(h.sounds[prior].slice(0,3),[66,110,600]);h.advance(700);h.click('phraseFull');assert.equal(h.snapshot().options.sectionStart,0);assert.equal(h.snapshot().options.sectionEnd,1000);
 // Wrong note restarts only after all keys release and a four-beat count-in; recording survives.
 h.change('phrasePlayBpm',120);h.click('phrasePractice');assert.equal(h.snapshot().state,'countin');assert.equal(h.snapshot().countIn,4);h.advance(1999);assert.equal(h.snapshot().state,'countin');h.advance(1);assert.equal(h.snapshot().state,'practice');assert.deepEqual(Array.from(h.snapshot().target),[62]);
 h.send(63);assert.equal(h.snapshot().state,'wait-release');assert(h.d.querySelector('[data-midi="63"]').classList.contains('wrongAnswer'));assert(!h.d.querySelector('[data-midi="63"]').classList.contains('selected'),'wrong phrase key is never green');h.advance(1000);assert.equal(h.snapshot().state,'wait-release');assert(!h.d.querySelector('[data-midi="63"]').classList.contains('wrongAnswer'));assert.equal(JSON.stringify(h.snapshot().notes),original);
 h.off(63);assert.equal(h.snapshot().state,'countin');h.advance(2000);h.send(62);h.off(62);assert.deepEqual(Array.from(h.snapshot().target),[66]);h.advance(3000);assert.equal(h.snapshot().state,'practice','notes-only has no rhythm deadline');h.send(66);h.off(66);assert.equal(h.snapshot().state,'complete');assert.equal(JSON.stringify(h.snapshot().notes),original);
 // Rhythm setting/tolerance are explicit; a missed onset restarts with phrase retained.
 h.click('openSettings');h.change('phraseRhythm','rhythm');assert.match(h.el('practiceSummary').textContent,/Notes \+ rhythm.*120 BPM/);h.click('closeSettings');assert.match(h.el('practiceSummary').textContent,/Notes \+ rhythm.*120 BPM/);h.change('phraseTolerance',150);assert.equal(h.snapshot().options.rhythm,true);assert.equal(h.snapshot().options.tolerance,150);h.click('phrasePractice');h.advance(2000);h.advance(151);assert.notEqual(h.snapshot().state,'practice');assert.equal(JSON.stringify(h.snapshot().notes),original);h.click('phraseStop');
 // Tap BPM, invalid settings and source limits do not corrupt the recorded phrase.
 h.click('phraseTap');h.advance(500);h.click('phraseTap');h.advance(500);h.click('phraseTap');assert.equal(h.snapshot().options.sourceBpm,120);h.change('phrasePlayBpm',0);assert.equal(h.snapshot().options.playBpm,120);assert(h.snapshot().error);assert.equal(JSON.stringify(h.snapshot().notes),original);h.change('phrasePlayBpm',120);
 // Navigation/blur/disconnect stop recording and finalize held durations.
 for(const interruption of ['mode','blur','disconnect']){
  h.mode('phrase');await beginRecord(h);h.send(67,90);h.advance(400);
  if(interruption==='mode')h.mode('free');else if(interruption==='blur')h.w.dispatchEvent(new h.w.Event('blur'));else h.click('disconnectMidi');
  assert.equal(h.snapshot().state,'idle',interruption);assert.equal(h.snapshot().notes[0].note,67);assert.equal(h.snapshot().notes[0].duration,400);h.off(67);
  if(interruption==='blur')h.w.dispatchEvent(new h.w.Event('focus'));if(interruption==='disconnect')await h.connect();
 }
 // Playback timers cannot continue in another mode; opening a modal stops phrase activity safely.
 h.mode('phrase');await beginPlay(h);h.advance(0);const played=h.sounds.length;h.mode('find');h.advance(10000);assert.equal(h.sounds.length,played);assert.equal(h.get().activeMode,'find');
 h.mode('phrase');await beginRecord(h);h.send(60);h.advance(100);h.click('openSettings');assert.equal(h.snapshot().state,'idle');h.send(64);assert.equal(h.snapshot().notes.length,1);h.off(60);h.off(64);h.click('closeSettings');
 // Simultaneous raw notes remain a chord, and practice requires every chord tone.
 await beginRecord(h);h.send(60,70);h.send(64,80);h.send(67,90);h.advance(500);h.off(60);h.off(64);h.off(67);h.click('phraseStop');assert.equal(h.snapshot().notes.length,3);h.change('phraseRhythm','notes');h.click('phraseDown');h.click('phraseDown');h.click('phrasePractice');h.advance(2000);assert.deepEqual(Array.from(h.snapshot().target),[60,64,67]);h.send(60);assert.equal(h.snapshot().state,'practice');h.send(64);assert.equal(h.snapshot().state,'practice');h.send(67);assert.equal(h.snapshot().state,'complete');h.off(60);h.off(64);h.off(67);
 // Two-minute limit and session reload/delete are exercised through the app.
 await beginRecord(h);h.send(69);h.advance(120000);assert.equal(h.snapshot().state,'idle');assert.equal(h.snapshot().duration,120000);assert.equal(h.snapshot().notes[0].duration,120000);h.off(69);
 const restored=setup(saved);restored.mode('phrase');assert.equal(restored.snapshot().notes.length,2);assert.equal(restored.snapshot().notes[1].velocity,110);restored.click('phraseClear');assert.equal(restored.snapshot().notes.length,0);assert.equal(restored.w.localStorage.getItem('keymemory.phrase.v1'),null);restored.close();h.close();
 // MIDI event timestamps, not delayed callback arrival, determine recorded note duration.
 const timing=setup();await timing.connect();timing.mode('phrase');await beginRecord(timing);const recordStart=timing.now();timing.advance(100);timing.send(60,80,0,0x90,recordStart);timing.advance(400);timing.send(60,0,0,0x80,recordStart+400);timing.click('phraseStop');assert.equal(timing.snapshot().notes[0].start,0);assert.equal(timing.snapshot().notes[0].duration,400);timing.close();
 // Manual Stop cannot make a still-held physical key count as a new practice attack.
 const held=setup();await held.connect();held.mode('phrase');await beginRecord(held);held.send(60);held.advance(300);held.click('phraseStop');held.click('phrasePractice');assert.equal(held.snapshot().state,'wait-release');held.off(60);assert.equal(held.snapshot().state,'countin');held.advance(2000);held.send(60);assert.equal(held.snapshot().state,'complete');held.off(60);held.close();
 // CC64/7/11 capture survives reload, preserves physical key length, and reconstructs section state.
 const cc=setup();await cc.connect();cc.mode('phrase');cc.cc(7,80);cc.cc(11,100);await beginRecord(cc);cc.send(60,90);cc.advance(100);cc.cc(64,127);cc.cc(7,64);cc.advance(100);cc.off(60);cc.advance(300);cc.cc(11,80);cc.advance(300);cc.cc(64,32);cc.advance(200);cc.click('phraseStop');assert.equal(cc.snapshot().initialControllers.find(c=>c.channel===0&&c.controller===7).value,80);
 assert.equal(cc.snapshot().notes[0].duration,200,'pedal must not rewrite physical key duration');assert.deepEqual(Array.from(cc.snapshot().controllers,c=>[c.controller,c.value,c.channel,c.time]),[[64,127,0,100],[7,64,0,100],[11,80,0,500],[64,32,0,800]]);
 const storedCC=cc.w.localStorage.getItem('keymemory.phrase.v1');assert.equal(JSON.parse(storedCC).version,2);const reloadedCC=setup(storedCC);reloadedCC.mode('phrase');assert.deepEqual(JSON.parse(JSON.stringify(reloadedCC.snapshot().controllers)),JSON.parse(JSON.stringify(cc.snapshot().controllers)));reloadedCC.close();
 cc.change('phrasePlayBpm',60);await beginPlay(cc);assert.equal(cc.sounds[0][2],1600,'pedal-audible duration doubles at half speed');assert.equal(cc.sounds[0][4].channel,0);assert.equal(cc.sounds[0][4].keyDuration,400);cc.click('phraseStop');
 cc.change('phraseSectionStart',.5);cc.change('phraseSectionEnd',1);const soundOffset=cc.sounds.length,controlOffset=cc.controls.length;await beginPlay(cc);assert.equal(cc.sounds[soundOffset][0],60);assert.equal(cc.sounds[soundOffset][2],600,'section includes pedal tail after physical noteoff');const sectionControls=cc.controls.slice(controlOffset).map(c=>c[0]);for(const [controller,value]of[[64,127],[7,64],[11,80]])assert(sectionControls.some(c=>c.channel===0&&c.controller===controller&&c.value===value));cc.close();
 const legacyData=JSON.parse(saved);legacyData.version=1;delete legacyData.controllers;delete legacyData.initialControllers;const legacy=setup(JSON.stringify(legacyData));legacy.mode('phrase');assert.equal(legacy.snapshot().notes.length,2);assert.equal(legacy.snapshot().controllers.length,0);assert.equal(legacy.snapshot().initialControllers.find(c=>c.channel===0&&c.controller===7).value,100);legacy.close();
 console.log('PASS: Phrase Trainer app/MIDI record timing+velocity+release; tempo/transpose/section playback; notes-only/rhythm practice; wrong-red/release/count-in restart preserving phrase; lifecycle navigation/blur/disconnect/modal cleanup;120s limit; saved reload/delete. Simulated MIDI/audio only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
