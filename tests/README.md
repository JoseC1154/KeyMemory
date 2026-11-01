# KeyMemory regression checks

The app is a static site; no application build step is required.

Test dependencies: Node.js, jsdom, and Playwright. Install test dependencies locally with `npm install --no-save jsdom playwright`. For the browser suite, install Playwright's Chromium with `npx playwright install chromium` if no system Chromium is available. `CHROMIUM_PATH` can select another installed Chromium executable.

- `node --check app.js`
- `node tests/dom-regression.cjs`
- `node tests/builder-lessons.cjs`
- `node tests/layout-controls.cjs`
- `node tests/browser-regression.cjs`

The DOM suite uses a deterministic clock to test immediate wrong→wrong→correct retries without Next, preserved prompts/targets/phases/deadlines, repeated red feedback, chord completion, timer toggles, timeouts, navigation, stale animation events, Free Play, and Dictionary exact inversions/partial-check retry/success lock. It advances a simulated clock, including a keyboard rerender during wrong-key feedback. It cannot verify rendered animation timing or touch layout.

The browser suite starts a temporary loopback server and tests desktop and mobile-touch Chromium viewports. It checks actual hold/fade opacity and saves screenshots in this directory. It does not publish anything.

The builder suite independently checks intervals and diatonic degrees for all 34 lesson types in all 12 roots (408 lessons), including 612 intermediate milestones. It tests theoretical spelling and piano-key equivalence, suspended-note replacement, exact-octave answers and highlights, all families in timed flow, every level and Mixed Practice, random-deck coverage, custom single/multiple/empty selections, Select all/Clear scope, preference reload and malformed storage, navigation/filter interruption, stale red feedback cleanup, and user-initiated 3/4/7-note chord audio. These DOM tests do not verify actual sound, animation pixels, or touch usability.

The layout-controls suite verifies unique IDs, all seven compact mode choices, context-specific settings, immediate-apply behavior, modal Done/Escape/backdrop dismissal, focus trapping/return and inert state, live timer mirrors, unchanged prompts/notes/deadlines when inspecting settings or hints, dictionary answer isolation, and navigation cleanup. It tests DOM behavior, not rendered geometry, native focus/inert implementation, or touch usability.
