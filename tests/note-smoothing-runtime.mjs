// Deterministic model-output probes, not an arbitrary-recording accuracy claim.
import assert from 'node:assert/strict';
import {attackEvidenceAt, notesFromFrames} from '../audio-runtime/runtime.mjs';
import smoothing from '../note-smoothing.js';
import importer from '../audio-import.js';
const make=()=>({frames:Array.from({length:200},()=>Array(88).fill(0)),onsets:Array.from({length:200},()=>Array(88).fill(0))});
const mapped=data=>importer.normalizeNotes(notesFromFrames(data.frames,data.onsets,2,{includeAttackEvidence:true}),2000);
let data=make();for(let i=10;i<155;i++)data.frames[i][39]=.8;data.onsets[10][39]=.9;data.onsets[80][39]=.55;
let notes=mapped(data);assert.equal(notes.length,2,'false model onset splits sustained pitch');assert.equal(smoothing.smooth(notes,0).notes.length,2);assert.equal(smoothing.smooth(notes,100).notes.length,1,'doubtful continuous onset can be joined');
// A clear fresh raw onset is not the same as a confidence rebound.
data.onsets[80][39]=.95;notes=mapped(data);assert.equal(notes.length,2);assert.equal(smoothing.smooth(notes,100).notes.length,2);
// Inferred onsets caused by a short confidence dip have low raw onset evidence.
data=make();for(let i=10;i<155;i++)data.frames[i][39]=.8;for(let i=75;i<80;i++)data.frames[i][39]=.1;data.onsets[10][39]=.9;notes=mapped(data);assert(notes.length>=2);assert.equal(smoothing.smooth(notes,100).notes.length,1,'short frame-confidence dropout can be joined');
// Metadata follows original frame indices, including Basic Pitch time correction.
for(const index of [0,1,10,141,142,171,172,198,199]){const e=attackEvidenceAt(data.frames,data.onsets,index,60);assert(Object.values(e).every(n=>Number.isFinite(n)&&n>=0&&n<=1));}
const withEvidence=notesFromFrames(data.frames,data.onsets,2,{includeAttackEvidence:true});const original=notesFromFrames(data.frames,data.onsets,2);assert.deepEqual(withEvidence.map(({attackEvidence,...n})=>n),original,'evidence never changes original output');
assert(importer.normalizeNotes([{pitchMidi:60,startTimeSeconds:0,durationSeconds:1,attackEvidence:{onset:NaN,rise:0,before:.8}}],1000).every(n=>!n.attackEvidence));
console.log('PASS note smoothing runtime: original parity, raw/inferred onset distinction, synthetic frame-confidence dropout, clear repeated attack, boundary evidence and invalid evidence.');
