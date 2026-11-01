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

Use **Hear chord** at each milestone for five seconds of sustained sound plus a short release. Repeated playback replaces the previous chord rather than accumulating voices. Correct answers advance automatically, whether the countdown timer is enabled or not: a short 1.8-second success pause and four-second builder milestone pauses. Optional milestone buttons can skip the pause; listening extends automatic progression until playback finishes. Active-question countdowns keep running. Longer keyboards scroll sideways on small screens.

Wrong keys flash red and can be corrected immediately without restarting the question. Timed attempts keep their original deadline. Dictionary practice retains correctly chosen notes, rejects unrelated keys and completes automatically as soon as the exact voicing is selected. After the success pause it starts another attempt on the same chosen reference chord; no Check Answer or Next click is needed. Free Play and dictionary exploration are not graded.

See [regression checks](tests/README.md) for test commands and coverage.

## Compact practice layout

All modes share one question/chord/progress panel above the piano. **Settings** contains timer, difficulty, builder level/type choices and dictionary chord options; changes apply immediately. Opening or dismissing a sheet does not reset the lesson or clock, and a running countdown stays visible in the sheet. **Hint** reveals longer theory/spelling details without permanently using practice space. The compact **Modes** menu shows all seven modes directly. Build information is inside Settings.

Sheets support Escape, backdrop dismissal, focus return and contained keyboard focus; the piano is inactive behind an open sheet. Narrow portrait and short-height landscape layouts retain horizontal piano scrolling.

## Hear in every mode

One contextual button plays sound without adding visual answer highlights. Chord Builder sustains for five seconds; other modes play individual notes for about one second or chords/groups for about two seconds, each with a short release:

| Mode | Before answering | After success |
| --- | --- | --- |
| Free Play | Selected notes (disabled when empty) | No automatic progression |
| Find the Note | Target note as an audio hint | Correct note |
| Remember the Key | Demonstrated target note as an audio hint | Correct note |
| Semitones | Starting note, labeled **Hear start note** | Correct answer note |
| Chord Degrees | Reference chord | Correct chord-tone note |
| Chord Builder | Notes built so far | Completed notes/chord |
| Chord Dictionary | Reference chord in exploration; only selected notes in practice | Selected complete chord |

Repeated Hear replaces previous playback. Pending automatic advancement waits for playback (including an asynchronously resuming audio context); changing modes or intentionally advancing cancels it smoothly. Wrong notes never advance. Free Play and dictionary exploration remain manual.
