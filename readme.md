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
- **Settings → Recorded BPM / Tap BPM** lets you specify the original tempo. **Playback / practice BPM** changes speed by its ratio to recorded BPM. BPM is not inferred automatically; setting both to the same value preserves original timing.
- **Practice** starts with a visual four-beat count-in. Notes only is the default. Recorded onsets within 80 ms form a chord group; all its notes must be played together within a forgiving chord window. Exact pitches/octaves matter. Notes + rhythm additionally checks onset timing, with an adjustable 150/200/400 ms tolerance; note-release duration is reproduced in playback but is not graded.
- A wrong pitch, incomplete chord or rhythm miss restarts the **current full phrase or chosen section from its beginning**, after all keys are released and another count-in. The recording is not erased. Completed phrases remain available to practice again or transpose.
- Section start/end are seconds in the original recording. Notes crossing a boundary are clipped to the section. Full phrase restores the whole recording. Leading rests remain part of rhythm practice; the prompt shows when the next note/chord is due.

MIDI is the primary recording input. Screen keys can answer practice notes but do not record simulated note durations. General countdown challenges do not control Phrase Trainer. Its extra settings stay in Settings, while Record/Play/Practice/Stop/Transpose, the current target, progress and piano stay on the practice screen.

Engine and integration tests use synthetic MIDI and deterministic clocks. They do not establish actual YC61 hardware latency, driver behavior, physical touch usability or audible fidelity.

### Phrase timing and held-key monitoring (Build 2026.11.02.14)

Record and Play phrase now begin with a visible **1–2–3** and an audible three-beat count-in. The tempo click continues throughout recording (Recorded BPM) and playback (Playback BPM), including rests. The two-minute recording allowance begins **after** the count-in. Play only when the recording prompt appears; notes started before that boundary are not recorded. Practice retains its separate four-beat count-in.

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

The adjacent **exact-time piano roll** uses unquantized source milliseconds: solid bars show physical key-on/key-off durations, dashed tails show CC64 pedal sustain. Channel, onset, release and audible end are available in each bar's description; current controller values are shown below. The cursor follows playback at the selected BPM, while the horizontal labels remain original/source seconds. Original recording data is unchanged by display/transposition. Practice staff shows target pitches or currently held live keys; it does not pretend to transcribe rhythmic notation.

Use **Inspect** to examine a saved phrase without playing it, and **Window** to zoom the timing view from 0.25 to 12 seconds. Dense windows are capped at 400 rendered note events with an explicit omitted-count notice; zoom and inspect to examine smaller sections. The data itself is not dropped or quantized. The live recording view is a separate projection and never overwrites the prior saved phrase before recording finishes.

**Auto / Show / Hide** controls the view. Desktop shows staff, roll and the full piano together. Narrow or short windows switch between **Show score / Show piano** to keep the workspace usable. View preferences are local; changing these controls does not restart recording, playback or practice. No notation library, network service or uploaded recording is involved.

**Show example** displays a labeled C-major chord with a C3 bass and a separate C5 note, including a pedal-tail example. It is view-only: never saved, graded, played automatically, or substituted for your recording. **Back to my phrase** exits it; starting any transport exits it automatically.

## Scale Builder (Build 22)

Choose one of the existing 12 scale types and a root in Settings. The study preview repeats until you press **Start scale race**. Complete **four consecutive ascending scale runs**, including the root and upper tonic, with **five seconds for each run**. After each of the first three successes, a 1.5-second ready pause leads to the next run automatically. After the fourth, a prominent **Level up** card pauses for 2.5 seconds before degree testing starts. Transition time does not consume an exercise deadline.

Every degree question accepts an immediate answer and allows **three seconds maximum**. Thirty consecutive correct answers master that key. A wrong note or missed deadline clears both the four-run progress and degree streak, returning to the full study preview; press Start to rebuild all four runs. Previously mastered keys remain saved locally. Completion shows **30/30**, then selects the next unmastered root and waits in preview until Start. After all 12 keys are mastered, Review starts a fresh four-run sequence without erasing mastery.

A large bold centered question card stays above the piano rather than covering it. The exact keyboard octave matters; **C4 is middle C**. Settings sheets do not pause active deadlines. Root/type changes and mode exits cancel old attempts and callbacks. Preview and transition presses are not graded. New MIDI notes can be played legato; duplicate note-on messages for an already-held pitch cannot answer again. Release previously held keys during the ready pauses before the next run begins.
