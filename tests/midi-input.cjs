// Simulated Web MIDI ports only. No physical YC61, MIDI driver, or audible-device claim.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),adapter=fs.readFileSync(path.join(root,'midi.js'),'utf8');
const flush=()=>new Promise(r=>setImmediate(r));
function port(id,name=id){return{id,name,state:'connected',onmidimessage:null,opens:0,closes:0,open(){this.opens++;return Promise.resolve(this);},close(){this.closes++;return Promise.resolve(this);}};}
function setup({app=false,audio=false,secure=true,supported=true,ports=[port('other','Other keyboard'),port('yc','YC Series Port 1')]}={}){
 const html=app?fs.readFileSync(path.join(root,'index.html'),'utf8'):'<button id="connectMidi">Connect</button><button id="disconnectMidi">Disconnect</button><select id="midiInput"></select><span id="midiStatus"></span>';
 const w=new JSDOM(html,{pretendToBeVisual:true,runScripts:'outside-only',url:'https://keymemory.test/'}).window,d=w.document;
 w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}};Object.defineProperty(w,'isSecureContext',{value:secure});
 let now=10,id=0;const timers=new Map(),requests=[],notes=[],releases=[];let resets=0;
 w.Date.now=()=>now;w.performance.now=()=>now;w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};w.clearInterval=id=>timers.delete(id);
 function advance(ms){const end=now+ms;for(;;){const t=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!t)break;const[k,v]=t;now=v.time;if(v.repeat)v.time+=v.repeat;else timers.delete(k);v.fn();}now=end;}
 const access={inputs:new Map(ports.map(p=>[p.id,p])),onstatechange:null,get outputs(){throw Error('MIDI outputs must never be inspected');}};
 if(supported)w.navigator.requestMIDIAccess=options=>new Promise((resolve,reject)=>requests.push({options,resolve,reject}));
 const audioResumes=[],audioOscillators=[];
 if(audio)w.AudioContext=class{get currentTime(){return now/1000;}destination={};resume(){return new Promise((resolve,reject)=>audioResumes.push({resolve,reject}));}createOscillator(){const o={frequency:{value:0},stops:[],connect(){},disconnect(){},start(){},stop(time){this.stops.push(time);}};audioOscillators.push(o);return o;}createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}},connect(){},disconnect(){}};}};
 w.eval(adapter);const el=id=>d.getElementById(id);let controller;
 if(app){w.eval(fs.readFileSync(path.join(root,'phrase.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.midiTest={mode:activateMode,get:()=>({mode:activeMode,target:targetMidi,chordAnswer,step:builderStep,phase:builderPhase,notes:[...builderNotes],selected:[...selected],deadline,countdown,dictionaryVoicing:[...dictionaryVoicing],dictionaryPractice}),controller:midiController};');controller=w.midiTest.controller;}
 else controller=w.KeyMemoryMidi.create({onNote:(...args)=>notes.push(args),onRelease:(...args)=>releases.push(args),onReset:()=>resets++,status:el('midiStatus'),select:el('midiInput'),connect:el('connectMidi'),disconnect:el('disconnectMidi')});
 async function connect(){el('connectMidi').click();requests.at(-1).resolve(access);await flush();}
 function send(p,note,velocity=100,channel=0,kind=0x90,timeStamp=now){p.onmidimessage?.({data:new Uint8Array([kind|channel,note,velocity]),timeStamp});}
 function off(p,note,channel=0){send(p,note,0,channel,0x80);}
 function change(value){el('midiInput').value=value;el('midiInput').dispatchEvent(new w.Event('change'));}
 return{w,d,el,access,ports,requests,notes,releases,audioResumes,audioOscillators,controller,connect,send,off,change,advance,get:()=>w.midiTest.get(),mode:mode=>w.midiTest.mode(mode),close:()=>w.close()};
}
(async()=>{
 // No permission prompt on page load; every request explicitly disables SysEx.
 let h=setup();assert.equal(h.requests.length,0);await h.connect();assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].options)),{sysex:false});assert.equal(h.el('midiInput').value,'yc');assert.equal(h.ports[0].opens,0);assert.equal(h.ports[1].opens,1);const yc=h.ports[1];
 for(let ch=0;ch<16;ch++){h.send(yc,48+ch,100,ch);h.off(yc,48+ch,ch);}assert.equal(h.notes.length,16);
 h.send(yc,72);h.send(yc,72);h.send(yc,72,100,1);assert.equal(h.notes.length,17,'duplicate and layered same pitch ignored');h.off(yc,72);h.off(yc,72,1);h.send(yc,72);assert.equal(h.notes.length,18);h.send(yc,72,0);h.send(yc,72);assert.equal(h.notes.length,19,'velocity-zero releases');h.off(yc,72);
 const count=h.notes.length;yc.onmidimessage({data:[0xb0,64,127],timeStamp:100});yc.onmidimessage({data:[0x90,128,100],timeStamp:100});yc.onmidimessage({data:[0x90,60],timeStamp:100});assert.equal(h.notes.length,count);
 // All-held barrier spans question boundaries and ignores late chord stragglers until release.
 h.send(yc,60);h.controller.resetQuestion();h.send(yc,64);h.off(yc,60);h.send(yc,67);assert.equal(h.notes.length,count+1);h.off(yc,64);h.off(yc,67);h.send(yc,67);assert.equal(h.notes.length,count+2);h.off(yc,67);
 h.advance(100);h.controller.resetQuestion();h.send(yc,69,100,0,0x90,1);assert.equal(h.notes.length,count+2,'old timestamp ignored');h.off(yc,69);h.send(yc,69);assert.equal(h.notes.length,count+3);h.off(yc,69);
 // A previous port callback must be inert after switching, disconnection or reconnect.
 const stale=yc.onmidimessage;h.change('other');stale({data:[0x90,60,100],timeStamp:200});assert.equal(h.notes.length,count+3);h.send(h.ports[0],60);assert.equal(h.notes.length,count+4);h.off(h.ports[0],60);
 h.ports[0].state='disconnected';h.access.onstatechange();assert.match(h.el('midiStatus').textContent,/disconnected/);assert.equal(yc.opens,1,'unplug does not silently select another keyboard');h.ports[0].state='connected';h.access.onstatechange();h.send(h.ports[0],61);assert.equal(h.notes.length,count+5);h.off(h.ports[0],61);
 h.send(h.ports[0],62);h.w.dispatchEvent(new h.w.Event('blur'));h.send(h.ports[0],63);assert.equal(h.notes.length,count+6);h.off(h.ports[0],62);h.off(h.ports[0],63);h.send(h.ports[0],63);assert.equal(h.notes.length,count+6,'still unfocused after releasing keys');h.w.dispatchEvent(new h.w.Event('focus'));h.send(h.ports[0],64);assert.equal(h.notes.length,count+6,'background-held key quarantines refocus');h.off(h.ports[0],63);h.off(h.ports[0],64);h.send(h.ports[0],63);assert.equal(h.notes.length,count+7);
 const disconnected=h.ports[0].onmidimessage;h.el('disconnectMidi').click();disconnected({data:[0x90,60,100],timeStamp:500});assert.equal(h.notes.length,count+7);assert(h.el('midiInput').disabled);h.close();
 // Unsupported/insecure/denied/no-device and late permission resolution are recoverable.
 for(const config of [{secure:false},{supported:false}]){h=setup(config);h.el('connectMidi').click();assert.equal(h.requests.length,0);assert.match(h.el('midiStatus').textContent,/HTTPS|unavailable/);h.close();}
 h=setup();h.el('connectMidi').click();h.el('connectMidi').click();assert.equal(h.requests.length,1);h.requests[0].reject(Object.assign(Error('denied'),{name:'NotAllowedError'}));await flush();assert.match(h.el('midiStatus').textContent,/denied or blocked/);assert(!h.el('connectMidi').disabled);h.close();
 h=setup({ports:[]});await h.connect();assert.match(h.el('midiStatus').textContent,/No MIDI inputs/);const plugged=port('new');h.access.inputs.set('new',plugged);h.access.onstatechange();h.send(plugged,60);assert.equal(h.notes.length,1);h.close();
 h=setup();h.el('connectMidi').click();h.el('disconnectMidi').click();h.requests[0].resolve(h.access);await flush();assert.equal(h.ports[1].opens,0);assert.equal(h.access.onstatechange,null);h.close();
 h=setup({ports:[port('bad')]});h.ports[0].open=()=>Promise.reject(Error('open failed'));await h.connect();await flush();assert.match(h.el('midiStatus').textContent,/Could not open/);h.close();
 // Rejected or synchronously throwing open must not loop when close emits state changes.
 for(const failure of ['reject','throw']){
  h=setup({ports:[port('bad')]});const bad=h.ports[0];let attempts=0;
  bad.open=()=>{attempts++;if(failure==='throw')throw Error('open failed');return Promise.reject(Error('open failed'));};
  await h.connect();await flush();assert.equal(attempts,1);assert.equal(bad.onmidimessage,null);
  for(let i=0;i<10;i++){h.access.onstatechange();await flush();}assert.equal(attempts,1,'failed input must not auto-open on statechange');
  h.change('bad');await flush();assert.equal(attempts,2,'explicit selection retries once');
  for(let i=0;i<4;i++)h.access.onstatechange();await flush();assert.equal(attempts,2);
  bad.state='disconnected';h.access.onstatechange();bad.state='connected';h.access.onstatechange();await flush();assert.equal(attempts,3,'physical reconnect permits retry');
  h.el('disconnectMidi').click();await h.connect();await flush();assert.equal(attempts,4,'explicit disconnect/reconnect permits retry');h.close();
 }
 // Binding tokens also reject callbacks from the same port after switching away and back.
 h=setup();await h.connect();const original=h.ports[1].onmidimessage;h.change('other');h.change('yc');original({data:[0x90,60,100],timeStamp:100});assert.equal(h.notes.length,0);h.send(h.ports[1],60);assert.equal(h.notes.length,1);h.close();
 // Disconnect/reconnect during an unresolved request cannot attach the stale permission result.
 h=setup();h.el('connectMidi').click();h.el('disconnectMidi').click();h.el('connectMidi').click();h.requests[1].resolve(h.access);await flush();h.requests[0].reject(Error('old request rejected'));await flush();assert.match(h.el('midiStatus').textContent,/Connected/);h.send(h.ports[1],60);assert.equal(h.notes.length,1);h.close();
 // Short MIDI voice awaits are invalidated by release, newer same-note strikes, and mode changes.
 h=setup({app:true,audio:true});await h.connect();h.audioResumes[0].resolve();await flush();const ap=h.ports[1];
 h.send(ap,60);h.off(ap,60);h.audioResumes[1].resolve();await flush();assert.equal(h.audioOscillators.length,0,'note-off before resume must stay silent');
 h.send(ap,60);h.off(ap,60);h.send(ap,60);h.audioResumes[3].resolve();await flush();assert.equal(h.audioOscillators.length,1);h.audioResumes[2].resolve();await flush();assert.equal(h.audioOscillators.length,1,'older same-note resume ignored');assert.equal(h.audioOscillators[0].frequency.value,440*2**((60-69)/12));h.off(ap,60);assert(h.audioOscillators[0].stops.at(-1)<h.audioOscillators[0].stops[0]);
 h.send(ap,62);h.mode('find');h.audioResumes[4].resolve();await flush();assert.equal(h.audioOscillators.length,1,'navigation cancels pending voice');h.off(ap,62);h.close();
 // Shared app path: all seven modes, no MIDI outputs, direct wrong-key retry and fair clocks.
 for(const mode of ['free','find','remember','semitones','degrees','builder','dictionary']){
  h=setup({app:true});await h.connect();const p=h.ports[1];h.mode(mode);if(mode==='remember')h.advance(1800);
  if(mode==='free'){h.send(p,48);h.off(p,48);h.send(p,48);assert.deepEqual(Array.from(h.get().selected),[48]);h.off(p,48);h.send(p,100);assert.deepEqual(Array.from(h.get().selected).sort((a,b)=>a-b),[48,100]);h.off(p,100);}
  else if(mode==='dictionary'){h.el('toggleChordNotes').click();const notes=Array.from(h.get().dictionaryVoicing);h.send(p,notes[0]+12);assert.equal(h.get().selected.length,0);h.off(p,notes[0]+12);for(const n of notes){h.send(p,n);h.off(p,n);}assert.match(h.el('trainingPrompt').textContent,/Correct/);h.advance(1800);assert.equal(h.get().selected.length,0);assert.deepEqual(Array.from(h.get().dictionaryVoicing),notes);}
  else {
   const target=h.get().target,wrong=((mode==='degrees'?h.get().chordAnswer:target)+1)%12+48;h.el('timerEnabled').checked=true;h.el('timerEnabled').dispatchEvent(new h.w.Event('change'));const before=h.get();h.send(p,wrong);h.off(p,wrong);assert.equal(h.get().target,target);assert.equal(h.get().deadline,before.deadline);assert(h.d.querySelector(`[data-midi="${wrong}"]`)?.classList.contains('wrongAnswer'));
   if(mode==='builder'||mode==='remember'){h.send(p,target+12);h.off(p,target+12);assert.equal(h.get().target,target,'exact octave required');}
   const correct=mode==='degrees'?h.get().chordAnswer+96:mode==='find'||mode==='semitones'?target%12+96:target;
   h.send(p,correct);assert.equal(h.get().target,null);h.off(p,correct);h.advance(1800);assert(h.get().target!==null);if(mode==='builder')assert.equal(h.get().step,2);
  }
  h.close();
 }
 // Settings and background notes cannot answer; releases still unblock the next attempt.
 h=setup({app:true});await h.connect();const p=h.ports[1];h.mode('find');let target=h.get().target;h.el('openSettings').click();h.send(p,target);h.el('closeSettings').click();assert.equal(h.get().target,target);h.send(p,target);assert.equal(h.get().target,target);h.off(p,target);h.send(p,target);assert.equal(h.get().target,null);h.off(p,target);h.advance(1800);target=h.get().target;
 Object.defineProperty(h.d,'hidden',{configurable:true,value:true});h.d.dispatchEvent(new h.w.Event('visibilitychange'));h.send(p,target);assert.equal(h.get().target,target);h.off(p,target);Object.defineProperty(h.d,'hidden',{configurable:true,value:false});h.d.dispatchEvent(new h.w.Event('visibilitychange'));h.send(p,target);assert.equal(h.get().target,null);h.off(p,target);h.close();
 // Held simultaneous dictionary chords cannot complete the next practice until released.
 h=setup({app:true});await h.connect();h.mode('dictionary');h.el('toggleChordNotes').click();const dp=h.ports[1],voicing=Array.from(h.get().dictionaryVoicing);voicing.forEach(n=>h.send(dp,n));assert.match(h.el('trainingPrompt').textContent,/Correct/);h.advance(1800);voicing.forEach(n=>h.send(dp,n));assert.equal(h.get().selected.length,0);voicing.forEach(n=>h.off(dp,n));voicing.forEach(n=>h.send(dp,n));assert.match(h.el('trainingPrompt').textContent,/Correct/);voicing.forEach(n=>h.off(dp,n));h.close();
 // A held builder key and chord stragglers cannot answer the newly advanced step.
 h=setup({app:true});await h.connect();h.mode('builder');const bp=h.ports[1],first=h.get().target;h.send(bp,first);h.advance(1800);const second=h.get().target;h.send(bp,second);assert.equal(h.get().target,second);h.off(bp,first);h.off(bp,second);h.send(bp,second);assert.equal(h.get().notes.length,3);h.off(bp,second);h.close();
 console.log('PASS: simulated MIDI explicit permission/sysex:false/input-only; YC Port1 preference;16channels/note-off/velocity0/layer dedup; held-boundary/timestamps; hotplug/reconnect/switch/stale callbacks; denied/unsupported/secure/no-device; all7 app modes; exact vs pitch-class octaves; direct retry/fair timers; modal/background/held-step gates. No physical keyboard or audible-device QA.');
})().catch(error=>{console.error(error);process.exitCode=1;});
