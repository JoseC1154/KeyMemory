// DOM behavior only: does not measure actual CSS geometry or touch usability.
const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{pretendToBeVisual:true,runScripts:'outside-only',url:'https://keymemory.test/'}),w=dom.window,d=w.document;
w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}};
let now=0,id=0;const timers=new Map();
w.Date.now=()=>now;w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=(fn,ms)=>{timers.set(++id,{fn,time:now+ms,repeat:ms});return id;};w.clearInterval=id=>timers.delete(id);
function advance(ms){const end=now+ms;for(;;){const t=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!t)break;const [key,timer]=t;now=timer.time;if(timer.repeat)timer.time+=timer.repeat;else timers.delete(key);timer.fn();}now=end;}
w.eval(fs.readFileSync(path.join(root,'phrase.js'),'utf8'));
w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.activateMode=activateMode;window.setGeometryMidi=connected=>{midiController=connected?{isConnected:()=>true,resetQuestion(){}}:null;renderPiano();};window.redrawGeometry=renderPiano;window.snapshot=()=>({activeMode,targetMidi,builderPhase,builderStep,notes:[...builderNotes],selected:[...selected],deadline,countdown,prompt:trainingPrompt.textContent,dictionaryPractice,dictionaryVoicing:[...dictionaryVoicing]});');
const el=id=>d.getElementById(id),s=()=>w.snapshot(),shell=d.querySelector('.shell');
const change=(id,value)=>{el(id).value=value;el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
const keyboard=(key,shiftKey=false)=>d.dispatchEvent(new w.KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true}));
const open=(id)=>{el(id).focus();el(id).click();};
const press=m=>d.querySelector(`[data-midi="${m}"]`).click();
const ids=[...d.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length,'unique IDs');
assert.equal(d.querySelectorAll('.startMode').length,9);assert(!el('dictionaryExpand'));
for(const id of ['modeOverlay','settingsOverlay','hintOverlay']){assert(!shell.contains(el(id)));assert.equal(el(id).getAttribute('role'),'dialog');assert.equal(el(id).getAttribute('aria-modal'),'true');assert(el(id).hidden);}
for(const id of ['builderControls','timerControls','semitoneControls','buildVersion'])assert(el('settingsOverlay').contains(el(id)),id+' belongs in settings');
for(const id of ['hearBuilder','dictionaryActions','dictionaryControls','nextChallenge','trainingPrompt'])assert(shell.contains(el(id)),id+' remains in practice');
assert.match(el('settingsOverlay').textContent,/Changes apply immediately/);
// CSS contract: only the pre-run dialog overrides the narrow-screen bottom sheet.
// Actual viewport geometry is independently checked in a real browser.
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
assert.match(css,/\.scaleReverseMode \.info,\.scaleReverseMode \.pianoHint,\.scaleReverseMode \.achievement\{display:none\}/,'reverse feedback uses the primary question and circle, not a duplicate error slab');
const runOverlayRule=css.match(/#scaleRunOverlay,#scaleDegreeOverlay,#modeOverlay,#scalePauseOverlay\{([^}]+)\}/)[1];
assert.match(runOverlayRule,/align-items:center/);assert.match(runOverlayRule,/justify-content:center/);
assert.match(runOverlayRule,/height:100%;height:100dvh/);assert.match(runOverlayRule,/bottom:auto/);
assert.match(runOverlayRule,/box-sizing:border-box/);
assert.match(css,/#scaleRunOverlay \.scaleRunPanel,#scaleDegreeOverlay \.scaleRunPanel,#modeOverlay \.modalPanel,#scalePauseOverlay \.modalPanel\{min-height:0;max-height:100%;overflow-y:auto\}/);
assert.match(css,/\.modalOverlay \{ align-items:flex-end; padding:max\(6px,env\(safe-area-inset-top\)\)/);
assert.equal(el('scaleRunOverlay').getAttribute('role'),'dialog');
assert(el('scaleRunOverlay').querySelector('.scaleRunPanel'));
// Every compact menu item navigates, closes the modal, clears inert and returns focus.
for(const mode of ['free','find','remember','semitones','degrees','builder','dictionary','phrase']){
 open('openModes');assert.equal(el('modeOverlay').hidden,false);assert.equal(shell.inert,true);assert.equal(d.activeElement,el('closeModes'));
 d.querySelector(`.startMode[data-mode="${mode}"]`).click();assert.equal(s().activeMode,mode);assert(el('modeOverlay').hidden);assert.equal(shell.inert,false);assert.equal(d.activeElement,el('openModes'));
 assert.equal(el('timerControls').hidden,mode==='free'||mode==='phrase');assert.equal(el('builderControls').hidden,mode!=='builder');assert.equal(el('dictionaryControls').hidden,mode!=='dictionary');assert.equal(el('semitoneControls').hidden,mode!=='semitones');assert.equal(el('dictionaryActions').hidden,mode!=='dictionary');
 assert.equal(d.querySelectorAll('.startMode[aria-current="true"]').length,1);assert.equal(d.querySelector('.startMode[aria-current="true"]').dataset.mode,mode);
}
// Open/Done/Escape/backdrop are not lesson-reset operations and do not pause clocks.
w.activateMode('builder');el('timerEnabled').checked=true;el('timerEnabled').dispatchEvent(new w.Event('change',{bubbles:true}));
let before=s();press(48);assert(d.querySelector('[data-midi="48"]').classList.contains('wrongAnswer'));
for(const exit of ['done','escape','backdrop']){
 open('openSettings');assert.equal(d.activeElement,el('closeSettings'));assert.equal(shell.inert,true);assert.equal(el('openSettings').getAttribute('aria-expanded'),'true');
 advance(100);assert.equal(s().deadline,before.deadline);assert.equal(s().countdown,before.countdown);assert.equal(s().targetMidi,before.targetMidi);assert.equal(s().prompt,before.prompt);
 if(exit==='done')el('closeSettings').click();else if(exit==='escape')keyboard('Escape');else el('settingsOverlay').click();
 assert(el('settingsOverlay').hidden);assert.equal(shell.inert,false);assert.equal(d.activeElement,el('openSettings'));assert.equal(el('openSettings').getAttribute('aria-expanded'),'false');
}
assert(d.querySelector('[data-midi="48"]').classList.contains('wrongAnswer'));advance(650);assert(!d.querySelector('[data-midi="48"]').classList.contains('wrongAnswer'));assert.equal(s().targetMidi,before.targetMidi);
// Dialog interiors never count as backdrop clicks. Focus trap wraps visible controls.
open('openSettings');el('settingsOverlay').querySelector('.modalPanel').click();assert(!el('settingsOverlay').hidden);
el('closeSettings').focus();keyboard('Tab',true);assert.equal(d.activeElement,el('connectMidi'));keyboard('Tab');assert.equal(d.activeElement,el('closeSettings'));
change('builderSelection','custom');el('builderTypes').open=true;const lastInput=el('builderTypes').querySelector('label:last-child input');assert(lastInput);el('connectMidi').focus();keyboard('Tab');assert.equal(d.activeElement,el('closeSettings'));keyboard('Tab',true);assert.equal(d.activeElement,el('connectMidi'));
// Immediate settings changes take effect in place; closing does not roll them back.
change('builderLevel','extended');assert.equal(s().notes.length,1);assert.match(el('practiceSummary').textContent,/Level 4/);assert(s().targetMidi!==null);
change('builderSelection','random');change('timerDuration','15');assert.equal(s().deadline,now+15000);const afterSetting=s();el('closeSettings').click();assert.equal(s().targetMidi,afterSetting.targetMidi);assert.equal(s().deadline,afterSetting.deadline);
// Hints preserve completed notes and lesson state; focus returns via Escape.
press(s().targetMidi);advance(1800);press(s().targetMidi);assert.equal(s().notes.length,3);before=s();assert(!el('hearBuilder').hidden);
open('openHint');assert(!el('hintOverlay').hidden);assert.equal(el('builderHint').hidden,false);assert.equal(el('dictionaryNotes').hidden,true);advance(100);keyboard('Escape');assert.equal(d.activeElement,el('openHint'));assert.deepEqual(Array.from(s().notes),Array.from(before.notes));assert.equal(s().builderPhase,before.builderPhase);assert.equal(s().targetMidi,before.targetMidi);
// Timer countdown is visible inside an open sheet and runs through timeout fairly.
w.activateMode('find');before=s();open('openSettings');advance(1000);const mirrored=[...d.querySelectorAll('.countdownMirror')].map(e=>e.textContent);assert(mirrored.every(text=>text===el('timerRemaining').textContent));assert.equal(s().deadline,before.deadline);advance(14000);assert.match(el('trainingPrompt').textContent,/Time is up/);el('closeSettings').click();assert.equal(s().targetMidi,null);
// Explicit navigation cancels prior callbacks; simply inspecting modes does not.
w.activateMode('builder');before=s();open('openModes');advance(100);keyboard('Escape');assert.equal(s().targetMidi,before.targetMidi);assert.equal(s().deadline,before.deadline);
open('openModes');d.querySelector('[data-mode="dictionary"]').click();advance(2000);assert.equal(s().activeMode,'dictionary');
assert(!el('settingsOverlay').contains(el('dictionaryControls')));assert(el('settingsOverlay').hidden);
for(const id of ['timerControls','midiInput'])assert(el('settingsOverlay').contains(el(id)));
change('dictionaryRoot','2');change('dictionaryQuality','minor');assert.deepEqual(Array.from(s().dictionaryVoicing),[50,53,57]);assert(el('settingsOverlay').hidden);assert.equal(el('practiceSummary').textContent,'');
change('dictionaryRoot','0');change('dictionaryQuality','major');change('dictionaryInversion','1');assert.deepEqual(Array.from(s().dictionaryVoicing),[52,55,60]);assert(!el('openHint').hidden);
open('openHint');assert.equal(el('dictionaryNotes').hidden,false);assert.equal(el('builderHint').hidden,true);el('hintOverlay').click();assert.equal(d.activeElement,el('openHint'));
el('toggleChordNotes').click();assert(el('openHint').hidden,'dictionary practice hides answer hint');press(52);before=s();open('openSettings');el('closeSettings').click();assert.deepEqual(Array.from(s().selected),[52]);assert.equal(s().deadline,before.deadline);
open('openModes');d.querySelector('[data-mode="free"]').click();assert.equal(shell.inert,false);assert.equal(el('hearBuilder').hidden,false);assert(el('hearBuilder').disabled);assert(el('dictionaryActions').hidden);press(48);advance(20000);assert.equal(s().activeMode,'free');assert.deepEqual(Array.from(s().selected),[48]);
// Simulated CSS arithmetic for the compact touch octave; actual hit targets/layout
// are checked independently in the browser, not claimed from jsdom.
const piano=el('piano'),container=piano.parentElement;
let geometryWidth=400,landscape=false;
Object.defineProperty(container,'clientWidth',{configurable:true,get:()=>geometryWidth});
w.matchMedia=query=>({matches:query.includes('max-height')?landscape:geometryWidth<=600&&!landscape});
const blackPC=new Set([1,3,6,8,10]);
for(const width of [280,333,400,600,843,900])for(const orientation of [false,true]){
 geometryWidth=width;landscape=orientation;w.activateMode('scale');
 for(let root=0;root<12;root++){
  change('scaleRoot',String(root));w.redrawGeometry();
  const keys=[...piano.querySelectorAll('.key')],base=48+root,low=base-(blackPC.has((base-2)%12)?3:2),high=base+12+(blackPC.has((base+14)%12)?3:2);
  assert([2,3].includes(base-low));assert([2,3].includes(high-base-12));assert(!blackPC.has(low%12));assert(!blackPC.has(high%12));
  assert(keys.length>=17&&keys.length<=19);assert.deepEqual(keys.map(k=>+k.dataset.midi).sort((a,b)=>a-b),Array.from({length:high-low+1},(_,i)=>low+i));
  assert(piano.querySelector('[data-midi="'+low+'"]').classList.contains('white'));assert(piano.querySelector('[data-midi="'+high+'"]').classList.contains('white'));
  assert(piano.classList.contains('compactScalePiano'));
  assert(Math.abs(parseFloat(piano.style.width)-width)<.01,'compact octave fits available width');
  const ww=parseFloat(d.documentElement.style.getPropertyValue('--white-w')),bw=parseFloat(d.documentElement.style.getPropertyValue('--black-w')),pad=parseFloat(piano.style.paddingLeft);
  assert(ww>=20,'white targets retain usable width in narrow geometry');
  let whites=0;
  for(let n=low;n<=high;n++){
   const key=piano.querySelector('[data-midi="'+n+'"]');assert(key.querySelector('.noteLabel').textContent.includes(String(Math.floor(n/12)-1)));
   if(blackPC.has(n%12)){
    const left=parseFloat(key.style.left),expected=pad+(whites-1)*(ww+2)+ww-bw/2;
    assert(Math.abs(left-expected)<.01);assert(left>=0&&left+bw<=width,'full black endpoint stays inside piano');
   }else{assert(pad+whites*(ww+2)+ww<=width+.01);whites++;}
  }
  assert.equal(container.scrollLeft,0);
 }
 const beforeGeometry=s();w.setGeometryMidi(true);assert(!piano.classList.contains('compactScalePiano'));assert(piano.querySelectorAll('.key').length>13);assert.equal(s().deadline,beforeGeometry.deadline);assert.equal(s().targetMidi,beforeGeometry.targetMidi);
 w.setGeometryMidi(false);assert(piano.classList.contains('compactScalePiano'));assert(piano.querySelectorAll('.key').length>=17&&piano.querySelectorAll('.key').length<=19);
}
geometryWidth=1180;w.redrawGeometry();assert(!piano.classList.contains('compactScalePiano'));assert(piano.querySelectorAll('.key').length>13);
geometryWidth=400;w.activateMode('free');assert(!piano.classList.contains('compactScalePiano'));assert(piano.querySelectorAll('.key').length>13);assert.equal(piano.style.paddingLeft,'');
console.log('PASS: unique IDs; 9 compact modes; contextual settings; immediate changes; modal Done/Escape/backdrop/focus trap/inert/focus return; preserved question/red feedback/notes/deadlines; countdown mirrors and timeout; hint isolation; settings/navigation interruption. DOM only, not visual or touch QA.');w.close();
