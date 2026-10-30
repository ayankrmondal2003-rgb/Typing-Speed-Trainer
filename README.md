# Type!e — Complete Typing Platform

> Type Smarter. Improve Faster. Drive Faster.
> Complete feature upgrade with Ghost Racing, Programming Mode, Real Multiplayer, Keyboard Layouts, and Advanced Analytics.

**Repository:** `Team-Zenith` | **Architecture:** HTML5 + Vanilla JavaScript + Node.js WebSocket Engine  
**Live Frontend:** Vercel compatible (`dist/` buildless static delivery)  
**Test Suite:** 53 passing automated tests across 10 test modules

---

## 🏎️ Key Capabilities & Feature Modules

### 1. Complete Ghost Racing System (Phase 1)
- **Timeline Sampling**: Continuous recording of timestamped progress milestones `(t, p, w)` during sessions.
- **Genuine Historical Replay**: Replays actual personal best performance curves instead of constant-speed simulations.
- **Circuit Geometry**: High-resolution SVG racetrack with curved F1 chicanes, asphalt grading, curbs, and animated racer cars (`#racer`, `#racer-p2`).
- **Live Ahead/Behind Delta**: Dynamic telemetry delta computation (`+4.2% ahead` / `-2.1% behind`) displayed on the dashboard in real time.
- **Duration Personal Bests**: Separate ghost replay tracking for 30s, 60s, and 120s modes.
- **Race Outcome**: Victory or deficit badges displayed upon completion.
- **Ghost Toggle**: Toggle on/off via quick header pill or Settings.

### 2. Dedicated Programming Typing Mode (Phase 2)
- **7 Languages + Random**: Full snippet suites for Python, JavaScript, C, C++, HTML, CSS, SQL, and Random Language.
- **3 Difficulty Tiers**: Beginner (basic variables & syntax), Intermediate (loops, classes, utilities), Advanced (algorithms, data structures, concurrency).
- **Format Integrity**: Strict preservation of indentation, brackets, punctuation, line breaks, and operators.
- **Tab Key Handling**: Seamless `Tab` key interception to advance through code indentation without loss of focus.
- **Monospace Code View**: Retro CRT monitor presentation with monospace typography.
- **Separate Programming Analytics**: Independent personal bests, timeline replay, and filterable history.

### 3. Advanced Keyboard Analytics & Alternative Layouts (Phase 3)
- **Physical Layouts**: Full dynamic mapping for **QWERTY**, **Dvorak**, and **Colemak**.
- **Accurate Heatmap Thresholds**: Color grading based on measured error rate:
  - `< 5%`: Low (Green)
  - `5% – 15%`: Medium (Yellow)
  - `> 15% – 50%`: High (Orange)
  - `> 50%`: Critical (Red)
- **Insufficient Sample Badges**: Keys with `< 3` attempts are badged as neutral samples with explanatory tooltips.
- **Frequently Mistyped Pairs (Bigrams)**: Automatic detection of troublesome transition bigrams (`th`, `in`, `er`) rendered as analytical chips.
- **Typing Consistency Metric**: Keystroke interval standard deviation analysis providing a 0–100% consistency score.

### 4. Adaptive Practice Engine (Phase 4)
- **Weak-Key Ranking**: Weighted prioritization based on error rates and attempts.
- **Deterministic Drills**: Natural-language targeted drills reinforcing muscle memory.
- **Code Symbols Practice**: Dedicated symbol drill generator (`fn({x}) => {}`) targeting brackets, braces, and operators.
- **Before/After Measured Improvement**: Percentage point delta reporting on targeted drill keys.

### 5. Real Multiplayer Racing (Phase 5)
- **Dual Communication Architecture**:
  - **WebSocket Backend (`server.cjs`)**: Full multi-client networking supporting synchronized racing across different browsers and devices.
  - **Local Fallback (`BroadcastChannel` + `localStorage`)**: Instant zero-config racing between local tabs without a server.
