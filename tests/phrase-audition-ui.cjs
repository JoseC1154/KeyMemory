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

const fixture={version:1,sourceBpm:120,duration:1600,notes:[{note:60,start:0,duration:600,velocity:100,channel:0},{note:64,start:100.125,duration:250,velocity:90,channel:0},{note:67,start:100.125,duration:400,velocity:80,channel:1},{note:72,start:500.75,duration:800,velocity:100,channel:0},{note:64,start:900,duration:200,velocity:70,channel:0}]};
const input=(h,ms)=>{h.el('phraseViewTime').value=String(ms/1000);h.el('phraseViewTime').dispatchEvent(new h.w.Event('input',{bubbles:true}));};
const pitch=o=>Math.round(69+12*Math.log2(o.frequency.value/440));
const ready=()=>{const h=setup(JSON.stringify(fixture));h.w.innerWidth=1280;h.w.innerHeight=900;h.mode('phrase');return h;};
const sound=async h=>{await flush();};
(async()=>{
 let h=ready();const stored=h.w.localStorage.getItem('keymemory.phrase.v1');h.close();
 h=ready();await sound(h);let before=JSON.stringify(h.snapshot());input(h,1000);await flush();let voices=h.oscillators.slice();assert.deepEqual(voices.map(pitch),[60,64,67,72,64]);assert.equal(voices[1].startedAt,voices[2].startedAt,'exact chord onsets audition together');assert(voices[4].startedAt-voices[0].startedAt<=.36+1e-9);assert(voices.every(o=>o.stops[0]<=h.now()/1000+.6+1e-9));assert.equal(JSON.stringify(h.snapshot()),before,'scrubbing leaves transport/settings/source alone');assert.equal(h.sounds.length,0,'previews never enter the phrase playback scheduler');assert.equal(h.w.localStorage.getItem('keymemory.phrase.v1'),stored);
 h.advance(700);let count=h.oscillators.length;input(h,50);await flush();assert.deepEqual(h.oscillators.slice(count).map(pitch),[64,72,64,67],'reverse scrubbing follows traversal order');
 h.advance(700);count=h.oscillators.length;input(h,60);await flush();assert.equal(h.oscillators.length,count,'moving within the same hold does not rapidly retrigger');h.el('phraseViewTime').dispatchEvent(new h.w.Event('pointerdown'));await flush();assert.deepEqual(h.oscillators.slice(count).map(pitch),[60],'starting a gesture previews a currently held note');
 h.advance(700);h.click('phraseEditNotes');count=h.oscillators.length;h.change('phraseNoteChoice',2);await flush();assert.deepEqual(h.oscillators.slice(count).map(pitch),[67]);assert.equal(JSON.stringify(h.snapshot()),before);assert.equal(h.el('phraseNoteChoice').value,'2');
 h.advance(700);h.click('phraseUp');h.click('phraseUp');h.click('phraseUp');count=h.oscillators.length;h.change('phraseNoteChoice',3);await flush();assert.deepEqual(h.oscillators.slice(count).map(pitch),[75],'editor auditions the transposed pitch');h.advance(50);const selected=h.oscillators.at(-1);h.click('phraseNoteDelete');assert(selected.stops.at(-1)<=h.now()/1000+.018+1e-9,'deleting selected note cancels preview');h.click('phraseNoteUndo');
 // Playback has exclusive transport ownership; user/programmatic slider events cannot add auditions.
 h.change('phraseCountInBars',0);h.click('phrasePlay');await flush();assert.equal(h.snapshot().state,'playing');count=h.oscillators.length;before=JSON.stringify(h.snapshot());input(h,1200);h.change('phraseSpelling','flat');await flush();assert.equal(h.oscillators.length,count);assert.equal(JSON.stringify(h.snapshot()),before);h.click('phraseStop');h.close();
 // Every stop path invalidates unresolved sound startup, without stale delayed notes.
 for(const cancel of ['sheet','mode','blur','transport']){
  h=ready();await sound(h);h.defer(true);h.w.phraseTest.lockSound();input(h,1000);await flush();assert(h.resumes.length>0,cancel);const initial=h.oscillators.length;
  if(cancel==='sheet')h.click('openSettings');else if(cancel==='mode')h.mode('free');else if(cancel==='blur')h.w.dispatchEvent(new h.w.Event('blur'));else{h.click('phrasePlay');h.click('phrasePlay');}
  h.defer(false);for(const resume of h.resumes.splice(0))resume();await flush();assert.equal(h.oscillators.length,initial,cancel+' cancels late audition');h.close();
 }
 // Clearing an edit selection cancels both its sounding voice and pending startup.
 h=ready();await sound(h);h.click('phraseEditNotes');h.defer(true);h.w.phraseTest.lockSound();h.change('phraseNoteChoice',2);await flush();assert(h.resumes.length>0);h.el('phraseStaff').dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,detail:1,clientX:1000,clientY:1000}));assert.equal(h.el('phraseNoteChoice').value,'');h.defer(false);for(const resume of h.resumes.splice(0))resume();await flush();assert.equal(h.oscillators.length,0,'cleared selection cannot start late audio');h.close();
 // No sound from staff inspection or rerenders. Only the explicit slider and edit selection audition.
 h=ready();await sound(h);h.el('phraseStaff').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));h.change('phraseSpelling','flat');await flush();assert.equal(h.oscillators.length,0);h.close();
 console.log('PASS app audition: forward/reverse/chord scrubbing, currently-held gesture, no jitter retriggers, always-enabled sound, transposed edit preview, source/settings preservation, independent playback, note deletion and pending startup cancellation on sheet/mode/blur/transport. Simulated audio/DOM only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
