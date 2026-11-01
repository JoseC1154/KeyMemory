// FILE: app.js
"use strict";

// The design and key proportions are adapted from KeyTransposer.
// Unlike KeyTransposer, KeyMemory only renders a screen-fitting range.
const piano = document.getElementById("piano");
const rangeText = document.getElementById("rangeText");
const noteText = document.getElementById("noteText");
const selected = new Set();
const APP_VERSION = "2026.11.01.4";
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
const dictionaryExpand = document.getElementById("dictionaryExpand");
const dictionaryOptions = document.getElementById("dictionaryOptions");
dictionaryExpand.addEventListener("click", () => {
  const expanded = dictionaryExpand.getAttribute("aria-expanded") === "true";
  dictionaryExpand.setAttribute("aria-expanded", String(!expanded));
  dictionaryOptions.classList.toggle("expanded", !expanded);
});
const toggleChordNotes = document.getElementById("toggleChordNotes");
const checkChordAnswer = document.getElementById("checkChordAnswer");
let dictionaryPractice = false;
let dictionaryTimedOut = false;
let autoNextTimer = null;
function cancelAutoNext() {
  if (autoNextTimer !== null) clearTimeout(autoNextTimer);
  autoNextTimer = null;
}
function scheduleAutoNext() {
  cancelAutoNext();
  if (!timerEnabled.checked || activeMode === "free") return;
  const modeAtAnswer = activeMode;
  nextChallenge.hidden = true;
  autoNextTimer = setTimeout(() => {
    autoNextTimer = null;
    if (!timerEnabled.checked || activeMode !== modeAtAnswer) return;
    if (activeMode === "dictionary") {
      setDictionaryPractice(true);
    } else if (activeMode === "builder") {
      advanceBuilder();
    } else {
      chooseChallenge();
    }
  }, 1800);
}
const timerControls = document.getElementById("timerControls");
const timerEnabled = document.getElementById("timerEnabled");
const timerDuration = document.getElementById("timerDuration");
const timerRemaining = document.getElementById("timerRemaining");
const timerProgress = document.getElementById("timerProgress");
const semitoneControls = document.getElementById("semitoneControls");
const semitoneDifficulty = document.getElementById("semitoneDifficulty");
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
  hearBuilder.hidden = builderNotes.length < 3;
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
    builderHint.textContent="Your selections in other levels are kept.";hearBuilder.hidden=true;nextChallenge.hidden=true;renderPiano();return;
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
function scheduleBuilderMilestone() {
  cancelAutoNext();
  if (!timerEnabled.checked) return;
  const phase = builderPhase;
  autoNextTimer = setTimeout(() => {
    autoNextTimer = null;
    if (activeMode !== "builder" || !timerEnabled.checked || builderPhase !== phase) return;
    advanceBuilder();
  }, 4000);
}
function showBuilderMilestone(complete) {
  stopCountdown();
  targetMidi = null;
  builderPhase = complete ? "complete" : "triad";
  selected.clear();
  renderPiano();
  const name = complete ? builderName() : builderStageName();
  chordTitle.textContent = name;
  degreeTitle.textContent = complete ? "All " + builderNotes.length + " notes completed" : builderNotes.length===3 ? "Foundation complete · recognize this sound" : "Stage complete · recognize this sound";
  trainingPrompt.textContent = complete ? "Completed " + name + "! " + (timerEnabled.checked ? "Next chord starts in 4 seconds." : "Choose Build another chord to continue.")
    : "You built " + name + ". Next: add the " + builderLesson.roles[builderStep] + " toward " + builderName() + ".";
  builderHint.textContent = builderNoteList() + ". Hear the chord before moving on." + (timerEnabled.checked ? " Listening restarts the 4-second pause." : "");
  hearBuilder.hidden = false;
  nextChallenge.hidden = false;
  nextChallenge.textContent = complete ? "Build another chord" : builderNextLabel();
  celebrate((complete ? "Chord complete! " : "Stage complete! ") + name);
  scheduleBuilderMilestone();
}
function advanceBuilder() {
  cancelAutoNext();
  stopBuilderAudio();
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
function stopBuilderAudio() {
  for (const voice of builderVoices) { try { voice.stop(); } catch (_) {} }
  builderVoices = [];
}
hearBuilder.addEventListener("click", async () => {
  if (activeMode !== "builder" || builderNotes.length < 3) return;
  const notes = [...builderNotes];
  const phase = builderPhase;
  cancelAutoNext();
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error("Audio unavailable");
    builderAudioContext ||= new Audio();
    await builderAudioContext.resume();
    if (activeMode !== "builder" || builderPhase !== phase || notes.join() !== builderNotes.join()) return;
    stopBuilderAudio();
    const now = builderAudioContext.currentTime;
    for (const midi of notes) {
      const oscillator = builderAudioContext.createOscillator();
      const gain = builderAudioContext.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(.12 / notes.length, now + .03);
      gain.gain.exponentialRampToValueAtTime(.001, now + 1.1);
      oscillator.connect(gain);gain.connect(builderAudioContext.destination);
      oscillator.start(now);oscillator.stop(now + 1.15);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      builderVoices.push(oscillator);
    }
  } catch (_) {
    builderHint.textContent = "Audio is unavailable in this browser. You can still continue building.";
  }
  if (activeMode === "builder" && (builderPhase === "triad" || builderPhase === "complete")) scheduleBuilderMilestone();
});
builderLevel.addEventListener("change", restartBuilderPreferences);
function stopCountdown() {
  if (countdown !== null) clearInterval(countdown);
  countdown = null;
  timerRemaining.textContent = "";
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
    timerProgress.value = remaining / (seconds * 1000) * 100;
    if (remaining <= 0) {
      stopCountdown();
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
      scheduleAutoNext();
    }
  }
  tick();
  countdown = setInterval(tick, 100);
}
timerEnabled.addEventListener("change", () => {
  cancelAutoNext();
  nextChallenge.hidden = activeMode === "free" || activeMode === "dictionary" || targetMidi !== null;
  stopCountdown();
  if (activeMode === "builder" && targetMidi === null) {
    if (builderPhase === "empty") { nextChallenge.hidden=true;return; }
    if (builderPhase === "triad" || builderPhase === "complete") showBuilderMilestone(builderPhase === "complete");
    else if (timerEnabled.checked) scheduleAutoNext();
    return;
  }
  if (timerEnabled.checked && (targetMidi !== null && challengeTimer === null || activeMode === "dictionary" && dictionaryPractice && !checkChordAnswer.disabled)) startCountdown();
});
timerDuration.addEventListener("change", () => { if (countdown !== null) startCountdown(); });
semitoneDifficulty.addEventListener("change", () => { if (activeMode === "semitones") chooseChallenge(); });
function setDictionaryPractice(on) {
  cancelAutoNext();
  dismissAchievement();
  dictionaryPractice = on;
  dictionaryTimedOut = false;
  selected.clear();
  toggleChordNotes.textContent = on ? "Show Notes" : "Hide Notes & Practice";
  toggleChordNotes.setAttribute("aria-pressed", String(on));
  checkChordAnswer.hidden = !on;
  checkChordAnswer.disabled = false;
  checkChordAnswer.textContent = "Check Answer";
  document.getElementById("dictionaryNotes").hidden = on;
  renderPiano();
  if (activeMode === "dictionary") {
    trainingPrompt.textContent = on ? "Select the chord notes from memory, then check your answer." : "Blue keys show the selected chord inversion.";
    if (on) startCountdown(); else stopCountdown();
  }
}
toggleChordNotes.addEventListener("click", () => setDictionaryPractice(!dictionaryPractice));
checkChordAnswer.addEventListener("click", () => {
  if (!dictionaryPractice || dictionaryTimedOut || checkChordAnswer.disabled || activeMode !== "dictionary") return;
  const correct = selected.size === dictionaryVoicing.length &&
    dictionaryVoicing.every(midi => selected.has(midi));
  trainingPrompt.textContent = correct
    ? "Correct! You remembered every note."
    : "Not quite. Press Show Notes to review the chord and try again.";
  if (correct) celebrate("Perfect chord! You got it!");
  else incorrect("Not quite — review the chord and try again.");
  checkChordAnswer.disabled = true;
  stopCountdown();
  scheduleAutoNext();
});
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
  if (activeMode !== "dictionary") return;
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
  stopBuilderAudio();
  clearWrongKeyFeedback();
  cancelAutoNext();
  stopCountdown();
  if (challengeTimer !== null) clearTimeout(challengeTimer);
  challengeTimer = null;
  targetMidi = null;
  chordAnswer = null;
  displayedChord = [];
  dictionaryVoicing = [];
}
function chooseChallenge() {
  dismissAchievement();
  cancelChallenge();
  if (activeMode === "free") return;
  if (activeMode === "dictionary") { updateDictionary(); nextChallenge.hidden = true; return; }
  if (activeMode === "builder") { beginBuilder(); return; }
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
    showChordOnPiano();
    const degreeName = degree === 1 ? "root (1st)" : degree === 3 ? "3rd" : "5th";
    chordTitle.textContent = NAMES[root] + (minor ? " minor" : " major");
    degreeTitle.textContent = "Find the " + degreeName;
    displayQuestion([{text:"Find the "}, {text:degreeName, strong:true}, {text:" of " + chordTitle.textContent}]);
    startCountdown();
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
}
// Keep feedback separate from selection so a resize cannot erase the red flash.
// Each callback owns a feedback record and cannot clear a later question.
function flashWrongKey(key) {
  const midi = Number(key.dataset.midi);
  const previous = wrongKeyFeedback.get(midi);
  if (previous) clearTimeout(previous.timer);
  const feedback = { started: Date.now(), timer: null };
  wrongKeyFeedback.set(midi, feedback);
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
  stopCountdown();
  if (activeMode === "builder") {
    const correct = midi === targetMidi;
    if (correct) {
      builderAdvancePending = true;
      celebrate("Correct! " + noteName(midi) + " added.");
    } else {
      incorrect("Not quite — try " + noteName(targetMidi) + ".");
    }
    targetMidi = null;
    builderPhase = "answered";
    if (correct && builderStep >= 2) {
      advanceBuilder();
      return correct;
    }
    nextChallenge.hidden = timerEnabled.checked;
    nextChallenge.textContent = correct ? "Continue building" : "Try this step again";
    scheduleAutoNext();
    return correct;
  }
  // Semitone prompts display note names without octave numbers.
  // Accept the correct pitch class in any visible octave, like Find the Note.
  const correct = activeMode === "degrees" ? midi % 12 === chordAnswer :
    (activeMode === "find" || activeMode === "semitones") ? midi % 12 === targetMidi % 12 :
    midi === targetMidi;
  const answer = activeMode === "degrees" ? NAMES[chordAnswer] : noteName(targetMidi);
  trainingPrompt.textContent = correct ? "Correct! Well done." : "Not quite. The answer was " + answer + ".";
  if (correct) celebrate("Great job! Correct note!");
  else incorrect("Not quite — the answer was " + answer + ".");
  targetMidi = null;
  chordAnswer = null;
  nextChallenge.hidden = timerEnabled.checked;
  scheduleAutoNext();
  return correct;
}
function activateMode(mode) {
  dismissAchievement();
  cancelChallenge();
  activeMode = mode;
  chordQuestion.hidden = mode !== "degrees" && mode !== "builder";
  nextChallenge.textContent = "Next";
  dictionaryPractice = false;
  document.getElementById("dictionaryControls").hidden = mode !== "dictionary";
  timerControls.hidden = mode === "free";
  semitoneControls.hidden = mode !== "semitones";
  builderControls.hidden = mode !== "builder";
  selected.clear();
  modeName.textContent = mode === "find" ? "Find the Note" : mode === "remember" ? "Remember the Key" : mode === "degrees" ? "Chord Degrees" : mode === "semitones" ? "Semitones" : mode === "builder" ? "Chord Builder" : mode === "dictionary" ? "Chord Dictionary" : "Free Play";
  trainingPrompt.textContent = mode === "free" ? "Explore the keyboard, or choose a training mode." : "Ready?";
  nextChallenge.hidden = mode === "free" || mode === "dictionary";
  renderPiano();
  if (mode !== "free") chooseChallenge();
}


