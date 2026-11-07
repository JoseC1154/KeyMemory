// Pure geometry/source-time regression, not a browser or physical MIDI assertion.
const assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),view=require('../phrase-view.js');
const svg=text=>new JSDOM(text,{contentType:'image/svg+xml'}).window.document;
const keys=Array.from({length:128},(_,midi)=>({midi,x:midi*12,width:10,black:[1,3,6,8,10].includes(midi%12)}));
const source={duration:5000,notes:[{note:60,channel:0,start:1000.25,duration:750.5},{note:61,start:1250,duration:1500},{note:60,channel:1,start:1300,duration:1200},{note:72,start:2500,duration:0}],controllers:[{controller:64,value:127,channel:0,time:1500},{controller:64,value:0,channel:0,time:4000}]};
const original=JSON.stringify(source),model=view.prepareTimeline(source),render=(cursor,extra={})=>svg(view.fallingSVG(model,{keys,width:1550,height:120,window:3000,cursor,...extra})),note=(d,id)=>d.querySelector('[data-note-id="'+id+'"]'),rect=(d,id)=>note(d,id)?.querySelector('.keyDuration');
let a=render(0),b=render(500);
assert.equal(+rect(a,0).getAttribute('height'),750.5/3000*120,'length uses exact fractional duration');
assert.equal(+rect(b,0).getAttribute('y')- +rect(a,0).getAttribute('y'),20,'advancing source time moves bars downward');
assert.equal(+rect(render(0,{window:1500}),0).getAttribute('height'),2*+rect(a,0).getAttribute('height'));
for(const n of a.querySelectorAll('.fallingNote')){const r=n.querySelector('rect');if(r){const k=keys[+n.dataset.midi];assert(+r.getAttribute('x')>=k.x);assert(+r.getAttribute('x')+ +r.getAttribute('width')<=k.x+k.width);}}
assert.notEqual(rect(a,0).getAttribute('x'),rect(a,2).getAttribute('x'),'overlapping same-pitch channels get separate lanes');
a=render(1000.25);assert.equal(+rect(a,0).getAttribute('y')+ +rect(a,0).getAttribute('height'),120,'onset reaches strike line exactly');assert(note(a,0).classList.contains('keyActive'));
a=render(1750.75);assert(!rect(a,0));assert(note(a,0).classList.contains('tailActive'));assert(note(a,0).querySelector('.pedalTail'));assert(!a.querySelector('.fallingGlow[data-midi="60"]')||a.querySelectorAll('.fallingGlow[data-midi="60"]').length===1,'pedal never adds a second pressed-key glow');
a=render(2500);assert.equal(rect(a,3).getAttribute('height'),'1','zero-duration events remain visible');
a=render(1200,{sectionStart:1200,sectionEnd:1600});assert.equal(+note(a,0).dataset.start,1200);assert.equal(+note(a,0).dataset.keyEnd,1600);assert(!note(a,3));assert.equal(+rect(a,0).getAttribute('height'),400/3000*120,'selected loop clips duration');
assert.equal(JSON.stringify(source),original,'visualization never changes notes/controllers');
const transposed=view.prepareTimeline(source,{transpose:12}),trans=svg(view.fallingSVG(transposed,{keys,width:1550,height:120,window:3000,cursor:0}));assert.equal(+note(trans,0).dataset.midi,72);assert.equal(rect(trans,0).getAttribute('height'),rect(render(0),0).getAttribute('height'));
const dense=view.prepareTimeline({duration:10000,notes:Array.from({length:1000},(_,i)=>({note:i%128,start:1000+i,duration:100})).concat([{note:60,start:0,duration:9000}])});
a=svg(view.fallingSVG(dense,{keys,width:1550,cursor:1500,window:6000,selectedNoteId:999}));assert.equal(a.querySelectorAll('.fallingNote').length,400);assert(note(a,1000),'long currently held note survives cap');assert(note(a,999),'selected edit survives cap');assert.match(a.documentElement.getAttribute('aria-label'),/omitted/);
for(const options of [{window:0},{cursor:NaN},{width:Infinity},{height:0},{sectionStart:3,sectionEnd:2},{keys:[{midi:128,x:0,width:2}]}])assert.throws(()=>view.fallingSVG(model,{keys,...options}),RangeError);
console.log('PASS falling-note pure renderer: downward motion, exact duration/source onset, key alignment, channel overlaps, zero duration, pedal-only tails, section clipping, transposition, cap priority and immutability.');

const looped=view.prepareTimeline({duration:2000,notes:[{note:60,start:0,duration:200}]});
a=svg(view.fallingSVG(looped,{keys,width:1550,height:120,cursor:1900,window:3000,loop:true}));
assert.equal(a.querySelectorAll('.fallingNote').length,2);assert.equal(+note(a,0).dataset.cycle,1);assert.equal(+note(a,0).dataset.start,2000);assert(!note(a,0).classList.contains('keyActive'));assert.equal(+rect(a,0).getAttribute('y')+ +rect(a,0).getAttribute('height'),116,'next-loop note approaches strike line instead of appearing there');
a=svg(view.fallingSVG(looped,{keys,width:1550,height:120,cursor:0,window:1000,grid:[{time:0,kind:'bar'},{time:500,kind:'beat'}]}));assert.deepEqual([...a.querySelectorAll('.musicalGridTick')].map(n=>n.getAttribute('opacity')),['0.22','0.09']);
console.log('PASS: upcoming loop previews and distinct bar/beat guides.');

a=render(1900,{sectionStart:1900,sectionEnd:2100});assert(!rect(a,0),'pedal-only note crossing a section boundary has no fake physical-key bar');

const shortLoop=view.prepareTimeline({duration:750,notes:[{note:60,start:0,duration:200}]});
a=svg(view.fallingSVG(shortLoop,{keys,width:1550,height:120,cursor:600,window:1200,loop:true,grid:[{time:0,kind:'bar'},{time:500,kind:'beat'},{time:1000,kind:'beat'}]}));assert.deepEqual([...a.querySelectorAll('.musicalGridTick')].map(n=>+n.dataset.time),[750,1250,1500],'reference grid repeats its source phase at fractional loop boundaries');

const micro=view.prepareTimeline({duration:25,notes:[{note:60,start:0,duration:20}]});a=svg(view.fallingSVG(micro,{keys,width:1550,cursor:24,window:250,loop:true}));assert(a.querySelector('[data-cycle="1"]'),'tempo-scaled valid short source loops still preview repetitions');
