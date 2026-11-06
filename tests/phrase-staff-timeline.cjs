// Pure SVG/data regression: this does not claim physical display or audio validation.
const assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),view=require('../phrase-view.js');
const svg=text=>new JSDOM(text,{contentType:'image/svg+xml'}).window.document;
const prepare=notes=>view.prepareTimeline({duration:2000,notes});
const source={duration:2000,notes:[{note:60,start:10.125,duration:199.875},{note:64,start:10.125,duration:199.875},{note:60,start:300.625,duration:99.375},{note:67,start:1000,duration:0}],controllers:[{controller:64,value:127,channel:0,time:100},{controller:64,value:0,channel:0,time:800}]};
const before=JSON.stringify(source),timeline=view.prepareTimeline(source),snapshot=JSON.stringify(timeline);
let doc=svg(view.timelineStaffSVG(timeline,{start:0,end:2000,cursor:10.125,width:800}));
assert.match(doc.documentElement.getAttribute('aria-label'),/Pitch timeline, not rhythmic notation/);
assert.equal(doc.querySelectorAll('.staffTimelineNote').length,4);
const groups=[...doc.querySelectorAll('.staffTimelineNote')],cx=g=>+g.getAttribute('data-onset-x');
assert.equal(cx(groups[0]),80+10.125/2000*656);assert.equal(cx(groups[0]),cx(groups[1]),'chord onsets align exactly');
assert.equal(cx(groups[2]),80+300.625/2000*656,'fractional timing is not quantized');
assert.equal(+doc.querySelector('.staffTimelineCursor').getAttribute('x1'),cx(groups[0]));
assert.equal(doc.querySelectorAll('.keyActive').length,2);
assert.equal(doc.querySelectorAll('.trebleClef').length,1);assert.equal(doc.querySelectorAll('.bassClef').length,1);
assert.equal(doc.documentElement.getAttribute('role'),'img');
assert.equal(svg(view.timelineStaffSVG(timeline,{cursor:220})).querySelectorAll('.keyActive').length,0,'sustain does not display pressed keys');
assert.equal(svg(view.timelineStaffSVG(timeline,{start:250,end:1000})).querySelectorAll('.staffTimelineNote').length,1,'exclude prior and right-boundary onsets');
assert.equal(svg(view.timelineStaffSVG(timeline,{start:1000,end:1500})).querySelectorAll('.staffTimelineNote').length,1,'include zero-duration onset at left boundary');
assert.equal(svg(view.timelineStaffSVG(timeline,{start:1100,end:1500,cursor:0})).querySelectorAll('.staffTimelineCursor').length,0);
assert.equal(svg(view.timelineStaffSVG(timeline,{names:false})).querySelectorAll('.staffTimelineNote text').length,0);
const transposed=view.prepareTimeline(source,{transpose:-2}),transdoc=svg(view.timelineStaffSVG(transposed));
assert.deepEqual([...transdoc.querySelectorAll('.staffTimelineNote')].map(cx),groups.map(cx));
assert.deepEqual(transposed.notes.map(n=>[n.start,n.keyEnd,n.soundEnd]),timeline.notes.map(n=>[n.start,n.keyEnd,n.soundEnd]));
assert.equal(JSON.stringify(source),before);assert.equal(JSON.stringify(timeline),snapshot);
const sharp=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],flat=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'],letters={C:0,D:1,E:2,F:3,G:4,A:5,B:6};
for(const spelling of ['sharp','flat']){
 doc=svg(view.timelineStaffSVG(prepare(Array.from({length:128},(_,note)=>({note,start:note*10,duration:10}))),{spelling}));
 const box=doc.documentElement.getAttribute('viewBox').split(' ').map(Number);
 assert.equal(doc.querySelectorAll('.staffTimelineNote').length,128);assert(box[3]>400);assert.equal(doc.documentElement.style.minHeight,box[3]+'px');
 for(const group of doc.querySelectorAll('.staffTimelineNote')){
  const n=+group.getAttribute('data-midi'),name=(spelling==='sharp'?sharp:flat)[n%12],d=(Math.floor(n/12)-1)*7+letters[name[0]],treble=n>=60,y=(treble?100:190)-(d-(treble?30:18))*5;
  assert.equal(+group.querySelector('ellipse').getAttribute('cy'),y);assert.equal(group.getAttribute('data-clef'),treble?'treble':'bass');
  assert.equal(group.querySelector('text').textContent,name+(Math.floor(n/12)-1));assert(y-14>=box[1]&&y+5<=box[1]+box[3],'head and accidentals fit');
  for(const ledger of group.querySelectorAll('.ledger')){assert(+ledger.getAttribute('y1')>=box[1]&&+ledger.getAttribute('y1')<=box[1]+box[3]);assert(+ledger.getAttribute('x1')>=box[0]&&+ledger.getAttribute('x2')<=box[0]+box[2]);}
 }
}
for(const [note,clef,y,ledgerCount]of[[0,'bass',315,12],[43,'bass',190,0],[53,'bass',160,0],[60,'treble',110,1],[64,'treble',100,0],[67,'treble',90,0],[77,'treble',60,0],[127,'treble',-85,14]]){
 const g=svg(view.timelineStaffSVG(prepare([{note,start:0,duration:100}]))).querySelector('.staffTimelineNote');assert.equal(g.getAttribute('data-clef'),clef);assert.equal(+g.querySelector('ellipse').getAttribute('cy'),y);assert.equal(g.querySelectorAll('.ledger').length,ledgerCount);
}
const dense=view.prepareTimeline({duration:120000,notes:Array.from({length:10000},(_,i)=>({note:i%128,start:i,duration:10}))});
for(const [requested,expected]of[[undefined,400],[25,25],[99999,400],[0,1]]){
 doc=svg(view.timelineStaffSVG(dense,{maxNotes:requested}));assert.equal(doc.querySelectorAll('.staffTimelineNote').length,expected);assert.match(doc.documentElement.getAttribute('aria-label'),new RegExp((10000-expected)+' omitted'));assert.match(doc.documentElement.textContent,/zoom in/);
}
assert.equal(dense.notes.length,10000);
for(const options of [{start:0,end:0},{start:NaN},{end:Infinity},{width:NaN},{maxNotes:NaN},{spelling:'guess'}])assert.throws(()=>view.timelineStaffSVG(timeline,options),RangeError);
assert.doesNotThrow(()=>svg(view.timelineStaffSVG(view.prepareTimeline({duration:0,notes:[]}))));
console.log('PASS: timeline staff all128 sharp/flat pitches, literal clef/ledger anchors, exact fractional onsets/chord alignment/transposition, physical-key activity only, half-open windows/cursor, full-range bounds/accessibility, 10k source/400 rendered cap.');

