// Local audio/video import and a disposable review draft. No media uploads or storage.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.KeyMemoryAudioImport=api;})(typeof window==='undefined'?null:window,function(){
 'use strict';
 const MAX_FILE_BYTES=20*1024*1024,MAX_VIDEO_FILE_BYTES=100*1024*1024,MAX_SOURCE_SECONDS=120,MAX_CLIP_SECONDS=30,MAX_NOTES=10000,DECODE_TIMEOUT_MS=30000,RESUME_TIMEOUT_MS=5000;
 const SILENT_MESSAGE='No audible signal was found in this section. Check that the original movie or recording plays with sound outside KeyMemory. A screen recording may not have captured the sound. Try another section or a recording with audio.';
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 const abortError=()=>Object.assign(new Error('Canceled.'),{name:'AbortError'});
 function isVideoFile(file){return /^video\//i.test(file?.type||'')||/\.(mp4|m4v|mov|webm|ogv|avi|mkv)$/i.test(file?.name||'');}
 function fileByteLimit(file){return isVideoFile(file)?MAX_VIDEO_FILE_BYTES:MAX_FILE_BYTES;}
 function decodeMessage(file){return isVideoFile(file)?'This video has no audio track this browser can decode. First check that it plays with sound outside KeyMemory. If it does, export its audio as WAV or MP3, or try MP4 with AAC audio. A MOV or screen recording can contain no audio or an unsupported audio format.':'This browser cannot decode the audio in that file. Try WAV or MP3.';}
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
 function hasSignal(samples){for(let i=0;i<samples.length;i++){if(!finite(samples[i]))throw Error('The audio contains invalid sample data.');if(Math.abs(samples[i])>0.00001)return true;}return false;}
 function sectionHasSignal(buffer,start,end){
  for(let channel=0;channel<buffer.numberOfChannels;channel++){const data=buffer.getChannelData(channel);if(hasSignal(data.subarray(Math.floor(start*buffer.sampleRate),Math.min(buffer.length,Math.ceil(end*buffer.sampleRate)))))return true;}return false;
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
  let buffer=null,notes=[],detected=[],phase='empty',generation=0,controller=null,context=null,page=0,nextId=0,previewToken=0,previewTimer=null,previewKind='',previewStarting='',previewSource=null;
  const voices=new Set(),PAGE=12;
  let tempoSuggestion=null,tempoChosen=false,tempoTaps=[];
  const sourceBpm=()=>el('audioImportBpm').value===''?NaN:Number(el('audioImportBpm').value);
  const validBpm=()=>finite(sourceBpm())&&sourceBpm()>=30&&sourceBpm()<=300;
  function updateTempo(){tempoSuggestion=w.KeyMemoryTempo?.estimate(notes)||null;}
  function status(text,tone='info'){el('audioImportStatus').textContent=text;el('audioImportStatus').dataset.tone=tone;}
  function bounded(work,signal,ms,message){return new Promise((resolve,reject)=>{
   let settled=false,timer;const finish=(error,value)=>{if(settled)return;settled=true;w.clearTimeout(timer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value);},cancel=()=>finish(abortError());
   if(signal?.aborted){cancel();return;}signal?.addEventListener('abort',cancel,{once:true});timer=w.setTimeout(()=>finish(Error(message)),ms);
   Promise.resolve().then(()=>{if(settled)throw abortError();return work();}).then(value=>finish(null,value),error=>finish(error));
  });}
  function selection(){const start=el('audioImportStart').value,end=el('audioImportEnd').value;return bounds(start===''?NaN:Number(start),end===''?NaN:Number(end),buffer?.duration||0);}
  function proposalDuration(){try{return selection().duration*1000;}catch{return 0;}}
  function sync(){
   const busy=phase==='loading'||phase==='analyzing';el('audioImportAnalyze').textContent=phase==='analyzing'?'Analyzing…':phase==='review'?'Analyze again':'Analyze';el('audioImportOriginal').textContent=previewStarting==='original'?'Starting audio…':previewKind==='original'?'Playing original…':'Hear original section';let selected=false;try{selection();selected=!!buffer;}catch{}
   const valid=validNotes(notes,proposalDuration());
   el('audioImportFile').disabled=busy;el('audioImportStart').disabled=busy||!buffer;el('audioImportEnd').disabled=busy||!buffer;
   el('audioImportAnalyze').disabled=busy||!selected;el('audioImportOriginal').disabled=busy||!selected;
   el('audioImportCancel').hidden=!busy;el('audioImportProgress').hidden=!busy;
   el('audioImportReview').hidden=phase!=='review';el('audioImportNotesPreview').disabled=!valid;
   el('audioImportUse').disabled=!valid||!validBpm();el('audioImportAdd').disabled=notes.length>=MAX_NOTES;
   el('audioImportReset').disabled=!detected.length;el('audioImportStopPreview').hidden=!previewKind&&!previewStarting;
   el('audioImportCount').textContent=notes.length?notes.length+' note'+(notes.length===1?'':'s')+(valid?' ready':' to check'):'No notes to import';
   const replacing=!!config.hasSavedPhrase?.();
   el('audioImportUse').textContent=replacing?'Replace saved phrase':'Import notes';
   el('audioImportSaveHint').textContent=replacing?'Your saved phrase stays unchanged until you confirm replacement. Closing discards this draft and its audio.':'Nothing is saved until you import. Closing discards this draft and its audio.';
   let section='Analyze up to 30 seconds at a time. Clear piano recordings work best.';
   if(buffer)try{const chosen=selection(),seconds=n=>Number(n.toFixed(2));section=chosen.start===0&&Math.abs(chosen.end-buffer.duration)<.000001?'Full clip · '+seconds(chosen.duration)+' seconds':chosen.start===0?'First '+seconds(chosen.duration)+' seconds of your '+seconds(buffer.duration)+'-second file':'Selected section · '+seconds(chosen.start)+'–'+seconds(chosen.end)+' seconds';}catch{section='Choose a valid section in Section & file options.';}
   el('audioImportSection').textContent=section;
   el('audioImportTempoSuggestion').textContent=w.KeyMemoryTempo?.describe(tempoSuggestion)||'Set the source tempo or tap the beat if you know it.';
   const useTempo=el('audioImportUseTempo');useTempo.hidden=!tempoSuggestion?.bpm;useTempo.disabled=busy||!valid;useTempo.textContent='Use '+(tempoSuggestion?.bpm||'suggested')+' BPM';
   el('audioImportBpm').disabled=busy;el('audioImportTapTempo').disabled=busy;
   el('audioImportTempoHelp').textContent=(tempoChosen?'Your source tempo will be used. ':'120 BPM is only a reference until you choose a tempo. ')+'Note timing and normal-speed playback stay unchanged. You can also adjust or tap tempo after importing.';
   el('audioImportValidation').textContent=phase==='review'&&!validBpm()?'Enter a source tempo from 30 to 300 BPM before importing.':phase==='review'&&!valid?(notes.length?'Correct invalid pitches or times in Edit notes before previewing or importing.':'Add notes under Edit notes, or analyze another section.') : '';
  }
  function audioContext(){const Audio=w.AudioContext||w.webkitAudioContext;if(!Audio)throw Error('Audio is unavailable in this browser.');if(context?.state==='closed')context=null;return context ||= new Audio();}
  function stopPreview(){
   previewToken++;if(previewTimer!==null)w.clearInterval(previewTimer);previewTimer=null;previewKind='';previewStarting='';
   if(previewSource){try{fadePreview(previewSource,context.currentTime);}catch{}previewSource=null;}
   for(const voice of voices){try{fadePreview(voice,context.currentTime);}catch{}}
   voices.clear();sync();
  }
  function abortWork(){generation++;controller?.abort();controller=null;}
  function resetDraft(){tempoSuggestion=null;tempoChosen=false;tempoTaps=[];el('audioImportBpm').value='120';el('audioImportEditor').open=false;notes=[];detected=[];page=0;nextId=0;renderNotes();}
  function close(){el('audioImportOptions').open=false;abortWork();stopPreview();buffer=null;resetDraft();phase='empty';el('audioImportFile').value='';el('audioImportFilename').textContent='';el('audioImportStart').value='0';el('audioImportEnd').value='0';const old=context;context=null;if(old)w.setTimeout(()=>{try{Promise.resolve(old.close()).catch(()=>{});}catch{}},45);sync();}
  function begin(){close();status('Choose a file, then Analyze. Choosing a file does not start analysis.');sync();}
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
   el('audioImportOptions').open=false;abortWork();stopPreview();buffer=null;el('audioImportStart').value='0';el('audioImportEnd').value='0';resetDraft();const request=generation;controller=new w.AbortController();phase='loading';el('audioImportProgress').removeAttribute('value');el('audioImportFilename').textContent=file.name;status(isVideoFile(file)?'Reading video details on this device… Videos may be up to 100 MB, but their audio must be 2 minutes or shorter.':'Reading audio on this device…');sync();
   try{
    const limit=fileByteLimit(file),limitLabel=(limit/1024/1024)+' MB';
    if(!finite(file.size)||file.size<=0)throw Error('This file is empty or could not be read. Choose a '+(isVideoFile(file)?'video':'audio')+' file up to '+limitLabel+'.');
    if(file.size>limit)throw Error('This file is '+(file.size/1024/1024).toFixed(1)+' MB. Choose a '+(isVideoFile(file)?'video':'audio')+' file up to '+limitLabel+'; even a short video can exceed this size. Export a smaller copy or its audio as WAV or MP3.');
    await metadata(file,controller.signal);if(request!==generation||!open())return;
    status('File selected. Reading its audio data locally…');
    const signal=controller.signal,bytes=await bounded(()=>file.arrayBuffer(),signal,DECODE_TIMEOUT_MS,'Reading this file took too long. Try a smaller file or export its audio as WAV or MP3.');if(request!==generation||!open())return;
    status('Decoding the audio track locally… Larger videos can take longer. Keep this tab open; Analyze unlocks when ready.');
    const audio=audioContext();let decoded;
    decoded=await bounded(async()=>{try{return await audio.decodeAudioData(bytes);}catch{throw Error(decodeMessage(file));}},signal,DECODE_TIMEOUT_MS,'The browser did not finish decoding this file. Try a smaller file or export its audio as WAV or MP3.');
    if(request!==generation||!open())return;
    validateSource(decoded);const audible=sectionHasSignal(decoded,0,decoded.duration);buffer=decoded;phase='ready';controller=null;el('audioImportStart').value='0';el('audioImportEnd').value=String(Math.min(MAX_CLIP_SECONDS,decoded.duration));
    status(audible?(isVideoFile(file)?'Video audio is ready. ':'Audio is ready. ')+'Choose Analyze to detect notes.':SILENT_MESSAGE,audible?'success':'warning');
   }catch(error){if(request!==generation||!open())return;phase='empty';controller=null;status(error.name==='AbortError'?'Canceled. Your saved phrase is unchanged.':'File not ready: '+(error.message||decodeMessage(file)),error.name==='AbortError'?'info':'error');}
   finally{if(request===generation&&open())sync();}
  }
  async function analyze(){
   if(!buffer||!open()||['loading','analyzing'].includes(phase))return;
   let chosen;try{chosen=selection();}catch(error){status(error.message);return;}
   el('audioImportOptions').open=false;abortWork();stopPreview();resetDraft();const request=generation;controller=new w.AbortController();const signal=controller.signal;phase='analyzing';status('Preparing your selected audio locally…');el('audioImportProgress').value=0;sync();
   try{
    const samples=await prepareClip(buffer,chosen.start,chosen.end,w.OfflineAudioContext||w.webkitOfflineAudioContext);
    if(request!==generation||!open())return;
    if(!hasSignal(samples)){phase='review';controller=null;renderNotes();status(SILENT_MESSAGE,'warning');return;}
    if(!w.KeyMemoryAudio)throw Error('The transcription module did not load. Reload the app and try again.');
    const result=await w.KeyMemoryAudio.transcribe(samples,{signal,onProgress:value=>{if(request!==generation||!open())return;el('audioImportProgress').value=value.progress;status(value.stage==='loading'?'Loading the local note-detection model… The first analysis needs an internet connection; your recording stays on this device.':value.stage==='processing'?'Preparing detected notes…':'Detecting notes locally… '+Math.round(value.progress*100)+'%');}});
    if(request!==generation||!open())return;
    detected=normalizeNotes(result,chosen.duration*1000);notes=detected.map(n=>({...n,id:++nextId}));phase='review';controller=null;page=0;renderNotes();
    status(notes.length?'Your notes are ready. Import them to play and practice.':'No clear notes were detected. Try a clearer recording or another section. You can also add notes under Edit notes.',notes.length?'success':'warning');
   }catch(error){if(request!==generation||!open())return;phase='ready';controller=null;status(error.name==='AbortError'?'Analysis canceled. Your saved phrase is unchanged.':error.message||'Analysis failed. Try a shorter clip.',error.name==='AbortError'?'info':'error');}
   finally{if(request===generation&&open())sync();}
  }
  function trimChanged(){if(!buffer)return;abortWork();stopPreview();resetDraft();phase='ready';try{selection();status('Section changed. Analyze again to detect notes for this section.');}catch(error){status(error.message);}sync();}
  function renderNotes(){
   updateTempo();
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
    if(kind==='original'&&!sectionHasSignal(buffer,chosen.start,chosen.end)){status(SILENT_MESSAGE,'warning');return;}
    const audio=audioContext();previewStarting=kind;status('Starting audio…');sync();const resume=audio.resume();await bounded(()=>resume,null,RESUME_TIMEOUT_MS,'Audio did not start. Tap Hear original section again, and check the browser and device sound settings.');if(token!==previewToken||request!==generation||!open()||d.hidden)return;
    if(audio.state!=='running')throw Error('Audio could not start. Tap Preview again.');
    previewStarting='';previewKind=kind;status(kind==='original'?'Playing original section. If you cannot hear it, check the browser tab and device volume.':'Playing detected notes.');const anchor=audio.currentTime+.03;
    if(kind==='original'){
     const source=audio.createBufferSource(),gain=audio.createGain();source.buffer=buffer;source.connect(gain);gain.connect(audio.destination);gain.gain.setValueAtTime(0,anchor);gain.gain.linearRampToValueAtTime(1,anchor+.01);gain.gain.setValueAtTime(1,anchor+Math.max(.01,chosen.duration-.01));gain.gain.linearRampToValueAtTime(0,anchor+chosen.duration);const voice={source,gain,envelope:{start:anchor,attackEnd:anchor+.01,holdEnd:anchor+Math.max(.01,chosen.duration-.01),releaseEnd:anchor+chosen.duration,amplitude:1}};previewSource=voice;source.onended=()=>{source.disconnect();gain.disconnect();if(previewSource===voice){previewSource=null;previewKind='';status('Original section finished. '+(notes.length?'Your notes are ready to import.':'Choose Analyze to detect notes.'));sync();}};source.start(anchor,chosen.start,chosen.duration);
    }else{
     const ordered=notes.map(n=>({...n})).sort((a,b)=>a.start-b.start),length=chosen.duration;let index=0;
     const pump=()=>{
      if(token!==previewToken||!open()||d.hidden){stopPreview();return;}
      while(index<ordered.length&&anchor+ordered[index].start/1000<=audio.currentTime+.12){
       const n=ordered[index++],end=anchor+(n.start+n.duration)/1000,start=Math.max(audio.currentTime,anchor+n.start/1000);if(end<=start)continue;
       if(voices.size>=64){stopPreview();status('The preview is too dense. Remove extra notes or use a shorter section.');return;}
       const osc=audio.createOscillator(),gain=audio.createGain();osc.type='triangle';osc.frequency.value=440*2**((n.note-69)/12);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.035,start+Math.min(.008,(end-start)/2));gain.gain.setValueAtTime(.035,end);gain.gain.linearRampToValueAtTime(0,end+.035);osc.connect(gain);gain.connect(audio.destination);const voice={osc,gain,envelope:{start,attackEnd:start+Math.min(.008,(end-start)/2),holdEnd:end,releaseEnd:end+.035,amplitude:.035}};voices.add(voice);osc.onended=()=>{osc.disconnect();gain.disconnect();voices.delete(voice);};osc.start(start);osc.stop(end+.04);
      }
      if(audio.currentTime>=anchor+length+.06){stopPreview();status('Preview finished. Your notes are ready to import.');}
     };
     pump();if(previewKind)previewTimer=w.setInterval(pump,30);
    }
    sync();
   }catch(error){if(token===previewToken&&request===generation&&open()){stopPreview();status(error.message||'Preview could not start.','error');}}
  }
  function usePhrase(){
   if(!open()||phase!=='review'||!validNotes(notes,proposalDuration())||!validBpm())return;
   stopPreview();const payload={notes:notes.map(({id,...n})=>({...n})).sort((a,b)=>a.start-b.start||a.note-b.note),duration:proposalDuration(),sourceBpm:sourceBpm()};
   try{if(config.onCommit(payload))config.onClose();else status('Your saved phrase is unchanged. Import when ready, or close this window.');}catch(error){status(error.message||'The phrase could not be imported. Your saved phrase is unchanged.');}
  }
  el('audioImportFile').addEventListener('change',chooseFile);
  for(const id of ['audioImportStart','audioImportEnd'])el(id).addEventListener('change',trimChanged);
  el('audioImportAnalyze').addEventListener('click',analyze);el('audioImportClose').addEventListener('click',config.onClose);
  el('phraseImportOverlay').addEventListener('click',event=>{if(event.target===event.currentTarget)config.onClose();});
  el('audioImportCancel').addEventListener('click',()=>{abortWork();phase=buffer?'ready':'empty';status('Canceled. Your saved phrase is unchanged.');sync();});
  el('audioImportOriginal').addEventListener('click',()=>preview('original'));el('audioImportNotesPreview').addEventListener('click',()=>preview('notes'));el('audioImportStopPreview').addEventListener('click',()=>{stopPreview();status('Preview stopped. '+(notes.length?'Your notes are ready to import.':'Choose Analyze to detect notes.'));});
  el('audioImportUse').addEventListener('click',usePhrase);
  el('audioImportBpm').addEventListener('change',()=>{tempoChosen=true;tempoTaps=[];sync();});
  el('audioImportUseTempo').addEventListener('click',()=>{if(!open()||phase!=='review'||!tempoSuggestion?.bpm)return;el('audioImportBpm').value=String(tempoSuggestion.bpm);tempoChosen=true;tempoTaps=[];sync();});
  el('audioImportTapTempo').addEventListener('click',()=>{if(!open()||phase!=='review')return;const now=w.Date.now();if(tempoTaps.length&&now-tempoTaps.at(-1)>2000)tempoTaps=[];tempoTaps.push(now);tempoTaps=tempoTaps.slice(-5);if(tempoTaps.length<2)return;const bpm=60000*(tempoTaps.length-1)/(tempoTaps.at(-1)-tempoTaps[0]);if(bpm>=30&&bpm<=300){el('audioImportBpm').value=String(Math.round(bpm*10)/10);tempoChosen=true;sync();}});
  el('audioImportPrevious').addEventListener('click',()=>{page--;renderNotes();});el('audioImportNext').addEventListener('click',()=>{page++;renderNotes();});
  el('audioImportAdd').addEventListener('click',()=>{stopPreview();if(notes.length>=MAX_NOTES)return;notes.push({note:60,velocity:90,channel:0,start:0,duration:Math.min(500,proposalDuration()),id:++nextId});page=Math.floor((notes.length-1)/PAGE);renderNotes();status('Added C4. Adjust its pitch, start and length.');});
  el('audioImportReset').addEventListener('click',()=>{stopPreview();notes=detected.map(n=>({...n,id:++nextId}));page=0;renderNotes();status('Restored the detected notes.');});
  el('audioImportNoteList').addEventListener('change',event=>{const field=event.target.dataset.field,row=event.target.closest('[data-note-id]'),n=notes.find(n=>n.id===Number(row?.dataset.noteId));if(!n||!['note','start','duration'].includes(field))return;stopPreview();const value=event.target.value===''?NaN:Number(event.target.value);n[field]=field==='note'?value:value*1000;updateTempo();sync();});
  el('audioImportNoteList').addEventListener('click',event=>{if(!event.target.dataset.remove)return;stopPreview();const row=event.target.closest('[data-note-id]');notes=notes.filter(n=>n.id!==Number(row.dataset.noteId));renderNotes();status('Note removed from the draft.');});
  function interruptPreview(){const playing=previewKind||previewStarting;stopPreview();if(playing&&open())status('Preview stopped when the app lost focus. Choose a preview button to listen again.');}
  w.addEventListener('blur',interruptPreview);d.addEventListener('visibilitychange',()=>{if(d.hidden)interruptPreview();});w.addEventListener('pagehide',close);
  sync();return{open:begin,close,stopPreview};
 }
 return{MAX_FILE_BYTES,MAX_VIDEO_FILE_BYTES,fileByteLimit,MAX_SOURCE_SECONDS,MAX_CLIP_SECONDS,DECODE_TIMEOUT_MS,RESUME_TIMEOUT_MS,hasSignal,sectionHasSignal,isVideoFile,decodeMessage,bounds,validateSource,monoSlice,prepareClip,normalizeNotes,validNotes,noteName,envelopeValue,fadePreview,create};
});
