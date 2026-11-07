# KeyMemory regression checks

The app is a static site; no application build step is required.

Test dependencies: Node.js, jsdom, and Playwright. Install test dependencies locally with `npm install --no-save jsdom playwright`. For the browser suite, install Playwright's Chromium with `npx playwright install chromium` if no system Chromium is available. `CHROMIUM_PATH` can select another installed Chromium executable.

- `node --check app.js`
- `node tests/dom-regression.cjs`
- `node tests/builder-lessons.cjs`
- `node tests/layout-controls.cjs`
- `node tests/audio-sustain.cjs`
- `node tests/audio-pops.cjs`
- `node tests/auto-audio.cjs`
- `node tests/midi-input.cjs`
- `node tests/phrase-engine.cjs`
- `node tests/phrase-integration.cjs`
- `node tests/phrase-audio.cjs`
- `node tests/phrase-keyboard.cjs`
- `node tests/browser-regression.cjs`

The DOM suite uses a deterministic clock to test immediate wrong→wrong→correct retries without Next, preserved prompts/targets/phases/deadlines, repeated red feedback, chord completion, timer toggles, timeouts, navigation, stale animation events, Free Play, and Dictionary exact inversions/partial-check retry/success lock. It advances a simulated clock, including a keyboard rerender during wrong-key feedback. It cannot verify rendered animation timing or touch layout.

The browser suite starts a temporary loopback server and tests desktop and mobile-touch Chromium viewports. It checks actual hold/fade opacity and saves screenshots in this directory. It does not publish anything.

The builder suite independently checks intervals and diatonic degrees for all 34 lesson types in all 12 roots (408 lessons), including 612 intermediate milestones. It tests theoretical spelling and piano-key equivalence, suspended-note replacement, exact-octave answers and highlights, all families in timed flow, every level and Mixed Practice, random-deck coverage, custom single/multiple/empty selections, Select all/Clear scope, preference reload and malformed storage, navigation/filter interruption, stale red feedback cleanup, and user-initiated 3/4/7-note chord audio. These DOM tests do not verify actual sound, animation pixels, or touch usability.

The layout-controls suite verifies unique IDs, all seven compact mode choices, context-specific settings, immediate-apply behavior, modal Done/Escape/backdrop dismissal, focus trapping/return and inert state, live timer mirrors, unchanged prompts/notes/deadlines when inspecting settings or hints, dictionary answer isolation, and navigation cleanup. It tests DOM behavior, not rendered geometry, native focus/inert implementation, or touch usability.

The audio-sustain suite uses a controllable fake AudioContext and clock to verify Chord Builder five-second gain sustain, release scheduling, repeated Hear cancellation, stale/rejected resume handling, navigation/manual-next cleanup, timed playback holds, and unchanged active-question deadlines. It also statically checks safe-area padding in the redesigned base/mobile/landscape cascade. These checks do not establish audible output, perceived loudness, actual device notches, or corner clipping.

The audio-pops suite evaluates the scheduled gain ramps instead of only recording API calls. It checks 3,584 releases across all 128 MIDI pitches and attack/decay/tail/stop boundaries, with native cancel-and-hold and a reconstructed-ramp fallback. It verifies continuous gain on key-up, silence before natural or early oscillator stops, same-note reattacks, polyphonic resets, stale cleanup, canceled audio resumes, and the shared MIDI route in all eight non-Phrase modes. Ordinary taps retain their 15 ms attack, 700 ms exponential decay and 750 ms stop, with a final fade to zero. These are deterministic envelope tests; browser-rendered audio, listening on the user's device and physical MIDI remain unverified.

The auto-audio suite checks untimed automatic success progression across answer modes, all 34 builder lessons without Next clicks, dictionary exact-set automatic completion and duplicate locking, same-chord practice restarts, contextual Hear notes/frequencies across all seven modes, empty selection, and success/timeout/audio-resume races. Timer changes and inspecting settings cannot cancel pending success. Like audio-sustain, this uses a fake AudioContext and deterministic clock rather than audible hardware output.

Duration regression expectations are independent of application constants: Chord Builder sustains every Hear selection for 5 seconds with a .35-second release; other modes sustain single notes for 1 second and groups for 2 seconds, with a .15-second release. Tests check envelopes/oscillator stops and progression waits (ordinary success minimum 1.8 seconds, non-builder group playback 2.3 seconds, builder playback 5.5 seconds).

