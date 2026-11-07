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
 w.eval(fs.readFileSync(path.join(root,'tempo.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'phrase-audition.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'midi.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase.js'),'utf8'));
 const create=w.KeyMemoryPhrase.create;w.KeyMemoryPhrase.create=config=>{engine=create({...config,onSound:(...args)=>{sounds.push(args);config.onSound?.(...args);},onControl:(...args)=>{controls.push(args);config.onControl?.(...args);}});return engine;};
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.phraseTest={mode:activateMode,render:renderPiano,get:()=>({activeMode,targetMidi,selected:[...selected]})};');
 const el=id=>d.getElementById(id),click=id=>el(id).click(),change=(id,value)=>{el(id).value=String(value);el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const send=(note,velocity=100,channel=0,kind=0x90,timeStamp=now)=>port.onmidimessage?.({data:new Uint8Array([kind|channel,note,velocity]),timeStamp}),off=(note,channel=0)=>send(note,0,channel,0x80);
 async function connect(){click('connectMidi');await flush();}
 return{engine:()=>engine,w,d,el,click,change,send,off,advance,connect,port,access,sounds,controls,oscillators,resumes,defer:value=>{defer=value;},cc:(controller,value,channel=0)=>send(controller,value,channel,0xb0),mode:m=>w.phraseTest.mode(m),get:()=>w.phraseTest.get(),snapshot:()=>engine.snapshot(),transportTimers:()=>[...timers].filter(([,v])=>v.fn.name!=='renderPhraseView').map(([id,v])=>({id,time:v.time,repeat:v.repeat})),now:()=>now,close:()=>w.close()};
}

