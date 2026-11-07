// Local-only Phrase Trainer engine: MIDI recording and reviewed note import; only CC64, CC7 and CC11 are captured.
"use strict";
// All grid coordinates are source milliseconds. Tempo is always quarter-note BPM.
const phraseTimingDefaults={meterNumerator:4,meterDenominator:4,gridOriginMs:0,gridConfirmed:false,loopSnap:'free',countInBars:1,loopPadEnd:false};
const phraseTiming={
 metrics(options={},bpm=options.sourceBpm??120){const o={...phraseTimingDefaults,...options},pulseUnits=o.meterDenominator===8&&[6,9,12].includes(o.meterNumerator)?3:1,unitMs=60000/bpm*4/o.meterDenominator;return{unitMs,beatMs:unitMs*pulseUnits,barMs:unitMs*o.meterNumerator,beatsPerBar:o.meterNumerator/pulseUnits,pulseUnits,pulseQuarters:pulseUnits*4/o.meterDenominator,beatLabel:pulseUnits===3?'dotted quarter':({2:'half note',4:'quarter note',8:'eighth note',16:'sixteenth note'})[o.meterDenominator]};},
 position(time,options={}){const o={...phraseTimingDefaults,...options},m=this.metrics(o),relative=time-o.gridOriginMs,bar=Math.floor(relative/m.barMs+1e-9),within=relative-bar*m.barMs,beat=Math.floor(within/m.beatMs+1e-9)+1,subdivision=Math.floor((within%m.beatMs)/m.unitMs+1e-9)+1;return{bar:bar+1,beat,subdivision,label:relative<0?'Pickup · beat '+beat:'Bar '+(bar+1)+' · beat '+beat+(m.pulseUnits>1?' · '+subdivision:'')};},
 grid(options,start,end,maxTicks=200){const o={...phraseTimingDefaults,...options},m=this.metrics(o),limit=Math.max(0,Math.min(2000,Math.floor(maxTicks)));if(!limit||!Number.isFinite(start)||!Number.isFinite(end)||end<start)return[];let step=m.unitMs;if((end-start)/step+1>limit)step=m.beatMs;if((end-start)/step+1>limit)step=m.barMs;if((end-start)/step+1>limit)step*=Math.ceil(((end-start)/step+1)/limit);const out=[];for(let k=Math.ceil((start-o.gridOriginMs)/step-1e-9);out.length<limit;k++){const time=o.gridOriginMs+k*step;if(time>end+1e-7)break;const unit=Math.round((time-o.gridOriginMs)/m.unitMs),kind=((unit%o.meterNumerator)+o.meterNumerator)%o.meterNumerator===0?'bar':unit%m.pulseUnits===0?'beat':'subdivision';out.push({time,kind,label:this.position(time,o).label});}return out;},
 snap(time,mode,options,min,max){if(!Number.isFinite(time)||max<min)return null;if(mode==='free')return Math.max(min,Math.min(max,time));const o={...phraseTimingDefaults,...options},m=this.metrics(o),step=mode==='bar'?m.barMs:m.beatMs,first=Math.ceil((min-o.gridOriginMs)/step-1e-9),last=Math.floor((max-o.gridOriginMs)/step+1e-9);if(first>last)return null;return o.gridOriginMs+Math.max(first,Math.min(last,Math.round((time-o.gridOriginMs)/step)))*step;},
 maxLoopEnd(duration,options={}){if(!options.loopPadEnd)return duration;const origin=options.gridOriginMs??0,bar=this.metrics(options).barMs;return Math.max(duration,origin+Math.ceil((duration-origin)/bar-1e-9)*bar);}
};
window.KeyMemoryPhrase={timing:phraseTiming,create(config={}){
 const {onChange=()=>{},onWrong=()=>{},onSound=()=>{},onBeat=()=>{},onControl=()=>{},onSilence=()=>{},onMetronomeSilence=()=>{}}=config;
 const now=config.now||(()=>Date.now()),later=config.setTimer||((f,t)=>setTimeout(f,t)),cancel=config.clearTimer||(id=>clearTimeout(id));
 const KEY='keymemory.phrase.v1',MAX=120000,LIMIT=10000,CONTROL_LIMIT=20000,GROUP=80;
 let storage;try{storage=config.storage===undefined?window.localStorage:config.storage;}catch{}
 let notes=[],duration=0,origin='midi',state='idle',error='',saved=false,start=0,countIn=0,countInBar=0,progress=0,groups=[],answered=new Set(),generation=0,recorded=[],chordTimer=null,plannedStart=0,looping=false;
 let noteRevision=0;const deletedNotes=[];
 const CC_DEFAULTS={64:0,7:100,11:127};
 const baseline=()=>Array.from({length:16},(_,channel)=>Object.entries(CC_DEFAULTS).map(([controller,value])=>({controller:Number(controller),value,channel}))).flat();
 let controllers=[],initialControllers=baseline(),observedControllers=baseline(),recordedControllers=[],recordBaseline=baseline();
 const ccIndex=(channel,controller)=>channel*3+[7,11,64].indexOf(controller);
 const validControl=c=>c&&[64,7,11].includes(c.controller)&&Number.isInteger(c.value)&&c.value>=0&&c.value<=127&&Number.isInteger(c.channel)&&c.channel>=0&&c.channel<16;
 const timers=new Set(),held=new Map(),recordHeld=new Map();
 let options={...phraseTimingDefaults,metronome:true,sourceBpm:120,playBpm:120,transpose:0,rhythm:false,tolerance:200,sectionStart:0,sectionEnd:MAX};
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 const playbackDuration=()=>Math.max(0,Math.min(phraseTiming.maxLoopEnd(duration,options),options.sectionEnd)-options.sectionStart)*options.sourceBpm/options.playBpm;
 const playbackElapsed=()=>{const elapsed=Math.max(0,now()-start),length=playbackDuration();return looping&&length>0?elapsed%length:elapsed;};
 function snapshot(){const viewDuration=state==='recording'?Math.min(MAX,Math.max(0,now()-start)):duration;
 const live=config.viewProjection===true&&state==='recording';const activeNotes=live?new Set(recordHeld.values()):null;
 return{noteRevision,undoDeleteCount:deletedNotes.length,viewNotes:live?recorded.map(n=>({...n,duration:activeNotes.has(n)?Math.max(0,viewDuration-n.start):n.duration})):null,viewControllers:live?recordedControllers.map(c=>({...c})):null,viewInitialControllers:live?recordBaseline.map(c=>({...c})):null,viewDuration,state,error,saved,origin,notes:notes.map(n=>({...n})),controllers:controllers.map(c=>({...c})),initialControllers:initialControllers.map(c=>({...c})),recordedControllerCount:state==='recording'?recordedControllers.length:controllers.length,duration,playbackDuration:playbackDuration(),looping,loop:state==='playing'&&looping?Math.floor(Math.max(0,now()-start)/playbackDuration())+1:0,elapsed:state==='recording'?Math.min(MAX,Math.max(0,now()-start)):state==='playing'?playbackElapsed():state==='practice'?Math.max(0,now()-start):0,countIn,countInBar,countInMode:state==='record-countin'?'record':state==='play-countin'?'play':state==='countin'?'practice':null,targetTime:state==='practice'?groups[progress]?.start??null:null,target:state==='practice'||state==='countin'?(groups[progress]?.notes||[]).filter(n=>!answered.has(n)):[],progress,total:groups.length,options:{...options,...(['recording','record-countin'].includes(state)?{gridOriginMs:0,gridConfirmed:true,loopPadEnd:false}:{})},recordedCount:state==='recording'?recorded.length:notes.length};}
 const emit=()=>onChange(snapshot());
 function schedule(fn,delay){const token=generation;let id;id=later(()=>{timers.delete(id);if(token===generation)fn();},Math.max(0,delay));timers.add(id);return id;}
 function unschedule(id){if(id!==null){cancel(id);timers.delete(id);}}
 function halt(){generation++;looping=false;for(const id of timers)cancel(id);timers.clear();chordTimer=null;countIn=0;countInBar=0;onSilence();}
 function persist(){saved=false;try{if(!storage)throw Error();storage.setItem(KEY,JSON.stringify({version:3,origin,notes,controllers,initialControllers,duration,sourceBpm:options.sourceBpm,options}));saved=true;}catch{error='Phrase kept for this session; local saving is unavailable.';}}
 // Staff note IDs are raw snapshot array indices, guarded by a content revision.
 // Keep undo entries small and exact: no timing normalization or phrase replacement.
 function resetNoteHistory(){deletedNotes.length=0;noteRevision++;}
 function canEditNotes(expectedRevision){return Number.isInteger(expectedRevision)&&expectedRevision===noteRevision&&state!=='recording'&&state!=='record-countin';}
 function finishNoteEdit(){
  state='idle';groups=[];progress=0;answered.clear();start=0;plannedStart=0;error='';noteRevision++;
  persist();emit();return true;
 }
 function deleteNote(index,expectedRevision){
  if(!canEditNotes(expectedRevision)||!Number.isInteger(index)||index<0||index>=notes.length)return false;
  halt();deletedNotes.push({index,note:notes[index]});if(deletedNotes.length>100)deletedNotes.shift();
  notes.splice(index,1);return finishNoteEdit();
 }
 function undoDelete(expectedRevision){
  if(!canEditNotes(expectedRevision)||!deletedNotes.length)return false;
  const restoredPitch=deletedNotes.at(-1).note.note+options.transpose;
  if(restoredPitch<0||restoredPitch>127){error='Reset transpose to 0 or '+(restoredPitch>127?'lower':'raise')+' it, then Undo. The restored note would be outside the MIDI keyboard range.';emit();return false;}
  halt();const entry=deletedNotes.pop();notes.splice(entry.index,0,entry.note);return finishNoteEdit();
 }
 function importPhrase(data){
  // An import is a replacement, never an implicit Stop/Save of an active take.
  if(state==='recording'||state==='record-countin'){error='Stop recording before importing a phrase.';emit();return false;}
  let nextNotes,nextDuration,nextBpm;
  try{
   if(!data||typeof data!=='object'||Array.isArray(data))throw Error();
   const inputNotes=data.notes;nextDuration=data.duration;nextBpm=data.sourceBpm;
   if(nextBpm===undefined)nextBpm=120;
   if(!Array.isArray(inputNotes)||!inputNotes.length||inputNotes.length>LIMIT||!finite(nextDuration)||nextDuration<=0||nextDuration>MAX||!finite(nextBpm)||nextBpm<30||nextBpm>300)throw Error();
   nextNotes=[];const noteCount=inputNotes.length;
   for(let i=0;i<noteCount;i++){
    const input=inputNotes[i];
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error();
    const {note,velocity,channel,start,duration}=input;
    if(!Number.isInteger(note)||note<0||note>127||!Number.isInteger(velocity)||velocity<1||velocity>127||!Number.isInteger(channel)||channel<0||channel>15||!finite(start)||start<0||start>=nextDuration||!finite(duration)||duration<=0||start+duration-nextDuration>1e-6)throw Error();
    // Decimal seconds can round just past the selection end when converted to ms.
    // Clip only that tiny overflow, preserving every other fractional timestamp.
    let importedDuration=duration;
    if(start+duration>nextDuration){
     importedDuration=nextDuration-start;
     if(start+importedDuration>nextDuration)importedDuration-=Math.max(Number.MIN_VALUE,Number.EPSILON*nextDuration);
     if(importedDuration<=0||start+importedDuration>nextDuration)throw Error();
    }
    nextNotes.push({note,velocity,channel,start,duration:importedDuration});
   }
   nextNotes.sort((a,b)=>a.start-b.start);
  }catch{error='Import requires 1–10,000 valid notes within a phrase of at most 120 seconds, and BPM 30–300.';emit();return false;}
  // Commit only after the complete payload has passed validation. Keep physical
  // held keys and observed controllers intact for the next MIDI input/recording.
  halt();resetNoteHistory();state='idle';notes=nextNotes;duration=nextDuration;origin='audio';controllers=[];initialControllers=baseline();
  options={...options,sourceBpm:nextBpm,playBpm:nextBpm,transpose:0,rhythm:false,sectionStart:0,sectionEnd:duration,gridOriginMs:0,gridConfirmed:false,loopPadEnd:false,loopSnap:'free'};
  groups=[];progress=0;answered.clear();recorded=[];recordedControllers=[];recordHeld.clear();start=0;plannedStart=0;error='';
  persist();emit();return true;
 }
 function load(){
  if(state==='recording'||state==='record-countin')return false;
  // V2's bounded10k notes +20k controllers can exceed the legacy1.5MB envelope.
  try{const text=storage?.getItem(KEY);if(!text)return false;if(text.length>4000000)throw Error();const data=JSON.parse(text);
   if(![1,2,3].includes(data.version)||(data.origin!==undefined&&!['audio','midi'].includes(data.origin))||!Array.isArray(data.notes)||data.notes.length>LIMIT||!finite(data.duration)||data.duration<0||data.duration>MAX||!finite(data.sourceBpm)||data.sourceBpm<30||data.sourceBpm>300)throw Error();
   for(const n of data.notes)if(!Number.isInteger(n.note)||n.note<0||n.note>127||!Number.isInteger(n.velocity)||n.velocity<1||n.velocity>127||!Number.isInteger(n.channel)||n.channel<0||n.channel>15||!finite(n.start)||n.start<0||!finite(n.duration)||n.duration<0||n.start+n.duration>data.duration+.01)throw Error();
   let loadedControls=[],loadedBaseline=baseline();
   if(data.version>=2){
    if(!Array.isArray(data.controllers)||data.controllers.length>CONTROL_LIMIT||!Array.isArray(data.initialControllers)||data.initialControllers.length!==48)throw Error();
    const keys=new Set();for(const c of data.initialControllers){if(!validControl(c)||keys.has(c.channel+':'+c.controller))throw Error();keys.add(c.channel+':'+c.controller);loadedBaseline[ccIndex(c.channel,c.controller)]={controller:c.controller,value:c.value,channel:c.channel};}
    for(const c of data.controllers){if(!validControl(c)||!finite(c.time)||c.time<0||c.time>data.duration)throw Error();loadedControls.push({controller:c.controller,value:c.value,channel:c.channel,time:c.time});}loadedControls.sort((a,b)=>a.time-b.time);
   }
   halt();resetNoteHistory();controllers=loadedControls;initialControllers=loadedBaseline;notes=data.notes.map(n=>({note:n.note,velocity:n.velocity,channel:n.channel,start:n.start,duration:n.duration})).sort((a,b)=>a.start-b.start);duration=data.duration;origin=data.origin??'midi';options.sourceBpm=data.sourceBpm;options.playBpm=data.sourceBpm;options.sectionEnd=duration||MAX;if(data.options){const o={...data.options,...cleanTiming(data.options)};if(data.version<3)o.gridConfirmed=false;if(validOptions(o)&&!notes.some(n=>n.note+o.transpose<0||n.note+o.transpose>127))options={...options,...o};}if(!notes.length&&!duration)options={...options,transpose:0,sectionStart:0,sectionEnd:duration||MAX,gridOriginMs:0,gridConfirmed:false,loopPadEnd:false,loopSnap:'free'};saved=true;state='idle';error='';if(!notes.length&&!duration)persist();emit();return true;
  }catch{error='Saved phrase could not be read. You can record a new phrase.';emit();return false;}
 }
 function finishRecording(){
  let end=Math.min(MAX,Math.max(0,now()-start));
  for(const n of recordHeld.values())n.duration=Math.min(MAX-n.start,Math.max(1,end-n.start));
  for(const n of recorded)n.duration=Math.min(MAX-n.start,Math.max(1,n.duration));
  if(recorded.length)end=Math.min(MAX,Math.max(end,...recorded.map(n=>n.start+n.duration)));recordHeld.clear();
  halt();state='idle';
  if(recorded.length){resetNoteHistory();notes=recorded.map(n=>({...n})).sort((a,b)=>a.start-b.start);duration=end;origin='midi';controllers=recordedControllers.filter(c=>c.time<=end).map(c=>({...c})).sort((a,b)=>a.time-b.time);initialControllers=recordBaseline.map(c=>({...c}));options.sectionStart=0;options.sectionEnd=end||MAX;options.gridOriginMs=0;options.gridConfirmed=true;options.loopPadEnd=false;persist();}
  else error='No notes recorded. Your previous phrase was kept.';
  recorded=[];recordedControllers=[];emit();return notes.length>0;
 }
 function stop({releaseHeld=false}={}){if(state==='recording'){finishRecording();}else{halt();state='idle';emit();}if(releaseHeld){held.clear();observedControllers=baseline();}return true;}
 // A short lookahead hands absolute times to Web Audio instead of timing audio by JS dispatch.
 function audioPump(mode,origin,beatMs,trackStart,trackLength,list=[],controls=[],countBeats=0,repeat=false){
  let countIndex=0,noteIndex=0,controlIndex=0,cycle=0,clickIndex=0;
  const m=phraseTiming.metrics(options,mode==='record'?options.sourceBpm:options.playBpm),scale=options.sourceBpm/options.playBpm;
  const sourceStart=mode==='record'?0:options.sectionStart;
  const sourceBeat=phraseTiming.metrics(options).beatMs;
  const firstGrid=Math.ceil((sourceStart-(mode==='record'?0:options.gridOriginMs))/sourceBeat-1e-9);
  const offset=mode==='record'?0:((options.gridOriginMs+firstGrid*sourceBeat)-sourceStart)*scale;
  const end=trackStart+trackLength;
  const pump=()=>{
   const current=now(),horizon=current+100;
   countIndex=Math.max(countIndex,Math.ceil((current-25-origin-offset)/beatMs));
   while(countIndex<countBeats&&origin+offset+countIndex*beatMs<=horizon){const at=origin+offset+countIndex*beatMs,beat=((firstGrid+countIndex)%m.beatsPerBar+m.beatsPerBar)%m.beatsPerBar+1;if(options.metronome)onBeat({beat,accent:beat===1,at,countIn:true,mode});countIndex++;}
   // Notes, controller baselines and clicks share one absolute pass clock.
   if(repeat&&current>=trackStart){const currentCycle=Math.floor((current-trackStart)/trackLength);if(currentCycle>cycle){cycle=currentCycle;noteIndex=0;controlIndex=0;clickIndex=0;}}
   for(;;){
    const cycleStart=trackStart+(repeat?cycle*trackLength:0);
    clickIndex=Math.max(clickIndex,Math.ceil((current-25-cycleStart-offset)/beatMs));
    while(cycleStart+offset+clickIndex*beatMs<=horizon&&offset+clickIndex*beatMs<trackLength-1e-7){const at=cycleStart+offset+clickIndex*beatMs,grid=firstGrid+clickIndex;if(options.metronome&&at>=current-25)onBeat({beat:((grid%m.beatsPerBar)+m.beatsPerBar)%m.beatsPerBar+1,accent:((grid%m.beatsPerBar)+m.beatsPerBar)%m.beatsPerBar===0,at,countIn:false,mode});clickIndex++;}
    // Collapse stale controller changes to the latest state per channel/controller.
    const stale=new Map();while(controlIndex<controls.length&&cycleStart+controls[controlIndex].time<current-25){const c=controls[controlIndex++];stale.set(c.channel+':'+c.controller,c);}for(const c of stale.values())onControl({controller:c.controller,value:c.value,channel:c.channel,at:current,initial:true});
    while(controlIndex<controls.length&&cycleStart+controls[controlIndex].time<=horizon){const c=controls[controlIndex++];onControl({controller:c.controller,value:c.value,channel:c.channel,at:cycleStart+c.time,initial:c.initial===true});}
    while(noteIndex<list.length&&cycleStart+list[noteIndex].start<=horizon){const n=list[noteIndex++],at=cycleStart+n.start;if(at+n.duration>current)onSound(n.note,n.velocity,n.duration,at,{channel:n.channel,keyDuration:n.keyDuration??n.duration});}
    if(!repeat||cycleStart+trackLength>horizon)break;
    cycle++;noteIndex=0;controlIndex=0;clickIndex=0;
   }
   if(repeat||current<end)schedule(pump,25);
  };pump();
 }
 function countBefore(mode,bpm,begin,length,list=[],controls=[],repeat=false){
  const origin=now(),m=phraseTiming.metrics(options,bpm),beat=m.beatMs,total=options.countInBars*m.beatsPerBar;plannedStart=origin+total*beat;
  const waiting=mode==='record'?'record-countin':mode==='practice'?'countin':'play-countin';
  const source=mode==='record'?0:options.sectionStart,gridOrigin=mode==='record'?0:options.gridOriginMs,sourceBeat=phraseTiming.metrics(options).beatMs,grid=Math.ceil((source-gridOrigin)/sourceBeat-1e-9),offset=mode==='record'?0:(gridOrigin+grid*sourceBeat-source)*options.sourceBpm/options.playBpm;
  state=waiting;countIn=0;countInBar=total?1:0;emit();
  for(let i=0;i<total;i++){const update=()=>{if(state===waiting){countIn=((grid+i)%m.beatsPerBar+m.beatsPerBar)%m.beatsPerBar+1;countInBar=Math.floor(i/m.beatsPerBar)+1;emit();}};if(offset+i*beat===0)update();else schedule(update,offset+i*beat);}
  if(total)schedule(()=>{if(state===waiting)begin(plannedStart);},total*beat);else begin(plannedStart);
  audioPump(mode,origin,beat,plannedStart,length,list,controls,total,repeat);
 }
 function beginRecording(at){
  state='recording';countIn=0;countInBar=0;start=at;recordBaseline=observedControllers.map(c=>({...c}));emit();
  const tick=()=>{if(state!=='recording')return;if(now()-start>=MAX){finishRecording();return;}emit();schedule(tick,100);};
  schedule(tick,Math.min(100,Math.max(0,start+MAX-now())));
  schedule(()=>{if(state==='recording')finishRecording();},Math.max(0,start+MAX-now()));
 }
 function record(){stop();error='';recorded=[];recordedControllers=[];recordHeld.clear();progress=0;groups=[];countBefore('record',options.sourceBpm,beginRecording,MAX);return true;}
 function cleanTiming(o={}){const tests={meterNumerator:v=>Number.isInteger(v)&&v>=1&&v<=12,meterDenominator:v=>[2,4,8,16].includes(v),gridOriginMs:v=>finite(v)&&v>=0&&v<=MAX,gridConfirmed:v=>typeof v==='boolean',loopSnap:v=>['free','beat','bar'].includes(v),countInBars:v=>[0,1,2].includes(v),loopPadEnd:v=>typeof v==='boolean'};return Object.fromEntries(Object.entries(phraseTimingDefaults).map(([key,value])=>[key,tests[key](o[key])?o[key]:value]));}
 function validOptions(o){return (o.metronome===undefined||typeof o.metronome==='boolean')&&finite(o.sourceBpm)&&o.sourceBpm>=30&&o.sourceBpm<=300&&finite(o.playBpm)&&o.playBpm>=30&&o.playBpm<=300&&Number.isInteger(o.transpose)&&o.transpose>=-48&&o.transpose<=48&&typeof o.rhythm==='boolean'&&finite(o.tolerance)&&o.tolerance>=80&&o.tolerance<=1000&&finite(o.sectionStart)&&finite(o.sectionEnd)&&o.sectionStart>=0&&o.sectionEnd<=Math.max(MAX,phraseTiming.maxLoopEnd(duration,o))&&o.sectionEnd>o.sectionStart&&Number.isInteger(o.meterNumerator)&&o.meterNumerator>=1&&o.meterNumerator<=12&&[2,4,8,16].includes(o.meterDenominator)&&finite(o.gridOriginMs)&&o.gridOriginMs>=0&&o.gridOriginMs<=MAX&&typeof o.gridConfirmed==='boolean'&&['free','beat','bar'].includes(o.loopSnap)&&[0,1,2].includes(o.countInBars)&&typeof o.loopPadEnd==='boolean';}
 function setMetronome(enabled){
  if(typeof enabled!=='boolean')return false;
  options.metronome=enabled;if(!enabled)onMetronomeSilence();
  if(notes.length)persist();emit();return true;
 }
 function setOptions(patch={}){
  if(Object.keys(patch).length===1&&Object.hasOwn(patch,'metronome'))return setMetronome(patch.metronome);
  const next={...options,...patch};
  // The full padded extent follows grid edits, unlike a user-selected shorter end.
  // Only virtual trailing silence changes; source notes and controller times do not.
  const gridChanged=['sourceBpm','meterNumerator','meterDenominator','gridOriginMs'].some(key=>Object.hasOwn(patch,key)&&patch[key]!==options[key]);
  if(options.loopPadEnd&&next.loopPadEnd&&gridChanged&&!Object.hasOwn(patch,'sectionEnd')){
   const oldEnd=phraseTiming.maxLoopEnd(duration,options),newEnd=phraseTiming.maxLoopEnd(duration,next);
   if(finite(newEnd)&&newEnd>=duration){
    if(Math.abs(options.sectionEnd-oldEnd)<1e-6)next.sectionEnd=newEnd;
    else if(next.sectionEnd>newEnd)next.sectionEnd=newEnd;
    const gap=50*next.playBpm/next.sourceBpm;
    if(next.sectionEnd<options.sectionEnd&&next.sectionStart>=duration&&next.sectionStart>next.sectionEnd-gap)next.sectionStart=Math.max(0,Math.min(duration-gap,next.sectionEnd-gap));
   }
  }
  if(!validOptions(next)){error='Use BPM 30–300, transpose ±48, tolerance 80–1000 ms, and a valid section.';emit();return false;}
  if(!notes.length)next.transpose=0;
  if(notes.some(n=>n.note+next.transpose<0||n.note+next.transpose>127)){error='That transposition exceeds the MIDI keyboard range.';emit();return false;}
  if(state==='recording'||state==='record-countin'){error='Stop recording before changing phrase settings.';emit();return false;}
  halt();state='idle';options=next;error='';if(notes.length)persist();emit();return true;
 }
 function pedalIntervals(){
  const result=Array.from({length:16},()=>[]),down=Array(16).fill(null);
  for(const c of initialControllers)if(c.controller===64&&c.value>=64)down[c.channel]=0;
  for(const c of controllers){if(c.controller!==64)continue;if(c.value>=64){if(down[c.channel]===null)down[c.channel]=c.time;}else if(down[c.channel]!==null){result[c.channel].push({start:down[c.channel],end:c.time});down[c.channel]=null;}}
  down.forEach((t,ch)=>{if(t!==null)result[ch].push({start:t,end:duration});});return result;
 }
 function section(audible=false){const end=Math.min(phraseTiming.maxLoopEnd(duration,options),options.sectionEnd),begin=options.sectionStart,scale=options.sourceBpm/options.playBpm,pedals=audible?pedalIntervals():null;
  return notes.map(n=>{let stop=n.start+n.duration;
   if(pedals){const spans=pedals[n.channel];let lo=0,hi=spans.length-1,index=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(spans[mid].start<=stop){index=mid;lo=mid+1;}else hi=mid-1;}if(index>=0&&spans[index].end>stop)stop=spans[index].end;}
   return {...n,audibleEnd:stop};
  }).filter(n=>n.start<end&&n.audibleEnd>begin).map(n=>({...n,note:n.note+options.transpose,start:(Math.max(n.start,begin)-begin)*scale,duration:(Math.min(n.audibleEnd,end)-Math.max(n.start,begin))*scale,keyDuration:Math.max(0,Math.min(n.start+n.duration,end)-Math.max(n.start,begin))*scale}));
 }
 function sectionControls(){
  const begin=options.sectionStart,end=Math.min(phraseTiming.maxLoopEnd(duration,options),options.sectionEnd),scale=options.sourceBpm/options.playBpm,initial=initialControllers.map(c=>({...c,time:0,initial:true}));
  for(const c of controllers)if(c.time<=begin)initial[ccIndex(c.channel,c.controller)]={controller:c.controller,value:c.value,channel:c.channel,time:0,initial:true};
  return initial.concat(controllers.filter(c=>c.time>begin&&c.time<end).map(c=>({...c,time:(c.time-begin)*scale})));
 }
 function prepare(audible=false){if(state==='recording')finishRecording();halt();error='';progress=0;answered.clear();const list=section(audible);
  if(!list.length){state='idle';error='Record a phrase or choose a section containing notes.';emit();return null;}
  if(list.some(n=>n.note<0||n.note>127)){state='idle';error='That transposition exceeds the MIDI keyboard range.';emit();return null;}
  groups=[];for(const n of list){let g=groups.at(-1);if(!g||n.start-g.start>GROUP*options.sourceBpm/options.playBpm){g={start:n.start,end:n.start,notes:[]};groups.push(g);}g.end=Math.max(g.end,n.start);if(!g.notes.includes(n.note))g.notes.push(n.note);}return list;
 }
 function runningTick(){if(state!=='playing'&&state!=='practice')return;if(state==='playing'){const index=groups.findIndex(g=>g.start>playbackElapsed());progress=index<0?groups.length-1:Math.max(0,index-1);}emit();schedule(runningTick,100);}
 function play({loop=false}={}){const list=prepare(true);if(!list)return false;
  const length=playbackDuration();
  // Sub-50ms loops can flood the audio graph. Keep one-shot tiny taps supported.
  if(loop&&length<50){state='idle';error='Choose a section at least 0.05 seconds long at this tempo to loop.';emit();return false;}
  looping=loop;
  countBefore('play',options.playBpm,at=>{state='playing';countIn=0;countInBar=0;start=at;emit();schedule(runningTick,100);
   if(!loop)schedule(()=>{halt();state='idle';progress=0;emit();},Math.max(0,start+length+100-now()));
  },length,list,sectionControls(),loop);return true;
 }
 function lateGuard(){if(!options.rhythm)return;const group=groups[progress];if(!group)return;schedule(()=>{if(state==='practice'&&groups[progress]===group)fail(null,'Timing missed — restart from the beginning.');},start+group.end+options.tolerance-now()+1);}
 function beginPractice(at){state='practice';error='';start=at;progress=0;answered.clear();countIn=0;countInBar=0;emit();schedule(runningTick,100);lateGuard();}
 function count(){halt();error='';progress=0;answered.clear();countBefore('practice',options.playBpm,at=>{if(held.size){halt();state='wait-release';error='Release all keys, then the count-in restarts.';emit();}else beginPractice(at);},Infinity);}
 function practice(){if(!prepare())return false;if(held.size){state='wait-release';error='Release all keys to start the count-in.';emit();}else count();return true;}
 function fail(note,message){halt();state='wait-release';error=message;answered.clear();progress=0;onWrong(note,message);emit();if(!held.size)count();}
 function controlInput(event){
  if(!validControl(event))return;
  const eventTime=finite(event.time)&&event.time<=now()?event.time:now();
  if(state==='record-countin'&&now()>=plannedStart)beginRecording(plannedStart);
  const index=ccIndex(event.channel,event.controller),previous=observedControllers[index].value;
  observedControllers[index]={controller:event.controller,value:event.value,channel:event.channel};
  if(state!=='recording')return;
  if(eventTime<start){recordBaseline[index]={...observedControllers[index]};return;}
  if(eventTime-start>=MAX){finishRecording();return;}
  if(previous===event.value)return;
  if(recordedControllers.length>=CONTROL_LIMIT){finishRecording();error='Controller event limit reached; recording was stopped safely.';emit();return;}
  recordedControllers.push({...observedControllers[index],time:Math.max(0,eventTime-start)});return true;
 }
 function input(event={}){
  if(event.kind==='control')return controlInput(event);
  let {kind,note,velocity=100,channel=0}=event;
  if(!Number.isInteger(note)||note<0||note>127||!Number.isInteger(channel)||channel<0||channel>15||!Number.isInteger(velocity)||velocity<0||velocity>127)return;
  if(kind==='on'&&velocity===0)kind='off';if(kind!=='on'&&kind!=='off')return;
  const key=channel+':'+note;
  const eventTime=finite(event.time)&&event.time<=now()?event.time:now();
  if(state==='record-countin'&&now()>=plannedStart)beginRecording(plannedStart);
  if(kind==='off'){
   held.delete(key);if(state==='recording'){const n=recordHeld.get(key);if(n){n.duration=Math.min(MAX-n.start,Math.max(1,Math.min(MAX,eventTime-start)-n.start));recordHeld.delete(key);}}
   if(state==='wait-release'&&!held.size)count();return;
  }
  if(held.has(key))return;const samePitchHeld=[...held.values()].includes(note);held.set(key,note);
  if(state==='recording'){
   if(eventTime<start)return;
   if(eventTime-start>=MAX||recorded.length>=LIMIT){finishRecording();return;}
   const n={note,velocity,channel,start:Math.max(0,eventTime-start),duration:0};recorded.push(n);recordHeld.set(key,n);emit();return true;
  }
  if(state!=='practice'||samePitchHeld||eventTime<start)return;
  const group=groups[progress];
  if(!group||!group.notes.includes(note)){fail(note,'Wrong note — release all keys to restart from the beginning.');return;}
  if(answered.has(note))return;
  if(options.rhythm&&(eventTime-start<group.start-options.tolerance||eventTime-start>group.end+options.tolerance)){fail(note,'Timing missed — release all keys to restart from the beginning.');return;}
  answered.add(note);
  if(answered.size<group.notes.length){if(chordTimer===null)chordTimer=schedule(()=>{if(groups[progress]!==group)return;chordTimer=null;if(state==='practice')fail(null,'Play the chord notes together — restart from the beginning.');},Math.max(180,options.tolerance,GROUP*options.sourceBpm/options.playBpm));emit();return true;}
  unschedule(chordTimer);chordTimer=null;progress++;answered.clear();
  if(progress>=groups.length){halt();state='complete';error='';emit();return true;}
  emit();lateGuard();return true;
 }
 function clear(){stop();resetNoteHistory();options={...options,transpose:0,sectionStart:0,sectionEnd:MAX,gridOriginMs:0,gridConfirmed:false,loopPadEnd:false,loopSnap:'free'};notes=[];controllers=[];initialControllers=baseline();duration=0;origin='midi';groups=[];progress=0;error='';saved=false;try{storage?.removeItem(KEY);}catch{error='Could not remove the saved phrase from this browser.';}emit();return true;}
 function setSourceTempo(qBpm){const playBpm=qBpm*options.playBpm/options.sourceBpm;if(!finite(qBpm)||qBpm<30||qBpm>300||playBpm<30||playBpm>300){error='That source tempo would put playback outside BPM 30–300.';emit();return false;}return setOptions({sourceBpm:qBpm,playBpm,gridConfirmed:true});}
 const api={record,stop,input,play,practice,setSourceTempo,setOptions,setMetronome,importPhrase,deleteNote,undoDelete,clear,snapshot,load};load();return api;
}};
