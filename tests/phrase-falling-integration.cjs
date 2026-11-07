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

const fixture={version:2,sourceBpm:120,duration:2400,notes:[{note:60,start:100,duration:300,channel:0,velocity:90},{note:61,start:900.5,duration:500,channel:0,velocity:90},{note:67,start:900.5,duration:800,channel:1,velocity:90}],controllers:[],initialControllers:Array.from({length:16},(_,channel)=>[7,11,64].map(controller=>({channel,controller,value:controller===7?100:controller===11?127:0}))).flat()};
const fall=h=>h.el('phraseRoll').querySelector('svg'),cursor=h=>+fall(h).dataset.cursor;
(async()=>{
 for(const bpm of [60,120,240]){
  const h=setup(JSON.stringify(fixture));h.w.innerWidth=1280;h.w.innerHeight=900;Object.defineProperty(h.el('piano').parentElement,'clientWidth',{value:1200});h.mode('phrase');h.change('phrasePlayBpm',bpm);h.change('phraseSectionStart',.3);h.change('phraseSectionEnd',2.1);
  assert.equal(h.el('phraseRoll').nextElementSibling,h.el('piano'));assert.equal(h.el('phraseRoll').style.width,h.el('piano').style.width);
  for(const guide of fall(h).querySelectorAll('.fallingKeyGuide')){const key=h.d.querySelector('.key[data-midi="'+guide.dataset.midi+'"]');if(key.classList.contains('black'))assert(Math.abs(+guide.getAttribute('x1')-parseFloat(key.style.left)-parseFloat(h.w.document.documentElement.style.getPropertyValue('--black-w'))/2)<1e-9);}
  h.click('phrasePlay');await flush();assert.equal(h.snapshot().state,'play-countin');assert(cursor(h)<300);const before=cursor(h);h.advance(200);h.change('phraseSpelling','flat');assert(Math.abs(cursor(h)-before-200*bpm/120)<1e-7,'count-in descends with anchored source-time clock');
  h.advance(4*60000/bpm-200);assert.equal(h.snapshot().state,'playing');assert.equal(cursor(h),300);const origin=h.now(),length=1800*120/bpm;
  for(const elapsed of [200,700,1000,length+250,2*length+550].sort((a,b)=>a-b)){
   h.advance(elapsed-(h.now()-origin));h.change('phraseSpelling','sharp');const time=300+((h.now()-origin)%length)*bpm/120;assert(Math.abs(cursor(h)-time)<1e-7);
   for(const mark of fall(h).querySelectorAll('.fallingNote')){const n=fixture.notes[+mark.dataset.noteId];assert.equal(mark.classList.contains('keyActive'),+mark.dataset.cycle===0&&n.start<=time&&n.start+n.duration>time);}
  }
  const stored=h.w.localStorage.getItem('keymemory.phrase.v1');h.el('piano').parentElement.scrollLeft=420;h.click('phraseStop');assert.equal(h.el('piano').parentElement.scrollLeft,420);assert.equal(h.w.localStorage.getItem('keymemory.phrase.v1'),stored);
  h.w.innerWidth=390;h.w.innerHeight=844;h.w.phraseTest.render();assert(!h.el('phraseRoll').hidden,'default small-screen piano has bars');assert(h.el('phraseScore').hidden);h.click('phraseViewSwitch');assert(h.el('piano').parentElement.hidden);assert(!h.el('phraseFallingHeader').hidden,'Window remains available for staff editing');h.click('phraseViewSwitch');assert(!h.el('phraseRoll').hidden);assert.equal(h.el('piano').parentElement.scrollLeft,420);
  h.mode('find');assert(h.el('phraseRoll').hidden);assert(h.el('phraseFallingHeader').hidden);h.close();
 }
 console.log('PASS falling-note app integration: shared piano/black-key geometry, count-in/tempo/source-time/section/loop sync, stored data unchanged, mobile score/piano switching and scroll preservation. Simulated DOM/audio.');
})().catch(e=>{console.error(e);process.exitCode=1;});
