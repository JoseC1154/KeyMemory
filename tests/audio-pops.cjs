// Deterministic WebAudio envelope regression, not audible device verification.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(process.env.APP_SOURCE||path.join(root,'app.js'),'utf8');
const near=(a,b,label)=>assert(Math.abs(a-b)<1e-9,`${label}: ${a} != ${b}`);
const flush=()=>new Promise(resolve=>setImmediate(resolve));

// A small evaluator for the set/linear/exponential automation used by tap voices.
// Unlike a call-only mock, deleting an endpoint here really changes the envelope.
class Envelope {
  constructor(hold){this.value=.91;this.events=[];this.calls=[];if(!hold)this.cancelAndHoldAtTime=undefined;}
  add(kind,value,time){this.events.push({kind,value,time});this.events.sort((a,b)=>a.time-b.time);}
  at(time){
    let previous={time:0,value:this.value};
    for(const event of this.events){
      if(time<event.time){
        const fraction=(time-previous.time)/(event.time-previous.time);
        if(event.kind==='linear')return previous.value+(event.value-previous.value)*fraction;
        if(event.kind==='exponential')return previous.value*(event.value/previous.value)**fraction;
        return previous.value;
      }
      previous=event;
    }
    return previous.value;
  }
  setValueAtTime(value,time){this.calls.push(['set',value,time]);this.add('set',value,time);}
  linearRampToValueAtTime(value,time){this.calls.push(['linear',value,time]);this.add('linear',value,time);}
  exponentialRampToValueAtTime(value,time){assert(value>0);this.calls.push(['exponential',value,time]);this.add('exponential',value,time);}
  cancelScheduledValues(time){this.calls.push(['cancel',time]);this.events=this.events.filter(event=>event.time<time);}
  cancelAndHoldAtTime(time){
    const value=this.at(time),next=this.events.find(event=>event.time>=time);
    this.calls.push(['hold',time]);this.events=this.events.filter(event=>event.time<time);
    this.add(next&&['linear','exponential'].includes(next.kind)?next.kind:'set',value,time);
  }
  setTargetAtTime(){throw Error('Tap release must reach zero before oscillator stop');}
}

function setup(hold=true){
  const w=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{pretendToBeVisual:true,runScripts:'outside-only',url:'https://keymemory.test/'}).window;
  w.localStorage.setItem('keymemory.sound.v1','on');w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}};
  let now=1,defer=false,id=0,midi;const oscillators=[],pending=[];
  w.Date.now=()=>now*1000;w.performance.now=()=>now*1000;
  w.setTimeout=w.setInterval=()=>++id;w.clearTimeout=w.clearInterval=()=>{};
  w.AudioContext=class {
    state='running';get currentTime(){return now;}destination={};
    resume(){return defer?new Promise(resolve=>pending.push(resolve)):Promise.resolve();}
    createGain(){return{gain:new Envelope(hold),connect(){},disconnect(){this.disconnected=true;}};}
    createOscillator(){
      const voice={frequency:{value:0},starts:[],stops:[],connect(gain){this.gain=gain;},disconnect(){this.disconnected=true;},start(time){this.starts.push(time);},stop(time){this.stops.push(time);}};
      oscillators.push(voice);return voice;
    }
  };
  w.KeyMemoryMidi={create:config=>{midi=config;return{resetQuestion(){config.onReset();},isConnected(){return false;}};}};
  w.eval(source+'\nwindow.audioPopTest={enable:enableSoundAudio,sound:soundMidiNote,release:releaseMidiNote,reset:resetMidiAudio,mode:activateMode,voices:midiVoices};');
  return{w,api:w.audioPopTest,oscillators,pending,midi:()=>midi,time:t=>{now=t;},defer:value=>{defer=value;},close:()=>w.close()};
}

function tapGain(elapsed){
  if(elapsed<=.015)return .07*elapsed/.015;
  if(elapsed<=.7)return .07*(.001/.07)**((elapsed-.015)/.685);
  if(elapsed<=.73)return .001*(.73-elapsed)/.03;
  return 0;
}

