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
 w.AudioContext=class{state='running';get currentTime(){return now/1000;}destination={};resume(){return defer?new Promise(resolve=>resumes.push(resolve)):Promise.resolve();}createOscillator(){const o={frequency:{value:0},stops:[],connect(){},disconnect(){},start(t){this.startedAt=t;},stop(t){this.stops.push(t);}};oscillators.push(o);return o;}createGain(){return{gain:{value:.05,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};}};
 w.eval(fs.readFileSync(path.join(root,'phrase-view.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase-audition.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'midi.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase.js'),'utf8'));
 const create=w.KeyMemoryPhrase.create;w.KeyMemoryPhrase.create=config=>{engine=create({...config,onSound:(...args)=>{sounds.push(args);config.onSound?.(...args);},onControl:(...args)=>{controls.push(args);config.onControl?.(...args);}});return engine;};
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.phraseTest={lockSound:()=>{soundReady=false;},mode:activateMode,render:renderPiano,get:()=>({activeMode,targetMidi,selected:[...selected]})};');
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


const fixture={version:1,sourceBpm:120,duration:4000,notes:[{note:60,velocity:90,channel:0,start:100,duration:500},{note:64,velocity:90,channel:0,start:1000,duration:700}]};
function ready(saved=fixture,width=1280,height=900){const h=setup(saved&&JSON.stringify(saved));h.w.innerWidth=width;h.w.innerHeight=height;h.mode('phrase');return h;}
(async()=>{
 for(const [width,height]of [[1280,900],[390,844],[320,740],[844,390]]){
  const h=ready(null,width,height);assert(!h.el('phraseOptions').hidden);assert(!h.el('phraseTimingDetails').open);assert(!h.el('phraseHelp').open);
  for(const id of ['phraseScore','phraseLoopGrid','phraseLoopControls','phraseEditNotes','phraseRoll','phraseFallingHeader','phraseViewControls','phraseSpeedControl'])assert(h.el(id).hidden,id+' is hidden without a phrase');
  assert(!h.el('piano').parentElement.hidden);assert(!h.el('phraseRecord').disabled);assert(!h.el('phraseMeterControls').hidden,'count-in setup is available before recording');
  const stored=h.w.localStorage.getItem('keymemory.phrase.v1');h.el('phraseHelp').open=true;h.click('phraseViewExample');assert(!h.el('phraseScore').hidden);assert.match(h.el('phrasePitchText').textContent,/EXAMPLE/);assert.equal(h.w.localStorage.getItem('keymemory.phrase.v1'),stored);h.click('phraseViewExample');assert(h.el('phraseScore').hidden);assert(!h.el('piano').parentElement.hidden);
  assert(h.engine().importPhrase(fixture));assert(!h.el('phraseSpeedControl').hidden);assert(h.el('phraseActions').contains(h.el('phraseTimingDial')));assert(!h.el('phraseLoopGrid').hidden);assert(!h.el('phraseViewControls').hidden);
  h.change('phraseViewVisibility','hide');assert(h.el('phraseScore').hidden);assert(!h.el('phraseSpeedControl').hidden,'speed remains reachable in piano-only view');h.el('phraseTimingDial').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(h.snapshot().options.playBpm,118.8);
  h.el('phraseTimingDetails').open=true;h.change('phraseMeterNumerator',6);h.change('phraseMeterDenominator',8);h.change('phraseCountInBars',2);assert.match(h.el('phraseTimingSetupSummary').textContent,/6\/8 · 2-bar count-in/);assert.match(h.el('phraseTimingSetupSummary').textContent,/dotted quarter BPM/);h.el('phraseTimingDetails').open=false;h.mode('free');assert(h.el('phraseOptions').hidden);h.mode('phrase');assert(!h.el('phraseOptions').hidden);assert(!h.el('phraseTimingDetails').open);
  h.close();
 }
 // Disclosures are native, nonmodal and harmless to current playback/practice.
 const h=ready();const saved=h.w.localStorage.getItem('keymemory.phrase.v1');await beginPlay(h);h.advance(400);const before=JSON.stringify(h.snapshot());for(const id of ['phraseHelp','phraseTimingDetails']){h.el(id).open=true;h.el(id).open=false;}assert.equal(JSON.stringify(h.snapshot()),before);assert.equal(h.w.localStorage.getItem('keymemory.phrase.v1'),saved);assert.equal(h.snapshot().state,'playing');h.click('phrasePlay');
 for(const id of ['phraseViewExample','phraseStaffHelp','phraseScrubHelp','phraseControllerText','phraseKeyLegend','phraseDurationLegend'])assert(h.el(id).closest('#phraseHelp'),id+' belongs in Help');assert(h.d.querySelector('.scoreCaveat').closest('#phraseHelp'));
 assert(!h.el('phraseAudioOrigin').closest('#phraseHelp'),'import warning is always outside Help');assert(!h.el('phraseLoopStatus').closest('#phraseHelp'),'loop warnings stay with the score');assert(h.el('phraseLoopGrid').closest('#phraseTimingDetails'));assert(h.el('phraseMeterControls').closest('#phraseTimingDetails'));
 // Deleting the last note must not hide Undo inside a vanished workspace.
 h.engine().importPhrase({...fixture,notes:[fixture.notes[0]]});h.click('phraseEditNotes');h.change('phraseNoteChoice',0);h.click('phraseNoteDelete');assert.equal(h.snapshot().notes.length,0);assert(!h.el('phraseScore').hidden);assert(!h.el('phraseNoteEditor').hidden);assert(!h.el('phraseNoteUndo').disabled);assert(h.el('phraseLoopControls').hidden);h.click('phraseNoteUndo');assert.equal(h.snapshot().notes.length,1);assert(!h.el('phraseLoopControls').hidden);
 const ids=[...h.d.querySelectorAll('[id]')].map(el=>el.id);assert.equal(ids.length,new Set(ids).size);for(const el of h.d.querySelectorAll('[aria-describedby]'))for(const id of el.getAttribute('aria-describedby').split(/\s+/))assert(h.el(id),'description exists: '+id);h.close();
 console.log('PASS phrase cleanup: empty/populated/example/Undo states, four responsive DOM paths, primary speed outside score, native nonmodal setup/Help, source timing summaries, persistent warnings, unique IDs and accessible descriptions. No native layout claim.');
})().catch(e=>{console.error(e);process.exitCode=1;});
