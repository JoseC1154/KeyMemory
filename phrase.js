// Local-only MIDI Phrase Trainer: no audio recording, network or pedal processing.
"use strict";
window.KeyMemoryPhrase={create(config={}){
 const {onChange=()=>{},onWrong=()=>{},onSound=()=>{},onSilence=()=>{}}=config;
 const now=config.now||(()=>Date.now()),later=config.setTimer||((f,t)=>setTimeout(f,t)),cancel=config.clearTimer||(id=>clearTimeout(id));
 const KEY='keymemory.phrase.v1',MAX=120000,LIMIT=10000,GROUP=80;
 let storage;try{storage=config.storage===undefined?window.localStorage:config.storage;}catch{}
 let notes=[],duration=0,state='idle',error='',saved=false,start=0,countIn=0,progress=0,groups=[],answered=new Set(),generation=0,recorded=[],chordTimer=null;
 const timers=new Set(),held=new Map(),recordHeld=new Map();
 let options={sourceBpm:120,playBpm:120,transpose:0,rhythm:false,tolerance:200,sectionStart:0,sectionEnd:MAX};
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 function snapshot(){return{state,error,saved,notes:notes.map(n=>({...n})),duration,elapsed:state==='recording'?Math.min(MAX,Math.max(0,now()-start)):state==='playing'||state==='practice'?Math.max(0,now()-start):0,countIn,targetTime:state==='practice'?groups[progress]?.start??null:null,target:state==='practice'||state==='countin'?(groups[progress]?.notes||[]).filter(n=>!answered.has(n)):[],progress,total:groups.length,options:{...options},recordedCount:state==='recording'?recorded.length:notes.length};}
 const emit=()=>onChange(snapshot());
 function schedule(fn,delay){const token=generation;let id;id=later(()=>{timers.delete(id);if(token===generation)fn();},Math.max(0,delay));timers.add(id);return id;}
 function unschedule(id){if(id!==null){cancel(id);timers.delete(id);}}
 function halt(){generation++;for(const id of timers)cancel(id);timers.clear();chordTimer=null;countIn=0;onSilence();}
 function persist(){saved=false;try{if(!storage)throw Error();storage.setItem(KEY,JSON.stringify({version:1,notes,duration,sourceBpm:options.sourceBpm,options}));saved=true;}catch{error='Phrase kept for this session; local saving is unavailable.';}}
 function load(){
  if(state==='recording')return false;
  try{const text=storage?.getItem(KEY);if(!text)return false;if(text.length>1500000)throw Error();const data=JSON.parse(text);
   if(data.version!==1||!Array.isArray(data.notes)||data.notes.length>LIMIT||!finite(data.duration)||data.duration<0||data.duration>MAX||!finite(data.sourceBpm)||data.sourceBpm<30||data.sourceBpm>300)throw Error();
   for(const n of data.notes)if(!Number.isInteger(n.note)||n.note<0||n.note>127||!Number.isInteger(n.velocity)||n.velocity<1||n.velocity>127||!Number.isInteger(n.channel)||n.channel<0||n.channel>15||!finite(n.start)||n.start<0||!finite(n.duration)||n.duration<0||n.start+n.duration>data.duration+.01)throw Error();
   halt();notes=data.notes.map(n=>({note:n.note,velocity:n.velocity,channel:n.channel,start:n.start,duration:n.duration})).sort((a,b)=>a.start-b.start);duration=data.duration;options.sourceBpm=data.sourceBpm;options.playBpm=data.sourceBpm;options.sectionEnd=duration||MAX;if(data.options){const o=data.options;if(validOptions(o)&&!notes.some(n=>n.note+o.transpose<0||n.note+o.transpose>127))options={...options,...o};}saved=true;state='idle';error='';emit();return true;
  }catch{error='Saved phrase could not be read. You can record a new phrase.';emit();return false;}
 }
 function finishRecording(){
  let end=Math.min(MAX,Math.max(0,now()-start));
  for(const n of recordHeld.values())n.duration=Math.min(MAX-n.start,Math.max(1,end-n.start));
  for(const n of recorded)n.duration=Math.min(MAX-n.start,Math.max(1,n.duration));
  if(recorded.length)end=Math.min(MAX,Math.max(end,...recorded.map(n=>n.start+n.duration)));recordHeld.clear();
  halt();state='idle';
  if(recorded.length){notes=recorded.map(n=>({...n})).sort((a,b)=>a.start-b.start);duration=end;options.sectionStart=0;options.sectionEnd=end||MAX;persist();}
  else error='No notes recorded. Your previous phrase was kept.';
  recorded=[];emit();return notes.length>0;
 }
 function stop({releaseHeld=false}={}){if(state==='recording'){finishRecording();}else{halt();state='idle';emit();}if(releaseHeld)held.clear();return true;}
 function record(){stop();error='';state='recording';recorded=[];recordHeld.clear();start=now();progress=0;groups=[];emit();
  const tick=()=>{if(now()-start>=MAX){finishRecording();return;}emit();schedule(tick,100);};schedule(tick,100);return true;}
 function validOptions(o){return finite(o.sourceBpm)&&o.sourceBpm>=30&&o.sourceBpm<=300&&finite(o.playBpm)&&o.playBpm>=30&&o.playBpm<=300&&Number.isInteger(o.transpose)&&o.transpose>=-48&&o.transpose<=48&&typeof o.rhythm==='boolean'&&finite(o.tolerance)&&o.tolerance>=80&&o.tolerance<=1000&&finite(o.sectionStart)&&finite(o.sectionEnd)&&o.sectionStart>=0&&o.sectionEnd<=MAX&&o.sectionEnd>o.sectionStart;}
 function setOptions(patch={}){
  const next={...options,...patch};
  if(!validOptions(next)){error='Use BPM 30–300, transpose ±48, tolerance 80–1000 ms, and a valid section.';emit();return false;}
  if(notes.some(n=>n.note+next.transpose<0||n.note+next.transpose>127)){error='That transposition exceeds the MIDI keyboard range.';emit();return false;}
  if(state==='recording'){error='Stop recording before changing phrase settings.';emit();return false;}
  halt();state='idle';options=next;error='';if(notes.length)persist();emit();return true;
 }
 function section(){const end=Math.min(duration,options.sectionEnd),begin=options.sectionStart,scale=options.sourceBpm/options.playBpm;
  return notes.filter(n=>n.start<end&&n.start+n.duration>begin).map(n=>({...n,note:n.note+options.transpose,start:(Math.max(n.start,begin)-begin)*scale,duration:(Math.min(n.start+n.duration,end)-Math.max(n.start,begin))*scale}));}
 function prepare(){if(state==='recording')finishRecording();halt();error='';progress=0;answered.clear();const list=section();
  if(!list.length){state='idle';error='Record a phrase or choose a section containing notes.';emit();return null;}
  if(list.some(n=>n.note<0||n.note>127)){state='idle';error='That transposition exceeds the MIDI keyboard range.';emit();return null;}
  groups=[];for(const n of list){let g=groups.at(-1);if(!g||n.start-g.start>GROUP*options.sourceBpm/options.playBpm){g={start:n.start,end:n.start,notes:[]};groups.push(g);}g.end=Math.max(g.end,n.start);if(!g.notes.includes(n.note))g.notes.push(n.note);}return list;
 }
 function runningTick(){if(state!=='playing'&&state!=='practice')return;emit();schedule(runningTick,100);}
 function play(){const list=prepare();if(!list)return false;state='playing';start=now();emit();schedule(runningTick,100);for(const n of list)schedule(()=>{onSound(n.note,n.velocity,n.duration);progress=Math.max(0,groups.findIndex(g=>g.start<=n.start&&n.start-g.start<=GROUP*options.sourceBpm/options.playBpm));emit();},n.start);
  schedule(()=>{halt();state='idle';progress=0;emit();},Math.max(...list.map(n=>n.start+n.duration))+100);return true;}
 function lateGuard(){if(!options.rhythm)return;const group=groups[progress];if(!group)return;schedule(()=>{if(state==='practice'&&groups[progress]===group)fail(null,'Timing missed — restart from the beginning.');},start+group.end+options.tolerance-now()+1);}
 function beginPractice(){state='practice';error='';start=now();progress=0;answered.clear();countIn=0;emit();schedule(runningTick,100);lateGuard();}
 function count(){halt();error='';progress=0;answered.clear();state='countin';countIn=4;emit();const beat=60000/options.playBpm;
  for(let i=1;i<4;i++)schedule(()=>{countIn=4-i;emit();},beat*i);
  schedule(()=>{if(held.size){state='wait-release';error='Release all keys, then the count-in restarts.';emit();}else beginPractice();},beat*4);}
 function practice(){if(!prepare())return false;if(held.size){state='wait-release';error='Release all keys to start the count-in.';emit();}else count();return true;}
 function fail(note,message){halt();state='wait-release';error=message;answered.clear();progress=0;onWrong(note,message);emit();if(!held.size)count();}
 function input(event={}){
  let {kind,note,velocity=100,channel=0}=event;
  if(!Number.isInteger(note)||note<0||note>127||!Number.isInteger(channel)||channel<0||channel>15||!Number.isInteger(velocity)||velocity<0||velocity>127)return;
  if(kind==='on'&&velocity===0)kind='off';if(kind!=='on'&&kind!=='off')return;
  const key=channel+':'+note;
  const eventTime=finite(event.time)&&event.time<=now()?event.time:now();
  if(kind==='off'){
   held.delete(key);if(state==='recording'){const n=recordHeld.get(key);if(n){n.duration=Math.min(MAX-n.start,Math.max(1,Math.min(MAX,eventTime-start)-n.start));recordHeld.delete(key);}}
   if(state==='wait-release'&&!held.size)count();return;
  }
  if(held.has(key))return;const samePitchHeld=[...held.values()].includes(note);held.set(key,note);
  if(state==='recording'){
   if(eventTime<start)return;
   if(now()-start>=MAX||recorded.length>=LIMIT){finishRecording();return;}
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
 function clear(){stop();notes=[];duration=0;groups=[];progress=0;error='';saved=false;try{storage?.removeItem(KEY);}catch{error='Could not remove the saved phrase from this browser.';}emit();return true;}
 const api={record,stop,input,play,practice,setOptions,clear,snapshot,load};load();return api;
}};