The midi-input suite simulates Web MIDI permission responses and input ports. It checks explicit opt-in with SysEx disabled, no output access, YC Series Port 1 preference, note-on/off and velocity-zero on 16 channels, layered-note deduplication, held-key/question barriers, stale timestamps/callbacks/permission results, hotplug and selected-device reconnect, errors, all seven app modes, pitch-class versus exact-octave grading, timer fairness, modal/background gates, and MIDI audio-resume/release races. No connected hardware, browser MIDI permission UI, USB driver, or audible sound is verified by this simulated suite.

The phrase-integration suite exercises the app through simulated raw MIDI and UI controls: capture timing/duration/channel/velocity, source/playback BPM, transpose, seconds-to-milliseconds sections, playback callbacks, chords, notes-only and onset-rhythm practice, wrong-key feedback and release/count-in restart without deleting notes, recording confirmation/cancellation, MIDI connection requirements, mode/modal/blur/disconnect cleanup, the 120-second cap, and local reload/delete. It preserves regression coverage for all seven earlier modes and checks the eight-choice mode menu. No physical keyboard, audible playback, or touch-device verification is claimed.

The phrase-audio suite uses fake WebAudio and MIDI to check velocity-sensitive live note sustain until release, per-channel polyphony, unchanged tap envelopes in the seven earlier modes, lifecycle/deferred-resume cancellation, audible-click scheduling for ascending, meter-aware Record/Play count-ins, exclusion of metronome/count-in notes from recording, shared-clock lookahead, and recorded-duration playback. Phrase integration explicitly advances count-ins and checks the full 120-second recording window starts afterward. This validates scheduling, not actual perceived sound, device latency, or physical pedal behavior.

Controller regressions cover only CC64 (raw values retained; threshold 64, not a half-pedal model), CC7 and CC11. Simulated MIDI verifies other controller numbers are ignored. Phrase integration checks v2 controller capture, initial channel state, physical-key versus pedal-audible durations, transposition/tempo/section reconstruction, and old v1 loading. Fake WebAudio checks pedal-latched reattacks, channel isolation, velocity × volume × expression, pedal-up releasing only released keys, default reset on disconnect, controller automation on the shared playback clock, metronome bypass, and Stop cleanup. Physical pedal/audio validation remains separate.

The phrase-keyboard suite simulates available widths at desktop1180/1280/1440 and narrow400/843 viewports. It checks the A0–C8 baseline (88 keys;52 white/36 black), partial-octave black-key anchors, fit versus intended horizontal scrolling, compact visual labels and exact octave/MIDI accessibility labels, 0–127-safe live/loaded/transposed expansion, reset behavior, preserved scroll position across timer rerenders, and earlier-mode ranges. These are DOM/math assertions, not actual browser layout, touch, or physical-keyboard validation.

- `node tests/phrase-view.cjs`
- `node tests/phrase-view-integration.cjs`

The pure view suite checks sharp/flat spelling, diatonic staff coordinates and ledger notes, exact fractional timing, channel-specific pedal tails, unchanged source data, transposition, and bounded dense-window rendering. The view integration suite uses synthetic stored phrases and MIDI with deterministic time to check read-only controls, tempo/section cursor mapping, held-key versus pedal-tail highlights, live recording projection, local preferences, responsive Score/Piano switching, and unchanged transport. These tests are not physical MIDI or audible/engraved-notation verification.

- `node tests/scale-builder.cjs`

The Scale Builder suite independently checks all 12 interval/degree formulas in all 12 roots (144 four-run sequences (576 races) and 4,320 immediate degree answers), tonic-first completion, exact octaves, ten-second race/three-second degree boundaries, four explicit pre-run modal gates with no consumed time, focus/inert/Escape/backdrop/cancel cleanup, 2.5-second level-up pauses and 300ms correct-green feedback followed by a fresh deadline, and stalled timer delivery, wrong/timeout four-run resets preserving mastered keys, review-after-all-keys reset, 30/30 status, next-key/all-key mastery and persistence. It also checks cancelled callbacks, settings and mode interruptions, ignored preview input, and simulated MIDI held-note/legato behavior. These deterministic DOM/MIDI tests do not establish physical YC61 latency, browser rendering, or audible sound.

- `node tests/phrase-loop.cjs`
- `node tests/phrase-timing-controls.cjs`
- `node tests/phrase-timing-browser.cjs`

