// Local, conservative tempo suggestions from note attacks. Never quantizes notes,
// infers a meter/downbeat, or changes a chosen tempo without an explicit action.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.KeyMemoryTempo=api;})(typeof window==='undefined'?null:window,function(){
 'use strict';
 const MIN_BPM=30,MAX_BPM=300;
 const median=values=>{const ordered=[...values].sort((a,b)=>a-b),middle=Math.floor(ordered.length/2);return ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2;};
 function estimate(notes){
  const none=reason=>({bpm:null,alternatives:[],reason});
  if(!Array.isArray(notes)||notes.length>10000)return none('invalid');
  const starts=notes.map(n=>n?.start);
  if(starts.some(n=>!Number.isFinite(n)||n<0||n>120000))return none('invalid');
  starts.sort((a,b)=>a-b);
  // Nearby chord attacks count once. Anchor each cluster at its first attack,
  // rather than letting rolled chords chain together indefinitely.
  const onsets=[];for(const time of starts)if(!onsets.length||time-onsets.at(-1)>40)onsets.push(time);
  if(onsets.length<6||onsets.at(-1)-onsets[0]<2000)return none('short');
  const allGaps=onsets.slice(1).map((t,i)=>t-onsets[i]),usable=allGaps.filter(t=>t>=80&&t<=4000);
  if(usable.length<5||usable.length/allGaps.length<.65)return none('irregular');
  // Bound work for dense performances; sample across the whole phrase, not just
  // its opening. Tempo drift therefore lowers agreement instead of being hidden.
  const gaps=usable.length<=256?usable:Array.from({length:256},(_,i)=>usable[Math.floor(i*(usable.length-1)/255)]);
  const candidates=new Set();
  for(let bpm=MIN_BPM;bpm<=MAX_BPM;bpm+=.5)candidates.add(bpm);
  for(const gap of gaps)for(const multiple of [.5,1,1.5,2,3,4]){
   const bpm=60000*multiple/gap;if(bpm>=MIN_BPM&&bpm<=MAX_BPM)candidates.add(Math.round(bpm*100)/100);
  }
  function rate(bpm){
   const beat=60000/bpm,tolerance=12+beat*.045;let fit=0,covered=0,complexity=0;
   for(const gap of gaps){
    const multiple=Math.max(.5,Math.round(gap/beat*2)/2),error=Math.abs(gap-multiple*beat),good=Math.exp(-.5*(error/tolerance)**2);
    fit+=good;if(error<=tolerance*1.75)covered++;complexity+=(multiple<1?.4:Math.min(3,Math.log2(multiple)))+(multiple>1&&multiple%1?1:0);
   }
   fit/=gaps.length;covered/=gaps.length;const preference=Math.abs(Math.log2(bpm/110));
   return{bpm,fit,covered,score:fit-.07*complexity/gaps.length-.055*preference};
  }
  let best;for(const bpm of candidates){const candidate=rate(bpm);if(!best||candidate.score>best.score)best=candidate;}
  if(best.fit<.82||best.covered<.85)return none('irregular');
  // Refine from the median fitted period so slight expressive timing does not
  // turn into a visibly over-precise number. Report at most one decimal BPM.
  const beat=60000/best.bpm,periods=gaps.map(gap=>gap/Math.max(.5,Math.round(gap/beat*2)/2));
  const refined=rate(Math.max(MIN_BPM,Math.min(MAX_BPM,60000/median(periods))));
  if(refined.fit>=best.fit-.015&&refined.covered>=.85)best=refined;
  const bpm=Math.round(best.bpm*10)/10;
  // Even perfectly regular attacks cannot distinguish beats from subdivisions.
  // These are possible interpretations, not a probabilistic confidence claim.
  const alternatives=[bpm/2,bpm*2].filter(n=>n>=MIN_BPM&&n<=MAX_BPM).map(n=>Math.round(n*10)/10);
  return{bpm,alternatives,reason:'possible'};
 }
 function describe(result){
  if(!result)return 'Tempo suggestion unavailable. Set the source tempo or tap the beat.';
  if(!result.bpm)return result.reason==='short'?'Too few note starts or too short a phrase for a tempo suggestion. Set the source tempo or tap the beat.':result.reason==='invalid'?'Correct the note timing before suggesting a tempo.':'No steady tempo found in the note spacing. Try a longer, steadier phrase, or set/tap the tempo.';
  return 'Possible tempo: '+result.bpm+' quarter-note BPM. '+(result.alternatives.length?result.alternatives.join(' or ')+' BPM may also fit. ':'')+'Check by listening; meter is not detected.';
 }
 return{estimate,describe,MIN_BPM,MAX_BPM};
});
