# Typing Speed Trainer

> Measure speed and accuracy, and find the keys that slow you down.

Hack Day Haldia x GRID community - 6-hour build challenge

**Repo:** `team-zenith` | **Stack:** HTML + vanilla JavaScript | **Difficulty:** Medium-Hard | **Time:** 6 hours

## Brief
Typing tests give one number. Build a trainer that shows exactly where a typist loses time and drills those keys.

## Core tasks (must-do)
- [x] Prompts at 3 difficulty levels plus custom text
- [x] Live WPM, accuracy and countdown (30 / 60 / 120 s modes)
- [x] Highlight correct and wrong characters while typing
- [x] Per-key error heatmap drawn on an on-screen keyboard
- [x] History of recent tests with a progress line chart
- [x] Personal bests saved in localStorage
- [x] Practice mode that drills your weakest keys

## Bonus tasks (only after the core works)
- [ ] Ghost cursor racing your previous best
- [ ] Themes and sound effects
- [ ] Alternative keyboard layouts
- [x] Export history as CSV

## What is already here
- `index.html` - Home, Typing, Results, Stats and Settings views
- `styles.css` - responsive neobrutalist layout and three themes
- `script.js` - navigation, input handling, rendering and session lifecycle integration
- `typing-engine.js` - DOM-independent engine and per-session key counters
- `session-analytics.js` - bounded storage, history analytics and adaptive drills
- `package.json` - local preview, static packaging and test commands

## Run locally
```bash
npm start   # http://127.0.0.1:4173; Node 18+, no package download needed
```

