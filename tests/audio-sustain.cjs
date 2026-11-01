// Deterministic WebAudio scheduling tests. Does not prove audible output on real hardware.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
function setup(){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{runScripts:'outside-only',url:'https://keymemory.test/'}),w=dom.window,d=w.document;
 w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}};
 let now=0,id=0;const timers=new Map(),resumes=[],oscillators=[],gains=[];
 w.Date.now=()=>now;w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};w.clearInterval=id=>timers.delete(id);
 function advance(ms){const end=now+ms;for(;;){const t=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!t)break;const [key,timer]=t;now=timer.time;if(timer.repeat)timer.time+=timer.repeat;else timers.delete(key);timer.fn();}now=end;}
 w.AudioContext=class{
  get currentTime(){return now/1000;} destination={};
  resume(){return new Promise((resolve,reject)=>resumes.push({resolve,reject}));}
  createOscillator(){const o={frequency:{value:0},starts:[],stops:[],connect(){},disconnect(){this.disconnected=true;},start(t){this.starts.push(t);},stop(t){this.stops.push(t);}};oscillators.push(o);return o;}
  createGain(){const events=[];const g={events,gain:{value:.04,setValueAtTime(v,t){events.push(['set',v,t]);},linearRampToValueAtTime(v,t){events.push(['ramp',v,t]);},cancelAndHoldAtTime(t){events.push(['hold',t]);}},connect(){},disconnect(){this.disconnected=true;}};gains.push(g);return g;}
 };
 w.eval(source+'\nwindow.audioTest={get:()=>({phase:builderPhase,target:targetMidi,deadline,countdown,notes:[...builderNotes],audioUntil:builderAudioUntil}),start:()=>{activateMode("builder");cancelChallenge();builderLesson=ALL_BUILDER_LESSONS.find(l=>l.id==="dominant7");builderRoot=48;builderTargets=[48,52,55,58];builderNotes=[48,52,55];builderStep=3;builderAdvancePending=false;showBuilderMilestone(false);},mode:activateMode};');
 const el=id=>d.getElementById(id),api=w.audioTest,get=()=>api.get(),timed=value=>{el('timerEnabled').checked=value;el('timerEnabled').dispatchEvent(new w.Event('change'));};
 const hear=()=>el('hearBuilder').click(),next=()=>el('nextChallenge').click(),press=m=>d.querySelector(`[data-midi="${m}"]`).click();
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 async function resolve(index=resumes.length-1){resumes[index].resolve();await flush();}
 async function reject(index=resumes.length-1){resumes[index].reject(new Error('resume rejected'));await flush();}
 return{w,d,el,api,get,timed,hear,next,press,advance,oscillators,gains,resumes,resolve,reject,close:()=>w.close(),now:()=>now};
}
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
(async()=>{
 let h=setup();h.api.start();h.timed(true);h.advance(3999);assert.equal(h.get().phase,'triad');h.advance(1);assert.equal(h.get().phase,'question');h.close();
 // Sustain holds its nonzero level through five seconds; then a short linear release.
 h=setup();h.api.start();h.timed(true);h.hear();await h.resolve();assert.equal(h.oscillators.length,3);assert.equal(h.get().audioUntil,5350);
 for(let i=0;i<3;i++){
  const o=h.oscillators[i],e=h.gains[i].events;near(o.frequency.value,440*2**(([48,52,55][i]-69)/12));assert.deepEqual(e,[['set',0,0],['ramp',.04,.03],['set',.04,5],['ramp',0,5.35]]);near(o.stops[0],5.37);assert.deepEqual(o.starts,[0]);
 }
 h.advance(4999);assert.equal(h.get().phase,'triad');h.advance(351);assert.equal(h.get().phase,'triad');h.advance(149);assert.equal(h.get().phase,'triad');h.advance(1);assert.equal(h.get().phase,'question');h.close();
 // Repeated Hear fades/stops all previous voices, then begins a fresh five-second sustain.
 h=setup();h.api.start();h.timed(true);h.hear();await h.resolve();h.advance(1000);h.hear();
 for(let i=0;i<3;i++){assert.deepEqual(h.gains[i].events.slice(-2),[['hold',1],['ramp',0,1.03]]);near(h.oscillators[i].stops.at(-1),1.04);}
 await h.resolve();assert.equal(h.oscillators.length,6);near(h.oscillators[3].stops[0],6.37);h.advance(5499);assert.equal(h.get().phase,'triad');h.advance(1);assert.equal(h.get().phase,'question');h.close();
 // Overlapping pending resumes: only the latest request may emit voices.
 h=setup();h.api.start();h.hear();h.hear();await h.resolve(1);assert.equal(h.oscillators.length,3);await h.resolve(0);assert.equal(h.oscillators.length,3);h.close();
 h=setup();h.api.start();h.hear();h.hear();await h.resolve(1);await h.reject(0);assert.equal(h.oscillators.length,3);assert(!h.el('builderHint').textContent.includes('unavailable'));h.close();
 // Rejected current resume preserves usable timed progression without silent deadlock.
 h=setup();h.api.start();h.timed(true);h.hear();await h.reject();assert.equal(h.oscillators.length,0);assert.match(h.el('achievementText').textContent,/unavailable/);h.advance(4000);assert.equal(h.get().phase,'question');h.close();
 // A delayed resume after navigation/next cannot start an obsolete chord.
 for(const action of ['mode','next']){h=setup();h.api.start();h.hear();if(action==='mode')h.api.mode('free');else h.next();await h.resolve();assert.equal(h.oscillators.length,0);h.close();}
 // Explicit navigation and manual next cancel sustained voices promptly, not five seconds later.
 for(const action of ['mode','next']){h=setup();h.api.start();h.hear();await h.resolve();h.advance(250);if(action==='mode')h.api.mode('free');else h.next();for(const o of h.oscillators)near(o.stops.at(-1),.29);for(const g of h.gains)assert.deepEqual(g.events.slice(-2),[['hold',.25],['ramp',0,.28]]);assert.equal(h.get().audioUntil,0);h.close();}
 // Timer toggles respect the remaining sustain; switching off does not cancel success progression.
 h=setup();h.api.start();h.timed(true);h.hear();await h.resolve();h.advance(1000);h.timed(false);h.advance(1000);h.timed(true);h.advance(3499);assert.equal(h.get().phase,'triad');h.advance(1);assert.equal(h.get().phase,'question');h.close();
 h=setup();h.api.start();h.timed(true);h.hear();await h.resolve();h.timed(false);h.advance(5499);assert.equal(h.get().phase,'triad');h.advance(1);assert.equal(h.get().phase,'question');h.close();
 // Final-chord playback holds completion as well, and reports after-playback progression.
 h=setup();h.api.start();h.next();h.press(58);h.timed(true);h.hear();await h.resolve();assert.equal(h.oscillators.length,4);assert.match(h.el('trainingPrompt').textContent,/after playback/);h.timed(false);h.timed(true);assert.match(h.el('trainingPrompt').textContent,/after playback/);h.advance(5499);assert.equal(h.get().phase,'complete');h.advance(1);assert.equal(h.get().phase,'question');h.close();
 // Hear during a live question must not grant extra answering time.
 h=setup();h.api.start();h.next();h.timed(true);const deadline=h.get().deadline,countdown=h.get().countdown;h.advance(1000);h.hear();await h.resolve();assert.equal(h.get().deadline,deadline);assert.equal(h.get().countdown,countdown);h.advance(9000);assert.equal(h.get().target,null);assert.match(h.el('trainingPrompt').textContent,/Time is up/);h.close();
 // The old fakeAudioContext used by builder-lessons omits cancelAndHold; fallback stays safe.
 h=setup();h.api.start();h.hear();await h.resolve();for(const g of h.gains)delete g.gain.cancelAndHoldAtTime;h.next();for(const o of h.oscillators)near(o.stops.at(-1),.04);h.close();
 // Static cascade guard: redesigned base/mobile/landscape padding keeps all four insets.
 const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');const redesigned=css.slice(css.indexOf('.shell { padding:max('));
 for(const selector of ['shell','modalOverlay']){const blocks=[...redesigned.matchAll(new RegExp('\\.'+selector+'\\s*\\{([^}]+)','g'))];assert(blocks.length>=3,selector+' base/mobile/landscape');for(const [,block] of blocks){if(!block.includes('padding:'))continue;for(const edge of ['top','right','bottom','left'])assert(block.includes('env(safe-area-inset-'+edge+')'),selector+' '+edge);}}
 console.log('PASS: five-second gain sustain + .35s release; 3/4-note pitches; ordinary4s vs playback5.5s auto-next; repeated Hear cancellation; stale/failed resumes; mode/manual-next cancellation; timer toggles; active-question deadline; fallback envelope cancellation; static four-edge safe-area cascade. Scheduling/static checks only, not real audio/notch QA.');
})().catch(error=>{console.error(error);process.exitCode=1;});
