// Pure pitch-reading and exact-time views. No inferred rhythm notation, key signature or hand assignment.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.KeyMemoryPhraseView=api;})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const SHARP=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
 const FLAT=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
 const LETTERS={C:0,D:1,E:2,F:3,G:4,A:5,B:6};
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const round=n=>Math.round(n*1000)/1000;
 function pitch(midi,spelling='sharp'){
  if(!Number.isInteger(midi)||midi<0||midi>127)throw new RangeError('MIDI pitch must be an integer from0 to127.');
  if(spelling!=='sharp'&&spelling!=='flat')throw new RangeError('Choose sharp or flat spelling.');
  const name=(spelling==='flat'?FLAT:SHARP)[midi%12],letter=name[0],accidental=name.slice(1),octave=Math.floor(midi/12)-1;
  return{midi,name:name+octave,letter,accidental,octave,diatonic:octave*7+LETTERS[letter]};
 }
 function staffPosition(midi,spelling='sharp'){
  const p=pitch(midi,spelling),clef=midi>=60?'treble':'bass',bottom=clef==='treble'?30:18,top=bottom+8,baseY=clef==='treble'?100:190;
  const y=baseY-(p.diatonic-bottom)*5,ledger=[];
  for(let d=bottom-2;d>=p.diatonic;d-=2)ledger.push(baseY-(d-bottom)*5);
  for(let d=top+2;d<=p.diatonic;d+=2)ledger.push(baseY-(d-bottom)*5);
  return{...p,clef,y,ledger};
 }
 function accidentalSVG(kind,x,y){
  // Vector symbols avoid missing musical-font glyphs on phones.
  if(kind==='#')return `<path d="M${x-2} ${y-8}v16M${x+3} ${y-9}v16M${x-5} ${y-2}l11-2M${x-5} ${y+4}l11-2" fill="none" stroke="currentColor" stroke-width="1.5"/>`;
  if(kind==='b')return `<path d="M${x-2} ${y-12}v18C${x+10} ${y} ${x+4} ${y-6} ${x-2} ${y-1}" fill="none" stroke="currentColor" stroke-width="1.7"/>`;
  return `<path d="M${x-3} ${y-9}v14l6-2M${x+3} ${y+9}v-14l-6 2" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
 }
 function staffFrameSVG(width){
  let body='';
  for(const y of [60,70,80,90,100,150,160,170,180,190])body+=`<line x1="12" x2="${width-12}" y1="${y}" y2="${y}" stroke="currentColor" opacity=".38"/>`;
  body+='<line x1="12" x2="12" y1="60" y2="190" stroke="currentColor" opacity=".6"/>';
  // G-clef spiral is centered on G4 (y90); F-clef dots bracket F3 (y160).
  body+='<g class="trebleClef" aria-label="Treble G clef"><path d="M32 96 C23 96 23 84 32 84 C43 84 43 99 33 101 C16 103 13 83 27 74 C41 65 43 55 36 46 C27 53 29 73 33 91 L39 113 C42 125 24 127 24 117 C24 109 35 111 32 118" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></g>';
  body+='<g class="bassClef" aria-label="Bass F clef"><path d="M23 161 C16 151 38 146 39 161 C40 173 28 181 20 185 C29 178 34 171 33 161 C32 155 27 154 23 157" fill="currentColor"/><circle cx="23" cy="160" r="3" fill="currentColor"/><circle cx="45" cy="155" r="1.8" fill="currentColor"/><circle cx="45" cy="165" r="1.8" fill="currentColor"/></g>';
  body+='<text x="15" y="43" font-size="9" font-family="system-ui,sans-serif" fill="currentColor">Treble</text><text x="15" y="140" font-size="9" font-family="system-ui,sans-serif" fill="currentColor">Bass</text>';
  return body;
 }
 function staffSVG(notes=[],options={}){
  const spelling=options.spelling||'sharp',names=options.names!==false;
  const pitches=[...new Set(notes.map(n=>typeof n==='number'?n:n.midi??n.note))].map(n=>staffPosition(n,spelling)).sort((a,b)=>a.y-b.y||a.midi-b.midi);
  const occupied={treble:[],bass:[]};let maxX=100;
  for(const p of pitches){let column=0;while(occupied[p.clef][column]?.some(y=>Math.abs(y-p.y)<(names?15:12)))column++;(occupied[p.clef][column]||=[]).push(p.y);p.x=88+column*(names?62:27);maxX=Math.max(maxX,p.x+(names?68:25));}
  const width=Math.max(340,maxX+16),minY=Math.min(38,...pitches.map(p=>p.y-20)),maxY=Math.max(205,...pitches.map(p=>p.y+15)),height=maxY-minY;
  const label=(options.title||'Grand staff pitch reading — not rhythmic notation')+(pitches.length?': '+pitches.map(p=>p.name).join(', '):'. No notes selected.');
  let body='';
  body+=staffFrameSVG(width);
  for(const p of pitches){body+=`<g class="staffPitch" data-midi="${p.midi}" data-clef="${p.clef}" data-diatonic="${p.diatonic}"><title>${esc(p.name+', '+p.clef+' staff')}</title>`;
   for(const y of p.ledger)body+=`<line class="ledger" x1="${p.x-10}" x2="${p.x+10}" y1="${y}" y2="${y}" stroke="currentColor"/>`;
   body+=accidentalSVG(p.accidental,p.x-17,p.y)+`<ellipse cx="${p.x}" cy="${p.y}" rx="6" ry="4" transform="rotate(-15 ${p.x} ${p.y})" fill="currentColor"/>`;
   if(names)body+=`<text x="${p.x+11}" y="${p.y+3}" font-size="12" font-family="system-ui,sans-serif" fill="currentColor">${esc(p.name)}</text>`;
   body+='</g>';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" class="phraseStaffSVG" style="min-height:${height>195?height:0}px" viewBox="0 ${minY} ${width} ${height}" width="100%" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet"><title>${esc(label)}</title>${body}</svg>`;
 }
 function prepareTimeline(source={},options={}){
  const transpose=options.transpose??0;if(!Number.isInteger(transpose))throw new RangeError('Transpose must be whole semitones.');
  const duration=source.duration??0;if(!finite(duration)||duration<0)throw new RangeError('Duration must be nonnegative milliseconds.');
  const raw=source.notes||[],controls=source.controllers||[],initial=source.initialControllers||[];
  if(raw.length>10000||controls.length>20000)throw new RangeError('Phrase exceeds supported view limits.');
  const down=Array(16).fill(null),spans=Array.from({length:16},()=>[]);
  for(const c of initial)if(c.controller===64&&Number.isInteger(c.channel)&&c.channel>=0&&c.channel<16&&c.value>=64)down[c.channel]=0;
  for(const c of [...controls].sort((a,b)=>a.time-b.time)){
   if(c.controller!==64||!Number.isInteger(c.channel)||c.channel<0||c.channel>15||!finite(c.time)||c.time<0||c.time>duration)continue;
   if(c.value>=64){if(down[c.channel]===null)down[c.channel]=c.time;}
   else if(down[c.channel]!==null){spans[c.channel].push({start:down[c.channel],end:c.time});down[c.channel]=null;}
  }
  down.forEach((t,ch)=>{if(t!==null)spans[ch].push({start:t,end:duration});});
  const notes=raw.map((n,id)=>{
   const midi=n.note+transpose,channel=n.channel??0;pitch(midi);
   if(!Number.isInteger(channel)||channel<0||channel>15||!finite(n.start)||n.start<0||!finite(n.duration)||n.duration<0||n.start+n.duration>duration+.01)throw new RangeError('Invalid note timing or channel.');
   const keyEnd=Math.min(duration,n.start+n.duration);let soundEnd=keyEnd;
   const intervals=spans[channel];let low=0,high=intervals.length-1,match=-1;
   while(low<=high){const mid=(low+high)>>1;if(intervals[mid].start<=keyEnd){match=mid;low=mid+1;}else high=mid-1;}
   if(match>=0&&intervals[match].end>keyEnd)soundEnd=intervals[match].end;
   return{id,midi,channel,velocity:n.velocity??100,start:n.start,keyEnd,soundEnd};
  }).sort((a,b)=>a.start-b.start||a.id-b.id);
  return{notes,duration,controllers:controls.map(c=>({...c})).sort((a,b)=>a.time-b.time),initialControllers:initial.map(c=>({...c})),minMidi:notes.length?Math.min(...notes.map(n=>n.midi)):48,maxMidi:notes.length?Math.max(...notes.map(n=>n.midi)):72};
 }
 function controllerAt(timeline,time=0){
  if(!finite(time))throw new RangeError('Controller time must be finite milliseconds.');
  const result=Array.from({length:16},(_,channel)=>({channel,sustain:0,volume:100,expression:127})),fields={64:'sustain',7:'volume',11:'expression'};
  const apply=c=>{if(fields[c.controller]&&Number.isInteger(c.channel)&&c.channel>=0&&c.channel<16&&Number.isInteger(c.value)&&c.value>=0&&c.value<=127)result[c.channel][fields[c.controller]]=c.value;};
  for(const c of timeline.initialControllers||[])apply(c);
  for(const c of timeline.controllers||[]){if(c.time>time)break;if(finite(c.time))apply(c);}
  return result;
 }
 function rollSVG(timeline,options={}){
  const start=options.start??0,end=options.end??Math.max(1000,timeline.duration),cursor=options.cursor??start,width=Math.max(240,Math.min(2000,options.width??800)),height=Math.max(120,Math.min(800,options.height??220)),maxNotes=Math.max(1,Math.min(1000,Math.floor(options.maxNotes??500))),spelling=options.spelling||'sharp';
  if(!finite(start)||!finite(end)||end<=start)throw new RangeError('Choose a valid timeline window.');
  if(!finite(width)||!finite(height)||!finite(maxNotes))throw new RangeError('View dimensions must be finite.');
  const low=options.minMidi??timeline.minMidi,high=options.maxMidi??timeline.maxMidi;pitch(low,spelling);pitch(high,spelling);if(high<low)throw new RangeError('Pitch range is reversed.');
  const candidates=timeline.notes.filter(n=>n.midi>=low&&n.midi<=high&&n.start<end&&(n.soundEnd>start||(n.soundEnd===n.start&&n.start>=start))),visible=candidates.slice(0,maxNotes).map(n=>({...n})),omitted=candidates.length-visible.length;
  const laneEnds=new Map();
  for(const n of visible){const ends=laneEnds.get(n.midi)||[];let lane=ends.findIndex(stop=>stop<=n.start);if(lane<0)lane=ends.length;ends[lane]=n.soundEnd;n.lane=lane;laneEnds.set(n.midi,ends);}

  const left=options.names===false?12:50,right=12,top=20,bottom=24,plotW=width-left-right,plotH=height-top-bottom,row=plotH/(high-low+1),x=t=>left+(t-start)/(end-start)*plotW,y=m=>top+(high-m+.5)*row;
  const label=`Exact-time piano roll, ${(start/1000).toFixed(2)} to ${(end/1000).toFixed(2)} seconds. Solid bars: physical key duration. Dashed tails: sustain pedal. ${visible.length} notes shown${omitted?', '+omitted+' omitted in this dense window':''}.`;
  let body='';
  for(let m=low;m<=high;m++){
   if(row>=7||m%12===0)body+=`<line x1="${left}" x2="${width-right}" y1="${round(y(m))}" y2="${round(y(m))}" stroke="currentColor" opacity="${m%12===0?'.22':'.08'}"/>`;
   if(options.names!==false&&(row>=12||m%12===0))body+=`<text x="${left-5}" y="${round(y(m)+3)}" font-size="10" text-anchor="end" font-family="system-ui,sans-serif" fill="currentColor">${esc(pitch(m,spelling).name)}</text>`;
  }
  for(let i=0;i<=4;i++){const at=start+(end-start)*i/4;body+=`<line x1="${round(x(at))}" x2="${round(x(at))}" y1="${top}" y2="${height-bottom}" stroke="currentColor" opacity=".15"/><text x="${round(x(at))}" y="${height-7}" text-anchor="${i===0?'start':i===4?'end':'middle'}" font-size="10" font-family="system-ui,sans-serif" fill="currentColor">${(at/1000).toFixed(2)}s</text>`;}
  for(const n of visible){if(n.midi<low||n.midi>high)continue;
   const lanes=laneEnds.get(n.midi).length,yy=y(n.midi)+((n.lane+.5)/lanes-.5)*row*.8,h=Math.min(12,Math.max(.3,row*.65/lanes)),keyStart=Math.max(start,n.start),keyEnd=Math.min(end,n.keyEnd),tailStart=Math.max(start,n.keyEnd),tailEnd=Math.min(end,n.soundEnd),color=`hsl(${(n.channel*47+160)%360} 68% 34%)`;
   const active=cursor>=n.start&&cursor<n.keyEnd?'keyActive':cursor>=n.keyEnd&&cursor<n.soundEnd?'tailActive':'';
   body+=`<g class="rollNote ${active}" data-note-id="${n.id}" data-midi="${n.midi}" data-channel="${n.channel}" data-lane="${n.lane}"><title>${esc(pitch(n.midi,spelling).name)}, channel ${n.channel+1}; onset ${n.start}ms, key release ${n.keyEnd}ms, sound end ${n.soundEnd}ms</title>`;
   if(keyEnd>keyStart||(n.keyEnd===n.start&&n.start>=start&&n.start<end))body+=`<rect class="keyDuration" x="${round(x(keyStart))}" y="${round(yy-h/2)}" width="${round(Math.max(.7,x(keyEnd)-x(keyStart)))}" height="${round(h)}" rx="1" fill="${color}"${active==='keyActive'?' stroke="#17251b" stroke-width="1.5"':''}/>`;
   if(tailEnd>tailStart)body+=`<line class="pedalTail" x1="${round(x(tailStart))}" x2="${round(x(tailEnd))}" y1="${round(yy)}" y2="${round(yy)}" stroke="${color}" stroke-width="${round(Math.max(active==='tailActive'?2:1,h*.55))}" stroke-dasharray="4 3" opacity="${active==='tailActive'?'.9':'.55'}"/>`;
   body+='</g>';
  }
  if(finite(cursor)&&cursor>=start&&cursor<=end)body+=`<line class="rollCursor" x1="${round(x(cursor))}" x2="${round(x(cursor))}" y1="${top-4}" y2="${height-bottom}" stroke="#8e2525" stroke-width="2"/>`;
  if(omitted)body+=`<text x="${left}" y="12" font-size="10" font-family="system-ui,sans-serif" fill="currentColor">Dense window: ${omitted} more notes; zoom in.</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="phraseRollSVG" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${body}</svg>`;
 }
 function timelineStaffSVG(timeline,options={}){
  const start=options.start??0,end=options.end??Math.max(1000,timeline.duration),cursor=options.cursor??start;
  const width=Math.max(240,Math.min(2000,options.width??800)),maxNotes=Math.max(1,Math.min(400,Math.floor(options.maxNotes??400))),spelling=options.spelling||'sharp',names=options.names!==false;
  if(!finite(start)||!finite(end)||end<=start)throw new RangeError('Choose a valid timeline window.');
  if(!finite(width)||!finite(maxNotes))throw new RangeError('View dimensions must be finite.');
  pitch(60,spelling);
  // Original onsets stay exact. Inspection includes left-edge continuation marks
  // for earlier sounding notes; pedal tails never become pressed keys.
  const candidates=timeline.notes.filter(n=>(n.start>=start&&n.start<end)||(options.inspecting&&n.start<start&&n.start<=cursor&&n.soundEnd>cursor)),visible=candidates.slice(0,maxNotes).map(n=>({...n,...staffPosition(n.midi,spelling)})),omitted=candidates.length-visible.length;
  const left=80,right=64,plotW=width-left-right,x=t=>left+(t-start)/(end-start)*plotW;
  // Merge true unisons only: distinct channels/releases remain in the accessible title.
  const merged=new Map();
  for(const n of visible){const key=n.start+':'+n.midi;if(merged.has(key))merged.get(key).voices.push(n);else merged.set(key,{...n,voices:[n]});}
  const marks=[...merged.values()],chords=new Map();
  for(const n of marks){const placementTime=Math.max(start,n.start);if(!chords.has(placementTime))chords.set(placementTime,[]);chords.get(placementTime).push(n);}
  let minX=0,maxX=width;
  for(const chord of chords.values()){
   const columns=[],onsetX=x(Math.max(start,chord[0].start)),direction=width-onsetX-64>=onsetX-28?1:-1;
   const step=names||chord.some(n=>n.voices.length>1)?80:30;
   for(const n of [...chord].sort((a,b)=>a.y-b.y||a.midi-b.midi)){
    let column=0;while(columns[column]?.some(y=>Math.abs(y-n.y)<20))column++;
    (columns[column]||=[]).push(n.y);n.onsetX=onsetX;n.headX=onsetX+direction*column*step;
    minX=Math.min(minX,n.headX-(n.start<start?40:28));maxX=Math.max(maxX,n.headX+(names?72:32));
   }
  }
  const minY=Math.min(30,...visible.map(n=>n.y-22)),maxY=Math.max(205,...visible.map(n=>n.y+18)),height=maxY-minY+26;
  const label=`Pitch timeline, not rhythmic notation. Exact onset times, ${(start/1000).toFixed(2)} to ${(end/1000).toFixed(2)} seconds. Offset heads connect to their exact onset markers. Unisons are grouped with voice counts. ${visible.length} notes shown${omitted?', '+omitted+' omitted in this dense window':''}.`;
  let body=staffFrameSVG(width);
  for(let i=0;i<=4;i++){
   const at=start+(end-start)*i/4,xx=x(at);
   body+=`<line class="staffTimeGuide" x1="${xx}" x2="${xx}" y1="${minY+15}" y2="${maxY}" stroke="currentColor" opacity=".1"/><text x="${xx}" y="${maxY+18}" text-anchor="${i===0?'start':i===4?'end':'middle'}" font-size="10" font-family="system-ui,sans-serif" fill="currentColor">${(at/1000).toFixed(2)}s</text>`;
  }
  for(const n of marks){
   const xx=n.headX,active=finite(cursor)&&n.voices.some(v=>cursor>=v.start&&cursor<v.keyEnd),tail=options.inspecting&&!active&&finite(cursor)&&n.voices.some(v=>cursor>=v.keyEnd&&cursor<v.soundEnd);
   const voiceLabel=n.voices.map(v=>`channel ${v.channel+1}, key release ${v.keyEnd}ms`).join('; ');
   body+=`<g class="staffTimelineNote${active?' keyActive':''}${options.inspecting&&active?' staffSelectedKey':tail?' staffSelectedTail':''}" data-note-id="${esc(n.id)}" data-note-ids="${esc(n.voices.map(v=>v.id).join(','))}" data-voice-count="${n.voices.length}" data-onset-x="${n.onsetX}" data-midi="${n.midi}" data-channel="${esc(n.channel)}" data-clef="${n.clef}" data-diatonic="${n.diatonic}" data-start="${n.start}" data-key-end="${n.keyEnd}"><title>${esc(n.name)}, ${n.clef} staff; onset ${n.start}ms; ${n.voices.length} voice${n.voices.length===1?'':'s'}: ${esc(voiceLabel)}</title>`;
   if(xx!==n.onsetX)body+=`<line class="staffOnsetConnector" x1="${n.onsetX}" x2="${xx}" y1="${n.y}" y2="${n.y}" stroke="currentColor" stroke-dasharray="2 2" opacity=".45"/>`;
   if(n.start<start)body+=`<text class="staffContinuation" x="${xx-34}" y="${n.y+3}" font-size="12" fill="currentColor"><title>Note began before this window at ${n.start}ms</title>←</text>`;
   body+=`<circle class="staffOnsetMarker" cx="${n.onsetX}" cy="${n.y}" r="1.8" fill="currentColor"/>`;
   for(const yy of n.ledger)body+=`<line class="ledger" x1="${xx-10}" x2="${xx+10}" y1="${yy}" y2="${yy}" stroke="currentColor"/>`;
   body+=accidentalSVG(n.accidental,xx-17,n.y)+`<ellipse class="staffNoteHead" cx="${xx}" cy="${n.y}" rx="6" ry="4" transform="rotate(-15 ${xx} ${n.y})" fill="${active?'#8e2525':'currentColor'}"${active?' stroke="#8e2525" stroke-width="1.5"':''}/>`;
   if(names||n.voices.length>1)body+=`<text x="${xx+11}" y="${n.y+3}" font-size="10" font-family="system-ui,sans-serif" fill="currentColor">${names?esc(n.name):''}${n.voices.length>1?' ×'+n.voices.length:''}</text>`;
   body+='</g>';
  }
  if(finite(cursor)&&cursor>=start&&cursor<=end)body+=`<line class="staffTimelineCursor" x1="${x(cursor)}" x2="${x(cursor)}" y1="${minY+15}" y2="${maxY}" stroke="#8e2525" stroke-width="2"/>`;
  if(omitted)body+=`<text x="${left}" y="${minY+10}" font-size="10" font-family="system-ui,sans-serif" fill="currentColor">Dense window: ${omitted} more notes; zoom in.</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="phraseTimelineStaffSVG" data-time-start="${start}" data-time-end="${end}" data-time-left="${left}" data-time-right="${width-right}" style="min-height:${height}px;min-width:${maxX-minX}px" viewBox="${minX} ${minY} ${maxX-minX} ${height}" width="100%" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet"><title>${esc(label)}</title>${body}</svg>`;
 }
 return{pitch,staffPosition,staffSVG,prepareTimeline,controllerAt,rollSVG,timelineStaffSVG};
});