const plain=value=>JSON.parse(JSON.stringify(value));
const fixture={version:3,origin:'midi',sourceBpm:120,duration:5000,notes:Array.from({length:8},(_,i)=>({note:60+i,velocity:80+i,channel:i%2,start:123.456+i*600,duration:210.123})),controllers:[{controller:64,value:127,channel:0,time:100.125},{controller:64,value:0,channel:0,time:4800.125}],initialControllers:Array.from({length:16},(_,channel)=>[7,11,64].map(controller=>({channel,controller,value:controller===7?100:controller===11?127:0}))).flat(),options:{sourceBpm:120,playBpm:120,transpose:0,rhythm:false,tolerance:200,sectionStart:0,sectionEnd:5000,metronome:true,meterNumerator:6,meterDenominator:8,gridOriginMs:123.456,gridConfirmed:false,countInBars:0,loopSnap:'free',loopPadEnd:false}};
function ready(){const h=setup(JSON.stringify(fixture));h.mode('phrase');return h;}
(async()=>{
 let h=ready();assert.match(h.el('phraseTempoSuggestion').textContent,/100 quarter-note BPM/);assert.equal(h.snapshot().options.sourceBpm,120);h.change('phrasePlayBpm',60);const before=plain(h.snapshot());h.click('phraseUseTempo');let s=plain(h.snapshot());assert.equal(s.options.sourceBpm,100);assert.equal(s.options.playBpm,50);assert.equal(s.playbackDuration,before.playbackDuration);for(const key of ['notes','controllers','initialControllers','duration','origin'])assert.deepEqual(s[key],before[key]);for(const key of ['meterNumerator','meterDenominator','gridOriginMs','gridConfirmed'])assert.equal(s.options[key],before.options[key]);assert(Math.abs(+h.el('phrasePulseBpm').value-100/1.5)<.0001);h.click('phraseUseTempo');assert.equal(h.snapshot().options.playBpm,50);
 let reloaded=setup(h.w.localStorage.getItem('keymemory.phrase.v1'));assert.equal(reloaded.snapshot().options.sourceBpm,100);assert.equal(reloaded.snapshot().options.playBpm,50);assert.deepEqual(plain(reloaded.snapshot().notes),fixture.notes);reloaded.close();
 // The existing pulse-aware manual and tap controls remain usable at the same ratio.
 h.change('phrasePulseBpm',80);assert.equal(h.snapshot().options.sourceBpm,120);assert.equal(h.snapshot().options.playBpm,60);h.click('phraseTap');h.advance(600);h.click('phraseTap');assert.equal(h.snapshot().options.sourceBpm,150);assert.equal(h.snapshot().options.playBpm,75);
 // An out-of-range ratio is rejected, never clamped or silently sped up.
 h.change('phrasePlayBpm',30);const raw=plain(h.snapshot());h.click('phraseUseTempo');assert.equal(h.snapshot().options.sourceBpm,150);assert.equal(h.snapshot().options.playBpm,30);assert.match(h.el('phraseTimingError').textContent,/outside BPM/);assert.deepEqual(plain(h.snapshot().notes),raw.notes);h.close();
 // Note edits recompute the suggestion using content revision, without changing chosen tempo.
 h=ready();for(let i=0;i<3;i++)h.engine().deleteNote(0,h.snapshot().noteRevision);assert.match(h.el('phraseTempoSuggestion').textContent,/Too few/);assert(h.el('phraseUseTempo').hidden);h.engine().undoDelete(h.snapshot().noteRevision);assert.match(h.el('phraseTempoSuggestion').textContent,/100 quarter-note BPM/);assert(!h.el('phraseUseTempo').hidden);assert.equal(h.snapshot().options.sourceBpm,120);h.click('phraseViewExample');assert(h.el('phraseTempoReview').hidden);h.click('phraseViewExample');assert(!h.el('phraseTempoReview').hidden);h.close();
 // Completed MIDI takes get a suggestion, never an automatic tempo/meter override.
 h=ready();await h.connect();h.change('phraseCountInBars',0);h.change('phraseMeterNumerator',3);h.change('phraseMeterDenominator',4);h.click('phraseRecord');await flush();assert.equal(h.snapshot().state,'recording');assert(h.el('phraseTempoReview').hidden);h.cc(64,127);for(let i=0;i<8;i++){h.send(60+i);h.advance(123.456);h.off(60+i);h.advance(476.544);}h.cc(64,0);h.click('phraseStop');assert.match(h.el('phraseTempoSuggestion').textContent,/100 quarter-note BPM/);assert.equal(h.snapshot().options.sourceBpm,120);assert.equal(h.snapshot().options.meterNumerator,3);const take=plain(h.snapshot());h.change('phrasePlayBpm',60);h.click('phraseUseTempo');assert.equal(h.snapshot().options.sourceBpm,100);assert.equal(h.snapshot().options.playBpm,50);assert.deepEqual(plain(h.snapshot().notes),take.notes);assert.deepEqual(plain(h.snapshot().controllers),take.controllers);assert.equal(h.snapshot().options.meterNumerator,3);
 // Empty recordings retain prior notes and suggestions; recording and pending transports guard controls.
 h.click('phraseRecord');await flush();h.click('phraseUseTempo');assert.equal(h.snapshot().options.sourceBpm,100);h.click('phraseStop');assert.deepEqual(plain(h.snapshot().notes),take.notes);assert.match(h.el('phraseTempoSuggestion').textContent,/100 quarter-note BPM/);h.defer(true);h.click('phrasePlay');assert(h.el('phraseUseTempo').disabled);h.click('phraseStop');h.resumes.forEach(resolve=>resolve());await flush();assert.equal(h.snapshot().state,'idle');assert(!h.el('phraseUseTempo').disabled);
 // Applying a suggestion safely stops a running transport, as source-tempo edits already do.
 h.defer(false);h.click('phrasePlay');await flush();assert.equal(h.snapshot().state,'playing');h.click('phraseUseTempo');assert.equal(h.snapshot().state,'idle');h.click('phraseDelete');assert(h.el('phraseTempoReview').hidden);h.change('phraseSourceBpm',120);h.click('phraseUseTempo');assert.equal(h.snapshot().options.sourceBpm,120);h.close();
 // Combined tempo, audition and pause use the same app runtime.
 {
  const h=ready();h.w.innerWidth=1280;h.click('soundToggle');await flush();
  h.click('phrasePlay');await flush();h.advance(1300);h.click('phrasePlay');assert.equal(h.snapshot().pausedAt,1300);
  const scrub=ms=>{h.el('phraseViewTime').value=String(ms/1000);h.el('phraseViewTime').dispatchEvent(new h.w.Event('input'));};
  const before=h.oscillators.length;scrub(2000);await flush();assert.equal(h.snapshot().pausedAt,2000);assert(h.oscillators.length>before,'paused scrub auditions notes');
  h.click('phraseViewExample');scrub(1000);await flush();assert.equal(h.snapshot().pausedAt,2000,'example leaves real pause unchanged');
  h.click('phraseViewExample');assert.equal(+h.el('phraseViewTime').value,2,'return restores real cursor');
  h.click('phraseUseTempo');assert.equal(h.snapshot().pausedAt,null,'tempo acceptance clears pause');assert.equal(h.snapshot().options.sourceBpm,100);assert.equal(h.el('phrasePlay').textContent,'Play phrase');
  h.click('phrasePlay');await flush();assert.equal(h.snapshot().elapsed,0,'next playback starts fresh');h.close();
 }
 console.log('PASS recorded tempo UI: actual synthetic MIDI take, optional source update, preserved notes/pedal/ratio, compound pulse/manual/tap correction, ratio rejection, meter/origin unchanged, reload, empty take, revision/undo/example invalidation and pending/active transport safety and combined paused audition/example/tempo reset. No hardware/audio claim.');
})().catch(error=>{console.error(error);process.exitCode=1;});
