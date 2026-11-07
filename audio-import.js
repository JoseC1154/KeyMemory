// Local audio/video import and a disposable review draft. No media uploads or storage.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.KeyMemoryAudioImport=api;})(typeof window==='undefined'?null:window,function(){
 'use strict';
 const MAX_FILE_BYTES=20*1024*1024,MAX_SOURCE_SECONDS=120,MAX_CLIP_SECONDS=30,MAX_NOTES=10000;
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 const abortError=()=>Object.assign(new Error('Canceled.'),{name:'AbortError'});
 function isVideoFile(file){return /^video\//i.test(file?.type||'')||/\.(mp4|m4v|mov|webm|ogv|avi|mkv)$/i.test(file?.name||'');}
 function decodeMessage(file){return isVideoFile(file)?'This video has no audio track this browser can decode. Try an MP4 with AAC audio, a WebM with Opus audio, or export its audio as WAV or MP3.':'This browser cannot decode the audio in that file. Try WAV or MP3.';}
 function bounds(start,end,duration){
  if(![start,end,duration].every(finite)||start<0||end>duration+.000001||end-start<.05||end-start>MAX_CLIP_SECONDS+.000001)throw Error('Choose a section from 0.05 to 30 seconds within the audio.');
  return{start,end,duration:Math.min(MAX_CLIP_SECONDS,end-start)};
 }
 function validateSource(buffer){
  if(!buffer||!finite(buffer.duration)||buffer.duration<=0||buffer.duration>MAX_SOURCE_SECONDS||!finite(buffer.sampleRate)||buffer.sampleRate<8000||buffer.sampleRate>192000||!Number.isInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1||buffer.numberOfChannels>2||!Number.isInteger(buffer.length)||buffer.length>25000000/buffer.numberOfChannels)throw Error('Use a file with a mono or stereo audio track up to 2 minutes long.');
 }
 function monoSlice(buffer,start,end){
  validateSource(buffer);bounds(start,end,buffer.duration);
  const first=Math.floor(start*buffer.sampleRate),last=Math.min(buffer.length,Math.ceil(end*buffer.sampleRate)),mono=new Float32Array(last-first);
  for(let channel=0;channel<buffer.numberOfChannels;channel++){
   const data=buffer.getChannelData(channel);
   for(let i=first;i<last;i++){const value=data[i];if(!finite(value))throw Error('The audio contains invalid sample data.');mono[i-first]+=value/buffer.numberOfChannels;}
  }
  return mono;
 }
 async function prepareClip(buffer,start,end,OfflineAudio){
  const selection=bounds(start,end,buffer.duration),mono=monoSlice(buffer,start,end);
  if(!OfflineAudio)throw Error('This browser cannot prepare audio. Try a current Chrome, Edge, Firefox or Safari.');
  const context=new OfflineAudio(1,Math.min(MAX_CLIP_SECONDS*22050,Math.round(selection.duration*22050)),22050),source=context.createBufferSource(),input=context.createBuffer(1,mono.length,buffer.sampleRate);
  input.getChannelData(0).set(mono);source.buffer=input;source.connect(context.destination);source.start();
  const output=await context.startRendering();return new Float32Array(output.getChannelData(0));
 }
 function normalizeNotes(events,duration){
  if(!Array.isArray(events)||events.length>MAX_NOTES||!finite(duration)||duration<=0||duration>30000.001)throw Error('The detected phrase exceeds the import limits. Try a shorter section.');
  const notes=[];
  for(const event of events){
   if(!event||!Number.isInteger(event.pitchMidi)||event.pitchMidi<0||event.pitchMidi>127||!finite(event.startTimeSeconds)||!finite(event.durationSeconds)||event.durationSeconds<=0)throw Error('The transcription returned invalid notes. Try again or use a clearer recording.');
   const start=Math.max(0,event.startTimeSeconds*1000),end=Math.min(duration,(event.startTimeSeconds+event.durationSeconds)*1000);
   if(end>start)notes.push({note:event.pitchMidi,velocity:90,channel:0,start,duration:end-start});
  }
  return notes.sort((a,b)=>a.start-b.start||a.note-b.note);
 }
 function validNotes(notes,duration){return notes.length>0&&notes.length<=MAX_NOTES&&notes.every(n=>Number.isInteger(n.note)&&n.note>=0&&n.note<=127&&finite(n.start)&&n.start>=0&&finite(n.duration)&&n.duration>0&&n.start+n.duration<=duration+.000001);}
 function noteName(note){return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][note%12]+(Math.floor(note/12)-1);}
 function envelopeValue(envelope,time){
  const {start,attackEnd,holdEnd,releaseEnd,amplitude}=envelope;
  if(time<=start)return 0;
  if(time<attackEnd)return amplitude*(time-start)/(attackEnd-start);
  if(time<=holdEnd)return amplitude;
  if(time<releaseEnd)return amplitude*(releaseEnd-time)/(releaseEnd-holdEnd);
  return 0;
 }
 function fadePreview(voice,time){
  const param=voice.gain.gain,envelope=voice.envelope,value=envelopeValue(envelope,time);let held=false;
  if(typeof param.cancelAndHoldAtTime==='function')try{param.cancelAndHoldAtTime(time);held=true;}catch{}
  if(!held){param.cancelScheduledValues(time);if(time>envelope.start&&time<envelope.attackEnd||time>envelope.holdEnd&&time<envelope.releaseEnd)param.linearRampToValueAtTime(value,time);else param.setValueAtTime(value,time);}
  const fadeEnd=voice.source?Math.max(time,Math.min(time+.025,envelope.releaseEnd)):time+.025;
  param.linearRampToValueAtTime(0,fadeEnd);
  (voice.osc||voice.source).stop(fadeEnd+.01);
 }
 function create(config){
  const w=config.window||window,d=w.document,el=id=>d.getElementById(id),open=()=>config.isOpen();
  let buffer=null,notes=[],detected=[],phase='empty',generation=0,controller=null,context=null,page=0,nextId=0,previewToken=0,previewTimer=null,previewKind='',previewSource=null;
  const voices=new Set(),PAGE=12;
  function status(text){el('audioImportStatus').textContent=text;}
  function selection(){const start=el('audioImportStart').value,end=el('audioImportEnd').value;return bounds(start===''?NaN:Number(start),end===''?NaN:Number(end),buffer?.duration||0);}
  function proposalDuration(){try{return selection().duration*1000;}catch{return 0;}}
  function sync(){
   const busy=phase==='loading'||phase==='analyzing';let selected=false;try{selection();selected=!!buffer;}catch{}
   const valid=validNotes(notes,proposalDuration());
   el('audioImportFile').disabled=busy;el('audioImportStart').disabled=busy||!buffer;el('audioImportEnd').disabled=busy||!buffer;
   el('audioImportAnalyze').disabled=busy||!selected;el('audioImportOriginal').disabled=busy||!selected;
   el('audioImportCancel').hidden=!busy;el('audioImportProgress').hidden=!busy;
   el('audioImportReview').hidden=phase!=='review';el('audioImportNotesPreview').disabled=!valid;
   el('audioImportUse').disabled=!valid;el('audioImportAdd').disabled=notes.length>=MAX_NOTES;
   el('audioImportReset').disabled=!detected.length;el('audioImportStopPreview').hidden=!previewKind;
   el('audioImportCount').textContent=notes.length+' detected / edited notes';
   el('audioImportValidation').textContent=phase==='review'&&!valid?(notes.length?'Correct invalid pitches or times before previewing or using this phrase.':'No notes remain. Add a note or analyze another section.') : '';
  }
  function audioContext(){const Audio=w.AudioContext||w.webkitAudioContext;if(!Audio)throw Error('Audio is unavailable in this browser.');return context ||= new Audio();}
  function stopPreview(){
   previewToken++;if(previewTimer!==null)w.clearInterval(previewTimer);previewTimer=null;previewKind='';
   if(previewSource){try{fadePreview(previewSource,context.currentTime);}catch{}previewSource=null;}
   for(const voice of voices){try{fadePreview(voice,context.currentTime);}catch{}}
   voices.clear();sync();
  }
  function abortWork(){generation++;controller?.abort();controller=null;}
  function resetDraft(){notes=[];detected=[];page=0;nextId=0;renderNotes();}
  function close(){abortWork();stopPreview();buffer=null;resetDraft();phase='empty';el('audioImportFile').value='';el('audioImportFilename').textContent='';el('audioImportStart').value='0';el('audioImportEnd').value='0';const old=context;context=null;if(old)w.setTimeout(()=>{try{Promise.resolve(old.close()).catch(()=>{});}catch{}},45);sync();}
  function begin(){close();status('Choose an audio or video file. Files stay on this device; only accepted notes are saved.');sync();}
  function metadata(file,signal){return new Promise((resolve,reject)=>{
   if(signal.aborted){reject(abortError());return;}
   const media=d.createElement(isVideoFile(file)?'video':'audio'),url=w.URL.createObjectURL(file);let timer,settled=false;
   const done=(error,value)=>{if(settled)return;settled=true;w.clearTimeout(timer);signal.removeEventListener('abort',cancel);media.onloadedmetadata=media.onerror=null;media.removeAttribute('src');try{media.load();}catch{}w.URL.revokeObjectURL(url);error?reject(error):resolve(value);};
   const cancel=()=>done(abortError());signal.addEventListener('abort',cancel,{once:true});
   media.preload='metadata';media.muted=true;media.playsInline=true;
   media.onloadedmetadata=()=>{const duration=media.duration;if(!finite(duration)||duration<=0||duration>MAX_SOURCE_SECONDS)done(Error('Use an audio or video file up to 2 minutes long, then select up to 30 seconds.'));else done(null,duration);};
   media.onerror=()=>done(Error(decodeMessage(file)));
   timer=w.setTimeout(()=>done(Error('File details could not be read. Try a shorter file or export its audio as WAV or MP3.')),15000);media.src=url;
  });}
  async function chooseFile(){
   const file=el('audioImportFile').files?.[0];if(!file)return;el('audioImportFile').value='';
   abortWork();stopPreview();buffer=null;resetDraft();const request=generation;controller=new w.AbortController();phase='loading';el('audioImportProgress').removeAttribute('value');el('audioImportFilename').textContent=file.name;status(isVideoFile(file)?'Reading video audio on this device…':'Reading audio on this device…');sync();
   try{
    if(!finite(file.size)||file.size<=0||file.size>MAX_FILE_BYTES)throw Error('Choose an audio or video file up to 20 MB.');
    await metadata(file,controller.signal);if(request!==generation||!open())return;
    const bytes=await file.arrayBuffer();if(request!==generation||!open())return;
    const audio=audioContext();let decoded;
    try{decoded=await audio.decodeAudioData(bytes);}catch{throw Error(decodeMessage(file));}
    if(request!==generation||!open())return;
    validateSource(decoded);buffer=decoded;phase='ready';controller=null;el('audioImportStart').value='0';el('audioImportEnd').value=String(Math.min(MAX_CLIP_SECONDS,decoded.duration));
    status((isVideoFile(file)?'Video audio is ready. ':'')+'Select up to 30 seconds, then Analyze. Clean solo piano works best.');
   }catch(error){if(request!==generation||!open())return;phase='empty';controller=null;status(error.name==='AbortError'?'Canceled. Your saved phrase is unchanged.':error.message||decodeMessage(file));}
   finally{if(request===generation&&open())sync();}
  }
  async function analyze(){
   if(!buffer||!open()||['loading','analyzing'].includes(phase))return;
   let chosen;try{chosen=selection();}catch(error){status(error.message);return;}
   abortWork();stopPreview();resetDraft();const request=generation;controller=new w.AbortController();const signal=controller.signal;phase='analyzing';status('Preparing your selected audio locally…');el('audioImportProgress').value=0;sync();
   try{
    const samples=await prepareClip(buffer,chosen.start,chosen.end,w.OfflineAudioContext||w.webkitOfflineAudioContext);
    if(request!==generation||!open())return;
    if(!w.KeyMemoryAudio)throw Error('The transcription module did not load. Reload the app and try again.');
    const result=await w.KeyMemoryAudio.transcribe(samples,{signal,onProgress:value=>{if(request!==generation||!open())return;el('audioImportProgress').value=value.progress;status(value.stage==='loading'?'Loading the local note-detection model…':value.stage==='processing'?'Preparing detected notes…':'Detecting notes locally… '+Math.round(value.progress*100)+'%');}});
    if(request!==generation||!open())return;
    detected=normalizeNotes(result,chosen.duration*1000);notes=detected.map(n=>({...n,id:++nextId}));phase='review';controller=null;page=0;renderNotes();
    status(notes.length?'Review the notes before using them. You can change pitches and timing, remove extra notes, or add missing ones.':'No clear notes were detected. Try a cleaner or shorter section, or add notes manually.');
   }catch(error){if(request!==generation||!open())return;phase='ready';controller=null;status(error.name==='AbortError'?'Analysis canceled. Your saved phrase is unchanged.':error.message||'Analysis failed. Try a shorter clip.');}
   finally{if(request===generation&&open())sync();}
  }
  function trimChanged(){if(!buffer)return;abortWork();stopPreview();resetDraft();phase='ready';try{selection();status('Section changed. Analyze again to detect notes for this section.');}catch(error){status(error.message);}sync();}
  function renderNotes(){
   const list=el('audioImportNoteList');list.replaceChildren();const pages=Math.max(1,Math.ceil(notes.length/PAGE));page=Math.min(page,pages-1);
   for(const n of notes.slice(page*PAGE,(page+1)*PAGE)){
    const row=d.createElement('div');row.className='audioImportNote';row.dataset.noteId=n.id;
    const pitchLabel=d.createElement('label');pitchLabel.textContent='Note';const pitch=d.createElement('select');pitch.dataset.field='note';pitch.setAttribute('aria-label','Pitch of note '+(notes.indexOf(n)+1));
    for(let i=0;i<128;i++){const option=d.createElement('option');option.value=i;option.textContent=noteName(i);pitch.append(option);}pitch.value=n.note;pitchLabel.append(pitch);row.append(pitchLabel);
    for(const [field,label]of[['start','Start (s)'],['duration','Length (s)']]){const wrap=d.createElement('label');wrap.textContent=label;const input=d.createElement('input');input.type='number';input.min=field==='start'?'0':'0.001';input.max=String(proposalDuration()/1000);input.step='any';input.value=finite(n[field])?String(n[field]/1000):'';input.dataset.field=field;input.setAttribute('aria-label',label+' of note '+(notes.indexOf(n)+1));wrap.append(input);row.append(wrap);}
    const remove=d.createElement('button');remove.type='button';remove.dataset.remove='true';remove.textContent='Remove';remove.setAttribute('aria-label','Remove '+noteName(n.note)+' note '+(notes.indexOf(n)+1));row.append(remove);list.append(row);
   }
   el('audioImportPage').textContent='Page '+(page+1)+' of '+pages;el('audioImportPrevious').disabled=page===0;el('audioImportNext').disabled=page>=pages-1;sync();
  }
  async function preview(kind){
   if(!open()||d.hidden)return;stopPreview();const token=previewToken,request=generation;
   try{
    const chosen=selection();if(kind==='notes'&&!validNotes(notes,chosen.duration*1000))return;
    const audio=audioContext();await audio.resume();if(token!==previewToken||request!==generation||!open()||d.hidden)return;
    if(audio.state!=='running')throw Error('Audio could not start. Tap Preview again.');
    previewKind=kind;const anchor=audio.currentTime+.03;
    if(kind==='original'){
     const source=audio.createBufferSource(),gain=audio.createGain();source.buffer=buffer;source.connect(gain);gain.connect(audio.destination);gain.gain.setValueAtTime(0,anchor);gain.gain.linearRampToValueAtTime(1,anchor+.01);gain.gain.setValueAtTime(1,anchor+Math.max(.01,chosen.duration-.01));gain.gain.linearRampToValueAtTime(0,anchor+chosen.duration);const voice={source,gain,envelope:{start:anchor,attackEnd:anchor+.01,holdEnd:anchor+Math.max(.01,chosen.duration-.01),releaseEnd:anchor+chosen.duration,amplitude:1}};previewSource=voice;source.onended=()=>{source.disconnect();gain.disconnect();if(previewSource===voice){previewSource=null;previewKind='';sync();}};source.start(anchor,chosen.start,chosen.duration);
    }else{
     const ordered=notes.map(n=>({...n})).sort((a,b)=>a.start-b.start),length=chosen.duration;let index=0;
     const pump=()=>{
      if(token!==previewToken||!open()||d.hidden){stopPreview();return;}
      while(index<ordered.length&&anchor+ordered[index].start/1000<=audio.currentTime+.12){
       const n=ordered[index++],end=anchor+(n.start+n.duration)/1000,start=Math.max(audio.currentTime,anchor+n.start/1000);if(end<=start)continue;
       if(voices.size>=64){stopPreview();status('The preview is too dense. Remove extra notes or use a shorter section.');return;}
       const osc=audio.createOscillator(),gain=audio.createGain();osc.type='triangle';osc.frequency.value=440*2**((n.note-69)/12);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.035,start+Math.min(.008,(end-start)/2));gain.gain.setValueAtTime(.035,end);gain.gain.linearRampToValueAtTime(0,end+.035);osc.connect(gain);gain.connect(audio.destination);const voice={osc,gain,envelope:{start,attackEnd:start+Math.min(.008,(end-start)/2),holdEnd:end,releaseEnd:end+.035,amplitude:.035}};voices.add(voice);osc.onended=()=>{osc.disconnect();gain.disconnect();voices.delete(voice);};osc.start(start);osc.stop(end+.04);
      }
      if(audio.currentTime>=anchor+length+.06)stopPreview();
     };
     pump();if(previewKind)previewTimer=w.setInterval(pump,30);
    }
    sync();
   }catch(error){if(token===previewToken&&request===generation&&open()){stopPreview();status(error.message||'Preview could not start.');}}
  }
  function usePhrase(){
   if(!open()||phase!=='review'||!validNotes(notes,proposalDuration()))return;
   stopPreview();const payload={notes:notes.map(({id,...n})=>({...n})).sort((a,b)=>a.start-b.start||a.note-b.note),duration:proposalDuration(),sourceBpm:120};
   try{if(config.onCommit(payload))config.onClose();else status('Your saved phrase is unchanged. Continue reviewing or close this import.');}catch(error){status(error.message||'The phrase could not be imported. Your saved phrase is unchanged.');}
  }
  el('audioImportFile').addEventListener('change',chooseFile);
  for(const id of ['audioImportStart','audioImportEnd'])el(id).addEventListener('change',trimChanged);
  el('audioImportAnalyze').addEventListener('click',analyze);el('audioImportClose').addEventListener('click',config.onClose);
  el('phraseImportOverlay').addEventListener('click',event=>{if(event.target===event.currentTarget)config.onClose();});
  el('audioImportCancel').addEventListener('click',()=>{abortWork();phase=buffer?'ready':'empty';status('Canceled. Your saved phrase is unchanged.');sync();});
  el('audioImportOriginal').addEventListener('click',()=>preview('original'));el('audioImportNotesPreview').addEventListener('click',()=>preview('notes'));el('audioImportStopPreview').addEventListener('click',stopPreview);
  el('audioImportUse').addEventListener('click',usePhrase);
  el('audioImportPrevious').addEventListener('click',()=>{page--;renderNotes();});el('audioImportNext').addEventListener('click',()=>{page++;renderNotes();});
  el('audioImportAdd').addEventListener('click',()=>{stopPreview();if(notes.length>=MAX_NOTES)return;notes.push({note:60,velocity:90,channel:0,start:0,duration:Math.min(500,proposalDuration()),id:++nextId});page=Math.floor((notes.length-1)/PAGE);renderNotes();status('Added C4. Adjust its pitch, start and length.');});
  el('audioImportReset').addEventListener('click',()=>{stopPreview();notes=detected.map(n=>({...n,id:++nextId}));page=0;renderNotes();status('Restored the detected notes.');});
  el('audioImportNoteList').addEventListener('change',event=>{const field=event.target.dataset.field,row=event.target.closest('[data-note-id]'),n=notes.find(n=>n.id===Number(row?.dataset.noteId));if(!n||!['note','start','duration'].includes(field))return;stopPreview();const value=event.target.value===''?NaN:Number(event.target.value);n[field]=field==='note'?value:value*1000;sync();});
  el('audioImportNoteList').addEventListener('click',event=>{if(!event.target.dataset.remove)return;stopPreview();const row=event.target.closest('[data-note-id]');notes=notes.filter(n=>n.id!==Number(row.dataset.noteId));renderNotes();status('Note removed from the draft.');});
  w.addEventListener('blur',stopPreview);d.addEventListener('visibilitychange',()=>{if(d.hidden)stopPreview();});w.addEventListener('pagehide',close);
  sync();return{open:begin,close,stopPreview};
 }
 return{MAX_FILE_BYTES,MAX_SOURCE_SECONDS,MAX_CLIP_SECONDS,isVideoFile,decodeMessage,bounds,validateSource,monoSlice,prepareClip,normalizeNotes,validNotes,noteName,envelopeValue,fadePreview,create};
});
