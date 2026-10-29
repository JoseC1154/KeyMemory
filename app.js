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
const noteName = midi => NAMES[midi % 12] + (Math.floor(midi / 12) - 1);

function visibleOctaves(width) {
  // Two octaves on phones, three on tablets, four on desktops.
  return width < 600 ? 2 : width < 1050 ? 3 : 4;
}
function updateStatus(start, end) {
  rangeText.textContent = noteName(start) + " – " + noteName(end);
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
      if (selected.has(midi)) selected.delete(midi);
      else selected.add(midi);
      button.classList.toggle("selected", selected.has(midi));
      button.setAttribute("aria-pressed", String(selected.has(midi)));
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
document.getElementById("clearNotes").addEventListener("click", () => {
  selected.clear();
  renderPiano();
});
const observer = new ResizeObserver(() => renderPiano());
observer.observe(piano);
renderPiano();
