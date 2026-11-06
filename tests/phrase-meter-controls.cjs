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
const fixture={version:2,sourceBpm:120,duration:4000,notes:[
 {note:60,velocity:90,channel:0,start:0,duration:500},
 {note:64,velocity:90,channel:0,start:0,duration:500},
 {note:67,velocity:90,channel:1,start:250,duration:1000},
 {note:72,velocity:90,channel:1,start:2000,duration:500}],
 controllers:[{controller:64,value:127,channel:0,time:100},{controller:64,value:0,channel:0,time:1800}],initialControllers:Array.from({length:16},(_,channel)=>[7,11,64].map(controller=>({channel,controller,value:controller===7?100:controller===11?127:0}))).flat()};
const saved=JSON.stringify(fixture),plain=v=>JSON.parse(JSON.stringify(v));

const h=setup(saved);h.w.innerWidth=1280;h.w.innerHeight=900;h.mode('phrase');
try{
 const raw=plain(h.snapshot().notes),change=h.change;
 assert.equal(h.el('phraseMeterNumerator').value,'4');assert.match(h.el('phraseGridHint').textContent,/not detected/);
 change('phraseMeterNumerator',6);change('phraseMeterDenominator',8);
 assert.equal(h.snapshot().options.sourceBpm,120);assert.equal(+h.el('phrasePulseBpm').value,80);assert.equal(h.el('phrasePulseUnit').textContent,'dotted quarter BPM');
 change('phrasePlayBpm',180);change('phrasePulseBpm',100);assert.equal(h.snapshot().options.sourceBpm,150);assert.equal(h.snapshot().options.playBpm,225);
 change('phrasePulseBpm',220);assert.equal(h.snapshot().options.sourceBpm,150);assert.match(h.snapshot().error,/outside/);
 change('phrasePulseBpm',80);change('phrasePlayBpm',120);
 change('phraseLoopStart',.321);const before=h.snapshot().options.sectionStart;change('phraseLoopSnap','beat');assert.equal(h.snapshot().options.sectionStart,before);
 change('phraseLoopStart',.8);assert.equal(h.snapshot().options.sectionStart,750);
 h.el('phraseLoopStartHandle').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(h.snapshot().options.sectionStart,1500);
 change('phraseLoopSnap','free');change('phraseLoopStart',.321);h.el('phraseLoopStartHandle').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true}));assert.equal(h.snapshot().options.sectionStart,322);
 h.el('phraseViewTime').value='0.25';h.el('phraseViewTime').dispatchEvent(new h.w.Event('input'));h.click('phraseBarOne');assert.equal(h.snapshot().options.gridOriginMs,250);
 assert.match(h.el('phraseLoopStartHandle').getAttribute('aria-valuetext'),/Bar.*source seconds/);
 h.click('phraseGridReset');assert.equal(h.snapshot().options.gridOriginMs,0);
 h.click('phraseLoopPadEnd');assert.equal(h.snapshot().options.sectionEnd,4500);assert.equal(h.snapshot().duration,4000);assert.equal(+h.el('phraseViewTime').max,4.5);
 h.el('phraseViewTime').value='4.4';h.el('phraseViewTime').dispatchEvent(new h.w.Event('input'));assert.match(h.el('phraseViewTimeLabel').textContent,/4.400 source seconds/);
 assert(h.el('phraseStaff').querySelectorAll('.musicalGridTick').length>0);assert(h.el('phraseRoll').querySelectorAll('.musicalGridTick').length>0);
 h.click('phraseLoopPadEnd');assert.equal(h.snapshot().options.sectionEnd,4000);assert.deepEqual(plain(h.snapshot().notes),raw);
 change('phraseCountInBars',0);assert.equal(h.snapshot().options.countInBars,0);
 change('phraseViewVisibility','hide');assert.equal(h.el('phraseMeterControls').hidden,false);assert.equal(h.el('phraseScore').hidden,true);
 h.click('phraseTap');h.advance(750);h.click('phraseTap');assert.equal(h.snapshot().options.sourceBpm,120);
 h.w.eval('currentDialog="settingsOverlay"');change('phraseSectionStart',.6);assert.equal(h.snapshot().options.sectionStart,600);
 console.log('PASS: meter pulse conversion, tempo ratio/rejection, reference-only setup, snap/no movement, free precision, origin, padding/silent cursor and grid UI');
}finally{h.close();}
// Grid is a bounded visual layer, never a quantizer or note-duration edit.
const view=require('../phrase-view.js');const model=view.prepareTimeline(fixture),base=view.timelineStaffSVG(model),grid=view.timelineStaffSVG(model,{grid:[{time:250,kind:'beat',label:'Bar 1 · beat 2'}],gridConfirmed:false});
assert.match(grid,/musicalGridTick/);assert.match(grid,/unconfirmed reference/);
const onsets=svg=>[...svg.matchAll(/data-onset-x="([^"]+)"/g)].map(m=>m[1]);assert(onsets(base).length>0);assert.deepEqual(onsets(base),onsets(grid));
console.log('PASS: exact-time renderer remains backward compatible and unconfirmed grid is marked');

const pedal=setup(JSON.stringify({...fixture,controllers:[{controller:64,value:127,channel:0,time:100}]}));
try{pedal.w.innerWidth=1280;pedal.mode('phrase');pedal.change('phraseSourceBpm',110);pedal.click('phraseLoopPadEnd');pedal.el('phraseViewTime').value='4.1';pedal.el('phraseViewTime').dispatchEvent(new pedal.w.Event('input'));assert.equal(pedal.el('phraseRoll').querySelectorAll('.tailActive').length,0);assert.equal(pedal.snapshot().duration,4000);assert(+pedal.el('phraseViewTime').max>4);}finally{pedal.close();}
console.log('PASS: piano-only essential controls, pulse tapping, Settings bounds, and pedal-ended silence');

// Removing padding cannot leave a selection stranded entirely in virtual silence.
const unpad=setup(saved);
try{unpad.w.innerWidth=1280;unpad.mode('phrase');unpad.change('phraseMeterNumerator',6);unpad.change('phraseMeterDenominator',8);unpad.click('phraseLoopPadEnd');unpad.change('phraseLoopStart',4.2);assert.equal(unpad.snapshot().options.sectionStart,4200);unpad.click('phraseLoopPadEnd');assert.equal(unpad.snapshot().options.loopPadEnd,false);assert.equal(unpad.snapshot().options.sectionEnd,4000);assert(unpad.snapshot().options.sectionStart<4000);assert.equal(unpad.snapshot().duration,4000);}finally{unpad.close();}
console.log('PASS: removal of padding safely bounds virtual-only loop selection');

// Repainting the timeline must not repeatedly announce an unchanged live hint.
const a11y=setup(saved);
try{a11y.mode('phrase');a11y.change('phraseLoopEnd',3.9);const observer=new a11y.w.MutationObserver(()=>{});observer.observe(a11y.el('phraseGridHint'),{childList:true,subtree:true,characterData:true});observer.observe(a11y.el('phraseLoopStatus'),{childList:true,subtree:true,characterData:true});for(let i=0;i<5;i++)a11y.w.phraseTest.render();assert.equal(observer.takeRecords().length,0);observer.disconnect();}finally{a11y.close();}
console.log('PASS: stable timing hints avoid repeated live announcements');
