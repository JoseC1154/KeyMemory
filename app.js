// FILE: app.js
"use strict";

// The design and key proportions are adapted from KeyTransposer.
// Unlike KeyTransposer, KeyMemory only renders a screen-fitting range.
const piano = document.getElementById("piano");
const rangeText = document.getElementById("rangeText");
const noteText = document.getElementById("noteText");
const selected = new Set();
const APP_VERSION = "2026.11.02.20";
let midiController = null;
let phraseEngine = null, phraseSnapshot = null;
const phraseRawHeld=new Set();
let phraseSeenLow=21,phraseSeenHigh=108;
let phraseViewVisibility="auto",phraseViewSpelling="sharp",phraseViewNames=true,phraseSmallScore=false,phraseInspectTime=0,phraseViewWindow=6000,phraseViewExample=false,phrasePianoScroll=0;
let phraseViewModel=null,phraseViewSignature="",phraseViewTick=null,phraseViewStamp=0;
try{const prefs=JSON.parse(localStorage.getItem("keymemory.phrase.view")||"{}");if(["auto","show","hide"].includes(prefs.visibility))phraseViewVisibility=prefs.visibility;if(prefs.spelling==="flat")phraseViewSpelling="flat";if(prefs.names===false)phraseViewNames=false;}catch{}
const wrongKeyFeedback = new Map();
const WRONG_KEY_DURATION = 950;
function clearWrongKeyFeedback() {
  for (const feedback of wrongKeyFeedback.values()) clearTimeout(feedback.timer);
  wrongKeyFeedback.clear();
}
const achievement = document.getElementById("achievement");
const achievementText = document.getElementById("achievementText");
let achievementTimer = null;
function dismissAchievement() {
  if (achievementTimer !== null) clearTimeout(achievementTimer);
  achievementTimer = null;
  achievement.classList.remove("celebrate", "incorrect");
  achievement.hidden = true;
}
function showFeedback(correct, message) {
  dismissAchievement();
  achievementText.textContent = message;
  achievement.querySelector(".achievementIcon").textContent = correct ? "✓" : "✕";
  achievement.hidden = false;
  void achievement.offsetWidth;
  achievement.classList.add(correct ? "celebrate" : "incorrect");
  achievementTimer = setTimeout(dismissAchievement, 3200);
}
function celebrate(message = "Excellent! Correct answer!") {
  showFeedback(true, message);
}
function incorrect(message = "Not quite — try again!") {
  showFeedback(false, message);
}
const BLACK = new Set([1, 3, 6, 8, 10]);
const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const noteName = midi => NAMES[midi % 12]; // Hide octave numbers; keep MIDI pitch internally.
const CHORD_ROOTS = [0, 2, 4, 5, 7, 9, 11];
const CHORD_DEGREES = [1, 3, 5];
let chordAnswer = null;
let displayedChord = [];
const CHORD_TYPES = {
  major:[0,4,7], minor:[0,3,7], dim:[0,3,6], aug:[0,4,8],
  sus2:[0,2,7], sus4:[0,5,7], maj7:[0,4,7,11],
  min7:[0,3,7,10], dom7:[0,4,7,10], dim7:[0,3,6,9], m7b5:[0,3,6,10],
  add9:[0,4,7,14], madd9:[0,3,7,14],
  maj9:[0,4,7,11,14], min9:[0,3,7,10,14], dom9:[0,4,7,10,14],
  dom11:[0,4,7,10,14,17], min11:[0,3,7,10,14,17],
  dom13:[0,4,7,10,14,17,21], maj13:[0,4,7,11,14,17,21], min13:[0,3,7,10,14,17,21]
};
// Dictionary uses exact physical MIDI notes, so changing inversion moves the highlighted keys.
let dictionaryVoicing = [];
const dictionaryRoot = document.getElementById("dictionaryRoot");
const dictionaryQuality = document.getElementById("dictionaryQuality");
const dictionaryInversion = document.getElementById("dictionaryInversion");
const toggleChordNotes = document.getElementById("toggleChordNotes");
const checkChordAnswer = document.getElementById("checkChordAnswer");
let dictionaryPractice = false;
let dictionaryTimedOut = false;
let autoNextTimer = null;
let pendingAdvance = null;
let lastCorrectNotes = [];
let referenceNotes = [];
function cancelAutoNext(clearPending=true) {
  if (autoNextTimer !== null) clearTimeout(autoNextTimer);
  autoNextTimer = null;
  if(clearPending)pendingAdvance=null;
}
function scheduleAutoNext(reason="success") {
  cancelAutoNext();
  if (activeMode === "free" || (reason==="timeout"&&!timerEnabled.checked)) return;
  const pending={mode:activeMode,reason};
  pendingAdvance=pending;
  nextChallenge.hidden=reason!=="milestone";
  if(audioResumePending)return; // Resume completion reschedules without cutting sound short.
  const pause=reason==="milestone"?4000:1800;
  autoNextTimer = setTimeout(() => {
    autoNextTimer = null;
    if(pendingAdvance!==pending || activeMode!==pending.mode)return;
    pendingAdvance=null;
    if(reason==="timeout"&&!timerEnabled.checked)return;
    if(activeMode==="scale")startScaleRace();
    else if(activeMode==="dictionary")setDictionaryPractice(true);
    else if(activeMode==="builder")advanceBuilder();
    else chooseChallenge();
  }, Math.max(pause,builderAudioUntil-Date.now()+150));
}
const timerControls = document.getElementById("timerControls");
const timerEnabled = document.getElementById("timerEnabled");
const timerDuration = document.getElementById("timerDuration");
const timerRemaining = document.getElementById("timerRemaining");
const timerProgress = document.getElementById("timerProgress");
const semitoneControls = document.getElementById("semitoneControls");
const semitoneDifficulty = document.getElementById("semitoneDifficulty");
const scaleControls = document.getElementById("scaleControls");
const scaleRoot = document.getElementById("scaleRoot");
const scaleType = document.getElementById("scaleType");
const SCALE_PATTERNS = {
  major:[0,2,4,5,7,9,11,12], naturalMinor:[0,2,3,5,7,8,10,12],
  harmonicMinor:[0,2,3,5,7,8,11,12], melodicMinor:[0,2,3,5,7,9,11,12],
  majorPent:[0,2,4,7,9,12], minorPent:[0,3,5,7,10,12],
  blues:[0,3,5,6,7,10,12], dorian:[0,2,3,5,7,9,10,12],
  phrygian:[0,1,3,5,7,8,10,12], lydian:[0,2,4,6,7,9,11,12],
  mixolydian:[0,2,4,5,7,9,10,12], locrian:[0,1,3,5,6,8,10,12]
};
const SCALE_DEGREES = {
  major:["1","2","3","4","5","6","7","8"],
  naturalMinor:["1","2","♭3","4","5","♭6","♭7","8"],
  harmonicMinor:["1","2","♭3","4","5","♭6","7","8"],
  melodicMinor:["1","2","♭3","4","5","6","7","8"],
  majorPent:["1","2","3","5","6","8"],
  minorPent:["1","♭3","4","5","♭7","8"],
  blues:["1","♭3","4","♭5","5","♭7","8"],
  dorian:["1","2","♭3","4","5","6","♭7","8"],
  phrygian:["1","♭2","♭3","4","5","♭6","♭7","8"],
  lydian:["1","2","3","♯4","5","6","7","8"],
  mixolydian:["1","2","3","4","5","6","♭7","8"],
  locrian:["1","♭2","♭3","4","♭5","♭6","♭7","8"]
};
const SCALE_ROOT_NAMES=["C","D♭","D","E♭","E","F","F♯","G","A♭","A","B♭","B"];
SCALE_ROOT_NAMES.forEach((name,pc)=>{const option=document.createElement("option");option.value=String(pc);option.textContent=name;scaleRoot.append(option);});
let scaleNotes=[],scaleIndex=0,scaleFeedbackTimer=null,scaleRestarting=false;
const scaleStart=document.getElementById("scaleStart");
let scalePhase="preview",scalePreviewIndex=0,scalePreviewInterval=null,scaleRaceInterval=null;
let scaleRaceDeadline=0,scaleStreak=0,scaleAskedAt=0,scaleTarget=0;
const scaleStatus=document.getElementById("scaleStatus");
const scaleMasteryKey="keymemory.scale.mastery.v1";
let scaleMastery={};
try {
  const saved=JSON.parse(localStorage.getItem(scaleMasteryKey)||"{}");
  if(saved && typeof saved==="object" && !Array.isArray(saved)) scaleMastery=saved;
} catch(_) {}
function masteredRoots(){
  const stored=scaleMastery[scaleType.value];
  return Array.isArray(stored) ? new Set(stored.filter(n=>Number.isInteger(n)&&n>=0&&n<12)) : new Set();
}
function updateScaleStatus(){
  scaleStatus.hidden=activeMode!=="scale";
  if(activeMode!=="scale")return;
  const count=masteredRoots().size;
  const phaseLabel={preview:"Study preview",race:"7-second scale race",degrees:"Degree exam",passed:"Key mastered",failed:"Retry preview"}[scalePhase]||"Scale Builder";
  const score=scalePhase==="degrees" ? " · "+scaleStreak+"/30 consecutive" : "";
  scaleStatus.textContent=phaseLabel+" · Key "+scaleRoot.selectedOptions[0].textContent+" · "+count+"/12 keys mastered"+score;
}
function selectNextScaleRoot(){
  const mastered=masteredRoots();
  const current=Number(scaleRoot.value);
  for(let n=1;n<=12;n++){
    const next=(current+n)%12;
    if(!mastered.has(next)){scaleRoot.value=String(next);return true;}
  }
  return false;
}
function clearScaleDelay(){
  if(scaleFeedbackTimer!==null)clearTimeout(scaleFeedbackTimer);
  if(scalePreviewInterval!==null)clearInterval(scalePreviewInterval);
  if(scaleRaceInterval!==null)clearInterval(scaleRaceInterval);
  scaleFeedbackTimer=null;scalePreviewInterval=null;scaleRaceInterval=null;
  scaleRestarting=false;
}
function scaleBuildNotes(){
  const root=48+Number(scaleRoot.value);
  scaleNotes=SCALE_PATTERNS[scaleType.value].map(offset=>root+offset);
}
function scalePrompt(){
  const next=scaleNotes[scaleIndex], previous=scaleNotes[scaleIndex-1];
  targetMidi=next;
  displayQuestion([{text:"Degree "},{text:SCALE_DEGREES[scaleType.value][scaleIndex],strong:true},
    {text:" · From "+noteName(previous)+" move "},
    {text:(next-previous)+" semitone"+(next-previous===1?"":"s")+" UP",strong:true}]);
}
function startScalePreview(){
  clearScaleDelay();stopCountdown();dismissAchievement();scaleBuildNotes();
  scalePhase="preview";scaleIndex=0;targetMidi=null;selected.clear();
  scaleStart.hidden=false;scaleStart.textContent="Start scale race";
  nextChallenge.hidden=true;timerRemaining.textContent="";
  trainingPrompt.textContent="Watch the scale degrees flash in order, then press Start.";
  function showDegree(){
    selected.clear(); selected.add(scaleNotes[scalePreviewIndex]);
    renderPiano();
    scalePreviewIndex=(scalePreviewIndex+1)%scaleNotes.length;
  }
  scalePreviewIndex=0;showDegree();
  scalePreviewInterval=setInterval(showDegree,650);
  updatePracticeChrome();updateScaleStatus();
}
function scaleRaceTick(){
  const remaining=Math.max(0,scaleRaceDeadline-performance.now());
  timerRemaining.textContent=(remaining/1000).toFixed(1)+"s";
  document.querySelectorAll(".countdownMirror").forEach(el=>el.textContent=timerRemaining.textContent);
  if(remaining<=0){
    clearScaleDelay();scalePhase="failed";targetMidi=null;
    incorrect("7 seconds elapsed — watch again and retry.");
    scaleFeedbackTimer=setTimeout(()=>{scaleFeedbackTimer=null;if(activeMode==="scale")startScalePreview();},1500);
  }
}
function startScaleRace(){
  clearScaleDelay();stopCountdown();dismissAchievement();scaleBuildNotes();
  scalePhase="race";scaleIndex=1;targetMidi=null;selected.clear();
  selected.add(scaleNotes[0]);scaleStart.hidden=true;nextChallenge.hidden=true;
  renderPiano();scalePrompt();
  scaleRaceDeadline=performance.now()+7000;
  scaleRaceTick();scaleRaceInterval=setInterval(scaleRaceTick,80);
  updatePracticeChrome();updateScaleStatus();
}
function startScaleDegreeTest(){
  clearScaleDelay();stopCountdown();scalePhase="degrees";scaleStreak=0;
  scaleStart.hidden=true;selected.clear();nextChallenge.hidden=true;
  celebrate("Race passed! Degree exam unlocked: 30 correct in a row.");
  nextScaleDegree();
  updateScaleStatus();
}
function nextScaleDegree(){
  if(scalePhase!=="degrees")return;
  selected.clear();
  scaleIndex=0;
  const index=Math.floor(Math.random()*scaleNotes.length);
  scaleTarget=scaleNotes[index];targetMidi=scaleTarget;
  scaleAskedAt=performance.now();
  displayQuestion([{text:"Find scale degree "},{text:SCALE_DEGREES[scaleType.value][index],strong:true},
    {text:" · "+scaleStreak+"/30 consecutive"}]);
  renderPiano();updatePracticeChrome();updateScaleStatus();
}
function finishScaleAttempt(){
  clearScaleDelay();targetMidi=null;scalePhase="passed";
  const mastered=masteredRoots();
  mastered.add(Number(scaleRoot.value));
  scaleMastery[scaleType.value]=[...mastered].sort((a,b)=>a-b);
  try {localStorage.setItem(scaleMasteryKey,JSON.stringify(scaleMastery));} catch(_) {}
  const complete=mastered.size===12;
  celebrate(complete ? "All 12 keys mastered for this scale!" : "Key mastered! Moving to the next key.");
  scaleStart.hidden=true;nextChallenge.hidden=true;
  updateScaleStatus();
  scaleFeedbackTimer=setTimeout(()=>{
    scaleFeedbackTimer=null;
    if(activeMode!=="scale")return;
    if(complete){
      scalePhase="passed";
      trainingPrompt.textContent="All 12 keys mastered! Choose another scale type to continue.";
      scaleStart.hidden=false;scaleStart.textContent="Review this scale";
      updateScaleStatus();
      return;
    }
    selectNextScaleRoot();
    startScalePreview();
  },2600);
}
function answerScaleKey(midi){
  if(targetMidi===null || scaleRestarting || scalePhase==="preview" || scalePhase==="passed")return false;
  if(scalePhase==="race"){
    if(performance.now()>=scaleRaceDeadline){scaleRaceTick();return false;}
    if(midi!==targetMidi){
      clearScaleDelay();scalePhase="failed";targetMidi=null;selected.clear();renderPiano();
      incorrect("Wrong note — race reset.");
      scaleFeedbackTimer=setTimeout(()=>{scaleFeedbackTimer=null;if(activeMode==="scale")startScalePreview();},1400);
      return false;
    }
    selected.add(midi);scaleIndex++;
    if(scaleIndex===scaleNotes.length){
      clearScaleDelay();startScaleDegreeTest();
    }else {scalePrompt();renderPiano();}
    return true;
  }
  if(scalePhase==="degrees"){
    const elapsed=performance.now()-scaleAskedAt;
    if(elapsed<1000){
      trainingPrompt.textContent="Take at least 1 second per selection · "+scaleStreak+"/30";
      return null;
    }
    const correct=midi===scaleTarget;
    if(!correct){
      scaleStreak=0;
      scalePhase="failed";
      targetMidi=null;
      selected.clear();
      incorrect("Wrong degree — restart from the scale preview and 7-second race.");
      updateScaleStatus();
      scaleFeedbackTimer=setTimeout(()=>{
        scaleFeedbackTimer=null;
        if(activeMode==="scale")startScalePreview();
      },1500);
      return false;
    }
    scaleStreak++;
    if(scaleStreak===30){finishScaleAttempt();return true;}
    nextScaleDegree();
    updateScaleStatus();
    return true;
  }
  return false;
}
scaleStart.addEventListener("click",()=>{if(activeMode==="scale")startScaleRace();});
scaleRoot.addEventListener("change",()=>{if(activeMode==="scale")startScalePreview();});
scaleType.addEventListener("change",()=>{if(activeMode==="scale")startScalePreview();});