function dictionaryKeyboardRange() {
  if (!dictionaryVoicing.length) return { start:48, octaves:1 };
  const low = Math.min(...dictionaryVoicing);
  const high = Math.max(...dictionaryVoicing);
  const start = 48 + Math.floor((low - 48) / 12) * 12;
  return { start, octaves: Math.max(1, Math.ceil((high - start + 1) / 12)) };
}
function visibleOctaves(width) {
  if (activeMode === "dictionary") return dictionaryKeyboardRange().octaves;
  if (activeMode === "builder" && builderTargets.length) return Math.max(1, Math.ceil((builderTargets[builderTargets.length - 1] - 48 + 1) / 12));
  return width < 600 ? 2 : width < 1050 ? 3 : 4;
}
function updateStatus(start, end) {
  rangeText.textContent = visibleOctaves(piano.parentElement.clientWidth) + " octaves";
  const notes = [...selected].sort((a,b) => a-b).map(noteName);
  noteText.textContent = notes.length ? "Selected: " + notes.join(", ") : "Tap a key to highlight it";
}
function renderPiano() {
  const container = piano.parentElement;
  const viewportWidth = container.clientWidth;
  const mobile = matchMedia("(max-width: 600px) and (orientation: portrait)").matches;
  const width = viewportWidth;
  const pad = mobile ? 6 : 10;
  const octaves = visibleOctaves(width);
  const start = activeMode === "dictionary" ? dictionaryKeyboardRange().start : 48;
  const end = start + octaves * 12; // exclusive: whole C-to-B octaves
  const whiteCount = octaves * 7;
  const gap = 2;
  const usable = Math.max(0, width - pad * 2);
  // Fit one or two dictionary octaves in portrait; only longer ranges scroll.
  // Other modes retain two-octave scrolling with comfortable touch targets.
  const visibleWhiteKeys = activeMode === "dictionary" ? Math.min(whiteCount, 14) : 12;
  const mobileWhiteWidth = (usable - (visibleWhiteKeys - 1) * gap) / visibleWhiteKeys;
  // Cap desktop key width so a short keyboard never stretches into giant keys.
  // Use the keyboard's own natural width and center it when space remains.
  const desktopWhiteWidth = (usable - (whiteCount - 1) * gap) / whiteCount;
  const whiteW = mobile
    ? Math.max(activeMode === "dictionary" ? 22 : 26, mobileWhiteWidth)
    : Math.max(18, Math.min(54, desktopWhiteWidth));
  const keyboardWidth = whiteCount * whiteW + (whiteCount - 1) * gap + pad * 2;
  piano.style.width = keyboardWidth + "px";
  piano.style.marginInline = !mobile && keyboardWidth <= width ? "auto" : "0";
  const whiteH = mobile
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
    button.setAttribute("aria-label", noteName(midi));
    button.setAttribute("aria-pressed", String(selected.has(midi)));
    if (selected.has(midi)) button.classList.add("selected");
    const feedback = wrongKeyFeedback.get(midi);
    if (feedback && Date.now() - feedback.started < WRONG_KEY_DURATION) {
      button.classList.add("wrongAnswer");
      button.style.setProperty("--wrong-key-delay", -(Date.now() - feedback.started) + "ms");
    }
    if (activeMode === "dictionary" ? !dictionaryPractice && dictionaryVoicing.includes(midi) :
      activeMode === "builder" ? builderNotes.includes(midi) : displayedChord.includes(midi % 12)) button.classList.add("chordTone");
    if (activeMode === "builder" && builderNotes[builderNotes.length - 1] === midi) button.classList.add("builderNewest");
    const label = document.createElement("span");
    label.className = "noteLabel";
    label.textContent = NAMES[midi % 12];
    button.append(label);
    button.addEventListener("click", () => {
      // Only correct training answers use the green selected-key feedback.
      // Ignore answers while a memory target is being shown.
      if (activeMode === "dictionary") {
        if (!dictionaryPractice || dictionaryTimedOut) return;
        if (selected.has(midi)) selected.delete(midi);
        else selected.add(midi);
        button.classList.toggle("selected", selected.has(midi));
        button.setAttribute("aria-pressed", String(selected.has(midi)));
        checkChordAnswer.disabled = false;
        updateStatus(start, end - 1);
        return;
      }
      if (activeMode !== "free" && (targetMidi === null || challengeTimer !== null)) return;
      if (activeMode === "free") {
        if (selected.has(midi)) selected.delete(midi);
        else selected.add(midi);
      } else {
        selected.clear();
        const correct = answerKey(midi);
        if (correct) selected.add(midi);
        else flashWrongKey(button);
        piano.querySelectorAll(".key.selected").forEach(key => {
          key.classList.remove("selected");
          key.setAttribute("aria-pressed", "false");
        });
      }
      button.classList.toggle("selected", selected.has(midi));
      button.setAttribute("aria-pressed", String(selected.has(midi)));
      if (!button.isConnected) {
        // The final builder answer rerenders the completed chord immediately.
        selected.clear();
      }
      updateStatus(start, end - 1);
    });
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
  selected.clear();
  renderPiano();
});
const observer = new ResizeObserver(() => renderPiano());
observer.observe(piano.parentElement);
window.addEventListener("orientationchange", () => requestAnimationFrame(renderPiano));
renderPiano();

