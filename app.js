// FILE: app.js
"use strict";

// The design and key proportions are adapted from KeyTransposer.
// Unlike KeyTransposer, KeyMemory only renders a screen-fitting range.
const piano = document.getElementById("piano");
const rangeText = document.getElementById("rangeText");
const noteText = document.getElementById("noteText");
const selected = new Set();
const BLACK = new Set([1, 3, 6, 8, 10]);
const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const noteName = midi => NAMES[midi % 12]; // Hide octave numbers; keep MIDI pitch internally.
const CHORD_ROOTS = [0, 2, 4, 5, 7, 9, 11];
const CHORD_DEGREES = [1, 3, 5];
let chordAnswer = null;
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
  const count = visibleOctaves(piano.clientWidth);
  return Array.from({length:count * 12}, (_,i) => i + 48);
}
function cancelChallenge() {
  if (challengeTimer !== null) clearTimeout(challengeTimer);
  challengeTimer = null;
  targetMidi = null;
  chordAnswer = null;
}
function chooseChallenge() {
  cancelChallenge();
  if (activeMode === "free") return;
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
  targetMidi = null;
  chordAnswer = null;
  nextChallenge.hidden = false;
}
function activateMode(mode) {
  cancelChallenge();
  activeMode = mode;
  chordQuestion.hidden = mode !== "degrees";
  selected.clear();
  modeName.textContent = mode === "find" ? "Find the Note" : mode === "remember" ? "Remember the Key" : mode === "degrees" ? "Chord Degrees" : "Free Play";
  trainingPrompt.textContent = mode === "free" ? "Explore the keyboard, or choose a training mode." : "Ready?";
  nextChallenge.hidden = mode === "free";
  renderPiano();
  if (mode !== "free") chooseChallenge();
}


function visibleOctaves(width) {
  // Two octaves on phones, three on tablets, four on desktops.
  return width < 600 ? 2 : width < 1050 ? 3 : 4;
}
function updateStatus(start, end) {
  rangeText.textContent = visibleOctaves(piano.clientWidth) + " octaves";
  const notes = [...selected].sort((a,b) => a-b).map(noteName);
  noteText.textContent = notes.length ? "Selected: " + notes.join(", ") : "Tap a key to highlight it";
}
function renderPiano() {
  const width = piano.clientWidth;
  const mobile = matchMedia("(max-width: 600px)").matches;
  const pad = mobile ? 6 : 10;
  const octaves = visibleOctaves(width);
  const start = 48; // C3
  const end = start + octaves * 12; // exclusive: whole C-to-B octaves
  const whiteCount = octaves * 7;
  const gap = 2;
  const usable = Math.max(0, width - pad * 2);
  const whiteW = Math.max(1, (usable - (whiteCount - 1) * gap) / whiteCount);
  const whiteH = Math.max(135, Math.min(320, whiteW * 6));
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
    const label = document.createElement("span");
    label.className = "noteLabel";
    label.textContent = NAMES[midi % 12];
    button.append(label);
    button.addEventListener("click", () => {
      // All modes share Free Play's green selected-key feedback.
      // Ignore answers while a memory target is being shown.
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
document.getElementById("clearNotes").addEventListener("click", () => {
  selected.clear();
  renderPiano();
});
const observer = new ResizeObserver(() => renderPiano());
observer.observe(piano);
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
