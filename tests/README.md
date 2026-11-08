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


## Import feedback candidate

- `node tests/audio-import-feedback.cjs`: prominent status placement; choose-versus-analyze instructions; 18-second silent MOV; missing/unsupported-track and size-specific errors; read/decode/audio-resume timeout recovery; late callbacks; preview start/end/stop/focus interruption; no model call for silence; invalid decoded samples; saved-phrase preservation. Browser APIs and decoding are mocked.
- `tests/video-fixtures.cjs` also generates 18-second MOVs with AAC, PCM, absent audio, and a silent AAC track. `tests/video-import-browser.cjs` includes these and explicit original-preview UI checks. The browser suite is supplied but remains unexecuted for this candidate due to Chromium's socket startup restriction. The hosted browser's direct checks apply to live Build 48, not this unpublished candidate.

The video size suite now accepts a mocked 30 MB, 18-second MOV and the exact 100 MiB boundary, rejects 100 MiB + 1 byte before reading, preserves the audio-only 20 MiB limit, and rejects a 121-second large video before whole-file reading. The fixture generator also creates a real 18-second H.264/AAC MOV above 30 MiB for native-browser decode, preview and analysis checks.


## Simple import candidate (Build 2026.11.07.50)

- `node tests/audio-import-simple.cjs` checks the collapsed note/timestamp and section controls, the direct WAV/MOV path without opening either, replacement confirmation/cancellation, first-time import wording, full-clip and first-30-second scope, exact saved fractional timing, shared modal Tab boundaries, optional invalid edits, empty results, new-file and reopen resets. Browser APIs and decoding are simulated. It is included in `npm run test:audio`.
- `tests/audio-import-browser.cjs` checks that note times and section fields are not visible after analysis, takes a simple-result screenshot before opening the optional editor, and retains native editing, import, cancellation, local-only requests and viewport checks.
- `tests/video-import-browser.cjs` checks hidden timing controls after real media analysis and includes short landscape (844×390) in addition to desktop and narrow portrait.

Native browser execution was attempted for the transcription and import suites, including an escalated temporary-profile attempt. Chromium failed before assertions with `socket() failed: Operation not permitted`. These rendered layout, native accessibility interaction and codec checks remain unverified for the unpublished candidate; deterministic results do not substitute for them.


## Individual staff-note deletion (Build 2026.11.07.50 candidate)

- `npm run test:note-edit` runs the new engine and actual-app DOM suites. Engine coverage includes raw-index/revision validation, exact fractional/zero-duration events, unisons and channels, controllers/options preservation, bounded Undo order, final-note recovery, storage failures, replacement invalidation, recording guards, safe playback cancellation, and out-of-range-transpose refusal/retry.
- UI coverage includes explicit editing versus normal inspection, purple selection, native overlap choices (including geometrically overlapping chromatic/continuation heads), all visible notes plus selection beyond the display cap, stale cache/selection invalidation, native-control focus, keyboard navigation/deletion/Undo, normal touch implicit capture release versus cancelled capture/swipes, 44-pixel near-hit disambiguation, zero-note recovery, preserved loop settings and narrow-screen DOM paths. DOM geometry is simulated.
- `npm run test:note-edit-browser` supplies native Chromium desktop, 390/320-pixel portrait and short-landscape rendering, keyboard, touch tap, overlap choice, Delete/Undo, focus, control-size/overflow and screenshot checks. It is unexecuted because the Chromium launch restriction was established by the import browser attempts; no native/mobile pass is claimed.

Existing cursor, loop, staff/timeline, playback-sync, MIDI, audio, import and layout suites remain applicable. No candidate code is published by these tests.

## Falling piano duration bars (Build 2026.11.07.51 candidate)