let countdown = null;
let deadline = 0;
let secondsLeft = 0;
let semitoneAnswer = null;
let semitoneStart = null;
let semitoneSteps = 0;
let builderNotes = [];
let builderTargets = [];
let builderStep = 1;
let builderAdvancePending = false;
let builderPhase = "question";
let builderLesson = null;
let builderRoot = 48;
let builderDeck = [];
let lastBuilderType = null;
let lastBuilderRoot = null;
const builderControls = document.getElementById("builderControls");
const builderLevel = document.getElementById("builderLevel");
const builderHint = document.getElementById("builderHint");
const hearBuilder = document.getElementById("hearBuilder");
const TRIAD_LESSONS = [
  {id:"major", name:"major", intervals:[0,4,7], third:"major third", fifth:"perfect fifth"},
  {id:"minor", name:"minor", intervals:[0,3,7], third:"minor third", fifth:"perfect fifth"},
  {id:"diminished", name:"diminished", intervals:[0,3,6], third:"minor third", fifth:"diminished fifth"},
  {id:"augmented", name:"augmented", intervals:[0,4,8], third:"major third", fifth:"augmented fifth"}
];
const SEVENTH_LESSONS = [
  {id:"dominant7", name:"dominant seventh", triad:"major", seventh:10, seventhName:"minor seventh"},
  {id:"major7", name:"major seventh", triad:"major", seventh:11, seventhName:"major seventh"},
  {id:"minor7", name:"minor seventh", triad:"minor", seventh:10, seventhName:"minor seventh"},
  {id:"minorMajor7", name:"minor-major seventh", triad:"minor", seventh:11, seventhName:"major seventh"},
  {id:"halfDiminished7", name:"half-diminished seventh", triad:"diminished", seventh:10, seventhName:"minor seventh"},
  {id:"diminished7", name:"diminished seventh", triad:"diminished", seventh:9, seventhName:"diminished seventh"},
  {id:"augmented7", name:"augmented dominant seventh", triad:"augmented", seventh:10, seventhName:"minor seventh"},
  {id:"augmentedMajor7", name:"augmented major seventh", triad:"augmented", seventh:11, seventhName:"major seventh"}
].map(lesson => {
  const triad = TRIAD_LESSONS.find(t => t.id === lesson.triad);
  return {...lesson, intervals:[...triad.intervals, lesson.seventh], third:triad.third, fifth:triad.fifth};
});
// Each note has a diatonic degree independent of its physical semitone offset.
// This keeps suspended, added, sixth and altered notes spelled by musical role.
const COLOR_LESSONS = [
  {id:"sus2",name:"suspended second",intervals:[0,2,7],degrees:[1,2,5],roles:["root","major second","perfect fifth"],foundation:"suspended second chord",effect:"The second replaces the third: this is neither a major nor a minor chord."},
  {id:"sus4",name:"suspended fourth",intervals:[0,5,7],degrees:[1,4,5],roles:["root","perfect fourth","perfect fifth"],foundation:"suspended fourth chord",effect:"The fourth replaces the third: listen for its pull toward the major third."},
  {id:"add9",name:"major add9",triad:"major",intervals:[0,4,7,14],degrees:[1,3,5,9],roles:["root","major third","perfect fifth","major ninth"],effect:"Add9 adds a ninth to a triad without a seventh."},
  {id:"minorAdd9",name:"minor add9",triad:"minor",intervals:[0,3,7,14],degrees:[1,3,5,9],roles:["root","minor third","perfect fifth","major ninth"],effect:"Minor add9 keeps the minor triad and adds a ninth, with no seventh."},
  {id:"major6",name:"major sixth",triad:"major",intervals:[0,4,7,9],degrees:[1,3,5,6],roles:["root","major third","perfect fifth","major sixth"],effect:"The major sixth adds warmth to the major triad; there is no seventh."},
  {id:"minor6",name:"minor sixth",triad:"minor",intervals:[0,3,7,9],degrees:[1,3,5,6],roles:["root","minor third","perfect fifth","major sixth"],effect:"Minor sixth means a minor triad plus a MAJOR sixth, not a minor sixth."},
  {id:"sixNine",name:"major 6/9",triad:"major",intervals:[0,4,7,9,14],degrees:[1,3,5,6,9],roles:["root","major third","perfect fifth","major sixth","major ninth"],stages:{4:"major sixth"},effect:"6/9 combines a sixth and a ninth over the major triad, without a seventh."}
];
const EXTENDED_LESSONS = ["dominant","major","minor"].flatMap(quality => [9,11,13].map(extension => {
  const minor = quality === "minor", major = quality === "major";
  const count = extension === 9 ? 5 : extension === 11 ? 6 : 7;
  const stages = {4:quality + " seventh",5:quality + " ninth",6:quality + " eleventh"};
  return {id:quality+extension, name:quality+" "+({9:"ninth",11:"eleventh",13:"thirteenth"}[extension]), triad:minor?"minor":"major",
    intervals:[0,minor?3:4,7,major?11:10,14,17,21].slice(0,count),degrees:[1,3,5,7,9,11,13].slice(0,count),
    roles:["root",minor?"minor third":"major third","perfect fifth",major?"major seventh":"minor seventh","major ninth","perfect eleventh","major thirteenth"].slice(0,count),stages,
    effect:"Build the full learning stack through its seventh foundation." + (extension >= 11 && !minor ? " The natural eleventh can clash with the major third; performers often omit notes or choose another voicing. Here we learn every written degree." : " Higher extensions add color above the seventh.")};
}));
const ALTERED_LESSONS = [
  {id:"dominant7b5",name:"dominant seventh ♭5",intervals:[0,4,6,10],degrees:[1,3,5,7],roles:["root","major third","diminished fifth","minor seventh"],foundation:"major-third / flat-fifth foundation",effect:"Lower the usual perfect fifth by one semitone; retain the major third and minor seventh of a dominant chord."},
  {id:"dominant7sharp5",name:"dominant seventh ♯5",triad:"augmented",intervals:[0,4,8,10],degrees:[1,3,5,7],roles:["root","major third","augmented fifth","minor seventh"],effect:"Raise the fifth by one semitone. This is also called an augmented dominant seventh."},
  ...[{suffix:"b9",symbol:"♭9",offset:13,degree:9,role:"minor ninth"},{suffix:"sharp9",symbol:"♯9",offset:15,degree:9,role:"augmented ninth"},{suffix:"sharp11",symbol:"♯11",offset:18,degree:11,role:"augmented eleventh"},{suffix:"b13",symbol:"♭13",offset:20,degree:13,role:"minor thirteenth"}].map(a=>({
    id:"dominant7"+a.suffix,name:"dominant seventh "+a.symbol,triad:"major",intervals:[0,4,7,10,a.offset],degrees:[1,3,5,7,a.degree],roles:["root","major third","perfect fifth","minor seventh",a.role],stages:{4:"dominant seventh"},
    effect:"Add the altered "+a.symbol+" to a dominant seventh foundation for tension. This focused voicing leaves out unrequested intermediate extensions."}))
];
for (const lesson of TRIAD_LESSONS) { lesson.level="triads"; lesson.degrees=[1,3,5]; lesson.roles=["root",lesson.third,lesson.fifth]; }
for (const lesson of SEVENTH_LESSONS) { lesson.level="sevenths"; lesson.degrees=[1,3,5,7]; lesson.roles=["root",lesson.third,lesson.fifth,lesson.seventhName]; }
for (const [level,lessons] of [["colors",COLOR_LESSONS],["extended",EXTENDED_LESSONS],["altered",ALTERED_LESSONS]]) for (const lesson of lessons) lesson.level=level;
const ALL_BUILDER_LESSONS = [...TRIAD_LESSONS,...COLOR_LESSONS,...SEVENTH_LESSONS,...EXTENDED_LESSONS,...ALTERED_LESSONS];
const builderSelection = document.getElementById("builderSelection");
const builderTypes = document.getElementById("builderTypes");
const builderTypeOptions = document.getElementById("builderTypeOptions");
const builderSelectionCount = document.getElementById("builderSelectionCount");
let chosenBuilderTypes = new Set(ALL_BUILDER_LESSONS.map(l=>l.id));
function saveBuilderPreferences() {
  try { localStorage.setItem("keymemory.builder.preferences.v1",JSON.stringify({level:builderLevel.value,selection:builderSelection.value,types:[...chosenBuilderTypes]})); } catch (_) { /* Practice still works when storage is unavailable. */ }
}
try {
  const saved = JSON.parse(localStorage.getItem("keymemory.builder.preferences.v1"));
  if (saved && typeof saved === "object") {
    if ([...builderLevel.options].some(o=>o.value===saved.level)) builderLevel.value=saved.level;
    if (["random","custom"].includes(saved.selection)) builderSelection.value=saved.selection;
    if (Array.isArray(saved.types)) chosenBuilderTypes=new Set(saved.types.filter(id=>ALL_BUILDER_LESSONS.some(l=>l.id===id)));
  }
} catch (_) { /* Ignore unavailable or damaged local preferences. */ }
function levelBuilderLessons() { return ALL_BUILDER_LESSONS.filter(l=>builderLevel.value==="mixed" || l.level===builderLevel.value); }
function renderBuilderChoices() {
  const focusedType=builderTypeOptions.contains(document.activeElement) ? document.activeElement.value : null;
  builderTypes.hidden=builderSelection.value!=="custom";
  builderTypeOptions.replaceChildren();
  const choices=levelBuilderLessons();
  for (const lesson of choices) {
    const label=document.createElement("label"), input=document.createElement("input");
    input.type="checkbox";input.value=lesson.id;input.checked=chosenBuilderTypes.has(lesson.id);
    input.addEventListener("change",()=>{ if(input.checked)chosenBuilderTypes.add(lesson.id);else chosenBuilderTypes.delete(lesson.id); restartBuilderPreferences(); });
    label.append(input,document.createTextNode(lesson.name));builderTypeOptions.append(label);
  }
  const count=choices.filter(l=>chosenBuilderTypes.has(l.id)).length;
  builderSelectionCount.textContent=count+" of "+choices.length+" types selected in this level";
  if(focusedType) builderTypeOptions.querySelector('input[value="'+focusedType+'"]')?.focus({preventScroll:true});
}
function restartBuilderPreferences() { builderDeck=[];saveBuilderPreferences();renderBuilderChoices();if(activeMode==="builder")beginBuilder(); }
builderSelection.addEventListener("change",()=>{builderTypes.open=builderSelection.value==="custom";restartBuilderPreferences();});
builderTypes.open=builderSelection.value==="custom";
document.getElementById("builderSelectAll").addEventListener("click",()=>{levelBuilderLessons().forEach(l=>chosenBuilderTypes.add(l.id));restartBuilderPreferences();});
document.getElementById("builderClear").addEventListener("click",()=>{levelBuilderLessons().forEach(l=>chosenBuilderTypes.delete(l.id));restartBuilderPreferences();});
renderBuilderChoices();
const BUILDER_ROOT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
function builderTriad() {
  return TRIAD_LESSONS.find(t => t.id === (builderLesson.triad || builderLesson.id));
}
function builderFoundation() { return builderLesson.foundation || builderTriad().name + " triad"; }
function builderName(triadOnly = false) {
  return BUILDER_ROOT_NAMES[builderRoot % 12] + " " + (triadOnly ? builderFoundation() : builderLesson.name + (builderLesson.level === "triads" ? " triad" : ""));
}
function builderStageName() {
  if (builderNotes.length===3) return builderName(true);
  return BUILDER_ROOT_NAMES[builderRoot%12]+" "+(builderLesson.stages?.[builderNotes.length] || builderLesson.name);
}
function builderNextLabel() {
  const degree=builderLesson.degrees[builderStep];
  return "Add the "+({6:"sixth",7:"seventh",9:"ninth",11:"eleventh",13:"thirteenth"}[degree] || "next note");
}
function builderSpelling(index) {
  const letters = ["C","D","E","F","G","A","B"];
  const naturals = [0,2,4,5,7,9,11];
  const rootLetter = letters.indexOf(BUILDER_ROOT_NAMES[builderRoot % 12][0]);
  const letter = (rootLetter + builderLesson.degrees[index] - 1) % 7;
  const pitch = builderTargets[index] % 12;
  let accidental = (pitch - naturals[letter] + 18) % 12 - 6;
  return letters[letter] + (accidental < 0 ? "♭".repeat(-accidental) : "♯".repeat(accidental));
}
function builderNoteLabel(index) {
  const spelling = builderSpelling(index);
  const keyName = noteName(builderTargets[index]);
  return spelling === keyName ? spelling : spelling + " (" + keyName + " key)";
}
function builderNoteList() {
  return builderNotes.map((_, index) => builderNoteLabel(index)).join(" · ");
}
function builderQuestion() {
  midiController?.resetQuestion();
  clearWrongKeyFeedback();
  cancelAutoNext();
  builderPhase = "question";
  const last = builderNotes[builderNotes.length - 1];
  const goal = builderTargets[builderStep];
  targetMidi = goal;
  selected.clear();
  renderPiano();
  const distance = goal - last;
  const part = builderLesson.roles[builderStep];
  const foundation = builderName(true);
  chordTitle.textContent = builderStep < 3 ? foundation : builderName();
  degreeTitle.textContent = builderStep < 3 ? "Build the foundation · note " + (builderStep + 1) + " of 3" : "Extend the chord · note " + (builderStep+1) + " of " + builderTargets.length;
  displayQuestion([{text:(builderStep >= 3 ? "Extend " + builderStageName() : "Building " + foundation) + ": add the "},
    {text:part,strong:true}, {text:" • From " + builderNoteLabel(builderStep - 1) + " move "},
    {text:distance + " semitone" + (distance === 1 ? "" : "s") + " UP",strong:true}]);
  const effect=builderLesson.effect || (builderStep>=3 ? foundation+" gains a "+part+" to become "+builderName()+"." : "The third and fifth define the "+builderTriad().name+" triad.");
  builderHint.textContent = "Degree "+builderLesson.degrees[builderStep]+": "+builderLesson.intervals[builderStep]+" semitones above the root. "+effect+" Use the exact ascending key, not its other octave.";
  updateHearControl();
  nextChallenge.hidden = true;
  startCountdown();
}
function nextBuilderLesson() {
  const choices = levelBuilderLessons().filter(l=>builderSelection.value!=="custom" || chosenBuilderTypes.has(l.id));
  if (!choices.length) return null;
  if (!builderDeck.length) {
    builderDeck = [...choices];
    for (let i=builderDeck.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1));
      [builderDeck[i],builderDeck[j]]=[builderDeck[j],builderDeck[i]];
    }
    if (builderDeck[0].id === lastBuilderType && builderDeck.length > 1) [builderDeck[0],builderDeck[1]]=[builderDeck[1],builderDeck[0]];
  }
  const lesson = builderDeck.shift();
  lastBuilderType = lesson.id;
  return lesson;
}
function beginBuilder() {
  cancelAutoNext();
  stopCountdown();
  stopBuilderAudio();
  dismissAchievement();
  piano.parentElement.scrollLeft=0;
  builderLesson = nextBuilderLesson();
  if (!builderLesson) {
    clearWrongKeyFeedback();builderPhase="empty";builderTargets=[];builderNotes=[];targetMidi=null;selected.clear();builderAdvancePending=false;
    chordTitle.textContent="Choose chord types";degreeTitle.textContent="No types selected in this level";
    trainingPrompt.textContent="Select at least one chord type, choose Select all, or switch to Random to begin.";
    builderHint.textContent="Your selections in other levels are kept.";hearBuilder.hidden=false;hearBuilder.disabled=true;nextChallenge.hidden=true;renderPiano();return;
  }
  const roots = Array.from({length:12},(_,i)=>48+i).filter(root=>root!==lastBuilderRoot);
  builderRoot = roots[Math.floor(Math.random()*roots.length)];
  lastBuilderRoot = builderRoot;
  builderTargets = builderLesson.intervals.map(interval=>builderRoot+interval);
  builderNotes = [builderRoot];
  builderStep = 1;
  builderAdvancePending = false;
  builderQuestion();
}
function scheduleBuilderMilestone() { scheduleAutoNext("milestone"); }
function showBuilderMilestone(complete) {
  stopCountdown();
  targetMidi = null;
  builderPhase = complete ? "complete" : "triad";
  selected.clear();
  renderPiano();
  const name = complete ? builderName() : builderStageName();
  chordTitle.textContent = name;
  degreeTitle.textContent = complete ? "All " + builderNotes.length + " notes completed" : builderNotes.length===3 ? "Foundation complete · recognize this sound" : "Stage complete · recognize this sound";
  trainingPrompt.textContent = complete ? "Completed " + name + "! " + (builderAudioUntil>Date.now() ? "Next chord starts after playback." : "Next chord starts in 4 seconds.")
    : "You built " + name + ". Next: add the " + builderLesson.roles[builderStep] + " toward " + builderName() + ".";
  builderHint.textContent = builderNoteList() + ". Hear the chord before moving on. Listening holds this stage until the five-second chord playback finishes.";
  updateHearControl();
  nextChallenge.hidden = false;
  nextChallenge.textContent = complete ? "Build another chord" : builderNextLabel();
  celebrate((complete ? "Chord complete! " : "Stage complete! ") + name);
  scheduleBuilderMilestone();
}
function advanceBuilder(preservePlayback=false) {
  cancelAutoNext();
  if(!preservePlayback)stopBuilderAudio();
  dismissAchievement();
  if (builderPhase === "empty") return;
  if (builderPhase === "complete") { beginBuilder(); return; }
  if (builderPhase === "triad") { builderQuestion(); return; }
  if (builderAdvancePending) {
    builderNotes.push(builderTargets[builderStep]);
    builderStep++;
    builderAdvancePending = false;
    if (builderStep >= builderTargets.length) { showBuilderMilestone(true); return; }
    if (builderStep >= 3) { showBuilderMilestone(false); return; }
  }
  builderQuestion();
}
let builderAudioContext = null;
let builderVoices = [];
let builderAudioUntil = 0;
let builderAudioRequest = 0;
let audioResumePending = false;
const BUILDER_SUSTAIN_SECONDS = 5;
const BUILDER_RELEASE_SECONDS = .35;
function hearDuration(mode,notes) {
  return mode==="builder" ? {sustain:BUILDER_SUSTAIN_SECONDS,release:BUILDER_RELEASE_SECONDS} : {sustain:notes.length===1?1:2,release:.15};
}
function stopBuilderAudio() {
  builderAudioRequest++;
  audioResumePending=false;
  builderAudioUntil=0;
  const now=builderAudioContext?.currentTime || 0;
  for (const voice of builderVoices) {
    try {
      const envelope=voice.gain.gain;
      if (typeof envelope.cancelAndHoldAtTime === "function") envelope.cancelAndHoldAtTime(now);
      else { envelope.cancelScheduledValues?.(now); envelope.setValueAtTime(envelope.value || 0,now); }
      envelope.linearRampToValueAtTime(0,now+.03);
      voice.oscillator.stop(now+.04);
    } catch (_) {}
  }
  builderVoices = [];
}
function currentHearNotes() {
  if(activeMode==="free")return [...selected].sort((a,b)=>a-b);
  if(activeMode==="dictionary")return dictionaryPractice?[...selected].sort((a,b)=>a-b):[...dictionaryVoicing];
  if(activeMode==="builder")return builderAdvancePending?[...builderNotes,builderTargets[builderStep]]:[...builderNotes];
  if(lastCorrectNotes.length)return [...lastCorrectNotes];
  if(activeMode==="semitones")return semitoneStart===null?[]:[semitoneStart];
  if(activeMode==="degrees")return [...referenceNotes];
  return targetMidi===null?[]:[targetMidi];
}
function updateHearControl() {
  if(activeMode==="phrase"){hearBuilder.hidden=true;return;}
  const notes=currentHearNotes();
  hearBuilder.hidden=false;
  hearBuilder.disabled=notes.length===0;
  const chord=activeMode==="degrees"&&notes.length>=3 || activeMode==="builder"&&notes.length>=3 || activeMode==="dictionary"&&!dictionaryPractice;
  hearBuilder.textContent=activeMode==="semitones"&&!lastCorrectNotes.length?"Hear start note":chord?"Hear chord":notes.length===1?"Hear note":"Hear notes";
  let description=activeMode==="semitones"&&!lastCorrectNotes.length?"Hear the starting note":
    activeMode==="find"||activeMode==="remember"?"Hear the target note as an audio hint":
    activeMode==="degrees"&&!lastCorrectNotes.length?"Hear the reference chord":
    activeMode==="dictionary"&&dictionaryPractice?"Hear your selected notes":
    activeMode==="builder"?"Hear the notes built so far":"Hear the current notes";
  if(!notes.length)description="Select notes to hear them";
  hearBuilder.title=description;
  hearBuilder.setAttribute("aria-label",hearBuilder.textContent+" — "+description);
}
hearBuilder.addEventListener("click", async () => {
  const notes=currentHearNotes();
  if(!notes.length)return;
  const mode=activeMode;
  const duration=hearDuration(mode,notes);
  stopBuilderAudio();
  const request=++builderAudioRequest;
  audioResumePending=true;
  cancelAutoNext(false);
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error("Audio unavailable");
    builderAudioContext ||= new Audio();
    await builderAudioContext.resume();
    if(request!==builderAudioRequest || activeMode!==mode)return;
    audioResumePending=false;
    const now = builderAudioContext.currentTime;
    builderAudioUntil=Date.now()+(duration.sustain+duration.release)*1000;
    for (const midi of notes) {
      const oscillator = builderAudioContext.createOscillator();
      const gain = builderAudioContext.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(.12 / notes.length, now + .03);
      gain.gain.setValueAtTime(.12 / notes.length, now + duration.sustain);
      gain.gain.linearRampToValueAtTime(0, now + duration.sustain + duration.release);
      oscillator.connect(gain);gain.connect(builderAudioContext.destination);
      oscillator.start(now);oscillator.stop(now + duration.sustain + duration.release + .02);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      builderVoices.push({oscillator,gain});
    }
  } catch (_) {
    if(request!==builderAudioRequest)return;
    audioResumePending=false;
    showFeedback(false,"Audio is unavailable. You can keep practicing.");
  }
  if (request!==builderAudioRequest) return;
  if(activeMode==="builder"&&builderPhase==="complete"&&builderAudioUntil>Date.now())trainingPrompt.textContent="Completed "+builderName()+"! Next chord starts after playback.";
  if(pendingAdvance?.mode===activeMode)scheduleAutoNext(pendingAdvance.reason);
});
builderLevel.addEventListener("change", restartBuilderPreferences);
function stopCountdown() {
  if (countdown !== null) clearInterval(countdown);
  countdown = null;
  timerRemaining.textContent = "";
  document.querySelectorAll(".countdownMirror").forEach(el=>el.textContent="");
  timerProgress.hidden = true;
}
function startCountdown() {
  stopCountdown();
  if (!timerEnabled.checked || activeMode === "free") return;
  const seconds = Number(timerDuration.value);
  deadline = Date.now() + seconds * 1000;
  timerProgress.hidden = false;
  function tick() {
    const remaining = Math.max(0, deadline - Date.now());
    secondsLeft = Math.ceil(remaining / 1000);
    timerRemaining.textContent = secondsLeft + "s";
    document.querySelectorAll(".countdownMirror").forEach(el=>el.textContent=secondsLeft+"s");
    timerProgress.value = remaining / (seconds * 1000) * 100;
    if (remaining <= 0) {
      stopCountdown();
      if (activeMode === "scale") {
        if(targetMidi===null)return;
        incorrect("Time is up — scale resets!");
        targetMidi=null;
        scheduleAutoNext("timeout");
        return;
      }
      if (activeMode === "dictionary") {
        if (!dictionaryPractice || checkChordAnswer.disabled) return;
        dictionaryTimedOut = true;
        checkChordAnswer.disabled = true;
        trainingPrompt.textContent = "Time is up! Press Show Notes to review.";
      } else {
        if (targetMidi === null) return;
        const answer = activeMode === "degrees" ? NAMES[chordAnswer] : activeMode === "semitones" ? noteName(semitoneAnswer) : noteName(targetMidi);
        targetMidi = null;
        nextChallenge.hidden = false;
        trainingPrompt.textContent = "Time is up! Correct answer: " + answer;
      }
      incorrect("Time is up!");
      updateHearControl();
      scheduleAutoNext("timeout");
    }
  }
  tick();
  countdown = setInterval(tick, 100);
}
timerEnabled.addEventListener("change",()=>{
  stopCountdown();
  // Success progression is independent of the challenge-clock setting.
  if(pendingAdvance && pendingAdvance.reason!=="timeout")return;
  if(pendingAdvance?.reason==="timeout") {
    if(timerEnabled.checked)scheduleAutoNext("timeout");
    else {cancelAutoNext();nextChallenge.hidden=activeMode==="dictionary";}
    return;
  }
  if(timerEnabled.checked && (targetMidi!==null&&challengeTimer===null || activeMode==="dictionary"&&dictionaryPractice&&!checkChordAnswer.disabled))startCountdown();
});
timerDuration.addEventListener("change", () => { if (countdown !== null) startCountdown(); });
semitoneDifficulty.addEventListener("change", () => { if (activeMode === "semitones") chooseChallenge(); });
function setDictionaryPractice(on) {
  midiController?.resetQuestion();
  stopBuilderAudio();
  lastCorrectNotes=[];
  clearWrongKeyFeedback();
  cancelAutoNext();
  dismissAchievement();
  dictionaryPractice = on;
  dictionaryTimedOut = false;
  selected.clear();
  toggleChordNotes.textContent = on ? "Show Notes" : "Hide Notes & Practice";
  toggleChordNotes.setAttribute("aria-pressed", String(on));
  checkChordAnswer.hidden = true;
  checkChordAnswer.disabled = false;
  checkChordAnswer.textContent = "Check Answer";
  document.getElementById("dictionaryNotes").hidden = on;
  renderPiano();
  if (activeMode === "dictionary") {
    trainingPrompt.textContent = on ? "Select every chord note from memory. Correct chords continue automatically." : "Blue keys show the selected chord inversion.";
    if (on) startCountdown(); else stopCountdown();
    updatePracticeChrome();
  }
}
toggleChordNotes.addEventListener("click", () => setDictionaryPractice(!dictionaryPractice));
function completeDictionaryAnswer() {
  if(!dictionaryPractice||dictionaryTimedOut||checkChordAnswer.disabled||activeMode!=="dictionary")return;
  if(selected.size!==dictionaryVoicing.length||!dictionaryVoicing.every(midi=>selected.has(midi)))return;
  trainingPrompt.textContent="Correct! You remembered every note. Next practice starts automatically.";
  celebrate("Perfect chord! You got it!");
  checkChordAnswer.disabled=true; // Locks this completed attempt against duplicate events.
  lastCorrectNotes=[...dictionaryVoicing];
  stopCountdown();
  updateHearControl();
  scheduleAutoNext();
}
// Retain a hidden compatibility control; completion no longer requires submission.
checkChordAnswer.addEventListener("click",completeDictionaryAnswer);
function showChordOnPiano() {
  piano.querySelectorAll(".key").forEach(key => {
    const midi = Number(key.dataset.midi);
    const matches = activeMode === "dictionary"
      ? dictionaryVoicing.includes(midi)
      : displayedChord.includes(midi % 12);
    key.classList.toggle("chordTone", matches);
  });
}
function updateInversionOptions() {
  const count = CHORD_TYPES[dictionaryQuality.value].length;
  const previous = Number(dictionaryInversion.value) || 0;
  dictionaryInversion.replaceChildren();
  for (let i = 0; i < count; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = i === 0 ? "Root position" : i === 1 ? "1st inversion" :
      i === 2 ? "2nd inversion" : i === 3 ? "3rd inversion" : i + "th inversion";
    dictionaryInversion.append(option);
  }
  dictionaryInversion.value = String(Math.min(previous, count - 1));
}
function updateDictionary() {
  midiController?.resetQuestion();
  if (activeMode !== "dictionary") return;
  cancelAutoNext();
  stopBuilderAudio();
  lastCorrectNotes=[];
  clearWrongKeyFeedback();
  dismissAchievement();
  const root = Number(dictionaryRoot.value);
  const quality = dictionaryQuality.value;
  const intervals = CHORD_TYPES[quality];
  const inversion = Number(dictionaryInversion.value);
  // Compact ascending voicing: reduce compound extensions into the closest
  // octave, then raise lower chord tones to create successive inversions.
  const pitches = [...new Set(intervals.map(n => n % 12))].sort((a,b) => a-b);
  const rotated = [...pitches.slice(inversion), ...pitches.slice(0,inversion).map(n => n+12)];
  const bassPc = (root + rotated[0]) % 12;
  const bassMidi = 48 + bassPc;
  dictionaryVoicing = rotated.map(n => bassMidi + (n - rotated[0]));
  displayedChord = [];
  dictionaryPractice = false;
  dictionaryTimedOut = false;
  stopCountdown();
  toggleChordNotes.textContent = "Hide Notes & Practice";
  toggleChordNotes.setAttribute("aria-pressed", "false");
  checkChordAnswer.hidden = true;
  document.getElementById("dictionaryNotes").hidden = false;
  selected.clear();
  renderPiano();
  const label = dictionaryRoot.selectedOptions[0].textContent + " " +
    dictionaryQuality.selectedOptions[0].textContent;
  document.getElementById("dictionaryNotes").textContent =
    label + " · " + dictionaryInversion.selectedOptions[0].textContent +
    " · Notes low to high: " + dictionaryVoicing.map(noteName).join(" · ");
  trainingPrompt.textContent = label + " — blue keys show this inversion.";
  updatePracticeChrome();
}

