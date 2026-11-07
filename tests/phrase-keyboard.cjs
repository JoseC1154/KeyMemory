// Simulated DOM geometry; not a real viewport/touch/physical-keyboard verification.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),flush=()=>new Promise(r=>setImmediate(r));
const BLACK=new Set([1,3,6,8,10]),NAMES=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
function setup({viewport=1180,width=1156,height=900,notes=[]}={}){
 const w=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{pretendToBeVisual:true,runScripts:'outside-only',url:'https://keymemory.test/'}).window,d=w.document;
 w.confirm=()=>true;w.ResizeObserver=class{observe(){}};Object.defineProperty(w,'isSecureContext',{value:true});Object.defineProperty(w,'innerWidth',{get:()=>viewport});Object.defineProperty(w,'innerHeight',{get:()=>height});
 w.matchMedia=q=>({matches:q.includes('max-width: 600px')?viewport<=600&&height>viewport:q.includes('max-height: 500px')?height<=500&&viewport>height:false});
 const piano=d.getElementById('piano'),container=piano.parentElement;Object.defineProperty(container,'clientWidth',{get:()=>width});
 if(notes.length)w.localStorage.setItem('keymemory.phrase.v1',JSON.stringify({version:1,sourceBpm:120,duration:1000,notes:notes.map(note=>({note,channel:0,velocity:100,start:0,duration:500}))}));
 let now=1000,id=0;const timers=new Map();w.Date.now=()=>now;w.performance.now=()=>now;
 w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};w.clearInterval=id=>timers.delete(id);
 function advance(ms){const end=now+ms;for(;;){const t=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!t)break;const[k,v]=t;now=v.time;if(v.repeat)v.time+=v.repeat;else timers.delete(k);v.fn();}now=end;}
 const port={id:'yc',name:'YC Series Port 1',state:'connected',onmidimessage:null,open(){return Promise.resolve();},close(){return Promise.resolve();}},access={inputs:new Map([['yc',port]])};w.navigator.requestMIDIAccess=()=>Promise.resolve(access);
 w.AudioContext=class{get currentTime(){return now/1000;}destination={};resume(){return Promise.resolve();}createOscillator(){return{frequency:{value:0},connect(){},disconnect(){},start(){},stop(){}};}createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};}};
 for(const file of ['midi.js','phrase.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.keyboardTest={mode:activateMode,render:renderPiano};');
 const el=id=>d.getElementById(id),mode=m=>w.keyboardTest.mode(m),keys=()=>Array.from(piano.querySelectorAll('.key'),k=>+k.dataset.midi).sort((a,b)=>a-b),send=(note,velocity=100)=>port.onmidimessage?.({data:new Uint8Array([0x90,note,velocity]),timeStamp:now});
 return{w,d,piano,container,el,mode,keys,send,advance,connect:async()=>{el('connectMidi').click();await flush();},render:()=>w.keyboardTest.render(),resize:(v,c,h)=>{viewport=v;width=c;height=h;w.keyboardTest.render();},close:()=>w.close()};
}
const near=(a,b,message)=>assert(Math.abs(a-b)<1e-7,message||`${a} != ${b}`);
function verifyRange(h,low=21,high=108){const keys=h.keys();assert.deepEqual(keys,Array.from({length:high-low+1},(_,i)=>low+i));assert.equal(new Set(keys).size,keys.length);assert(keys.every(m=>m>=0&&m<=127));}
(async()=>{
 const metrics=[];
 for(const [viewport,width,height,scroll]of[[1180,1156,900,false],[1280,1256,900,false],[1440,1416,900,false],[400,388,844,true],[843,827,390,true],[568,556,320,true]]){
  const h=setup({viewport,width,height});h.mode('phrase');verifyRange(h);assert.equal(h.piano.querySelectorAll('.key.white').length,52);assert.equal(h.piano.querySelectorAll('.key.black').length,36);assert(h.d.querySelector('.shell').classList.contains('phraseWorkspace'));
  const style=h.d.documentElement.style,white=parseFloat(style.getPropertyValue('--white-w')),black=parseFloat(style.getPropertyValue('--black-w')),pianoWidth=parseFloat(h.piano.style.width);
  if(scroll){assert(white>=26);assert(pianoWidth>width);}else assert(pianoWidth<=width+1e-7,'88 keys fit available desktop width');
  const a=h.piano.querySelector('[data-midi="21"]'),asharp=h.piano.querySelector('[data-midi="22"]'),b=h.piano.querySelector('[data-midi="23"]');assert.equal(a.classList.contains('white'),true);assert.equal(b.classList.contains('white'),true);
  const pad=viewport<=600?6:10;near(parseFloat(asharp.style.left),pad+white-black/2,'first black key anchored between A0/B0');
  // Every black-key anchor derives from the number of preceding whites, including partial first octave.
  for(const key of h.piano.querySelectorAll('.key.black')){const midi=+key.dataset.midi,preceding=Array.from({length:midi-21},(_,i)=>21+i).filter(m=>!BLACK.has(m%12)).length;near(parseFloat(key.style.left),pad+(preceding-1)*(white+2)+white-black/2);const label=key.querySelector('.noteLabel');if(black<20)assert(label.hidden||key.classList.contains('hideLabel')||label.style.display==='none'||h.piano.classList.contains('compactBlackLabels'),'narrow black labels must be suppressed');}
  for(const key of h.piano.querySelectorAll('.key')){const midi=+key.dataset.midi,exact=NAMES[midi%12]+(Math.floor(midi/12)-1);assert(key.getAttribute('aria-label').includes(exact),`aria names ${exact}`);assert(key.getAttribute('aria-label').includes(String(midi)));assert(key.title.includes(exact));assert(key.title.includes(String(midi)));}
  assert.match(a.querySelector('.noteLabel').textContent,/A\s*0/);for(let midi=24;midi<=108;midi+=12)assert(h.piano.querySelector(`[data-midi="${midi}"] .noteLabel`).textContent.includes(String(Math.floor(midi/12)-1)));
  assert.equal(h.piano.querySelector('[data-midi="26"] .noteLabel').textContent.trim(),'D');
  metrics.push({viewport,available:width,white,pianoWidth,scroll});h.close();
 }
 // Larger keys can display black-note labels; all accessibility names remain exact.
 let h=setup({viewport:2000,width:1976,height:1100});h.mode('phrase');assert(parseFloat(h.d.documentElement.style.getPropertyValue('--black-w'))>=20);const wideLabel=h.piano.querySelector('.key.black .noteLabel');assert(!wideLabel.hidden);assert.notEqual(wideLabel.style.display,'none');h.close();
 // Loaded and transposed notes beyond a standard piano expand safely to real MIDI bounds.
 for(const notes of [[0],[127],[0,127],[18,112]]){h=setup({notes});h.mode('phrase');const low=Math.min(21,...notes),high=Math.max(108,...notes);verifyRange(h,low<21?Math.floor(low/12)*12:21,high>108?Math.min(127,Math.ceil((high+1)/12)*12-1):108);h.el('phraseClear').click();verifyRange(h);h.close();}
 // Transposition extends the baseline only when the transposed note crosses its ends.
 h=setup({notes:[107]});h.mode('phrase');h.el('phraseUp').click();verifyRange(h);h.el('phraseUp').click();verifyRange(h,21,119);assert(h.piano.querySelector('[data-midi="109"]'));h.close();
 h=setup({notes:[22]});h.mode('phrase');h.el('phraseDown').click();verifyRange(h);h.el('phraseDown').click();verifyRange(h,12,108);assert(h.piano.querySelector('[data-midi="20"]'));h.close();
 // Live extension remains stable after note-off; clearing phrase restores the standard88 range.
 h=setup({viewport:843,width:827,height:390});await h.connect();h.mode('phrase');h.send(0);verifyRange(h,0,108);h.send(0,0);verifyRange(h,0,108);h.send(127);verifyRange(h,0,127);h.send(127,0);verifyRange(h,0,127);h.el('phraseClear').click();verifyRange(h);
 // Rerenders from count-in/recording ticks keep horizontal position instead of jumping to the left.
 h.container.scrollLeft=300;h.el('phraseRecord').click();await flush();h.advance(500);assert.equal(h.container.scrollLeft,300);h.advance(1500);assert.equal(h.container.scrollLeft,300);h.send(60);h.advance(1000);assert.equal(h.container.scrollLeft,300);h.send(60,0);h.el('phraseStop').click();assert.equal(h.container.scrollLeft,300);
 // Leaving Phrase removes the workspace class and preserves the earlier modes' compact ranges.
 h.mode('free');assert(!h.d.querySelector('.shell').classList.contains('phraseWorkspace'));assert.deepEqual(h.keys(),Array.from({length:36},(_,i)=>48+i));h.mode('dictionary');assert.deepEqual(h.keys(),Array.from({length:12},(_,i)=>48+i));h.mode('phrase');verifyRange(h);h.close();
 const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');assert.match(css,/\.shell\.phraseWorkspace\s*\{[^}]*max-width\s*:\s*none/);
 console.log('PASS: Phrase A0–C8 88 keys/52white36black; partial-A black anchors; exact accessible octaves/MIDI; compact labels; desktop fit/mobile overflow geometry;0–127 live/loaded expansion and reset; scroll preservation; other-mode ranges. Simulated geometry only. '+JSON.stringify(metrics));
})().catch(error=>{console.error(error);process.exitCode=1;});