- `npm run test:falling-notes` checks exact fractional vertical lengths, downward source-time motion, strike-line onsets, shared piano/black-key geometry, same-pitch channel lanes, zero-duration events, pedal-only tails, loop-section clipping, upcoming repetitions, bar/beat distinction, transpose, dense-window cap/priority, unchanged source data, anchored count-ins at half/normal/double speed, repeated loops, and mobile score/piano/scroll behavior using pure SVG and simulated app DOM/audio.
- `npm run test:falling-browser` supplies native desktop/portrait/landscape checks for key-center alignment and strike-line adjacency before/after scrolling, page overflow, playback motion, accessible mobile Window controls, and staff Delete/Undo. It requires Playwright and Chromium. The local browser launch remains blocked before assertions by `socket() failed: Operation not permitted`; native rendering, actual phone/Safari, physical MIDI and audible-device verification are not claimed.

No candidate source is uploaded, pushed or deployed by these tests.

## Manual scrubbing and edit-note audition

- `npm run test:audition` checks the dedicated preview synth and its actual-app integration. Native/fallback audio envelopes preserve attack/hold/release continuity on cancellation; async resumes cannot revive superseded previews; voices and summed gain are bounded; durations/offsets end within 600 ms. App tests cover forward/reverse traversal, exact chords, held-note gesture start, always-enabled sound, transpose, edit/Delete/Undo, immutable source/options, main playback exclusion, and sheet/mode/blur/transport cancellation.
- Existing pointer/keyboard staff inspection remains silent. Only manual Inspect-slider movement and explicit editor selection request audition. Fixtures use simulated audio contexts; these passes do not establish audible output, native mobile gestures or device latency.


## Phrase pause and resume

- `node tests/phrase-pause-engine.cjs` checks exact source-time pause at fractional positions across 0.5×/1×/2× tempo, current loop number, immediate resume without count-in, remaining physical/pedal sound, CC7/11/64 state, full subsequent loop boundaries, stale canceled callbacks, paused seek, explicit reset, one-shot completion, padded rests, minimum 50ms loops and Record/Practice/import/edit reset semantics.
- `node tests/phrase-pause-ui.cjs` checks both controls, staff/falling/key cursor agreement, Resume/Pause/Reset wording, paused inspection, Settings/mode return, example isolation, saved-data preservation and interrupted asynchronous audio startup. `phrase-transport-integration.cjs` additionally checks assigned MIDI Play/Stop pause/resume/reset.

These are deterministic clock/DOM/audio tests. Native Chromium, physical MIDI latency and audible output remain unverified in this environment.

## Optional tempo suggestions

- `npm run test:tempo` runs the pure onset estimator, import-review integration and recorded-phrase UI suites.
- `tests/tempo-estimate.cjs` covers regular/expressive timings, chords and layers, subdivisions/rests, half/double interpretation, short and irregular/drifting abstention, invalid input, dense bounded work and source immutability. It is synthetic correctness coverage, not an accuracy benchmark.
- `tests/tempo-import-ui.cjs` covers explicit suggestion acceptance, manual/tapped correction, invalid BPM, unchanged source times and normal-speed playback, no inferred meter, canceled replacement, edited/reset/new/closed draft lifecycle and short/irregular fallback. Decode/model/audio are mocked.
- `tests/tempo-phrase-ui.cjs` records synthetic MIDI and checks suggestion acceptance, exact note/controller preservation, speed ratio, compound pulse display/manual/tap correction, bounds rejection, meter/origin/grid state, saved reload, empty recordings, edit/undo invalidation and active/pending transport safety. Its combined runtime case also checks paused audible scrubbing, example isolation and clearing pause when accepting a tempo suggestion.
- `npm run test:tempo-browser` supplies optional native desktop/mobile geometry, input/focus and repeated/canceled review checks using a generated local WAV and deterministic transcription output. It does not publish or upload media.

Native Chromium launch was attempted with the default and an escalated temporary profile for this candidate; both failed before assertions with `socket() failed: Operation not permitted`. No native-rendering, actual-device, physical-MIDI, listening or arbitrary-music accuracy pass is claimed.


