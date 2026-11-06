// Read-only Live Score integration using persisted fixtures and simulated DOM/MIDI/audio.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),flush=()=>new Promise(r=>setImmediate(r));
function setup(saved,prefs){
 const w=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{pretendToBeVisual:true,runScripts:'outside-only',url:'https://keymemory.test/'}).window,d=w.document;
 w.confirm=()=>true;w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}};Object.defineProperty(w,'isSecureContext',{value:true});
 if(prefs!==undefined)w.localStorage.setItem('keymemory.phrase.view',prefs);
 if(saved)w.localStorage.setItem('keymemory.phrase.v1',saved);
 let now=1000,id=0,defer=false;const resumes=[];const timers=new Map(),sounds=[],controls=[],oscillators=[];let engine;
 w.Date.now=()=>now;w.performance.now=()=>now;
 w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};w.clearInterval=id=>timers.delete(id);
 function advance(ms){const end=now+ms;for(;;){const t=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!t)break;const[k,v]=t;now=v.time;if(v.repeat)v.time+=v.repeat;else timers.delete(k);v.fn();}now=end;}
 const port={id:'yc',name:'YC Series Port 1',state:'connected',onmidimessage:null,open(){return Promise.resolve();},close(){return Promise.resolve();}},access={inputs:new Map([['yc',port]]),onstatechange:null};
 w.navigator.requestMIDIAccess=()=>Promise.resolve(access);
 w.AudioContext=class{state='running';get currentTime(){return now/1000;}destination={};resume(){return defer?new Promise(resolve=>resumes.push(resolve)):Promise.resolve();}createOscillator(){const o={frequency:{value:0},stops:[],connect(){},disconnect(){},start(){},stop(t){this.stops.push(t);}};oscillators.push(o);return o;}createGain(){return{gain:{value:.05,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};}};
 w.eval(fs.readFileSync(path.join(root,'phrase-view.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'midi.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'phrase.js'),'utf8'));
 const create=w.KeyMemoryPhrase.create;w.KeyMemoryPhrase.create=config=>{engine=create({...config,onSound:(...args)=>{sounds.push(args);config.onSound?.(...args);},onControl:(...args)=>{controls.push(args);config.onControl?.(...args);}});return engine;};
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.phraseTest={mode:activateMode,render:renderPiano,get:()=>({activeMode,targetMidi,selected:[...selected]})};');
 const el=id=>d.getElementById(id),click=id=>el(id).click(),change=(id,value)=>{el(id).value=String(value);el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const send=(note,velocity=100,channel=0,kind=0x90,timeStamp=now)=>port.onmidimessage?.({data:new Uint8Array([kind|channel,note,velocity]),timeStamp}),off=(note,channel=0)=>send(note,0,channel,0x80);
 async function connect(){click('connectMidi');await flush();}
 return{w,d,el,click,change,send,off,advance,connect,port,access,sounds,controls,oscillators,resumes,defer:value=>{defer=value;},cc:(controller,value,channel=0)=>send(controller,value,channel,0xb0),mode:m=>w.phraseTest.mode(m),get:()=>w.phraseTest.get(),snapshot:()=>engine.snapshot(),transportTimers:()=>[...timers].filter(([,v])=>v.fn.name!=='renderPhraseView').map(([id,v])=>({id,time:v.time,repeat:v.repeat})),now:()=>now,close:()=>w.close()};
}
async function beginPlay(h){
 h.click('phrasePlay');await flush();if(h.snapshot().state!=='play-countin')return;
 const beat=60000/h.snapshot().options.playBpm;
 // Section count-ins preserve source beat phase; duration remains one 4/4 bar.
 h.advance(4*beat);assert.equal(h.snapshot().state,'playing');
}
// Independent cursor regressions. Browser geometry is injected explicitly because jsdom has no SVG layout.
const fixture={version:2,sourceBpm:120,duration:12000,notes:[
 {note:60,velocity:90,channel:0,start:0,duration:500},
 {note:61,velocity:90,channel:0,start:0,duration:1000},
 {note:64,velocity:90,channel:0,start:0,duration:9000},
 {note:84,velocity:90,channel:1,start:250,duration:1000},
 {note:67,velocity:90,channel:1,start:8000,duration:1000}],
 controllers:[{controller:64,value:127,channel:0,time:100},{controller:64,value:0,channel:0,time:1800}],initialControllers:Array.from({length:16},(_,channel)=>[7,11,64].map(controller=>({channel,controller,value:controller===7?100:controller===11?127:0}))).flat()};
const cases=[],test=(name,fn)=>cases.push([name,fn]),near=(a,b,label='exact time')=>assert(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
function ready(){const h=setup(JSON.stringify(fixture));h.w.innerWidth=1280;h.w.innerHeight=900;h.mode('phrase');return h;}
function svg(h){return h.el('phraseStaff').querySelector('.phraseTimelineStaffSVG');}
function time(h){return Number(h.el('phraseViewTime').value)*1000;}
function key(h,key,mods={}){h.el('phraseStaff').dispatchEvent(new h.w.KeyboardEvent('keydown',{key,...mods,bubbles:true,cancelable:true}));}
function input(h,t){h.el('phraseViewTime').value=String(t/1000);h.el('phraseViewTime').dispatchEvent(new h.w.Event('input',{bubbles:true}));}
function unitX(s,t){return +s.dataset.timeLeft+(t- +s.dataset.timeStart)/(+s.dataset.timeEnd- +s.dataset.timeStart)*(+s.dataset.timeRight- +s.dataset.timeLeft);}
function matrix(h,m={a:1,b:0,c:0,d:1,e:20,f:10}){const s=svg(h);s.getScreenCTM=()=>m;return(sx,sy=80)=>({clientX:m.a*sx+m.c*sy+m.e,clientY:m.b*sx+m.d*sy+m.f});}
function click(h,target,point,detail=1){target.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,...point,detail}));}
function clickTime(h,t,selector){const s=svg(h),point=matrix(h)(unitX(s,t));click(h,selector?s.querySelector(selector):s,point);}
function pointer(h,type,point,extra={}){const e=new h.w.Event(type,{bubbles:true,cancelable:true});for(const[k,v]of Object.entries({button:0,pointerId:1,pointerType:'mouse',isPrimary:true,...point,...extra}))Object.defineProperty(e,k,{value:v});h.el('phraseStaff').dispatchEvent(e);return e;}
function withReady(fn){const h=ready();try{fn(h);}finally{h.close();}}
test('same fractional x on background, notehead, label, ledger and accidental never snaps',()=>withReady(h=>{
 const raw=JSON.stringify(h.snapshot().notes),stored=h.w.localStorage.getItem('keymemory.phrase.v1');
 for(const selector of [null,'.staffNoteHead','.staffNoteLabel','.ledger','.staffTimelineNote path']){clickTime(h,2345.6789,selector);near(time(h),2345.6789);near(+svg(h).dataset.timeStart,0);near(+svg(h).querySelector('.staffTimelineCursor').getAttribute('x1'),unitX(svg(h),2345.6789));}
 const fixedPoint=matrix(h)(unitX(svg(h),4567.891));for(let i=0;i<3;i++){matrix(h);click(h,svg(h),fixedPoint);near(time(h),4567.891);near(+svg(h).dataset.timeStart,0);}
 assert.equal(JSON.stringify(h.snapshot().notes),raw);assert.equal(h.w.localStorage.getItem('keymemory.phrase.v1'),stored);assert.equal(h.sounds.length,0);
}));
test('inverse affine CTM handles translation, nonuniform scaling, shear and nonzero window',()=>withReady(h=>{
 input(h,10000);assert(+svg(h).dataset.timeStart>0);const s=svg(h),point=matrix(h,{a:1.4,b:.3,c:.2,d:1.8,e:-240,f:75})(unitX(s,8765.4321),123);click(h,s,point);near(time(h),8765.4321);near(+svg(h).dataset.timeStart,6000);
}));
test('null CTM fallback handles letterboxing, expanded viewBox and scrolled bounds',()=>withReady(h=>{
 for(const aspect of ['xMidYMid meet','xMinYMin meet','xMaxYMax meet','xMidYMid slice','none']){
  const s=svg(h),vb=[-180,-40,1200,300],b={left:-270,top:60,width:1000,height:180};s.setAttribute('viewBox',vb.join(' '));s.setAttribute('preserveAspectRatio',aspect);s.getScreenCTM=()=>null;s.getBoundingClientRect=()=>b;
  let scale=b.width/vb[2],off=0;if(aspect!=='none'){scale=(aspect.includes('slice')?Math.max:Math.min)(b.width/vb[2],b.height/vb[3]);off=(b.width-vb[2]*scale)*(aspect.includes('xMin')?0:aspect.includes('xMax')?1:.5);}
  click(h,s,{clientX:b.left+off+(unitX(s,3210.987)-vb[0])*scale,clientY:100});near(time(h),3210.987,aspect);
 }
 const s=svg(h);s.getScreenCTM=()=>({a:1,b:1,c:1,d:1,e:0,f:0});click(h,s,{clientX:500,clientY:100});near(time(h),3210.987,'degenerate CTM ignored');
 s.getScreenCTM=()=>null;s.getBoundingClientRect=()=>({width:0,height:0,left:0});click(h,s,{clientX:500,clientY:100});near(time(h),3210.987,'zero-size fallback ignored');
}));
test('mouse drag survives SVG replacement, uses captured mapping and suppresses duplicate click',()=>withReady(h=>{
 const staff=h.el('phraseStaff'),s=svg(h),map=matrix(h),p1=map(unitX(s,1234.567)),p2=map(unitX(s,4321.987));let capture;
 staff.setPointerCapture=id=>capture=id;assert(pointer(h,'pointerdown',p1).defaultPrevented);near(time(h),1234.567);assert.equal(capture,1);assert.notEqual(svg(h),s);
 pointer(h,'pointermove',p2);near(time(h),4321.987);pointer(h,'pointerup',p2);click(h,svg(h),{clientX:9999,clientY:100});near(time(h),4321.987);
 const map2=matrix(h),p3=map2(unitX(svg(h),2500));pointer(h,'pointerdown',p3);pointer(h,'pointercancel',p3);pointer(h,'pointermove',p1);near(time(h),2500);
}));
test('touch leaves native scrolling intact, cancelled touch does not seek, completed tap does',()=>withReady(h=>{
 const s=svg(h),p=matrix(h)(unitX(s,3456.789));const down=pointer(h,'pointerdown',p,{pointerType:'touch'});assert(!down.defaultPrevented);pointer(h,'pointermove',p,{pointerType:'touch'});pointer(h,'pointercancel',p,{pointerType:'touch'});near(time(h),0);
 h.el('phraseStaff').dispatchEvent(new h.w.Event('scroll'));near(time(h),0);click(h,s,p);near(time(h),3456.789);
 click(h,svg(h),{clientX:0,clientY:0},0);near(time(h),3456.789,'AT activation keeps current time');
}));
test('keyboard supports 1ms Alt, 100ms default, 1s Shift and phrase boundaries',()=>withReady(h=>{
 key(h,'ArrowRight',{altKey:true});near(time(h),1);key(h,'ArrowRight');near(time(h),101);key(h,'ArrowUp',{shiftKey:true});near(time(h),1101);key(h,'ArrowDown',{altKey:true});near(time(h),1100);key(h,'Home');key(h,'ArrowLeft');near(time(h),0);key(h,'End');key(h,'ArrowRight');near(time(h),12000);assert(+svg(h).dataset.timeStart>0);key(h,'Home');near(+svg(h).dataset.timeStart,0);
}));
test('tempo preserves source time, zoom resets window, example resets source and inspection stays silent',()=>withReady(h=>{
 clickTime(h,3456.789);const raw=JSON.stringify(h.snapshot().notes),controllers=JSON.stringify(h.snapshot().controllers);h.change('phrasePlayBpm',60);near(time(h),3456.789);clickTime(h,4567.891);near(time(h),4567.891);
 h.change('phraseViewWindow',250);const s=svg(h),start=+s.dataset.timeStart,end=+s.dataset.timeEnd;near(end-start,250);clickTime(h,start+123.456);near(time(h),start+123.456);near(+svg(h).dataset.timeStart,start);
 h.click('phraseViewExample');near(time(h),0);near(+svg(h).dataset.timeStart,0);h.click('phraseViewExample');near(time(h),0);assert.equal(JSON.stringify(h.snapshot().notes),raw);assert.equal(JSON.stringify(h.snapshot().controllers),controllers);assert.equal(h.sounds.length,0);
}));
test('exact boundaries preserve held versus pedal-only highlighting without sounding notes',()=>withReady(h=>{
 const has=(selector,note)=>!!h.d.querySelector(`${selector}[data-midi="${note}"]`);
 clickTime(h,499.999);assert(has('.key.phraseInspectKey',60));assert(has('.staffSelectedKey',60));
 input(h,500);assert(!has('.key.phraseInspectKey',60));assert(has('.key.phraseInspectTail',60));assert(has('.staffSelectedTail',60));
 input(h,1800);assert(!has('.key.phraseInspectTail',60));assert(!has('.staffSelectedTail',60));assert(has('.key.phraseInspectKey',64));
 input(h,9000);assert(!has('.key.phraseInspectKey',64));assert.equal(h.sounds.length,0);
}));
test('renderer keeps chord heads on onset and continuation geometry stable across cursor and cap',()=>{
 const view=require('../phrase-view.js'),notes=Array.from({length:500},(_,i)=>({note:48+i%36,start:i<40?0:300+(i%3)*50,duration:1000+i%5*500,channel:i%16})),model=view.prepareTimeline({duration:6000,notes});
 for(const width of [240,800])for(const names of [true,false]){
  const docs=[500,1500,4500].map(cursor=>new JSDOM(view.timelineStaffSVG(model,{start:500,end:5000,cursor,width,names,inspecting:true,maxNotes:400}),{contentType:'image/svg+xml'}));
  const geom=d=>[d.window.document.documentElement.getAttribute('viewBox'),...[...d.window.document.querySelectorAll('.staffTimelineNote')].map(g=>[g.dataset.noteId,g.querySelector('.staffNoteHead').getAttribute('cx'),g.querySelector('.staffNoteHead').getAttribute('cy')].join(':'))];
  const before=new JSDOM(view.timelineStaffSVG(model,{start:500,end:5000,cursor:500,width,names,includeContinuations:true,maxNotes:400}),{contentType:'image/svg+xml'});assert.deepEqual(geom(before),geom(docs[0]),'entering inspection does not change geometry');before.window.close();
  for(const d of docs){for(const g of d.window.document.querySelectorAll('.staffTimelineNote'))near(+g.querySelector('.staffNoteHead').getAttribute('cx'),+g.dataset.onsetX);assert(d.window.document.querySelectorAll('.staffTimelineNote').length<=400);assert.deepEqual(geom(d),geom(docs[0]));}
  assert(docs[0].window.document.querySelector('.staffSelectedKey'));assert.equal(docs[2].window.document.querySelectorAll('.staffSelectedKey').length,0);for(const d of docs)d.window.close();
 }
});
(async()=>{let failures=0;for(const[name,fn]of cases){try{await fn();console.log('PASS:',name);}catch(e){failures++;console.error('FAIL:',name,e);}}if(failures)process.exitCode=1;else console.log('PASS: all precise staff cursor regressions. Synthetic DOM geometry only.');})();
