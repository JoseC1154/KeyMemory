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
 return{engine:()=>engine,w,d,el,click,change,send,off,advance,connect,port,access,sounds,controls,oscillators,resumes,defer:value=>{defer=value;},cc:(controller,value,channel=0)=>send(controller,value,channel,0xb0),mode:m=>w.phraseTest.mode(m),get:()=>w.phraseTest.get(),snapshot:()=>engine.snapshot(),transportTimers:()=>[...timers].filter(([,v])=>v.fn.name!=='renderPhraseView').map(([id,v])=>({id,time:v.time,repeat:v.repeat})),now:()=>now,close:()=>w.close()};
}
async function beginPlay(h){
 h.click('phrasePlay');await flush();if(h.snapshot().state!=='play-countin')return;
 const beat=60000/h.snapshot().options.playBpm;
 // Section count-ins preserve source beat phase; duration remains one 4/4 bar.
 h.advance(4*beat);assert.equal(h.snapshot().state,'playing');
}
const plain=value=>JSON.parse(JSON.stringify(value));
const fixture={version:3,origin:'audio',sourceBpm:120,duration:12000,notes:[
 {note:60,velocity:90,channel:0,start:123.456789,duration:500.123456},
 {note:60,velocity:80,channel:1,start:123.456789,duration:1000.987654},
 {note:64,velocity:70,channel:0,start:2345.6789,duration:600.12345},
 {note:72,velocity:80,channel:2,start:9000.123456,duration:800.234567}],
 controllers:[{controller:64,value:127,channel:0,time:100},{controller:64,value:0,channel:0,time:1800}],initialControllers:Array.from({length:16},(_,channel)=>[7,11,64].map(controller=>({channel,controller,value:controller===7?100:controller===11?127:0}))).flat()};
