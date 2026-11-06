// Actual import UI with an automation evaluator, not audible hardware validation.
'use strict';
const assert=require('node:assert/strict'),{loaded,reviewed,flush}=require('./audio-import-ui.cjs');
const near=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} differs from ${b}`);
class Envelope{
 constructor(hold){this.value=1;this.events=[];if(!hold)this.cancelAndHoldAtTime=undefined;}
 add(kind,value,time){this.events.push({kind,value,time});this.events.sort((a,b)=>a.time-b.time);}
 at(time){let prior={time:0,value:this.value};for(const event of this.events){if(time<event.time)return event.kind==='linear'?prior.value+(event.value-prior.value)*(time-prior.time)/(event.time-prior.time):prior.value;prior=event;}return prior.value;}
 setValueAtTime(v,t){this.add('set',v,t);}linearRampToValueAtTime(v,t){this.add('linear',v,t);}
 cancelScheduledValues(t){this.events=this.events.filter(e=>e.time<t);}
 cancelAndHoldAtTime(t){const value=this.at(t),next=this.events.find(e=>e.time>=t);this.cancelScheduledValues(t);this.add(next?.kind==='linear'?'linear':'set',value,t);}
}
(async()=>{
 for(const hold of [false,true])for(const kind of ['original','notes'])for(const position of ['attack','sustain','release']){
  const h=kind==='notes'?await reviewed():await loaded(),gains=[],oscillators=[],sources=[];
  h.w.AudioContext.prototype.createGain=function(){const gain={gain:new Envelope(hold),connect(){},disconnect(){}};gains.push(gain);return gain;};
  h.w.AudioContext.prototype.createBufferSource=function(){const source={connect(gain){this.gain=gain;},disconnect(){},start(...args){this.started=args;},stop(t){this.stopped=t;}};sources.push(source);return source;};
  h.w.AudioContext.prototype.createOscillator=function(){const oscillator={frequency:{value:0},connect(gain){this.gain=gain;},disconnect(){},start(t){this.started=t;},stop(t){this.stopped=t;}};oscillators.push(oscillator);return oscillator;};
  h.click(kind==='original'?'audioImportOriginal':'audioImportNotesPreview');await flush();const context=h.contexts.at(-1);
  // Original starts at .03; candidate notes begin at .13 and are scheduled by lookahead.
  if(kind==='notes'){context.currentTime=.12;await new Promise(r=>setTimeout(r,40));}
  const envelope=gains[0].gain,time=kind==='original'?(position==='attack'?.035:position==='sustain'?1:4.025):(position==='attack'?.134:position==='sustain'?.3:.6475);
  context.currentTime=time;const before=envelope.at(time),history=envelope.at(time-.001);assert(before>0);
  h.click('audioImportStopPreview');near(envelope.at(time),before);near(envelope.at(time-.001),history);const fadeLength=kind==='original'?Math.min(.025,sources[0].started[0]+sources[0].started[2]-time):.025;near(envelope.at(time+fadeLength/2),before/2);near(envelope.at(time+fadeLength),0);near(envelope.at(time+fadeLength+.01),0);if(kind==='original')near(envelope.at(sources[0].started[0]+sources[0].started[2]),0);
  if(kind==='notes')near(oscillators[0].stopped,time+.035);h.close();
 }
 console.log('PASS import preview envelopes: attack/sustain/release cancellation preserves current and prior gain, fades continuously to zero before stop, native hold and fallback, original and note previews. No listening claim.');
})();
