// FILE: app.js
"use strict";

// The design and key proportions are adapted from KeyTransposer.
// Unlike KeyTransposer, KeyMemory only renders a screen-fitting range.
const piano = document.getElementById("piano");
const rangeText = document.getElementById("rangeText");
const noteText = document.getElementById("noteText");
const selected = new Set();
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
function setDictionaryPractice(on) {
  dismissAchievement();
  dictionaryPractice = on;
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
  }
}
toggleChordNotes.addEventListener("click", () => setDictionaryPractice(!dictionaryPractice));
checkChordAnswer.addEventListener("click", () => {
  if (!dictionaryPractice || activeMode !== "dictionary") return;
  const correct = selected.size === dictionaryVoicing.length &&
    dictionaryVoicing.every(midi => selected.has(midi));
  trainingPrompt.textContent = correct
    ? "Correct! You remembered every note."
    : "Not quite. Press Show Notes to review the chord and try again.";
  if (correct) celebrate("Perfect chord! You got it!");
  else incorrect("Not quite — review the chord and try again.");
  checkChordAnswer.disabled = true;
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
const nextChallenge = document.getElementById("nextChallenge");
const chordQuestion = document.getElementById("chordQuestion");
const chordTitle = document.getElementById("chordTitle");
const degreeTitle = document.getElementById("degreeTitle");
function keyRange() {
  const count = visibleOctaves(piano.parentElement.clientWidth);
  return Array.from({length:count * 12}, (_,i) => i + 48);
}
function cancelChallenge() {
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
    trainingPrompt.textContent = "Select the correct piano key.";
    return;
  }
  if (activeMode === "find") {
    trainingPrompt.textContent = "Find the note: " + noteName(targetMidi);
  } else {
    trainingPrompt.textContent = "Memorize the highlighted key...";
    const key = piano.querySelector('[data-midi="' + targetMidi + '"]');
    if (key) key.classList.add("selected");
    challengeTimer = setTimeout(() => {
      const highlighted = piano.querySelector('[data-midi="' + targetMidi + '"]');
      if (highlighted) highlighted.classList.remove("selected");
      trainingPrompt.textContent = "Now press the key you just saw.";
      challengeTimer = null;
    }, 1800);
  }
}
function answerKey(midi) {
  if (targetMidi === null || challengeTimer !== null) return;
  const correct = activeMode === "degrees" ? midi % 12 === chordAnswer : activeMode === "find" ? midi % 12 === targetMidi % 12 : midi === targetMidi;
  const answer = activeMode === "degrees" ? NAMES[chordAnswer] : noteName(targetMidi);
  trainingPrompt.textContent = correct ? "Correct! Well done." : "Not quite. The answer was " + answer + ".";
  if (correct) celebrate("Great job! Correct note!");
  else incorrect("Not quite — the answer was " + answer + ".");
  targetMidi = null;
  chordAnswer = null;
  nextChallenge.hidden = false;
}
function activateMode(mode) {
  dismissAchievement();
  cancelChallenge();
  activeMode = mode;
  chordQuestion.hidden = mode !== "degrees";
  dictionaryPractice = false;
  document.getElementById("dictionaryControls").hidden = mode !== "dictionary";
  selected.clear();
  modeName.textContent = mode === "find" ? "Find the Note" : mode === "remember" ? "Remember the Key" : mode === "degrees" ? "Chord Degrees" : mode === "dictionary" ? "Chord Dictionary" : "Free Play";
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
  const whiteW = mobile ? Math.max(activeMode === "dictionary" ? 22 : 26, mobileWhiteWidth) :
    Math.max(1, (usable - (whiteCount - 1) * gap) / whiteCount);
  const keyboardWidth = whiteCount * whiteW + (whiteCount - 1) * gap + pad * 2;
  piano.style.width = mobile ? keyboardWidth + "px" : "100%";
  const whiteH = mobile ? Math.min(166, Math.max(125, whiteW * 4.6)) :
    Math.max(135, Math.min(320, whiteW * 6));
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
    if (activeMode === "dictionary" ? !dictionaryPractice && dictionaryVoicing.includes(midi) : displayedChord.includes(midi % 12)) button.classList.add("chordTone");
    const label = document.createElement("span");
    label.className = "noteLabel";
    label.textContent = NAMES[midi % 12];
    button.append(label);
    button.addEventListener("click", () => {
      // All modes share Free Play's green selected-key feedback.
      // Ignore answers while a memory target is being shown.
      if (activeMode === "dictionary") {
        if (!dictionaryPractice) return;
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
        selected.add(midi);
        piano.querySelectorAll(".key.selected").forEach(key => {
          key.classList.remove("selected");
          key.setAttribute("aria-pressed", "false");
        });
      }
      button.classList.toggle("selected", selected.has(midi));
      button.setAttribute("aria-pressed", String(selected.has(midi)));
      updateStatus(start, end - 1);
      if (activeMode !== "free") answerKey(midi);
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
nextChallenge.addEventListener("click", chooseChallenge);
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