let activeMode = "free";
let targetMidi = null;
let challengeTimer = null;
const modeName = document.getElementById("activeModeName");
const trainingPrompt = document.getElementById("trainingPrompt");
// Emphasize the answer target without placing octave numbers on the screen.
function displayQuestion(parts) {
  trainingPrompt.replaceChildren();
  for (const part of parts) {
    const span = document.createElement("span");
    span.className = part.strong ? "questionFocus" : "questionContext";
    span.textContent = part.text;
    trainingPrompt.appendChild(span);
  }
}
const nextChallenge = document.getElementById("nextChallenge");
const chordQuestion = document.getElementById("chordQuestion");
const chordTitle = document.getElementById("chordTitle");
const degreeTitle = document.getElementById("degreeTitle");
function keyRange() {
  const count = visibleOctaves(piano.parentElement.clientWidth);
  return Array.from({length:count * 12}, (_,i) => i + 48);
}
function cancelChallenge() {
  clearScaleDelay();
  phraseEngine?.stop();
  midiController?.resetQuestion();
  stopBuilderAudio();
  clearWrongKeyFeedback();
  clearScaleDelay();
  cancelAutoNext();
  stopCountdown();
  if (challengeTimer !== null) clearTimeout(challengeTimer);
  challengeTimer = null;
  targetMidi = null;
  chordAnswer = null;
  lastCorrectNotes=[];referenceNotes=[];
  displayedChord = [];
  dictionaryVoicing = [];
}
function chooseChallenge() {
  dismissAchievement();
  cancelChallenge();
  if (activeMode === "free" || activeMode === "phrase") return;
  if (activeMode === "dictionary") { updateDictionary(); nextChallenge.hidden = true; return; }
  if (activeMode === "builder") { beginBuilder(); return; }
  if (activeMode === "scale") { startScalePreview(); return; }
  selected.clear();
  renderPiano();
  const notes = keyRange();
  targetMidi = notes[Math.floor(Math.random() * notes.length)];
  nextChallenge.hidden = true;
  if (activeMode === "degrees") {
    const root = CHORD_ROOTS[Math.floor(Math.random() * CHORD_ROOTS.length)];
    const minor = Math.random() < .5;
    const degree = CHORD_DEGREES[Math.floor(Math.random() * CHORD_DEGREES.length)];
    const semitones = degree === 1 ? 0 : degree === 3 ? (minor ? 3 : 4) : 7;
    chordAnswer = (root + semitones) % 12;
    displayedChord = [0, minor ? 3 : 4, 7].map(step => (root + step) % 12);
    referenceNotes=[0,minor?3:4,7].map(step=>48+root+step);
    showChordOnPiano();
    const degreeName = degree === 1 ? "root (1st)" : degree === 3 ? "3rd" : "5th";
    chordTitle.textContent = NAMES[root] + (minor ? " minor" : " major");
    degreeTitle.textContent = "Find the " + degreeName;
    displayQuestion([{text:"Find the "}, {text:degreeName, strong:true}, {text:" of " + chordTitle.textContent}]);
    startCountdown();
    updateHearControl();
    return;
  }
  if (activeMode === "find") {
    displayQuestion([{text:"Find the note "}, {text:noteName(targetMidi),strong:true}]);
    startCountdown();
  } else if (activeMode === "semitones") {
    const difficulty = semitoneDifficulty.value;
    const max = difficulty === "easy" ? 3 : difficulty === "medium" ? 7 : 12;
    const notesAvailable = keyRange();
    semitoneSteps = 1 + Math.floor(Math.random() * max);
    const up = Math.random() < .5;
    const validStarts = notesAvailable.filter(m => notesAvailable.includes(m + (up ? semitoneSteps : -semitoneSteps)));
    semitoneStart = validStarts[Math.floor(Math.random() * validStarts.length)];
    semitoneAnswer = semitoneStart + (up ? semitoneSteps : -semitoneSteps);
    targetMidi = semitoneAnswer;
    displayQuestion([
      {text:"From "}, {text:noteName(semitoneStart),strong:true},
      {text:" move "}, {text:String(semitoneSteps) + " semitone" + (semitoneSteps === 1 ? "" : "s"),strong:true},
      {text:up ? " ↑ UP" : " ↓ DOWN",strong:true}
    ]);
    startCountdown();
  } else {
    displayQuestion([{text:"Memorize the "}, {text:"highlighted key",strong:true}]);
    const key = piano.querySelector('[data-midi="' + targetMidi + '"]');
    if (key) key.classList.add("selected");
    challengeTimer = setTimeout(() => {
      const highlighted = piano.querySelector('[data-midi="' + targetMidi + '"]');
      if (highlighted) highlighted.classList.remove("selected");
      displayQuestion([{text:"Find the "}, {text:"same key",strong:true}]);
      challengeTimer = null;
      startCountdown();
    }, 1800);
  }
  updateHearControl();
}
// Keep feedback separate from selection so a resize cannot erase the red flash.
// Each callback owns a feedback record and cannot clear a later question.
function flashWrongKey(key) {
  const midi = Number(key.dataset.midi);
  const previous = wrongKeyFeedback.get(midi);
  if (previous) clearTimeout(previous.timer);
  const feedback = { started: Date.now(), timer: null };
  wrongKeyFeedback.set(midi, feedback);
  key.classList.remove("wrongAnswer");
  void key.offsetWidth; // Restart the visible hold/fade on rapid repeat mistakes.
  key.style.setProperty("--wrong-key-delay", "0ms");
  key.classList.add("wrongAnswer");
  feedback.timer = setTimeout(() => {
    if (wrongKeyFeedback.get(midi) !== feedback) return;
    wrongKeyFeedback.delete(midi);
    piano.querySelectorAll('[data-midi="' + midi + '"]').forEach(button => button.classList.remove("wrongAnswer"));
  }, WRONG_KEY_DURATION);
}
function answerKey(midi) {
  if (targetMidi === null || challengeTimer !== null) return;
  // Mistakes are feedback, not completed questions. Keep the target, prompt,
  // successful builder notes and original timer deadline for direct retries.
  const correct = activeMode === "degrees" ? midi % 12 === chordAnswer :
    (activeMode === "find" || activeMode === "semitones") ? midi % 12 === targetMidi % 12 :
    midi === targetMidi;
  if (!correct) {
    incorrect("Not quite — try another key.");
    return false;
  }
  stopCountdown();
  lastCorrectNotes=[midi];
  if (activeMode === "builder") {
    builderAdvancePending = true;
    celebrate("Correct! " + noteName(midi) + " added.");
    targetMidi = null;
    builderPhase = "answered";
    if (builderStep >= 2) {
      advanceBuilder(true);
      return true;
    }
    nextChallenge.hidden = timerEnabled.checked;
    nextChallenge.textContent = "Continue building";
    scheduleAutoNext();
    return true;
  }
  trainingPrompt.textContent = "Correct! Well done.";
  celebrate("Great job! Correct note!");
  targetMidi = null;
  chordAnswer = null;
  nextChallenge.hidden = timerEnabled.checked;
  scheduleAutoNext();
  return true;
}

