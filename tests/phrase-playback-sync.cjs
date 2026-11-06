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
 w.AudioContext=class{state='running';get currentTime(){return now/1000;}destination={};resume(){return Promise.resolve();}createOscillator(){const o={frequency:{value:0},stops:[],connect(){},disconnect(){},start(t){this.startedAt=t;},stop(t){this.stops.push(t);}};oscillators.push(o);return o;}createGain(){return{gain:{value:.05,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};}};
 w.eval(fs.readFileSync(path.join(root,'phrase-view.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'midi.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase.js'),'utf8'));
 const create=w.KeyMemoryPhrase.create;w.KeyMemoryPhrase.create=config=>{engine=create({...config,onSound:(...args)=>{sounds.push(args);config.onSound?.(...args);},onControl:(...args)=>{controls.push(args);config.onControl?.(...args);}});return engine;};
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.phraseTest={mode:activateMode,render:renderPiano,get:()=>({activeMode,targetMidi,selected:[...selected]})};');
 const el=id=>d.getElementById(id),click=id=>el(id).click(),change=(id,value)=>{el(id).value=String(value);el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const send=(note,velocity=100,channel=0,kind=0x90,timeStamp=now)=>port.onmidimessage?.({data:new Uint8Array([kind|channel,note,velocity]),timeStamp}),off=(note,channel=0)=>send(note,0,channel,0x80);
 async function connect(){click('connectMidi');await flush();}
 return{w,d,el,click,change,send,off,advance,connect,port,access,sounds,controls,oscillators,cc:(controller,value,channel=0)=>send(controller,value,channel,0xb0),mode:m=>w.phraseTest.mode(m),get:()=>w.phraseTest.get(),snapshot:()=>engine.snapshot(),transportTimers:()=>[...timers].filter(([,v])=>v.fn.name!=='renderPhraseView').map(([id,v])=>({id,time:v.time,repeat:v.repeat})),now:()=>now,close:()=>w.close()};
}
async function beginPlay(h){
 h.click('phrasePlay');await flush();if(h.snapshot().state!=='play-countin')return;
 const beat=60000/h.snapshot().options.playBpm;
 // Section count-ins preserve source beat phase; duration remains one 4/4 bar.
 h.advance(4*beat);assert.equal(h.snapshot().state,'playing');
}
// Regression: absolute audio onset, interpolated source cursor, staff activity and
// keyboard activity must agree. Fake clocks/audio, not physical latency testing.
const fixture={version:2,sourceBpm:120,duration:2400,notes:[
 {note:60,velocity:90,channel:0,start:100,duration:300},
 {note:64,velocity:90,channel:0,start:900.5,duration:200},
 {note:67,velocity:90,channel:1,start:900.5,duration:350}],
 controllers:[{controller:64,value:127,channel:0,time:200},{controller:64,value:0,channel:0,time:1800}],
 initialControllers:Array.from({length:16},(_,channel)=>[7,11,64].map(controller=>({channel,controller,value:controller===7?100:controller===11?127:0}))).flat()};
(async()=>{
 for(const bpm of [60,120,240]){
  const h=setup(JSON.stringify(fixture));h.mode('phrase');h.change('phraseViewVisibility','show');
  h.change('phrasePlayBpm',bpm);h.change('phraseSectionStart',.3);h.change('phraseSectionEnd',2.1);
  await beginPlay(h);const origin=h.now(),scale=120/bpm,length=1800*scale;
  const eventAt=origin+600.5*scale;
  // Pump may enqueue sound 100ms early, but rendering must never show it early.
  h.advance(Math.max(0,600.5*scale-50));h.change('phraseSpelling','sharp');
  assert(h.sounds.some(n=>n[0]===64&&Math.abs(n[3]-eventAt)<1e-8),'note is queued with its future absolute onset');
  assert(!h.d.querySelector('.key[data-midi="64"]').classList.contains('phrasePlaying'),'lookahead must not light future keys');
  h.advance(51);h.change('phraseSpelling','flat');
  assert(h.d.querySelector('.key[data-midi="64"]').classList.contains('phrasePlaying'));
  assert(h.el('phraseStaff').querySelector('[data-midi="64"]').classList.contains('keyActive'));
  for(const elapsed of [700*scale,950*scale,length-1,length+1,length+700*scale,2*length+950*scale]){
   h.advance(elapsed-(h.now()-origin));h.change('phraseSpelling','sharp');
   const time=300+((h.now()-origin)%length)/scale;
   assert(Math.abs(+h.el('phraseViewTime').value*1000-time)<1e-7,'interpolated cursor must equal engine source time');
   const expected=fixture.notes.filter(n=>n.start<=time&&time<n.start+n.duration).map(n=>n.note).sort((a,b)=>a-b);
   const keys=[...h.d.querySelectorAll('.key.phrasePlaying')].map(n=>+n.dataset.midi).sort((a,b)=>a-b);
   assert.deepEqual(keys,expected,'only physically held notes light keys, never pedal tails');
   for(const n of h.el('phraseStaff').querySelectorAll('.staffTimelineNote'))assert.equal(n.classList.contains('keyActive'),expected.includes(+n.dataset.midi),'staff and piano activity agree');
   const staff=h.el('phraseStaff').querySelector('svg'),cursor=+staff.querySelector('.staffTimelineCursor').getAttribute('x1');
   const x=+staff.dataset.timeLeft+(time- +staff.dataset.timeStart)/(+staff.dataset.timeEnd- +staff.dataset.timeStart)*(+staff.dataset.timeRight- +staff.dataset.timeLeft);
   assert(Math.abs(cursor-x)<1e-7,'cursor uses identical source-time geometry');
  }
  h.click('phraseStop');assert.equal(h.d.querySelectorAll('.phrasePlaying').length,0);h.close();
 }
 console.log('PASS: audio lookahead never lights early keys; source cursor, staff activity and piano agree across 0.5x/1x/2x speed, fractional onsets, sections, pedal tails, and repeated loops. Simulated clock/DOM/audio only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
