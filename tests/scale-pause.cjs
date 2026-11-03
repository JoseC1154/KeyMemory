// Reuse the deterministic DOM/MIDI harness, without running its full suite.
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert/strict');
const filename=path.join(__dirname,'scale-builder.cjs'),harness=new Module(filename,module);
harness.filename=filename;harness.paths=module.paths;
harness._compile(fs.readFileSync(filename,'utf8').split('(async()=>{')[0]+'\nmodule.exports={setup,start,choices};',filename);
const {setup,start,choices}=harness.exports;
function snapshot(h){const s=h.state();return JSON.stringify({phase:s.scalePhase,lives:s.scaleLives,correction:s.scaleCorrection,runs:s.scaleRuns,index:s.scaleIndex,streak:s.scaleStreak,reverse:s.scaleReverseStreak,target:s.targetMidi,question:s.question,shown:s.scaleQuestionsShown,prompt:s.prompt,selected:[...h.d.querySelectorAll('.key.selected')].map(k=>k.dataset.midi)});}
function pause(h){
 const phase=h.state().scalePhase,button=h.el(phase==='ready'?'pauseScaleRun':phase==='degree-preview'?'pauseScaleDegree':'pauseScale');
 button.focus();const before=snapshot(h),callbacks=h.callbacks(),state=h.state(),deadline=state.raceClock?state.deadline:state.degreeClock?(phase.startsWith('reverse-')?state.reverseDeadline:state.degreeDeadline):null,remaining=deadline===null?null:deadline-h.now();button.click();
 assert(!h.el('scalePauseOverlay').hidden);assert.equal(h.d.activeElement,h.el('resumeScale'));assert(h.d.querySelector('.shell').inert);
 h.el('openSettings').click();h.el('openModes').click();assert(!h.el('scalePauseOverlay').hidden);assert(h.el('settingsOverlay').hidden);assert(h.el('modeOverlay').hidden);
 h.advance(60000);callbacks.forEach(fn=>fn());assert.equal(snapshot(h),before,phase+' stays frozen');
 h.press(h.state().notes[0]);h.el('scaleStart').click();assert.equal(snapshot(h),before,'input behind pause ignored');
 h.el('resumeScale').click();if(phase==='preview'){const pending=h.pending().length;callbacks.forEach(fn=>fn());assert.equal(h.pending().length,pending,'stale preview callback cannot create duplicate timers');}assert(h.el('scalePauseOverlay').hidden);assert.equal(snapshot(h),before,phase+' survives resume');assert.equal(h.d.activeElement,button);if(remaining!==null){const after=h.state();assert.equal((after.raceClock?after.deadline:phase.startsWith('reverse-')?after.reverseDeadline:after.degreeDeadline)-h.now(),remaining,phase+' exact remaining clock');}
}
(async()=>{
 const h=setup();h.mode('scale');h.advance(123);const selected=snapshot(h);pause(h);h.advance(526);assert.equal(snapshot(h),selected);h.advance(1);assert.notEqual(snapshot(h),selected,'study tick retains 527 ms');
 start(h);const phases=new Set();
 for(let safety=0;safety<200;safety++){
  const s=h.state();phases.add(s.scalePhase);const elapsed=['ready','preview'].includes(s.scalePhase)||(s.scalePhase==='degree-preview'&&s.scaleQuestionsShown<=5)?0:74;h.advance(elapsed);pause(h);
  switch(s.scalePhase){
   case 'race':for(const n of s.notes)h.press(n);break;
   case 'ready':h.el('confirmScaleRun').click();break;
   case 'levelup':case 'reverse-levelup':h.advance(2500-elapsed);break;
   case 'degree-preview':if(s.scaleQuestionsShown<=5)h.el('confirmScaleDegree').click();else{h.advance(2000-elapsed-1);assert.equal(h.state().scalePhase,'degree-preview','paused auto-preview keeps exact two-second remainder');h.advance(1);assert.equal(h.state().scalePhase,'degrees');}break;
   case 'degrees':h.press(s.targetMidi);break;
   case 'degree-success':case 'reverse-success':h.advance(300-elapsed);break;
   case 'reverse-show':h.advance(2000-elapsed);break;
   case 'reverse-answer':choices(h)[s.scaleReverseIndex].click();break;
   case 'passed':h.advance(2500-elapsed);break;
   case 'preview':safety=200;break;
   default:throw Error(s.scalePhase);
  }
 }
 for(const phase of ['ready','race','levelup','degree-preview','degrees','degree-success','reverse-levelup','reverse-show','reverse-answer','reverse-success','passed'])assert(phases.has(phase),phase+' tested');
 start(h);await h.connect();const first=h.state().notes[0];h.send(first);const index=h.state().scaleIndex;h.el('pauseScale').click();h.send(h.state().notes[index]);h.el('resumeScale').click();h.send(h.state().notes[index]);assert.equal(h.state().scaleIndex,index,'held MIDI cannot grade on resume');h.send(first,0);h.send(h.state().notes[index],0);h.send(h.state().notes[index]);assert.equal(h.state().scaleIndex,index+1,'fresh released MIDI works');h.advance(321);const remaining=h.state().deadline-h.now();pause(h);assert.equal(h.state().deadline-h.now(),remaining,'race exact remainder');h.advance(remaining+80);assert.equal(h.state().scalePhase,'correction');pause(h);h.el('continueScaleCorrection').click();assert.equal(h.state().scalePhase,'ready');
 h.el('pauseScaleRun').click();h.d.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!h.el('scaleRunOverlay').hidden);assert.equal(h.state().scalePhase,'ready');
 h.el('pauseScaleRun').click();h.el('scalePauseOverlay').click();assert(!h.el('scaleRunOverlay').hidden);
 h.el('pauseScaleRun').click();h.change('scaleRoot','2');assert(h.el('scalePauseOverlay').hidden);assert.equal(h.state().scalePhase,'preview');h.advance(10000);assert.equal(h.state().scalePhase,'preview');
 h.el('pauseScale').click();h.mode('free');assert(h.el('scalePauseOverlay').hidden);assert(h.el('pauseScale').hidden);assert(!h.d.querySelector('.shell').inert);
 h.close();console.log('PASS explicit pause across every scale phase, precise study/race remainder, modal restoration, dismissal and stale reset');
})().catch(error=>{console.error(error);process.exitCode=1});