function activateMode(mode) {
  dismissAchievement();
  cancelChallenge();
  activeMode = mode;
  document.querySelector(".shell").classList.toggle("phraseWorkspace",mode==="phrase");
  chordQuestion.hidden = mode !== "degrees" && mode !== "builder";
  nextChallenge.textContent = "Next";
  dictionaryPractice = false;
  document.getElementById("dictionaryControls").hidden = mode !== "dictionary";
  timerControls.hidden = mode === "free" || mode === "phrase" || mode === "scale";
  scaleStart.hidden = mode !== "scale";
  semitoneControls.hidden = mode !== "semitones";
  builderControls.hidden = mode !== "builder";
  scaleControls.hidden = mode !== "scale";
  scaleStatus.hidden = mode !== "scale";
  selected.clear();
  modeName.textContent = mode === "find" ? "Find the Note" : mode === "remember" ? "Remember the Key" : mode === "degrees" ? "Chord Degrees" : mode === "semitones" ? "Semitones" : mode === "scale" ? "Scale Builder" : mode === "phrase" ? "Phrase Trainer" : mode === "builder" ? "Chord Builder" : mode === "dictionary" ? "Chord Dictionary" : "Free Play";
  trainingPrompt.textContent = mode === "free" ? "Explore the keyboard, or choose a training mode." : "Ready?";
  nextChallenge.hidden = mode === "free" || mode === "dictionary" || mode === "phrase";
  renderPiano();
  if (mode !== "free") chooseChallenge();
  updatePracticeChrome();
  if(mode==="phrase")refreshPhraseUI();
  renderPhraseView();
}