The loop suite checks exact absolute onset scheduling over multiple passes, one count-in, leading/trailing rests, fractional durations, section/tempo/transpose/pedal behavior, controller ordering and per-pass baselines, long timer stalls, generation cancellation, wrapped cursor snapshots, and the 50 ms loop minimum. The timing-controls suite checks the compact always-visible speed dial, mouse/touch/keyboard adjustment and reset, bounds, invalid advanced settings, persistence, untouched source data, duration scaling, zoom/tolerance independence, pointer/keyboard silent note inspection, held-versus-pedal highlights, loop toggle/count-in/pending-audio cancellation and lifecycle cleanup. The staff timeline suite also checks earlier still-sounding continuation marks.

The new browser suite targets desktop, touch portrait and landscape layout, real SVG point mapping, keyboard/focus, controls and repeated playback. In the November 6 cloud validation, Chromium launch was blocked by the environment (`socket() failed: Operation not permitted`) both normally and after escalation, so this suite was authored but not verified there. Physical MIDI, audible seamlessness/device latency and Safari/iOS behavior are not covered by deterministic tests. The existing `phrase-keyboard.cjs` first-black-key geometry assertion also fails on the unchanged main commit 7dab516 in that environment; it is not a newly introduced failure.


`node tests/phrase-transpose-controls.cjs` checks the added MIDI transpose actions through synthetic input: exact channels, held-note edge triggering, CC assignment, conflict retention, disabled/remove/mode cleanup, extreme pitches and transpose bounds. It verifies matching full-key colors, split colors and channel labels for overlapping pitches, coexistence with silent inspection, practice-card collapse without losing transport or changing timers, saved visibility, and staff/roll DOM order. This is DOM/math coverage, not physical MIDI or visual QA. The updated real-browser timing suite additionally checks speed-dial interaction, collapse, vertical staff/roll geometry and mapped-key body colors at desktop, portrait and landscape sizes.
- `node tests/wrong-key-feedback.cjs`
- `node tests/wrong-key-browser.cjs`

The shared wrong-key suite checks all graded modes, including both Scale Builder piano stages and Phrase practice, through screen clicks and simulated raw MIDI. It verifies the same 950 ms feedback lifetime, rerender continuity, repeated mistakes, immediate cleanup, ignored ungraded input and off-screen MIDI safety. Scale Builder's correct answer, progress and Continue gate persist after the wrong key fades. The Chromium suite checks the computed red color and hold/fade/clear animation opacity through mouse, native Enter, synthetic MIDI and mobile touch. Physical MIDI latency and audio require separate device validation.

The same November 6 cloud Chromium launch restriction described above prevented execution of `wrong-key-browser.cjs`; its browser matrix is authored but not verified in that environment. The deterministic shared-feedback test passed, and the pre-existing `phrase-keyboard.cjs` geometry failure was reproduced again on unchanged c15e315.

## Audio import

Use `npm ci` for the pinned runtime and jsdom dependencies. `npm run build:audio` regenerates self-hosted assets; ordinary static serving does not need this build.

- `node tests/audio-import-utils.cjs`: pure clip/source limits, stereo downmix, resampling API contract, fractional note mapping and invalid proposals. OfflineAudioContext is mocked.
- `node tests/audio-import-ui.cjs`: actual app DOM integration with mocked decode/inference/audio. Review edits, add/remove/restore/pagination, atomic acceptance/confirmation, errors, file-picker blur, cancellations and stale async completions.
- `node tests/audio-import-preview-audio.cjs`: actual import UI with an automation evaluator; original/note preview cancellation preserves gain during attack/sustain/release, reaches zero before natural source endings and handles native-hold/fallback paths. No listening claim.
- `node tests/phrase-import-engine.cjs`: atomic import, strict limits, transport cleanup, controller/option resets, persisted provenance, old storage, fractional timing and saving failures.
- `npm run test:audio-runtime`: real Basic Pitch on pinned WASM, synthetic melody/chords/sustain/silence, maximum clip, upstream output parity, SIMD/non-SIMD, memory cleanup, repeat/cancel/failure and generated worker bundle VM. Synthetic success is not an accuracy benchmark.
- `node tests/audio-transcription-browser.cjs`: optional real Chromium worker, subdirectory hosting, same-origin GET-only loading, cancellation/retry, and no cross-origin isolation.
- `node tests/audio-import-browser.cjs`: optional real Chromium file decoder→resampler→worker→review→saved phrase integration, desktop/mobile viewports, local-only requests, edit and cancel. Install Playwright separately if unavailable and set `CHROMIUM_PATH` when appropriate.