const modeOverlay = document.getElementById("modeOverlay");
const modeScroller = document.getElementById("modeScroller");
const modeSlides = [...document.querySelectorAll(".modeSlide")];
const openModes = document.getElementById("openModes");
const closeModes = document.getElementById("closeModes");
let previousFocus = null;
function setMenu(open) {
  modeOverlay.hidden = !open;
  openModes.setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
  if (open) {
    previousFocus = document.activeElement;
    modeScroller.focus();
    syncSlide();
  } else {
    (previousFocus || openModes).focus();
  }
}
function syncSlide() {
  const viewport = modeScroller.getBoundingClientRect();
  const center = viewport.top + viewport.height / 2;
  const spacing = Math.max(1, modeSlides[0]?.getBoundingClientRect().height || 1);
  let current = 0;
  let closest = Infinity;
  modeSlides.forEach((slide, i) => {
    const rect = slide.getBoundingClientRect();
    const distance = Math.abs(rect.top + rect.height / 2 - center);
    const proximity = Math.max(0, 1 - distance / spacing);
    const inner = slide.querySelector(".modeInner");
    inner.style.setProperty("--proximity", proximity.toFixed(3));
    // Compute the blur in JavaScript for reliable support across browsers.
    inner.style.setProperty("--effective-blur", ((1 - proximity) * 9).toFixed(2) + "px");
    if (distance < closest) { closest = distance; current = i; }
  });
  modeSlides.forEach((slide, i) => slide.classList.toggle("isActive", i === current));
  document.getElementById("modeDots").textContent = modeSlides.map((_, i) => i === current ? "●" : "○").join(" ");
}
openModes.addEventListener("click", () => setMenu(true));
closeModes.addEventListener("click", () => setMenu(false));
modeScroller.addEventListener("scroll", syncSlide, {passive:true});
document.querySelectorAll(".startMode").forEach(button => button.addEventListener("click", () => {
  setMenu(false);
  activateMode(button.dataset.mode);
}));
nextChallenge.addEventListener("click", () => activeMode === "builder" ? advanceBuilder() : chooseChallenge());
document.addEventListener("keydown", e => {
  if (modeOverlay.hidden) return;
  if (e.key === "Escape") { setMenu(false); return; }
  if (e.key === "Tab") {
    const controls = [closeModes, ...modeOverlay.querySelectorAll(".startMode")];
    const focusable = controls.filter(el => el.getBoundingClientRect().height > 0);
    if (!focusable.length) return;
    const index = focusable.indexOf(document.activeElement);
    if (e.shiftKey && index <= 0) { e.preventDefault(); focusable[focusable.length - 1].focus(); }
    if (!e.shiftKey && index === focusable.length - 1) { e.preventDefault(); focusable[0].focus(); }
  }
});

document.getElementById("buildVersion").textContent = "Build " + APP_VERSION;