## Two-press Record and compact transport

- `npm run test:record-confirm` checks the first/second Record press, exact preservation of saved notes/controllers/options until a nonempty take finishes, canceled count-ins and empty takes, Keep phrase/Stop/Escape/navigation/background/disconnect cancellation, stale phrase revisions, keyboard repeats, pending/rejected audio, and MIDI note/CC release edges. Transpose controls are in Settings, and mapped MIDI transpose works with Settings closed.
- `npm run test:record-browser` supplies optional real-browser mouse/touch/keyboard and responsive-prompt checks at desktop, phone and landscape sizes. These tests use synthetic MIDI, not a physical instrument. Native Chromium launch remains blocked here by `socket() failed: Operation not permitted`; no rendered-layout, actual-device or listening pass is claimed.
## Import note smoothing

- `npm run test:smoothing` runs the pure smoother, synthetic frame-output probes and actual-app draft UI tests. Coverage includes strength/Off reversibility, confidence dropouts, direct doubtful onsets, clear and quiet repeats, energy-rise protection, staccato, chords, gaps, overlaps, boundaries, dense bounded work, immutable source data, preview scheduling/cancellation, manual-edit protection, restore focus, atomic/canceled import, evidence stripping and new/closed/stale drafts.
- `npm run test:audio-runtime` additionally verifies evidence-bearing output preserves original detection exactly; real Basic Pitch/WASM synthetic repeated/quiet notes, staccato and cross-window held chords survive maximum smoothing. The generated worker returns finite attack metadata, loads only local assets, and preserves cancellation/error/memory behavior.
- `npm run test:smoothing-browser` supplies native desktop, portrait and landscape range-keyboard/touch checks, geometry/screenshots, preview interruption, manual edit/reset focus, acceptance cancellation and repeated/Escape/Close lifecycle using a generated WAV and deterministic note output.

The native smoothing suite was attempted but Chromium failed before assertions with `socket() failed: Operation not permitted`. Browser rendering, actual-device gestures, physical MIDI, listening and accuracy on arbitrary recordings are not established by the passing deterministic/model tests. No user recording was used. All test media is generated locally.
## Always-enabled instrument sound

- `node tests/sound-toggle.cjs` retains its historical filename but now checks removal of the toggle, ignored old mute preferences, no load-time audio, all nine modes, pointer/MIDI voices, polyphony, Scale preview, unlock failure/retry, pending cancellation, recording and independent Click.
- Audition and transport suites cover always-enabled previews and Click changes without silencing instruments. These are simulated WebAudio checks, not audible-device verification.

## Phrase workspace cleanup

- `npm run test:phrase-cleanup` covers empty/populated/recording-example and final-note Undo visibility, speed beside transport with the score hidden, native nonmodal Timing & grid/Help, preserved warnings, responsive DOM states at 1280×900, 390×844, 320×740 and 844×390, and valid accessible descriptions/unique IDs.
- `npm run test:phrase-cleanup-browser` supplies keyboard disclosure, rendered empty/populated state, speed, example-return, uninterrupted playback, overflow and screenshot checks at those viewports. Existing meter/tempo/falling/legend browser checks open the new disclosure before using its controls.
- Native Chromium was attempted and failed before assertions with `socket() failed: Operation not permitted`. The hosted browser could not reach the local preview (`ERR_CONNECTION_REFUSED`). Candidate visual layout, actual touch devices, physical MIDI and audible sound are not verified by the deterministic checks.

The empty score/editor stays hidden until a phrase or active recording exists. Deleting the final note keeps the editing workspace available for Undo. Source tempo, meter, count-in and loop-grid setup live in Timing & grid, which does not stop transport. Longer score/inspection guidance, the color legend and the read-only example live in Help. Imported-note uncertainty and loop warnings remain outside Help. The speed dial remains accessible in piano-only view.
