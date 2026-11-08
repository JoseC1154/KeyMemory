// Deterministic DOM/WebAudio contract, not a physical audio or MIDI device test.
const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..'),flush=()=>new Promise(r=>setImmediate(r));
function setup(saved){
 const w=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://keymemory.test',runScripts:'outside-only',pretendToBeVisual:true}).window,d=w.document;
 w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}};
 if(saved)w.localStorage.setItem('keymemory.sound.v1',saved);
 let now=0,id=0,defer=false;const timers=new Map(),contexts=[],voices=[],pending=[];
 w.Date.now=()=>now;w.performance.now=()=>now;w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};w.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};w.clearTimeout=w.clearInterval=id=>timers.delete(id);
 const advance=ms=>{const end=now+ms;for(;;){const t=[...timers].filter(([,t])=>t.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!t)break;const[k,v]=t;now=v.time;if(v.repeat)v.time+=v.repeat;else timers.delete(k);v.fn();}now=end;};
 w.AudioContext=class{constructor(){this.state='suspended';contexts.push(this);}get currentTime(){return now/1000;}destination={};resume(){if(defer)return new Promise((resolve,reject)=>pending.push({resolve:()=>{this.state='running';resolve();},reject}));this.state='running';return Promise.resolve();}createOscillator(){assert.equal(this.state,'running');const o={frequency:{value:0},stops:[],connect(){},disconnect(){},start(){},stop(t){this.stops.push(t);}};voices.push(o);return o;}createGain(){return{gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};}};
 let midi;w.KeyMemoryMidi={create:config=>{midi=config;return{resetQuestion(){config.onReset();},isConnected(){return false;},connected:()=>false};}};
 w.eval(fs.readFileSync(path.join(root,'phrase.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.t={mode:activateMode,press:pressPianoKey,get:()=>({soundReady,scaleNotes:[...scaleNotes],phase:scalePhase}),preview:startScalePreview,phrase:()=>phraseEngine.snapshot(),record:()=>startPhraseTransport(()=>phraseEngine.record()),cancel:()=>silencePhrase(),unlock:enableSoundAudio,replay:()=>soundPhrase(60,100,1000,Date.now()),beat:()=>soundPhraseBeat({beat:1,at:Date.now()})};');
 return{w,d,api:w.t,contexts,voices,pending,advance,el:id=>d.getElementById(id),click:id=>d.getElementById(id).click(),tap:n=>d.querySelector(`[data-midi="${n}"]`).click(),midi:()=>midi,defer:x=>defer=x,close:()=>w.close()};
}
(async()=>{
 let h;
 for(const saved of [undefined,'off','on','invalid']){
  h=setup(saved);assert.equal(h.el('soundToggle'),null);assert.equal(h.contexts.length,0,'no context or autoplay on load');
  h.api.mode('scale');h.advance(2600);await flush();assert.equal(h.voices.length,0,'no sound before interaction');
  h.api.mode('free');h.tap(48);await flush();assert.equal(h.voices.length,1,'first key works despite legacy preference');assert(!h.el('hearBuilder').disabled);h.close();
 }
 for(const mode of ['free','find','remember','semitones','degrees','builder','dictionary','scale','phrase']){
  h=setup('off');h.api.mode(mode);const before=h.voices.length;h.tap(48);await flush();assert.equal(h.voices.length,before+1,mode+' first pointer note sounds once');h.close();
 }
 h=setup('off');h.d.querySelector('.startMode[data-mode="scale"]').click();await flush();assert.equal(h.voices.length,1,'choosing Scale unlocks the first demonstration note');h.close();
 h=setup('off');h.api.mode('find');h.click('hearBuilder');await flush();assert.equal(h.voices.length,1,'Replay unlocks without a prior piano tap');h.close();
 h=setup();h.tap(48);h.tap(52);h.tap(55);await flush();assert.equal(h.voices.length,3);h.midi().onNote(60);await flush();assert.equal(h.voices.length,4);h.tap(48);await flush();assert.equal(h.voices.length,5);assert(h.voices[0].stops.length>1);h.close();
 h=setup();await h.api.unlock();h.api.mode('scale');await flush();const notes=h.api.get().scaleNotes;for(let i=1;i<4;i++){h.advance(650);await flush();}assert.deepEqual(h.voices.map(v=>v.frequency.value),Array.from(notes).slice(0,4).map(n=>440*2**((n-69)/12)));h.click('openSettings');const count=h.voices.length;h.advance(3000);await flush();assert.equal(h.voices.length,count);h.close();
 h=setup();h.defer(true);const unlock=h.api.unlock();h.pending[0].reject(Error('blocked'));await unlock;assert.equal(h.api.get().soundReady,false);assert.match(h.el('audioStatus').textContent,/unavailable/);h.defer(false);h.tap(48);await flush();assert.equal(h.voices.length,1);assert(h.el('audioStatus').hidden);h.close();
 for(const action of ['mode','dialog','blur']){
  h=setup();h.defer(true);h.tap(48);if(action==='mode')h.api.mode('find');else if(action==='dialog')h.click('openSettings');else h.w.dispatchEvent(new h.w.Event('blur'));for(const p of h.pending)p.resolve();await flush();assert.equal(h.voices.length,0,action+' cancels pending note');h.close();
 }
 h=setup();for(let i=0;i<10;i++)await h.api.unlock();assert.equal(h.contexts.length,1);assert.equal(h.voices.length,0);h.close();
 // Click off leaves instrument sound enabled throughout recording.
 h=setup('off');h.api.mode('phrase');h.click('phraseMetronome');await h.api.record();assert.equal(h.contexts.length,1);assert.equal(h.voices.length,0);assert.equal(h.api.phrase().state,'record-countin');h.advance(2000);assert.equal(h.api.phrase().state,'recording');h.api.replay();h.api.beat();assert.equal(h.voices.length,1);assert.equal(h.voices[0].type,'triangle');h.close();
 // Click can be toggled without silencing note voices or stopping transport.
 h=setup();h.api.mode('phrase');await h.api.record();assert.equal(h.voices[0].type,'sine');h.advance(2000);h.api.replay();const note=h.voices.at(-1);h.api.beat();const beat=h.voices.at(-1),ns=note.stops.length,bs=beat.stops.length;h.click('phraseMetronome');assert.equal(note.stops.length,ns);assert(beat.stops.length>bs);const total=h.voices.length;h.advance(1000);assert.equal(h.voices.length,total);h.click('phraseMetronome');await flush();h.api.beat();assert.equal(h.voices.at(-1).type,'sine');assert.equal(h.api.phrase().state,'recording');h.close();
 h=setup();h.api.mode('phrase');h.defer(true);const transport=h.api.record();h.api.cancel();for(const p of h.pending)p.resolve();await transport;assert.equal(h.api.phrase().state,'idle');assert.equal(h.voices.length,0);h.close();
 h=setup();await h.api.unlock();h.defer(true);h.api.mode('scale');h.api.mode('free');for(const p of h.pending)p.resolve();await flush();assert.equal(h.voices.length,0);h.close();
 console.log('PASS always-on instrument sound: nine modes, legacy mute ignored, no load autoplay, pointer/MIDI/polyphony, scale preview, unlock recovery, pending cancellation, recording and independent Click. Simulated WebAudio only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
