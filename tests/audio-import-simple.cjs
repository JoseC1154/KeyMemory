'use strict';
const assert=require('node:assert/strict'),{setup,loaded,reviewed,flush}=require('./audio-import-ui.cjs');
(async()=>{
 // The ordinary path never opens the note/timing editor or requires an edit.
 for(const filename of ['piano.wav','screen-recording.mov']){
  const h=setup();h.open();assert(!h.el('audioImportOptions').open);assert(!h.el('audioImportEditor').open);
  await h.setFile(filename);assert.equal(h.count().calls,0);assert.match(h.el('audioImportSection').textContent,/Full clip · 4 seconds/);
  h.click('audioImportAnalyze');await flush();await flush();assert.equal(h.count().calls,1);
  assert(!h.el('audioImportReview').hidden);assert(!h.el('audioImportEditor').open);assert(!h.el('audioImportOptions').open);
  assert.equal(h.el('audioImportNoteList').closest('details'),h.el('audioImportEditor'));
  assert.equal(h.el('audioImportAdd').closest('details'),h.el('audioImportEditor'));
  assert.equal(h.el('audioImportPrevious').closest('details'),h.el('audioImportEditor'));
  assert.equal(h.el('audioImportStart').closest('details'),h.el('audioImportOptions'));
  assert.equal(h.el('audioImportNotesPreview').closest('details'),null);assert.equal(h.el('audioImportUse').closest('details'),null);
  assert.equal(h.el('audioImportCount').textContent,'2 notes ready');assert.equal(h.el('audioImportUse').textContent,'Replace saved phrase');
  assert.equal(h.store(),h.original);h.w.confirm=()=>false;h.click('audioImportUse');assert.equal(h.store(),h.original);assert(!h.el('phraseImportOverlay').hidden);
  h.w.confirm=()=>true;h.click('audioImportUse');assert(h.el('phraseImportOverlay').hidden);assert.equal(h.count().commits,1);
  assert.deepEqual(h.snapshot().notes.map(({note,start,duration})=>({note,start,duration})),[{note:60,start:100,duration:500},{note:64,start:100,duration:500}]);h.close();
 }
 // Optional detail is reversible and never mutates notes, selection or saved state.
 let h=await reviewed();const before=h.el('audioImportNoteList').innerHTML;
 h.el('audioImportEditor').open=true;h.el('audioImportEditor').open=false;h.el('audioImportOptions').open=true;h.el('audioImportOptions').open=false;
 assert.equal(h.el('audioImportNoteList').innerHTML,before);assert.equal(h.store(),h.original);assert.equal(h.count().calls,1);
 // Hidden detail is excluded from the shared modal's Tab boundary.
 h.el('audioImportEditor').querySelector('summary').focus();h.d.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(h.d.activeElement,h.el('audioImportClose'));
 h.el('audioImportClose').focus();h.d.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(h.d.activeElement,h.el('audioImportEditor').querySelector('summary'));
 h.el('audioImportEditor').open=true;h.el('audioImportOptions').open=true;h.click('audioImportClose');h.open();assert(!h.el('audioImportEditor').open);assert(!h.el('audioImportOptions').open);assert.equal(h.store(),h.original);h.close();
 // Section scope remains visible even when its numeric fields are collapsed.
 h=setup();h.open();h.setDuration(60);await h.setFile('long.mov');assert.match(h.el('audioImportSection').textContent,/First 30 seconds of your 60-second file/);h.el('audioImportOptions').open=true;h.change('audioImportStart','4.123456');h.change('audioImportEnd','10.234567');
 h.setOutput([{pitchMidi:61,startTimeSeconds:.123456789,durationSeconds:.456789123}]);h.click('audioImportAnalyze');await flush();await flush();assert(!h.el('audioImportOptions').open);assert(!h.el('audioImportEditor').open);assert.match(h.el('audioImportSection').textContent,/Selected section/);
 h.click('audioImportUse');assert.equal(h.snapshot().notes[0].start,.123456789*1000);assert(Math.abs(h.snapshot().notes[0].duration-.456789123*1000)<1e-9);h.close();
 // New files and empty results do not expose the editor; errors stay prominent.
 h=await reviewed();h.el('audioImportEditor').open=true;await h.setFile('replacement.mp4');assert(!h.el('audioImportEditor').open);assert(h.el('audioImportReview').hidden);h.setOutput([]);h.click('audioImportAnalyze');await flush();await flush();assert(h.el('audioImportUse').disabled);assert(!h.el('audioImportEditor').open);assert.match(h.el('audioImportStatus').textContent,/No clear notes/);assert.equal(h.store(),h.original);h.close();
 // Optional corrections still block import while invalid, even after collapsing.
 h=await reviewed();h.el('audioImportEditor').open=true;let input=h.el('audioImportNoteList').querySelector('[data-field=start]');input.value='';input.dispatchEvent(new h.w.Event('change',{bubbles:true}));h.el('audioImportEditor').open=false;assert(h.el('audioImportUse').disabled);assert.match(h.el('audioImportValidation').textContent,/Correct invalid/);assert.equal(h.el('audioImportCount').textContent,'2 notes to check');assert.equal(h.el('audioImportValidation').closest('details'),null);h.close();
 // First-time import has no replacement wording or confirmation.
 h=setup();h.w.confirm=()=>true;h.click('phraseDelete');h.open();await h.setFile();h.click('audioImportAnalyze');await flush();await flush();assert.equal(h.el('audioImportUse').textContent,'Import notes');let confirmations=0;h.w.confirm=()=>{confirmations++;return true;};h.click('audioImportUse');assert.equal(confirmations,0);assert.equal(h.snapshot().origin,'audio');h.close();
 console.log('PASS simple import: collapsed optional timestamps/editor/section controls, WAV/MOV direct import, explicit replacement and cancel, full-clip/30-second scope, precise unchanged note timing, Tab boundaries, no-file/reopen/new-file reset, empty output, invalid optional edits and first-time import. Simulated browser APIs.');
})().catch(error=>{console.error(error);process.exitCode=1;});