function verifyRelease(voice,at,expected,history){
  const gain=voice.gain.gain;
  near(gain.at(at),expected,'release starts at the existing gain');
  for(const [time,value] of history)near(gain.at(time),value,'interrupted ramp history is preserved');
  near(gain.at(at+.05),expected/2,'release fades continuously');
  near(gain.at(at+.1),0,'release reaches silence');
  near(gain.at(voice.stops.at(-1)),0,'oscillator stops silently');
  near(voice.stops.at(-1),at+.12,'release stop deadline');
}

(async()=>{
  let scenarios=0;
  for(const hold of [true,false]){
    const h=setup(hold);await h.api.enable();
    // Every MIDI pitch and every envelope phase, including the exact boundaries.
    for(let note=0;note<=127;note++)for(const elapsed of [0,.001,.014,.015,.016,.1,.35,.699,.7,.715,.73,.74,.75,.8]){
      const start=2+scenarios*2;h.time(start);await h.api.sound(note);const voice=h.oscillators.at(-1),gain=voice.gain.gain;
      near(voice.frequency.value,440*2**((note-69)/12),'pitch');near(voice.starts[0],start,'start');
      near(voice.stops[0],start+.75,'tap duration unchanged');near(gain.at(start),0,'silent attack');
      near(gain.at(start+.73),0,'natural tail reaches zero');near(gain.at(start+.75),0,'natural stop is silent');
      const at=start+elapsed,expected=tapGain(elapsed),history=Array.from({length:17},(_,i)=>{const t=start+elapsed*i/17;return[t,gain.at(t)];});
      h.time(at);h.midi().onRelease(note);verifyRelease(voice,at,expected,history);
      assert.equal(gain.calls.some(call=>call[0]==='hold'),hold,'native hold or reconstructed fallback');
      assert(!h.api.voices.has(note));voice.onended();assert(voice.disconnected&&voice.gain.disconnected);
      const stops=voice.stops.length;h.midi().onRelease(note);assert.equal(voice.stops.length,stops,'duplicate late release is harmless');scenarios++;
    }
    // Retrigger fades the previous voice without jumping; stale onended is harmless.
    h.time(10000);await h.api.sound(60);const old=h.oscillators.at(-1);h.time(10000.3);await h.api.sound(60);const current=h.oscillators.at(-1);
    verifyRelease(old,10000.3,tapGain(.3),[]);old.onended();assert.equal(h.api.voices.get(60).osc,current);h.api.release(60);assert(!h.api.voices.has(60));
    // Polyphonic reset fades each voice from its own current level.
    h.time(10001);await h.api.sound(48);h.time(10001.1);await h.api.sound(64);const chord=h.oscillators.slice(-2);h.time(10001.4);h.api.reset();
    verifyRelease(chord[0],10001.4,tapGain(.4),[]);verifyRelease(chord[1],10001.4,tapGain(.3),[]);assert.equal(h.api.voices.size,0);
    // A pending note must not appear after release, reset, or another request.
    h.defer(true);const released=h.api.sound(67);h.api.release(67);const reset=h.api.sound(69);h.api.reset();const count=h.oscillators.length;
    h.pending.splice(0).forEach(resolve=>resolve());await Promise.all([released,reset]);assert.equal(h.oscillators.length,count);
    h.close();
  }
  // The real shared MIDI route reaches the fixed envelope in all eight affected modes.
  for(const mode of ['free','find','remember','semitones','degrees','builder','dictionary','scale']){
    const h=setup();await h.api.enable();h.api.mode(mode);await flush();h.midi().onNote(60);await flush();
    const voice=h.oscillators.at(-1);assert(voice,mode+' plays a note');h.time(1.35);h.midi().onRelease(60);verifyRelease(voice,1.35,tapGain(.35),[]);h.close();
  }
  console.log(`PASS: ${scenarios} tap-release envelopes across MIDI0–127, attack/decay/tail boundaries, native hold and fallback; exact zero before natural/released stop; repeat/polyphonic reset/stale-ended/deferred-resume safety; all eight non-Phrase MIDI routes. Deterministic automation only, not audible hardware QA.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