function dictionaryKeyboardRange() {
  if (!dictionaryVoicing.length) return { start:48, octaves:1 };
  const low = Math.min(...dictionaryVoicing);
  const high = Math.max(...dictionaryVoicing);
  const start = 48 + Math.floor((low - 48) / 12) * 12;
  return { start, octaves: Math.max(1, Math.ceil((high - start + 1) / 12)) };
}
function phraseKeyboardRange(){
  const notes=(phraseSnapshot?.notes||[]).map(n=>n.note+(phraseSnapshot?.options.transpose||0));
  const low=Math.max(0,Math.min(21,phraseSeenLow,...notes)),high=Math.min(127,Math.max(108,phraseSeenHigh,...notes));
  // A standard piano starts on A, not C. Only extend when real MIDI needs it.
  const start=low<21?Math.floor(low/12)*12:21;
  const end=high>108?Math.min(128,Math.ceil((high+1)/12)*12):109;
  return {start,end,octaves:Math.ceil((end-start)/12)};
}
function visibleOctaves(width) {
  if(activeMode==="phrase")return phraseKeyboardRange().octaves;
  if (activeMode === "dictionary") return dictionaryKeyboardRange().octaves;
  if (activeMode === "builder" && builderTargets.length) return Math.max(1, Math.ceil((builderTargets[builderTargets.length - 1] - 48 + 1) / 12));
  if (activeMode === "scale") return 3;
  return width < 600 ? 2 : width < 1050 ? 3 : 4;
}
function updateStatus(start, end) {
  rangeText.textContent = activeMode==="phrase"?(start===21&&end===108?"88 keys · A0–C8":"Extended MIDI "+start+"–"+end):visibleOctaves(piano.parentElement.clientWidth) + " octaves";
  const notes = [...selected].sort((a,b) => a-b).map(noteName);
  noteText.textContent = notes.length ? "Selected: " + notes.join(", ") : "Tap a key to highlight it";
  updateHearControl();
}
// Screen keys and external MIDI share grading, selection and progression.
function updateStatusFromPiano() {
  const keys=[...piano.querySelectorAll(".key")].map(k=>Number(k.dataset.midi));
  updateStatus(Math.min(...keys),Math.max(...keys));
}
function pressPianoKey(midi,fromMidi=false) {
  if(currentDialog || (fromMidi && document.hidden))return;
  const button=piano.querySelector('[data-midi="'+midi+'"]');
  if(activeMode==="phrase"){
    if(phraseSnapshot?.state==="practice"){phraseEngine.input({kind:"on",note:midi,velocity:100,channel:0});phraseEngine.input({kind:"off",note:midi,velocity:0,channel:0});unlockMidiAudio();soundMidiNote(midi);}
    return;
  }
  if(activeMode==="scale"){
    const correct=answerScaleKey(midi);
    if(correct===false&&button)flashWrongKey(button);
    if(correct===true){renderPiano();updateStatusFromPiano();}
    return;
  }
  // Only correct training answers use the green selected-key feedback.
  // Ignore answers while a memory target is being shown.
  if (activeMode === "dictionary") {
    if (!dictionaryPractice || dictionaryTimedOut || checkChordAnswer.disabled) return;
    if (!dictionaryVoicing.includes(midi)) {
      if(button)flashWrongKey(button);
      incorrect("That key is not in this voicing — try another key.");
      return;
    }
    if (!fromMidi && selected.has(midi)) selected.delete(midi);
    else selected.add(midi);
    button?.classList.toggle("selected", selected.has(midi));
    button?.setAttribute("aria-pressed", String(selected.has(midi)));
    completeDictionaryAnswer();
    updateStatusFromPiano();
    return;
  }
  if (activeMode !== "free" && (targetMidi === null || challengeTimer !== null)) return;
  if (activeMode === "free") {
    stopBuilderAudio();
    if (!fromMidi && selected.has(midi)) selected.delete(midi);
    else selected.add(midi);
  } else {
    selected.clear();
    const correct = answerKey(midi);
    if (correct) selected.add(midi);
    else if(button)flashWrongKey(button);
    piano.querySelectorAll(".key.selected").forEach(key => {
      key.classList.remove("selected");
      key.setAttribute("aria-pressed", "false");
    });
  }
  button?.classList.toggle("selected", selected.has(midi));
  button?.setAttribute("aria-pressed", String(selected.has(midi)));
  if (button && !button.isConnected) {
    // The final builder answer rerenders the completed chord immediately.
    selected.clear();
  }
  updateStatusFromPiano();
}

function renderPiano() {
  const container = piano.parentElement;
  const viewportWidth = container.clientWidth;
  const mobile = matchMedia("(max-width: 600px) and (orientation: portrait)").matches;
  const width = viewportWidth;
  const pad = mobile ? 6 : 10;
  const octaves = visibleOctaves(width);
  const start = activeMode === "phrase" ? phraseKeyboardRange().start : activeMode === "dictionary" ? dictionaryKeyboardRange().start : 48;
  const end = activeMode==="phrase"?phraseKeyboardRange().end:start + octaves * 12; // exclusive upper MIDI boundary
  const whiteCount = activeMode==="phrase"?Array.from({length:end-start},(_,i)=>start+i).filter(m=>!BLACK.has(m%12)).length:octaves * 7;
  const gap = 2;
  const usable = Math.max(0, width - pad * 2);
  // Fit one or two dictionary octaves in portrait; only longer ranges scroll.
  // Other modes retain two-octave scrolling with comfortable touch targets.
  const visibleWhiteKeys = activeMode === "dictionary" ? Math.min(whiteCount, 14) : 12;
  const mobileWhiteWidth = (usable - (visibleWhiteKeys - 1) * gap) / visibleWhiteKeys;
  // Cap desktop key width so a short keyboard never stretches into giant keys.
  // Use the keyboard's own natural width and center it when space remains.
  const desktopWhiteWidth = (usable - (whiteCount - 1) * gap) / whiteCount;
  const whiteW = activeMode==="phrase"&&width<1050?Math.max(26,mobile?mobileWhiteWidth:26):mobile
    ? Math.max(activeMode === "dictionary" ? 22 : 26, mobileWhiteWidth)
    : Math.max(18, Math.min(54, desktopWhiteWidth));
  const keyboardWidth = whiteCount * whiteW + (whiteCount - 1) * gap + pad * 2;
  piano.style.width = keyboardWidth + "px";
  const phrase=activeMode==="phrase";
  piano.classList.toggle("phrasePiano",phrase);
  piano.classList.toggle("compactBlackLabels",phrase&&whiteW*.65<20);
  const hint=document.querySelector(".pianoHint");
  if(phrase)hint.textContent=(start===21&&end===109?"88 keys · A0–C8":"Extended MIDI "+start+"–"+(end-1))+(keyboardWidth>width+1?" · Scroll sideways ↔":"");
  else{hint.textContent="Swipe sideways for more keys ";const arrow=document.createElement("span");arrow.setAttribute("aria-hidden","true");arrow.textContent="↔";hint.append(arrow);}
  piano.style.marginInline = !mobile && keyboardWidth <= width ? "auto" : "0";
  const shortLandscape = matchMedia("(max-height: 500px) and (orientation: landscape)").matches;
  const whiteH = shortLandscape ? 118 : mobile
    ? Math.min(166, Math.max(125, whiteW * 4.6))
    : Math.min(270, Math.max(120, whiteW * 5.2));
  const blackW = whiteW * .65;
  const root = document.documentElement.style;
  root.setProperty("--white-w", whiteW + "px");
  root.setProperty("--white-h", whiteH + "px");
  root.setProperty("--black-w", blackW + "px");
  root.setProperty("--black-h", whiteH * .62 + "px");
  root.setProperty("--key-radius", Math.max(3, Math.min(10, whiteW * .15)) + "px");
  root.setProperty("--black-radius", Math.max(2, Math.min(8, whiteW * .12)) + "px");
  piano.replaceChildren();
  const whiteRow = document.createElement("div");
  whiteRow.className = "whiteRow";
  piano.append(whiteRow);
  let whiteIndex = 0;
  const blackKeys = [];
  function makeKey(midi, color) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "key " + color;
    button.dataset.midi = String(midi);
    const exactName=activeMode==="phrase"?phraseDisplayName(midi):noteName(midi)+(Math.floor(midi/12)-1);
    button.setAttribute("aria-label",activeMode==="phrase"?exactName+" · MIDI "+midi:noteName(midi));
    if(activeMode==="phrase")button.title=exactName+" · MIDI "+midi;
    button.setAttribute("aria-pressed", String(selected.has(midi)));
    if (selected.has(midi)) button.classList.add("selected");
    const feedback = wrongKeyFeedback.get(midi);
    if (feedback && Date.now() - feedback.started < WRONG_KEY_DURATION) {
      button.classList.add("wrongAnswer");
      button.style.setProperty("--wrong-key-delay", -(Date.now() - feedback.started) + "ms");
    }
    if (activeMode === "dictionary" ? !dictionaryPractice && dictionaryVoicing.includes(midi) :
      activeMode === "builder" ? builderNotes.includes(midi) : activeMode==="phrase" ? (phraseSnapshot?.target||[]).includes(midi) : displayedChord.includes(midi % 12)) button.classList.add("chordTone");
    if (activeMode === "builder" && builderNotes[builderNotes.length - 1] === midi) button.classList.add("builderNewest");
    if(activeMode==="scale"){
      const index=scaleNotes.indexOf(midi);
      if(index>=0&&(scalePhase==="preview" ? selected.has(midi) : scalePhase==="race" && index<scaleIndex)){button.classList.add("chordTone");
        const degree=document.createElement("span");degree.className="scaleDegree";degree.textContent=SCALE_DEGREES[scaleType.value][index];button.append(degree);
        if(index===scaleIndex-1)button.classList.add("builderNewest");}
    }
    const label = document.createElement("span");
    label.className = "noteLabel";
    label.textContent = activeMode==="phrase"?phraseDisplayName(midi,midi%12===0||midi===21):NAMES[midi % 12];
    button.append(label);
    button.addEventListener("click", () => pressPianoKey(midi));
    return button;
  }
  for (let midi = start; midi < end; midi++) {
    if (BLACK.has(midi % 12)) {
      blackKeys.push({midi, anchor: whiteIndex - 1});
    } else {
      whiteRow.append(makeKey(midi, "white"));
      whiteIndex++;
    }
  }
  for (const {midi, anchor} of blackKeys) {
    const black = makeKey(midi, "black");
    black.style.left = (pad + anchor * (whiteW + gap) + whiteW - blackW / 2) + "px";
    piano.append(black);
  }
  updateStatus(start, end - 1);
  renderPhraseView();
}
NAMES.forEach((name, pc) => {
  const option = document.createElement("option");
  option.value = pc;
  option.textContent = name;
  dictionaryRoot.append(option);
});
dictionaryRoot.addEventListener("change", updateDictionary);
dictionaryQuality.addEventListener("change", () => {
  updateInversionOptions();
  updateDictionary();
});
dictionaryInversion.addEventListener("change", updateDictionary);
updateInversionOptions();
document.getElementById("clearNotes").addEventListener("click", () => {
  if(activeMode==="dictionary"&&dictionaryPractice&&checkChordAnswer.disabled)return;
  if(activeMode==="free"||activeMode==="dictionary")stopBuilderAudio();
  selected.clear();
  renderPiano();
});
const observer = new ResizeObserver(() => renderPiano());
observer.observe(piano.parentElement);
window.addEventListener("orientationchange", () => requestAnimationFrame(renderPiano));
renderPiano();

