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
// Independent integration fixture: all interactions go through real DOM listeners.
function ready(data=fixture){const h=setup(JSON.stringify(data));h.w.innerWidth=1280;h.w.innerHeight=900;h.mode('phrase');return h;}
function bounds(h){const o=h.snapshot().options;return [o.sectionStart,o.sectionEnd];}
function turn(h,bound,key,shiftKey=false){h.el('phraseLoop'+bound+'Handle').dispatchEvent(new h.w.KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true}));}
function watchWrites(h){let n=0;const proto=h.w.Storage.prototype,original=proto.setItem;proto.setItem=function(k,v){if(k==='keymemory.phrase.v1')n++;return original.call(this,k,v);};return()=>n;}
function pointerRig(h,matrix=true){
 const rect={left:0,top:0,right:1600,bottom:300,width:1600,height:300};
 h.el('phraseStaff').getBoundingClientRect=()=>rect;h.el('phraseScore').getBoundingClientRect=()=>rect;
 h.w.SVGElement.prototype.getBoundingClientRect=function(){const vb=(this.getAttribute('viewBox')||'0 0 800 300').split(/\s+/).map(Number);return {...rect,width:vb[2],height:vb[3]};};
 if(matrix)h.w.SVGElement.prototype.getScreenCTM=()=>({a:1,b:0,c:0,d:1,e:0,f:0});
 const svg=h.el('phraseStaff').querySelector('svg'),left=+svg.dataset.timeLeft,right=+svg.dataset.timeRight,start=+svg.dataset.timeStart,end=+svg.dataset.timeEnd;
 const px=ms=>left+(ms-start)/(end-start)*(right-left);
 return(type,bound,ms,id=17)=>{const event=new h.w.Event(type,{bubbles:true,cancelable:true});Object.entries({button:0,isPrimary:true,pointerId:id,clientX:px(ms),clientY:100,pointerType:'mouse'}).forEach(([k,v])=>Object.defineProperty(event,k,{value:v}));h.el('phraseLoop'+bound+'Handle').dispatchEvent(event);};
}
const cases=[];function test(name,fn){cases.push([name,fn]);}
test('numeric clamping, keyboard precision and accessible limits',()=>{
 const h=ready();try{
 assert.equal(h.el('phraseLoopStartHandle').getAttribute('role'),'slider');assert.match(h.el('phraseLoopStart').getAttribute('aria-label'),/original recording seconds/);
 h.change('phraseLoopStart',1.234);assert.deepEqual(bounds(h),[1234,4000]);turn(h,'Start','ArrowRight');turn(h,'Start','ArrowLeft',true);assert.equal(bounds(h)[0],1243);turn(h,'Start','PageUp');turn(h,'Start','PageDown');assert.equal(bounds(h)[0],1243);
 turn(h,'Start','End');assert.deepEqual(bounds(h),[3950,4000]);h.change('phraseLoopEnd',-5);assert.deepEqual(bounds(h),[3950,4000]);turn(h,'Start','Home');h.change('phraseLoopEnd',1);turn(h,'End','Home');assert.deepEqual(bounds(h),[0,50]);turn(h,'End','End');assert.deepEqual(bounds(h),[0,4000]);h.change('phraseLoopStart',-10);h.change('phraseLoopEnd',100);assert.deepEqual(bounds(h),[0,4000]);
 for(const invalid of ['','Infinity','NaN']){h.change('phraseLoopStart',invalid);h.change('phraseLoopEnd',invalid);assert.deepEqual(bounds(h),[0,4000]);}
 assert.equal(+h.el('phraseLoopStartHandle').getAttribute('aria-valuemax'),3.95);assert.equal(+h.el('phraseLoopEndHandle').getAttribute('aria-valuemin'),.05);
 }finally{h.close();}
});
test('loop handle keyboard edits reveal offscreen bounds and retain the focus target',()=>{
 const h=ready({...fixture,duration:12000});try{
 pointerRig(h);h.w.phraseTest.render();
 const assertRevealed=bound=>{const handle=h.el('phraseLoop'+bound+'Handle'),svg=h.el('phraseStaff').querySelector('svg'),value=bounds(h)[bound==='Start'?0:1];assert(!handle.hidden,bound+' handle remains visible');assert.equal(h.d.activeElement,handle,bound+' handle remains focused');assert(value>=+svg.dataset.timeStart&&value<=+svg.dataset.timeEnd,bound+' lies inside the visible time window');assert.equal(+handle.getAttribute('aria-valuenow'),value/1000);};
 const start=h.el('phraseLoopStartHandle');start.focus();assertRevealed('Start');turn(h,'Start','End');assert.equal(bounds(h)[0],11950);assertRevealed('Start');assert.equal(+h.el('phraseStaff').querySelector('svg').dataset.timeStart,6000);
 turn(h,'Start','Home');assert.equal(bounds(h)[0],0);assertRevealed('Start');assert.equal(+h.el('phraseStaff').querySelector('svg').dataset.timeStart,0);
 // Crossing the edge with an ordinary arrow must also reveal the edited point.
 h.change('phraseLoopStart',5.995);start.focus();turn(h,'Start','ArrowRight');assert.equal(bounds(h)[0],6005);assertRevealed('Start');assert(+h.el('phraseStaff').querySelector('svg').dataset.timeStart>0);
 turn(h,'Start','Home');h.change('phraseLoopEnd',5.995);const end=h.el('phraseLoopEndHandle');end.focus();assertRevealed('End');turn(h,'End','ArrowRight');assert.equal(bounds(h)[1],6005);assertRevealed('End');turn(h,'End','End');assert.equal(bounds(h)[1],12000);assertRevealed('End');turn(h,'End','Home');assert.equal(bounds(h)[1],50);assertRevealed('End');assert.equal(h.sounds.length,0);
 }finally{h.close();}
});
test('source-time minimum gap at tempo extremes and fractional final endpoint',()=>{
 for(const [source,play,gap]of [[30,300,500],[300,30,5],[120,121,51]]){const h=ready({...fixture,sourceBpm:source});try{h.change('phrasePlayBpm',play);turn(h,'Start','End');assert.deepEqual(bounds(h),[4000-gap,4000]);h.click('phraseLoopReset');turn(h,'End','Home');assert.deepEqual(bounds(h),[0,gap]);}finally{h.close();}}
 const h=ready({...fixture,duration:4000.625});try{h.change('phraseLoopEnd',2);h.click('phraseLoopReset');assert.deepEqual(bounds(h),[0,4000.625]);assert.equal(+h.el('phraseLoopEnd').value,4.000625);}finally{h.close();}
});
test('persisted edits and reset preserve raw notes and pedal/controllers',()=>{
 const h=ready();try{const before=plain(h.snapshot());h.change('phraseLoopStart',.321);h.change('phraseLoopEnd',2.123);const stored=h.w.localStorage.getItem('keymemory.phrase.v1'),reload=setup(stored);try{assert.deepEqual(bounds(reload),[321,2123]);}finally{reload.close();}
 for(const key of ['notes','controllers','initialControllers','duration'])assert.deepEqual(plain(h.snapshot())[key],before[key],key);h.click('phraseLoopReset');assert.deepEqual(bounds(h),[0,4000]);for(const key of ['notes','controllers','initialControllers','duration'])assert.deepEqual(plain(h.snapshot())[key],before[key],key);
 }finally{h.close();}
});
test('no-op controls preserve transport; real edits stop it',async()=>{
 const h=ready();try{await beginPlay(h);const writes=watchWrites(h);h.change('phraseLoopStart',0);h.change('phraseLoopEnd',4);turn(h,'Start','Home');turn(h,'End','End');h.click('phraseLoopReset');assert.equal(h.snapshot().state,'playing');assert.equal(writes(),0);h.change('phraseLoopStart',.1);assert.equal(h.snapshot().state,'idle');assert.equal(writes(),1);const count=h.sounds.length;h.advance(5000);assert.equal(h.sounds.length,count);}finally{h.close();}
});
test('pointer drafts use stable coordinates, clamp crossing and persist only once',()=>{
 for(const matrix of [true,false]){const h=ready();try{const pointer=pointerRig(h,matrix),writes=watchWrites(h);pointer('pointerdown','Start',0);pointer('pointermove','Start',1000);assert.deepEqual(bounds(h),[0,4000]);assert.equal(+h.el('phraseLoopStart').value,1);assert.equal(writes(),0);pointer('pointermove','Start',9000);assert.equal(+h.el('phraseLoopStart').value,3.95);pointer('pointermove','Start',750);assert.equal(+h.el('phraseLoopStart').value,.75);pointer('pointerup','Start',750);assert.deepEqual(bounds(h),[750,4000]);assert.equal(writes(),1);pointer('pointerup','Start',750);assert.equal(writes(),1);
 pointer('pointerdown','End',4000);pointer('pointermove','End',-9000);pointer('pointerup','End',-9000);assert.deepEqual(bounds(h),[750,800]);assert.equal(writes(),2);
 }finally{h.close();}}
});
test('draft cancellation never persists and ignores late pointer-up',async()=>{
 for(const action of ['Escape','pointercancel','lostpointercapture','blur','mode','resize','visibility','settings','play','practice']){const h=ready();try{const pointer=pointerRig(h),writes=watchWrites(h);pointer('pointerdown','Start',0);pointer('pointermove','Start',1000);if(action==='Escape')turn(h,'Start','Escape');else if(action==='pointercancel'||action==='lostpointercapture')pointer(action,'Start',1000);else if(action==='mode')h.mode('free');else if(action==='settings')h.click('openSettings');else if(action==='play'||action==='practice'){h.click(action==='play'?'phrasePlay':'phrasePractice');await flush();}else if(action==='visibility'){Object.defineProperty(h.d,'hidden',{configurable:true,value:true});h.d.dispatchEvent(new h.w.Event('visibilitychange'));}else h.w.dispatchEvent(new h.w.Event(action));pointer('pointerup','Start',1000);assert.deepEqual(bounds(h),[0,4000],action);assert.equal(writes(),0,action);
 }finally{h.close();}}
});
test('genuine pointer edits stop playback, motionless pointer does not',async()=>{
 const h=ready();try{await beginPlay(h);const pointer=pointerRig(h),writes=watchWrites(h);pointer('pointerdown','Start',0);pointer('pointermove','Start',0);pointer('pointerup','Start',0);assert.equal(h.snapshot().state,'playing');assert.equal(writes(),0);pointer('pointerdown','Start',0);pointer('pointermove','Start',500);assert.equal(h.snapshot().state,'idle');assert.equal(writes(),0);turn(h,'Start','Escape');assert.deepEqual(bounds(h),[0,4000]);assert.equal(writes(),0);}finally{h.close();}
});
test('source loop bounds schedule clipped notes, pedal baseline and exact repeated period',async()=>{
 const h=ready();try{h.change('phraseLoopStart',.75);h.change('phraseLoopEnd',2.25);h.change('phrasePlayBpm',60);await beginPlay(h);assert.equal(h.snapshot().playbackDuration,3000);const start=h.sounds[0][3];assert.deepEqual(h.sounds.slice(0,3).map(n=>[n[0],n[2],n[3]-start,n[4].keyDuration]),[[60,2100,0,0],[64,2100,0,0],[67,1000,0,1000]]);assert(h.controls.some(([c])=>c.controller===64&&c.channel===0&&c.initial&&c.value===127&&c.at===start));h.advance(2600);assert(h.sounds.some(n=>n[0]===72&&n[2]===500&&n[3]===start+2500));assert(h.controls.some(([c])=>c.controller===64&&c.channel===0&&!c.initial&&c.value===0&&c.at===start+2100));h.advance(500);assert.equal(h.snapshot().loop,2);assert(h.sounds.some(n=>n[0]===60&&n[3]===start+3000));assert.equal(h.snapshot().state,'playing');}finally{h.close();}
});
test('empty, example and recording states cannot edit loops or delete recording',async()=>{
 const empty=setup();try{empty.mode('phrase');assert(empty.el('phraseLoopStart').disabled);assert(empty.el('phraseDelete').disabled);}finally{empty.close();}
 const h=ready();try{h.click('phraseViewExample');assert(h.el('phraseLoopStart').disabled);assert(h.el('phraseLoopEndHandle').disabled);h.change('phraseLoopStart',1);turn(h,'End','Home');assert.deepEqual(bounds(h),[0,4000]);h.click('phraseViewExample');await h.connect();h.click('phraseRecord');await flush();for(const state of ['record-countin','recording']){assert.equal(h.snapshot().state,state);assert(h.el('phraseLoopStart').disabled);assert(h.el('phraseDelete').disabled);h.change('phraseLoopStart',1);turn(h,'End','Home');assert.deepEqual(bounds(h),[0,4000]);if(state==='record-countin')h.advance(1500);}}finally{h.close();}
});
test('both delete entry points confirm; cancellation preserves playback/source/options; accept removes stale selection',async()=>{
 for(const button of ['phraseDelete','phraseClear']){const h=ready();try{h.change('phraseLoopStart',.5);h.change('phraseLoopEnd',2);h.change('phraseViewTime',1);await beginPlay(h);let asked=0;h.w.confirm=message=>{asked++;assert.match(message,/Delete the saved phrase from this browser/);return false;};const source=h.w.localStorage.getItem('keymemory.phrase.v1'),options=plain(h.snapshot().options);h.click(button);assert.equal(asked,1);assert.equal(h.snapshot().state,'playing');assert.equal(h.w.localStorage.getItem('keymemory.phrase.v1'),source);assert.deepEqual(plain(h.snapshot().options),options);
 h.click('phraseStop');h.change('phraseViewTime',1);h.w.confirm=()=>true;h.click(button);assert.equal(h.snapshot().state,'idle');assert.equal(h.snapshot().notes.length,0);assert.equal(h.w.localStorage.getItem('keymemory.phrase.v1'),null);assert.equal(+h.el('phraseViewTime').value,0);assert.equal(h.d.querySelectorAll('.phraseInspectKey,.phraseInspectTail,.staffSelectedKey,.staffSelectedTail').length,0);assert.equal(h.get().selected.length,0);assert(h.el('phraseDelete').disabled);
 }finally{h.close();}}
});
function assertOriginalEmpty(h){assert.equal(h.snapshot().notes.length,0);assert.equal(h.snapshot().options.transpose,0);assert.equal(h.el('phraseTransposeValue').textContent,'Original');assert(h.el('phraseDown').disabled);assert(h.el('phraseUp').disabled);}
test('empty initial phrase rejects transpose attempts and remains Original',()=>{
 const h=setup();try{h.mode('phrase');assertOriginalEmpty(h);for(const id of ['phraseUp','phraseDown']){h.click(id);assertOriginalEmpty(h);h.el(id).dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));assertOriginalEmpty(h);}h.w.phraseTest.render();h.mode('free');h.mode('phrase');assertOriginalEmpty(h);}finally{h.close();}
});
test('delete a transposed phrase resets Original and disables transpose at both entry points',()=>{
 for(const button of ['phraseDelete','phraseClear']){const h=ready();try{h.click('phraseUp');h.click('phraseUp');assert.equal(h.snapshot().options.transpose,2);assert.equal(h.el('phraseTransposeValue').textContent,'+2 st');h.w.confirm=()=>false;h.click(button);assert.equal(h.snapshot().options.transpose,2);h.w.confirm=()=>true;h.click(button);assertOriginalEmpty(h);assert.equal(h.w.localStorage.getItem('keymemory.phrase.v1'),null);h.el('phraseUp').dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));assertOriginalEmpty(h);}finally{h.close();}}
});
test('empty legacy storage cannot restore stale transpose',()=>{
 for(const version of [1,2]){const data={...fixture,version,notes:[],controllers:[],duration:0,options:{metronome:true,sourceBpm:120,playBpm:120,transpose:-7,rhythm:false,tolerance:200,sectionStart:0,sectionEnd:120000}},h=ready(data);try{assertOriginalEmpty(h);const persisted=h.w.localStorage.getItem('keymemory.phrase.v1');if(persisted)assert.equal(JSON.parse(persisted).options.transpose,0,'empty stored phrase is cleaned or normalized');}finally{h.close();}}
});
test('live phrase transpose survives ordinary render, view and loop edits',()=>{
 const h=ready();try{h.click('phraseDown');h.click('phraseDown');h.click('phraseDown');const original=plain(h.snapshot().notes);for(const action of [()=>h.w.phraseTest.render(),()=>h.change('phraseViewTime',1),()=>h.change('phraseViewWindow',250),()=>h.change('phraseSpelling','flat'),()=>h.change('phraseLoopStart',.5),()=>h.change('phraseLoopEnd',2),()=>h.click('phraseLoopReset'),()=>h.mode('free'),()=>h.mode('phrase')]){action();assert.equal(h.snapshot().options.transpose,-3);assert.equal(h.el('phraseTransposeValue').textContent,'-3 st');assert.deepEqual(plain(h.snapshot().notes),original);}const reloaded=setup(h.w.localStorage.getItem('keymemory.phrase.v1'));try{assert.equal(reloaded.snapshot().options.transpose,-3);}finally{reloaded.close();}}finally{h.close();}
});
(async()=>{let failures=0;for(const[name,run]of cases){try{await run();console.log('PASS:',name);}catch(error){failures++;console.error('FAIL:',name,'\n',error);}}if(failures)process.exitCode=1;else console.log('PASS: all phrase loop/delete synthetic DOM integration checks.');})();
