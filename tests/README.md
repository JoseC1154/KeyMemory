# KeyMemory regression checks

The app is a static site; no application build step is required.

Test dependencies: Node.js, jsdom, and Playwright. Install test dependencies locally with `npm install --no-save jsdom playwright`. For the browser suite, install Playwright's Chromium with `npx playwright install chromium` if no system Chromium is available. `CHROMIUM_PATH` can select another installed Chromium executable.

- `node --check app.js`
- `node tests/dom-regression.cjs`
- `node tests/builder-lessons.cjs`
- `node tests/layout-controls.cjs`
- `node tests/audio-sustain.cjs`
- `node tests/auto-audio.cjs`
- `node tests/midi-input.cjs`
- `node tests/phrase-engine.cjs`
- `node tests/phrase-integration.cjs`
- `node tests/browser-regression.cjs`

The DOM suite uses a deterministic clock to test immediate wrong→wrong→correct retries without Next, preserved prompts/targets/phases/deadlines, repeated red feedback, chord completion, timer toggles, timeouts, navigation, stale animation events, Free Play, and Dictionary exact inversions/partial-check retry/success lock. It advances a simulated clock, including a keyboard rerender during wrong-key feedback. It cannot verify rendered animation timing or touch layout.

The browser suite starts a temporary loopback server and tests desktop and mobile-touch Chromium viewports. It checks actual hold/fade opacity and saves screenshots in this directory. It does not publish anything.

The builder suite independently checks intervals and diatonic degrees for all 34 lesson types in all 12 roots (408 lessons), including 612 intermediate milestones. It tests theoretical spelling and piano-key equivalence, suspended-note replacement, exact-octave answers and highlights, all families in timed flow, every level and Mixed Practice, random-deck coverage, custom single/multiple/empty selections, Select all/Clear scope, preference reload and malformed storage, navigation/filter interruption, stale red feedback cleanup, and user-initiated 3/4/7-note chord audio. These DOM tests do not verify actual sound, animation pixels, or touch usability.

The layout-controls suite verifies unique IDs, all seven compact mode choices, context-specific settings, immediate-apply behavior, modal Done/Escape/backdrop dismissal, focus trapping/return and inert state, live timer mirrors, unchanged prompts/notes/deadlines when inspecting settings or hints, dictionary answer isolation, and navigation cleanup. It tests DOM behavior, not rendered geometry, native focus/inert implementation, or touch usability.

The audio-sustain suite uses a controllable fake AudioContext and clock to verify Chord Builder five-second gain sustain, release scheduling, repeated Hear cancellation, stale/rejected resume handling, navigation/manual-next cleanup, timed playback holds, and unchanged active-question deadlines. It also statically checks safe-area padding in the redesigned base/mobile/landscape cascade. These checks do not establish audible output, perceived loudness, actual device notches, or corner clipping.

The auto-audio suite checks untimed automatic success progression across answer modes, all 34 builder lessons without Next clicks, dictionary exact-set automatic completion and duplicate locking, same-chord practice restarts, contextual Hear notes/frequencies across all seven modes, empty selection, and success/timeout/audio-resume races. Timer changes and inspecting settings cannot cancel pending success. Like audio-sustain, this uses a fake AudioContext and deterministic clock rather than audible hardware output.

Duration regression expectations are independent of application constants: Chord Builder sustains every Hear selection for 5 seconds with a .35-second release; other modes sustain single notes for 1 second and groups for 2 seconds, with a .15-second release. Tests check envelopes/oscillator stops and progression waits (ordinary success minimum 1.8 seconds, non-builder group playback 2.3 seconds, builder playback 5.5 seconds).

The midi-input suite simulates Web MIDI permission responses and input ports. It checks explicit opt-in with SysEx disabled, no output access, YC Series Port 1 preference, note-on/off and velocity-zero on 16 channels, layered-note deduplication, held-key/question barriers, stale timestamps/callbacks/permission results, hotplug and selected-device reconnect, errors, all seven app modes, pitch-class versus exact-octave grading, timer fairness, modal/background gates, and MIDI audio-resume/release races. No connected hardware, browser MIDI permission UI, USB driver, or audible sound is verified by this simulated suite.

The phrase-integration suite exercises the app through simulated raw MIDI and UI controls: capture timing/duration/channel/velocity, source/playback BPM, transpose, seconds-to-milliseconds sections, playback callbacks, chords, notes-only and onset-rhythm practice, wrong-key feedback and release/count-in restart without deleting notes, recording confirmation/cancellation, MIDI connection requirements, mode/modal/blur/disconnect cleanup, the 120-second cap, and local reload/delete. It preserves regression coverage for all seven earlier modes and checks the eight-choice mode menu. No physical keyboard, audible playback, or touch-device verification is claimed.