// Single compact dialogs preserve the live question and its clock on open/close.
let currentDialog = null;
let dialogReturnFocus = null;
const shell = document.querySelector(".shell");
function closePracticeDialog() {
  if (!currentDialog) return;
  currentDialog.hidden=true;
  currentDialog=null;
  shell.inert=false;
  document.body.style.overflow="";
  for(const id of ["openModes","openSettings","openHint"]) document.getElementById(id).setAttribute("aria-expanded","false");
  if(dialogReturnFocus?.isConnected) dialogReturnFocus.focus();
  dialogReturnFocus=null;
}
function openPracticeDialog(id,buttonId) {
  if(activeMode==="phrase")phraseEngine?.stop();
  midiController?.resetQuestion();
  if(currentDialog) closePracticeDialog();
  dialogReturnFocus=document.activeElement;
  currentDialog=document.getElementById(id);
  currentDialog.hidden=false;
  shell.inert=true;
  document.body.style.overflow="hidden";
  document.getElementById(buttonId).setAttribute("aria-expanded","true");
  currentDialog.querySelector(".modalTop button").focus();
}
for(const [open,dialog,close] of [["openModes","modeOverlay","closeModes"],["openSettings","settingsOverlay","closeSettings"],["openHint","hintOverlay","closeHint"]]) {
  document.getElementById(open).addEventListener("click",()=>openPracticeDialog(dialog,open));
  document.getElementById(close).addEventListener("click",closePracticeDialog);
  document.getElementById(dialog).addEventListener("click",event=>{if(event.target===event.currentTarget)closePracticeDialog();});
}
document.querySelectorAll(".startMode").forEach(button=>button.addEventListener("click",()=>{
  closePracticeDialog();activateMode(button.dataset.mode);
}));
nextChallenge.addEventListener("click",()=>activeMode==="builder"?advanceBuilder():chooseChallenge());
document.addEventListener("keydown",event=>{
  if(!currentDialog)return;
  if(event.key==="Escape"){event.preventDefault();closePracticeDialog();return;}
  if(event.key!=="Tab")return;
  const focusable=[...currentDialog.querySelectorAll("button,input,select,summary,[tabindex='0']")].filter(el=>!el.disabled&&!el.closest("[hidden]")&&(!el.closest("details:not([open])")||el.tagName==="SUMMARY"));
  if(!focusable.length){event.preventDefault();return;}
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&(document.activeElement===first||!currentDialog.contains(document.activeElement))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!currentDialog.contains(document.activeElement))){event.preventDefault();first.focus();}
});
function updatePracticeChrome() {
  document.getElementById("phraseActions").hidden=activeMode!=="phrase";
  document.getElementById("phraseControls").hidden=activeMode!=="phrase";
  const summary=document.getElementById("practiceSummary");
  let text="";
  if(activeMode==="phrase"&&phraseSnapshot)text=(phraseSnapshot.options.rhythm?"Notes + rhythm":"Notes only")+" · "+(["record-countin","recording"].includes(phraseSnapshot.state)?phraseSnapshot.options.sourceBpm:phraseSnapshot.options.playBpm)+" BPM";
  if(activeMode==="builder") text=(builderLevel.value==="mixed"?"Mixed":"Level "+({triads:1,colors:2,sevenths:3,extended:4,altered:5}[builderLevel.value]))+" · "+(builderSelection.value==="random"?"Random":levelBuilderLessons().filter(l=>chosenBuilderTypes.has(l.id)).length+" types");
  if(activeMode==="semitones") text=semitoneDifficulty.selectedOptions[0].textContent;
  if(activeMode==="scale") text=scaleRoot.selectedOptions[0].textContent+" "+scaleType.selectedOptions[0].textContent+" · "+(scalePhase==="degrees" ? scaleStreak+"/30" : scalePhase==="race" ? "7-second race" : scalePhase==="passed" ? "Passed" : "Preview");
  updateScaleStatus();
  // Dictionary choices are already visible inline; avoid repeating them in the summary.
  summary.textContent=text;
  document.getElementById("dictionaryActions").hidden=activeMode!=="dictionary";
  document.getElementById("openHint").hidden=activeMode!=="builder"&&(activeMode!=="dictionary"||dictionaryPractice);
  builderHint.hidden=activeMode!=="builder";
  document.getElementById("dictionaryNotes").hidden=activeMode!=="dictionary"||dictionaryPractice;
  updateHearControl();
  document.querySelectorAll(".startMode").forEach(button=>button.setAttribute("aria-current",button.dataset.mode===activeMode?"true":"false"));
}
document.getElementById("settingsOverlay").addEventListener("change",updatePracticeChrome);
document.getElementById("builderSelectAll").addEventListener("click",updatePracticeChrome);
document.getElementById("builderClear").addEventListener("click",updatePracticeChrome);
updatePracticeChrome();

document.getElementById("buildVersion").textContent = "Build " + APP_VERSION;

// MIDI key taps use short, releaseable voices, separate from contextual Hear.
let midiAudioContext=null, midiVoiceGeneration=0;
const midiVoices=new Map(), midiNoteRequests=new Map();
const phraseMonitorVoices=new Map(),phraseMonitorRequests=new Map(),phraseMonitorAll=new Set(),phraseMonitorChannels=new Map();
let phraseMonitorRequest=0;
let midiNoteRequest=0;
function releaseMidiNote(note) {
  midiNoteRequests.delete(note);
  const voice=midiVoices.get(note);if(!voice)return;
  midiVoices.delete(note);
  try{const now=midiAudioContext.currentTime;voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(0,now,.025);voice.osc.stop(now+.12);}catch{}
}
function monitorChannel(channel){
  if(phraseMonitorChannels.has(channel))return phraseMonitorChannels.get(channel);
  const state={pedal:0,volume:100,expression:127,gain:null};
  if(midiAudioContext){state.gain=midiAudioContext.createGain();state.gain.gain.setValueAtTime(100/127,midiAudioContext.currentTime);state.gain.connect(midiAudioContext.destination);}
  phraseMonitorChannels.set(channel,state);return state;
}
function stopMonitorVoice(voice){
  phraseMonitorAll.delete(voice);
  const key=voice.channel+":"+voice.note;if(phraseMonitorVoices.get(key)===voice)phraseMonitorVoices.delete(key);
  try{const t=midiAudioContext.currentTime;if(voice.gain.gain.cancelAndHoldAtTime)voice.gain.gain.cancelAndHoldAtTime(t);else voice.gain.gain.cancelScheduledValues(t);voice.gain.gain.setTargetAtTime(0,t,.025);voice.osc.stop(t+.12);}catch{}
}
function releasePhraseMonitor(note,channel){
  const key=channel+":"+note;phraseMonitorRequests.delete(key);
  const voice=phraseMonitorVoices.get(key);if(!voice)return;
  phraseMonitorVoices.delete(key);voice.released=true;
  if(monitorChannel(channel).pedal<64)stopMonitorVoice(voice);
}
function applyMonitorControl({controller,value,channel}){
  const state=monitorChannel(channel);
  if(controller===64){state.pedal=value;if(value<64)for(const voice of [...phraseMonitorAll])if(voice.channel===channel&&voice.released)stopMonitorVoice(voice);}
  else{state[controller===7?"volume":"expression"]=value;if(state.gain)state.gain.gain.setTargetAtTime((state.volume/127)*(state.expression/127),midiAudioContext.currentTime,.008);}
}
function resetMonitorControllers(){
  for(const state of phraseMonitorChannels.values())try{state.gain?.disconnect();}catch{}
  phraseMonitorChannels.clear();
}
function resetMidiAudio(){midiVoiceGeneration++;midiNoteRequests.clear();phraseMonitorRequests.clear();for(const note of midiVoices.keys())releaseMidiNote(note);for(const voice of [...phraseMonitorAll])stopMonitorVoice(voice);}
async function soundPhraseMonitor(note,velocity,channel){
  if(!midiAudioContext)return;
  const key=channel+":"+note,request=++phraseMonitorRequest,generation=midiVoiceGeneration;
  phraseMonitorRequests.set(key,request);
  try{
    await midiAudioContext.resume();if(generation!==midiVoiceGeneration||phraseMonitorRequests.get(key)!==request||activeMode!=="phrase"||currentDialog||document.hidden)return;
    // A prior pedal-latched release is a separate voice, not replaced by a new strike.
    const prior=phraseMonitorVoices.get(key);if(prior)stopMonitorVoice(prior);phraseMonitorRequests.delete(key);
    if(phraseMonitorAll.size>=64)stopMonitorVoice(phraseMonitorAll.values().next().value);
    const t=midiAudioContext.currentTime,osc=midiAudioContext.createOscillator(),gain=midiAudioContext.createGain(),state=monitorChannel(channel);
    if(!state.gain){state.gain=midiAudioContext.createGain();state.gain.gain.setValueAtTime((state.volume/127)*(state.expression/127),t);state.gain.connect(midiAudioContext.destination);}
    osc.type="triangle";osc.frequency.value=440*2**((note-69)/12);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.055*Math.sqrt(velocity/127),t+.015);
    osc.connect(gain);gain.connect(state.gain);osc.start(t);
    const voice={osc,gain,note,channel,released:false};phraseMonitorVoices.set(key,voice);phraseMonitorAll.add(voice);
    osc.onended=()=>{osc.disconnect();gain.disconnect();phraseMonitorAll.delete(voice);if(phraseMonitorVoices.get(key)===voice)phraseMonitorVoices.delete(key);};
  }catch{}
}
function unlockMidiAudio(){
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;midiAudioContext ||= new Audio();midiAudioContext.resume().catch(()=>{});}catch{}
}
async function soundMidiNote(note){
  if(!midiAudioContext)return;
  const generation=midiVoiceGeneration,request=++midiNoteRequest;
  midiNoteRequests.set(note,request);
  try{
    await midiAudioContext.resume();if(generation!==midiVoiceGeneration||midiNoteRequests.get(note)!==request||currentDialog||document.hidden)return;
    releaseMidiNote(note);
    const now=midiAudioContext.currentTime,osc=midiAudioContext.createOscillator(),gain=midiAudioContext.createGain();
    osc.type="triangle";osc.frequency.value=440*2**((note-69)/12);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.07,now+.015);gain.gain.exponentialRampToValueAtTime(.001,now+.7);
    osc.connect(gain);gain.connect(midiAudioContext.destination);osc.start(now);osc.stop(now+.75);
    const voice={osc,gain};midiVoices.set(note,voice);
    osc.onended=()=>{osc.disconnect();gain.disconnect();if(midiVoices.get(note)===voice)midiVoices.delete(note);};
  }catch{}
}
if(window.KeyMemoryMidi)midiController=window.KeyMemoryMidi.create({
  status:document.getElementById("midiStatus"),select:document.getElementById("midiInput"),
  connect:document.getElementById("connectMidi"),disconnect:document.getElementById("disconnectMidi"),
  onConnect:unlockMidiAudio,onReset:resetMidiAudio,onRelease:releaseMidiNote,
  onSuspend:()=>{phraseRawHeld.clear();resetMidiAudio();resetMonitorControllers();phraseEngine?.stop({releaseHeld:true});if(activeMode==="phrase"){selected.clear();renderPiano();}},
  onConnection:()=>{if(activeMode==="phrase")refreshPhraseUI();},
  onRaw:event=>{
    if(!phraseEngine)return false;
    if(event.kind==="control"){phraseEngine.input(event);applyMonitorControl(event);return activeMode==="phrase";}
    const key=event.channel+":"+event.note;
    if(event.kind==="off"){
      phraseRawHeld.delete(key);releasePhraseMonitor(event.note,event.channel);phraseEngine.input(event);
      if(activeMode==="phrase"&&![...phraseRawHeld].some(k=>Number(k.split(":")[1])===event.note)){selected.delete(event.note);if(!currentDialog){if(activeMode==="phrase"){phraseSnapshot=phraseEngine.snapshot();phraseViewStamp=Date.now();}renderPiano();}}
      return activeMode==="phrase";
    }
    const duplicate=phraseRawHeld.has(key);
    phraseRawHeld.add(key);
    const accepted=phraseEngine.input(event); // Idle tracking keeps held keys safe across mode changes.
    if(activeMode!=="phrase")return false;
    if(currentDialog||document.hidden||!event.focused)return true;
    phraseSeenLow=Math.min(phraseSeenLow,event.note);phraseSeenHigh=Math.max(phraseSeenHigh,event.note);
    if(accepted)selected.add(event.note);
    if(!duplicate)soundPhraseMonitor(event.note,event.velocity,event.channel);
    renderPiano();return true;
  },
  onNote:note=>{if(currentDialog||document.hidden)return;soundMidiNote(note);pressPianoKey(note,true);}
});

