// Read-only Live Score integration using persisted fixtures and simulated DOM/MIDI/audio.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),flush=()=>new Promise(r=>setImmediate(r));
function setup(saved,prefs){
 const w=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{pretendToBeVisual:true,runScripts:'outside-only',url:'https://keymemory.test/'}).window,d=w.document;
 w.confirm=()=>true;w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}};Object.defineProperty(w,'isSecureContext',{value:true});
 if(prefs!==undefined)w.localStorage.setItem('keymemory.phrase.view',prefs);
 if(saved)w.localStorage.setItem('keymemory.phrase.v1',saved);
 let now=1000,id=0;const timers=new Map(),sounds=[],controls=[],oscillators=[];let engine;
 w.Date.now=()=>now;w.performance.now=()=>now;
 w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};w.clearInterval=id=>timers.delete(id);
 function advance(ms){const end=now+ms;for(;;){const t=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!t)break;const[k,v]=t;now=v.time;if(v.repeat)v.time+=v.repeat;else timers.delete(k);v.fn();}now=end;}
 const port={id:'yc',name:'YC Series Port 1',state:'connected',onmidimessage:null,open(){return Promise.resolve();},close(){return Promise.resolve();}},access={inputs:new Map([['yc',port]]),onstatechange:null};
 w.navigator.requestMIDIAccess=()=>Promise.resolve(access);
 w.AudioContext=class{state='running';get currentTime(){return now/1000;}destination={};resume(){return Promise.resolve();}createOscillator(){const o={frequency:{value:0},stops:[],connect(){},disconnect(){},start(){},stop(t){this.stops.push(t);}};oscillators.push(o);return o;}createGain(){return{gain:{value:.05,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};}};
 w.eval(fs.readFileSync(path.join(root,'midi-transport.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase-view.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'midi.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase.js'),'utf8'));
 const create=w.KeyMemoryPhrase.create;w.KeyMemoryPhrase.create=config=>{engine=create({...config,onSound:(...args)=>{sounds.push(args);config.onSound?.(...args);},onControl:(...args)=>{controls.push(args);config.onControl?.(...args);}});return engine;};
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.phraseTest={mode:activateMode,render:renderPiano,get:()=>({activeMode,targetMidi,selected:[...selected]})};');
 const el=id=>d.getElementById(id),click=id=>el(id).click(),change=(id,value)=>{el(id).value=String(value);el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const send=(note,velocity=100,channel=0,kind=0x90,timeStamp=now)=>port.onmidimessage?.({data:new Uint8Array([kind|channel,note,velocity]),timeStamp}),off=(note,channel=0)=>send(note,0,channel,0x80);
 async function connect(){click('connectMidi');await flush();}
 return{w,d,el,click,change,send,off,advance,connect,port,access,sounds,controls,oscillators,cc:(controller,value,channel=0)=>send(controller,value,channel,0xb0),mode:m=>w.phraseTest.mode(m),get:()=>w.phraseTest.get(),snapshot:()=>engine.snapshot(),transportTimers:()=>[...timers].filter(([,v])=>v.fn.name!=='renderPhraseView').map(([id,v])=>({id,time:v.time,repeat:v.repeat})),now:()=>now,close:()=>w.close()};
}
const key=(h,n)=>h.d.querySelector(`[data-midi="${n}"]`);
const transient=(h,n)=>['midiKeyDown','phrasePlaying','phraseLive','selected'].filter(c=>key(h,n)?.classList.contains(c));
(async()=>{
 for(const recording of [false,true])for(const [open,close]of [['openSettings','closeSettings'],['openHint','closeHint'],['openModes','closeModes']]){
  const h=setup();await h.connect();h.mode('phrase');
  if(recording){h.click('phraseRecord');await flush();h.advance(2000);assert.equal(h.snapshot().state,'recording');}
  h.send(60);assert(key(h,60).classList.contains('phraseLive'));assert(key(h,60).classList.contains('midiKeyDown'));
  h.click(open);h.off(60);assert.deepEqual(Array.from(h.get().selected),[],'logical selection is already released');assert.deepEqual(transient(h,60),[],'release repaints immediately behind the open sheet');
  h.click(close);assert.deepEqual(transient(h,60),[],`${recording?'recorded':'idle'} note released behind ${open} must not remain painted`);
  h.advance(10000);assert.deepEqual(transient(h,60),[],'no late repaint resurrects the released key');h.close();
 }

 // Practice selections also clear on release after interruption. Other lessons
 // retain their earned answers, which are not physical held-key indications.
 const saved=JSON.stringify({version:1,sourceBpm:120,duration:2000,notes:[{note:60,velocity:90,channel:0,start:0,duration:500}]});
 let h=setup(saved);await h.connect();h.mode('phrase');h.click('phrasePractice');await flush();h.advance(2000);h.send(60);assert(key(h,60).classList.contains('selected'));h.click('openSettings');h.send(60,0);h.click('closeSettings');assert.deepEqual(transient(h,60),[],'velocity-zero releases interrupted practice selection');h.close();
 // Pedal state does not make a released physical key appear pressed, and one
 // channel's release must not hide the same pitch still held on another channel.
 h=setup();await h.connect();h.mode('phrase');h.click('phraseRecord');await flush();h.advance(2000);h.cc(64,127);h.send(60);h.send(60,90,1);h.send(64);h.click('openHint');h.off(60);assert(key(h,60).classList.contains('midiKeyDown'));assert(key(h,60).classList.contains('phraseLive'));h.off(60,1);assert.deepEqual(transient(h,60),[]);assert(key(h,64).classList.contains('phraseLive'),'different held note survives reconciliation');h.off(64);h.click('closeHint');assert.deepEqual(transient(h,64),[]);h.close();
 // Explicit time inspection remains intentional after a live note releases.
 h=setup(saved);await h.connect();h.mode('phrase');h.el('phraseViewTime').value='.2';h.el('phraseViewTime').dispatchEvent(new h.w.Event('input'));assert(key(h,60).classList.contains('phraseInspectKey'));h.send(67);h.click('openSettings');h.off(67);h.click('closeSettings');assert.deepEqual(transient(h,67),[]);assert(key(h,60).classList.contains('phraseInspectKey'),'keep deliberate score inspection');h.close();
 for(const mode of ['free','find','remember','semitones','degrees','builder','dictionary']){
  h=setup();await h.connect();h.mode(mode);if(mode==='remember')h.advance(1800);const n=mode==='free'?60:h.get().targetMidi;
  if(n!==null&&n!==undefined){h.send(n);const selected=Array.from(h.get().selected);h.click('openSettings');h.off(n);h.click('closeSettings');assert.deepEqual(Array.from(h.get().selected),selected,mode+' retains intentional selection/answer state');}h.close();
 }
 console.log('PASS: Phrase MIDI releases behind Settings/Hint/Modes repaint immediately; idle/recorded/practice, velocity-zero, channel layers and pedal state; inspection and lesson selections preserved. Synthetic MIDI/DOM only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
