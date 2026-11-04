// Synthetic input only: no physical device or audible-output claims.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
function setup(saved){
 const w=new JSDOM('<button id="connect"></button><button id="disconnect"></button><select></select><span></span>',{url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true}).window;
 Object.defineProperty(w,'isSecureContext',{value:true});Object.defineProperty(w.document,'hidden',{value:false,configurable:true});
 if(saved)w.localStorage.setItem('keymemory.midiTransport.v1',saved);
 w.eval(fs.readFileSync(path.join(root,'midi-transport.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'midi.js'),'utf8'));
 const actions=[],raw=[],notes=[],released=[];let resets=0;
 const transport=w.KeyMemoryMidiTransport.create({onAction:(...a)=>actions.push(a)});
 const port={id:'any-device',state:'connected',open(){},close(){}};
 const access={inputs:new Map([[port.id,port]])};w.navigator.requestMIDIAccess=async()=>access;
 const midi=w.KeyMemoryMidi.create({transport,onNote:n=>notes.push(n),onRelease:n=>released.push(n),onReset:()=>resets++,onRaw:e=>raw.push(e),status:w.document.querySelector('span'),select:w.document.querySelector('select'),connect:w.document.querySelector('#connect'),disconnect:w.document.querySelector('#disconnect')});
 const send=(number,value=100,channel=0,kind=0x90)=>port.onmidimessage?.({data:[kind|channel,number,value],timeStamp:w.performance.now()});
 return{w,transport,midi,port,access,actions,raw,notes,released,send,get resets(){return resets;},async connect(){w.document.querySelector('#connect').click();await new Promise(resolve=>setImmediate(resolve));},close(){w.close();}};
}
const map=(kind,number,channel=0)=>({kind,number,channel});
(async()=>{
 let h=setup();await h.connect();assert.equal(h.transport.getState().enabled,false);
 h.transport.setMapping('record',map('note',36));h.send(36);assert.equal(h.raw.length,1);h.send(36,0);h.transport.setEnabled(true);
 let before=h.raw.length;
 for(let channel=0;channel<16;channel++){
  h.transport.setMapping('record',map('note',36,channel));
  const count=h.actions.length;h.send(36,0,channel,0x80);assert.equal(h.actions.length,count);
  h.send(36,110,channel);h.send(36,120,channel);assert.equal(h.actions.length,count+1);
  h.send(36,0,channel);h.send(36,127,channel);assert.equal(h.actions.length,count+2);h.send(36,64,channel,0x80);
 }
 assert.equal(h.raw.length,before,'reserved on/off excluded from raw');assert.equal(h.notes.length,0,'reserved input never graded');
 h.transport.setMapping('record',map('note',36));assert.equal(h.transport.setMapping('stop',map('note',36)),false);assert.match(h.transport.getState().error,/already assigned/);
 assert.equal(h.transport.setMapping('stop',map('control',120)),false);assert.equal(h.transport.setMapping('bad',map('note',40)),false);
 for(const cc of [0,7,11,64,119]){
  h.transport.setMapping('stop',map('control',cc));let count=h.actions.length;
  h.send(cc,0,0,0xb0);h.send(cc,63,0,0xb0);assert.equal(h.actions.length,count);
  h.send(cc,64,0,0xb0);h.send(cc,127,0,0xb0);assert.equal(h.actions.length,count+1);
  h.send(cc,0,0,0xb0);h.send(cc,127,0,0xb0);assert.equal(h.actions.length,count+2);h.send(cc,0,0,0xb0);
 }
 for(let channel=0;channel<16;channel++){
  h.transport.setMapping('stop',map('control',22,channel));const n=h.actions.length;
  h.send(22,127,channel,0xb0);h.send(22,100,channel,0xb0);h.send(22,0,channel,0xb0);
  assert.equal(h.actions.length,n+1);
 }
 assert.equal(h.raw.length,before,'reserved CC low and high never reach raw');
 // Learning isolates every event and does not execute the learned control.
 h.transport.learn('play');const count=h.actions.length;h.send(42,0);h.send(20,10,0,0xb0);assert.equal(h.transport.getState().learning,'play');
 h.send(42);assert.equal(h.transport.getState().mappings.play.number,42);assert.equal(h.actions.length,count);h.send(42);h.send(42,0);assert.equal(h.raw.length,before);h.send(42);assert.equal(h.actions.length,count+1);h.send(42,0);
 h.transport.learn('practice');h.send(36);assert.match(h.transport.getState().error,/already assigned/);assert.equal(h.transport.getState().learning,'practice');h.send(36,0);h.transport.cancelLearn();
 // A musical note held during edits is reset and quarantined through release.
 h.send(60);const resets=h.resets;h.transport.setMapping('continue',map('note',60));assert(h.resets>resets);const r=h.raw.length,a=h.actions.length;h.send(60);h.send(60,0);assert.equal(h.raw.length,r);assert.equal(h.actions.length,a);h.send(60);assert.equal(h.actions.length,a+1);
 h.transport.removeMapping('continue');h.send(60);h.send(60,0);assert.equal(h.raw.length,r);h.send(60);assert.equal(h.raw.length,r+1);h.send(60,0);
 // Disabling a held binding consumes its final release; future notes are musical again.
 h.send(42);const disabledActions=h.actions.length,disabledRaw=h.raw.length;
 h.transport.setEnabled(false);h.send(42);h.send(42,0);
 assert.equal(h.actions.length,disabledActions);assert.equal(h.raw.length,disabledRaw);
 h.send(42);h.send(42,0);assert.equal(h.raw.length,disabledRaw+2);
 h.transport.setEnabled(true);
 // Background press cannot trigger; release is required after refocus.
 const ac=h.actions.length;h.w.dispatchEvent(new h.w.Event('blur'));h.send(42);h.w.dispatchEvent(new h.w.Event('focus'));h.send(42);assert.equal(h.actions.length,ac);h.send(42,0);h.send(42);assert.equal(h.actions.length,ac+1);h.send(42,0);
 Object.defineProperty(h.w.document,'hidden',{value:true,configurable:true});h.w.document.dispatchEvent(new h.w.Event('visibilitychange'));h.send(42);assert.equal(h.actions.length,ac+1);h.send(42,0);Object.defineProperty(h.w.document,'hidden',{value:false,configurable:true});
 h.send(42);const stale=h.port.onmidimessage;h.midi.disconnect();stale({data:[0x90,42,100]});const disconnectCount=h.actions.length;await h.connect();h.send(42);assert.equal(h.actions.length,disconnectCount+1,'disconnect clears held transport state');h.send(42,0);
 const saved=h.w.localStorage.getItem('keymemory.midiTransport.v1');h.close();h=setup(saved);assert.equal(h.transport.getState().enabled,true);assert.equal(h.transport.getState().mappings.play.number,42);h.close();
 for(const malformed of ['{','null',JSON.stringify({version:1,enabled:true,mappings:{record:map('note',40),stop:map('note',40),play:map('control',122),practice:map('note',2,16)}})]){
  h=setup(malformed);const m=h.transport.getState().mappings;assert(!m.stop&&!m.play&&!m.practice);h.close();
 }
 console.log('PASS MIDI transport: 16 channels; reserved on/off and CC edges before raw/grading; learn/edit/remove/disable; conflicts; repeats; threshold; persisted validation; held-edit quarantine; blur/visibility; disconnect/stale callback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
