'use strict';
const assert=require('node:assert/strict'),tempo=require('../tempo.js');
const notes=times=>times.map((start,i)=>({note:60+i%12,channel:0,velocity:90,start,duration:100}));
const steady=(bpm,count=12,offset=0)=>notes(Array.from({length:count},(_,i)=>offset+i*60000/bpm));
const sequence=gaps=>{let start=123.456;return notes([start,...gaps.map(gap=>start+=gap)]);};
for(const bpm of [40,60,80,90,100,120,150,180,240]){
 const input=steady(bpm),before=JSON.stringify(input),result=tempo.estimate(input);
 assert(result.bpm!==null,`steady ${bpm}`);
 assert([result.bpm,...result.alternatives].some(n=>Math.abs(n-bpm)<.11),`actual/half/double ${bpm}: ${JSON.stringify(result)}`);
 assert.equal(JSON.stringify(input),before);assert.equal(result.reason,'possible');assert.equal(result.meter,undefined);
}
let result=tempo.estimate(sequence([500,250,250,500,1000,500,750,250,500]));assert.equal(result.bpm,120);assert.deepEqual(result.alternatives,[60,240]);
result=tempo.estimate(sequence([520,267,238,494,1009,497,762,244,506]));assert(Math.abs(result.bpm-120)<3);
// Chord and layered attacks are not beats; note lengths and input order do not matter.
const chords=steady(100).flatMap(n=>[n,{...n,note:64,start:n.start+12},{...n,note:67,start:n.start+27},{...n,channel:1,start:n.start+3}]).reverse();
assert.equal(tempo.estimate(chords).bpm,100);assert.equal(tempo.estimate(chords.map(n=>({...n,duration:5000}))).bpm,100);
assert.equal(tempo.estimate(steady(120,12,35000)).bpm,120);
for(const input of [[],notes([0]),notes([0,500,1000,1500,2000]),notes([0,100,200,300,400,500]),notes([0,0,0,1,10,20,40])])assert.equal(tempo.estimate(input).reason,'short');
for(const input of [null,[{start:NaN}],[{start:Infinity}],[{start:-1}],[{start:120001}],Array(10001).fill({start:0})])assert.equal(tempo.estimate(input).reason,'invalid');
for(const input of [sequence([320,631,911,417,813,283,1100,537,397]),sequence([700,660,620,580,540,500,460,420,380,340]),sequence([5000,5000,5000,5000,5000])])assert.equal(tempo.estimate(input).reason,'irregular');
const dense=Array.from({length:10000},(_,i)=>({start:Math.floor(i/40)*480+i%40*.5}));assert.equal(tempo.estimate(dense).bpm,125);
assert.match(tempo.describe(tempo.estimate(steady(120))),/Possible tempo.*60 or 240.*meter is not detected/);
assert.match(tempo.describe(tempo.estimate(notes([0,100]))),/Too few.*tap/);
assert.match(tempo.describe(null),/unavailable/);
console.log('PASS tempo estimator: steady/fractional/expressive onsets, half/double ambiguity, chord grouping, subdivisions/rests, offsets, unordered and dense bounded input, short/invalid/irregular/drifting abstention, no mutation or inferred meter. Synthetic note timing, not an accuracy benchmark.');