Browser test sources are supplied, but a local Chromium launch failed with `socket() failed: Operation not permitted`, including a temporary-profile escalation attempt. No native-browser, actual-phone, physical-MIDI or listening pass is claimed for audio import. None of these tests publish or transmit user audio.
## MIDI action colors and physical key feedback

- `node tests/midi-key-colors.cjs` checks all seven matching action/control/full-key fills; no floating shortcut badges; seven-way channel overlaps and accessible names; CC and same-input conflict behavior; notes 0/127; range expansion; mapped Continue in Scale; physical press/release/duplicate/layered-channel/velocity-zero input; stable key elements through refreshes; reserved-input isolation; inspection coexistence; and remove/disable/blur/disconnect cleanup.
- `node tests/midi-key-colors-browser.cjs` checks actual computed key/control colors, black and white key transforms and shadows, split fills during inspection/grading, reduced motion, and legend layout at 1280×900, 390×844, 320×740 and 844×390.

Physical feedback is observed before transport consumes reserved notes and remains independent of grading/selection. Reused key nodes preserve CSS transitions. `wrong-key-feedback.cjs` checks that their running wrong-answer animation does not double-count elapsed time, while newly visible keys still resume with a negative delay.

Local Chromium launch remains blocked by `socket() failed: Operation not permitted`. Separate hosted Chromium validation of the exact Build 2026.11.06.44 assets passed the mapped-key suite at all four viewport sizes: computed whole-key/control colors, black/white press and release transforms and shadows, stable nodes, channel splits, inspection/grading overlap, reduced motion, and responsive legend geometry. The desktop screenshot was also inspected. These tests use synthetic MIDI; physical keyboard latency, actual phone/Safari behavior and audible output remain unverified. Final integrated regressions, including `phrase-keyboard.cjs`, pass with the audio-import lockfile’s pinned dependencies; the earlier geometry assertion failure occurred with the older test dependency environment.

- `node tests/phrase-playback-sync.cjs`

The playback-sync suite ties queued absolute audio onsets to the interpolated source cursor and staff/piano active-note state at half, normal and double tempo, including fractional note onsets, nonzero sections, pedal-only tails and repeated loops. It uses deterministic DOM/audio mocks and does not establish physical audio latency or rendered notehead geometry.

## Compact phrase timing and loop controls (Build 2026.11.06.45)

- `node tests/phrase-cursor-controls.cjs`: exact fractional source-time selection on every SVG child, affine/letterbox mapping, stable windows, mouse/pen drag and touch scrolling, keyboard precision, pedal/held boundaries and silent inspection.
- `node tests/phrase-loop-controls.cjs`: accessible marker and numeric limits, minimum playback range, drag preview/commit/cancel lifecycle, section/controller scheduling, persistence, main/Settings deletion, and empty/nonempty transpose behavior.
- `node tests/phrase-forgiveness-engine.cjs`: correct/wrong pitch and inclusive early/late boundaries across tolerances and tempo, notes-only chord grace, count-in and delayed-dispatch limitations.
- `node tests/phrase-forgiveness-ui.cjs`: native range/rhythm controls, saved settings and legacy arbitrary tolerances, preview labels during playback, cancellation and disabled-state guards.
- `node tests/stale-key-visuals.cjs`: final-layer physical MIDI release refreshes Phrase keys while Settings, Hint or Modes is open, including recording/practice, velocity-zero release, layers, pedal and preserved deliberate inspection/lesson selections.

Existing `phrase-timing-controls.cjs`, `phrase-staff-timeline.cjs` and `phrase-playback-sync.cjs` cover the inline dial, exact onset-aligned noteheads with separately offset labels, and audio/cursor/key clock agreement. The preserved `phrase-timing-browser.cjs` suite requires permitted Playwright/Chromium. Build 45's public deployment was validated separately in hosted Chromium at 1280×900, 390×844, 320×740 and 844×390. The checks passed inline dial keyboard/mouse/touch reset, exact repeated pointer mapping, silent inspection, native forgiveness keyboard steps, loop fields/marker editing, repeated playback and cancellation, confirmed deletion/transpose reset, and synthetic MIDI release behind Settings. Explicit touch drag/commit/cancel and keyboard focus across window edges also passed at 390 and 320 pixels; a mobile screenshot was inspected. Pointer checks compare against actual integer browser coordinates rather than assuming subpixel touch delivery. Physical MIDI/audio latency, audible output and actual phone/Safari behavior remain unverified.