// Phrase playback has its own cancelable synth; recorded MIDI never leaves this browser.
let phraseAudioContext=null,phraseSoundGeneration=0,phraseAudioAnchor=null,phraseTransportRequest=0,phraseTransportPending=false;
const phraseVoices=new Set(),phrasePlaybackChannels=new Map();
function silencePhrase(){
  phraseSoundGeneration++;phraseTransportRequest++;phraseTransportPending=false;
  for(const voice of phraseVoices){try{const t=phraseAudioContext.currentTime;voice.gain.gain.cancelScheduledValues(t);voice.gain.gain.setTargetAtTime(0,t,.02);voice.osc.stop(t+.1);}catch{}}
  phraseVoices.clear();
  for(const state of phrasePlaybackChannels.values())try{const t=phraseAudioContext.currentTime;state.gain.gain.cancelScheduledValues(t);state.gain.gain.setValueAtTime(0,t);state.gain.disconnect();}catch{}
  phrasePlaybackChannels.clear();
}
function unlockPhraseAudio(){
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return Promise.reject(Error("Audio unavailable"));phraseAudioContext ||= new Audio();return Promise.resolve(phraseAudioContext.resume());}catch(error){return Promise.reject(error);}
}
function phraseAudioTime(plannedAt){
  if(!phraseAudioAnchor||!Number.isFinite(plannedAt))return phraseAudioContext.currentTime;
  return phraseAudioAnchor.audio+(plannedAt-phraseAudioAnchor.wall)/1000;
}
function playbackChannel(channel){
  if(phrasePlaybackChannels.has(channel))return phrasePlaybackChannels.get(channel);
  const gain=phraseAudioContext.createGain();gain.gain.setValueAtTime(100/127,phraseAudioContext.currentTime);gain.connect(phraseAudioContext.destination);
  const state={volume:100,expression:127,gain};phrasePlaybackChannels.set(channel,state);return state;
}
function soundPhraseControl({controller,value,channel,at,initial=false}){
  if(!phraseAudioContext||activeMode!=="phrase"||controller===64)return;
  const state=playbackChannel(channel);state[controller===7?"volume":"expression"]=value;
  const t=Math.max(phraseAudioContext.currentTime,phraseAudioTime(at)),valueProduct=(state.volume/127)*(state.expression/127);
  if(initial)state.gain.gain.setValueAtTime(valueProduct,t);else state.gain.gain.setTargetAtTime(valueProduct,t,.008);
}
function soundPhrase(note,velocity,durationMs,plannedAt,meta={}){
  if(!phraseAudioContext||activeMode!=="phrase")return;
  try{
    const scheduled=phraseAudioTime(plannedAt),t=Math.max(phraseAudioContext.currentTime,scheduled),duration=Math.max(.001,durationMs/1000)-(t-scheduled);
    if(duration<=0)return; // Do not shift a missed old note into the next beat.
    if(phraseVoices.size>=64){const old=phraseVoices.values().next().value;old.osc.stop();phraseVoices.delete(old);}
    const osc=phraseAudioContext.createOscillator(),gain=phraseAudioContext.createGain(),amplitude=.07*Math.sqrt(velocity/127);
    osc.type="triangle";osc.frequency.value=440*2**((note-69)/12);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(amplitude,t+Math.min(.01,duration/2));gain.gain.setValueAtTime(amplitude,t+duration);gain.gain.linearRampToValueAtTime(0,t+duration+.08);
    osc.connect(gain);gain.connect(playbackChannel(meta.channel||0).gain);osc.start(t);osc.stop(t+duration+.1);
    const voice={osc,gain};phraseVoices.add(voice);osc.onended=()=>{osc.disconnect();gain.disconnect();phraseVoices.delete(voice);};
  }catch{}
}
function soundPhraseBeat({beat,at}){
  if(!phraseAudioContext||activeMode!=="phrase")return;
  try{
    const scheduled=phraseAudioTime(at);if(phraseAudioContext.currentTime-scheduled>.08)return;
    const t=Math.max(phraseAudioContext.currentTime,scheduled),osc=phraseAudioContext.createOscillator(),gain=phraseAudioContext.createGain();
    osc.type="sine";osc.frequency.value=(beat-1)%4===0?1400:1000;
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.12,t+.002);gain.gain.exponentialRampToValueAtTime(.001,t+.04);
    osc.connect(gain);gain.connect(phraseAudioContext.destination);osc.start(t);osc.stop(t+.05);
    const voice={osc,gain};phraseVoices.add(voice);osc.onended=()=>{osc.disconnect();gain.disconnect();phraseVoices.delete(voice);};
  }catch{}
}
async function startPhraseTransport(action){
  if(!phraseEngine||phraseTransportPending)return;
  phraseEngine.stop();dismissAchievement();clearWrongKeyFeedback();stopBuilderAudio();resetMidiAudio();
  const request=++phraseTransportRequest;phraseTransportPending=true;refreshPhraseUI();
  try{
    await unlockPhraseAudio();
    if(request!==phraseTransportRequest||activeMode!=="phrase"||currentDialog||document.hidden)return;
    phraseTransportPending=false;phraseAudioAnchor={wall:Date.now(),audio:phraseAudioContext.currentTime};selected.clear();action();
  }catch{
    if(request!==phraseTransportRequest)return;
    phraseTransportPending=false;refreshPhraseUI();incorrect("Audio could not start. Your phrase is unchanged; try again.");
  }
}