For verification, run `npm ci` then `npm test` (Node 18+). The production app is
buildless. Chart.js 4.5.1 and its MIT license are bundled under `vendor/`, using
the official [script-tag integration](https://www.chartjs.org/docs/latest/getting-started/integration.html).
No network connection is required when opening the app directly. jsdom is a
development-only dependency for frontend integration tests.

## Phase 3 frontend

- **Home:** Race Track or Practice Drill, difficulty, timer, custom text and theme.
  Defaults are Race Track, Medium, 60 seconds and Neo Yellow. Choices survive
  in-app navigation. Practice Drill generates its own text and preserves your
  Race Track text-source choice.
- **Typing:** first-character start, live statistics, correct/incorrect/current
  character styles, passage progress, a CSS Grid keyboard and weak-key guidance.
  Physical keyboards use keydown; mobile keyboards can use beforeinput. Paste is
  blocked during tests. Restart resets the same passage without saving.
- **Results:** actual completed or timed-out results, retry and weak-key practice.
  End Test shows an unsaved partial result. Leaving an unfinished test discards
  it. Only the existing completion callback saves sessions, once per completion.
- **Stats:** personal bests, average/latest accuracy, mode-filtered chronological
  WPM chart, newest-first history table, keyboard heatmap and recommendations.
  Empty states guide new users; the table remains available if chart loading fails.
- **Settings:** Neo Yellow, Dark and Light themes, saved separately under
  `zenith-theme`. QWERTY is the only supported layout.

Keyboard colors aggregate uppercase and shifted symbols onto their physical
QWERTY keys: untested, at most 10% errors, at most 30%, and above 30%. Dashed
borders identify fewer than three attempts; hover labels give exact counts.
Underlying per-character statistics and ranking are unchanged. Non-QWERTY
characters remain in the engine's analytics and weak-key recommendations.

The layout uses responsive grids, visible keyboard focus, a skip link, labeled
controls and text/table alternatives for visual statistics. No engine or storage
schema changes were needed. The automated tests cover both earlier phases and
the full frontend journey, including storage reload and blocked storage. DOM
tests inspect Chart.js configuration with a chart stub; actual chart painting and
desktop/tablet/mobile visual layouts still need browser verification. The browser
preview tool rejected direct local-file access in this environment.

The sections below document the earlier phases; Phase 3 replaces their minimal
test harness with the views described above.

## Phase 1 engine verification

Open `index.html` directly or run `npm start`. Choose a difficulty and timer,
optionally enable a custom prompt, then click **Apply settings**. Focus the typing
box and type to start. **Restart current test** resets the active prompt and timer;
pending settings are applied only with **Apply settings**. This minimal harness
supports physical keyboard character input, Enter and Backspace; paste and IME
composition are not evaluated.

Run `npm test` (Node 18+) for deterministic engine tests with a fake clock.
Engine tests need no dependencies. Browser rendering is separate in `script.js`;
`typing-engine.js` exports `TypingEngine` for Node and `Zenith.TypingEngine` in the
browser. `window.typingEngine.getState()` exposes a fresh snapshot, including
character states, position, timing, counters and results. Poll `getState()` to
advance the clock even without input. `handleKey(key, modifiers)`, `restart()` and
`configure(options)` are independent of the DOM.

Statistics use Unicode code points as characters. WPM is retained correct
characters / 5 / elapsed minutes. Accuracy is correct character attempts / all
evaluated character attempts. Mistakes remain counted after Backspace; deleting
a correct character reduces WPM but does not erase its original attempt.
Backspace and modifier/navigation keys do not count as evaluated keystrokes.
At zero elapsed time WPM is 0; before any attempts accuracy is 0. Completion
occurs when every prompt position has input, including incorrect input. Results
freeze at completion or timeout; input at the deadline is rejected.

Heatmaps, adaptive practice, history and persistence remain outside Phase 1.

## Phase 2 analytics and practice

Click **Practice weak keys** to generate and load a drill using the current timer
and difficulty. The timer still starts on the first character. The button uses
the same engine as standard and custom tests. No chart or keyboard heatmap UI is
included yet.

Every evaluated character increments the expected key's attempts; wrong input
also increments its errors and the corresponding `incorrectKeys` entry. Backspace
does not erase attempts or errors. Key rates are fractions from 0 to 1. Ranking
requires at least 3 attempts and one error, ordered by rate, errors, attempts,
then character. Untested keys have rate 0 and `tested: false`; keys below the
threshold have `sufficient: false`. Case and Unicode code points remain distinct.
Drills use a deterministic word bank with rotating choices and literal-key
contexts for symbols. With insufficient data, rotating general exercises are used.

Completed and timed-out sessions are saved once through the engine's
`onComplete(snapshot)` callback. Each completion has a unique `sessionId`.
Incomplete and manually restarted sessions are not saved. Storage uses the
versioned `zenith-phase2-v1` localStorage key; missing/corrupt records are ignored.
Blocked storage and quota failures retain results in memory; check
`sessionStore.storageAvailable`. A later successful save writes retained results.
History is oldest-first and limited to 100 records. Personal best WPM is retained
separately for 30/60/120 seconds, includes all completed modes, and survives history
pruning. Weak-key analytics use only retained history. Dates are ISO timestamps
recorded at completion; progress timestamps are milliseconds since the Unix epoch.

Phase 3 can use the following browser APIs (returned data is detached):

```js
window.typingEngine.getState().perKey; // Current session's heatmap-ready counters
window.zenith.sessionStore.getHistory({ mode: 'test', difficulty: 'easy', duration: 60 });
window.zenith.sessionStore.getPersonalBests(); // { 30: number, 60: number, 120: number }
window.zenith.sessionStore.getProgress(); // ID, timestamp, date, WPM, accuracy and labels
window.zenith.sessionStore.getKeyStats({ keys: ['a', 'b'], minAttempts: 3 });
window.zenith.sessionStore.getWeakestKeys({ mode: 'test' });
window.zenith.startPractice(); // Loads a drill; returns text, targetKeys and fallback
```

History, progress and key APIs accept optional mode/difficulty/duration filters.
Modes are `test`, `custom` and `practice`. `ZenithAnalytics` exposes `SessionStore`,
`PracticeGenerator`, `keyAnalytics` and `weakestKeys` for standalone consumers;
the same exports are available through Node `require('./session-analytics')`.
Engine and analytics tests use Node's built-in test runner without real-time waits.

## Deploy

`npm run build` copies only the eight production assets to `dist/`. This is static
packaging, not a bundler; the app has no backend or production Node process.
`npm start` is a development-only, localhost server with an explicit asset list.
Use `PORT` to choose a different local port. Hash navigation needs no rewrite rules.

For Vercel, import the repository and select **Team-Zenith** as the Root Directory
(or the repository root if it directly contains `package.json`). The committed
`vercel.json` selects Other, `npm run build`, and `dist` as described in the
[Vercel configuration documentation](https://vercel.com/docs/project-configuration/vercel-json).
Deploy, then open the returned URL and run the manual checks below. No environment
variables are required. No Vercel connector, CLI or linked project was available
during Phase 4, so no public deployment or live URL is claimed.

## Phase 4 verification

All seven mandatory features are implemented. Automated coverage includes:

| Requirement | Verification |
| --- | --- |
| Difficulties and custom prompts | Engine tests plus all 9 difficulty/time UI combinations and custom validation |
| Live statistics and timers | WPM/accuracy, deadline input rejection, polling timeout, restart and navigation |
| Character highlighting | DOM assertions for correct, incorrect and current characters; Backspace |
| Per-key heatmap | Expected/incorrect-key counts, rates, sample thresholds and rendered error class |
| History and chart | Ordering, bounds, mode filters, reload, chart data and accessible table fallback |
| Personal bests | All three timer modes, pruning and persisted reload |
| Adaptive practice | Ranked weak-key emphasis, fallback/variation and live-session practice integration |

Phase 4 fixed three reproduced failures: idle ticks recreated the passage and
keyboard, timer rendering erased active IME composition, and live weak-key practice
ignored unsaved current-session evidence. Timer-only updates now retain those DOM
nodes; the original implementation replaced them every 100ms. Timers stop when
leaving typing or hiding the page, charts are destroyed when leaving Stats, and
initialization runs once. IME device behavior still requires the manual check below.
The heatmap legend now accurately labels fractional rates above 10%.

Run `npm ci` followed by `npm test`: 35 tests cover the full journey, regressions,
lifecycle cleanup, and deployment assets. The HTTP smoke test requires permission
to connect to loopback; network isolation initially blocked it, and it passed when
run with local network access. No new dependencies were added in Phase 4.

Remaining manual checks: desktop 1440×900, tablet 768×1024, mobile 390×844 and
320×568; all themes; horizontal overflow and keyboard alignment; visible focus and
Tab navigation; real Chart.js painting/tooltips; physical/mobile/IME input. The
available browser preview timed out reaching localhost, so DOM tests do not certify
visual layout, actual canvas rendering or browser console cleanliness. Vercel public
URL verification remains pending access. Existing localStorage is origin-specific:
localhost, direct-file and deployed origins do not share session history.

## Phase 5 final polish

- Refined cream (`#F8F5ED`), yellow and black styling, readable 16px form fields,
  44px controls, disabled states, mobile spacing and a single-column configuration
  below 380px. The three existing themes remain; no new theme variants were added.
- Race Track (including custom passages) shows a CSS marker driven by actual
  entered characters divided by passage length. Backspace moves it backward;
  time passing alone never moves it. Reduced-motion settings disable its transition.
  Practice Drill hides the track. Ghost replay is explicitly unavailable because
  existing saved sessions do not contain progress-over-time recordings. No ghost
  data is invented and no recording/storage migration was introduced.
- Practice shows target keys and the attempts/error rates behind the recommendation.
  Results compare each target's actual error rate with its pre-drill baseline,
  requiring at least three new attempts for comparison. Lower and higher error
  rates are reported honestly, with a small-sample caveat. General warm-ups do not
  claim measured improvement. Try Again keeps the passage; New Drill uses the
  existing rotating generator. Incomplete practice is still not saved.
- Results announce a new duration-specific personal best only when the completed
  WPM strictly exceeds the previous stored best. Ties and partial exits do not
  trigger the achievement. The existing all-modes personal-best policy is unchanged.
- Stats exports all retained, real sessions as `zenith-history.csv`, independent
  of the chart filter: timestamp, mode, duration, difficulty, WPM, accuracy and
  mistakes. Empty history disables export. The temporary download URL is released.
  `window.zenith.historyCsv()` returns the same quoted CSV, or an empty string.

Sound effects and alternative layouts were intentionally skipped in favor of
reliability; QWERTY remains the only advertised layout. Engine, storage schema and
adaptive algorithm are unchanged. No new dependencies were introduced.

Verification: 39 automated tests, including four focused Phase 5 tests, plus
syntax/diff checks and static build/HTTP checks. The preview tool again timed out
reaching localhost. Actual CSS layout across devices, motion preference rendering,
Chart.js canvas, browser download behavior and console cleanliness remain manual
checks; the DOM tests use chart/download stubs. The Vercel configuration is ready,
but no public deployment is claimed.

## Suggested pacing

### Reference-inspired visual update

The supplied keyboard and racing references informed the bold headline, colored
configuration accents, keycap artwork and SVG circuit. Feature positions and all
existing controls remain in their previous order. The car follows the circuit's
actual geometry using passage progress and reverses on Backspace; its WPM label
uses the engine snapshot. Decorative artwork adds no simulated statistics or
unsupported ghost/multiplayer controls. The keyboard illustration is bundled as
`assets/keyboard-hero.svg`; no remote assets or extra dependencies are needed.

Verification: 40 tests passed, including circuit geometry/telemetry coverage and
static asset checks. A preview started outside network isolation was accessible:
Home and Typing were visually inspected, real keystrokes updated the car and
heatmap, 390px Home/Typing checks showed no horizontal page overflow, and a 1280px
typing screenshot was inspected. The browser reported no error logs in this flow.
This resolves the earlier localhost-preview blocker for those checks; full
cross-browser/device testing and public deployment are still separate checks.

- Hour 1: read this README, agree on a plan and split the work
- Hours 2-4: build the core tasks
- Hour 5: integrate, polish, then bonus tasks if time allows
- Hour 6: deploy, open the Pull Request, submit on the MLH platform (OrganizerHQ)

## Submission checklist
- [ ] All core tasks work end to end
- [ ] Project is deployed and the live link opens
- [ ] Pull Request created on the Voyage GitHub repository assigned to your team
- [ ] Project submitted on the MLH platform (OrganizerHQ) - instructions are shared at the start of the event

## Rules
- Build new features on top of this starter project and integrate them.
- Teams of 3-4; every member must be present.
- AI tools and open-source / open-weight models are fully allowed.