- **Room System**: 6-character room codes (e.g., `TE-4821`) with one-click invite links and copy buttons.
- **Synchronized Countdown**: Audio-visual 3..2..1..GO! countdown sequence locking input until start.
- **Multi-Car Circuit**: Real-time rendering of up to 4 distinct racers on the curved racetrack with speed tags.
- **Standings Podium & Rematch**: Instant leaderboard results and one-click rematch flow.

### 6. Analytics Dashboard Upgrade (Phase 6)
- **6 Overall Metric Cards**: Highest WPM, Best Accuracy, Average WPM, Total Tests Completed, Total Characters Typed, Consistency Score.
- **Mode Filtering**: Complete support for All Modes, Race Track, Programming Mode, Custom Text, and Practice Drills.
- **Personal Bests Tables**: Parallel bests for both Normal tests and Programming tests across 30s, 60s, and 120s.
- **JSON Backup & Restore**: Full JSON backup export and import with validation and ID deduplication.
- **CSV Data Export**: Standard RFC-compliant history export.

### 7. Audio & Neobrutalist UI (Phases 7 & 8)
- **Web Audio API Synthesizer**: Zero external audio files required. Synthesizes mechanical key clicks, mistyped error buzzes, countdown tones, and finish fanfare chords.
- **Volume & Mute Controls**: In-header sound toggle and Settings volume slider.
- **Theme Palette**: Neo Yellow (default), Dark (full high-contrast night theme), and Light.
- **Reduced Motion**: Setting to disable high-speed exhaust flames and drift animations.

---

## 🛠️ Architecture & Project Structure

```
Team-Zenith/
├── index.html                 # Single-page application views & dashboard
├── styles.css                 # Neo-brutalist styling system & responsive rules
├── script.js                  # Frontend controllers, event loops, and UI sync
├── typing-engine.js           # Headless typing engine, timeline sampling & metrics
├── session-analytics.js       # LocalStorage persistence, ghost profiles & analytics
├── programming-snippets.js    # Multi-language code snippet database
├── server.cjs                 # Standalone Node.js WebSocket multiplayer server
├── scripts/
│   ├── build.cjs              # Static asset builder for dist/ deployment
│   └── serve.cjs              # Local HTTP static preview server
├── vendor/
│   └── chart.umd.min.js       # Bundled Chart.js for offline line graphs
└── test suites/
    ├── frontend.test.js       # Full DOM interaction & journey tests
    ├── ghost.test.js          # Ghost sampling, replay & interpolation tests
    ├── programming.test.js    # Code snippets, Tab key & programming analytics tests
    ├── layouts.test.js        # QWERTY, Dvorak & Colemak physical layout tests
    ├── backup-restore.test.js # JSON export, import & deduplication tests
    ├── multiplayer.test.js    # Multiplayer DOM & room creation tests
    ├── websocket-multiplayer.test.js # WebSocket server integration tests
    ├── session-analytics.test.js     # Storage & ranking unit tests
    ├── typing-engine.test.js         # Core typing engine unit tests
    └── deployment.test.js            # Vercel dist build & preview tests
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (no build tools or external bundlers required)

### Local Development Preview
```bash
# Install development dependencies (jsdom, ws)
npm install

# Run automated test suites (53 tests)
npm test

# Launch static preview server
npm start
# -> http://127.0.0.1:4173
```

### Running the Multiplayer WebSocket Server
To host multi-device multiplayer across your local network or on a server:
```bash
npm run server
# -> WebSocket server listening on ws://localhost:8080
```

---

## 🌐 Deployment Guide

### Frontend Deployment (Vercel)
The project is configured for static hosting on Vercel:
1. Connect this repository to Vercel.
2. Build Command: `npm run build`
3. Output Directory: `dist`
4. Root Directory: `Team-Zenith`

### WebSocket Server Deployment (Render / Railway)
To deploy the WebSocket backend:
1. Create a new Node.js Web Service on [Render](https://render.com) or [Railway](https://railway.app).
2. Start Command: `node server.cjs`
3. Environment: Set `PORT` (defaults to 8080).
4. Clients will automatically connect to the WebSocket endpoint and gracefully fall back to local tab mode if offline.
