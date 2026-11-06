// Simulated MIDI/app integration: no physical instrument or audible playback verification.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),flush=()=>new Promise(r=>setImmediate(r));
function setup(saved,collapsed=false){
 const w=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{pretendToBeVisual:true,runScripts:'outside-only',url:'https://keymemory.test/'}).window,d=w.document;
 w.innerWidth=1280;w.innerHeight=900;w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{width:100,height:30}];};w.confirm=()=>true;w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}};Object.defineProperty(w,'isSecureContext',{value:true});
 if(collapsed)w.localStorage.setItem("keymemory.phrase.practicePanel","hidden");
 if(saved)w.localStorage.setItem('keymemory.phrase.v1',saved);
 let now=1000,id=0;const timers=new Map(),sounds=[],controls=[],oscillators=[];let engine;
 w.Date.now=()=>now;w.performance.now=()=>now;
 w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};w.clearInterval=id=>timers.delete(id);
 function advance(ms){const end=now+ms;for(;;){const t=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!t)break;const[k,v]=t;now=v.time;if(v.repeat)v.time+=v.repeat;else timers.delete(k);v.fn();}now=end;}
 const port={id:'yc',name:'YC Series Port 1',state:'connected',onmidimessage:null,open(){return Promise.resolve();},close(){return Promise.resolve();}},access={inputs:new Map([['yc',port]]),onstatechange:null};
 w.navigator.requestMIDIAccess=()=>Promise.resolve(access);
 w.AudioContext=class{state='running';get currentTime(){return now/1000;}destination={};resume(){return Promise.resolve();}createOscillator(){const o={frequency:{value:0},stops:[],connect(){},disconnect(){},start(){},stop(t){this.stops.push(t);}};oscillators.push(o);return o;}createGain(){return{gain:{value:.05,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};}};
 w.eval(fs.readFileSync(path.join(root,'midi-transport.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase-view.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'midi.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase.js'),'utf8'));
 const create=w.KeyMemoryPhrase.create;w.KeyMemoryPhrase.create=config=>{engine=create({...config,onSound:(...args)=>{sounds.push(args);config.onSound?.(...args);},onControl:(...args)=>{controls.push(args);config.onControl?.(...args);}});return engine;};
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.phraseTest={render:renderPiano,feedback:(note,reverse=false)=>{scalePhase=reverse?"reverse-show":"correction";scaleCorrection={index:0,midi:note};scaleReverseIndex=0;scaleNotes=[note];renderPiano();},mode:activateMode,get:()=>({activeMode,targetMidi,selected:[...selected],scalePhase,scaleIndex,scaleLives,scaleNotes:[...scaleNotes],scaleStreak,scaleReverseStreak,question:scaleQuestionId,dialog:currentDialog?.id,soundEnabled})};');
 const el=id=>d.getElementById(id),click=id=>el(id).click(),change=(id,value)=>{el(id).value=String(value);el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const send=(note,velocity=100,channel=0,kind=0x90,timeStamp=now)=>port.onmidimessage?.({data:new Uint8Array([kind|channel,note,velocity]),timeStamp}),off=(note,channel=0)=>send(note,0,channel,0x80);
 async function connect(){click('connectMidi');await flush();}
 return{w,d,el,click,change,send,off,advance,connect,port,access,sounds,controls,oscillators,cc:(controller,value,channel=0)=>send(controller,value,channel,0xb0),mode:m=>w.phraseTest.mode(m),get:()=>w.phraseTest.get(),snapshot:()=>engine.snapshot(),now:()=>now,close:()=>w.close()};
}
function checked(h,id,value){h.el(id).checked=value;h.el(id).dispatchEvent(new h.w.Event('change',{bubbles:true}));}
const saved=JSON.stringify({version:1,sourceBpm:120,duration:2000,notes:[{note:60,velocity:100,channel:0,start:0,duration:1000},{note:64,velocity:100,channel:0,start:0,duration:1000}]});
async function map(h,action,n,ch=0,cc=false){h.click('midiLearn-'+action);if(cc){h.cc(n,127,ch);h.cc(n,0,ch);}else{h.send(n,100,ch);h.off(n,ch);}}
const tap=(h,n,ch=0)=>{h.send(n,100,ch);h.off(n,ch);},key=(h,n)=>h.d.querySelector('.key[data-midi="'+n+'"]');
(async()=>{
 const actions=['record','stop','play','practice','continue','transposeDown','transposeUp'];
 let h=setup(saved);await h.connect();h.mode('phrase');h.click('openSettings');
 for(let i=0;i<actions.length;i++)await map(h,actions[i],24+i,i);
 checked(h,'midiTransportEnabled',true);h.click('closeSettings');
 const raw=JSON.stringify(h.snapshot().notes);
 for(let i=0;i<actions.length;i++){
  const action=actions[i],n=24+i,k=key(h,n);
  assert(k.classList.contains('midiMappedKey'),action+' colors a full key');
  assert.equal(k.dataset.midiActions,action);
  assert.equal(k.style.getPropertyValue('--midi-key-fill'),`var(--midi-${action})`);
  assert.match(k.getAttribute('aria-label'),new RegExp('MIDI channel '+(i+1)));
  assert.equal(k.querySelectorAll('.transposeKeyBadge').length,0,'no floating shortcut badge');
  assert.equal(h.el('midiMap-'+action).previousElementSibling.dataset.midiAction,action);
  h.send(n,100,i);await flush();assert(key(h,n).classList.contains('midiKeyDown'),action+' animates even though it is consumed');
  assert(!h.get().selected.includes(n),'shortcuts never become musical selection');
  h.w.phraseTest.render();assert.equal(key(h,n),k,'rerenders retain the key for CSS transitions');assert(k.classList.contains('midiKeyDown'));
  h.send(n,100,i);assert(key(h,n).classList.contains('midiKeyDown'),'duplicate on does not release');
  h.off(n,i);assert(!key(h,n).classList.contains('midiKeyDown'),action+' releases');
  h.click('phraseStop');
 }
 assert.equal(JSON.stringify(h.snapshot().notes),raw,'no shortcut reaches the recorder');
 assert.equal(h.el('midiShortcutLegend').children.length,7);
 for(const [id,action]of [['phraseRecord','record'],['phraseStop','stop'],['phrasePlay','play'],['phrasePractice','practice'],['nextChallenge','continue'],['scaleStart','continue'],['continueScaleCorrection','continue'],['confirmScaleRun','continue'],['confirmScaleDegree','continue'],['resumeScale','continue'],['phraseDown','transposeDown'],['phraseUp','transposeUp']]){
  assert.equal(h.el(id).dataset.midiAction,action);assert.match(h.el(id).getAttribute('aria-description'),/MIDI shortcut/);
 }
 // Real musical presses and shortcuts share one physical animation, independent
 // of selected/inspection/target fills, including multiple MIDI channels.
 const white=key(h,60),black=key(h,61);h.send(60);h.send(60,90,1);h.send(61);
 assert(white.classList.contains('midiKeyDown'));assert(black.classList.contains('midiKeyDown'));
 h.off(60);assert(white.classList.contains('midiKeyDown'),'other held channel retains press');h.off(60,1);assert(!white.classList.contains('midiKeyDown'));h.send(61,0);assert(!black.classList.contains('midiKeyDown'),'velocity zero releases');
 // A note remapped on a different channel displays every action, not just transpose.
 h.click('openSettings');for(let i=0;i<actions.length;i++)await map(h,actions[i],60,i);h.click('closeSettings');
 const overlap=key(h,60),fill=overlap.style.getPropertyValue('--midi-key-fill');
 for(const action of actions)assert(fill.includes(`var(--midi-${action})`));
 assert.equal((fill.match(/var\(/g)||[]).length,7);assert.match(overlap.getAttribute('aria-label'),/Record.*channel 1.*Stop.*channel 2.*Continue \/ Start.*channel 5/);
 h.send(60,100,5);h.send(60,100,6);h.off(60,5);assert(overlap.classList.contains('midiKeyDown'));h.off(60,6);assert(!overlap.classList.contains('midiKeyDown'));
 h.el('phraseViewTime').value='.2';h.el('phraseViewTime').dispatchEvent(new h.w.Event('input'));assert(overlap.classList.contains('phraseInspectKey'));assert.equal(overlap.style.getPropertyValue('--midi-key-fill'),fill);
 // Same input conflicts retain all previous colors and assignments.
 h.click('openSettings');h.click('midiLearn-play');tap(h,60,0);assert.match(h.el('midiTransportStatus').textContent,/already assigned/);h.click('midiTransportCancel');h.click('closeSettings');assert.equal(key(h,60).style.getPropertyValue('--midi-key-fill'),fill);
 // CC is labeled but never mapped onto a numbered piano key.
 h.click('openSettings');await map(h,'record',60,0,true);h.click('closeSettings');assert(!key(h,60).dataset.midiActions.includes('record'));assert.match(h.el('phraseRecord').getAttribute('aria-description'),/CC 60/);
 // Continue is usable beyond Phrase, so reserved notes stay identifiable there.
 h.mode('scale');assert(key(h,60).classList.contains('midiMappedKey'));assert.match(h.el('scaleStart').getAttribute('aria-description'),/C4/);h.send(60,100,4);assert.equal(h.get().dialog,'scaleRunOverlay');h.off(60,4);h.click('cancelScaleRun');h.w.phraseTest.feedback(60);assert.match(key(h,60).getAttribute('aria-label'),/correct answer.*Degree 1.*MIDI shortcuts/);h.w.phraseTest.feedback(60,true);assert.match(key(h,60).getAttribute('aria-label'),/highlighted key.*MIDI shortcuts/);h.mode('phrase');
 // Blur, disconnect, and mapping edits cannot leave depressed keys behind.
 h.send(60,100,5);assert(key(h,60).classList.contains('midiKeyDown'));h.w.dispatchEvent(new h.w.Event('blur'));assert.equal(h.d.querySelectorAll('.midiKeyDown').length,0);h.off(60,5);h.w.dispatchEvent(new h.w.Event('focus'));
 h.send(61);assert(key(h,61).classList.contains('midiKeyDown'));h.click('disconnectMidi');assert.equal(h.d.querySelectorAll('.midiKeyDown').length,0);await h.connect();h.send(61);assert(key(h,61).classList.contains('midiKeyDown'));
 h.click('openSettings');checked(h,'midiTransportEnabled',false);assert.equal(h.d.querySelectorAll('.midiKeyDown').length,0);h.click('closeSettings');assert.equal(h.d.querySelectorAll('.midiMappedKey').length,0);assert(h.el('midiShortcutLegend').hidden);assert(!h.el('phraseRecord').hasAttribute('aria-description'));h.off(61);
 h.click('openSettings');checked(h,'midiTransportEnabled',true);for(const action of actions)h.click('midiRemove-'+action);h.click('closeSettings');assert.equal(h.d.querySelectorAll('.midiMappedKey').length,0);assert.equal(h.d.querySelectorAll('[data-midi-actions]').length,0);h.close();
 // Extending Phrase's range applies to every mapped note, not only transpose.
 h=setup(saved);await h.connect();h.mode('phrase');h.click('openSettings');await map(h,'record',0);await map(h,'stop',127);checked(h,'midiTransportEnabled',true);h.click('closeSettings');assert(key(h,0)?.classList.contains('midiMappedKey'));assert(key(h,127)?.classList.contains('midiMappedKey'));
 h.send(0);await flush();assert(key(h,0).classList.contains('midiKeyDown'));h.off(0);h.click('phraseStop');h.close();
 const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');assert.match(css,/\.key\.white\.midiKeyDown[^}]+translateY\(4px\)/);assert.match(css,/\.key\.black\.midiKeyDown[^}]+translateY\(3px\)/);assert.match(css,/prefers-reduced-motion:reduce/);
 console.log('PASS: all seven action/control/full-key colors; no shortcut badges; seven-way channel splits and accessible labels; press/release/layering/velocity-zero, stable nodes through rerenders, consumed shortcut isolation, Continue across modes, inspection coexistence, conflict/CC/extreme pitches and disabled/remove/blur/disconnect cleanup. Simulated MIDI/DOM only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
