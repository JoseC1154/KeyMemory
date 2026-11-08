// Simulated MIDI/app integration: no physical instrument or audible playback verification.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),flush=()=>new Promise(r=>setImmediate(r));
function setup(saved){
 const w=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{pretendToBeVisual:true,runScripts:'outside-only',url:'https://keymemory.test/'}).window,d=w.document;
 w.innerWidth=1280;w.innerHeight=900;w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{width:100,height:30}];};w.confirm=()=>true;w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}};Object.defineProperty(w,'isSecureContext',{value:true});
 if(saved)w.localStorage.setItem('keymemory.phrase.v1',saved);
 let deferred=false,rejectAudio=false;const resumes=[];
 let now=1000,id=0;const timers=new Map(),sounds=[],controls=[],oscillators=[];let engine;
 w.Date.now=()=>now;w.performance.now=()=>now;
 w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};w.clearInterval=id=>timers.delete(id);
 function advance(ms){const end=now+ms;for(;;){const t=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!t)break;const[k,v]=t;now=v.time;if(v.repeat)v.time+=v.repeat;else timers.delete(k);v.fn();}now=end;}
 const port={id:'yc',name:'YC Series Port 1',state:'connected',onmidimessage:null,open(){return Promise.resolve();},close(){return Promise.resolve();}},access={inputs:new Map([['yc',port]]),onstatechange:null};
 w.navigator.requestMIDIAccess=()=>Promise.resolve(access);
 w.AudioContext=class{state='running';get currentTime(){return now/1000;}destination={};resume(){return rejectAudio?Promise.reject(Error('blocked')):deferred?new Promise(resolve=>resumes.push(resolve)):Promise.resolve();}createOscillator(){const o={frequency:{value:0},stops:[],connect(){},disconnect(){},start(){},stop(t){this.stops.push(t);}};oscillators.push(o);return o;}createGain(){return{gain:{value:.05,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};}};
 w.eval(fs.readFileSync(path.join(root,'midi-transport.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase-view.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'midi.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase.js'),'utf8'));
 const create=w.KeyMemoryPhrase.create;w.KeyMemoryPhrase.create=config=>{engine=create({...config,onSound:(...args)=>{sounds.push(args);config.onSound?.(...args);},onControl:(...args)=>{controls.push(args);config.onControl?.(...args);}});return engine;};
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.phraseTest={mode:activateMode,get:()=>({activeMode,targetMidi,selected:[...selected],scalePhase,scaleIndex,scaleLives,scaleNotes:[...scaleNotes],scaleStreak,scaleReverseStreak,question:scaleQuestionId,dialog:currentDialog?.id})};');
 const el=id=>d.getElementById(id),click=id=>el(id).click(),change=(id,value)=>{el(id).value=String(value);el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const send=(note,velocity=100,channel=0,kind=0x90,timeStamp=now)=>port.onmidimessage?.({data:new Uint8Array([kind|channel,note,velocity]),timeStamp}),off=(note,channel=0)=>send(note,0,channel,0x80);
 async function connect(){click('connectMidi');await flush();}
 return{w,d,el,click,change,send,off,advance,connect,port,access,sounds,controls,oscillators,engine:()=>engine,defer:value=>{deferred=value;},reject:value=>{rejectAudio=value;},resumes,cc:(controller,value,channel=0)=>send(controller,value,channel,0xb0),mode:m=>w.phraseTest.mode(m),get:()=>w.phraseTest.get(),snapshot:()=>engine.snapshot(),now:()=>now,close:()=>w.close()};
}

const saved=JSON.stringify({version:1,sourceBpm:120,duration:2000,notes:[{note:60,velocity:90,channel:0,start:0,duration:800},{note:64,velocity:80,channel:1,start:1000,duration:600}]});
const stored=h=>h.w.localStorage.getItem('keymemory.phrase.v1'),plain=x=>JSON.parse(JSON.stringify(x));
const visible=h=>!h.el('phraseRecordConfirm').hidden;
async function ready(data=saved){const h=setup(data);h.mode('phrase');await h.connect();h.w.confirm=()=>{throw Error('Record must not open a browser dialog');};return h;}
function arm(h){h.click('phraseRecord');assert(visible(h));assert.match(h.el('phraseRecordConfirmMessage').textContent,/Press Record again.*replace.*phrase/);assert.match(h.el('phraseRecord').textContent,/Record again/);assert.equal(h.el('phraseRecord').getAttribute('aria-expanded'),'true');assert.equal(h.el('phraseRecord').getAttribute('aria-describedby'),'phraseRecordConfirmMessage');}
(async()=>{
 // One press still starts a first take; a saved take remains byte-identical until a nonempty replacement finishes.
 let h=await ready(null);assert.equal(h.el('phraseDelete'),null);assert(h.el('phraseControls').contains(h.el('phraseDown')));assert(!h.el('phraseActions').contains(h.el('phraseUp')));
 h.click('phraseRecord');await flush();assert.equal(h.snapshot().state,'record-countin');assert(!visible(h));h.click('phraseStop');h.close();
 h=await ready();const original=stored(h),before=plain(h.snapshot());arm(h);assert.deepEqual(plain(h.snapshot()),before);assert.equal(stored(h),original);
 // Confirmation remains attached to the existing phrase while incoming non-command MIDI is merely monitored.
 h.send(70);h.advance(500);h.off(70);assert(visible(h));assert.equal(stored(h),original);
 h.click('phraseRecord');await flush();assert(!visible(h));assert.equal(h.snapshot().state,'record-countin');h.click('phraseRecord');assert.equal(h.snapshot().state,'record-countin','disabled duplicate press does not restart count-in');h.click('phraseStop');assert.equal(stored(h),original,'count-in cancellation preserves all stored data');
 arm(h);h.click('phraseRecord');await flush();h.advance(2000);assert.equal(h.snapshot().state,'recording');h.advance(150);h.click('phraseStop');assert.equal(stored(h),original,'empty take preserves all stored data');
 arm(h);h.click('phraseRecord');await flush();h.advance(2000);h.send(67,93);h.advance(450);h.off(67);assert.equal(stored(h),original,'old phrase stays saved while a take is in progress');h.click('phraseStop');assert.deepEqual(Array.from(h.snapshot().notes,n=>[n.note,n.velocity,n.duration]),[[67,93,450]]);assert.notEqual(stored(h),original);h.close();
 // Confirmation is not a mode, modal, page-visibility or MIDI-connection permission that can outlive its attempt.
 for(const action of ['keep','escape','stop','settings','mode','blur','hidden','disconnect','revision','input','pointer']){
  h=await ready();const original=stored(h);arm(h);
  if(action==='keep')h.click('phraseRecordCancel');
  else if(action==='escape')h.d.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  else if(action==='stop')h.click('phraseStop');
  else if(action==='settings'){h.click('openSettings');h.click('closeSettings');}
  else if(action==='mode'){h.mode('free');h.mode('phrase');}
  else if(action==='blur'){h.w.dispatchEvent(new h.w.Event('blur'));h.w.dispatchEvent(new h.w.Event('focus'));}
  else if(action==='hidden'){Object.defineProperty(h.d,'hidden',{configurable:true,value:true});h.d.dispatchEvent(new h.w.Event('visibilitychange'));Object.defineProperty(h.d,'hidden',{configurable:true,value:false});h.d.dispatchEvent(new h.w.Event('visibilitychange'));}
  else if(action==='disconnect'){h.click('disconnectMidi');await h.connect();}
  else if(action==='revision'){assert(h.engine().deleteNote(0,h.snapshot().noteRevision));}
  else if(action==='input')h.el('phraseViewTime').dispatchEvent(new h.w.Event('input',{bubbles:true}));
  else h.el('phraseTimingDial').dispatchEvent(new h.w.Event('pointerdown',{bubbles:true}));
  assert(!visible(h),action+' clears the prompt');assert.equal(h.el('phraseRecord').getAttribute('aria-expanded'),'false');assert(!h.el('phraseRecord').hasAttribute('aria-describedby'));if(action!=='revision')assert.equal(stored(h),original,action+' keeps storage unchanged');
  arm(h);assert.equal(h.snapshot().state,'idle',action+' needs a fresh second press');h.close();
 }
 // Inspecting the replacement prompt does not disturb an existing paused cursor or playback.
 h=await ready();h.engine().setOptions({countInBars:0,metronome:false});h.click('phrasePlay');await flush();h.advance(350);h.click('phrasePlay');assert.equal(h.snapshot().pausedAt,350);const paused=plain(h.snapshot());arm(h);h.click('phraseStop');assert.deepEqual(plain(h.snapshot()),paused);h.click('phrasePlay');await flush();const playing=plain(h.snapshot());arm(h);h.click('phraseRecordCancel');assert.deepEqual(plain(h.snapshot()),playing);h.click('phrasePlay');h.close();
 // A keyboard hold is not two deliberate activations; cancel returns focus to Record.
 h=await ready();h.el('phraseRecord').focus();arm(h);const repeat=new h.w.KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true});h.el('phraseRecord').dispatchEvent(repeat);assert(repeat.defaultPrevented);assert(visible(h));h.click('phraseRecordCancel');assert.equal(h.d.activeElement,h.el('phraseRecord'));h.close();
 // Failed or interrupted audio startup cannot reuse a previous replacement confirmation.
 for(const action of ['reject','stop','mode','blur','disconnect']){
  h=await ready();const original=stored(h);arm(h);if(action==='reject')h.reject(true);else h.defer(true);h.click('phraseRecord');
  if(action==='stop')h.click('phraseStop');if(action==='mode'){h.mode('free');h.mode('phrase');}if(action==='blur'){h.w.dispatchEvent(new h.w.Event('blur'));h.w.dispatchEvent(new h.w.Event('focus'));}if(action==='disconnect'){h.click('disconnectMidi');await h.connect();}
  h.resumes.forEach(resolve=>resolve());await flush();h.advance(3000);assert.equal(h.snapshot().state,'idle',action);assert.equal(stored(h),original);assert(!visible(h));h.reject(false);h.defer(false);arm(h);h.close();
 }
 // MIDI note and CC Record share the two-press flow; repeats/high CC values do not confirm before release.
 for(const kind of ['note','control']){
  h=setup(saved);h.w.localStorage.setItem('keymemory.midiTransport.v1',JSON.stringify({version:1,enabled:true,mappings:{}}));await h.connect();h.mode('phrase');h.click('openSettings');h.click('midiLearn-record');if(kind==='note'){h.send(36);h.off(36);}else{h.cc(22,127);h.cc(22,0);}h.click('midiLearn-stop');h.cc(21,127);h.cc(21,0);h.el('midiTransportEnabled').checked=true;h.el('midiTransportEnabled').dispatchEvent(new h.w.Event('change',{bubbles:true}));h.click('closeSettings');h.w.confirm=()=>{throw Error('No MIDI browser dialog');};const original=stored(h);
  const press=()=>kind==='note'?h.send(36):h.cc(22,127),release=()=>kind==='note'?h.off(36):h.cc(22,0);
  press();assert(visible(h));press();await flush();assert.equal(h.snapshot().state,'idle');assert.equal(stored(h),original);h.cc(21,127);h.cc(21,0);assert(!visible(h),'MIDI Stop cancels the replacement prompt');assert.equal(stored(h),original);release();press();assert(visible(h),'after Stop a fresh first press only prompts');release();press();await flush();assert.equal(h.snapshot().state,'record-countin');release();h.advance(2000);h.click('phraseStop');assert.equal(stored(h),original,'shortcut input never enters the recorded take');h.close();
 }
 console.log('PASS record replacement: first/second press, exact saved-data retention, count-in/empty take, cancellation/reset, keyboard hold, audio races, MIDI note+CC release edges, settings-only delete/transpose. Synthetic DOM/MIDI/audio only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