function ready(data=fixture){const h=setup(JSON.stringify(data));h.w.innerWidth=1280;h.w.innerHeight=900;h.mode('phrase');return h;}
function stored(h){return h.w.localStorage.getItem('keymemory.phrase.v1');}
function mark(h,id){return [...h.el('phraseStaff').querySelectorAll('.staffTimelineNote')].find(g=>g.dataset.noteIds.split(',').includes(String(id)));}
function tap(h,id){mark(h,id).querySelector('.staffNoteHead').dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,detail:1,clientX:100,clientY:100}));}
function pointer(h,type,target,extra={}){const e=new h.w.Event(type,{bubbles:true,cancelable:true});for(const[k,v]of Object.entries({button:0,pointerId:1,pointerType:'touch',isPrimary:true,clientX:100,clientY:100,...extra}))Object.defineProperty(e,k,{value:v});target.dispatchEvent(e);return e;}
function key(h,key,extra={}){h.el('phraseStaff').dispatchEvent(new h.w.KeyboardEvent('keydown',{key,...extra,bubbles:true,cancelable:true}));}
function edit(h){h.click('phraseEditNotes');assert(!h.el('phraseNoteEditor').hidden);assert.equal(h.el('phraseStaff').getAttribute('role'),'group');}
(async()=>{
 // Ordinary staff stays read-only; editing, selecting and dismissing do not save.
 let h=ready(),before=stored(h);tap(h,2);assert.equal(stored(h),before);assert(h.el('phraseNoteEditor').hidden);edit(h);tap(h,2);assert.equal(h.el('phraseNoteChoice').value,'2');assert(!h.el('phraseNoteDelete').disabled);assert(mark(h,2).classList.contains('noteEditSelected'));assert(h.el('phraseRoll').querySelector('[data-note-id="2"].noteEditSelected'));assert.equal(stored(h),before);h.click('phraseEditNotes');assert.equal(h.el('phraseStaff').getAttribute('role'),'slider');assert(h.el('phraseNoteEditor').hidden);assert.equal(stored(h),before);h.close();
 // A single targeted deletion changes only the selected raw event; Undo restores exactly.
 h=ready();edit(h);tap(h,2);let original=plain(h.snapshot());h.click('phraseNoteDelete');assert.deepEqual(plain(h.snapshot().notes),original.notes.filter((_,i)=>i!==2));for(const field of ['controllers','initialControllers','options','duration','origin'])assert.deepEqual(plain(h.snapshot()[field]),original[field]);assert.match(h.el('phraseNoteEditStatus').textContent,/Deleted E4/);assert.equal(h.d.activeElement,h.el('phraseNoteUndo'));assert.equal(h.el('phraseStaff').querySelectorAll('.noteEditSelected').length,0);h.click('phraseNoteDelete');assert.equal(h.snapshot().notes.length,3);h.click('phraseNoteUndo');assert.deepEqual(plain(h.snapshot().notes),original.notes);assert.equal(h.d.activeElement,h.el('phraseNoteChoice'));assert(h.el('phraseNoteUndo').disabled);h.close();
 // A merged unison never silently chooses/deletes one voice. Channel selection is explicit.
 h=ready();edit(h);tap(h,0);assert.equal(h.el('phraseNoteChoice').value,'');assert(h.el('phraseNoteDelete').disabled);assert.equal(h.el('phraseNoteChoice').options.length,3);assert.match(h.el('phraseNoteEditStatus').textContent,/2 notes overlap/);assert.equal(h.d.activeElement,h.el('phraseNoteChoice'));h.change('phraseNoteChoice',1);assert.match(h.el('phraseNoteEditStatus').textContent,/channel 2/);h.click('phraseNoteDelete');assert.equal(h.snapshot().notes.length,3);assert.deepEqual(plain(h.snapshot().notes[0]),fixture.notes[0]);h.click('phraseNoteUndo');assert.deepEqual(plain(h.snapshot().notes),fixture.notes);h.close();
 // Native touch scroll/cancel and mouse drags are not deletion selections.
 h=ready();edit(h);let target=mark(h,2).querySelector('.staffNoteHead');assert(!pointer(h,'pointerdown',target).defaultPrevented);pointer(h,'pointermove',target,{clientX:130});pointer(h,'pointerup',target,{clientX:130});tap(h,2);assert(h.el('phraseNoteDelete').disabled);
 target=mark(h,2).querySelector('.staffNoteHead');pointer(h,'pointerdown',target);pointer(h,'pointercancel',target);tap(h,2);assert(h.el('phraseNoteDelete').disabled);
 target=mark(h,2).querySelector('.staffNoteHead');pointer(h,'pointerdown',target);h.el('phraseStaff').dispatchEvent(new h.w.Event('scroll'));pointer(h,'pointerup',target);tap(h,2);assert(h.el('phraseNoteDelete').disabled);
 target=mark(h,2).querySelector('.staffNoteHead');pointer(h,'pointerdown',target);pointer(h,'pointerup',target);pointer(h,'lostpointercapture',target);tap(h,2);assert.equal(h.el('phraseNoteChoice').value,'2');assert.equal(h.sounds.length,0);h.close();
 // Losing capture before release cancels selection, unlike normal post-release capture loss.
 h=ready();edit(h);target=mark(h,2).querySelector('.staffNoteHead');pointer(h,'pointerdown',target);pointer(h,'lostpointercapture',target);pointer(h,'pointerup',target);tap(h,2);assert(h.el('phraseNoteDelete').disabled);h.close();
 // 44px nearby touch targets disambiguate dense marks, never silently remove a neighbor.
 h=ready();edit(h);for(const g of h.el('phraseStaff').querySelectorAll('.staffTimelineNote'))g.querySelector('.staffNoteHead').getBoundingClientRect=()=>({left:95,top:95,width:10,height:10});h.el('phraseStaff').dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,detail:1,clientX:100,clientY:100}));assert(h.el('phraseNoteDelete').disabled);assert.match(h.el('phraseNoteEditStatus').textContent,/3 notes overlap/);h.close();
 // Exact head hits disambiguate chromatic/continuation overlap, while offset labels select directly.
 h=ready();edit(h);for(const g of h.el('phraseStaff').querySelectorAll('.staffTimelineNote'))g.querySelector('.staffNoteHead').getBoundingClientRect=()=>({left:95,right:105,top:95,bottom:105,width:10,height:10});tap(h,2);assert(h.el('phraseNoteDelete').disabled);assert.match(h.el('phraseNoteEditStatus').textContent,/3 notes overlap/);mark(h,2).querySelector('.staffNoteLabel').dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,detail:1}));assert.equal(h.el('phraseNoteChoice').value,'2');h.close();
 // The selected note remains rendered and choosable beyond the 400-note display cap.
 h=ready({...fixture,notes:Array.from({length:450},(_,i)=>({note:60+i%12,channel:0,velocity:90,start:100+i,duration:100}))});edit(h);h.el('phraseStaff').focus();key(h,'End');assert.equal(h.el('phraseNoteChoice').value,'449');assert(mark(h,449));assert(mark(h,449).classList.contains('noteEditSelected'));assert(h.el('phraseStaff').querySelectorAll('.staffTimelineNote').length<=400);h.click('phraseNoteDelete');assert.equal(h.snapshot().notes.length,449);h.click('phraseNoteUndo');assert.equal(h.snapshot().notes.length,450);h.close();
 // Accessible native choice / arrows can reach offscreen notes; delete/Undo shortcuts are scoped.
 h=ready();edit(h);h.el('phraseStaff').focus();key(h,'End');assert.equal(h.el('phraseNoteChoice').value,'3');assert(mark(h,3));assert.equal(h.d.activeElement,h.el('phraseStaff'));key(h,'Delete');assert.equal(h.snapshot().notes.length,3);h.el('phraseStaff').focus();key(h,'z',{ctrlKey:true});assert.equal(h.snapshot().notes.length,4);key(h,'Home');assert.equal(h.el('phraseNoteChoice').value,'0');key(h,'ArrowRight');assert.equal(h.el('phraseNoteChoice').value,'1');key(h,'Escape');assert(h.el('phraseNoteEditor').hidden);assert.equal(h.d.activeElement,h.el('phraseEditNotes'));key(h,'Delete');assert.equal(h.snapshot().notes.length,4);h.close();
 // Final note deletion remains recoverable, without clearing duration or controller events.
 h=ready({...fixture,notes:[fixture.notes[2]]});edit(h);tap(h,0);h.click('phraseNoteDelete');assert.equal(h.snapshot().notes.length,0);assert(!h.el('phraseNoteEditor').hidden);assert(!h.el('phraseNoteUndo').disabled);assert.equal(h.snapshot().duration,12000);h.click('phraseNoteUndo');assert.deepEqual(plain(h.snapshot().notes),[fixture.notes[2]]);h.close();
 // Replacements invalidate selections and cached same-shape note models, not just counts.
 h=ready();edit(h);tap(h,2);const replacement={duration:12000,sourceBpm:120,notes:fixture.notes.map((n,i)=>({...n,note:i===2?65:n.note}))};assert(h.engine().importPhrase(replacement));assert(h.el('phraseNoteDelete').disabled);assert.equal(mark(h,2).dataset.midi,'65');h.click('phraseNoteDelete');assert.equal(h.snapshot().notes.length,4);h.close();
 // Transpose/loop/grid changes keep exact raw-event selection; playback/recording/mode changes exit editing.
 h=ready();edit(h);tap(h,2);h.change('phrasePlayBpm',60);h.change('phraseLoopStart',1);assert.equal(h.el('phraseNoteChoice').value,'2');original=plain(h.snapshot());h.click('phraseNoteDelete');assert.deepEqual(plain(h.snapshot().options),original.options);assert.equal(h.sounds.length,0);await beginPlay(h);assert(h.el('phraseNoteEditor').hidden);assert(h.el('phraseEditNotes').disabled);h.click('phraseNoteDelete');assert.equal(h.snapshot().notes.length,3);h.engine().stop();edit(h);h.mode('free');assert(h.el('phraseNoteEditor').hidden);h.mode('phrase');assert.equal(h.el('phraseEditNotes').getAttribute('aria-pressed'),'false');h.close();
 // Undo explains a later incompatible transposition and remains available after correction.
 h=ready({...fixture,notes:[{...fixture.notes[0],note:127},{...fixture.notes[2],note:60}]});edit(h);tap(h,0);h.click('phraseNoteDelete');h.engine().setOptions({transpose:12});h.click('phraseNoteUndo');assert.equal(h.snapshot().notes.length,1);assert(!h.el('phraseNoteUndo').disabled);assert.match(h.el('phraseNoteEditStatus').textContent,/Reset transpose/);assert(!h.el('phraseScore').hidden);h.engine().setOptions({transpose:0});h.click('phraseNoteUndo');assert.equal(h.snapshot().notes.length,2);h.close();
 // Narrow screens use the same optional controls and preserve every event until Delete.
 for(const [width,height]of[[390,844],[320,740],[844,390]]){h=ready();h.w.innerWidth=width;h.w.innerHeight=height;h.w.dispatchEvent(new h.w.Event('resize'));h.click('phraseViewSwitch');edit(h);h.change('phraseNoteChoice',2);assert.equal(h.snapshot().notes.length,4);h.click('phraseNoteDelete');h.click('phraseNoteUndo');assert.deepEqual(plain(h.snapshot().notes),fixture.notes);h.close();}
 console.log('PASS staff note editor: explicit mode, single-note/merged-unison choice, exact delete/Undo, keyboard/focus/offscreen navigation, touch drag/cancel/scroll isolation, hit-area disambiguation, zero-note recovery, stale selection/cache, preserved loops/controllers/timing, playback/mode guards and narrow viewport DOM paths. No native layout/device claim.');
})().catch(error=>{console.error(error);process.exitCode=1;});
