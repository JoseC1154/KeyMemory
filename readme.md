# KeyMemory

[Open the app](https://josec1154.github.io/KeyMemory/)

A static piano practice app. Open `index.html` using any static web server; no application build or account is required.

## Chord Builder

- **Level 1 — Triads:** major, minor, diminished, augmented.
- **Level 2 — Suspended, added and sixth chords:** sus2, sus4, major/minor add9, major/minor sixth, major 6/9.
- **Level 3 — Sevenths:** dominant, major, minor, minor-major, half-diminished, diminished, augmented dominant, augmented major.
- **Level 4 — Extensions:** dominant, major and minor ninths, elevenths and thirteenths.
- **Level 5 — Altered dominants:** dominant seventh with ♭5, ♯5, ♭9, ♯9, ♯11 or ♭13. These are six focused lessons, not every possible combination of alterations.
- **Mixed:** all levels. Augmented dominant seventh and dominant seventh ♯5 are equivalent sounds taught under two useful names/contexts.

Choose **Random** for a shuffled deck or **Choose chord types** for one or several families. Select all/Clear apply to the current level; other levels keep their choices. Level, selection mode and chosen types are remembered in browser-local storage when available. There is no server-side learner profile.

Lessons build exact ascending notes. Each question explains distance from the previous note and from the root; chord spelling also gives a piano-key equivalent when needed. Suspensions replace the third. Added and sixth chords do not require a seventh. Extensions build through a seventh foundation. Full eleventh/thirteenth learning stacks can be dense: performance voicings often omit notes. Inversions are not part of these five builder levels.

Use **Hear chord** at each milestone, then continue manually or enable the timer for automatic progression with four-second milestone pauses. Longer keyboards scroll sideways on small screens.

Wrong keys flash red and can be corrected immediately without restarting the question. Timed attempts keep their original deadline. Dictionary practice retains correctly chosen notes, rejects unrelated keys and lets you complete an incomplete selection before checking again. Free Play and dictionary exploration are not graded.

See [regression checks](tests/README.md) for test commands and coverage.

## Compact practice layout

All modes share one question/chord/progress panel above the piano. **Settings** contains timer, difficulty, builder level/type choices and dictionary chord options; changes apply immediately. Opening or dismissing a sheet does not reset the lesson or clock, and a running countdown stays visible in the sheet. **Hint** reveals longer theory/spelling details without permanently using practice space. The compact **Modes** menu shows all seven modes directly. Build information is inside Settings.

Sheets support Escape, backdrop dismissal, focus return and contained keyboard focus; the piano is inactive behind an open sheet. Narrow portrait and short-height landscape layouts retain horizontal piano scrolling.
