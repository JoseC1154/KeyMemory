// Simulated MIDI/app integration: no physical instrument or audible playback verification.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),flush=()=>new Promise(r=>setImmediate(r));
function setup(saved){
 const w=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{pretendToBeVisual:true,runScripts:'outside-only',url:'https://keymemory.test/'}).window,d=w.document;
 w.innerWidth=1280;w.innerHeight=900;w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{width:100,height:30}];};w.confirm=()=>true;w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}};Object.defineProperty(w,'isSecureContext',{value:true});
 if(saved)w.localStorage.setItem('keymemory.phrase.v1',saved);
 let now=1000,id=0;const timers=new Map(),sounds=[],controls=[],oscillators=[];let engine;
 w.Date.now=()=>now;w.performance.now=()=>now;
 w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};w.clearInterval=id=>timers.delete(id);
 function advance(ms){const end=now+ms;for(;;){const t=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!t)break;const[k,v]=t;now=v.time;if(v.repeat)v.time+=v.repeat;else timers.delete(k);v.fn();}now=end;}
 const port={id:'yc',name:'YC Series Port 1',state:'connected',onmidimessage:null,open(){return Promise.resolve();},close(){return Promise.resolve();}},access={inputs:new Map([['yc',port]]),onstatechange:null};
 w.navigator.requestMIDIAccess=()=>Promise.resolve(access);
 w.AudioContext=class{state='running';get currentTime(){return now/1000;}destination={};resume(){return Promise.resolve();}createOscillator(){const o={frequency:{value:0},stops:[],connect(){},disconnect(){},start(){},stop(t){this.stops.push(t);}};oscillators.push(o);return o;}createGain(){return{gain:{value:.05,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};}};
 w.eval(fs.readFileSync(path.join(root,'midi-transport.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase-view.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'midi.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase.js'),'utf8'));
 const create=w.KeyMemoryPhrase.create;w.KeyMemoryPhrase.create=config=>{engine=create({...config,onSound:(...args)=>{sounds.push(args);config.onSound?.(...args);},onControl:(...args)=>{controls.push(args);config.onControl?.(...args);}});return engine;};
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.phraseTest={mode:activateMode,get:()=>({activeMode,targetMidi,selected:[...selected],scalePhase,scaleIndex,scaleLives,scaleNotes:[...scaleNotes],scaleStreak,scaleReverseStreak,question:scaleQuestionId,dialog:currentDialog?.id,soundEnabled})};');
 const el=id=>d.getElementById(id),click=id=>el(id).click(),change=(id,value)=>{el(id).value=String(value);el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const send=(note,velocity=100,channel=0,kind=0x90,timeStamp=now)=>port.onmidimessage?.({data:new Uint8Array([kind|channel,note,velocity]),timeStamp}),off=(note,channel=0)=>send(note,0,channel,0x80);
 async function connect(){click('connectMidi');await flush();}
 return{w,d,el,click,change,send,off,advance,connect,port,access,sounds,controls,oscillators,cc:(controller,value,channel=0)=>send(controller,value,channel,0xb0),mode:m=>w.phraseTest.mode(m),get:()=>w.phraseTest.get(),snapshot:()=>engine.snapshot(),now:()=>now,close:()=>w.close()};
}
function checked(h,id,value){h.el(id).checked=value;h.el(id).dispatchEvent(new h.w.Event('change',{bubbles:true}));}
async function learn(h,action,number,control=false){
 h.click('midiLearn-'+action);if(control)h.cc(number,127);else h.send(number);
 assert.match(h.el('midiMap-'+action).textContent,new RegExp((control?'CC ':'MIDI ')+number));
 if(control)h.cc(number,0);else h.off(number);
}
async function configure(h){
 await h.connect();h.click('openSettings');
 await learn(h,'record',36);await learn(h,'stop',22,true);await learn(h,'play',38);await learn(h,'practice',39);await learn(h,'continue',40);
 checked(h,'midiTransportEnabled',true);h.click('closeSettings');
}
const tap=(h,n)=>{h.send(n);h.off(n);},stop=h=>{h.cc(22,127);h.cc(22,0);};
const stored=h=>h.w.localStorage.getItem('keymemory.phrase.v1');
(async()=>{
 const h=setup();await configure(h);h.mode('phrase');
 h.send(36);await flush();assert.equal(h.snapshot().state,'record-countin');assert(!h.el('phraseRecordIndicator').hidden);assert.match(h.el('phraseRecordIndicator').textContent,/Ready/);
 h.send(36);h.advance(1500);assert.equal(h.snapshot().state,'recording');assert.match(h.el('phraseRecordIndicator').textContent,/REC/);h.off(36);
 h.send(60);h.advance(300);h.off(60);h.advance(700);h.send(64);h.advance(300);h.off(64);
 assert(h.el('phraseStaff').querySelector('.staffTimelineCursor'),'recording staff has timeline cursor');assert(+h.el('phraseViewTime').value>=1.2,'recording cursor advances');
 h.cc(22,63);assert.equal(h.snapshot().state,'recording');h.cc(22,64);assert.equal(h.snapshot().state,'idle');h.cc(22,127);h.cc(22,0);
 assert(h.el('phraseRecordIndicator').hidden);assert.deepEqual(Array.from(h.snapshot().notes,n=>n.note),[60,64]);assert(!h.snapshot().controllers.some(c=>c.controller===22));
 const saved=stored(h);let confirmations=0;h.w.confirm=()=>{confirmations++;return false;};
 tap(h,36);await flush();assert.equal(confirmations,1,'MIDI replacement uses existing confirmation');assert.equal(h.snapshot().state,'idle');assert.equal(stored(h),saved);
 // Reserved note commands do not enter musical grading in any non-phrase mode.
 for(const mode of ['free','find','remember','semitones','degrees','builder','scale','dictionary']){
  h.mode(mode);const before=JSON.stringify(h.get());for(const n of [36,38,39])tap(h,n);stop(h);await flush();assert.equal(JSON.stringify(h.get()),before,mode+' ignores phrase commands without grading');
 }
 h.mode('phrase');tap(h,39);await flush();assert.equal(h.snapshot().state,'countin');h.advance(2000);assert.equal(h.snapshot().state,'practice');assert.equal(+h.el('phraseViewTime').value,0);tap(h,60);assert.deepEqual(Array.from(h.snapshot().target),[64]);assert.equal(+h.el('phraseViewTime').value,1,'notes-only cursor follows next target');assert(h.el('phraseStaff').querySelector('.staffTimelineCursor'));tap(h,64);assert.equal(h.snapshot().state,'complete');assert.equal(stored(h),saved);
 // Learn conflict cannot silently replace another assignment; cancel and remove use actual UI.
 h.click('openSettings');h.click('midiLearn-play');tap(h,36);assert.match(h.el('midiTransportStatus').textContent,/already assigned/);assert.match(h.el('midiMap-play').textContent,/MIDI 38/);h.click('midiTransportCancel');
 checked(h,'midiTransportEnabled',false);h.click('closeSettings');tap(h,38);assert.equal(h.snapshot().state,'idle');
 h.click('openSettings');h.click('midiRemove-play');assert.equal(h.el('midiMap-play').textContent,'Not assigned');checked(h,'midiTransportEnabled',true);h.click('closeSettings');
 h.w.confirm=()=>true;tap(h,36);await flush();h.advance(1500);tap(h,38);h.advance(300);stop(h);assert.deepEqual(Array.from(h.snapshot().notes,n=>n.note),[38],'removed command records as musical data');
 // Disabled bindings become ordinary MIDI notes, including their release durations.
 h.click('openSettings');checked(h,'midiTransportEnabled',false);h.click('closeSettings');h.click('phraseRecord');await flush();h.advance(1500);h.send(36);h.advance(250);h.off(36);h.click('phraseStop');assert.equal(h.snapshot().notes[0].note,36);assert.equal(h.snapshot().notes[0].duration,250);h.close();
 // Continue accepts existing Scale Start, ready, Resume and correction prompts, never an answer.
 const scale=setup();await configure(scale);scale.mode('scale');assert.equal(scale.get().scalePhase,'preview');scale.send(40);assert.equal(scale.get().scalePhase,'ready');scale.send(40);assert.equal(scale.get().scalePhase,'ready','held Continue cannot dismiss the next prompt');scale.off(40);tap(scale,40);assert.equal(scale.get().scalePhase,'race');
 const race=JSON.stringify(scale.get());tap(scale,40);assert.equal(JSON.stringify(scale.get()),race,'Continue during a race cannot grade');
 scale.click('pauseScale');assert.equal(scale.get().dialog,'scalePauseOverlay');tap(scale,40);assert.equal(scale.get().dialog,undefined);assert.equal(scale.get().scalePhase,'race');
 const wrong=scale.get().scaleNotes[0]===61?62:61;tap(scale,wrong);assert.equal(scale.get().scalePhase,'correction');tap(scale,40);assert.equal(scale.get().scalePhase,'ready');
 for(let run=0;run<4;run++){tap(scale,40);assert.equal(scale.get().scalePhase,'race');for(const n of scale.get().scaleNotes)tap(scale,n);if(scale.get().scalePhase==='levelup')break;assert.equal(scale.get().scalePhase,'ready');}
 assert.equal(scale.get().scalePhase,'levelup');scale.advance(2500);assert.equal(scale.get().scalePhase,'degree-preview');tap(scale,40);assert.equal(scale.get().scalePhase,'degrees');const degree=JSON.stringify(scale.get());tap(scale,40);assert.equal(JSON.stringify(scale.get()),degree,'Continue cannot answer a scale degree');scale.close();
 // Click runs with notes muted, and muting Click leaves active note voices and transport intact.
 const audio=setup(saved);await audio.connect();audio.mode('phrase');audio.click('phrasePlay');await flush();audio.advance(1500);assert.equal(audio.snapshot().state,'playing');
 assert.equal(audio.get().soundEnabled,false);let clicks=audio.oscillators.filter(o=>[1000,1400].includes(o.frequency.value)).length;assert(clicks>=4,'audible click oscillators exist with Sound off');audio.advance(500);assert(audio.oscillators.filter(o=>[1000,1400].includes(o.frequency.value)).length>clicks);
 audio.click('phraseStop');audio.click('soundToggle');await flush();audio.click('phrasePlay');await flush();audio.advance(1500);await flush();
 const notes=audio.oscillators.filter(o=>o.frequency.value>0&&![1000,1400].includes(o.frequency.value));assert(notes.length,'note voice exists');const note=notes.at(-1),stops=note.stops.length;audio.click('phraseMetronome');assert.equal(note.stops.length,stops,'Click off does not silence note voice');assert.equal(audio.snapshot().state,'playing');clicks=audio.oscillators.filter(o=>[1000,1400].includes(o.frequency.value)).length;audio.advance(500);assert.equal(audio.oscillators.filter(o=>[1000,1400].includes(o.frequency.value)).length,clicks);assert.equal(audio.snapshot().state,'playing');
 audio.click('phraseMetronome');await flush();audio.click('soundToggle');assert.equal(audio.get().soundEnabled,false);assert.equal(audio.snapshot().state,'playing');clicks=audio.oscillators.filter(o=>[1000,1400].includes(o.frequency.value)).length;audio.advance(500);assert(audio.oscillators.filter(o=>[1000,1400].includes(o.frequency.value)).length>clicks,'turning Sound off during playback preserves click');audio.close();
 console.log('PASS real DOM MIDI Learn/action mappings, reserved notes/CC edges, duplicate commands, conflicts/removal/disable, replacement confirmation, all-mode isolation, Scale Start/Continue/Resume/correction, independent click audio, REC indicator and record/practice staff cursors. Synthetic MIDI/audio only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
