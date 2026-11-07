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


const fixture={version:1,sourceBpm:120,duration:4000,notes:[{note:60,velocity:90,channel:0,start:100,duration:500},{note:64,velocity:90,channel:0,start:1000.5,duration:700},{note:67,velocity:90,channel:0,start:3000,duration:400}]};
const input=(h,ms)=>{h.el('phraseViewTime').value=String(ms/1000);h.el('phraseViewTime').dispatchEvent(new h.w.Event('input',{bubbles:true}));};
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const ready=()=>{const h=setup(JSON.stringify(fixture));h.w.innerWidth=1280;h.w.innerHeight=900;h.mode('phrase');return h;};
(async()=>{
 for(const control of ['phrasePlay','phraseStop'])for(const bpm of [60,120,240]){
  const h=ready();h.change('phrasePlayBpm',bpm);h.change('phraseSectionStart',.2);h.change('phraseSectionEnd',3.8);const original=h.w.localStorage.getItem('keymemory.phrase.v1');await beginPlay(h);h.advance(2*3600*120/bpm+1111.125*120/bpm);h.click(control);const source=1311.125;
  assert.equal(h.snapshot().state,'idle');near(h.snapshot().pausedAt,source);near(+h.el('phraseViewTime').value*1000,source);near(+h.el('phraseRoll').querySelector('svg').dataset.cursor,source);assert.equal(h.el('phrasePlay').textContent,'Resume phrase');assert.equal(h.el('phraseStop').textContent,'Reset');assert(!h.el('phraseStop').disabled);assert(!h.el('phraseViewTime').disabled);assert.equal(h.d.querySelectorAll('.phrasePlaying').length,0);assert(h.d.querySelector('.key[data-midi="64"]').classList.contains('phraseInspectKey'));
  h.advance(3000);near(+h.el('phraseViewTime').value*1000,source);h.click('openSettings');h.click('closeSettings');near(h.snapshot().pausedAt,source);h.mode('free');h.mode('phrase');near(h.snapshot().pausedAt,source);
  h.click('phrasePlay');await flush();assert.equal(h.snapshot().state,'playing');assert.equal(h.snapshot().loop,3);near(+h.el('phraseViewTime').value*1000,source);assert.equal(h.el('phrasePlay').textContent,'Pause phrase');assert.equal(h.el('phraseStop').textContent,'Pause');h.advance(200);h.click('phraseStop');near(h.snapshot().pausedAt,source+200*bpm/120);
  input(h,2222.375);await flush();near(h.snapshot().pausedAt,2222.375);near(+h.el('phraseViewTime').value*1000,2222.375);h.click('phrasePlay');await flush();near(+h.el('phraseViewTime').value*1000,2222.375);h.click('phrasePlay');h.click('phraseStop');assert.equal(h.snapshot().pausedAt,null);near(+h.el('phraseViewTime').value*1000,200);assert.equal(h.el('phrasePlay').textContent,'Play phrase');assert(h.el('phraseStop').disabled);h.click('phrasePlay');await flush();assert.equal(h.snapshot().state,'play-countin');h.click('phraseStop');assert.equal(h.snapshot().pausedAt,null);assert.equal(h.snapshot().state,'idle');assert.equal(h.w.localStorage.getItem('keymemory.phrase.v1'),original);h.close();
 }
 // The example is read-only and never edits or visually loses the real pause point.
 {const h=ready();await beginPlay(h);h.advance(1100);h.click('phrasePlay');near(h.snapshot().pausedAt,1100);const before=JSON.stringify(h.snapshot()),stored=h.w.localStorage.getItem('keymemory.phrase.v1');h.click('phraseViewExample');input(h,2500);await flush();near(+h.el('phraseViewTime').value*1000,2500);assert.equal(JSON.stringify(h.snapshot()),before);h.click('phraseViewExample');near(+h.el('phraseViewTime').value*1000,1100);near(+h.el('phraseRoll').querySelector('svg').dataset.cursor,1100);h.click('phrasePlay');await flush();near(+h.el('phraseViewTime').value*1000,1100);assert.equal(h.w.localStorage.getItem('keymemory.phrase.v1'),stored);h.close();}
 // Cancelled audio startup cannot resume a paused phrase after a later Stop.
 const h=ready();await beginPlay(h);h.advance(500);h.click('phrasePlay');h.defer(true);h.click('phrasePlay');assert.equal(h.snapshot().state,'idle');h.click('phraseStop');h.defer(false);for(const resume of h.resumes.splice(0))resume();await flush();assert.equal(h.snapshot().state,'idle');assert.equal(h.snapshot().pausedAt,null);assert.equal(h.el('phrasePlay').textContent,'Play phrase');h.close();
 console.log('PASS pause UI: both playback controls freeze exact staff/falling/piano cursor; Resume preserves loop phase at all speeds, paused inspection seeks resume position, Settings/modes preserve pause, explicit Reset/count-in cancellation and pending-start cancellation retain safe behavior.');
})().catch(e=>{console.error(e);process.exitCode=1;});