// Chromatic clusters retain true onset coordinates without displacing noteheads.
const cluster=view.prepareTimeline({duration:1000,notes:[60,61,62,63,64,65,66,67,68,69,70,71].map(note=>({note,start:100.125,duration:100})).concat([{note:60,channel:1,start:100.125,duration:300}])});
for(const spelling of ['sharp','flat'])for(const width of [240,800])for(const names of [true,false]){
 const d=svg(view.timelineStaffSVG(cluster,{width,spelling,names,cursor:250})),marks=[...d.querySelectorAll('.staffTimelineNote')],box=d.documentElement.getAttribute('viewBox').split(' ').map(Number);
 assert.equal(marks.length,12,'identical onset/pitch voices are merged');assert.equal(new Set(marks.map(cx)).size,1,'all chord onset markers align');
 const unison=d.querySelector('[data-midi="60"]');assert.equal(unison.getAttribute('data-voice-count'),'2');assert.match(unison.textContent,/channel 1, key release 200.125ms; channel 2, key release 400.125ms/);assert.match(unison.querySelector('text').textContent,/×2/);assert(unison.classList.contains('keyActive'));
 for(let i=0;i<marks.length;i++){
  const g=marks[i],head=g.querySelector('ellipse'),xx=+head.getAttribute('cx'),yy=+head.getAttribute('cy'),anchor=+g.getAttribute('data-onset-x');
  assert.equal(+g.querySelector('.staffOnsetMarker').getAttribute('cx'),anchor);assert(xx-24>=box[0]&&xx+24<=box[0]+box[2]);
  assert.equal(xx,anchor,'every notehead marks its exact onset; only labels may move');
  const label=g.querySelector('.staffNoteLabel');if(label)for(const other of marks.slice(i+1)){const next=other.querySelector('.staffNoteLabel');if(next)assert(Math.abs(+label.getAttribute('x')- +next.getAttribute('x'))>=71.99999||Math.abs(+label.getAttribute('y')- +next.getAttribute('y'))>=10,'simultaneous labels remain legible');}
 }
}
console.log('PASS: sharp/flat chromatic clusters, exact noteheads and onset markers; offset labels, grouped channel unisons with counts/releases and narrow-view horizontal bounds.');
// Silent inspection distinguishes held/pedal notes and retains earlier sounding notes.
const long=view.prepareTimeline({duration:12000,notes:[{note:60,start:0,duration:11000},{note:64,start:300,duration:200},{note:64,start:1000,duration:1000}],controllers:[{channel:0,controller:64,value:127,time:400},{channel:0,controller:64,value:0,time:11000}]});
doc=svg(view.timelineStaffSVG(long,{start:8500,end:12000,cursor:10000,inspecting:true,width:400}));
assert.equal(doc.querySelectorAll('.staffSelectedKey').length,1);assert.equal(doc.querySelectorAll('.staffSelectedTail').length,2);assert.equal(doc.querySelectorAll('.staffContinuation').length,3);
assert.deepEqual([...doc.querySelectorAll('.staffTimelineNote')].map(g=>Number(g.dataset.start)),[0,300,1000]);
assert.equal(new Set([...doc.querySelectorAll('[data-midi="64"] .staffNoteHead')].map(x=>x.getAttribute('cx'))).size,1,'earlier same-pitch notes retain the exact continuation boundary');assert.equal(new Set([...doc.querySelectorAll('[data-midi="64"] .staffNoteLabel')].map(x=>x.getAttribute('x'))).size,2,'continuation labels distinguish earlier same-pitch notes');
assert.equal(doc.documentElement.dataset.timeStart,'8500');assert.equal(doc.documentElement.dataset.timeRight,'336');
console.log('PASS: inspection includes earlier held and pedal-only notes with separate continuation marks and unmodified source timestamps.');
