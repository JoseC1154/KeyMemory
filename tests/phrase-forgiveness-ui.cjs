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
// Native range default key behavior is browser-owned; jsdom cannot simulate it.
// These checks verify focus and that app key handlers do not prevent native keys.
const cases=[];function test(name,run){cases.push([name,run]);}
function ready(options){const data=options?{...fixture,options:{metronome:true,sourceBpm:120,playBpm:120,transpose:0,rhythm:false,tolerance:200,sectionStart:0,sectionEnd:4000,...options}}:fixture;const h=setup(JSON.stringify(data));h.mode('phrase');return h;}
function writes(h){let n=0;const p=h.w.Storage.prototype,fn=p.setItem;p.setItem=function(k,v){if(k==='keymemory.phrase.v1')n++;return fn.call(this,k,v);};return()=>n;}
function invariant(h){const s=h.snapshot(),{tolerance,rhythm,...options}=s.options;return JSON.stringify({notes:s.notes,controllers:s.controllers,initialControllers:s.initialControllers,duration:s.duration,options});}
function label(h){return h.el('phraseForgivenessValue').textContent;}
function disabled(h,value){for(const id of ['phraseForgiveness','phraseRhythmToggle'])assert.equal(h.el(id).disabled,value,id);}
test('accessible native controls, default200 and native focus/keyboard contract',()=>{
 const h=ready();try{const r=h.el('phraseForgiveness');assert.equal(r.type,'range');assert.equal(r.step,'1');assert.equal(r.min,'80');assert.equal(r.max,'1000');assert.equal(+r.value,200);assert.equal(h.el('phraseRhythmToggle').type,'checkbox');assert.equal(h.el('phraseTolerance').type,'number');assert.equal(h.el('phraseTolerance').value,'200');assert(r.getAttribute('aria-label'));assert(h.el(r.getAttribute('aria-describedby')));assert.match(label(h),/Chords 200 ms/);r.focus();assert.equal(h.d.activeElement,r);for(const key of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown']){const e=new h.w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});r.dispatchEvent(e);assert.equal(e.defaultPrevented,false,key+' stays native');}assert.equal(h.snapshot().options.tolerance,200);}finally{h.close();}
});
test('native-equivalent one-ms arrow edits persist 200 to201 to200',()=>{
 const h=ready();try{const r=h.el('phraseForgiveness'),count=writes(h);r.focus();assert.equal(r.step,'1');for(const value of [201,200]){const old=h.snapshot().options.tolerance;input(h,'phraseForgiveness',value);assert.equal(h.snapshot().options.tolerance,old,'input is preview only');assert.match(label(h),new RegExp(value+' ms'));h.change('phraseForgiveness',value);assert.equal(h.snapshot().options.tolerance,value);assert.equal(+r.value,value);assert.equal(+h.el('phraseTolerance').value,value);assert.equal(h.d.activeElement,r);}assert.equal(count(),2);}finally{h.close();}
});
test('preview preserves engine until change; rounds/clamps, persists once and stops playback',async()=>{
 const h=ready();try{await beginPlay(h);const original=invariant(h),count=writes(h),r=h.el('phraseForgiveness');r.focus();input(h,'phraseForgiveness',347.4);assert.match(label(h),/Chords 347 ms/);assert.equal(h.snapshot().options.tolerance,200);assert.equal(h.snapshot().state,'playing');assert.equal(count(),0);h.change('phraseForgiveness',347.4);assert.equal(h.snapshot().options.tolerance,347);assert.equal(h.snapshot().state,'idle');assert.equal(count(),1);assert.equal(r.value,'347');assert.equal(h.el('phraseTolerance').value,'347');h.change('phraseForgiveness',347);assert.equal(count(),1);h.change('phraseForgiveness',0);assert.equal(h.snapshot().options.tolerance,80);h.change('phraseForgiveness',2000);assert.equal(h.snapshot().options.tolerance,1000);assert.equal(count(),3);assert.equal(invariant(h),original);const reload=setup(h.w.localStorage.getItem('keymemory.phrase.v1'));try{assert.equal(reload.snapshot().options.tolerance,1000);}finally{reload.close();}}finally{h.close();}
});
test('legacy333 remains exact until edited and Settings numeric synchronizes',()=>{
 const h=ready({tolerance:333});try{const count=writes(h);assert.equal(h.el('phraseForgiveness').value,'333');assert.equal(h.el('phraseTolerance').value,'333');assert.match(label(h),/333 ms/);h.w.phraseTest.render();assert.equal(h.snapshot().options.tolerance,333);assert.equal(count(),0);h.change('phraseTolerance',456);assert.equal(h.el('phraseForgiveness').value,'456');assert.match(label(h),/456 ms/);input(h,'phraseForgiveness',456);assert.equal(h.snapshot().options.tolerance,456);h.change('phraseForgiveness',456);assert.equal(h.snapshot().options.tolerance,456);assert.equal(h.el('phraseTolerance').value,'456');}finally{h.close();}
});
test('rhythm toggle and notes-only actual chord grace reflect tempo, without changing source',()=>{
 const h=ready({tolerance:80});try{const original=invariant(h);assert.match(label(h),/Chords 180 ms/);h.click('phraseRhythmToggle');assert.equal(h.snapshot().options.rhythm,true);assert.equal(h.el('phraseRhythm').value,'rhythm');assert.equal(label(h),'±80 ms');assert.match(h.el('phraseForgiveness').getAttribute('aria-valuetext'),/early or late after count-in/);assert.equal(invariant(h),original);h.change('phraseRhythm','notes');assert.equal(h.el('phraseRhythmToggle').checked,false);h.change('phraseSourceBpm',300);h.change('phrasePlayBpm',30);assert.equal(label(h),'Chords 800 ms');assert.match(h.el('phraseForgiveness').getAttribute('aria-valuetext'),/single notes have no onset deadline/);}finally{h.close();}
});
test('cancel, Escape and blur restore uncommitted preview',()=>{
 const h=ready({tolerance:333});try{const count=writes(h),r=h.el('phraseForgiveness');for(const kind of ['pointercancel','Escape','blur']){r.focus();input(h,'phraseForgiveness',900);assert.match(label(h),/900 ms/);if(kind==='Escape')r.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));else r.dispatchEvent(new h.w.Event(kind,{bubbles:true}));assert.equal(r.value,'333');assert.match(label(h),/333 ms/);assert.equal(h.snapshot().options.tolerance,333);}assert.equal(count(),0);}finally{h.close();}
});
test('empty, example, recording/count-in and pending audio disable both controls',async()=>{
 let h=setup();try{h.mode('phrase');disabled(h,true);}finally{h.close();}
 h=ready();try{disabled(h,false);h.click('phraseViewExample');disabled(h,true);h.click('phraseViewExample');disabled(h,false);await h.connect();h.click('phraseRecord');await flush();assert.equal(h.snapshot().state,'record-countin');disabled(h,true);h.advance(1500);assert.equal(h.snapshot().state,'recording');disabled(h,true);h.click('phraseStop');disabled(h,false);}finally{h.close();}
 h=ready();try{h.defer(true);h.click('phrasePlay');disabled(h,true);h.click('phraseStop');await flush();disabled(h,false);for(const resolve of h.resumes)resolve();await flush();assert.equal(h.snapshot().state,'idle');}finally{h.close();}
});
test('forgiving mode still rejects wrong MIDI pitch and preserves source',async()=>{
 const h=ready();try{await h.connect();h.change('phraseForgiveness',1000);h.click('phraseRhythmToggle');const original=invariant(h);h.click('phrasePractice');await flush();h.advance(2000);assert.equal(h.snapshot().state,'practice');h.send(61);assert.equal(h.snapshot().state,'wait-release');assert.match(h.snapshot().error,/Wrong note/);assert.equal(invariant(h),original);}finally{h.close();}
});
test('playing refresh keeps focused uncommitted preview label consistent with thumb',async()=>{
 const h=ready();try{await beginPlay(h);const r=h.el('phraseForgiveness');r.focus();input(h,'phraseForgiveness',900);h.advance(100);assert.equal(r.value,'900');assert.match(label(h),/900 ms/);assert.match(r.getAttribute('aria-valuetext'),/900 milliseconds/);assert.equal(h.snapshot().options.tolerance,200);}finally{h.close();}
});
(async()=>{let failures=0;for(const[name,run]of cases){try{await run();console.log('PASS:',name);}catch(error){failures++;console.error('FAIL:',name,'\n',error);}}if(failures)process.exitCode=1;else console.log('PASS: phrase forgiveness synthetic DOM/MIDI integration; actual browser keyboard stepping unverified; native-equivalent input/change edits tested.');})();
