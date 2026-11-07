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

All modes share one question/chord/progress panel above the piano. **Settings** contains timer, difficulty, builder level/type choices and MIDI controls; changes apply immediately. Opening or dismissing a sheet does not reset the lesson or clock, and a running countdown stays visible in the sheet. **Hint** reveals longer theory/spelling details without permanently using practice space. The compact **Modes** menu shows all seven modes directly. Build information is inside Settings.

Sheets support Escape, backdrop dismissal, focus return and contained keyboard focus; the piano is inactive behind an open sheet. Narrow portrait and short-height landscape layouts retain horizontal piano scrolling.

## Hear in every mode

One contextual speaker-icon button plays sound without adding visual answer highlights. Chord Builder sustains for five seconds; other modes play individual notes for about one second or chords/groups for about two seconds, each with a short release:

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

## External MIDI keyboard (Build 2026.11.01.10)

On HTTPS in a current Chrome or Edge browser, open **Settings → Connect MIDI** and decide whether to grant the browser’s MIDI permission. Nothing is requested on page load. Connect your YC61’s USB TO HOST port to the Mac, then select its input; **YC Series Port 1** is preferred when available. No driver installation or device configuration is performed by this app. Consult [Yamaha’s connection guide](https://yamahasynth.com/learn/yc-series/mastering-yc-connecting-the-yc-series-to-a-computer-or-ios-device/) if the operating system does not detect the keyboard.

Exercise input uses note-on/note-off on any channel. Phrase Trainer also captures CC64, CC7 and CC11. KeyMemory requests no sysex and sends no MIDI output. Clock and unsupported controllers are ignored; Phrase Trainer supports sustain pedal, channel volume and expression. The keyboard’s own local sound may coexist with the app’s short key sounds; the app changes no keyboard settings. Contextual **Hear** durations are unchanged (Builder five seconds; other modes one-second notes/two-second groups).

External notes use the same questions, immediate red retries and automatic progression as screen keys. Find/Semitones/Degrees match pitch class as before; Remember/Builder/Dictionary practice require the exact displayed octave. The screen begins at MIDI48 (C below middle C), and middle C is MIDI60; octave names on hardware may differ. Notes outside the visible keyboard still grade correctly, but have no on-screen key to flash. Dictionary exploration plays notes without grading. Free Play adds selected notes for Hear; release stops the short voice but does not erase that selection—use Clear or screen keys to edit it.

Release held keys before the next question. Duplicate held note-ons (including layered channels) cannot repeatedly answer. New questions/modes quarantine held notes until released. Sheets/background tabs do not accept answers; releases still clear held state. Disconnect removes device handlers and short voices; reconnecting is explicit after Disconnect, while an unplugged selected input automatically resumes when it returns. The app never silently switches to another keyboard when the selected input disappears. If a keyboard loses note-off messages, Disconnect/Connect safely clears held state.

MIDI regression tests simulate permission, ports, messages and all modes. Physical YC61/Mac hardware, driver behavior and audible output require device verification and are not established by automated tests.

## Inline Dictionary choices (Build 2026.11.01.11)

Chord Dictionary shows **Root note**, **Chord quality** and **Inversion** directly above its prompt and piano. No Settings visit is needed. Changing a chord returns to its reference view; choose Hide Notes & Practice for a fresh attempt. Timer and MIDI controls remain in Settings. The same three controls/listeners are reused, not duplicated, and other modes are unchanged.

## Phrase Trainer (Build 2026.11.01.12)

**Record · Transpose · Repeat** is the eighth mode. Connect MIDI in Settings, close the sheet, and choose Record. A visible counter runs to **2:00**, then recording stops automatically; Stop finishes sooner. Each MIDI note retains its onset, duration, velocity and channel, including overlapping chord notes. MIDI receive timestamps reduce dispatch-latency distortion. This records MIDI performance data, **not the YC61’s audio**. Sustain pedal (CC64), volume (CC7) and expression (CC11) are recorded alongside notes. The safety limit is 10,000 note events.

One phrase and its settings are saved locally in this browser when storage is available; no performance data is sent to GitHub or another server. A new recording asks before replacing it, an empty recording keeps the old phrase, and Delete saved phrase requires confirmation. Storage failures leave the phrase available for the current session. Clearing browser data removes the saved phrase.

- **Play phrase** uses the app synth with the recorded timing, note lengths and velocity. Stop, a new playback, navigation, opening a sheet, losing focus or disconnecting MIDI cancels sound safely. Such interruptions also finish an active recording rather than leaving notes stuck.
- **− / +** transpose by semitone, up to ±48 while every note remains in MIDI range 0–127. There is no octave folding.
- The **Source tempo / Tap tempo** controls specify the original musical pulse and preserve the current playback-speed ratio. **Speed** changes playback/practice speed. Advanced Settings show canonical quarter-note BPM. Tempo is not inferred automatically.
- **Practice** starts with the selected bar count-in (one bar by default). Notes only is the default. Recorded onsets within 80 ms form a chord group; all its notes must be played together within a forgiving chord window. Exact pitches/octaves matter. Notes + rhythm additionally checks onset timing, with an adjustable 80–1000 ms tolerance; note-release duration is reproduced in playback but is not graded.
- A wrong pitch, incomplete chord or rhythm miss restarts the **current full phrase or chosen section from its beginning**, after all keys are released and another count-in. The recording is not erased. Completed phrases remain available to practice again or transpose.
- Section start/end are seconds in the original recording. Notes crossing a boundary are clipped to the section. Full phrase restores the whole recording. Leading rests remain part of rhythm practice; the prompt shows when the next note/chord is due.

MIDI is the primary recording input. Screen keys can answer practice notes but do not record simulated note durations. General countdown challenges do not control Phrase Trainer. Its extra settings stay in Settings, while Record/Play/Practice/Stop/Transpose, the current target, progress and piano stay on the practice screen.

Engine and integration tests use synthetic MIDI and deterministic clocks. They do not establish actual YC61 hardware latency, driver behavior, physical touch usability or audible fidelity.

### Phrase timing and held-key monitoring (Build 2026.11.02.14)

Record, Play and Practice use the same meter-aware **Off / 1 bar / 2 bars** count-in. The pulse click continues throughout recording and playback, including rests. The two-minute recording allowance begins **after** the count-in. Play only when the recording prompt appears; notes started before that boundary are not recorded. For a section beginning between beats, the preroll preserves that metrical phase rather than inserting an extra downbeat.

Phrase Trainer's live monitoring now holds each note's sound until its MIDI note-off, with velocity-sensitive gain and independent channel/note releases. Other modes retain their short key-tap sound. Previously the monitor faded in about 0.7 seconds even while a key was held; that was separate from the stored MIDI duration and the Phrase playback envelope. The controller support described below additionally preserves pedal, expression and volume.

Playback and clicks use an anchored, short-lookahead Web Audio schedule rather than starting every sound at JavaScript callback arrival. Recorded timestamps, overlapping notes and durations are not quantized. Playback retains the full selected interval, including trailing rests. Stop, navigation, losing focus or MIDI disconnection cancels count-in, queued clicks and voices; an interrupted recording is finalized safely. A canceled or failed audio startup does not overwrite the saved phrase.

The app's synth is not the YC61 sound engine: patches, effects and keyboard audio are not reproduced. Actual hardware latency and audible output still require verification with the connected instrument.

### Sustain, volume and expression

Phrase Trainer captures raw **CC64, CC7 and CC11** values, channels and timestamps. The app retains all CC64 values but interprets pedal values 0–63 as off and 64–127 as on; it does not model true half-pedal acoustics. Key-held durations remain unchanged in the saved notes and practice grading. Playback and live monitoring hold released notes while the pedal is down, including repeated strikes of the same pitch and channel-specific pedals. Pedal-up releases only notes whose keys are already up.

Volume and expression scale velocity-sensitive audio per channel and affect notes already sounding. The app starts with volume 100, expression 127 and pedal 0 until it observes changes; it does not query or change the keyboard’s settings. Controller movements during count-in establish the recording’s initial state. A selected section reconstructs controller state and pedal-held notes from before its start. Tempo changes scale note and controller timestamps together. Metronome clicks are independent of channel volume/expression and are not recorded.

Old saved phrases still load with default controller state. New saved phrases use a validated versioned format, with at most 20,000 controller changes per recording (repeated unchanged values are omitted) in addition to 10,000 notes. Stop cancels voices; losing the device/focus resets observed controller state safely. For reliable setup after reconnecting, release the pedal and move volume/expression to the values you want before recording. No performance data is uploaded.

Pitch bend, modulation, aftertouch, program/bank selection, other pedals, 14-bit controller extensions and MIDI clock remain unsupported. The app synth does not reproduce the YC61’s patches/effects or record its audio.

## Full desktop piano in Phrase Trainer (Build 2026.11.02.15)

Phrase Trainer shows the complete **88-key A0–C8 piano** across the available desktop width. Compact white-key labels and C-octave markers keep it readable; narrow black keys retain their exact note/octave in accessible labels and hover text. On smaller screens the same keyboard scrolls sideways with usable key widths. Other modes keep their existing compact ranges.

MIDI remains supported across 0–127: saved/transposed or newly played Phrase notes outside the standard piano range extend the display instead of being rejected. The range stays stable during live input; deleting the saved phrase resets this extra displayed range. Rendering updates preserve horizontal scroll position rather than recentering the piano.

## Phrase Live Score and exact timing (Build 16)

Phrase Trainer includes a **pitch-reading grand staff**, not an engraved rhythmic transcription. It shows exact MIDI pitches after transposition, with explicit sharp/flat spelling preference and optional note names. Treble/bass is a display split, **not a left/right-hand assignment**. C4 is middle C; ledger notes and out-of-piano MIDI pitches remain accessible. Accidentals are explicit per displayed pitch; no key signature, time signature, note values, voices or hand assignments are inferred.

The adjacent **exact-time piano roll** uses unquantized source milliseconds: solid bars show physical key-on/key-off durations, dashed tails show CC64 pedal sustain. Channel, onset, release and audible end are available in each bar's description; current controller values are shown below. The cursor follows playback at the selected BPM, while the horizontal labels include musical reference positions and original/source seconds. Original recording data is unchanged by display/transposition. The continuous staff follows source time in playback and rhythm practice, or the current target in notes-only practice; it does not pretend to transcribe rhythmic notation.

Use **Inspect** to examine a saved phrase without playing it, and **Window** to zoom the timing view from 0.25 to 12 seconds. Dense windows are capped at 400 rendered note events with an explicit omitted-count notice; zoom and inspect to examine smaller sections. The data itself is not dropped or quantized. The live recording view is a separate projection and never overwrites the prior saved phrase before recording finishes.

**Auto / Show / Hide** controls the view. Desktop shows staff, roll and the full piano together. Narrow or short windows switch between **Show score / Show piano** to keep the workspace usable. View preferences are local; changing these controls does not restart recording, playback or practice. No notation library, network service or uploaded recording is involved.

**Show example** displays a labeled C-major chord with a C3 bass and a separate C5 note, including a pedal-tail example. It is view-only: never saved, graded, played automatically, or substituted for your recording. **Back to my phrase** exits it; starting any transport exits it automatically.

## Scale Builder (Build 38)

Choose one of the existing 12 scale types and a root in Settings. The study preview repeats until you press **Start scale race**. Before **each of four successful runs**, a modal covers the piano and shows the scale, exact octave range, run number, and ten-second task. Press **Start run** to close it and begin the timer. There is no countdown or grading while that modal is open. Cancel, Escape or backdrop dismissal returns to preview and resets the current key’s four-run attempt; already mastered keys remain saved. Release notes played or held while the modal was open before starting.

Play the complete ascending scale, including root and upper tonic, within **ten seconds per run**. After each of the first three successes, the next pre-run modal waits for you—there is no automatic run start. After the fourth, a prominent **Level up** card pauses for 2.5 seconds before degree testing starts.

The first five degree questions of each attempt wait in a centered modal for **Start answering**, with no time limit. From question six onward, each modal stays visible for two seconds and closes automatically. No answer clock or key grading runs behind either preview; the question remains above the piano and the full two-second answer clock begins. Cancel, Escape, backdrop dismissal, or backgrounding during this preview returns to the full study preview. Once the keys appear, the degree question accepts an immediate answer and allows **two seconds maximum**. A correct selection visibly stays **green for 300 milliseconds** before the next question receives its full two seconds. Inputs during this brief feedback phase are not graded. The thirtieth answer also flashes green before mastery is saved and displayed. Wrong notes flash red and the correct answer is highlighted green. See the shared lives rules below. Completing these 30 answers unlocks the reverse-degree level described below. Completing that level selects the next unmastered root and waits in preview until Start. Review after mastering all 12 keys starts a fresh four-run sequence without deleting mastery.

After a question modal closes, degree questions remain large, bold and centered **above the playable piano**. Exact octaves matter; **C4 is middle C**. Settings and Modes sheets pause Scale Builder clocks and resume the same question with its remaining time; the dedicated pre-run modal has no active deadline at all. Root/type changes and mode exits cancel old attempts, close a run modal and prevent stale callbacks. New MIDI notes after feedback can be played legato; duplicate note-on messages for a held pitch cannot answer again.

The Modes menu and both the pre-run and degree-preview dialogs are centered in the available viewport in portrait and landscape, including tall phones. It respects safe-area padding and scrolls internally when content exceeds the screen. General Settings retains its compact mobile sheet layout.

On small displays (piano area at most 900 pixels wide) without a connected MIDI input, Scale Builder fits the full chromatic root-to-upper-tonic octave plus two or three neighboring chromatic keys below and above it across the screen. Both ends are white keys; all intervening black and white notes remain present. MIDI connection restores the broader keyboard; other modes are unchanged. A new attempt or key restarts the first-five manual question introductions; a buffered mistake advances to the next introduced question.


### Reverse-degree level

After 30 correct degree-to-key answers, a 2.5-second Level up pause introduces key-to-degree practice. A key is highlighted for **two seconds**, without a degree badge. The highlight then disappears and the circles below the piano unlock for a **separate two-second answer window**. Piano and MIDI notes do not submit answers in this level. A correct circle turns green for 300 ms; a wrong circle turns red. Reach **30 correct circle answers** to master the key and advance. Mistakes and missed deadlines use the shared lives rules below; previously achieved progress remains saved.

Seven-note scales use bold circles **1–8** for position within the scale; a small altered formula such as ♭3 identifies its interval relative to the major scale. Pentatonic and blues choices preserve their real degrees instead of renumbering omitted notes. For example, minor blues offers **1, ♭3, 4, ♭5, 5, ♭7, 8**. The lower tonic is 1; the upper tonic is 8 in every scale and key.

Previously saved achievements remain prior-level progress. Reverse-level completion is stored separately in `keymemory.scale.reverse.mastery.v1`; full mastery requires both records. Old saves are never credited for an unplayed reverse level. Opening Settings or Modes pauses the current Scale Builder question and resumes its remaining time on dismissal. Changing mode/root/type or leaving active reverse practice cancels the attempt safely.


### Three shared lives

Practice starts with **three lives shared across all three stages**, with a maximum of five. Remaining lives carry into the next key and are not refilled by changing stages, roots, scale types, or modes. A newly mastered key completed without any wrong answers or missed deadlines earns **one bonus life**, capped at five. Reviewing an already mastered key does not earn another reward. A wrong answer or deadline miss costs one life exactly once and pauses the clocks for an **untimed correction, until Continue is pressed**: the correct key or degree circle is green, the correct key carries its scale-degree badge (including upper tonic 8 and altered-degree labels), a mistaken piano key uses the shared red hold-and-fade animation, a mistaken degree circle stays red, and text identifies the right answer. The correct-answer highlight and correction text remain until Continue is pressed. The correction does not award a point.

With lives remaining, completed full-scale runs and correct-answer counts stay saved within the attempt. A missed full-scale run repeats from its own Start modal with a fresh ten seconds; forward and reverse degree practice continue with a new question and their normal viewing/answer windows. Each degree stage needs 30 correct answers, not an uninterrupted streak. When all lives are exhausted, the correction is still shown before returning to the full study preview, zero attempt progress and three fresh lives. Mastered keys and prior-level achievements are retained.

An exhausted attempt restarts with three lives after Continue. Lives are visible in the main status and pre-run/question modals. Settings and Modes pause active Scale Builder questions and corrections. Closing restores the same remaining time and keeps lives and counts; no hidden answer timer starts. Backgrounding during a correction preserves the review and stops audio.


A shared Sound on/off toggle controls app audio in every mode and saves its preference locally. It starts off; restoring an on preference still requires a user gesture to unlock browser audio. With sound on, played notes sound and Scale study notes sound as they highlight. Turning it off cancels active/pending notes and mutes Phrase playback/metronome without changing recorded MIDI or transport timing. Replay is a separate contextual action for a note/chord/group; Builder replay retains five-second sustain. Other replay durations remain appropriate to the mode. Audio availability is never required for answer grading.

Reverse questions explicitly show WATCH THE KEY with dimmed, locked circles for two seconds, then CHOOSE NOW with bright circles and a separate two-second countdown directly above them. A short chime plays when audio was successfully unlocked by a prior user gesture; unavailable audio never blocks practice. Reduced-motion settings disable the brief circle pulse.

After zero-life Continue returns to study preview, the replacement Start button briefly locks for 600 ms so a native double click cannot accidentally open a new run. Piano input is not globally debounced.

Scale Builder shows a prominent root + scale name and stage-specific remaining count. Full-scale practice counts runs left; each degree stage independently counts its 30 questions left. Buffered errors preserve the count, and a zero-life Continue resets it with the attempt.

Scale Builder’s Pause button freezes the current question, countdown, preview, success transition, and correction without changing lives or progress. Pause is also available inside full-run and degree-question dialogs. Resume, Escape, or the pause backdrop returns to the same phase with its saved time remaining. Audio stops on pause and does not autoplay on resume. Held MIDI notes must be released before a new answer is accepted. Changing mode/root/type cancels the paused attempt safely.


## Phrase transport and continuous pitch timeline

Phrase Trainer has a separate Click on/off control, independent of instrument Sound. Record, Play and Practice use the selected number of complete bars for count-in. The selected BPM click continues during each activity and can be changed on/off without restarting. The red REC indicator and elapsed timer identify active recording. MIDI recording preserves original note/controller timing; the metronome is not recorded.

Settings includes optional MIDI Learn for Record, Stop, Play, Start practice, Continue/Start, Transpose down and Transpose up. Assign a note or ordinary CC (0–119) on a channel; mappings work with any connected input. Enabled assigned inputs are reserved, excluded from music recording and grading. CC7/11/64 assignments therefore replace those musical controls. Use keys outside your playing range; remove assignments or disable transport to recover their musical use. Held/repeated events trigger only once until release. Continue uses existing ready/next/review prompts, never supplies an answer. Saved-recording replacement still requires browser confirmation. Initial MIDI connection and audio unlock may require a browser tap.

The staff displays successive pitches at their exact source times with a playback line, not inferred rhythmic sheet music. It does not guess durations as quarter notes, rests, measures, voices or hands. Notes-only practice follows the current target; rhythm practice follows elapsed time. The exact piano roll remains available with separate key lengths and pedal tails. Dense windows are capped at 400 notes with an explicit zoom-in notice.

### Phrase timing, looping and silent inspection

Click or drag on the recorded staff to inspect that exact source-time point, including between notes. Noteheads and labels do not snap the cursor to an onset. Touch users can tap to select or swipe to scroll. The visible window stays fixed while selecting within it. Keyboard users can focus the staff and use arrows (0.1 seconds), Shift+Arrow (1 second), Alt+Arrow (1 millisecond), Home/End or Enter/Space. The Inspect slider remains available. Inspection is silent and available while stopped. Simultaneously held keys are blue on the staff and piano; pedal-only notes have amber outlines, never a pressed-key highlight. Earlier still-sounding notes get left-edge continuation arrows. On small screens, Show piano reveals the matching highlighted keyboard.

The compact, always-visible **Speed** dial beside Live Score changes playback and practice speed without opening a panel or changing the recording. Drag up for faster or down for slower; **100%** is recorded speed. Double-click/double-tap or press Enter on the dial to reset. Arrow keys make 1% changes, Shift+Arrow makes 10% changes, and Home/End select the limits. The supported playback range is 30–300 BPM. Notes, rests, releases and pedal/controller timing scale together. This does not insert beats/measures, quantize the recording or change rhythm tolerance. Noteheads stay at exact onset x positions even in dense chords; only labels move to avoid collisions. Staff and Inspect positions include bar/beat reference and original recording seconds; Window changes zoom only. Changing speed stops the active transport, so press Play again to start at the new speed. Advanced BPM settings remain in Settings.

**Loop Start / End** markers can be dragged on the staff, or set precisely in the fields below the piano roll using original recording seconds. Marker arrows move 10 milliseconds; Shift+Arrow moves 1 millisecond and Page Up/Down moves 100 milliseconds. Home/End select the allowed boundary. Keyboard edits pan to keep the marker in view. Bounds clamp to the recording and cannot cross; the minimum loop lasts 50 milliseconds at the chosen speed. Editing stops transport and saves the selected section without cutting any notes. A drag previews locally and saves once on release; Escape, cancellation or leaving the view discards the unfinished drag. **Full phrase** restores the whole recording.

**Forgiveness** adjusts practice timing independently of playback speed. With **Rhythm** enabled, it accepts correct onsets within the shown early/late allowance, after the count-in. With Rhythm off, single notes have no onset deadline; the display shows the actual time allowed to complete a chord. The saved range is 80–1000 milliseconds, with a 200-millisecond default; notes-only chord completion also has a 180-millisecond minimum and tempo-dependent grouping allowance. Wrong pitches still fail. Changes stop an active exercise and apply when it is restarted. This does not compensate for device latency or accept notes played during count-in.

**Delete phrase** is available alongside the main transport controls and in Settings. Both ask before removing the browser's saved recording. Cancelling preserves it. Deletion clears inspection/loop state and resets transpose to **Original**. Empty saved phrases also restore Original; existing recordings keep their transpose.

**Hide practice / Show practice** in the header collapses the main Phrase practice card and remembers the choice locally. Record, Play, Practice, Stop, Click, Transpose and a compact current instruction remain available; hiding the card does not stop or reset an activity. Other modes keep their practice cards. The exact-time piano roll always sits directly under the staff, including desktop and landscape layouts.

Every MIDI action has a matching control and full-key color: Record is coral, Stop is silver, Play is green, Start practice is blue, Continue / Start is yellow, Transpose down is amber, and Transpose up is purple. Enabled note assignments color the entire white or black key, without a floating shortcut badge. A readable legend names each action, exact note and channel; CC assignments appear in the legend and control descriptions but never color an unrelated note with the same number. Multiple actions assigned to one pitch on different channels split the key into their colors and retain every action/channel in its accessible label. Same-input conflicts keep the prior assignments.

Mapped notes remain identifiable in all modes because enabled MIDI transport reserves them in all modes. In Phrase Trainer, any note assignment outside A0–C8 extends the keyboard; other modes keep their exercise ranges. Continue / Start also colors the existing Start, Resume, Next and correction controls it operates. Disabling transport or removing an assignment clears its key color and legend entry. Playing, inspection and answer cues remain visible as outlines or the shared wrong-answer overlay, independently of the mapping color.

Physical MIDI presses visibly depress white and black keys and reduce their shadows, including reserved shortcut notes. Releasing the last held channel returns a key to its resting position. Shortcuts still do not enter recording, grading or musical audio. Key elements survive UI refreshes so press/release transitions and wrong-answer animation do not restart. Disconnecting, backgrounding or changing mappings clears held visuals safely. Reduced-motion mode retains the down/up position without tweening.

**Play phrase** is a toggle: after the selected initial count-in, the selected section repeats until **Stop loop** (the same button) or **Stop** is pressed. Leading and trailing rests remain, without an added completion pause between repeats. Clicks repeat the selected source-grid phase on the same clock as the notes. Beat-aligned loops preserve a regular pulse, and complete bars preserve the accent cycle. Free loops containing a partial beat show a warning because their seam cannot preserve a regular pulse without changing the selected length. Each loop restores its recorded controller baseline. Count-in and pending audio unlock can also be cancelled with the same button. Opening Settings, changing mode, hiding/blurring the app, disconnecting MIDI or changing timing safely stops playback. Loops shorter than 0.05 seconds at the chosen tempo are rejected rather than flooding the audio graph. The internal one-shot engine API still supports tiny recordings.

## Shared wrong-key animation

Every graded piano mode uses the Semitones feedback: a red overlay holds for 500 ms, fades for 450 ms, then clears. Mouse, touch, keyboard activation of screen keys and external MIDI use the same feedback. Repeated mistakes restart the animation, and resizing preserves its elapsed time. Scale Builder keeps its correct-answer highlight, untimed correction and Continue action after the wrong key fades. Free Play, Dictionary exploration and Phrase recording/playback do not grade notes.

## Local audio and video import

In **Phrase Trainer → Import audio / video**, choose a video file up to **100 MB** or an audio file up to **20 MB**, each up to **two minutes** with a mono/stereo audio track, then select **0.05–30 seconds**. WAV and MP3 are good starting audio formats. MP4 with AAC audio and WebM with Opus audio are useful video options; MOV and other containers/codecs depend on the browser. The browser decodes only the audio for analysis; video pictures are not analyzed or shown. An unreadable file, unsupported codec or video without a decodable audio track produces an error without changing your saved phrase. Choose **Analyze** to detect notes locally. A first analysis downloads the bundled model/runtime from this app's origin; the audio or video itself is never uploaded, and no microphone permission or account is needed.

This importer does not accept URLs or YouTube links. Direct media URLs would require host CORS permission and bounded downloading; no proxy or server extraction is included. YouTube’s documented [IFrame API](https://developers.google.com/youtube/iframe_api_reference) provides embedded playback controls, not raw audio for transcription. Its [developer policies](https://developers.google.com/youtube/terms/developer-policies) restrict downloading/importing, scraping and separating audio from videos. A future visible play-along embed is a separate feature, not an audio-analysis source.

Review the detected notes before choosing **Use this phrase**. Hear the original section or the synthesized notes, change pitches/start times/lengths, remove extra notes, or add missing ones. The note editor is paginated. Existing saved notes remain untouched until acceptance; replacing them requires confirmation. Closing discards the draft and decoded audio. Errors, empty detection, cancellation and stale callbacks cannot silently replace the saved phrase. Only accepted notes and settings are saved locally, not the original media, decoded audio or filename.

This is assisted transcription, best for clean solo piano or another isolated instrument. Chords are supported; full mixes, harmonics, reverb and rapid/repeated notes can produce mistakes. Detected timing is an estimate, not the original MIDI performance. Imported notes use neutral velocity, no pedal data, no pitch bends and no inferred hands, key signature or tempo. Source/playback BPM are both initialized to 120 solely to preserve normal-speed playback; set the source tempo, meter and bar-1 alignment if you know the musical timing. Imported phrases remain marked as audio estimates after reload.

The same looping, transposition, speed and practice controls work after import. Recording MIDI still preserves actual note/controller input. A new successful MIDI recording replaces the audio-origin marker. Physical MIDI, exact note accuracy on arbitrary recordings and performance on actual phones require device verification.

### Audio runtime maintenance

The deployed site remains static and needs no build step to serve. Generated, self-hosted assets live in `assets/audio/`. To reproduce them, use `npm ci` and `npm run build:audio`; the lockfile pins Basic Pitch 1.0.1 and one compatible TensorFlow.js/WASM 4.22.0 registry. Third-party notices and SHA-256 asset hashes are included with the bundle. The worker uses single-threaded WASM, selecting SIMD when available, so cross-origin isolation headers are not required. It is loaded only for analysis and terminated on completion/cancel/error. Inference windows explicitly dispose temporary tensors.

`npm run test:audio` runs all focused audio-import checks. `npm run test:audio-runtime` checks real model inference, upstream parity, memory cleanup, cancellation and generated-bundle loading using self-generated audio. `node tests/audio-import-utils.cjs`, `node tests/audio-import-ui.cjs` and `node tests/phrase-import-engine.cjs` cover preparation contracts, review UI and atomic engine import. The UI test mocks browser decoding/audio/model responses; it is not a browser or listening test. Native browser suites are `node tests/audio-transcription-browser.cjs` and `node tests/audio-import-browser.cjs` when Playwright and permitted Chromium are available. The latter includes real file decoding/worker inference and desktop/mobile viewport checks. This build's local Chromium execution was blocked by the environment's socket restriction, so those native-browser stages are **not verified** here.


## Meter-aware timing (Build 2026.11.06.46)

Phrase Trainer now has an editable **4/4** default, numerator **1–12**, and denominator **2, 4, 8 or 16**. Source tempo, Tap tempo and the **Off / 1 bar / 2 bars** count-in remain accessible when the score is hidden, including before recording. Changing timing stops active playback/practice; Click on/off alone keeps the transport running.

Tempo labels name their actual pulse unit. **3/4 at quarter note = 120** has three 500 ms beats per bar. **6/8 at dotted quarter = 80** has two 750 ms pulses and six 250 ms grid subdivisions per bar. Both bars are 1.5 seconds long. 6/8, 9/8 and 12/8 use groups of three eighth notes; other meters click their denominator unit, accenting the first. Custom asymmetric accent groups, tempo changes within one phrase and automatic beat detection are not included. Advanced Settings retain quarter-note BPM between 30 and 300; the displayed pulse-tempo bounds are converted from those limits.

**Set bar 1 here** aligns the reference grid to the inspection cursor; earlier source time is labeled Pickup. **Reset grid** returns bar 1 to source time zero. Solid or dashed reference lines do not move notes or invent rhythmic notation. Imported and legacy recordings initially show an unconfirmed grid, because their tempo/meter/downbeat were not detected. A new MIDI take starts its own grid at zero without changing a previous take if recording is canceled or empty.

Loop **Snap** can be **Free**, **Beat** (with its note unit named) or **Bar**. Selecting snap does not move existing boundaries. Subsequent marker, keyboard and numeric edits choose a valid in-range grid boundary. Free mode retains precise source-second editing. Short loops still require at least 50 ms of playback. A partial-beat selection displays a warning: its exact-length repetitions cannot also maintain a constant beat interval at the seam. Beat-length partial bars repeat their selected accent pattern, rather than claiming to be whole bars.

**Pad trailing rest to bar** explicitly extends the selectable end to the next reference-bar boundary. It does not change the recording duration, notes or controller events; piano-key highlights and pedal tails are not extended to fill that silence. Turning it off restores the unpadded end. A full padded endpoint follows later tempo, meter or downbeat edits; custom shorter selections stay exact unless they exceed the new available tail. No silence is added automatically. Source-tempo calibration preserves the current playback-speed ratio and rejects a result outside the supported playback range rather than silently changing speed.

Clicks, notes, controllers and the cursor use the same source-to-playback rate. Preroll preserves the selected start's beat phase, loops do not count in again, and cancellation removes queued sounds and callbacks. Rhythm practice continues to grade the actual recorded onsets with the selected forgiveness; the reference grid is not destructive quantization. Notes-only practice remains learner-paced and completes once.

Existing version-1/version-2 recordings load with their notes, controllers, section points and speed preserved. New saves include version-3 timing metadata. Storage remains local to this browser. Rendered-browser, actual-device and listening validation remain separate from deterministic scheduling and DOM tests.


## Distinct MIDI keys and local video import (Build 2026.11.07.48)

In Phrase Trainer, your held musical MIDI keys are **pink with a diamond**, distinct from blue target, playback and silent-inspection notes. A key that is both live and a blue reference retains both colors. Accessible names describe simultaneous states; dark live-key labels have a contrast ratio above 7:1. Deliberate inspection keeps its blue key and dashed amber pedal cues during live input.

Pink ends when the physical key releases, even if the pedal keeps its sound going. Layered musical channels retain the indication until the last releases. Red wrong-note feedback keeps its normal hold/fade behavior. Reserved MIDI shortcuts keep their action colors and physical press effect; a musical note on another channel adds pink below those shortcut colors. Other modes, audio timing, practice grading and saved notes are unchanged.

**Import audio / video** also accepts local video files with browser-decodable mono/stereo audio. MP4/AAC and WebM/Opus are useful starting formats; MOV and other combinations depend on the browser. The existing file/time limits, local-only processing, review-before-acceptance and saved-phrase safeguards still apply. No video pictures or YouTube URLs are analyzed. See Local audio and video import above for limits and codec caveats.

Deterministic DOM/MIDI tests cover the new visual states and import guardrails. Native browser, physical MIDI, actual-phone/Safari, listening and arbitrary-codec coverage are separate; this release does not claim universal video support.


## Larger videos and import feedback (Build 2026.11.07.49)

The import dialog shows its current state immediately below the filename, before the preview and analysis controls. Selecting a file only loads its audio; **Analyze** starts silent note detection, while **Hear original section** plays the recording. Oversize errors show the actual file size. Videos now allow up to 100 MB, so a 30 MB screen recording is no longer rejected solely for size. Audio-only files remain capped at 20 MB; source duration stays at two minutes and each analyzed section at 30 seconds. Metadata is checked before allocating the whole-file ArrayBuffer. Accepted decoded audio still has a 25-million total-sample cap (about 100 MB of Float32 data), mono/stereo only, and 8–192 kHz sample-rate bounds. Browsers may use additional memory while decoding; this is not streaming extraction. Larger videos can be slower or exceed a device’s available memory, so the importer retains cancellable state, a bounded read/decode wait and the option to export a smaller audio-only file.

A decoded section with no samples above a conservative 0.00001 full-scale peak (−100 dBFS) gets a silence warning. Silent analysis skips model loading and leaves an empty, editable draft without altering the saved phrase. This is a signal-presence check, not a guarantee that a recording is loud enough or contains recognizable music. Missing/unsupported audio asks the user to check whether the original file plays with sound outside KeyMemory; a MOV extension alone does not prove it contains audio. No missing sound is reconstructed and no new codec converter is included.

File reading and audio decoding each time out after 30 seconds; preview audio startup times out after 5 seconds. Cancel, Close, Stop preview, a newer file, and late asynchronous completions preserve the saved phrase. Preview controls say when audio is starting, playing, finished, or stopped by loss of focus. Device volume, muted tabs, Safari/OS codec support, and the contents of a particular recording still require device-specific verification.

Live Build 2026.11.07.48 was checked in hosted Chrome with generated 18-second AAC and PCM MOVs. Both decoded, the AAC clip entered original-preview playback UI and detected 24 note events, a no-audio MOV showed the existing rejection, and a silent AAC MOV incorrectly said ready before returning zero notes. This establishes the feedback gap, not the cause of any uninspected user file. Audible hardware output was not measured. The candidate fixes are tested by deterministic UI/audio mocks and real WASM/model tests. Candidate native-browser tests could not run because local Chromium was blocked by the environment's socket restriction; the separate hosted browser could not reach the local test server. This describes pre-publication checks; deployed-browser verification is recorded separately.

A generated 18-second 1280×720 H.264/AAC MOV contains 36,021,876 bytes (34.4 MiB), above the user-reported 30 MB. The added fixture is a real constant-bitrate video, not a renamed audio file or artificial file-size mock. Native candidate-browser execution remains subject to the testing limit above.
