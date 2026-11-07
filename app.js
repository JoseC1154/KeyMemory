// FILE: app.js
"use strict";

// The design and key proportions are adapted from KeyTransposer.
// Unlike KeyTransposer, KeyMemory only renders a screen-fitting range.
const piano = document.getElementById("piano");
const rangeText = document.getElementById("rangeText");
const noteText = document.getElementById("noteText");
const selected = new Set();
const APP_VERSION = "2026.11.07.49";
let midiController = null;
let midiTransportState={enabled:false,mappings:{},learning:null},phrasePracticeVisible=true;
try{phrasePracticeVisible=localStorage.getItem("keymemory.phrase.practicePanel")!=="hidden";}catch{}
let phraseEngine = null, phraseSnapshot = null, phraseImporter = null;
const phraseRawHeld=new Set();
// Physical presses are independent of musical grading and reserved MIDI shortcuts.
const physicalMidiHeld=new Set();
let phraseSeenLow=21,phraseSeenHigh=108;
let phraseViewVisibility="auto",phraseViewSpelling="sharp",phraseViewNames=true,phraseSmallScore=false,phraseInspectTime=0,phraseViewWindow=6000,phraseViewExample=false,phrasePianoScroll=0;
let phraseViewModel=null,phraseViewSignature="",phraseViewTick=null,phraseViewStamp=0,phraseInspectSelected=false,phraseInspectWindowStart=null;
let phraseLoopDraft=null,phraseLoopDrag=null,phraseForgivenessPreview=null;
try{const prefs=JSON.parse(localStorage.getItem("keymemory.phrase.view")||"{}");if(["auto","show","hide"].includes(prefs.visibility))phraseViewVisibility=prefs.visibility;if(prefs.spelling==="flat")phraseViewSpelling="flat";if(prefs.names===false)phraseViewNames=false;}catch{}
const wrongKeyFeedback = new Map();
const WRONG_KEY_DURATION = 950;
function clearWrongKeyFeedback() {
  for (const feedback of wrongKeyFeedback.values()) clearTimeout(feedback.timer);
  wrongKeyFeedback.clear();
  piano.querySelectorAll(".wrongAnswer").forEach(key => {
    key.classList.remove("wrongAnswer");
    key.style.removeProperty("--wrong-key-delay");
  });
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
    if(activeMode==="scale")prepareScaleRun();
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
let scaleRaceDeadline=0,scaleStreak=0,scaleAskedAt=0,scaleTarget=0,scaleRuns=0;
const SCALE_RACE_MS=10000,SCALE_DEGREE_MS=2000,SCALE_SUCCESS_MS=300,SCALE_QUESTION_PREVIEW_MS=2000,SCALE_LEVELUP_MS=2500;
let scaleAttemptMistakes=0;
let scaleLives=3,scaleCorrection=null,scaleQuestionsShown=0,scaleStartGuardUntil=0;
let scaleUserPause=null,scalePreviewDeadline=0,scalePreviewTick=null,scalePreviewScheduleId=0;
let scaleDialogPause=null,scaleFeedbackScheduleId=0,scaleFeedbackDeadline=0,scaleFeedbackCallback=null,scaleDegreeTick=null;
let scaleReverseStreak=0,scaleReverseIndex=0,scaleReverseDeadline=0,scaleReverseWrongIndex=null;
const SCALE_REVERSE_SHOW_MS=2000,SCALE_REVERSE_ANSWER_MS=2000;
let scaleDegreeDeadline=0,scaleDegreeTimer=null,scaleDegreeInterval=null,scaleGeneration=0,scaleQuestionId=0;
const scaleNoteName=midi=>noteName(midi)+(Math.floor(midi/12)-1);
const scaleStatus=document.getElementById("scaleStatus");
const scaleMasteryKey="keymemory.scale.mastery.v1";
let scaleMastery={};
try {
  const saved=JSON.parse(localStorage.getItem(scaleMasteryKey)||"{}");
  if(saved && typeof saved==="object" && !Array.isArray(saved)) scaleMastery=saved;
} catch(_) {}
const scaleReverseMasteryKey="keymemory.scale.reverse.mastery.v1";
let scaleReverseMastery={};
try{const saved=JSON.parse(localStorage.getItem(scaleReverseMasteryKey)||"{}");if(saved&&typeof saved==="object"&&!Array.isArray(saved))scaleReverseMastery=saved;}catch(_){}
function priorMasteredRoots(){
  const stored=scaleMastery[scaleType.value];
  return Array.isArray(stored)?new Set(stored.filter(n=>Number.isInteger(n)&&n>=0&&n<12)):new Set();
}
function masteredRoots(){
  const stored=scaleReverseMastery[scaleType.value],prior=priorMasteredRoots();
  return Array.isArray(stored) ? new Set(stored.filter(n=>Number.isInteger(n)&&n>=0&&n<12&&prior.has(n))) : new Set();
}
function setScaleQuestion(title,detail=""){
  document.getElementById("scaleQuestionTitle").textContent=title;
  document.getElementById("scaleQuestionDetail").textContent=detail;
  trainingPrompt.textContent=title+(detail?" · "+detail:"");
}
function updateScaleStatus(){
  document.getElementById("pauseScale").hidden=activeMode!=="scale";
  scaleStatus.hidden=activeMode!=="scale";
  const studyName=document.getElementById("scaleStudyName");studyName.hidden=activeMode!=="scale";
  if(activeMode==="scale")studyName.textContent=scaleRoot.selectedOptions[0].textContent+" "+scaleType.selectedOptions[0].textContent;
  document.getElementById("continueScaleCorrection").hidden=activeMode!=="scale"||scalePhase!=="correction";
  document.getElementById("scaleQuestion").hidden=activeMode!=="scale";
  trainingPrompt.hidden=activeMode==="scale";
  const panel=document.querySelector(".practicePanel");panel.classList.toggle("scalePractice",activeMode==="scale");panel.dataset.scalePhase=scalePhase;
  const reverse=activeMode==="scale"&&(scalePhase.startsWith("reverse-")||(scalePhase==="correction"&&scaleCorrection?.stage==="reverse-answer"));
  document.querySelector(".shell").classList.toggle("scaleReverseMode",reverse);
  document.querySelector(".shell").classList.toggle("scaleCorrectionMode",activeMode==="scale"&&scalePhase==="correction");
  document.querySelectorAll(".scaleLivesMirror").forEach(el=>el.textContent="Lives "+scaleLives+"/5.");
  updateScaleReverseChoices();
  if(activeMode!=="scale")return;
  const count=masteredRoots().size;
  const forward=["levelup","degree-preview","degrees","degree-success"].includes(scalePhase)||(scalePhase==="correction"&&scaleCorrection?.stage==="degrees");
  const finished=scalePhase==="passed";
  const answered=reverse||finished?scaleReverseStreak:forward?scaleStreak:scaleRuns;
  const remaining=Math.max(0,(reverse||forward||finished?30:4)-answered);
  document.getElementById("scaleRemaining").textContent=remaining+(reverse||forward||finished?" questions left":" runs left");
  document.getElementById("scaleRemainingLabel").textContent=finished?"Key complete":reverse?"Name the degree":forward?"Find the key":"Full scale";
  const score=reverse||finished?" · "+scaleReverseStreak+"/30 reverse answers":forward?" · "+scaleStreak+"/30 correct":" · "+scaleRuns+"/4 runs complete";
  document.getElementById("scaleStatusDetail").textContent="Lives "+scaleLives+"/5 · "+count+"/12 keys mastered"+score+(priorMasteredRoots().size>count?" · "+priorMasteredRoots().size+"/12 prior level completed":"");
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
function queueScaleFeedback(callback,delay){
  const schedule=++scaleFeedbackScheduleId;scaleFeedbackCallback=callback;scaleFeedbackDeadline=performance.now()+delay;
  scaleFeedbackTimer=setTimeout(()=>{if(scaleFeedbackScheduleId!==schedule||scaleDialogPause)return;scaleFeedbackTimer=null;scaleFeedbackCallback=null;callback();},delay);
}
function scheduleScalePreview(delay){
  const schedule=++scalePreviewScheduleId;scalePreviewDeadline=performance.now()+delay;
  scalePreviewInterval=setTimeout(()=>{if(schedule!==scalePreviewScheduleId||scaleDialogPause)return;scalePreviewInterval=null;scalePreviewTick?.();},delay);
}
function pauseScaleForDialog(explicit=false){
  if(activeMode!=="scale"||scaleDialogPause||(!explicit&&["preview","ready","degree-preview"].includes(scalePhase)))return;
  stopBuilderAudio();
  const now=performance.now();
  scaleDialogPause={pausedAt:now,preview:scalePreviewInterval!==null?Math.max(0,scalePreviewDeadline-now):null,phase:scalePhase,generation:scaleGeneration,question:scaleQuestionId,
    race:scaleRaceInterval!==null?Math.max(0,scaleRaceDeadline-now):null,
    degree:scaleDegreeTimer!==null||scaleDegreeInterval!==null?Math.max(0,(scalePhase.startsWith("reverse-")?scaleReverseDeadline:scaleDegreeDeadline)-now):null,
    tick:scaleDegreeTick,feedback:scaleFeedbackTimer!==null?Math.max(0,scaleFeedbackDeadline-now):null,callback:scaleFeedbackCallback};
  scalePreviewScheduleId++;
  if(scalePreviewInterval!==null)clearTimeout(scalePreviewInterval);scalePreviewInterval=null;
  if(scaleRaceInterval!==null)clearInterval(scaleRaceInterval);scaleRaceInterval=null;
  if(scaleDegreeTimer!==null)clearTimeout(scaleDegreeTimer);if(scaleDegreeInterval!==null)clearInterval(scaleDegreeInterval);scaleDegreeTimer=null;scaleDegreeInterval=null;
  if(scaleFeedbackTimer!==null)clearTimeout(scaleFeedbackTimer);scaleFeedbackTimer=null;scaleFeedbackScheduleId++;
}
function resumeScaleAfterDialog(){
  const paused=scaleDialogPause;scaleDialogPause=null;
  if(!paused||activeMode!=="scale"||scalePhase!==paused.phase||scaleGeneration!==paused.generation||scaleQuestionId!==paused.question)return;
  const now=performance.now();
  if(scaleAskedAt)scaleAskedAt+=now-paused.pausedAt;
  if(paused.preview!==null&&scalePreviewTick)scheduleScalePreview(paused.preview);
  if(paused.race!==null){scaleRaceDeadline=now+paused.race;scaleRaceTick(paused.generation);if(scalePhase===paused.phase)scaleRaceInterval=setInterval(()=>scaleRaceTick(paused.generation),80);}
  if(paused.degree!==null&&paused.tick){
    if(scalePhase.startsWith("reverse-"))scaleReverseDeadline=now+paused.degree;else scaleDegreeDeadline=now+paused.degree;
    paused.tick();if(scalePhase===paused.phase){scaleDegreeTimer=setTimeout(paused.tick,paused.degree);scaleDegreeInterval=setInterval(paused.tick,50);}
  }
  if(paused.feedback!==null&&paused.callback)queueScaleFeedback(paused.callback,paused.feedback);
}
function clearScaleDegreeClock(){
  if(scaleDegreeTimer!==null)clearTimeout(scaleDegreeTimer);
  if(scaleDegreeInterval!==null)clearInterval(scaleDegreeInterval);
  scaleDegreeTimer=null;scaleDegreeInterval=null;scaleQuestionId++;
}
function clearScaleDelay(){
  discardScaleUserPause();
  if(activeMode==="scale")stopBuilderAudio();
  scaleGeneration++;scaleFeedbackScheduleId++;scalePreviewScheduleId++;scaleDialogPause=null;scaleFeedbackCallback=null;clearScaleDegreeClock();
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
  const next=scaleNotes[scaleIndex],previous=scaleNotes[scaleIndex-1];targetMidi=next;
  setScaleQuestion("DEGREE "+SCALE_DEGREES[scaleType.value][scaleIndex],scaleIndex===0?"Play the root "+scaleNoteName(next)+" · 10 seconds for the whole run":"From "+scaleNoteName(previous)+" move "+(next-previous)+" semitone"+(next-previous===1?"":"s")+" UP");
}
function prepareScaleRun(){
  if(activeMode!=="scale")return;
  if(scalePhase==="passed"){scaleRuns=0;scaleStreak=0;scaleReverseStreak=0;scaleQuestionsShown=0;scaleAttemptMistakes=0;if(scaleLives<=0)scaleLives=3;scaleCorrection=null;}
  clearScaleDelay();stopCountdown();dismissAchievement();scaleCorrection=null;scaleReverseWrongIndex=null;scaleBuildNotes();scalePhase="ready";scaleRaceDeadline=0;scaleDegreeDeadline=0;targetMidi=null;selected.clear();
  scaleStart.hidden=true;nextChallenge.hidden=true;
  setScaleQuestion("Run "+(scaleRuns+1)+" of 4", "Press Start run in the modal when ready. Your 10 seconds have not started.");
  document.getElementById("scaleRunTitle").textContent="Run "+(scaleRuns+1)+" of 4";
  document.getElementById("scaleRunScale").textContent=scaleRoot.selectedOptions[0].textContent+" "+scaleType.selectedOptions[0].textContent+" · "+scaleNoteName(scaleNotes[0])+"–"+scaleNoteName(scaleNotes.at(-1));
  document.getElementById("scaleRunInstructions").textContent="Play the full ascending scale, including its root and upper tonic, within 10 seconds. The timer starts only after Start run.";
  renderPiano();updatePracticeChrome();openPracticeDialog("scaleRunOverlay","scaleStart");dialogReturnFocus=scaleStart;
}
function completeScaleRun(){
  clearScaleDelay();stopCountdown();dismissAchievement();scaleRuns++;targetMidi=null;selected.clear();
  if(scaleRuns<4){prepareScaleRun();return;}
  scalePhase="levelup";
  setScaleQuestion("LEVEL UP!","Four runs complete. Degree questions begin in 2.5 seconds · 2 seconds per answer.");
  renderPiano();updatePracticeChrome();const generation=scaleGeneration;
  queueScaleFeedback(()=>{if(activeMode!=="scale"||scalePhase!=="levelup"||scaleGeneration!==generation)return;scaleFeedbackTimer=null;startScaleDegreeTest();},SCALE_LEVELUP_MS);
}
function continueScaleCorrection(){
  if(activeMode!=="scale"||scalePhase!=="correction"||!scaleCorrection||currentDialog||document.hidden)return;
  stopBuilderAudio();clearWrongKeyFeedback();
  const stage=scaleCorrection.stage;
  scaleCorrection=null;scaleReverseWrongIndex=null;selected.clear();dismissAchievement();
  if(scaleLives===0){
    startScalePreview();
    // A native double click may land its second click on the replacement Start
    // button. Briefly lock only that replacement, not legitimate piano input.
    const generation=scaleGeneration;scaleStartGuardUntil=performance.now()+600;scaleStart.disabled=true;
    setTimeout(()=>{if(activeMode==="scale"&&scalePhase==="preview"&&scaleGeneration===generation)scaleStart.disabled=false;},600);
    document.getElementById("scaleQuestion").focus({preventScroll:true});return;
  }
  if(stage==="race")prepareScaleRun();
  else if(stage==="degrees"){scalePhase="degrees";nextScaleDegree();}
  else{nextScaleReverse();document.getElementById("scaleQuestion").focus({preventScroll:true});}
}
function failScaleAttempt(message){
  if(activeMode!=="scale"||!["race","degrees","reverse-answer"].includes(scalePhase))return;
  const stage=scalePhase,index=stage==="reverse-answer"?scaleReverseIndex:stage==="race"?scaleIndex:scaleNotes.indexOf(scaleTarget),midi=scaleNotes[index];
  clearScaleDelay();stopCountdown();dismissAchievement();scaleAttemptMistakes++;scaleLives=Math.max(0,scaleLives-1);
  scaleCorrection={stage,index,midi,message};scalePhase="correction";scaleReverseDeadline=0;scaleRaceDeadline=0;scaleDegreeDeadline=0;targetMidi=null;selected.clear();
  const labels=SCALE_DEGREES[scaleType.value],degree=labels.length===8?String(index+1)+(labels[index]!==String(index+1)?" ("+labels[index]+")":""):labels[index];
  const reason=message.includes("elapsed")?"Time expired":"Wrong answer";
  const next=scaleLives===0?"Restart all four runs":stage==="race"?"Retry run "+(scaleRuns+1)+"/4":"Continue with your score";
  setScaleQuestion(stage==="reverse-answer"?"CORRECT DEGREE "+degree:"CORRECT: "+scaleNoteName(midi),(stage==="reverse-answer"?scaleNoteName(midi):"Degree "+degree)+" · "+reason+" · "+scaleLives+" lives left · Press Continue: "+next);
  renderPiano();updatePracticeChrome();document.getElementById("continueScaleCorrection").focus({preventScroll:true});
}
function startScalePreview(){
  scaleStartGuardUntil=0;scaleStart.disabled=false;clearWrongKeyFeedback();
  if(["scaleRunOverlay","scaleDegreeOverlay"].includes(currentDialog?.id))closePracticeDialog({cancelScaleRun:false});
  clearScaleDelay();stopCountdown();dismissAchievement();scaleBuildNotes();
  scalePhase="preview";scaleQuestionsShown=0;scaleAttemptMistakes=0;if(scaleLives<=0)scaleLives=3;scaleCorrection=null;scaleReverseStreak=0;scaleReverseDeadline=0;scaleReverseWrongIndex=null;scaleIndex=0;scaleStreak=0;scaleRuns=0;scaleRaceDeadline=0;scaleDegreeDeadline=0;targetMidi=null;selected.clear();
  scaleStart.hidden=false;scaleStart.textContent="Start scale race";
  nextChallenge.hidden=true;timerRemaining.textContent="";
  setScaleQuestion("Study the scale",scaleNoteName(scaleNotes[0])+"–"+scaleNoteName(scaleNotes.at(-1))+" · Four complete runs, 10 seconds each. Press Start when ready.");
  const generation=scaleGeneration;
  function showDegree(){
    if(scaleDialogPause||activeMode!=="scale"||scalePhase!=="preview"||scaleGeneration!==generation)return;
    selected.clear(); selected.add(scaleNotes[scalePreviewIndex]);
    resetMidiAudio();soundMidiNote(scaleNotes[scalePreviewIndex]);
    renderPiano();
    scalePreviewIndex=(scalePreviewIndex+1)%scaleNotes.length;
    scheduleScalePreview(650);
  }
  scalePreviewTick=showDegree;scalePreviewIndex=0;showDegree();
  updatePracticeChrome();updateScaleStatus();
}
function scaleRaceTick(generation=scaleGeneration){
  if(scaleDialogPause||activeMode!=="scale"||scalePhase!=="race"||scaleGeneration!==generation)return;
  const remaining=Math.max(0,scaleRaceDeadline-performance.now());
  timerRemaining.textContent=(remaining/1000).toFixed(1)+"s";
  document.querySelectorAll(".countdownMirror").forEach(el=>el.textContent=timerRemaining.textContent);
  if(remaining<=0)failScaleAttempt("10 seconds elapsed.");
}

function startScaleRace(){
  if(scalePhase==="passed"){scaleRuns=0;scaleStreak=0;scaleReverseStreak=0;scaleQuestionsShown=0;scaleAttemptMistakes=0;if(scaleLives<=0)scaleLives=3;scaleCorrection=null;}
  clearScaleDelay();stopCountdown();dismissAchievement();scaleBuildNotes();
  scalePhase="race";scaleIndex=0;targetMidi=null;selected.clear();
  midiController?.resetQuestion();scaleStart.hidden=true;nextChallenge.hidden=true;
  renderPiano();scalePrompt();
  scaleRaceDeadline=performance.now()+SCALE_RACE_MS;
  const generation=scaleGeneration;scaleRaceTick(generation);scaleRaceInterval=setInterval(()=>scaleRaceTick(generation),80);
  updatePracticeChrome();updateScaleStatus();
}
function startScaleDegreeTest(){
  clearScaleDelay();stopCountdown();scalePhase="degrees";scaleStreak=0;scaleQuestionsShown=0;
  scaleStart.hidden=true;selected.clear();nextChallenge.hidden=true;
  dismissAchievement();
  nextScaleDegree();
  updateScaleStatus();
}
function nextScaleDegree(){
  if(scalePhase!=="degrees")return;
  stopBuilderAudio();
  if(document.hidden){startScalePreview();return;}
  clearScaleDegreeClock();selected.clear();scaleIndex=0;
  const index=Math.floor(Math.random()*scaleNotes.length);
  scaleTarget=scaleNotes[index];targetMidi=null;scalePhase="degree-preview";scaleDegreeDeadline=0;
  // MIDI already rejects duplicate held note-ons; allow a new legato note immediately.
  setScaleQuestion("DEGREE "+SCALE_DEGREES[scaleType.value][index],scaleNoteName(scaleNotes[0])+"–"+scaleNoteName(scaleNotes.at(-1))+" · Answer within 2 seconds");
  renderPiano();updatePracticeChrome();
  document.getElementById("scaleDegreeTitle").textContent="DEGREE "+SCALE_DEGREES[scaleType.value][index];
  document.getElementById("scaleDegreeRange").textContent=scaleRoot.selectedOptions[0].textContent+" "+scaleType.selectedOptions[0].textContent+" · "+scaleNoteName(scaleNotes[0])+"–"+scaleNoteName(scaleNotes.at(-1));
  const manual=scaleQuestionsShown<5;scaleQuestionsShown++;
  document.getElementById("confirmScaleDegree").hidden=!manual;
  document.getElementById("scaleDegreeInstructions").textContent=manual?"Question "+scaleQuestionsShown+" of the first 5. Press Start answering when ready; then you have two seconds.":"Read the question. The keys appear after two seconds, then you have two seconds to answer.";
  openPracticeDialog("scaleDegreeOverlay","scaleStart");dialogReturnFocus=scaleStart;
  if(manual)return;
  const generation=scaleGeneration,question=scaleQuestionId;
  queueScaleFeedback(()=>{
    if(activeMode!=="scale"||scalePhase!=="degree-preview"||scaleGeneration!==generation||scaleQuestionId!==question||currentDialog?.id!=="scaleDegreeOverlay")return;
    if(document.hidden){startScalePreview();return;}
    scaleFeedbackTimer=null;beginScaleDegreeAnswer();
  },SCALE_QUESTION_PREVIEW_MS);
}
function beginScaleDegreeAnswer(){
  if(activeMode!=="scale"||scalePhase!=="degree-preview"||currentDialog?.id!=="scaleDegreeOverlay")return;
  if(document.hidden){startScalePreview();return;}
  closePracticeDialog({cancelScaleRun:false});scalePhase="degrees";targetMidi=scaleTarget;
  renderPiano();updatePracticeChrome();piano.querySelector(".key")?.focus({preventScroll:true});startScaleDegreeClock();
}
function startScaleDegreeClock(){
  scaleAskedAt=performance.now();scaleDegreeDeadline=scaleAskedAt+SCALE_DEGREE_MS;
  const generation=scaleGeneration,question=scaleQuestionId;
  const tick=()=>{
    if(scaleDialogPause||activeMode!=="scale"||scalePhase!=="degrees"||scaleGeneration!==generation||scaleQuestionId!==question)return;
    const remaining=Math.max(0,scaleDegreeDeadline-performance.now());
    timerRemaining.textContent=(remaining/1000).toFixed(1)+"s";
    document.querySelectorAll(".countdownMirror").forEach(el=>el.textContent=timerRemaining.textContent);
    if(remaining<=0)failScaleAttempt("2 seconds elapsed.");
  };
  scaleDegreeTick=tick;tick();scaleDegreeTimer=setTimeout(tick,SCALE_DEGREE_MS);scaleDegreeInterval=setInterval(tick,50);
}
function updateScaleReverseChoices(){
  const box=document.getElementById("scaleReverseChoices");
  const visible=activeMode==="scale"&&(scalePhase.startsWith("reverse-")||(scalePhase==="correction"&&scaleCorrection?.stage==="reverse-answer"));
  box.hidden=!visible;
  const cue=document.getElementById("scaleReverseCue"),clock=document.getElementById("scaleReverseCountdown");
  cue.hidden=!visible||!["reverse-show","reverse-answer"].includes(scalePhase);
  document.getElementById("scaleReverseCueLabel").textContent=scalePhase==="reverse-answer"?"CHOOSE NOW":"WATCH THE KEY";
  clock.hidden=scalePhase!=="reverse-answer";
  if(scalePhase==="reverse-answer")clock.textContent=(Math.max(0,scaleDialogPause?.degree??(scaleReverseDeadline-performance.now()))/1000).toFixed(1)+"s";
  box.classList.toggle("watchPhase",visible&&scalePhase==="reverse-show");
  box.classList.toggle("answerPhase",visible&&scalePhase==="reverse-answer");
  if(!visible)return;
  const labels=SCALE_DEGREES[scaleType.value],heptatonic=labels.length===8;
  if(box.dataset.scaleType!==scaleType.value){
    box.replaceChildren();box.dataset.scaleType=scaleType.value;
    labels.forEach((label,index)=>{
      const button=document.createElement("button");button.type="button";button.dataset.degreeIndex=String(index);button.className="scaleDegreeChoice";
      const number=document.createElement("strong");number.textContent=heptatonic?String(index+1):label;button.append(number);
      if(heptatonic&&label!==String(index+1)){const formula=document.createElement("small");formula.textContent=label;button.append(formula);}
      button.setAttribute("aria-label","Degree "+(heptatonic?String(index+1):label)+(heptatonic&&label!==String(index+1)?", formula "+label:""));
      button.addEventListener("click",()=>answerScaleReverse(index));box.append(button);
    });
  }
  for(const button of box.children){
    const index=Number(button.dataset.degreeIndex);button.disabled=scalePhase!=="reverse-answer";
    const correct=(scalePhase==="reverse-success"||scalePhase==="correction")&&index===scaleReverseIndex;
    button.classList.toggle("correctChoice",correct);button.classList.toggle("wrongChoice",scalePhase==="correction"&&index===scaleReverseWrongIndex);
    button.setAttribute("aria-pressed",String(correct));
  }
}
function startScaleReverseLevel(){
  clearScaleDelay();stopCountdown();targetMidi=null;selected.clear();scaleReverseStreak=0;scaleReverseDeadline=0;scaleReverseWrongIndex=null;
  const prior=priorMasteredRoots();prior.add(Number(scaleRoot.value));scaleMastery[scaleType.value]=[...prior].sort((a,b)=>a-b);
  try{localStorage.setItem(scaleMasteryKey,JSON.stringify(scaleMastery));}catch(_){}
  scalePhase="reverse-levelup";setScaleQuestion("LEVEL UP!","Now identify the highlighted key’s degree. Watch for 2 seconds, then choose a circle within 2 seconds. 30 correct to master this key.");
  renderPiano();updatePracticeChrome();const generation=scaleGeneration;
  queueScaleFeedback(()=>{if(activeMode!=="scale"||scalePhase!=="reverse-levelup"||scaleGeneration!==generation)return;scaleFeedbackTimer=null;nextScaleReverse();},SCALE_LEVELUP_MS);
}
function scaleReverseClock(phase,duration,onElapsed){
  clearScaleDegreeClock();scaleReverseDeadline=performance.now()+duration;
  const generation=scaleGeneration,question=scaleQuestionId;
  const tick=()=>{
    if(scaleDialogPause||activeMode!=="scale"||scalePhase!==phase||scaleGeneration!==generation||scaleQuestionId!==question)return;
    const remaining=Math.max(0,scaleReverseDeadline-performance.now());timerRemaining.textContent=(remaining/1000).toFixed(1)+"s";
    document.querySelectorAll(".countdownMirror").forEach(el=>el.textContent=timerRemaining.textContent);
    if(phase==="reverse-answer")document.getElementById("scaleReverseCountdown").textContent=(remaining/1000).toFixed(1)+"s";
    if(remaining<=0){clearScaleDegreeClock();onElapsed();}
  };
  scaleDegreeTick=tick;tick();scaleDegreeTimer=setTimeout(tick,duration);scaleDegreeInterval=setInterval(tick,50);
}
function nextScaleReverse(){
  if(activeMode!=="scale")return;
  stopBuilderAudio();
  if(document.hidden||currentDialog){startScalePreview();return;}
  clearScaleDegreeClock();scaleReverseIndex=Math.floor(Math.random()*scaleNotes.length);scalePhase="reverse-show";targetMidi=null;selected.clear();scaleReverseWrongIndex=null;
  setScaleQuestion("WATCH THE KEY","Remember its degree · circles unlock after the 2-second highlight.");
  renderPiano();updatePracticeChrome();
  scaleReverseClock("reverse-show",SCALE_REVERSE_SHOW_MS,()=>{
    stopBuilderAudio();scalePhase="reverse-answer";setScaleQuestion("CHOOSE NOW","Choose a circle below the piano · 2 seconds to answer.");renderPiano();updatePracticeChrome();
    document.querySelector(".scaleDegreeChoice")?.focus({preventScroll:true});
    scaleReverseClock("reverse-answer",SCALE_REVERSE_ANSWER_MS,()=>failScaleAttempt("2 seconds elapsed."));
    soundScaleChooseCue();
  });
}
function answerScaleReverse(index){
  if(activeMode!=="scale"||scalePhase!=="reverse-answer"||currentDialog||document.hidden)return;
  if(performance.now()>=scaleReverseDeadline){failScaleAttempt("2 seconds elapsed.");return;}
  if(index!==scaleReverseIndex){scaleReverseWrongIndex=index;failScaleAttempt("Wrong degree number.");return;}
  stopBuilderAudio();clearScaleDegreeClock();stopCountdown();scaleReverseStreak++;scalePhase="reverse-success";
  const labels=SCALE_DEGREES[scaleType.value],label=labels.length===8?String(index+1)+(labels[index]!==String(index+1)?" ("+labels[index]+")":""):labels[index];
  setScaleQuestion("CORRECT — DEGREE "+label,scaleReverseStreak+"/30 reverse answers");renderPiano();updatePracticeChrome();
  const generation=scaleGeneration,question=scaleQuestionId;
  queueScaleFeedback(()=>{if(activeMode!=="scale"||scalePhase!=="reverse-success"||scaleGeneration!==generation||scaleQuestionId!==question)return;scaleFeedbackTimer=null;if(scaleReverseStreak===30)finishScaleAttempt();else nextScaleReverse();},SCALE_SUCCESS_MS);
}
function finishScaleAttempt(){
  if(scalePhase==="passed")return;
  clearScaleDelay();stopCountdown();targetMidi=null;scalePhase="passed";
  const mastered=masteredRoots();
  const newlyMastered=!mastered.has(Number(scaleRoot.value));
  const flawless=newlyMastered&&scaleAttemptMistakes===0;
  const gainedLife=flawless&&scaleLives<5;
  if(gainedLife)scaleLives++;
  const reward=gainedLife?"Flawless key! +1 life · "+scaleLives+" lives carry forward. ":flawless?"Flawless key! Lives are at the maximum of 5. ":"";
  mastered.add(Number(scaleRoot.value));
  scaleReverseMastery[scaleType.value]=[...mastered].sort((a,b)=>a-b);
  try {localStorage.setItem(scaleReverseMasteryKey,JSON.stringify(scaleReverseMastery));} catch(_) {}
  const complete=mastered.size===12;
  celebrate(reward+(complete ? "All 12 keys mastered for this scale!" : "Key mastered! Moving to the next key."));
  scaleStart.hidden=true;nextChallenge.hidden=true;
  setScaleQuestion("30/30 — KEY MASTERED!",reward+(complete?"All 12 keys mastered for this scale!":"Next unmastered key is coming up."));updatePracticeChrome();
  const generation=scaleGeneration;
  queueScaleFeedback(()=>{
    if(activeMode!=="scale"||scalePhase!=="passed"||scaleGeneration!==generation)return;
    scaleFeedbackTimer=null;
    if(complete){
      scalePhase="passed";
      setScaleQuestion("ALL 12 KEYS MASTERED!","Choose another scale type, or review this key.");
      scaleStart.hidden=false;scaleStart.textContent="Review this scale";
      updateScaleStatus();
      return;
    }
    selectNextScaleRoot();
    startScalePreview();
  },2600);
}
function answerScaleKey(midi){
  if(targetMidi===null||scaleRestarting||!["race","degrees"].includes(scalePhase))return null;
  if(scalePhase==="race"){
    if(performance.now()>=scaleRaceDeadline){failScaleAttempt("10 seconds elapsed.");return null;}
    if(midi!==targetMidi){failScaleAttempt("Wrong note.");return false;}
    stopBuilderAudio();selected.add(midi);scaleIndex++;
    if(scaleIndex===scaleNotes.length)completeScaleRun();
    else{scalePrompt();renderPiano();}
    return true;
  }
  if(performance.now()>=scaleDegreeDeadline){failScaleAttempt("2 seconds elapsed.");return null;}
  if(midi!==scaleTarget){failScaleAttempt("Wrong degree.");return false;}
  stopBuilderAudio();scaleStreak++;clearScaleDegreeClock();stopCountdown();scalePhase="degree-success";targetMidi=null;
  selected.clear();selected.add(midi);
  setScaleQuestion("CORRECT — "+scaleNoteName(midi),scaleStreak===30?"30/30 correct. Reverse-degree level next!":"Next degree question in a moment · "+scaleStreak+"/30 correct");
  renderPiano();updatePracticeChrome();const generation=scaleGeneration,question=scaleQuestionId;
  queueScaleFeedback(()=>{if(activeMode!=="scale"||scalePhase!=="degree-success"||scaleGeneration!==generation||scaleQuestionId!==question)return;scaleFeedbackTimer=null;if(scaleStreak===30)startScaleReverseLevel();else{scalePhase="degrees";nextScaleDegree();}},SCALE_SUCCESS_MS);
  return true;
}

scaleStart.addEventListener("click",event=>{if(currentDialog||event.detail>1||performance.now()<scaleStartGuardUntil)return;if(activeMode==="scale"&&["preview","passed"].includes(scalePhase))prepareScaleRun();});
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
const soundToggle = document.getElementById("soundToggle");
let soundEnabled=false,soundReady=false,soundUnlockRequest=0;
try{soundEnabled=localStorage.getItem("keymemory.sound.v1")==="on";}catch{}
function updateSoundControl(){
  soundToggle.setAttribute("aria-pressed",String(soundEnabled));
  const label=soundEnabled?"Sound on":"Sound off";
  soundToggle.querySelector("span").textContent=label;
  soundToggle.title=label+(soundEnabled&&!soundReady?" · tap a piano key or Replay to enable audio":" · click to "+(soundEnabled?"mute":"enable"));
  soundToggle.setAttribute("aria-label",soundToggle.title);
}
async function enableSoundAudio(){
  if(!soundEnabled)return false;
  const request=++soundUnlockRequest;
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)throw Error("Audio unavailable");
    midiAudioContext ||= new Audio();
    // Reuse one unlocked context for all engines; existing contexts stay supported.
    builderAudioContext ||= midiAudioContext;phraseAudioContext ||= midiAudioContext;
    await Promise.all([...new Set([midiAudioContext,builderAudioContext,phraseAudioContext])].map(c=>c.resume()));
    if(!soundEnabled||request!==soundUnlockRequest)return false;
    soundReady=[midiAudioContext,builderAudioContext,phraseAudioContext].every(c=>c.state==="running");
    if(!soundReady)throw Error("Audio locked");
    if(phraseAudioAnchor)phraseAudioAnchor.audio=phraseAudioContext.currentTime-(Date.now()-phraseAudioAnchor.wall)/1000;
    for(const state of phrasePlaybackChannels.values())state.gain.gain.setValueAtTime((state.volume/127)*(state.expression/127),phraseAudioContext.currentTime);
    document.getElementById("audioStatus").hidden=true;
    updateSoundControl();return true;
  }catch{
    if(request!==soundUnlockRequest||!soundEnabled)return false;
    soundReady=false;updateSoundControl();
    const status=document.getElementById("audioStatus");status.hidden=false;status.textContent="Sound is enabled, but audio is unavailable. Tap a key or Replay to try again.";
    return false;
  }
}
soundToggle.addEventListener("click",()=>{
  soundEnabled=!soundEnabled;soundUnlockRequest++;
  try{localStorage.setItem("keymemory.sound.v1",soundEnabled?"on":"off");}catch{}
  if(soundEnabled)enableSoundAudio();
  else{soundReady=false;stopBuilderAudio();resetMidiAudio();silencePhrase(false);phraseTransportWake?.();if(pendingAdvance?.mode===activeMode)scheduleAutoNext(pendingAdvance.reason);}
  updateSoundControl();updateHearControl();
});
updateSoundControl();
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
// The cue uses an already user-unlocked context. Visual timing never waits for audio.
let scaleCueVoice=null;
function stopScaleChooseCue(){
  if(!scaleCueVoice)return;
  const voice=scaleCueVoice;scaleCueVoice=null;
  try{voice.oscillator.stop();voice.oscillator.disconnect();voice.gain.disconnect();}catch(_){}
}
function soundScaleChooseCue(){
  stopScaleChooseCue();
  if(!soundEnabled||activeMode!=="scale"||scalePhase!=="reverse-answer"||currentDialog||document.hidden)return;
  const context=[midiAudioContext,builderAudioContext].find(context=>context?.state==="running");
  if(!context)return;
  try{
    const now=context.currentTime,oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type="sine";oscillator.frequency.value=880;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.055,now+.008);gain.gain.linearRampToValueAtTime(0,now+.14);
    oscillator.connect(gain);gain.connect(context.destination);
    const voice={oscillator,gain};scaleCueVoice=voice;
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();if(scaleCueVoice===voice)scaleCueVoice=null;};
    oscillator.start(now);oscillator.stop(now+.16);
  }catch(_){stopScaleChooseCue();}
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
  stopScaleChooseCue();
  if(activeMode==="scale")resetMidiAudio();
  builderAudioRequest++;
  audioResumePending=false;hearBuilder.setAttribute("aria-busy","false");
  document.getElementById("audioStatus").hidden=true;document.getElementById("audioStatus").textContent="";
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
  if(activeMode==="scale"){
    if(scalePhase==="correction"&&scaleCorrection)return [scaleCorrection.midi];
    if(scalePhase==="preview"||scalePhase==="degree-success")return [...selected];
    if(["race","degrees"].includes(scalePhase))return targetMidi===null?[]:[targetMidi];
    if(["reverse-show","reverse-success","passed"].includes(scalePhase))return scaleNotes[scaleReverseIndex]===undefined?[]:[scaleNotes[scaleReverseIndex]];
    return []; // A hidden reverse cue is not replayed during its answer test.
  }
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
  hearBuilder.disabled=!soundEnabled||notes.length===0;
  const chord=activeMode==="degrees"&&notes.length>=3 || activeMode==="builder"&&notes.length>=3 || activeMode==="dictionary"&&!dictionaryPractice;
  const label=activeMode==="semitones"&&!lastCorrectNotes.length?"Replay start note":chord?"Replay chord":notes.length===1?"Replay note":"Replay notes";
  let description=activeMode==="semitones"&&!lastCorrectNotes.length?"Hear the starting note":
    activeMode==="find"||activeMode==="remember"?"Hear the target note as an audio hint":
    activeMode==="degrees"&&!lastCorrectNotes.length?"Hear the reference chord":
    activeMode==="dictionary"&&dictionaryPractice?"Hear your selected notes":
    activeMode==="builder"?"Hear the notes built so far":activeMode==="scale"?"Hear the currently shown or requested scale note":"Hear the current notes";
  if(!notes.length)description="Select notes to hear them";
  hearBuilder.querySelector("span").textContent=label;
  if(!soundEnabled)description="Turn Sound on to replay notes";
  hearBuilder.title=description;
  hearBuilder.setAttribute("aria-label",label+" — "+description);
  hearBuilder.setAttribute("aria-busy",String(audioResumePending));
}
hearBuilder.addEventListener("click", async () => {
  const notes=currentHearNotes();
  if(!soundEnabled||!notes.length)return;
  const mode=activeMode;
  const duration=hearDuration(mode,notes);
  stopBuilderAudio();
  const request=++builderAudioRequest;
  audioResumePending=true;updateHearControl();
  cancelAutoNext(false);
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error("Audio unavailable");
    builderAudioContext ||= new Audio();
    await builderAudioContext.resume();
    if(!soundEnabled||request!==builderAudioRequest || activeMode!==mode)return;
    if(builderAudioContext.state!=="running")throw Error("Audio locked");
    midiAudioContext ||= builderAudioContext;phraseAudioContext ||= builderAudioContext;
    soundReady=true;updateSoundControl();audioResumePending=false;updateHearControl();
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
    audioResumePending=false;updateHearControl();
    const status=document.getElementById("audioStatus");status.hidden=false;status.textContent="Audio is unavailable. Try the speaker again.";
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
function flashWrongKey(midi) {
  // Every graded mode uses the same note-based feedback, even when its answer
  // handler rerenders the keyboard. Missing/timeout answers have no wrong key.
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) return;
  const previous = wrongKeyFeedback.get(midi);
  if (previous) clearTimeout(previous.timer);
  const feedback = { started: Date.now(), timer: null };
  wrongKeyFeedback.set(midi, feedback);
  piano.querySelectorAll('[data-midi="' + midi + '"]').forEach(key => {
    key.classList.remove("wrongAnswer");
    void key.offsetWidth; // Restart the visible hold/fade on rapid repeat mistakes.
    key.style.setProperty("--wrong-key-delay", "0ms");
    key.classList.add("wrongAnswer");
  });
  feedback.timer = setTimeout(() => {
    if (wrongKeyFeedback.get(midi) !== feedback) return;
    wrongKeyFeedback.delete(midi);
    piano.querySelectorAll('[data-midi="' + midi + '"]').forEach(key => {
      key.classList.remove("wrongAnswer");
      key.style.removeProperty("--wrong-key-delay");
    });
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
  phraseLoopDrag=null;phraseLoopDraft=null;phraseForgivenessPreview=null;
  if(currentDialog?.id==="phraseImportOverlay")closePracticeDialog();
  resetMidiAudio();
  if(["scaleRunOverlay","scaleDegreeOverlay"].includes(currentDialog?.id))closePracticeDialog({cancelScaleRun:false});
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
  refreshPhrasePracticePanel();
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
  if(midiTransportState.enabled)for(const m of Object.values(midiTransportState.mappings)){if(m.kind==="note")notes.push(m.number);}
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
  if(currentDialog||document.hidden)return;
  const blocked=activeMode==="scale"&&(scaleDialogPause||scalePhase.startsWith("reverse-"));
  handlePianoKey(midi,fromMidi);
  if(!blocked){if(!fromMidi)unlockMidiAudio();soundMidiNote(midi);}
}
function handlePianoKey(midi,fromMidi=false) {
  if(currentDialog || (fromMidi && document.hidden))return;
  const button=piano.querySelector('[data-midi="'+midi+'"]');
  if(activeMode==="phrase"){
    if(phraseSnapshot?.state==="practice"){phraseEngine.input({kind:"on",note:midi,velocity:100,channel:0});phraseEngine.input({kind:"off",note:midi,velocity:0,channel:0});}
    return;
  }
  if(activeMode==="scale"){
    const correct=answerScaleKey(midi);
    if(correct===false)flashWrongKey(midi);
    if(correct===true){renderPiano();updateStatusFromPiano();}
    return;
  }
  // Only correct training answers use the green selected-key feedback.
  // Ignore answers while a memory target is being shown.
  if (activeMode === "dictionary") {
    if (!dictionaryPractice || dictionaryTimedOut || checkChordAnswer.disabled) return;
    if (!dictionaryVoicing.includes(midi)) {
      flashWrongKey(midi);
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
    else if(correct===false)flashWrongKey(midi);
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
  const compactScale=activeMode==="scale"&&width>0&&width<=900&&!midiController?.isConnected();
  const scaleBase=48+Number(scaleRoot.value);
  // Add two or three chromatic neighbors on each side, ending on white keys.
  const scaleLow=scaleBase-(BLACK.has((scaleBase-2)%12)?3:2);
  const scaleHigh=scaleBase+12+(BLACK.has((scaleBase+14)%12)?3:2);
  const start = compactScale?scaleLow:activeMode === "phrase" ? phraseKeyboardRange().start : activeMode === "dictionary" ? dictionaryKeyboardRange().start : 48;
  const end = compactScale?scaleHigh+1:activeMode==="phrase"?phraseKeyboardRange().end:start + octaves * 12; // exclusive upper MIDI boundary
  const whiteCount = (compactScale||activeMode==="phrase")?Array.from({length:end-start},(_,i)=>start+i).filter(m=>!BLACK.has(m%12)).length:octaves * 7;
  const gap = 2;
  const usable = Math.max(0, width - pad * 2);
  // Fit one or two dictionary octaves in portrait; only longer ranges scroll.
  // Other modes retain two-octave scrolling with comfortable touch targets.
  const visibleWhiteKeys = activeMode === "dictionary" ? Math.min(whiteCount, 14) : 12;
  const mobileWhiteWidth = (usable - (visibleWhiteKeys - 1) * gap) / visibleWhiteKeys;
  // Cap desktop key width so a short keyboard never stretches into giant keys.
  // Use the keyboard's own natural width and center it when space remains.
  const desktopWhiteWidth = (usable - (whiteCount - 1) * gap) / whiteCount;
  const edgeBlack=compactScale&&BLACK.has(start%12);
  const compactWhiteWidth=(usable-(whiteCount-1)*gap-(edgeBlack?2*gap:0))/(whiteCount+(edgeBlack?.65:0));
  const whiteW = compactScale?Math.max(18,compactWhiteWidth):activeMode==="phrase"&&width<1050?Math.max(26,mobile?mobileWhiteWidth:26):mobile
    ? Math.max(activeMode === "dictionary" ? 22 : 26, mobileWhiteWidth)
    : Math.max(18, Math.min(54, desktopWhiteWidth));
  const edgeSpace=edgeBlack?whiteW*.65/2+gap:0;
  const keyboardWidth = whiteCount * whiteW + (whiteCount - 1) * gap + (pad+edgeSpace) * 2;
  piano.style.paddingLeft=compactScale?(pad+edgeSpace)+"px":"";piano.style.paddingRight=compactScale?(pad+edgeSpace)+"px":"";
  piano.style.width = keyboardWidth + "px";
  const phrase=activeMode==="phrase";
  piano.classList.toggle("phrasePiano",phrase);
  piano.classList.toggle("scalePiano",activeMode==="scale");
  piano.classList.toggle("compactScalePiano",compactScale);
  piano.classList.toggle("compactBlackLabels",phrase&&whiteW*.65<20);
  const hint=document.querySelector(".pianoHint");
  if(compactScale)hint.textContent="Practice octave + neighboring keys · "+scaleNoteName(start)+"–"+scaleNoteName(end-1);
  else if(phrase)hint.textContent=(start===21&&end===109?"88 keys · A0–C8":"Extended MIDI "+start+"–"+(end-1))+(keyboardWidth>width+1?" · Scroll sideways ↔":"");
  else{hint.textContent="Swipe sideways for more keys ";const arrow=document.createElement("span");arrow.setAttribute("aria-hidden","true");arrow.textContent="↔";hint.append(arrow);}
  piano.style.marginInline = !mobile && keyboardWidth <= width ? "auto" : "0";
  const shortLandscape = matchMedia("(max-height: 500px) and (orientation: landscape)").matches;
  const reverseScale=activeMode==="scale"&&(scalePhase.startsWith("reverse-")||scalePhase==="correction");
  const whiteH = shortLandscape ? (reverseScale?(["reverse-show","reverse-answer"].includes(scalePhase)?55:85):activeMode==="scale"?106:118) : mobile
    ? Math.min(reverseScale?140:166, Math.max(125, whiteW * 4.6))
    : Math.min(270, Math.max(120, whiteW * 5.2));
  const blackW = whiteW * .65;
  const root = document.documentElement.style;
  root.setProperty("--white-w", whiteW + "px");
  root.setProperty("--white-h", whiteH + "px");
  root.setProperty("--black-w", blackW + "px");
  root.setProperty("--black-h", whiteH * .62 + "px");
  root.setProperty("--key-radius", Math.max(3, Math.min(10, whiteW * .15)) + "px");
  root.setProperty("--black-radius", Math.max(2, Math.min(8, whiteW * .12)) + "px");
  // Preserve existing key elements so MIDI down/up transitions survive UI refreshes.
  const previousKeys=new Map([...piano.querySelectorAll(".key")].map(key=>[Number(key.dataset.midi),key]));
  const whiteRow=piano.querySelector(".whiteRow")||document.createElement("div");
  whiteRow.className="whiteRow";
  if(!whiteRow.isConnected)piano.append(whiteRow);
  let whiteIndex = 0;
  const blackKeys = [];
  function makeKey(midi, color) {
    const button=previousKeys.get(midi)||document.createElement("button");
    previousKeys.delete(midi);
    const existing=button.isConnected;
    const wrongDelay=existing&&button.classList.contains("wrongAnswer")?button.style.getPropertyValue("--wrong-key-delay"):null;
    button.replaceChildren();button.removeAttribute("style");button.removeAttribute("title");button.removeAttribute("data-midi-actions");button.removeAttribute("aria-describedby");
    button.type = "button";
    button.className = "key " + color;
    button.dataset.midi = String(midi);
    const exactName=activeMode==="phrase"?phraseDisplayName(midi):noteName(midi)+(Math.floor(midi/12)-1);
    button.setAttribute("aria-label",["phrase","scale"].includes(activeMode)?exactName+" · MIDI "+midi:noteName(midi));
    if(["phrase","scale"].includes(activeMode))button.title=exactName+" · MIDI "+midi;
    button.setAttribute("aria-pressed", String(selected.has(midi)));
    if (selected.has(midi)) button.classList.add("selected");
    const feedback = wrongKeyFeedback.get(midi);
    if (feedback && Date.now() - feedback.started < WRONG_KEY_DURATION) {
      button.classList.add("wrongAnswer");
      button.style.setProperty("--wrong-key-delay", wrongDelay??(-(Date.now() - feedback.started) + "ms"));
    }
    if (activeMode === "dictionary" ? !dictionaryPractice && dictionaryVoicing.includes(midi) :
      activeMode === "builder" ? builderNotes.includes(midi) : activeMode==="phrase" ? (phraseSnapshot?.target||[]).includes(midi) : displayedChord.includes(midi % 12)) button.classList.add("chordTone");
    if (activeMode === "builder" && builderNotes[builderNotes.length - 1] === midi) button.classList.add("builderNewest");
    if(activeMode==="scale"&&scalePhase==="correction"&&midi===scaleCorrection?.midi){
      const index=scaleCorrection.index,labels=SCALE_DEGREES[scaleType.value],formula=labels[index];
      const degreeName=labels.length===8?String(index+1)+(formula!==String(index+1)?" ("+formula+")":""):formula;
      button.classList.add("correctionTarget");button.setAttribute("aria-label",button.getAttribute("aria-label")+" · correct answer · Degree "+degreeName);
      const badge=document.createElement("span");badge.className="scaleDegree correctionDegree";badge.textContent=formula;badge.title="Correct degree "+degreeName;button.append(badge);
    }
    if(activeMode==="scale"&&scalePhase==="reverse-show"&&midi===scaleNotes[scaleReverseIndex]){
      button.classList.add("reverseTarget");button.setAttribute("aria-label",button.getAttribute("aria-label")+" · highlighted key");
    }
    if(activeMode==="scale"){
      const index=scaleNotes.indexOf(midi);
      if(index>=0&&(scalePhase==="preview" ? selected.has(midi) : scalePhase==="race" && index<scaleIndex)){button.classList.add("chordTone");
        const degree=document.createElement("span");degree.className="scaleDegree";degree.textContent=SCALE_DEGREES[scaleType.value][index];button.append(degree);
        if(index===scaleIndex-1)button.classList.add("builderNewest");}
    }
    const label = document.createElement("span");
    label.className = "noteLabel";
    label.textContent = activeMode==="phrase"?phraseDisplayName(midi,midi%12===0||midi===21):activeMode==="scale"?scaleNoteName(midi):NAMES[midi % 12];
    button.append(label);
    if(phrase){
      const marker=document.createElement("span");marker.className="phraseLiveMarker";marker.setAttribute("aria-hidden","true");button.append(marker);
      button.setAttribute("aria-describedby","phraseKeyLegend");
    }
    decorateTransportKey(button,midi);
    button.classList.toggle("midiKeyDown",isPhysicalMidiDown(midi));
    if(!existing)button.addEventListener("click",event=>{
      // Native double-click continuations are one screen-key gesture. Separate
      // clicks and genuine MIDI release/reattack still grade normally.
      if(activeMode==="scale"&&event.detail>1)return;
      pressPianoKey(midi);
    });
    return button;
  }
  for (let midi = start; midi < end; midi++) {
    if (BLACK.has(midi % 12)) {
      blackKeys.push({midi, anchor: whiteIndex - 1});
    } else {
      const white=makeKey(midi,"white");
      if(whiteRow.children[whiteIndex]!==white)whiteRow.insertBefore(white,whiteRow.children[whiteIndex]||null);
      whiteIndex++;
    }
  }
  for (const {midi, anchor} of blackKeys) {
    const black = makeKey(midi, "black");
    black.style.left = (pad + edgeSpace + anchor * (whiteW + gap) + whiteW - blackW / 2) + "px";
    if(!black.isConnected)piano.append(black);
  }
  for(const key of previousKeys.values())key.remove();
  if(compactScale)container.scrollLeft=0;
  if(activeMode==="scale"&&["reverse-show","correction"].includes(scalePhase)){
    const key=piano.querySelector(scalePhase==="correction"?".correctionTarget":".reverseTarget"),view=container.getBoundingClientRect(),rect=key?.getBoundingClientRect();
    // Connected MIDI retains the broader keyboard; reveal an off-screen cue
    // synchronously before the independent two-second viewing clock begins.
    if(rect&&view.width>0){if(rect.left<view.left)container.scrollLeft-=view.left-rect.left+4;else if(rect.right>view.right)container.scrollLeft+=rect.right-view.right+4;}
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
// Explicit pause may sit above a run/degree dialog without closing or cancelling it.
function pauseScaleUser(){
  if(activeMode!=="scale"||scaleUserPause)return;
  scaleUserPause={dialog:currentDialog,focus:document.activeElement,returnFocus:dialogReturnFocus};
  pauseScaleForDialog(true);stopBuilderAudio();midiController?.resetQuestion();
  if(currentDialog){currentDialog.hidden=true;currentDialog.inert=true;}
  currentDialog=document.getElementById("scalePauseOverlay");currentDialog.hidden=false;
  shell.inert=true;document.body.style.overflow="hidden";
  document.querySelectorAll("[data-pause-scale]").forEach(button=>button.setAttribute("aria-expanded","true"));
  document.getElementById("resumeScale").focus();
}
function resumeScaleUserPause(){
  const paused=scaleUserPause;if(!paused)return;scaleUserPause=null;
  document.getElementById("scalePauseOverlay").hidden=true;
  currentDialog=paused.dialog;dialogReturnFocus=paused.returnFocus;
  if(currentDialog){currentDialog.hidden=false;currentDialog.inert=false;}
  shell.inert=Boolean(currentDialog);document.body.style.overflow=currentDialog?"hidden":"";
  document.querySelectorAll("[data-pause-scale]").forEach(button=>button.setAttribute("aria-expanded","false"));
  midiController?.resetQuestion();
  if(paused.focus?.isConnected)paused.focus.focus({preventScroll:true});
  resumeScaleAfterDialog();
}
function discardScaleUserPause(){
  if(!scaleUserPause)return;
  const paused=scaleUserPause;scaleUserPause=null;scaleDialogPause=null;
  document.getElementById("scalePauseOverlay").hidden=true;
  if(paused.dialog){paused.dialog.hidden=true;paused.dialog.inert=false;}
  currentDialog=null;dialogReturnFocus=null;shell.inert=false;document.body.style.overflow="";
  document.querySelectorAll("[data-pause-scale]").forEach(button=>button.setAttribute("aria-expanded","false"));
}
document.querySelectorAll("[data-pause-scale]").forEach(button=>button.addEventListener("click",pauseScaleUser));
document.getElementById("resumeScale").addEventListener("click",resumeScaleUserPause);
document.getElementById("scalePauseOverlay").addEventListener("click",event=>{if(event.target===event.currentTarget)resumeScaleUserPause();});
function closePracticeDialog(options={}) {
  if(scaleUserPause){resumeScaleUserPause();return;}
  if (!currentDialog) return;
  if(currentDialog.id==="phraseImportOverlay")phraseImporter?.close();
  if(currentDialog.id==="settingsOverlay")midiTransport?.cancelLearn();
  const cancelRun=["scaleRunOverlay","scaleDegreeOverlay"].includes(currentDialog.id)&&options.cancelScaleRun!==false;
  currentDialog.hidden=true;
  currentDialog=null;
  shell.inert=false;
  document.body.style.overflow="";
  for(const id of ["openModes","openSettings","openHint","scaleStart","phraseImport"]) document.getElementById(id).setAttribute("aria-expanded","false");
  if(cancelRun&&activeMode==="scale")startScalePreview();
  if(dialogReturnFocus?.isConnected) dialogReturnFocus.focus();
  dialogReturnFocus=null;
  resumeScaleAfterDialog();
  if(activeMode==="phrase")renderPhraseView();
}
function openPracticeDialog(id,buttonId) {
  cancelLoopDrag();
  stopBuilderAudio();resetMidiAudio();
  if(scaleUserPause)return;
  if(activeMode==="phrase")phraseEngine?.stop();
  if(id!=="scaleDegreeOverlay")midiController?.resetQuestion();
  if(currentDialog) closePracticeDialog();
  pauseScaleForDialog();
  dialogReturnFocus=document.activeElement;
  currentDialog=document.getElementById(id);
  currentDialog.hidden=false;
  shell.inert=true;
  document.body.style.overflow="hidden";
  document.getElementById(buttonId).setAttribute("aria-expanded","true");
  (id==="scaleRunOverlay"?document.getElementById("confirmScaleRun"):id==="scaleDegreeOverlay"&&!document.getElementById("confirmScaleDegree").hidden?document.getElementById("confirmScaleDegree"):currentDialog.querySelector(".modalTop button")).focus();
}
for(const [open,dialog,close] of [["openModes","modeOverlay","closeModes"],["openSettings","settingsOverlay","closeSettings"],["openHint","hintOverlay","closeHint"]]) {
  document.getElementById(open).addEventListener("click",()=>openPracticeDialog(dialog,open));
  document.getElementById(close).addEventListener("click",closePracticeDialog);
  document.getElementById(dialog).addEventListener("click",event=>{if(event.target===event.currentTarget)closePracticeDialog();});
}
document.getElementById("confirmScaleDegree").addEventListener("click",beginScaleDegreeAnswer);
document.getElementById("cancelScaleDegree").addEventListener("click",closePracticeDialog);
document.getElementById("scaleDegreeOverlay").addEventListener("click",event=>{if(event.target===event.currentTarget)closePracticeDialog();});
function suspendScaleQuestionPreview(){if(activeMode==="scale"&&scalePhase==="correction"){stopBuilderAudio();return;}if(scaleDialogPause)return;if(activeMode==="scale"&&(["levelup","degree-preview","degree-success"].includes(scalePhase)||scalePhase.startsWith("reverse-")))startScalePreview();}
window.addEventListener("blur",suspendScaleQuestionPreview);
document.addEventListener("visibilitychange",()=>{if(document.hidden)suspendScaleQuestionPreview();});
document.getElementById("cancelScaleRun").addEventListener("click",closePracticeDialog);
document.getElementById("scaleRunOverlay").addEventListener("click",event=>{if(event.target===event.currentTarget)closePracticeDialog();});
document.getElementById("continueScaleCorrection").addEventListener("click",continueScaleCorrection);
document.getElementById("confirmScaleRun").addEventListener("click",()=>{
  if(activeMode!=="scale"||scalePhase!=="ready"||currentDialog?.id!=="scaleRunOverlay")return;
  unlockMidiAudio();closePracticeDialog({cancelScaleRun:false});startScaleRace();
  piano.querySelector('[data-midi="'+scaleNotes[0]+'"]')?.focus({preventScroll:true});
});
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
  document.getElementById("phraseAudioOrigin").hidden=activeMode!=="phrase"||phraseSnapshot?.origin!=="audio";
  document.getElementById("phraseControls").hidden=activeMode!=="phrase";
  const summary=document.getElementById("practiceSummary");
  let text="";
  if(activeMode==="phrase"&&phraseSnapshot)text=(phraseSnapshot.options.rhythm?"Notes + rhythm":"Notes only")+" · "+(["record-countin","recording"].includes(phraseSnapshot.state)?phraseSnapshot.options.sourceBpm:phraseSnapshot.options.playBpm)+" quarter-note BPM";
  if(activeMode==="builder") text=(builderLevel.value==="mixed"?"Mixed":"Level "+({triads:1,colors:2,sevenths:3,extended:4,altered:5}[builderLevel.value]))+" · "+(builderSelection.value==="random"?"Random":levelBuilderLessons().filter(l=>chosenBuilderTypes.has(l.id)).length+" types");
  if(activeMode==="semitones") text=semitoneDifficulty.selectedOptions[0].textContent;
  if(activeMode==="scale") text=scaleRoot.selectedOptions[0].textContent+" "+scaleType.selectedOptions[0].textContent+" · "+(["degree-preview","degrees","degree-success"].includes(scalePhase) ? scaleStreak+"/30" : scalePhase==="race" ? "10-second run" : scalePhase==="ready" ? "Ready to start" : scalePhase==="levelup" ? "Level up" : scalePhase==="passed" ? "Passed" : "Preview");
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
const MIDI_TAP_ENVELOPE={attack:.015,decay:.7,tail:.73,stop:.75,peak:.07,floor:.001,release:.1};
const phraseMonitorVoices=new Map(),phraseMonitorRequests=new Map(),phraseMonitorAll=new Set(),phraseMonitorChannels=new Map();
let phraseMonitorRequest=0;
let midiNoteRequest=0;
function holdMidiTapEnvelope(voice,now){
  const gain=voice.gain.gain;
  if(typeof gain.cancelAndHoldAtTime==="function"){gain.cancelAndHoldAtTime(now);return;}
  // Removing a ramp's future endpoint alone snaps back to its previous value.
  // Older browsers need the interrupted ramp restored up to the current time;
  // AudioParam.value is not a reliable snapshot of a scheduled envelope.
  const e=MIDI_TAP_ENVELOPE,start=voice.startedAt,elapsed=Math.max(0,now-start);
  gain.cancelScheduledValues(now);
  if(now<=start)gain.setValueAtTime(0,now);
  else if(now<=start+e.attack)gain.linearRampToValueAtTime(e.peak*elapsed/e.attack,now);
  else if(now<=start+e.decay)gain.exponentialRampToValueAtTime(e.peak*(e.floor/e.peak)**((elapsed-e.attack)/(e.decay-e.attack)),now);
  else if(now<=start+e.tail)gain.linearRampToValueAtTime(Math.max(0,e.floor*(1-(elapsed-e.decay)/(e.tail-e.decay))),now);
  else gain.setValueAtTime(0,now);
}
function releaseMidiNote(note) {
  midiNoteRequests.delete(note);
  const voice=midiVoices.get(note);if(!voice)return;
  midiVoices.delete(note);
  try{
    const now=midiAudioContext.currentTime;
    holdMidiTapEnvelope(voice,now);
    // Reach actual silence before stopping; an exponential target never reaches 0.
    voice.gain.gain.linearRampToValueAtTime(0,now+MIDI_TAP_ENVELOPE.release);
    voice.osc.stop(now+MIDI_TAP_ENVELOPE.release+.02);
  }catch{}
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
  if(!soundEnabled||!midiAudioContext)return;
  const key=channel+":"+note,request=++phraseMonitorRequest,generation=midiVoiceGeneration;
  phraseMonitorRequests.set(key,request);
  try{
    await midiAudioContext.resume();if(!soundEnabled||midiAudioContext.state!=="running"||generation!==midiVoiceGeneration||phraseMonitorRequests.get(key)!==request||activeMode!=="phrase"||currentDialog||document.hidden)return;
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
function unlockMidiAudio(){if(soundEnabled)enableSoundAudio();}
async function soundMidiNote(note){
  if(!soundEnabled||!midiAudioContext)return;
  const generation=midiVoiceGeneration,request=++midiNoteRequest;
  midiNoteRequests.set(note,request);
  try{
    await midiAudioContext.resume();if(!soundEnabled||midiAudioContext.state!=="running"||generation!==midiVoiceGeneration||midiNoteRequests.get(note)!==request||currentDialog||document.hidden)return;
    releaseMidiNote(note);
    const now=midiAudioContext.currentTime,osc=midiAudioContext.createOscillator(),gain=midiAudioContext.createGain();
    osc.type="triangle";osc.frequency.value=440*2**((note-69)/12);
    const e=MIDI_TAP_ENVELOPE;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(e.peak,now+e.attack);gain.gain.exponentialRampToValueAtTime(e.floor,now+e.decay);gain.gain.linearRampToValueAtTime(0,now+e.tail);
    osc.connect(gain);gain.connect(midiAudioContext.destination);osc.start(now);osc.stop(now+e.stop);
    const voice={osc,gain,startedAt:now};midiVoices.set(note,voice);
    osc.onended=()=>{osc.disconnect();gain.disconnect();if(midiVoices.get(note)===voice)midiVoices.delete(note);};
  }catch{}
}
const transportLabels={record:"Record",stop:"Stop",play:"Play",practice:"Start practice",continue:"Continue / Start",transposeDown:"Transpose down",transposeUp:"Transpose up"};
const transportButtons={record:["phraseRecord"],stop:["phraseStop"],play:["phrasePlay"],practice:["phrasePractice"],continue:["nextChallenge","scaleStart","continueScaleCorrection","confirmScaleRun","confirmScaleDegree","resumeScale"],transposeDown:["phraseDown"],transposeUp:["phraseUp"]};
let midiTransport=null;
function refreshTransportUI(state){
  midiTransportState=state;
  const toggle=document.getElementById("midiTransportEnabled");if(!toggle)return;
  toggle.checked=state.enabled;
  document.getElementById("midiTransportStatus").textContent=state.error||(state.learning?"Play one note or move one controller for "+transportLabels[state.learning]+". This input will not be recorded.":state.enabled?"Transport enabled. Assigned inputs are reserved, not musical notes.":"Transport disabled. All keys play normally.");
  document.getElementById("midiTransportCancel").hidden=!state.learning;
  for(const action of Object.keys(transportLabels)){
    const m=state.mappings[action],label=document.getElementById("midiMap-"+action);
    label.textContent=m?(m.kind==="note"?phraseDisplayName(m.number)+" · MIDI "+m.number:"CC "+m.number)+" · channel "+(m.channel+1):"Not assigned";
    label.previousElementSibling.dataset.midiAction=action;
    document.getElementById("midiLearn-"+action).setAttribute("aria-label","Learn MIDI "+transportLabels[action]);
    document.getElementById("midiRemove-"+action).setAttribute("aria-label","Remove MIDI "+transportLabels[action]);
    document.getElementById("midiRemove-"+action).disabled=!m;
    for(const id of transportButtons[action])document.getElementById(id).dataset.midiAction=action;
  }
  const noteMappings=Object.values(state.mappings).filter(m=>m.kind==="note");
  if(state.enabled&&new Set(noteMappings.map(m=>m.number)).size<noteMappings.length&&!state.error&&!state.learning)document.getElementById("midiTransportStatus").textContent+=" A note has shortcuts on different channels. Its key is split into matching colors; labels identify each action and channel.";
  refreshTransportShortcuts();renderPiano();
}
function transportNoteMappings(midi){return midiTransportState.enabled?Object.entries(midiTransportState.mappings).filter(([,m])=>m.kind==="note"&&m.number===midi):[];}
function decorateTransportKey(button,midi){
  const mappings=transportNoteMappings(midi);if(!mappings.length)return;
  button.classList.add("midiMappedKey");
  button.dataset.midiActions=mappings.map(([action])=>action).join(" ");
  const colors=mappings.map(([action],i)=>`var(--midi-${action}) ${100*i/mappings.length}% ${100*(i+1)/mappings.length}%`);
  button.style.setProperty("--midi-key-fill",mappings.length===1?`var(--midi-${mappings[0][0]})`:`linear-gradient(90deg,${colors.join(",")})`);
  const details=mappings.map(([action,m])=>transportLabels[action]+" on MIDI channel "+(m.channel+1)).join("; ");
  button.title=button.getAttribute("aria-label")+" · MIDI shortcuts: "+details;
  button.setAttribute("aria-label",button.title);
}
function refreshTransportShortcuts(){
  const legend=document.getElementById("midiShortcutLegend");legend.replaceChildren();
  const enabled=midiTransportState.enabled,transposeLabels=[];
  for(const [action,ids]of Object.entries(transportButtons)){
    const m=enabled?midiTransportState.mappings[action]:null;
    const label=m?(m.kind==="note"?phraseDisplayName(m.number):"CC "+m.number)+" / ch "+(m.channel+1):"";
    for(const id of ids){
      const button=document.getElementById(id);
      // Keep state-dependent Start/Continue and Play/Stop loop wording intact.
      const base=action==="transposeDown"?"Transpose phrase down one semitone":action==="transposeUp"?"Transpose phrase up one semitone":button.textContent.trim();
      button.title=base+(label?" · MIDI: "+label:"");
      if(action.startsWith("transpose"))button.setAttribute("aria-label",button.title);
      if(label)button.setAttribute("aria-description","MIDI shortcut: "+label);else button.removeAttribute("aria-description");
    }
    if(!label)continue;
    if(action.startsWith("transpose"))transposeLabels.push((action==="transposeDown"?"− ":"+ ")+label);
    const item=document.createElement("span"),swatch=document.createElement("span");
    item.className="midiShortcutItem";swatch.className="midiShortcutSwatch";swatch.dataset.midiAction=action;swatch.setAttribute("aria-hidden","true");
    item.append(swatch,transportLabels[action]+": "+label);legend.append(item);
  }
  legend.hidden=!legend.childElementCount;
  document.getElementById("phraseTransposeShortcuts").textContent=transposeLabels.join(" · ");
}
function isPhysicalMidiDown(note){return [...physicalMidiHeld].some(key=>Number(key.split(":")[1])===note);}
function refreshPhysicalMidiKey(note){piano.querySelector('[data-midi="'+note+'"]')?.classList.toggle("midiKeyDown",isPhysicalMidiDown(note));}
function handlePhysicalMidiKey(event){
  const key=event.channel+":"+event.note;
  if(event.kind==="off")physicalMidiHeld.delete(key);
  else if(event.active!==false&&event.focused!==false&&!document.hidden)physicalMidiHeld.add(key);
  refreshPhysicalMidiKey(event.note);
}
function clearPhysicalMidiKeys(){physicalMidiHeld.clear();piano.querySelectorAll(".midiKeyDown").forEach(key=>key.classList.remove("midiKeyDown"));}
function refreshPhrasePracticePanel(){
  const phrase=activeMode==="phrase",toggle=document.getElementById("phrasePracticeToggle");
  document.getElementById("practicePanel").hidden=phrase&&!phrasePracticeVisible;
  toggle.hidden=!phrase;toggle.setAttribute("aria-expanded",String(phrasePracticeVisible));toggle.textContent=phrasePracticeVisible?"Hide practice":"Show practice";
  const status=document.getElementById("phraseCollapsedStatus");status.hidden=!phrase||phrasePracticeVisible;status.textContent=trainingPrompt.textContent;
}
document.getElementById("phrasePracticeToggle").addEventListener("click",()=>{
  phrasePracticeVisible=!phrasePracticeVisible;try{localStorage.setItem("keymemory.phrase.practicePanel",phrasePracticeVisible?"show":"hidden");}catch{}
  refreshPhrasePracticePanel();
});
function midiTransportAction(action){
  if(document.hidden)return;
  const click=id=>{const button=document.getElementById(id);if(button&&!button.hidden&&!button.disabled&&button.getClientRects().length)button.click();};
  if(action==="continue"){
    if(currentDialog){const id={scaleRunOverlay:"confirmScaleRun",scaleDegreeOverlay:"confirmScaleDegree",scalePauseOverlay:"resumeScale"}[currentDialog.id];if(id)click(id);return;}
    if(activeMode==="scale"){if(scalePhase==="correction")click("continueScaleCorrection");else if(scalePhase==="preview"||scalePhase==="passed")click("scaleStart");return;}
    click("nextChallenge");return;
  }
  if(activeMode!=="phrase"||currentDialog)return;
  const id={record:"phraseRecord",stop:"phraseStop",play:"phrasePlay",practice:"phrasePractice",transposeDown:"phraseDown",transposeUp:"phraseUp"}[action];if(id)click(id);
}
if(window.KeyMemoryMidiTransport){
  midiTransport=window.KeyMemoryMidiTransport.create({onAction:midiTransportAction,onChange:refreshTransportUI});
  refreshTransportUI(midiTransport.getState());
  document.getElementById("midiTransportEnabled").addEventListener("change",event=>midiTransport.setEnabled(event.target.checked));
  for(const action of Object.keys(transportLabels)){
    document.getElementById("midiLearn-"+action).addEventListener("click",()=>midiTransport.learn(action));
    document.getElementById("midiRemove-"+action).addEventListener("click",()=>midiTransport.removeMapping(action));
  }
  document.getElementById("midiTransportCancel").addEventListener("click",()=>midiTransport.cancelLearn());
}
if(window.KeyMemoryMidi)midiController=window.KeyMemoryMidi.create({
  transport:midiTransport,
  status:document.getElementById("midiStatus"),select:document.getElementById("midiInput"),
  connect:document.getElementById("connectMidi"),disconnect:document.getElementById("disconnectMidi"),
  onConnect:unlockMidiAudio,onReset:resetMidiAudio,onRelease:releaseMidiNote,onKeyState:handlePhysicalMidiKey,
  onSuspend:()=>{clearPhysicalMidiKeys();phraseRawHeld.clear();resetMidiAudio();resetMonitorControllers();phraseEngine?.stop({releaseHeld:true});if(activeMode==="phrase"){selected.clear();renderPiano();}},
  onConnection:()=>{if(activeMode==="phrase")refreshPhraseUI();if(activeMode==="scale")renderPiano();},
  onRaw:event=>{
    if(!phraseEngine)return false;
    if(event.kind!=="off"&&(event.active===false||event.focused===false||document.hidden))return activeMode==="phrase";
    if(event.kind==="control"){phraseEngine.input(event);applyMonitorControl(event);return activeMode==="phrase";}
    const key=event.channel+":"+event.note;
    if(event.kind==="off"){
      phraseRawHeld.delete(key);releasePhraseMonitor(event.note,event.channel);phraseEngine.input(event);
      if(activeMode==="phrase"&&![...phraseRawHeld].some(k=>Number(k.split(":")[1])===event.note)){
        selected.delete(event.note);
        // Releases still arrive while a sheet is open. Reconcile the hidden,
        // inert piano too: dismissing a sheet does not otherwise repaint it.
        phraseSnapshot=phraseEngine.snapshot();phraseViewStamp=Date.now();renderPiano();
      }
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
  onNote:note=>{if(currentDialog||document.hidden||(activeMode==="scale"&&scalePhase.startsWith("reverse-")))return;pressPianoKey(note,true);}
});

// Phrase playback has its own cancelable synth; recorded MIDI never leaves this browser.
let phraseAudioContext=null,phraseSoundGeneration=0,phraseAudioAnchor=null,phraseTransportRequest=0,phraseTransportPending=false,phraseTransportWake=null,phraseTransportAction="";
const phraseVoices=new Set(),phraseBeatVoices=new Set(),phrasePlaybackChannels=new Map();
function silencePhraseMetronome(){
  for(const voice of phraseBeatVoices)try{voice.osc.stop();voice.osc.disconnect();voice.gain.disconnect();}catch{}
  phraseBeatVoices.clear();
}
function silencePhrase(cancelTransport=true){
  phraseSoundGeneration++;if(cancelTransport){phraseTransportRequest++;phraseTransportPending=false;phraseTransportAction="";phraseTransportWake?.();}
  for(const voice of phraseVoices){try{const t=phraseAudioContext.currentTime;voice.gain.gain.cancelScheduledValues(t);voice.gain.gain.setTargetAtTime(0,t,.02);voice.osc.stop(t+.1);}catch{}}
  phraseVoices.clear();
  for(const state of phrasePlaybackChannels.values())try{const t=phraseAudioContext.currentTime;state.gain.gain.cancelScheduledValues(t);state.gain.gain.setValueAtTime(0,t);if(cancelTransport)state.gain.disconnect();}catch{}
  if(cancelTransport){phrasePlaybackChannels.clear();silencePhraseMetronome();}
}
function unlockPhraseAudio(){
  if(soundEnabled)return enableSoundAudio().then(ok=>{if(!ok&&soundEnabled)throw Error("Audio unavailable");});
  if(!phraseSnapshot?.options.metronome)return Promise.resolve();
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return Promise.reject(Error("Audio unavailable"));
  phraseAudioContext ||= midiAudioContext || new Audio();
  return phraseAudioContext.resume().then(()=>{if(phraseAudioContext.state!=="running")throw Error("Audio unavailable");if(phraseAudioAnchor)phraseAudioAnchor.audio=phraseAudioContext.currentTime-(Date.now()-phraseAudioAnchor.wall)/1000;});
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
  const t=Math.max(phraseAudioContext.currentTime,phraseAudioTime(at)),valueProduct=soundEnabled?(state.volume/127)*(state.expression/127):0;
  if(initial)state.gain.gain.setValueAtTime(valueProduct,t);else state.gain.gain.setTargetAtTime(valueProduct,t,.008);
}
function soundPhrase(note,velocity,durationMs,plannedAt,meta={}){
  if(!soundEnabled||!phraseAudioContext||phraseAudioContext.state!=="running"||activeMode!=="phrase")return;
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
function soundPhraseBeat({accent,at}){
  if(!phraseSnapshot?.options.metronome||!phraseAudioContext||phraseAudioContext.state!=="running"||activeMode!=="phrase")return;
  try{
    const scheduled=phraseAudioTime(at);if(phraseAudioContext.currentTime-scheduled>.08)return;
    const t=Math.max(phraseAudioContext.currentTime,scheduled),osc=phraseAudioContext.createOscillator(),gain=phraseAudioContext.createGain();
    osc.type="sine";osc.frequency.value=accent?1400:1000;
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.12,t+.002);gain.gain.exponentialRampToValueAtTime(.001,t+.04);
    osc.connect(gain);gain.connect(phraseAudioContext.destination);osc.start(t);osc.stop(t+.05);
    const voice={osc,gain};phraseBeatVoices.add(voice);osc.onended=()=>{osc.disconnect();gain.disconnect();phraseBeatVoices.delete(voice);};
  }catch{}
}
async function startPhraseTransport(action,kind=""){
  cancelLoopDrag();
  if(!phraseEngine||phraseTransportPending)return;
  phraseEngine.stop();dismissAchievement();clearWrongKeyFeedback();stopBuilderAudio();resetMidiAudio();
  const request=++phraseTransportRequest;phraseTransportPending=true;phraseTransportAction=kind;phraseInspectSelected=false;phraseInspectWindowStart=null;refreshPhraseUI();
  let wake=null;
  try{
    await Promise.race([unlockPhraseAudio(),new Promise(resolve=>{wake=resolve;phraseTransportWake=resolve;})]);
    if(phraseTransportWake===wake)phraseTransportWake=null;
    if(request!==phraseTransportRequest||activeMode!=="phrase"||currentDialog||document.hidden)return;
    phraseTransportPending=false;phraseAudioAnchor={wall:Date.now(),audio:phraseAudioContext?.currentTime||0};selected.clear();action();
  }catch{
    if(request!==phraseTransportRequest)return;
    phraseTransportPending=false;refreshPhraseUI();incorrect("Audio could not start. Your phrase is unchanged; try again.");
  }finally{if(phraseTransportWake===wake)phraseTransportWake=null;}
}

const phraseTime=ms=>{const sec=Math.max(0,Math.floor(ms/1000));return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0");};
function refreshPhraseUI(snapshot=phraseSnapshot){
  if(snapshot){if(snapshot!==phraseSnapshot)phraseViewStamp=Date.now();phraseSnapshot=snapshot;}
  if(!phraseSnapshot)return;
  const s=phraseSnapshot,o=s.options,active=phraseTransportPending||["record-countin","play-countin","recording","playing","countin","practice","wait-release"].includes(s.state),has=s.notes.length>0;
  const recordingIndicator=document.getElementById("phraseRecordIndicator");
  recordingIndicator.hidden=!["recording","record-countin"].includes(s.state);
  recordingIndicator.textContent=s.state==="recording"?"● REC":"○ Ready to record";
  const metro=document.getElementById("phraseMetronome");metro.setAttribute("aria-pressed",String(o.metronome));metro.textContent="Click "+(o.metronome?"on":"off");
  document.getElementById("phraseImport").disabled=!phraseImporter||phraseTransportPending||s.state==="recording"||s.state==="record-countin";
  document.getElementById("phraseAudioOrigin").hidden=activeMode!=="phrase"||s.origin!=="audio"||s.state==="recording";
  document.getElementById("phraseRecord").disabled=phraseTransportPending||s.state==="recording"||s.state==="record-countin";
  const playButton=document.getElementById("phrasePlay"),playOn=s.state==="playing"||s.state==="play-countin"||(phraseTransportPending&&phraseTransportAction==="play");
  playButton.disabled=(phraseTransportPending&&!playOn)||!has||s.state==="recording"||s.state==="record-countin";
  playButton.textContent=playOn?"Stop loop":"Play phrase";playButton.setAttribute("aria-pressed",String(playOn));
  document.getElementById("phrasePractice").disabled=phraseTransportPending||!has||s.state==="recording"||s.state==="record-countin";
  document.getElementById("phraseStop").disabled=!active;
  document.getElementById("phraseDelete").disabled=!s.notes.length||phraseTransportPending||["recording","record-countin"].includes(s.state);
  for(const id of ["phraseDown","phraseUp"])document.getElementById(id).disabled=!has||phraseTransportPending||s.state==="recording"||s.state==="record-countin";
  document.getElementById("phraseTransposeValue").textContent=o.transpose?((o.transpose>0?"+":"")+o.transpose+" st"):"Original";
  document.getElementById("phraseClock").textContent=s.state==="recording"?"REC "+phraseTime(s.elapsed)+" / 2:00":has?phraseTime(s.duration)+" · "+s.notes.length+" notes":"Up to 2:00";
  const values={phraseSourceBpm:o.sourceBpm,phrasePlayBpm:o.playBpm,phraseRhythm:o.rhythm?"rhythm":"notes",phraseTolerance:o.tolerance,phraseSectionStart:o.sectionStart/1000,phraseSectionEnd:o.sectionEnd/1000};
  for(const [id,value]of Object.entries(values))document.getElementById(id).value=String(value);
  document.getElementById("phraseSaved").textContent=(s.error?s.error+" ":"")+(has?(s.saved?"Saved locally on this device":"Kept for this session only")+" · "+s.notes.length+" notes":"No saved phrase");
  if(activeMode!=="phrase")return;
  refreshPhraseTiming();refreshPhraseForgiveness();refreshPhraseMeter();
  const names=(s.target||[]).map(m=>phraseDisplayName(m));
  let prompt=phraseTransportPending?"Preparing audio…":s.state==="record-countin"?"Record count-in: "+s.countIn+" / "+phraseTimingMetrics(o).beatsPerBar+" · bar "+(s.countInBar||1)+" / "+o.countInBars:s.state==="play-countin"?"Playback count-in: "+s.countIn+" / "+phraseTimingMetrics(o).beatsPerBar+" · bar "+(s.countInBar||1)+" / "+o.countInBars:s.state==="recording"?"Recording MIDI — play your phrase. Stop when finished.":s.state==="playing"?"Loop "+s.loop+" · note group "+(s.progress+1)+" / "+s.total+" · press Stop loop to finish":
    s.state==="countin"?"Count in: "+s.countIn+" / "+phraseTimingMetrics(o).beatsPerBar+" · bar "+(s.countInBar||1)+" / "+o.countInBars+" · release the keys":s.state==="wait-release"?"Release all keys — restarting from the beginning":
    s.state==="practice"?"Play "+names.join(" + ")+" · "+(s.progress+1)+" / "+s.total:
    s.state==="complete"?"Phrase complete! Practice again or transpose.":has?"Your phrase is ready. Play it, transpose, or practice.":"Import an audio clip, or connect MIDI in Settings and Record your phrase.";
  if(s.state==="practice"&&o.rhythm&&Number.isFinite(s.targetTime)){const delta=s.targetTime-s.elapsed;prompt+=" · "+(delta>80?"in "+(delta/1000).toFixed(1)+"s":"now");}
  if(s.error)prompt=s.error;
  trainingPrompt.textContent=prompt;
  refreshPhrasePracticePanel();refreshTransportShortcuts();
  document.getElementById("practiceSummary").textContent=(o.rhythm?"Notes + rhythm":"Notes only")+" · "+(["record-countin","recording"].includes(s.state)?o.sourceBpm:o.playBpm)+" quarter-note BPM";
  renderPiano();
}
if(window.KeyMemoryPhrase){
  phraseEngine=window.KeyMemoryPhrase.create({viewProjection:true,onChange:refreshPhraseUI,onSound:soundPhrase,onBeat:soundPhraseBeat,onControl:soundPhraseControl,onSilence:silencePhrase,onMetronomeSilence:silencePhraseMetronome,onWrong:(note,message)=>{flashWrongKey(note);selected.clear();resetMidiAudio();incorrect(message);}});
  refreshPhraseUI(phraseEngine.snapshot());
}
if(window.KeyMemoryAudioImport){
  phraseImporter=window.KeyMemoryAudioImport.create({isOpen:()=>currentDialog?.id==="phraseImportOverlay"&&activeMode==="phrase",onClose:closePracticeDialog,onCommit:payload=>{
    if(currentDialog?.id!=="phraseImportOverlay"||activeMode!=="phrase")return false;
    if(phraseSnapshot?.notes.length&&!window.confirm("Replace your saved phrase with these reviewed audio notes?"))return false;
    phraseLoopDraft=null;phraseLoopDrag=null;phraseViewExample=false;phraseViewModel=null;phraseViewSignature="";phraseInspectTime=0;phraseInspectSelected=false;phraseInspectWindowStart=null;selected.clear();resetMidiAudio();
    if(!phraseEngine.importPhrase(payload))throw Error(phraseEngine.snapshot().error||"The phrase could not be imported.");
    return true;
  }});
  refreshPhraseUI();
}
document.getElementById("phraseImport").addEventListener("click",()=>{
  if(!phraseImporter||activeMode!=="phrase"||phraseTransportPending||["recording","record-countin"].includes(phraseSnapshot?.state))return;
  openPracticeDialog("phraseImportOverlay","phraseImport");phraseImporter.open();
});
function phraseAction(action){if(!phraseEngine)return;cancelLoopDrag();phraseViewExample=false;dismissAchievement();clearWrongKeyFeedback();stopBuilderAudio();resetMidiAudio();unlockPhraseAudio().catch(()=>{});action();}
document.getElementById("phraseRecord").addEventListener("click",()=>{
  if(!midiController?.isConnected()){trainingPrompt.textContent="Connect a MIDI keyboard in Settings before recording.";return;}
  if(phraseSnapshot?.notes.length&&!window.confirm("Replace the saved phrase with a new recording? An empty recording keeps the previous phrase."))return;
  startPhraseTransport(()=>phraseEngine.record());
});
document.getElementById("phrasePlay").addEventListener("click",()=>{if(["playing","play-countin"].includes(phraseSnapshot?.state)||(phraseTransportPending&&phraseTransportAction==="play")){selected.clear();phraseEngine?.stop();resetMidiAudio();return;}if(!window.AudioContext&&!window.webkitAudioContext){incorrect("Audio is unavailable. Your saved phrase is unchanged.");return;}startPhraseTransport(()=>phraseEngine.play({loop:true}),"play");});
document.getElementById("phrasePractice").addEventListener("click",()=>startPhraseTransport(()=>{selected.clear();phraseEngine.practice();}));
document.getElementById("phraseStop").addEventListener("click",()=>{selected.clear();phraseEngine?.stop();resetMidiAudio();});
for(const [id,step]of[["phraseDown",-1],["phraseUp",1]])document.getElementById(id).addEventListener("click",()=>phraseAction(()=>phraseEngine.setOptions({transpose:phraseSnapshot.options.transpose+step})));
document.getElementById("phraseMetronome").addEventListener("click",()=>{
  phraseEngine?.setMetronome(!phraseSnapshot.options.metronome);
  if(phraseSnapshot.options.metronome)unlockPhraseAudio().catch(()=>{incorrect("Tempo click could not start. Tap Click off, then on to retry.");});
});
const phraseFields={phraseSourceBpm:["sourceBpm",1],phrasePlayBpm:["playBpm",1],phraseTolerance:["tolerance",1],phraseSectionStart:["sectionStart",1000],phraseSectionEnd:["sectionEnd",1000]};
for(const [id,[key,multiplier]]of Object.entries(phraseFields))document.getElementById(id).addEventListener("change",event=>{if(key==="sourceBpm")phraseEngine?.setSourceTempo(Number(event.target.value));else if(key==="sectionStart"||key==="sectionEnd"){const value=clampLoopPoint(key==="sectionStart"?"start":"end",Number(event.target.value)*multiplier);if(value!==null)phraseEngine?.setOptions({[key]:value});}else phraseEngine?.setOptions({[key]:Number(event.target.value)*multiplier});});
document.getElementById("phraseRhythm").addEventListener("change",event=>phraseEngine?.setOptions({rhythm:event.target.value==="rhythm"}));
document.getElementById("phraseFull").addEventListener("click",()=>phraseEngine?.setOptions({sectionStart:0,sectionEnd:phraseExtent()||120000}));
function deleteSavedPhrase(){
  if(!window.confirm("Delete the saved phrase from this browser?"))return;
  phraseLoopDraft=null;phraseLoopDrag=null;phraseStaffDrag=null;phraseInspectTime=0;phraseInspectSelected=false;phraseInspectWindowStart=null;phraseViewModel=null;phraseViewSignature="";
  selected.clear();phraseSeenLow=21;phraseSeenHigh=108;phraseViewExample=false;phraseEngine?.clear();
}
for(const id of ["phraseClear","phraseDelete"])document.getElementById(id).addEventListener("click",deleteSavedPhrase);
let phraseTaps=[];
document.getElementById("phraseTap").addEventListener("click",()=>{const now=Date.now();if(phraseTaps.length&&now-phraseTaps.at(-1)>2000)phraseTaps=[];phraseTaps.push(now);phraseTaps=phraseTaps.slice(-5);if(phraseTaps.length<2)return;const bpm=60000*(phraseTaps.length-1)/(phraseTaps.at(-1)-phraseTaps[0])*phraseTimingMetrics().pulseQuarters;if(bpm>=30&&bpm<=300)phraseEngine?.setSourceTempo(bpm);});

function phraseTimingMetrics(o=phraseSnapshot?.options){return window.KeyMemoryPhrase.timing.metrics(o);}
function phraseExtent(){const s=phraseSnapshot;return s?window.KeyMemoryPhrase.timing.maxLoopEnd(s.duration,s.options):0;}
function phrasePositionText(time){return window.KeyMemoryPhrase.timing.position(time,phraseSnapshot.options).label+" · "+(time/1000).toFixed(3)+" source seconds";}
function refreshPhraseMeter(){
  if(!phraseSnapshot)return;const o=phraseSnapshot.options,m=phraseTimingMetrics(o),disabled=phraseTransportPending||phraseViewExample||["recording","record-countin"].includes(phraseSnapshot.state);
  const values={phrasePulseBpm:Number((o.sourceBpm/m.pulseQuarters).toFixed(4)),phraseMeterNumerator:o.meterNumerator,phraseMeterDenominator:o.meterDenominator,phraseCountInBars:o.countInBars,phraseLoopSnap:o.loopSnap};
  for(const [id,value] of Object.entries(values)){const el=document.getElementById(id);if(document.activeElement!==el)el.value=String(value);el.disabled=disabled;}
  document.getElementById("phraseTap").disabled=disabled;
  const bpm=document.getElementById("phrasePulseBpm");bpm.min=String(30/m.pulseQuarters);bpm.max=String(300/m.pulseQuarters);
  document.getElementById("phrasePulseUnit").textContent=m.beatLabel+" BPM";
  document.getElementById("phraseLoopSnap").querySelector('[value="beat"]').textContent="Beat ("+m.beatLabel+")";
  document.getElementById("phraseLoopPadEnd").checked=o.loopPadEnd;
  for(const id of ["phraseBarOne","phraseGridReset","phraseLoopPadEnd"])document.getElementById(id).disabled=disabled||!phraseSnapshot.notes.length;
  const hint=document.getElementById("phraseGridHint"),hintText=(o.gridConfirmed?"Reference grid: ":"Set tempo and meter to confirm this reference grid. Tempo is not detected; 120 BPM may be a placeholder. ")+o.meterNumerator+"/"+o.meterDenominator+" · bar 1 at "+(o.gridOriginMs/1000).toFixed(3)+" s. Notes keep their original timing.";
  if(hint.textContent!==hintText)hint.textContent=hintText;
}
document.getElementById("phrasePulseBpm").addEventListener("change",event=>{cancelLoopDrag();phraseEngine?.setSourceTempo(Number(event.target.value)*phraseTimingMetrics().pulseQuarters);refreshPhraseUI();});
for(const [id,key]of [["phraseMeterNumerator","meterNumerator"],["phraseMeterDenominator","meterDenominator"],["phraseCountInBars","countInBars"],["phraseLoopSnap","loopSnap"]])document.getElementById(id).addEventListener("change",event=>{cancelLoopDrag();if(key.startsWith("meter"))phraseTaps=[];phraseEngine?.setOptions({[key]:key==="loopSnap"?event.target.value:Number(event.target.value),... (key.startsWith("meter")?{gridConfirmed:true}:{})});});
document.getElementById("phraseBarOne").addEventListener("click",()=>{cancelLoopDrag();phraseEngine?.setOptions({gridOriginMs:Number(document.getElementById("phraseViewTime").value)*1000,gridConfirmed:true});});
document.getElementById("phraseGridReset").addEventListener("click",()=>{cancelLoopDrag();phraseEngine?.setOptions({gridOriginMs:0,gridConfirmed:true});});
document.getElementById("phraseLoopPadEnd").addEventListener("change",event=>{cancelLoopDrag();const loopPadEnd=event.target.checked,sectionEnd=window.KeyMemoryPhrase.timing.maxLoopEnd(phraseSnapshot.duration,{...phraseSnapshot.options,loopPadEnd}),sectionStart=Math.min(phraseSnapshot.options.sectionStart,Math.max(0,sectionEnd-loopBounds().gap));phraseEngine?.setOptions({loopPadEnd,sectionStart,sectionEnd});});

function refreshPhraseForgiveness(preview=false){
  const s=phraseSnapshot;if(!s)return;const o=s.options,range=document.getElementById("phraseForgiveness"),toggle=document.getElementById("phraseRhythmToggle");
  const disabled=!s.notes.length||phraseTransportPending||phraseViewExample||["recording","record-countin"].includes(s.state);
  if(disabled)phraseForgivenessPreview=null;
  else if(preview)phraseForgivenessPreview=Math.max(80,Math.min(1000,Math.round(Number(range.value))));
  if(phraseForgivenessPreview===null)range.value=String(o.tolerance);
  const value=phraseForgivenessPreview??o.tolerance;
  const chord=Math.max(180,value,80*o.sourceBpm/o.playBpm),text=o.rhythm?"±"+Number(value.toFixed(1))+" ms":"Chords "+Number(chord.toFixed(1))+" ms";
  document.getElementById("phraseForgivenessValue").textContent=text;range.setAttribute("aria-valuetext",o.rhythm?value+" milliseconds early or late after count-in":chord+" milliseconds to complete a chord; single notes have no onset deadline");
  toggle.checked=o.rhythm;range.disabled=toggle.disabled=disabled;
}
const phraseForgiveness=document.getElementById("phraseForgiveness");
phraseForgiveness.addEventListener("input",()=>refreshPhraseForgiveness(true));
phraseForgiveness.addEventListener("change",()=>{
  if(phraseForgiveness.disabled||activeMode!=="phrase"||currentDialog||document.hidden)return;
  const value=Math.max(80,Math.min(1000,Math.round(Number(phraseForgiveness.value))));phraseForgivenessPreview=null;cancelLoopDrag();
  if(Number.isFinite(value)&&value!==phraseSnapshot.options.tolerance)phraseEngine.setOptions({tolerance:value});
  phraseForgiveness.value=String(phraseSnapshot.options.tolerance);refreshPhraseForgiveness();
});
phraseForgiveness.addEventListener("blur",()=>{phraseForgivenessPreview=null;phraseForgiveness.value=String(phraseSnapshot.options.tolerance);refreshPhraseForgiveness();});
for(const name of ["pointercancel","keydown"])phraseForgiveness.addEventListener(name,event=>{if(name==="keydown"&&event.key!=="Escape")return;phraseForgivenessPreview=null;phraseForgiveness.value=String(phraseSnapshot.options.tolerance);refreshPhraseForgiveness();});
document.getElementById("phraseRhythmToggle").addEventListener("change",event=>{if(!event.target.disabled){cancelLoopDrag();if(event.target.checked!==phraseSnapshot.options.rhythm)phraseEngine.setOptions({rhythm:event.target.checked});}});

// Timing is non-destructive: only the playback/practice tempo changes.
function refreshPhraseTiming(){
  const s=phraseSnapshot;if(!s)return;const o=s.options,has=s.notes.length>0;
  const disabled=!has||Math.min(phraseExtent(),o.sectionEnd)<=o.sectionStart||phraseTransportPending||["recording","record-countin"].includes(s.state)||phraseViewExample;
  const dial=document.getElementById("phraseTimingDial"),speed=o.playBpm/o.sourceBpm*100,min=30/o.sourceBpm*100,max=300/o.sourceBpm*100,percent=Number(speed.toFixed(1));
  dial.setAttribute("aria-valuemin",String(min));dial.setAttribute("aria-valuemax",String(max));dial.setAttribute("aria-valuenow",String(speed));
  dial.setAttribute("aria-valuetext",speed===100?"Normal speed":percent+" percent speed, "+(speed<100?"slower":"faster"));dial.setAttribute("aria-disabled",String(disabled));dial.tabIndex=disabled?-1:0;
  dial.style.setProperty("--dial-angle",(speed<=100?-135*(100-speed)/Math.max(.001,100-min):135*(speed-100)/Math.max(.001,max-100))+"deg");
  document.getElementById("phraseTimingValue").textContent=percent+"%";
  document.getElementById("phraseTimingSummary").textContent=phraseViewExample?"Example only":!has?"Record a phrase first":speed===100?"Normal speed":(speed<100?"Slower":"Faster");
  document.getElementById("phraseTimingError").textContent=s.error||"";
}
function applyPhraseSpeed(percent){
  const dial=document.getElementById("phraseTimingDial");if(activeMode!=="phrase"||currentDialog||document.hidden||dial.getAttribute("aria-disabled")==="true"||!Number.isFinite(percent))return;
  const o=phraseSnapshot.options,min=30/o.sourceBpm*100,max=300/o.sourceBpm*100;
  cancelLoopDrag();const speed=Math.max(min,Math.min(max,percent)),bpm=Math.max(30,Math.min(300,speed*o.sourceBpm/100));
  if(Math.abs(bpm-o.playBpm)<1e-8)return;
  phraseEngine?.setOptions({playBpm:bpm});
}
const phraseTimingDial=document.getElementById("phraseTimingDial");let phraseDialDrag=null,phraseDialLastTap=null;
phraseTimingDial.addEventListener("keydown",event=>{
  if(!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End","Enter"].includes(event.key))return;
  event.preventDefault();const speed=Number(phraseTimingDial.getAttribute("aria-valuenow")),step=event.shiftKey?10:1;
  applyPhraseSpeed(event.key==="Enter"?100:event.key==="Home"?Number(phraseTimingDial.getAttribute("aria-valuemin")):event.key==="End"?Number(phraseTimingDial.getAttribute("aria-valuemax")):speed+(["ArrowRight","ArrowUp"].includes(event.key)?step:-step));
});
phraseTimingDial.addEventListener("dblclick",()=>applyPhraseSpeed(100));
phraseTimingDial.addEventListener("pointerdown",event=>{
  if(event.button!==0||phraseTimingDial.getAttribute("aria-disabled")==="true"||phraseDialDrag)return;
  event.preventDefault();phraseTimingDial.focus();phraseDialDrag={id:event.pointerId,y:event.clientY,speed:Number(phraseTimingDial.getAttribute("aria-valuenow")),moved:false};phraseTimingDial.setPointerCapture?.(event.pointerId);
});
phraseTimingDial.addEventListener("pointermove",event=>{
  if(!phraseDialDrag||phraseDialDrag.id!==event.pointerId)return;
  if(Math.abs(phraseDialDrag.y-event.clientY)>3)phraseDialDrag.moved=true;
  if(!phraseDialDrag.moved)return;
  const value=phraseDialDrag.speed+(phraseDialDrag.y-event.clientY);applyPhraseSpeed(Math.abs(value-100)<2?100:value);
});
phraseTimingDial.addEventListener("pointerup",event=>{
  if(phraseDialDrag?.id!==event.pointerId)return;
  if(event.pointerType==="touch"&&!phraseDialDrag.moved){const at=Date.now();if(phraseDialLastTap!==null&&at-phraseDialLastTap<400){applyPhraseSpeed(100);phraseDialLastTap=null;}else phraseDialLastTap=at;}else phraseDialLastTap=null;
  phraseDialDrag=null;
});
for(const name of ["pointercancel","lostpointercapture"])phraseTimingDial.addEventListener(name,event=>{if(phraseDialDrag?.id===event.pointerId){phraseDialDrag=null;phraseDialLastTap=null;}});
function canInspectPhrase(){return activeMode==="phrase"&&phraseSnapshot&&["idle","complete"].includes(phraseSnapshot.state)&&!phraseTransportPending;}
function inspectPhraseTime(time,windowStart){
  if(currentDialog||document.hidden||!canInspectPhrase()||!Number.isFinite(time))return;
  const duration=phraseViewExample?(phraseViewModel?.duration||0):phraseExtent(),next=Math.max(0,Math.min(duration,time)),limit=Math.max(0,duration-phraseViewWindow);
  let start=Number.isFinite(windowStart)?windowStart:phraseInspectWindowStart;
  if(!Number.isFinite(start)){const svg=document.querySelector("#phraseStaff .phraseTimelineStaffSVG");start=svg?Number(svg.dataset.timeStart):0;}
  if(next<start||next>start+phraseViewWindow)start=next-phraseViewWindow/4;
  phraseInspectWindowStart=Math.max(0,Math.min(limit,start));
  phraseInspectTime=next;phraseInspectSelected=true;renderPhraseView();
}
const phraseStaff=document.getElementById("phraseStaff");let phraseStaffDrag=null,phraseStaffSuppressClick=false;
// Capture coordinates before rendering; noteheads, labels and empty space all use the same timeline.
function staffPointMapper(){
  const svg=phraseStaff.querySelector(".phraseTimelineStaffSVG");if(!svg)return null;
  const start=Number(svg.dataset.timeStart),end=Number(svg.dataset.timeEnd),left=Number(svg.dataset.timeLeft),right=Number(svg.dataset.timeRight);
  if(![start,end,left,right].every(Number.isFinite)||end<=start||right<=left)return null;
  let toX;const matrix=svg.getScreenCTM?.();
  if(matrix){
    const {a,b,c,d,e,f}=matrix,det=a*d-b*c;
    if(![a,b,c,d,e,f,det].every(Number.isFinite)||Math.abs(det)<1e-12)return null;
    toX=(x,y)=>(d*(x-e)-c*(y-f))/det;
  }else{
    // Fallback for SVG implementations without getScreenCTM, including DOM-only tests.
    const bounds=svg.getBoundingClientRect(),box=svg.getAttribute("viewBox").trim().split(/[ ,]+/).map(Number);
    if(box.length!==4||!box.every(Number.isFinite)||box[2]<=0||box[3]<=0||bounds.width<=0)return null;
    let sx=bounds.width/box[2],sy=bounds.height>0?bounds.height/box[3]:sx,ox=0;
    const aspect=svg.getAttribute("preserveAspectRatio")||"xMidYMid meet";
    if(!aspect.includes("none")){const scale=aspect.includes("slice")?Math.max(sx,sy):Math.min(sx,sy);ox=(bounds.width-box[2]*scale)*(aspect.includes("xMin")?0:aspect.includes("xMax")?1:.5);sx=scale;}
    toX=x=>box[0]+(x-bounds.left-ox)/sx;
  }
  return {start,time:(x,y)=>start+(toX(x,y)-left)/(right-left)*(end-start)};
}
function inspectStaffPoint(event,mapper=staffPointMapper()){
  if(mapper&&Number.isFinite(event.clientX)&&Number.isFinite(event.clientY))inspectPhraseTime(mapper.time(event.clientX,event.clientY),mapper.start);
}
function loopBounds(){
  const s=phraseSnapshot||{},o=s.options||{},duration=phraseExtent(),gap=Math.ceil(50*(o.playBpm||120)/(o.sourceBpm||120));
  return {start:Math.max(0,Math.min(duration,phraseLoopDraft?.start??o.sectionStart??0)),end:Math.max(0,Math.min(duration,phraseLoopDraft?.end??o.sectionEnd??duration)),duration,gap};
}
function canEditLoop(){return activeMode==="phrase"&&!currentDialog&&!document.hidden&&phraseSnapshot?.notes.length&&!phraseViewExample&&!phraseTransportPending&&!["recording","record-countin"].includes(phraseSnapshot.state);}
function clampLoopPoint(bound,time,range=loopBounds()){
  if(!Number.isFinite(time)||range.duration<range.gap)return null;
  const min=bound==="start"?0:range.start+range.gap,max=bound==="start"?range.end-range.gap:range.duration;
  return window.KeyMemoryPhrase.timing.snap(time,phraseSnapshot.options.loopSnap,phraseSnapshot.options,min,max);
}
function refreshPhraseLoop(){
  const r=loopBounds(),enabled=!!canEditLoop()&&r.duration>=r.gap;
  for(const bound of ["start","end"]){
    const cap=bound==="start"?"Start":"End",field=document.getElementById("phraseLoop"+cap),handle=document.getElementById("phraseLoop"+cap+"Handle"),min=bound==="start"?0:r.start+r.gap,max=bound==="start"?Math.max(0,r.end-r.gap):r.duration;
    if(document.activeElement!==field)field.value=String(Number((r[bound]/1000).toFixed(6)));
    field.min=String(min/1000);field.max=String(max/1000);field.disabled=!enabled;handle.disabled=!enabled;
    handle.setAttribute("aria-valuemin",String(min/1000));handle.setAttribute("aria-valuemax",String(max/1000));handle.setAttribute("aria-valuenow",String(r[bound]/1000));handle.setAttribute("aria-valuetext",phrasePositionText(r[bound]));
  }
  document.getElementById("phraseLoopReset").disabled=!canEditLoop();
  const beatMs=phraseTimingMetrics().beatMs,partialBeat=Math.abs((r.end-r.start)/beatMs-Math.round((r.end-r.start)/beatMs))>1e-6;
  const status=document.getElementById("phraseLoopStatus"),statusText=phraseViewExample?"Example only":!phraseSnapshot?.notes.length?"":r.end-r.start<r.gap?"Too short at this speed. Slow down or expand the loop.":partialBeat?"Partial-beat loop: clicks may break at the repeat. Choose Beat or Bar snap and adjust the bounds, or pad the trailing rest.":"";
  if(status.textContent!==statusText)status.textContent=statusText;
  positionLoopHandles();
}
function positionLoopHandles(){
  const svg=phraseStaff.querySelector(".phraseTimelineStaffSVG"),r=loopBounds(),panel=document.getElementById("phraseScore"),bounds=phraseStaff.getBoundingClientRect(),parent=panel.getBoundingClientRect();
  for(const bound of ["start","end"]){
    const handle=document.getElementById("phraseLoop"+(bound==="start"?"Start":"End")+"Handle");
    if(!svg||panel.hidden||!canEditLoop()||bounds.width<=0||r.duration<r.gap){handle.hidden=true;continue;}
    const begin=Number(svg.dataset.timeStart),end=Number(svg.dataset.timeEnd);if(r[bound]<begin||r[bound]>end){handle.hidden=true;continue;}
    const x=Number(svg.dataset.timeLeft)+(r[bound]-begin)/(end-begin)*(Number(svg.dataset.timeRight)-Number(svg.dataset.timeLeft)),m=svg.getScreenCTM?.(),vb=svg.getAttribute("viewBox").split(/[ ,]+/).map(Number),box=svg.getBoundingClientRect();
    const scale=Math.min(box.width/vb[2],box.height>0?box.height/vb[3]:box.width/vb[2]),px=m?m.a*x+m.c*vb[1]+m.e:box.left+(box.width-vb[2]*scale)/2+(x-vb[0])*scale;
    if(!Number.isFinite(px)||px<bounds.left||px>bounds.right){handle.hidden=true;continue;}
    handle.style.left=(px-parent.left)+"px";handle.style.top=((bound==="start"?bounds.top+2:bounds.bottom-46)-parent.top)+"px";handle.hidden=false;
  }
}
function commitLoopPoint(bound,time,reveal=false){
  if(!canEditLoop())return;const r=loopBounds(),value=clampLoopPoint(bound,time,r);if(value===null){refreshPhraseLoop();return;}
  if(Math.abs(value-r[bound])<1e-8){refreshPhraseLoop();return;}
  if(reveal){const begin=Number(phraseStaff.querySelector(".phraseTimelineStaffSVG")?.dataset.timeStart)||0;if(value<begin||value>begin+phraseViewWindow)phraseInspectWindowStart=Math.max(0,Math.min(Math.max(0,r.duration-phraseViewWindow),value-phraseViewWindow/2));}
  phraseEngine.setOptions({sectionStart:bound==="start"?value:r.start,sectionEnd:bound==="end"?value:r.end});
}
function cancelLoopDrag(){if(!phraseLoopDrag&&!phraseLoopDraft)return;phraseLoopDrag=null;phraseLoopDraft=null;renderPhraseView();}
for(const bound of ["start","end"]){
  const cap=bound==="start"?"Start":"End",field=document.getElementById("phraseLoop"+cap),handle=document.getElementById("phraseLoop"+cap+"Handle");
  field.addEventListener("change",()=>{const value=field.value.trim()===""?NaN:Number(field.value)*1000;commitLoopPoint(bound,value);field.value=String(Number((loopBounds()[bound]/1000).toFixed(6)));});
  handle.addEventListener("keydown",event=>{
    if(event.key==="Escape"){event.preventDefault();cancelLoopDrag();return;}
    if(!["ArrowLeft","ArrowDown","ArrowRight","ArrowUp","PageUp","PageDown","Home","End"].includes(event.key))return;
    event.preventDefault();const r=loopBounds(),o=phraseSnapshot.options,m=phraseTimingMetrics(o),step=o.loopSnap==="bar"?m.barMs:o.loopSnap==="beat"?m.beatMs:event.key.startsWith("Page")?100:event.shiftKey?1:10;
    commitLoopPoint(bound,event.key==="Home"?0:event.key==="End"?r.duration:r[bound]+(["ArrowLeft","ArrowDown","PageDown"].includes(event.key)?-step:step),true);
  });
  handle.addEventListener("pointerdown",event=>{
    if(event.button!==0||event.isPrimary===false||phraseLoopDrag||!canEditLoop())return;
    const mapper=staffPointMapper(),r=loopBounds();if(!mapper||r.duration<r.gap)return;
    event.preventDefault();handle.focus({preventScroll:true});phraseLoopDrag={id:event.pointerId,bound,mapper,initialX:event.clientX,initialTime:r[bound]};handle.setPointerCapture?.(event.pointerId);
  });
  const updateDrag=event=>{
    if(phraseLoopDrag?.id!==event.pointerId||phraseLoopDrag.bound!==bound)return;
    const drag=phraseLoopDrag,r=loopBounds(),time=drag.initialTime+drag.mapper.time(event.clientX,event.clientY)-drag.mapper.time(drag.initialX,event.clientY),value=clampLoopPoint(bound,time,r);
    if(value===null||Math.abs(value-r[bound])<1e-8)return;
    phraseLoopDraft={start:r.start,end:r.end,[bound]:value};phraseInspectWindowStart=drag.mapper.start;
    if(!["idle","complete"].includes(phraseSnapshot.state)){phraseInspectTime=Number(document.getElementById("phraseViewTime").value)*1000;phraseInspectSelected=true;phraseEngine.stop();}
    renderPhraseView();
  };
  handle.addEventListener("pointermove",updateDrag);
  handle.addEventListener("pointerup",event=>{
    if(phraseLoopDrag?.id!==event.pointerId||phraseLoopDrag.bound!==bound)return;
    updateDrag(event);const draft=phraseLoopDraft;phraseLoopDrag=null;phraseLoopDraft=null;
    if(draft&&(Math.abs(draft.start-phraseSnapshot.options.sectionStart)>1e-8||Math.abs(draft.end-Math.min(phraseExtent(),phraseSnapshot.options.sectionEnd))>1e-8))phraseEngine.setOptions({sectionStart:draft.start,sectionEnd:draft.end});else renderPhraseView();
  });
  for(const name of ["pointercancel","lostpointercapture"])handle.addEventListener(name,event=>{if(phraseLoopDrag?.id===event.pointerId)cancelLoopDrag();});
}
document.getElementById("phraseLoopReset").addEventListener("click",()=>{if(canEditLoop()){const r=loopBounds();phraseLoopDraft=null;phraseLoopDrag=null;if(r.start!==0||r.end!==r.duration)phraseEngine.setOptions({sectionStart:0,sectionEnd:r.duration});else refreshPhraseLoop();}});
phraseStaff.addEventListener("pointerdown",event=>{
  phraseStaffSuppressClick=false;
  // Touch keeps native scrolling; its completed tap is handled by click.
  if(event.pointerType==="touch"||event.button!==0||event.isPrimary===false||phraseStaffDrag||currentDialog||document.hidden||!canInspectPhrase())return;
  const mapper=staffPointMapper();if(!mapper)return;
  event.preventDefault();phraseStaff.focus({preventScroll:true});phraseStaffDrag={id:event.pointerId,mapper};phraseStaff.setPointerCapture?.(event.pointerId);inspectStaffPoint(event,mapper);
});
phraseStaff.addEventListener("pointermove",event=>{if(phraseStaffDrag?.id===event.pointerId)inspectStaffPoint(event,phraseStaffDrag.mapper);});
phraseStaff.addEventListener("pointerup",event=>{if(phraseStaffDrag?.id!==event.pointerId)return;inspectStaffPoint(event,phraseStaffDrag.mapper);phraseStaffDrag=null;phraseStaffSuppressClick=true;});
for(const name of ["pointercancel","lostpointercapture","scroll"])phraseStaff.addEventListener(name,()=>{phraseStaffDrag=null;if(name==="scroll"){cancelLoopDrag();positionLoopHandles();}});
phraseStaff.addEventListener("click",event=>{
  if(phraseStaffSuppressClick){phraseStaffSuppressClick=false;return;}
  if(event.detail===0){inspectPhraseTime(phraseInspectTime);return;}
  inspectStaffPoint(event);
});
phraseStaff.addEventListener("keydown",event=>{
  if(["Enter"," ","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(event.key)){
    event.preventDefault();const step=event.altKey?1:event.shiftKey?1000:100;
    inspectPhraseTime(event.key==="Home"?0:event.key==="End"?(phraseViewExample?phraseViewModel?.duration||0:phraseExtent()):phraseInspectTime+(["ArrowLeft","ArrowDown"].includes(event.key)?-step:["ArrowRight","ArrowUp"].includes(event.key)?step:0));
  }
});
// Display/inspection never change raw notes, transport, grading or audio.
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
  document.getElementById("phraseMeterControls").hidden=!enabled;
  const small=window.innerWidth<1050||window.innerHeight<550;
  const show=enabled&&(phraseViewVisibility==="show"||(phraseViewVisibility==="auto"&&(!small||phraseSmallScore)));
  panel.hidden=!show;
  const hidePiano=show&&small;
  const wasPianoHidden=piano.parentElement.hidden;
  if(hidePiano&&!wasPianoHidden)phrasePianoScroll=piano.parentElement.scrollLeft;
  piano.parentElement.hidden=hidePiano;
  if(!hidePiano&&wasPianoHidden){renderPiano();piano.parentElement.scrollLeft=activeMode==="phrase"?phrasePianoScroll:0;}
  document.querySelector(".pianoHint").hidden=hidePiano;
  document.getElementById("phraseKeyLegend").hidden=!enabled||hidePiano;
  document.querySelector(".info").hidden=hidePiano;
  const toggle=document.getElementById("phraseViewSwitch");toggle.hidden=!small;toggle.textContent=show?"Show piano":"Show score";toggle.setAttribute("aria-expanded",String(show));
  document.getElementById("phraseViewVisibility").value=phraseViewVisibility;
  document.getElementById("phraseSpelling").value=phraseViewSpelling;
  document.getElementById("phraseNoteNames").checked=phraseViewNames;
  if(!enabled)return;
  const s=phraseSnapshot,view=window.KeyMemoryPhraseView,recording=s.state==="recording",playing=s.state==="playing";
  const exampleAllowed=["idle","complete"].includes(s.state)&&!phraseTransportPending;
  if(!exampleAllowed)phraseViewExample=false;
  const imported=s.origin==="audio"&&!recording&&!phraseViewExample;
  document.getElementById("phraseTimingScope").textContent=imported?"Detected pitches · estimated timing":"Pitch reading · exact timing";
  document.getElementById("phraseDurationLegend").textContent=imported?"Solid = estimated note duration; no pedal data":"Solid = key held · dashed tail = pedal sustain";
  const exampleButton=document.getElementById("phraseViewExample");exampleButton.disabled=!exampleAllowed;exampleButton.textContent=phraseViewExample?"Back to my phrase":"Show example";
  const source=phraseViewExample?{duration:3000,notes:[48,60,64,67].map(note=>({note,channel:0,velocity:90,start:0,duration:600})).concat([{note:72,channel:0,velocity:90,start:2000,duration:500}]),controllers:[{controller:64,value:127,channel:0,time:200},{controller:64,value:0,channel:0,time:1500}],initialControllers:[]}:{notes:recording?(s.viewNotes||[]):s.notes,controllers:recording?(s.viewControllers||[]):s.controllers,initialControllers:recording?(s.viewInitialControllers||[]):s.initialControllers,duration:recording?s.viewDuration:phraseExtent()};
  const signature=[phraseViewExample,s.state,source.notes.length,source.controllers?.length,source.duration,s.options.transpose,source.notes[0]?.note,source.notes.at(-1)?.note].join(":");
  if(signature!==phraseViewSignature||!phraseViewModel){phraseViewModel=view.prepareTimeline({...source,duration:recording||phraseViewExample?source.duration:s.duration},{transpose:recording||phraseViewExample?0:s.options.transpose});phraseViewSignature=signature;}
  const model=phraseViewModel,advancedElapsed=s.elapsed+((playing||(s.state==="practice"&&s.options.rhythm))?Math.max(0,Date.now()-phraseViewStamp):0),elapsed=playing&&s.looping&&s.playbackDuration>0?advancedElapsed%s.playbackDuration:advancedElapsed;
  const practiceTime=s.state==="practice"?s.options.sectionStart+(s.options.rhythm?elapsed:s.targetTime??0)*s.options.playBpm/s.options.sourceBpm:null;
  const time=recording?source.duration:practiceTime!==null?Math.min(source.duration,s.options.sectionEnd,practiceTime):playing?Math.min(source.duration,s.options.sectionEnd,s.options.sectionStart+elapsed*s.options.playBpm/s.options.sourceBpm):Math.min(source.duration,phraseInspectTime);
  const held=playing&&time>=Math.min(source.duration,s.options.sectionEnd)?[]:model.notes.filter(n=>n.start<=time&&n.keyEnd>time);
  const live=[...new Set([...phraseRawHeld].map(k=>Number(k.split(":")[1])))];
  const showingLive=!phraseViewExample&&(recording||!source.notes.length||(!playing&&live.length>0));
  const practicing=s.state==="practice"||s.state==="countin";
  const pitches=showingLive?live:practicing?s.target:held.map(n=>n.midi);
  // Live musical input is independent of reference/playback, even on the same
  // pitch. Reserved shortcuts never enter phraseRawHeld; pedal tails are not
  // physically held keys. Keep deliberate inspection visible while playing.
  const playbackHeld=new Set(playing?held.map(n=>n.midi):[]),liveHeld=new Set(live);
  const inspecting=canInspectPhrase()&&phraseInspectSelected;
  const inspectHeld=new Set(inspecting?held.map(n=>n.midi):[]),inspectTails=new Set(inspecting?model.notes.filter(n=>n.start<=time&&n.keyEnd<=time&&n.soundEnd>time).map(n=>n.midi):[]);
  for(const key of piano.querySelectorAll(".key")){
    const midi=Number(key.dataset.midi),on=playbackHeld.has(midi),liveOn=liveHeld.has(midi),heldAtPoint=inspectHeld.has(midi),pedalAtPoint=!heldAtPoint&&inspectTails.has(midi);
    key.classList.toggle("phrasePlaying",on);key.classList.toggle("phraseLive",liveOn);
    key.classList.toggle("phraseInspectKey",heldAtPoint);key.classList.toggle("phraseInspectTail",pedalAtPoint);
    const cues=[];
    if(key.classList.contains("chordTone"))cues.push("practice target");
    if(on)cues.push(imported?"playing estimated note":"playing, key held");
    if(heldAtPoint)cues.push(imported?"inspected estimated note":"inspected time, key held");
    if(pedalAtPoint)cues.push("inspected time, pedal sustain only");
    if(liveOn)cues.push("your MIDI key held");
    if(key.title)key.setAttribute("aria-label",key.title+(cues.length?" · "+cues.join(" · "):""));
  }
  if(show){
    const width=Math.max(320,panel.clientWidth||800),inspectable=canInspectPhrase(),limit=Math.max(0,source.duration-phraseViewWindow);
    const start=Math.max(0,Math.min(limit,inspectable&&Number.isFinite(phraseInspectWindowStart)?phraseInspectWindowStart:time-phraseViewWindow/4)),end=start+phraseViewWindow;
    if(inspectable)phraseInspectWindowStart=start;
    document.getElementById("phraseStaff").innerHTML=source.notes.length&&view.timelineStaffSVG?view.timelineStaffSVG(model,{start,end,cursor:time,width:Math.max(240,document.getElementById("phraseStaff").clientWidth||width),maxNotes:400,spelling:phraseViewSpelling,names:phraseViewNames,inspecting,includeContinuations:inspectable,loopStart:phraseViewExample?undefined:loopBounds().start,loopEnd:phraseViewExample?undefined:loopBounds().end,grid:phraseViewExample?undefined:window.KeyMemoryPhrase.timing.grid(s.options,start,end,120),gridConfirmed:s.options.gridConfirmed}):view.staffSVG(pitches,{spelling:phraseViewSpelling,names:phraseViewNames});
    const names=[...new Set(pitches)].sort((a,b)=>a-b).map(n=>view.pitch(n,phraseViewSpelling).name);
    document.getElementById("phrasePitchText").setAttribute("aria-live",inspecting&&!showingLive?"polite":"off");
    document.getElementById("phrasePitchText").textContent=(phraseViewExample?"EXAMPLE — C major + bass, not your recording: ":playing?"Playing keys: ":showingLive?"Live keys: ":practicing?"Target keys: ":inspecting?(imported?"Selected time, estimated notes: ":"Selected time, keys held: "):"At cursor: ")+(names.join(" · ")||(imported?"No estimated notes active":"No keys held"))+([...inspectTails].some(n=>!inspectHeld.has(n))?". At inspected time, pedal only: "+[...inspectTails].filter(n=>!inspectHeld.has(n)).map(n=>view.pitch(n,phraseViewSpelling).name).join(" · "):"")+". C4 = middle C.";
    document.getElementById("phraseRoll").innerHTML=view.rollSVG(model,{start,end,cursor:time,maxNotes:400,width,height:small?110:150,grid:phraseViewExample?undefined:window.KeyMemoryPhrase.timing.grid(s.options,start,end,120),gridConfirmed:s.options.gridConfirmed,names:phraseViewNames,spelling:phraseViewSpelling});
    phraseStaff.setAttribute("aria-valuemax",String(source.duration/1000));phraseStaff.setAttribute("aria-valuenow",String(time/1000));phraseStaff.setAttribute("aria-valuetext",phrasePositionText(time));phraseStaff.setAttribute("aria-disabled",String(!inspectable||!source.notes.length));phraseStaff.tabIndex=inspectable&&source.notes.length?0:-1;
    const seek=document.getElementById("phraseViewTime");seek.max=String(Math.max(.01,source.duration/1000));seek.value=String(time/1000);seek.disabled=!canInspectPhrase()||!source.notes.length;
    document.getElementById("phraseViewTimeLabel").textContent=phrasePositionText(time);
    const cc=new Map((source.initialControllers||[]).map(c=>[c.channel+":"+c.controller,c.value]));
    for(const c of source.controllers||[])if(c.time<=time)cc.set(c.channel+":"+c.controller,c.value);
    const channels=[...new Set(model.notes.filter(n=>n.start<=time&&n.soundEnd>time).map(n=>n.channel))];
    const sectionContext=!phraseViewExample&&(s.options.sectionStart>0||s.options.sectionEnd<source.duration)?"Source context; loop ends at "+(Math.min(source.duration,s.options.sectionEnd)/1000).toFixed(2)+" s. ":"";
    document.getElementById("phraseControllerText").textContent=sectionContext+(imported?"Estimated note durations from audio. No pedal data; neutral playback velocity. Tempo is not detected.":channels.length?channels.map(ch=>"Ch "+(ch+1)+": pedal "+((cc.get(ch+":64")||0)>=64?"down":"up")+" · volume "+(cc.get(ch+":7")??100)+" · expression "+(cc.get(ch+":11")??127)).join(" | "):"Unquantized source seconds · solid key lengths; pedal tails are not extra pressed notes.");
  }
  refreshPhraseTiming();refreshPhraseForgiveness();refreshPhraseMeter();refreshPhraseLoop();refreshTransportShortcuts();
  if((playing||recording||(s.state==="practice"&&s.options.rhythm))&&!document.hidden)phraseViewTick=setTimeout(renderPhraseView,80);
}
for(const [id,apply]of[
  ["phraseViewVisibility",event=>{phraseViewVisibility=event.target.value;phraseSmallScore=phraseViewVisibility==="show";}],
  ["phraseSpelling",event=>{phraseViewSpelling=event.target.value;}],
  ["phraseNoteNames",event=>{phraseViewNames=event.target.checked;}]
])document.getElementById(id).addEventListener("change",event=>{apply(event);savePhraseViewPreferences();refreshPhraseUI();});
document.getElementById("phraseViewSwitch").addEventListener("click",()=>{const showing=!document.getElementById("phraseScore").hidden;phraseSmallScore=!showing;phraseViewVisibility="auto";savePhraseViewPreferences();renderPhraseView();});
document.getElementById("phraseViewTime").addEventListener("input",event=>{inspectPhraseTime(Number(event.target.value)*1000);});

function phraseDisplayName(midi,withOctave=true){const name=window.KeyMemoryPhraseView?window.KeyMemoryPhraseView.pitch(midi,phraseViewSpelling).name.replace("#","♯").replace(/([A-G])b/,"$1♭"):noteName(midi)+(Math.floor(midi/12)-1);return withOctave?name:name.replace(/-?\d+$/,"");}
document.getElementById("phraseViewWindow").addEventListener("change",event=>{cancelLoopDrag();phraseViewWindow=Number(event.target.value);phraseInspectWindowStart=null;phraseStaffDrag=null;renderPhraseView();});

document.getElementById("phraseViewExample").addEventListener("click",()=>{phraseLoopDraft=null;phraseLoopDrag=null;phraseViewExample=!phraseViewExample;phraseInspectTime=0;phraseInspectSelected=false;phraseInspectWindowStart=null;phraseStaffDrag=null;phraseViewVisibility="show";phraseSmallScore=true;renderPhraseView();});

// Backgrounding cancels voices and pending live requests without changing mute preference.
window.addEventListener("blur",()=>{stopBuilderAudio();resetMidiAudio();silencePhrase(false);});
document.addEventListener("visibilitychange",()=>{if(document.hidden){stopBuilderAudio();resetMidiAudio();silencePhrase(false);}});

for(const id of ["closeSettings","openModes"]){document.getElementById(id)?.addEventListener("click",()=>midiTransport?.cancelLearn());}

// Hidden piano containers do not resize-observe while Score is visible.
window.addEventListener("resize",()=>{cancelLoopDrag();phraseStaffDrag=null;phraseDialDrag=null;if(activeMode==="phrase")renderPhraseView();});
window.addEventListener("blur",()=>{cancelLoopDrag();phraseStaffDrag=null;phraseStaffSuppressClick=false;phraseDialDrag=null;phraseDialLastTap=null;});

document.addEventListener("visibilitychange",()=>{if(document.hidden){cancelLoopDrag();phraseStaffDrag=null;phraseDialDrag=null;}});