## Meter-aware grid candidate (Build 2026.11.06.46)

- `node tests/phrase-meter-engine.cjs`: meter units, 3/4 and compound 6/8/9/8/12/8, pickups, bounded reference ticks and snaps, Off/1/2-bar count-ins in all transports, preroll beat phase, explicit accents, repeat boundaries, stalled clocks, tail-rest padding and near-120-second padding recalculation, source-tempo ratio guards, v1/v2/v3 migration, repaired metadata, untouched source events, recording cap, exact-onset grading and click toggles.
- `node tests/phrase-meter-controls.cjs`: pulse tempo labels/conversion and tapping, tempo-ratio rejection, legacy reference hints, snap editing without moving existing bounds, free precision, bar alignment, grid layers, silent padded inspection, settings edits, controls with score hidden, pedal tails ending at the recorded duration and exact notehead positions.
- `node tests/phrase-meter-invariants.cjs`: an independent source-coordinate oracle checks 72 meter/tempo/section/count-in combinations over three loop passes, including fractional origins, quarter/dotted-quarter pulses, accents, cancellation and raw-note immutability.

Existing phrase regressions use the new one-bar default rather than the former three-click recording/playback preroll. Tests retain original note/controller fixtures and independently expected source timing. Existing v1/v2 fixtures continue to exercise migration.

These checks use simulated clocks, MIDI, DOM and audio. Local Chromium was attempted for the existing browser suites but blocked before assertions by `socket() failed: Operation not permitted`. No rendered-layout, native pointer/keyboard, audible seamlessness, physical MIDI or Safari/mobile-device pass is claimed for this candidate. No candidate source was uploaded or published for testing.

`node tests/phrase-meter-browser.cjs` adds native checks for pulse-unit editing, controls with the score hidden, snapped keyboard/numeric boundaries, padded inspection, count-in-off transport and narrow-screen control bounds at 1280×900, 390×844, 320×740 and 844×390. It was also attempted and blocked at Chromium launch before any assertions.

## Local video import

- `npm run test:video` checks actual app integration using simulated video metadata/decode: MP4/MOV/WebM, MIME/extension fallback, no autoplay or media persistence, unchanged size/duration/clip limits, review and accept, unsupported/no-audio errors, Blob URL cleanup, cancel/close and late decoder results.
- `npm run test:video-browser` requires Playwright, Chromium and FFmpeg (AAC, H.264, Opus and VP9 encoders). It generates deterministic tones with a solid-color picture using `tests/video-fixtures.cjs`, then tests real MP4/AAC, MOV/AAC and WebM/Opus decoding, real WebM→resample→worker→review→accept, missing audio/corrupt containers, cancellation, same-origin GET-only requests and 1280/390/320-pixel layout. `VIDEO_FIXTURE_DIR` may point to an existing generated set; `FFMPEG_PATH` and `CHROMIUM_PATH` override executables. No user recordings or downloaded videos are used.

Native Chromium remains blocked here by `socket() failed: Operation not permitted`, so browser codec and rendered-layout checks are authored but not passed in this environment. Simulated tests cannot establish codec support; MOV and other formats depend on each browser. Physical-device, listening and transcription-accuracy validation remain separate.


## Distinct live MIDI keys (Build 2026.11.07.48)

- `node tests/phrase-live-midi.cjs`: black/white/extreme pitches; musical versus reserved channels; layered/duplicate/velocity-zero input; pedal release; target/playback/live/inspection and example states; red lifetime; stable nodes; accessible labels, marker, legend and contrast; score visibility; blur/hidden/disconnect/mapping/mode cleanup; unchanged saved notes.
- `node tests/phrase-live-midi-browser.cjs`: computed live fills and text; diamond bounds; two-color reference overlap; full-key red overlay; channel-specific shortcut overlap; reduced motion and legend at desktop, portrait and landscape widths.

`stale-key-visuals.cjs` checks the separate live state behind Settings/Hint/Modes. `wrong-key-browser.cjs` expects held Phrase MIDI notes to remain pink after red fades. `phrase-timing-controls.cjs` verifies explicit inspected-time pedal wording.

The native MIDI browser suite was attempted locally but Chromium failed before assertions with `socket() failed: Operation not permitted`. Local deterministic success is not a native-browser or physical-MIDI pass.
