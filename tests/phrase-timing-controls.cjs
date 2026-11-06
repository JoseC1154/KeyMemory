// Read-only Live Score integration using persisted fixtures and simulated DOM/MIDI/audio.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),flush=()=>new Promise(r=>setImmediate(r));
function setup(saved,prefs){
 const w=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{pretendToBeVisual:true,runScripts:'outside-only',url:'https://keymemory.test/'}).window,d=w.document;
 w.confirm=()=>true;w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}};Object.defineProperty(w,'isSecureContext',{value:true});
 if(prefs!==undefined)w.localStorage.setItem('keymemory.phrase.view',prefs);
 if(saved)w.localStorage.setItem('keymemory.phrase.v1',saved);
 let now=1000,id=0,defer=false;const resumes=[];const timers=new Map(),sounds=[],controls=[],oscillators=[];let engine;
 w.Date.now=()=>now;w.performance.now=()=>now;
 w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};w.clearInterval=id=>timers.delete(id);
 function advance(ms){const end=now+ms;for(;;){const t=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!t)break;const[k,v]=t;now=v.time;if(v.repeat)v.time+=v.repeat;else timers.delete(k);v.fn();}now=end;}
 const port={id:'yc',name:'YC Series Port 1',state:'connected',onmidimessage:null,open(){return Promise.resolve();},close(){return Promise.resolve();}},access={inputs:new Map([['yc',port]]),onstatechange:null};
 w.navigator.requestMIDIAccess=()=>Promise.resolve(access);
 w.AudioContext=class{state='running';get currentTime(){return now/1000;}destination={};resume(){return defer?new Promise(resolve=>resumes.push(resolve)):Promise.resolve();}createOscillator(){const o={frequency:{value:0},stops:[],connect(){},disconnect(){},start(){},stop(t){this.stops.push(t);}};oscillators.push(o);return o;}createGain(){return{gain:{value:.05,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};}};
 w.eval(fs.readFileSync(path.join(root,'phrase-view.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'midi.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase.js'),'utf8'));
 const create=w.KeyMemoryPhrase.create;w.KeyMemoryPhrase.create=config=>{engine=create({...config,onSound:(...args)=>{sounds.push(args);config.onSound?.(...args);},onControl:(...args)=>{controls.push(args);config.onControl?.(...args);}});return engine;};
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.phraseTest={mode:activateMode,render:renderPiano,get:()=>({activeMode,targetMidi,selected:[...selected]})};');
 const el=id=>d.getElementById(id),click=id=>el(id).click(),change=(id,value)=>{el(id).value=String(value);el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const send=(note,velocity=100,channel=0,kind=0x90,timeStamp=now)=>port.onmidimessage?.({data:new Uint8Array([kind|channel,note,velocity]),timeStamp}),off=(note,channel=0)=>send(note,0,channel,0x80);
 async function connect(){click('connectMidi');await flush();}
 return{w,d,el,click,change,send,off,advance,connect,port,access,sounds,controls,oscillators,resumes,defer:value=>{defer=value;},cc:(controller,value,channel=0)=>send(controller,value,channel,0xb0),mode:m=>w.phraseTest.mode(m),get:()=>w.phraseTest.get(),snapshot:()=>engine.snapshot(),transportTimers:()=>[...timers].filter(([,v])=>v.fn.name!=='renderPhraseView').map(([id,v])=>({id,time:v.time,repeat:v.repeat})),now:()=>now,close:()=>w.close()};
}
async function beginPlay(h){
 h.click('phrasePlay');await flush();if(h.snapshot().state!=='play-countin')return;
 const beat=60000/h.snapshot().options.playBpm;
 assert.equal(h.snapshot().countIn,1);h.advance(beat);assert.equal(h.snapshot().countIn,2);h.advance(beat);assert.equal(h.snapshot().countIn,3);h.advance(beat);assert.equal(h.snapshot().state,'playing');
}
const fixture={version:2,sourceBpm:120,duration:4000,notes:[
 {note:60,velocity:90,channel:0,start:0,duration:500},
 {note:64,velocity:90,channel:0,start:0,duration:500},
 {note:67,velocity:90,channel:1,start:250,duration:1000},
 {note:72,velocity:90,channel:1,start:2000,duration:500}],
 controllers:[{controller:64,value:127,channel:0,time:100},{controller:64,value:0,channel:0,time:1800}],initialControllers:Array.from({length:16},(_,channel)=>[7,11,64].map(controller=>({channel,controller,value:controller===7?100:controller===11?127:0}))).flat()};
const saved=JSON.stringify(fixture),plain=v=>JSON.parse(JSON.stringify(v));
function setupReady(){const h=setup(saved);h.w.innerWidth=1280;h.w.innerHeight=900;h.mode('phrase');return h;}
function key(h,key,shiftKey=false){h.el('phraseStaff').dispatchEvent(new h.w.KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true}));}
function input(h,id,value){h.el(id).value=String(value);h.el(id).dispatchEvent(new h.w.Event('input',{bubbles:true}));}
function notes(h,selector){return [...h.d.querySelectorAll(selector)].map(n=>Number(n.dataset.midi)).sort((a,b)=>a-b);}
(async()=>{
 let h=setupReady();const original=JSON.stringify(h.snapshot().notes),raw=JSON.stringify(plain(h.snapshot()).controllers),storage=h.w.localStorage.getItem('keymemory.phrase.v1');
 assert(h.el('phraseTimingEditor').hidden);h.el('phraseStaff').querySelector('[data-midi="60"]').dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));assert(!h.el('phraseTimingEditor').hidden);assert.equal(h.el('phraseStaff').getAttribute('aria-expanded'),'true');assert.deepEqual(notes(h,'.key.phraseInspectKey'),[60,64]);assert.deepEqual(notes(h,'.staffSelectedKey'),[60,64]);assert.equal(h.sounds.length,0);
 key(h,'ArrowRight',true);assert.equal(+h.el('phraseViewTime').value,1);assert.deepEqual(notes(h,'.key.phraseInspectKey'),[67]);assert.deepEqual(notes(h,'.key.phraseInspectTail'),[60,64]);assert.deepEqual(notes(h,'.staffSelectedTail'),[60,64]);assert.match(h.el('phrasePitchText').textContent,/Pedal only: C4 · E4/);assert.match(h.d.querySelector('.key[data-midi="60"]').getAttribute('aria-label'),/pedal sustain only/);assert.equal(h.el('phrasePitchText').getAttribute('aria-live'),'polite');
 key(h,'End');assert.equal(+h.el('phraseViewTime').value,4);assert.equal(h.d.querySelectorAll('.key.phraseInspectKey,.key.phraseInspectTail').length,0);key(h,'Home');key(h,'ArrowLeft');assert.equal(+h.el('phraseViewTime').value,0);key(h,'ArrowRight');assert.equal(+h.el('phraseViewTime').value,.1);
 // Background coordinate mapping uses source window metadata, not note spacing or playback BPM.
 let svg=h.el('phraseStaff').querySelector('svg');svg.getBoundingClientRect=()=>({left:20,width:800});const box=svg.getAttribute('viewBox').split(' ').map(Number),x=80+1500/6000*(800-144);svg.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,clientX:20+(x-box[0])/box[2]*800}));assert(Math.abs(+h.el('phraseViewTime').value-1.5)<1e-8);assert.deepEqual(notes(h,'.key.phraseInspectTail'),[60,64]);
 assert.equal(JSON.stringify(h.snapshot().notes),original);assert.equal(JSON.stringify(plain(h.snapshot()).controllers),raw);assert.equal(h.w.localStorage.getItem('keymemory.phrase.v1'),storage);assert.equal(h.sounds.length,0);
 h.click('phraseTimingClose');assert(h.el('phraseTimingEditor').hidden);assert.equal(h.d.activeElement,h.el('phraseTimingToggle'));h.click('phraseTimingToggle');h.el('phraseTimingDial').focus();h.el('phraseTimingDial').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(h.el('phraseTimingEditor').hidden);assert.equal(h.d.activeElement,h.el('phraseTimingToggle'));
 // One accessible dial controls the reversible tempo ratio; settings retain advanced BPM.
 h.click('phraseTimingToggle');const dial=h.el('phraseTimingDial');
 assert.equal(h.el('phraseTimingEditor').querySelectorAll('[role="slider"]').length,1);assert.equal(h.el('phraseTimingEditor').querySelectorAll('input').length,0);
 const turn=(key,shiftKey=false)=>dial.dispatchEvent(new h.w.KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true}));
 for(let i=0;i<5;i++)turn('ArrowLeft',true);assert.equal(h.snapshot().options.playBpm,60);assert.equal(h.snapshot().playbackDuration,8000);assert.equal(+h.el('phrasePlayBpm').value,60);assert.match(dial.getAttribute('aria-valuetext'),/50 percent speed, slower/);
 turn('End');assert.equal(h.snapshot().options.playBpm,300);turn('Home');assert.equal(h.snapshot().options.playBpm,30);turn('Enter');assert.equal(h.snapshot().options.playBpm,120);assert.equal(dial.style.getPropertyValue('--dial-angle'),'0deg');
 const pointer=(type,y,id=1,pointerType='mouse')=>{const e=new h.w.Event(type,{bubbles:true,cancelable:true});for(const[k,v]of Object.entries({button:0,pointerId:id,clientY:y,pointerType}))Object.defineProperty(e,k,{value:v});dial.dispatchEvent(e);};
 pointer('pointerdown',100);pointer('pointermove',150);pointer('pointerup',150);assert.equal(h.snapshot().options.playBpm,60);dial.dispatchEvent(new h.w.MouseEvent('dblclick',{bubbles:true}));assert.equal(h.snapshot().options.playBpm,120);
 pointer('pointerdown',100);pointer('pointermove',500);assert.equal(h.snapshot().options.playBpm,30);pointer('pointercancel',500);pointer('pointermove',0);assert.equal(h.snapshot().options.playBpm,30);
 pointer('pointerdown',100,2,'touch');pointer('pointerup',100,2,'touch');h.advance(150);pointer('pointerdown',100,3,'touch');pointer('pointerup',100,3,'touch');assert.equal(h.snapshot().options.playBpm,120);
 for(const value of ['',0,301,-1,'Infinity']){h.change('phrasePlayBpm',value);assert.equal(h.snapshot().options.playBpm,120);assert.match(h.el('phraseTimingError').textContent,/BPM/);}h.change('phrasePlayBpm',60);assert.equal(JSON.stringify(h.snapshot().notes),original);assert.equal(JSON.stringify(plain(h.snapshot()).controllers),raw);
 const reloaded=setup(h.w.localStorage.getItem('keymemory.phrase.v1'));assert.equal(reloaded.snapshot().options.playBpm,60);reloaded.close();
 h.change('phraseSectionStart',.5);h.change('phraseSectionEnd',2);assert.equal(h.snapshot().playbackDuration,3000);turn('Enter');assert.equal(h.snapshot().options.playBpm,120);h.change('phraseViewWindow',250);assert.equal(h.snapshot().options.playBpm,120);h.change('phraseTolerance',400);assert.equal(h.snapshot().playbackDuration,1500);assert.equal(h.snapshot().options.tolerance,400);
 // Normal-speed reset remains valid when the recorded BPM is at either extreme.
 for(const source of [30,300]){h.change('phraseSourceBpm',source);turn('Enter');assert.equal(h.snapshot().options.playBpm,source);assert.equal(dial.style.getPropertyValue('--dial-angle'),'0deg');}h.change('phraseSourceBpm',120);turn('Enter');
 // Loop state and source cursor wrap without a second count-in, including interpolated view frames.
 await beginPlay(h);assert.equal(h.el('phrasePlay').getAttribute('aria-pressed'),'true');assert.equal(h.el('phrasePlay').textContent,'Stop loop');assert.equal(h.d.querySelectorAll('.phraseInspectKey,.phraseInspectTail').length,0);h.advance(1490);h.change('phraseSpelling','flat');assert(Math.abs(+h.el('phraseViewTime').value-1.99)<1e-8);h.advance(30);h.change('phraseSpelling','sharp');assert(Math.abs(+h.el('phraseViewTime').value-.52)<1e-8);assert.equal(h.snapshot().loop,2);assert(h.el('phraseViewTime').disabled);const before=h.snapshot().elapsed;key(h,'Home');assert.equal(h.snapshot().elapsed,before);h.advance(3000);assert.equal(h.snapshot().state,'playing');h.click('phrasePlay');assert.equal(h.snapshot().state,'idle');assert.equal(h.el('phrasePlay').getAttribute('aria-pressed'),'false');const stopped=h.sounds.length;h.advance(10000);assert.equal(h.sounds.length,stopped);
 // Editing tempo stops a running loop; opening or closing the editor does not.
 await beginPlay(h);turn('Enter');pointer('pointerdown',100);pointer('pointermove',100);pointer('pointermove',102);pointer('pointerup',102);assert.equal(h.snapshot().state,'playing','no-op reset and tiny/horizontal drag do not interrupt playback');h.click('phraseTimingToggle');assert.equal(h.snapshot().state,'playing');h.click('phraseTimingToggle');assert.equal(h.snapshot().state,'playing');turn('ArrowLeft',true);assert.equal(h.snapshot().state,'idle');assert.equal(h.snapshot().options.playBpm,108);h.close();
 // Toggle off during count-in and pending audio, then exercise lifecycle cleanup.
 for(const action of ['countin','pending','blur','hidden','mode','settings','stop']){
  h=setupReady();if(action==='pending')h.defer(true);h.click('phrasePlay');if(action!=='pending')await flush();
  if(action==='pending'){assert(!h.el('phrasePlay').disabled);assert.equal(h.el('phrasePlay').textContent,'Stop loop');h.click('phrasePlay');for(const resolve of h.resumes)resolve();await flush();}
  else if(action==='countin')h.click('phrasePlay');
  else{h.advance(1500);if(action==='blur')h.w.dispatchEvent(new h.w.Event('blur'));if(action==='hidden'){Object.defineProperty(h.d,'hidden',{configurable:true,value:true});h.d.dispatchEvent(new h.w.Event('visibilitychange'));}if(action==='mode')h.mode('free');if(action==='settings')h.click('openSettings');if(action==='stop')h.click('phraseStop');}
  assert.equal(h.snapshot().state,'idle',action);const count=h.sounds.length;h.advance(20000);assert.equal(h.sounds.length,count,action);h.close();
 }
 // Empty, example and recording states make timing editing clearly unavailable.
 h=setup();h.mode('phrase');h.click('phraseTimingToggle');assert(h.el('phraseTimingDial').getAttribute('aria-disabled')==='true');assert.match(h.el('phraseTimingSummary').textContent,/Record a phrase/);h.close();
 h=setupReady();h.click('phraseViewExample');assert(h.el('phraseTimingDial').getAttribute('aria-disabled')==='true');assert.match(h.el('phraseTimingSummary').textContent,/Example only/);h.click('phraseViewExample');await h.connect();h.click('phraseRecord');await flush();assert(h.el('phraseTimingDial').getAttribute('aria-disabled')==='true');assert(h.el('phraseViewTime').disabled);h.advance(1500);assert(h.el('phraseTimingDial').getAttribute('aria-disabled')==='true');h.close();
 console.log('PASS: non-destructive staff-opened single speed dial; keyboard/mouse/touch reset, bounds, persistence and source preservation; section/zoom/tolerance separation; silent pointer/keyboard simultaneous-note and pedal inspection; loop toggle/count-in/pending/cleanup and exact source cursor wrap. Synthetic DOM/MIDI/audio only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