const phraseTime=ms=>{const sec=Math.max(0,Math.floor(ms/1000));return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0");};
function refreshPhraseUI(snapshot=phraseSnapshot){
  if(snapshot){if(snapshot!==phraseSnapshot)phraseViewStamp=Date.now();phraseSnapshot=snapshot;}
  if(!phraseSnapshot)return;
  const s=phraseSnapshot,o=s.options,active=phraseTransportPending||["record-countin","play-countin","recording","playing","countin","practice","wait-release"].includes(s.state),has=s.notes.length>0;
  document.getElementById("phraseRecord").disabled=phraseTransportPending||s.state==="recording"||s.state==="record-countin";
  document.getElementById("phrasePlay").disabled=phraseTransportPending||!has||s.state==="recording"||s.state==="record-countin";
  document.getElementById("phrasePractice").disabled=phraseTransportPending||!has||s.state==="recording"||s.state==="record-countin";
  document.getElementById("phraseStop").disabled=!active;
  for(const id of ["phraseDown","phraseUp"])document.getElementById(id).disabled=phraseTransportPending||s.state==="recording"||s.state==="record-countin";
  document.getElementById("phraseTransposeValue").textContent=o.transpose?((o.transpose>0?"+":"")+o.transpose+" st"):"Original";
  document.getElementById("phraseClock").textContent=s.state==="recording"?"REC "+phraseTime(s.elapsed)+" / 2:00":has?phraseTime(s.duration)+" · "+s.notes.length+" notes":"Up to 2:00";
  const values={phraseSourceBpm:o.sourceBpm,phrasePlayBpm:o.playBpm,phraseRhythm:o.rhythm?"rhythm":"notes",phraseTolerance:o.tolerance,phraseSectionStart:o.sectionStart/1000,phraseSectionEnd:o.sectionEnd/1000};
  for(const [id,value]of Object.entries(values))document.getElementById(id).value=String(value);
  document.getElementById("phraseSaved").textContent=(s.error?s.error+" ":"")+(has?(s.saved?"Saved locally on this device":"Kept for this session only")+" · "+s.notes.length+" notes":"No saved phrase");
  if(activeMode!=="phrase")return;
  const names=(s.target||[]).map(m=>phraseDisplayName(m));
  let prompt=phraseTransportPending?"Preparing audio…":s.state==="record-countin"?"Record count-in: "+s.countIn+" · start after 3":s.state==="play-countin"?"Playback count-in: "+s.countIn+" · starts after 3":s.state==="recording"?"Recording MIDI — play your phrase. Stop when finished.":s.state==="playing"?"Playing phrase · "+(s.progress+1)+" / "+s.total:
    s.state==="countin"?"Count in: "+s.countIn+" · release the keys":s.state==="wait-release"?"Release all keys — restarting from the beginning":
    s.state==="practice"?"Play "+names.join(" + ")+" · "+(s.progress+1)+" / "+s.total:
    s.state==="complete"?"Phrase complete! Practice again or transpose.":has?"Your phrase is ready. Play it, transpose, or practice.":"Connect MIDI in Settings, then Record your phrase.";
  if(s.state==="practice"&&o.rhythm&&Number.isFinite(s.targetTime)){const delta=s.targetTime-s.elapsed;prompt+=" · "+(delta>80?"in "+(delta/1000).toFixed(1)+"s":"now");}
  if(s.error)prompt=s.error;
  trainingPrompt.textContent=prompt;
  document.getElementById("practiceSummary").textContent=(o.rhythm?"Notes + rhythm":"Notes only")+" · "+(["record-countin","recording"].includes(s.state)?o.sourceBpm:o.playBpm)+" BPM";
  renderPiano();
}
if(window.KeyMemoryPhrase){
  phraseEngine=window.KeyMemoryPhrase.create({viewProjection:true,onChange:refreshPhraseUI,onSound:soundPhrase,onBeat:soundPhraseBeat,onControl:soundPhraseControl,onSilence:silencePhrase,onWrong:(note,message)=>{const key=piano.querySelector('[data-midi="'+note+'"]');if(key)flashWrongKey(key);selected.clear();resetMidiAudio();incorrect(message);}});
  refreshPhraseUI(phraseEngine.snapshot());
}
function phraseAction(action){if(!phraseEngine)return;phraseViewExample=false;dismissAchievement();clearWrongKeyFeedback();stopBuilderAudio();resetMidiAudio();unlockPhraseAudio().catch(()=>{});action();}
document.getElementById("phraseRecord").addEventListener("click",()=>{
  if(!midiController?.isConnected()){trainingPrompt.textContent="Connect a MIDI keyboard in Settings before recording.";return;}
  if(phraseSnapshot?.notes.length&&!window.confirm("Replace the saved phrase with a new recording? An empty recording keeps the previous phrase."))return;
  startPhraseTransport(()=>phraseEngine.record());
});
document.getElementById("phrasePlay").addEventListener("click",()=>{if(!window.AudioContext&&!window.webkitAudioContext){incorrect("Audio is unavailable. Your saved phrase is unchanged.");return;}startPhraseTransport(()=>phraseEngine.play());});
document.getElementById("phrasePractice").addEventListener("click",()=>phraseAction(()=>{selected.clear();phraseEngine.practice();}));
document.getElementById("phraseStop").addEventListener("click",()=>{selected.clear();phraseEngine?.stop();resetMidiAudio();});
for(const [id,step]of[["phraseDown",-1],["phraseUp",1]])document.getElementById(id).addEventListener("click",()=>phraseAction(()=>phraseEngine.setOptions({transpose:phraseSnapshot.options.transpose+step})));
const phraseFields={phraseSourceBpm:["sourceBpm",1],phrasePlayBpm:["playBpm",1],phraseTolerance:["tolerance",1],phraseSectionStart:["sectionStart",1000],phraseSectionEnd:["sectionEnd",1000]};
for(const [id,[key,multiplier]]of Object.entries(phraseFields))document.getElementById(id).addEventListener("change",event=>phraseEngine?.setOptions({[key]:Number(event.target.value)*multiplier}));
document.getElementById("phraseRhythm").addEventListener("change",event=>phraseEngine?.setOptions({rhythm:event.target.value==="rhythm"}));
document.getElementById("phraseFull").addEventListener("click",()=>phraseEngine?.setOptions({sectionStart:0,sectionEnd:phraseSnapshot?.duration||120000}));
document.getElementById("phraseClear").addEventListener("click",()=>{if(window.confirm("Delete the saved phrase from this browser?")){selected.clear();phraseSeenLow=21;phraseSeenHigh=108;phraseViewExample=false;phraseEngine?.clear();}});
let phraseTaps=[];
document.getElementById("phraseTap").addEventListener("click",()=>{const now=Date.now();if(phraseTaps.length&&now-phraseTaps.at(-1)>2000)phraseTaps=[];phraseTaps.push(now);phraseTaps=phraseTaps.slice(-5);if(phraseTaps.length<2)return;const bpm=Math.round(60000*(phraseTaps.length-1)/(phraseTaps.at(-1)-phraseTaps[0]));if(bpm>=30&&bpm<=300)phraseEngine?.setOptions({sourceBpm:bpm,playBpm:bpm});});

// Read-only pitch/timing projection. No view control changes transport, grading or audio.
function savePhraseViewPreferences(){try{localStorage.setItem("keymemory.phrase.view",JSON.stringify({visibility:phraseViewVisibility,spelling:phraseViewSpelling,names:phraseViewNames}));}catch{}}
function renderPhraseView(){
  // A view failure must never interrupt MIDI recording or an audio scheduler callback.
  try{renderPhraseViewContent();document.getElementById("phraseViewControls")?.removeAttribute("data-view-error");}
  catch(error){if(phraseViewTick!==null){clearTimeout(phraseViewTick);phraseViewTick=null;}const panel=document.getElementById("phraseScore");if(panel)panel.hidden=true;piano.parentElement.hidden=false;document.querySelector(".pianoHint").hidden=false;document.querySelector(".info").hidden=false;document.getElementById("phraseViewControls")?.setAttribute("data-view-error","Score unavailable; your recording and controls are unchanged.");console.error("Phrase display could not render",error);}
}
function renderPhraseViewContent(){
  const controls=document.getElementById("phraseViewControls"),panel=document.getElementById("phraseScore");
  if(!controls||!panel)return;
  if(phraseViewTick!==null){clearTimeout(phraseViewTick);phraseViewTick=null;}
  const enabled=activeMode==="phrase"&&!!window.KeyMemoryPhraseView&&!!phraseSnapshot;
  controls.hidden=!enabled;
  const small=window.innerWidth<1050||window.innerHeight<550;
  const show=enabled&&(phraseViewVisibility==="show"||(phraseViewVisibility==="auto"&&(!small||phraseSmallScore)));
  panel.hidden=!show;
  const hidePiano=show&&small;
  const wasPianoHidden=piano.parentElement.hidden;
  if(hidePiano&&!wasPianoHidden)phrasePianoScroll=piano.parentElement.scrollLeft;
  piano.parentElement.hidden=hidePiano;
  if(!hidePiano&&wasPianoHidden){renderPiano();piano.parentElement.scrollLeft=activeMode==="phrase"?phrasePianoScroll:0;}
  document.querySelector(".pianoHint").hidden=hidePiano;
  document.querySelector(".info").hidden=hidePiano;
  const toggle=document.getElementById("phraseViewSwitch");toggle.hidden=!small;toggle.textContent=show?"Show piano":"Show score";toggle.setAttribute("aria-expanded",String(show));
  document.getElementById("phraseViewVisibility").value=phraseViewVisibility;
  document.getElementById("phraseSpelling").value=phraseViewSpelling;
  document.getElementById("phraseNoteNames").checked=phraseViewNames;
  if(!enabled)return;
  const s=phraseSnapshot,view=window.KeyMemoryPhraseView,recording=s.state==="recording",playing=s.state==="playing";
  const exampleAllowed=["idle","complete"].includes(s.state)&&!phraseTransportPending;
  if(!exampleAllowed)phraseViewExample=false;
  const exampleButton=document.getElementById("phraseViewExample");exampleButton.disabled=!exampleAllowed;exampleButton.textContent=phraseViewExample?"Back to my phrase":"Show example";
  const source=phraseViewExample?{duration:3000,notes:[48,60,64,67].map(note=>({note,channel:0,velocity:90,start:0,duration:600})).concat([{note:72,channel:0,velocity:90,start:2000,duration:500}]),controllers:[{controller:64,value:127,channel:0,time:200},{controller:64,value:0,channel:0,time:1500}],initialControllers:[]}:{notes:recording?(s.viewNotes||[]):s.notes,controllers:recording?(s.viewControllers||[]):s.controllers,initialControllers:recording?(s.viewInitialControllers||[]):s.initialControllers,duration:recording?s.viewDuration:s.duration};
  const signature=[phraseViewExample,s.state,source.notes.length,source.controllers?.length,source.duration,s.options.transpose,source.notes[0]?.note,source.notes.at(-1)?.note].join(":");
  if(signature!==phraseViewSignature||!phraseViewModel){phraseViewModel=view.prepareTimeline(source,{transpose:recording||phraseViewExample?0:s.options.transpose});phraseViewSignature=signature;}
  const model=phraseViewModel,elapsed=s.elapsed+(playing?Math.max(0,Date.now()-phraseViewStamp):0);
  const time=recording?source.duration:playing?Math.min(source.duration,s.options.sectionEnd,s.options.sectionStart+elapsed*s.options.playBpm/s.options.sourceBpm):Math.min(source.duration,phraseInspectTime);
  const held=playing&&time>=Math.min(source.duration,s.options.sectionEnd)?[]:model.notes.filter(n=>n.start<=time&&n.keyEnd>time);
  const live=[...new Set([...phraseRawHeld].map(k=>Number(k.split(":")[1])))];
  const showingLive=!phraseViewExample&&(recording||!source.notes.length||(!playing&&live.length>0));
  const practicing=s.state==="practice"||s.state==="countin";
  const pitches=showingLive?live:practicing?s.target:held.map(n=>n.midi);
  // Same physical pitches on staff, roll and keyboard; pedal tails are deliberately not held keys.
  const highlighted=new Set(playing?held.map(n=>n.midi):showingLive?live:[]);
  for(const key of piano.querySelectorAll(".key")){const on=highlighted.has(Number(key.dataset.midi));key.classList.toggle("phrasePlaying",on);if(on)key.setAttribute("aria-label",key.title+(playing?" · playing, key held":" · live key held"));else if(key.title)key.setAttribute("aria-label",key.title);}
  if(show){
    document.getElementById("phraseStaff").innerHTML=view.staffSVG(pitches,{spelling:phraseViewSpelling,names:phraseViewNames});
    const names=[...new Set(pitches)].sort((a,b)=>a-b).map(n=>view.pitch(n,phraseViewSpelling).name);
    document.getElementById("phrasePitchText").textContent=(phraseViewExample?"EXAMPLE — C major + bass, not your recording: ":playing?"Playing keys: ":showingLive?"Live keys: ":practicing?"Target keys: ":"At cursor: ")+(names.join(" · ")||"No keys held")+". C4 = middle C.";
    const width=Math.max(320,panel.clientWidth||800),start=Math.max(0,time-phraseViewWindow/4),end=Math.min(Math.max(source.duration,phraseViewWindow),start+phraseViewWindow);
    document.getElementById("phraseRoll").innerHTML=view.rollSVG(model,{start,end,cursor:time,maxNotes:400,width,height:small?110:150,names:phraseViewNames,spelling:phraseViewSpelling});
    const seek=document.getElementById("phraseViewTime");seek.max=String(Math.max(.01,source.duration/1000));seek.value=String(time/1000);seek.disabled=playing||recording||!source.notes.length;
    document.getElementById("phraseViewTimeLabel").textContent=(time/1000).toFixed(2)+" s";
    const cc=new Map((source.initialControllers||[]).map(c=>[c.channel+":"+c.controller,c.value]));
    for(const c of source.controllers||[])if(c.time<=time)cc.set(c.channel+":"+c.controller,c.value);
    const channels=[...new Set(model.notes.filter(n=>n.start<=time&&n.soundEnd>time).map(n=>n.channel))];
    const sectionContext=!phraseViewExample&&(s.options.sectionStart>0||s.options.sectionEnd<source.duration)?"Source context; playback stops at "+(Math.min(source.duration,s.options.sectionEnd)/1000).toFixed(2)+" s. ":"";
    document.getElementById("phraseControllerText").textContent=sectionContext+(channels.length?channels.map(ch=>"Ch "+(ch+1)+": pedal "+((cc.get(ch+":64")||0)>=64?"down":"up")+" · volume "+(cc.get(ch+":7")??100)+" · expression "+(cc.get(ch+":11")??127)).join(" | "):"Unquantized source seconds · solid key lengths; pedal tails are not extra pressed notes.");
  }
  if(playing&&!document.hidden)phraseViewTick=setTimeout(renderPhraseView,80);
}
for(const [id,apply]of[
  ["phraseViewVisibility",event=>{phraseViewVisibility=event.target.value;phraseSmallScore=phraseViewVisibility==="show";}],
  ["phraseSpelling",event=>{phraseViewSpelling=event.target.value;}],
  ["phraseNoteNames",event=>{phraseViewNames=event.target.checked;}]
])document.getElementById(id).addEventListener("change",event=>{apply(event);savePhraseViewPreferences();refreshPhraseUI();});
document.getElementById("phraseViewSwitch").addEventListener("click",()=>{const showing=!document.getElementById("phraseScore").hidden;phraseSmallScore=!showing;phraseViewVisibility="auto";savePhraseViewPreferences();renderPhraseView();});
document.getElementById("phraseViewTime").addEventListener("input",event=>{phraseInspectTime=Number(event.target.value)*1000;renderPhraseView();});

function phraseDisplayName(midi,withOctave=true){const name=window.KeyMemoryPhraseView?window.KeyMemoryPhraseView.pitch(midi,phraseViewSpelling).name.replace("#","♯").replace(/([A-G])b/,"$1♭"):noteName(midi)+(Math.floor(midi/12)-1);return withOctave?name:name.replace(/-?\d+$/,"");}
document.getElementById("phraseViewWindow").addEventListener("change",event=>{phraseViewWindow=Number(event.target.value);renderPhraseView();});

document.getElementById("phraseViewExample").addEventListener("click",()=>{phraseViewExample=!phraseViewExample;phraseInspectTime=0;phraseViewVisibility="show";phraseSmallScore=true;renderPhraseView();});
