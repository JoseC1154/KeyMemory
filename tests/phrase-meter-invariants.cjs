// Independent metrical-clock oracle. Exact-source events, not quantized note tests.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../phrase.js'),'utf8');
const rounded=n=>Math.round(n*1e6)/1e6;
function harness(options){
 let time=0,id=0;const timers=new Map(),beats=[],sounds=[];
 const w={window:{}};vm.runInNewContext(code,w);
 const e=w.window.KeyMemoryPhrase.create({storage:null,now:()=>time,setTimer:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},clearTimer:i=>timers.delete(i),onBeat:b=>beats.push({...b}),onSound:(note,velocity,duration,at)=>sounds.push({note,duration,at})});
 assert(e.importPhrase({sourceBpm:120,duration:120000,notes:[{note:60,velocity:90,channel:0,start:0,duration:120000}]}));
 assert(e.setOptions(options));
 function advance(end){for(let n=0;;n++){assert(n<100000,'bounded scheduling');const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const[k,v]=next;timers.delete(k);time=v.at;v.fn();}time=end;}
 return{e,beats,sounds,timers,advance};
}
let cases=0;
for(const [numerator,denominator]of [[4,4],[3,4],[6,8],[9,8],[12,8],[5,8],[2,2],[7,16]]){
 for(const [sourceBpm,playBpm]of [[120,120],[137,61],[73,251]]){
  for(const start of [0,137.125,813.75]){
   const pulseUnits=denominator===8&&[6,9,12].includes(numerator)?3:1;
   const sourcePulse=60000/sourceBpm*4/denominator*pulseUnits;
   const sourceBar=60000/sourceBpm*4/denominator*numerator;
   const origin=213.375,sourceLength=sourceBar*1.35,scale=sourceBpm/playBpm;
   const countInBars=cases%3,countMs=countInBars*sourceBar*scale;
   const sectionEnd=start+sourceLength,length=sourceLength*scale;
   const h=harness({meterNumerator:numerator,meterDenominator:denominator,sourceBpm,playBpm,gridOriginMs:origin,countInBars,sectionStart:start,sectionEnd});
   const unchanged=JSON.stringify(h.e.snapshot().notes);assert(h.e.play({loop:true}));
   const end=countMs+length*3-.001;h.advance(end);
   const expected=[];
   // Enumerate musical source positions independently, then transform to wall time.
   for(let k=-500;k<1000;k++){
    const source=origin+k*sourcePulse;
    const phase=((k%(numerator/pulseUnits))+numerator/pulseUnits)%(numerator/pulseUnits);
    const at=countMs+(source-start)*scale;
    if(at>=-1e-7&&at<countMs-1e-7)expected.push({at:rounded(at),beat:phase+1,accent:phase===0,countIn:true});
    if(source>=start-1e-7&&source<sectionEnd-1e-7)for(let pass=0;pass<3;pass++){
     const eventAt=countMs+pass*length+(source-start)*scale;
     if(eventAt<=end+1e-7)expected.push({at:rounded(eventAt),beat:phase+1,accent:phase===0,countIn:false});
    }
   }
   expected.sort((a,b)=>a.at-b.at);
   const actual=h.beats.filter(b=>b.at<=end+1e-7).map(({at,beat,accent,countIn})=>({at:rounded(at),beat,accent,countIn}));
   assert.deepEqual(actual,expected,JSON.stringify({numerator,denominator,sourceBpm,playBpm,start,countInBars}));
   assert.equal(new Set(actual.map(b=>b.at)).size,actual.length,'no duplicate seam clicks');
   assert.equal(JSON.stringify(h.e.snapshot().notes),unchanged);
   h.e.stop();assert.equal(h.timers.size,0);cases++;
  }
 }
}
console.log(`PASS: independent source-grid oracle across ${cases} meter/rate/section/count-in combinations and three passes, fractional offsets, accents, source immutability and cancellation.`);
