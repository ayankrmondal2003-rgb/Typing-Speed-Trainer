const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const sessionStore = new ZenithAnalytics.SessionStore();
const practiceGenerator = new ZenithAnalytics.PracticeGenerator();
let result = null;
let page = 'home';
let chart = null;
let activeSession = false;
let timer = null;
let composing = false;
let renderedPrompt = null;
let renderedInput = null;
let renderedAttempts = -1;
let drillContext = null;

// Audio & Settings State
let soundEnabled = false;
let soundVolume = 0.5;
let ghostEnabled = true;
let currentLayout = 'qwerty';

try {
  soundEnabled = localStorage.getItem('zenith-sound') === 'true';
  const savedVol = localStorage.getItem('zenith-volume');
  if (savedVol !== null) soundVolume = Number(savedVol) / 100;
  ghostEnabled = localStorage.getItem('zenith-ghost') !== 'false';
  currentLayout = localStorage.getItem('zenith-layout') || 'qwerty';
} catch {}

// Audio synthesis using Web Audio API
let audioCtx = null;
function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function playKeyClick() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320 + Math.random() * 180, ctx.currentTime);
    const vol = 0.05 * soundVolume;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  } catch {}
}

function playErrorBuzz() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    const vol = 0.08 * soundVolume;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {}
}

function playCountdownBeep(high = false) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(high ? 880 : 440, ctx.currentTime);
    const vol = 0.12 * soundVolume;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (high ? 0.35 : 0.18));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (high ? 0.35 : 0.18));
  } catch {}
}

function playFinishFanfare() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1);
      const vol = 0.08 * soundVolume;
      gain.gain.setValueAtTime(vol, ctx.currentTime + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.1);
      osc.stop(ctx.currentTime + idx * 0.1 + 0.28);
    });
  } catch {}
}

// Multiplayer State
const mpColors = ['#e53935', '#0077b6', '#4ade80', '#c084fc'];
const mpCarIds = ['racer', 'racer-p2', 'racer-p3', 'racer-p4'];
const multiplayer = {
  active: false,
  isHost: false,
  roomId: null,
  channel: null,
  wsConnected: false,
  localPlayer: {
    id: 'p_' + Math.random().toString(36).slice(2, 8),
    name: 'SpeedRacer',
    color: '#e53935',
    carId: 'racer',
    progress: 0,
    wpm: '0.0',
    accuracy: 100
  },
  players: new Map(),
  results: [],
  countdownTimer: null
};

let wsClient = null;

function stopTimer() { if (timer !== null) clearInterval(timer); timer = null; }
function resetRendering() { renderedPrompt = null; renderedInput = null; renderedAttempts = -1; composing = false; }

const engine = new Zenith.TypingEngine({ difficulty: 'medium', onComplete: state => {
  const previousBest = sessionStore.getPersonalBests(state.mode)[state.duration];
  sessionStore.saveSession(state);
  const ghost = sessionStore.getGhost(state.duration, state.mode);
  result = { state, saved: true, personalBest: state.wpm > previousBest, drill: drillContext, ghost };
  playFinishFanfare();

  if (multiplayer.active) {
    broadcastMultiplayer({
      type: 'FINISH',
      playerId: multiplayer.localPlayer.id,
      name: multiplayer.localPlayer.name,
      wpm: format(state.wpm),
      accuracy: format(state.accuracy),
      time: format(state.elapsed)
    });
    recordMultiplayerResult({
      playerId: multiplayer.localPlayer.id,
      name: multiplayer.localPlayer.name,
      wpm: format(state.wpm),
      accuracy: format(state.accuracy),
      time: format(state.elapsed)
    });
  }
} });

const modeName = mode => ({ test: 'Race Track', custom: 'Custom Text', practice: 'Practice Drill', programming: 'Programming' })[mode] || mode;
const keyName = key => key === ' ' ? 'Space' : key === '\n' ? 'Enter' : key === '\t' ? 'Tab' : key;
const format = number => (Number(number) || 0).toFixed(1);
window.typingEngine = engine;
window.zenith = Object.freeze({ engine, sessionStore, startPractice, historyCsv, multiplayer });
window.typee = window.zenith;

function historyCsv() {
  const rows = sessionStore.getHistory();
  if (!rows.length) return '';
  const fields = ['date', 'mode', 'duration', 'difficulty', 'wpm', 'accuracy', 'mistakes'];
  const quote = value => `"${String(value).replaceAll('"', '""')}"`;
  return [['timestamp', ...fields.slice(1)], ...rows.map(row => fields.map(field => row[field]))]
    .map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
}

function exportHistory() {
  const csv = historyCsv();
  if (!csv) { $('#export-status').textContent = 'Complete a session before exporting.'; return; }
  let url;
  const link = document.createElement('a');
  try {
    url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.href = url;
    link.download = 'zenith-history.csv';
    document.body.append(link);
    link.click();
    $('#export-status').textContent = `Exported ${sessionStore.getHistory().length} sessions. Includes all modes, regardless of the chart filter.`;
  } catch { $('#export-status').textContent = 'Download unavailable in this browser. Your saved history is unchanged.'; }
  finally { link.remove(); if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

function exportJsonBackup() {
  const json = sessionStore.exportJson();
  let url;
  const link = document.createElement('a');
  try {
    url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
    link.href = url;
    link.download = 'zenith-backup.json';
    document.body.append(link);
    link.click();
    if ($('#backup-status')) $('#backup-status').textContent = 'Backup exported successfully.';
  } catch {
    if ($('#backup-status')) $('#backup-status').textContent = 'Backup download unavailable in this browser.';
  } finally {
    link.remove();
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function handleJsonRestore(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const count = sessionStore.importJson(e.target.result);
      if ($('#backup-status')) $('#backup-status').textContent = `Restored ${count} new session(s) successfully!`;
      renderStats();
    } catch (err) {
      if ($('#backup-status')) $('#backup-status').textContent = `Import failed: ${err.message}`;
    }
  };
  reader.readAsText(file);
}

function theme(value, persist = true) {
  const selected = ['neo', 'dark', 'light'].includes(value) ? value : 'neo';
  document.documentElement.dataset.theme = selected;
  $$('[data-theme-select]').forEach(select => { select.value = selected; });
  syncCardOption('theme', selected);
  if (persist) {
    try { localStorage.setItem('zenith-theme', selected); $('#theme-status').textContent = 'Your theme is saved on this device.'; }
    catch { $('#theme-status').textContent = 'Theme applied. Browser storage is unavailable, so it cannot be saved.'; }
  }
  if (page === 'stats') renderStats();
}

function setLayout(layout) {
  currentLayout = ['qwerty', 'dvorak', 'colemak'].includes(layout) ? layout : 'qwerty';
  const racerSelect = $('#racer-layout-select');
  if (racerSelect) racerSelect.value = currentLayout;
  const setSelect = $('#settings-layout');
  if (setSelect) setSelect.value = currentLayout;
  try { localStorage.setItem('zenith-layout', currentLayout); } catch {}
  if (page === 'typing' && activeSession) {
    renderKeyboard('#live-keyboard', engine.getState().perKey, currentLayout);
  } else if (page === 'stats') {
    renderStats();
  }
}

function go(destination) {
  if (location.hash === `#${destination}`) route();
  else location.hash = destination;
}

function route() {
  let hashStr = location.hash.slice(1);
  const qIndex = hashStr.indexOf('?');
  let destination = qIndex !== -1 ? hashStr.slice(0, qIndex) : hashStr;
  if (!destination) destination = 'home';
  if (!['home', 'multiplayer', 'typing', 'results', 'stats', 'settings'].includes(destination)) destination = 'home';
  if (destination === 'typing' && !activeSession) destination = 'home';
  if (destination === 'results' && !result) destination = 'home';
  if (multiplayer.roomId && !['multiplayer', 'typing', 'results'].includes(destination)) leaveRoom();
  if (page === 'typing' && destination !== 'typing' && activeSession) {
    engine.getState();
    engine.restart();
    activeSession = false;
  }
  page = destination;
  if (page === 'typing') {
    document.body.classList.add('typing-active');
  } else {
    document.body.classList.remove('typing-active');
  }
  stopTimer();
  if (page !== 'stats' && chart) { chart.destroy(); chart = null; }
  if (page === 'typing') timer = setInterval(() => { if (page === 'typing' && activeSession) renderTyping(); }, 100);
  $$('.view').forEach(view => { view.hidden = view.id !== page; });
  $$('.main-nav a').forEach(link => {
    if (link.hash === `#${page}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (page === 'stats') renderStats();
  if (page === 'results') renderResults();
  if (page === 'typing') { renderTyping(); $('#typing-input').focus(); }
  else if (page !== 'home') $(`#${page}-title`)?.focus({ preventScroll: true });
}

function sourceVisibility() {
  const practice = $('#mode').value === 'practice';
  const programming = $('#source').value === 'programming' || $('#mode').value === 'programming';
  $('#source').disabled = practice;
  $('#custom-wrap').hidden = practice || $('#source').value !== 'custom';
  const progWrap = $('#programming-wrap');
  if (progWrap) progWrap.hidden = practice || !programming;
  $('#practice-note').hidden = !practice;
}

function begin(practice = false, isSymbols = false) {
  const current = activeSession ? engine.getState() : null;
  const records = sessionStore.getHistory();
  if (current && current.status !== 'finished') records.push(current);
  const keyStats = ZenithAnalytics.keyAnalytics(records);
  let drill = null;
  if (isSymbols) {
    drill = practiceGenerator.generateCodeSymbols(keyStats);
  } else if (practice) {
    drill = practiceGenerator.generate(keyStats);
  }

  const isProgramming = !drill && ($('#source').value === 'programming' || $('#mode').value === 'programming');
  const progLang = $('#programming-language') ? $('#programming-language').value : 'javascript';
  const progDiff = $('#programming-difficulty') ? $('#programming-difficulty').value : 'intermediate';

  let snippet = null;
  if (isProgramming) {
    const provider = typeof ProgrammingSnippets !== 'undefined'
      ? ProgrammingSnippets
      : (typeof ZenithProgramming !== 'undefined' ? ZenithProgramming : null);
    if (provider && typeof provider.getSnippet === 'function') {
      snippet = provider.getSnippet(progLang, progDiff, Date.now());
    }
  }

  try {
    engine.configure({
      difficulty: isProgramming ? progDiff : $('#difficulty').value,
      duration: Number($('#duration').value),
      customText: drill ? drill.text : isProgramming ? (snippet ? snippet.code : 'const a = 1;') : $('#source').value === 'custom' ? $('#custom-text').value : null,
      mode: drill ? 'practice' : isProgramming ? 'programming' : $('#source').value === 'custom' ? 'custom' : 'test',
      language: progLang
    });
    $('#config-error').textContent = '';
    $('#custom-text').removeAttribute('aria-invalid');
    result = null;
    drillContext = drill ? { ...drill, baseline: keyStats.filter(row => drill.targetKeys.includes(row.key)) } : null;
    if (multiplayer.roomId) leaveRoom();
    multiplayer.active = false;
    hideMultiplayerCars();
    renderPracticeContext();

    const typingView = $('#typing');
    if (typingView) {
      typingView.classList.toggle('code-mode', isProgramming);
    }
    const btnSymbols = $('#btn-practice-symbols');
    if (btnSymbols) {
      btnSymbols.style.display = isProgramming ? 'inline-block' : 'none';
    }

    resetRendering();
    activeSession = true;
    go('typing');
    return drill;
  } catch (error) {
    $('#config-error').textContent = error.message;
    $('#custom-text').setAttribute('aria-invalid', 'true');
    $('#custom-text').focus();
    return null;
  }
}

function startPractice() { return begin(true); }

function renderPracticeContext() {
  $('#practice-context').hidden = !drillContext;
  $('#race-experience').hidden = !!drillContext;
  $('#tab-practice').setAttribute('aria-pressed', String(!!drillContext));
  $('#tab-practice').classList.toggle('active', !!drillContext);
  $('#tab-race-track').classList.toggle('active', !drillContext && engine.mode !== 'programming');
  const codeTab = $('#tab-code-mode');
  if (codeTab) codeTab.classList.toggle('active', !drillContext && engine.mode === 'programming');

  $('#typing-title').textContent = drillContext ? 'Build your accuracy.' : 'Find your flow.';
  if (!drillContext) return;
  $('#practice-targets').replaceChildren(...drillContext.targetKeys.map(key => {
    const element = document.createElement('kbd'); element.textContent = keyName(key); return element;
  }));
  $('#practice-reason').textContent = drillContext.fallback
    ? 'A balanced warm-up: there is not enough error evidence yet to recommend specific keys. Keep accuracy steady.'
    : `Recommended from prior attempts: ${drillContext.baseline.map(row => `${keyName(row.key)} — ${Math.round(row.errorRate * 100)}% errors in ${row.attempts} attempts`).join('; ')}. This passage repeats words or contexts containing these keys.`;
}

function practiceFeedback(state, drill) {
  if (!drill || drill.fallback) return `Drill accuracy: ${format(state.accuracy)}%. This warm-up builds evidence for your next recommendation.`;
  const comparisons = drill.baseline.flatMap(before => {
    const after = state.perKey.find(row => row.key === before.key);
    if (!after || after.attempts < 3) return [];
    const change = (before.errorRate - after.errorRate) * 100;
    return [{ key: before.key, beforeRate: before.errorRate * 100, afterRate: after.errorRate * 100, change }];
  });
  if (!comparisons.length) return `Drill accuracy: ${format(state.accuracy)}%. Repeat targeted drills to verify permanent habit changes.`;
  const improved = comparisons.filter(entry => entry.change > 0);
  if (!improved.length) return `Target key accuracy did not improve this run. Slow down slightly on ${comparisons.map(entry => keyName(entry.key)).join(', ')} to reinforce clean muscle memory.`;
  return `Accuracy gain on target keys: ${improved.map(entry => `${keyName(entry.key)} (${format(entry.beforeRate)}% → ${format(entry.afterRate)}% errors, ${format(entry.change)} percentage points lower)`).join('; ')}. Keep repeating clean repetitions.`;
}

function weakText(rows) {
  const weak = ZenithAnalytics.weakestKeys(rows).slice(0, 5);
  return weak.length ? `Focus next: ${weak.map(row => `${keyName(row.key)} (${Math.round(row.errorRate * 100)}% errors)`).join(', ')}` : 'No weak keys recorded yet. Keep typing to build accuracy data.';
}

// KEYBOARD LAYOUT DEFINITIONS
const KEYBOARD_LAYOUTS = {
  qwerty: {
    name: 'QWERTY',
    rows: [
      ['`','1','2','3','4','5','6','7','8','9','0','-','=','BACKSPACE'],
      ['TAB','Q','W','E','R','T','Y','U','I','O','P','[',']','\\'],
      ['CAPS','A','S','D','F','G','H','J','K','L',';',"'",'ENTER'],
      ['SHIFT','Z','X','C','V','B','N','M',',','.','/','SHIFT'],
      ['SPACE']
    ]
  },
  dvorak: {
    name: 'Dvorak',
    rows: [
      ['`','1','2','3','4','5','6','7','8','9','0','[',']','BACKSPACE'],
      ['TAB',"'",',','.','P','Y','F','G','C','R','L','/','=','\\'],
      ['CAPS','A','O','E','U','I','D','H','T','N','S','-','ENTER'],
      ['SHIFT',';','Q','J','K','X','B','M','W','V','Z','SHIFT'],
      ['SPACE']
    ]
  },
  colemak: {
    name: 'Colemak',
    rows: [
      ['`','1','2','3','4','5','6','7','8','9','0','-','=','BACKSPACE'],
      ['TAB','Q','W','F','P','G','J','L','U','Y',';','[',']','\\'],
      ['CAPS','A','R','S','T','D','H','N','E','I','O',"'",'ENTER'],
      ['SHIFT','Z','X','C','V','B','K','M',',','.','/','SHIFT'],
      ['SPACE']
    ]
  }
};

function renderKeyboard(target, stats = [], layoutName = currentLayout) {
  const plain = "`" + "1234567890-=[]" + String.fromCharCode(92) + ";',./";
  const shifted = '~!@#$%^&*()_+{}|:"<>?';
  const map = new Map();
  for (const row of stats) {
    const index = shifted.indexOf(row.key);
    const key = row.key === '\n' ? 'enter' : row.key === ' ' ? 'space' : index < 0 ? row.key.toLowerCase() : plain[index];
    const total = map.get(key) || {attempts: 0, errors: 0};
    total.attempts += row.attempts;
    total.errors += row.errors;
    total.errorRate = total.attempts ? total.errors / total.attempts : 0;
    map.set(key, total);
  }
  const layout = KEYBOARD_LAYOUTS[layoutName] || KEYBOARD_LAYOUTS.qwerty;
  const rows = layout.rows;
  const fragment = document.createDocumentFragment();
  rows.forEach(row => {
    const div = document.createElement('div');
    div.className = 'keyboard-row';
    row.forEach(keyStr => {
      const lower = keyStr.toLowerCase();
      const stat = map.get(lower);
      const keyEl = document.createElement('div');
      keyEl.className = 'key';
      keyEl.textContent = keyStr === 'BACKSPACE' ? '⌫' : keyStr;
      if (['BACKSPACE', 'TAB', 'CAPS', 'ENTER', 'SHIFT'].includes(keyStr)) {
        keyEl.classList.add('wide');
      }
      if (stat && stat.attempts > 0) {
        if (stat.attempts < 3) keyEl.classList.add('sample');
        if (stat.errorRate > 0.50) keyEl.classList.add('critical');
        else if (stat.errorRate > 0.15) keyEl.classList.add('high');
        else if (stat.errorRate >= 0.05) keyEl.classList.add('mid');
        else keyEl.classList.add('low');
        keyEl.title = `${keyStr} · ${Math.round(stat.errorRate * 100)}% error rate · ${stat.attempts} attempts${stat.attempts < 3 ? ' (insufficient data < 3)' : ''}`;
      } else {
        keyEl.title = `${keyStr} · not tested yet`;
      }
      div.append(keyEl);
    });
    fragment.append(div);
  });
  $(target).replaceChildren(fragment);
}

function updateRacerCar(carElement, progressPercent, tagElement, labelText) {
  if (!carElement) return;
  carElement.style.display = 'block';
  const routePath = $('#circuit-route');
  if (routePath && typeof routePath.getTotalLength === 'function') {
    const length = routePath.getTotalLength();
    if (!routePath.dataset.marked) {
      for (const marker of $$('.circuit-marker')) {
        const point = routePath.getPointAtLength(length * Number(marker.dataset.fraction));
        marker.setAttribute('transform', 'translate(' + point.x + ' ' + point.y + ')');
      }
      routePath.dataset.marked = 'true';
    }
    const distance = length * (Math.max(0, Math.min(100, progressPercent)) / 100);
    const point = routePath.getPointAtLength(distance);
    const before = routePath.getPointAtLength(Math.max(0, distance - 1));
    const after = routePath.getPointAtLength(Math.min(length, distance + 1));
    const angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
    if (tagElement) tagElement.parentElement.setAttribute('transform', 'rotate(' + (-angle) + ') translate(-26 -30)');
    carElement.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle})`);
  }
  if (tagElement && labelText) tagElement.textContent = labelText;
}

function hideMultiplayerCars() {
  ['#racer-p2', '#racer-p3', '#racer-p4'].forEach(sel => {
    const el = $(sel);
    if (el) el.style.display = 'none';
  });
}

function interpolateGhost(timeline, elapsed) {
  if (!timeline || !timeline.length) return { progress: 0, wpm: 0 };
  const getT = e => e.t !== undefined ? e.t : e.time !== undefined ? e.time : 0;
  const getP = e => {
    const val = e.p !== undefined ? e.p : e.progress !== undefined ? e.progress : 0;
    return val <= 1 && val > 0 ? val * 100 : val;
  };
  const getW = e => e.w !== undefined ? e.w : e.wpm !== undefined ? e.wpm : 0;

  if (elapsed <= getT(timeline[0])) {
    const t0 = getT(timeline[0]);
    const r = t0 > 0 ? elapsed / t0 : 0;
    return { progress: getP(timeline[0]) * r, wpm: getW(timeline[0]) * r };
  }
  if (elapsed >= getT(timeline[timeline.length - 1])) {
    const last = timeline[timeline.length - 1];
    return { progress: getP(last), wpm: getW(last) };
  }
  for (let i = 0; i < timeline.length - 1; i++) {
    const t0 = getT(timeline[i]);
    const t1 = getT(timeline[i + 1]);
    if (elapsed >= t0 && elapsed <= t1) {
      const dt = t1 - t0;
      const ratio = dt > 0 ? (elapsed - t0) / dt : 0;
      const p0 = getP(timeline[i]);
      const p1 = getP(timeline[i + 1]);
      const w0 = getW(timeline[i]);
      const w1 = getW(timeline[i + 1]);
      return {
        progress: p0 + ratio * (p1 - p0),
        wpm: w0 + ratio * (w1 - w0)
      };
    }
  }
  const last = timeline[timeline.length - 1];
  return { progress: getP(last), wpm: getW(last) };
}

function renderTyping() {
  const state = engine.getState();
  const progress = state.characters.length > 0 ? state.position / state.characters.length * 100 : 0;
  $('#racer').style.left = `${progress}%`;
  updateRacerCar($('#racer'), progress, $('#car-tag-you'), `YOU: ${format(state.wpm)} WPM`);

  // Update Telemetry & Status
  $('#live-wpm').textContent = format(state.wpm);
  $('#live-accuracy').textContent = `${format(state.accuracy)}%`;
  $('#live-time').textContent = `${Math.ceil(state.remaining)}s`;
  $('#live-mistakes').textContent = state.mistakes;
  if ($('#stat-total-attempted')) $('#stat-total-attempted').textContent = state.totalKeystrokes;
  if ($('#stat-correct-chars')) $('#stat-correct-chars').textContent = state.correctCharacters;
  if ($('#live-consistency')) $('#live-consistency').textContent = `${state.consistency}%`;
  if ($('#player-percent-label')) $('#player-percent-label').textContent = `${Math.round(progress)}% Done`;
  if ($('#player-wpm-label')) $('#player-wpm-label').textContent = `${format(state.wpm)} WPM`;
  if ($('#btn-status-ready')) {
    $('#btn-status-ready').textContent = state.status === 'ready' ? '🏁 READY TO RACE' : state.status === 'finished' ? '🏁 FINISHED' : '⚡ RACING';
  }

  for (const button of $$('#live-difficulty-group button, #live-duration-group button')) {
    const selected = button.dataset.time ? Number(button.dataset.time) === state.duration
      : button.dataset.diff === (state.mode === 'custom' ? 'custom' : state.difficulty);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = multiplayer.active;
  }
  $('#btn-new-prompt').disabled = $('#btn-custom-passage').disabled = multiplayer.active;

  // Update Ghost / Opponent car
  if (multiplayer.active) {
    multiplayer.localPlayer.progress = Math.round(progress);
    multiplayer.localPlayer.wpm = format(state.wpm);
    broadcastMultiplayer({
      type: 'PROGRESS',
      playerId: multiplayer.localPlayer.id,
      progress: Math.round(progress),
      wpm: format(state.wpm)
    });

    hideMultiplayerCars();
    $('#opponent-name-label').textContent = 'LOCAL OPPONENT';
    $('#ghost-percent-label').textContent = 'Waiting for a rival';
    $('#ghost-wpm-label').textContent = '—';
    let telemetryStr = `YOU · ${format(state.wpm)} WPM`;
    const opponents = [...multiplayer.players.values()].filter(player => player.id !== multiplayer.localPlayer.id);
    opponents.forEach((p, index) => {
        const carEl = document.getElementById(mpCarIds[1 + index]);
        updateRacerCar(carEl, p.progress || 0, carEl?.querySelector('text'), `${p.name.toUpperCase()}: ${Math.round(p.wpm || 0)} WPM`);
        if (index === 0) {
          $('#opponent-name-label').textContent = p.name.toUpperCase();
          $('#ghost-percent-label').textContent = Math.round(p.progress || 0) + '% Done';
          $('#ghost-wpm-label').textContent = format(Number(p.wpm) || 0) + ' WPM';
        }
        telemetryStr += ` · ${p.name.toUpperCase()} · ${p.wpm || '0.0'} WPM`;
    });
    $('#race-telemetry').textContent = telemetryStr;
  } else {
    const ghost = sessionStore.getGhost(state.duration, state.mode);
    if (ghostEnabled && ghost && ghost.timeline && ghost.timeline.length > 0) {
      const ghostState = interpolateGhost(ghost.timeline, state.elapsed);
      const ghostCar = $('#racer-p2');
      updateRacerCar(ghostCar, ghostState.progress, $('#car-tag-ghost'), `GHOST: ${Math.round(ghostState.wpm)} WPM`);
      const delta = progress - ghostState.progress;
      const aheadStr = delta >= 0 ? `+${delta.toFixed(1)}% ahead` : `${Math.abs(delta).toFixed(1)}% behind`;
      $('#opponent-name-label').textContent = `PB GHOST (${format(ghost.wpm)} WPM)`;
      $('#ghost-percent-label').textContent = `${Math.round(ghostState.progress)}% Done (${aheadStr})`;
      $('#ghost-wpm-label').textContent = `${format(ghostState.wpm)} WPM`;
      $('#race-telemetry').textContent = `YOU · ${format(state.wpm)} WPM · GHOST ${format(ghostState.wpm)} WPM (${aheadStr})`;
    } else if (!ghostEnabled) {
      hideMultiplayerCars();
      $('#opponent-name-label').textContent = 'PB GHOST';
      $('#ghost-percent-label').textContent = 'Ghost disabled in settings';
      $('#ghost-wpm-label').textContent = '—';
      $('#race-telemetry').textContent = `YOU · ${format(state.wpm)} WPM`;
    } else {
      hideMultiplayerCars();
      $('#opponent-name-label').textContent = 'PERSONAL BEST GHOST';
      $('#ghost-percent-label').textContent = 'Unavailable · no recorded timeline';
      $('#ghost-wpm-label').textContent = '—';
      $('#race-telemetry').textContent = `YOU · ${format(state.wpm)} WPM`;
    }
  }

  $('#race-progress').textContent = `${Math.round(progress)}% COMPLETE`;
  if (state.status === 'finished') { activeSession = false; stopTimer(); go('results'); return; }
  $('#session-label').textContent = `${modeName(state.mode)} / ${state.difficulty} / ${state.duration}s`;
  $('#typing-status').textContent = state.status === 'ready' ? 'Ready when you are' : 'Keep going';

  // Render typing passage text
  if (renderedPrompt !== state.prompt || renderedInput !== state.input) {
    const fragment = document.createDocumentFragment();
    state.characters.forEach((char, index) => {
      const span = document.createElement('span'); span.textContent = char.expected;
      span.className = `${char.status}${index === state.position ? ' current' : ''}`; fragment.append(span);
    });
    $('#prompt').replaceChildren(fragment);
    const current = $('#prompt .current');
    if (current) {
      const container = $('.crt-screen');
      const relative = current.getBoundingClientRect().top - container.getBoundingClientRect().top;
      if (relative > container.clientHeight - 40 || relative < 0) container.scrollTop += relative - 40;
    }
    renderedPrompt = state.prompt;
    renderedInput = state.input;
  }
  if (!composing && $('#typing-input').value !== state.input) $('#typing-input').value = state.input;
  $('#passage-progress').value = progress;
  $('#progress-label').textContent = `${Math.round(progress)}% (${state.position}/${state.characters.length})`;

  if (renderedAttempts !== state.totalKeystrokes) {
    const keyAnalytics = ZenithAnalytics.keyAnalytics([state]);
    renderKeyboard('#live-keyboard', state.perKey, currentLayout);
    $('#live-weak').textContent = weakText(keyAnalytics);
    const badgesWrap = $('#live-weak-badges');
    if (badgesWrap) {
      const weakList = ZenithAnalytics.weakestKeys(keyAnalytics).slice(0, 4);
      if (weakList.length) {
        badgesWrap.replaceChildren(...weakList.map(item => {
          const b = document.createElement('span');
          b.className = 'key-badge';
          b.textContent = `${keyName(item.key).toUpperCase()} ${Math.round(item.errorRate * 100)}%`;
          return b;
        }));
      } else {
        badgesWrap.textContent = state.totalKeystrokes ? 'No ranked keys yet' : 'Awaiting input';
      }
    }
    renderedAttempts = state.totalKeystrokes;
  }
}

function renderResults() {
  const { state, saved } = result;
  $('#results-title').textContent = saved ? "That's progress." : 'A pause, not a setback.';
  $('#result-description').textContent = saved ? state.finishReason === 'timeout' ? 'Time is up. Every keystroke is practice.' : 'Passage complete. Keep building the habit.' : 'Test ended early. This attempt was not saved.';
  $('#result-wpm').textContent = format(state.wpm); $('#result-accuracy').textContent = `${format(state.accuracy)}%`;
  $('#result-mistakes').textContent = state.mistakes; $('#result-characters').textContent = `${state.position} / ${state.characters.length}`;
  $('#result-details').textContent = `${modeName(state.mode)} · ${state.difficulty} · ${state.duration}s mode · ${format(state.elapsed)}s elapsed · ${state.correctCharacters} correct characters · ${state.consistency}% consistency`;
  $('#result-weak').textContent = weakText(ZenithAnalytics.keyAnalytics([state]));
  $('#save-status').textContent = saved ? sessionStore.storageAvailable ? 'Saved on this device. Your next session starts here.' : 'Saved for this visit only. Browser storage is unavailable.' : 'Only completed and timed-out sessions enter your history.';
  $('#personal-best-achievement').hidden = !saved || !result.personalBest;
  $('#personal-best-achievement').textContent = saved && result.personalBest ? `New ${state.duration}s personal best · ${format(state.wpm)} WPM · all modes` : '';
  $('#practice-feedback').hidden = state.mode !== 'practice';
  $('#practice-feedback').textContent = state.mode === 'practice' ? practiceFeedback(state, result.drill) : '';
  $('#result-practice').textContent = state.mode === 'practice' ? 'New Drill' : 'Practice Weak Keys';

  // Ghost outcome
  const ghostBadge = $('#ghost-race-result');
  if (ghostBadge) {
    if (result.ghost && saved && state.status === 'finished') {
      ghostBadge.hidden = false;
      if (state.wpm > result.ghost.wpm) {
        ghostBadge.className = 'ghost-result-badge victory';
        ghostBadge.textContent = '🏆 GHOST DEFEATED! New Personal Best Replay Timeline established.';
      } else {
        ghostBadge.className = 'ghost-result-badge deficit';
        ghostBadge.textContent = `⚡ PB Ghost was +${format(result.ghost.wpm - state.wpm)} WPM faster. Try again to beat your ghost!`;
      }
    } else {
      ghostBadge.hidden = true;
    }
  }

  // Rematch button
  const rematchBtn = $('#btn-rematch');
  if (rematchBtn) {
    rematchBtn.hidden = !multiplayer.active;
  }

  const lbPanel = $('#mp-results-leaderboard');
  if (multiplayer.active && lbPanel) {
    lbPanel.hidden = false;
    renderLeaderboard();
  } else if (lbPanel) {
    lbPanel.hidden = true;
  }
}

function renderLeaderboard() {
  const list = $('#mp-leaderboard-list');
  if (!list) return;
  const sorted = [...multiplayer.results].sort((a, b) => Number(b.wpm) - Number(a.wpm));
  list.replaceChildren(...sorted.map((res, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.textContent = `#${i + 1} ${res.name} · ${res.wpm} WPM · ${res.accuracy}% ACC`;
    return row;
  }));
}

function recordMultiplayerResult(res) {
  if (!multiplayer.results.find(r => r.playerId === res.playerId)) {
    multiplayer.results.push(res);
  }
  renderLeaderboard();
}

function renderStats() {
  const filter = $('#history-filter').value;
  const filters = filter === 'all' ? {} : { mode: filter };
  const history = sessionStore.getHistory(filters);
  $('#export-csv').disabled = sessionStore.getHistory().length === 0;
  $('#export-status').textContent = $('#export-csv').disabled ? 'Complete a session to export your history.' : '';

  // Overall metric cards
  const overall = sessionStore.getOverallStats(filters);
  if ($('#stat-high-wpm')) $('#stat-high-wpm').textContent = format(overall.highestWpm);
  if ($('#stat-best-acc')) $('#stat-best-acc').textContent = `${format(overall.bestAccuracy)}%`;
  if ($('#stat-avg-wpm')) $('#stat-avg-wpm').textContent = format(overall.averageWpm);
  if ($('#stat-total-tests')) $('#stat-total-tests').textContent = overall.totalTests;
  if ($('#stat-total-chars')) $('#stat-total-chars').textContent = overall.totalCharacters;
  if ($('#stat-consistency')) $('#stat-consistency').textContent = `${overall.averageConsistency}%`;

  // Normal Personal Bests
  const bests = sessionStore.getPersonalBests('test');
  $('#personal-bests').replaceChildren(...[30,60,120].map(duration => {
    const div = document.createElement('div'); const strong = document.createElement('strong'); const label = document.createElement('span');
    strong.textContent = format(bests[duration]); label.textContent = `${duration} SECOND BEST`; div.append(strong,label); return div;
  }));

  // Programming Personal Bests
  const progBests = sessionStore.getPersonalBests('programming');
  const progBestsEl = $('#programming-personal-bests');
  if (progBestsEl) {
    progBestsEl.replaceChildren(...[30,60,120].map(duration => {
      const div = document.createElement('div'); const strong = document.createElement('strong'); const label = document.createElement('span');
      strong.textContent = format(progBests[duration]); label.textContent = `${duration}s CODE BEST`; div.append(strong,label); return div;
    }));
  }

  // Top Mistyped Bigrams
  const bigramsEl = $('#stats-bigrams');
  if (bigramsEl) {
    const bigrams = sessionStore.getBigrams(filters).slice(0, 12);
    if (bigrams.length) {
      bigramsEl.replaceChildren(...bigrams.map(b => {
        const chip = document.createElement('span');
        chip.className = 'bigram-chip';
        chip.innerHTML = `"${keyName(b.pair[0])}→${keyName(b.pair[1])}" <span class="count">${b.count}×</span>`;
        return chip;
      }));
    } else {
      bigramsEl.textContent = 'No character pair mistake patterns recorded yet.';
    }
  }

  $('#accuracy-summary').textContent = history.length ? `${history.length} sessions · Average accuracy ${format(history.reduce((sum, row) => sum + row.accuracy, 0) / history.length)}% · Latest ${format(history.at(-1).accuracy)}%` : 'Your first completed session is the start of your story.';
  $('#history-empty').textContent = history.length ? '' : 'No completed sessions yet for this mode. Start a test or try a practice drill.';
  $('#history-body').replaceChildren(...history.slice().reverse().map(row => {
    const tr = document.createElement('tr');
    for (const text of [new Date(row.date).toLocaleString(), modeName(row.mode), row.difficulty, `${row.duration}s`, format(row.wpm), `${format(row.accuracy)}%`, row.mistakes]) {
      const td = document.createElement('td'); td.textContent = text; tr.append(td);
    }
    return tr;
  }));
  const rows = sessionStore.getKeyStats(filters);
  renderKeyboard('#stats-keyboard', rows, currentLayout);
  $('#stats-weak').textContent = weakText(rows);
  if ($('#stats-layout-label')) $('#stats-layout-label').textContent = (KEYBOARD_LAYOUTS[currentLayout] || KEYBOARD_LAYOUTS.qwerty).name;

  if (chart) { chart.destroy(); chart = null; }
  $('#chart-wrap').hidden = !history.length || !window.Chart;
  $('#chart-empty').hidden = history.length > 0 && !!window.Chart;
  $('#chart-empty').textContent = !history.length ? 'Complete a test to see your WPM progress here.' : 'Chart unavailable. Your exact results are available in the table below.';
  if (!history.length || !window.Chart) return;

  const points = sessionStore.getProgress(filters);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
  chart = new Chart($('#progress-chart'), { type: 'line', data: {
    labels: points.map(point => new Date(point.timestamp).toLocaleString()),
    datasets: [{ label: 'WPM', data: points.map(point => point.wpm), borderColor: color, backgroundColor: '#ffe66d', pointRadius: 4, pointBorderWidth: 2, borderWidth: 2, tension: 0 }],
  }, options: { responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: context => {
      const point = points[context.dataIndex]; return `${format(point.accuracy)}% accuracy · ${modeName(point.mode)} · ${point.difficulty} · ${point.duration}s`;
    } } } }, scales: { x: { ticks: { color, maxTicksLimit: 5 }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color }, title: { display: true, text: 'Words per minute', color } } } } });
}

function applyKeys(text) {
  for (const key of text) { engine.handleKey(key); if (engine.status === 'finished') break; }
  renderTyping();
}

// Multiplayer Communications & Logic
function initMultiplayerChannel(roomId) {
  if (multiplayer.channel) {
    try { multiplayer.channel.close(); } catch {}
  }
  const channelName = 'type_e_room_' + roomId;
  if (typeof BroadcastChannel !== 'undefined') {
    multiplayer.channel = new BroadcastChannel(channelName);
    multiplayer.channel.onmessage = event => handleMultiplayerMessage(event.data);
  }
  initWebSocket(roomId);
}

function initWebSocket(roomId) {
  if (typeof WebSocket === 'undefined') return;
  try {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = location.host || 'localhost:8080';
    const wsUrl = `${protocol}//${host}`;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      multiplayer.wsConnected = true;
      ws.send(JSON.stringify({
        type: multiplayer.isHost ? 'CREATE_ROOM' : 'JOIN_ROOM',
        roomId,
        player: multiplayer.localPlayer
      }));
    };
    ws.onmessage = evt => {
      try {
        const msg = JSON.parse(evt.data);
        handleMultiplayerMessage(msg);
      } catch {}
    };
    ws.onerror = () => { multiplayer.wsConnected = false; };
    ws.onclose = () => { multiplayer.wsConnected = false; };
    wsClient = ws;
  } catch {
    multiplayer.wsConnected = false;
  }
}

window.addEventListener('storage', event => {
  if (!multiplayer.channel && multiplayer.roomId && event.key === 'type_e_room_' + multiplayer.roomId && event.newValue) {
    try {
      const msg = JSON.parse(event.newValue);
      if (msg.senderId !== multiplayer.localPlayer.id) handleMultiplayerMessage(msg);
    } catch {}
  }
});

function broadcastMultiplayer(msg) {
  msg.senderId = multiplayer.localPlayer.id;
  msg.timestamp = Date.now();
  if (wsClient && wsClient.readyState === 1) {
    try { wsClient.send(JSON.stringify(msg)); } catch {}
  }
  if (multiplayer.channel) {
    try { multiplayer.channel.postMessage(msg); return; } catch {}
  }
  try {
    localStorage.setItem('type_e_room_' + multiplayer.roomId, JSON.stringify(msg));
  } catch {}
}

function handleMultiplayerMessage(msg) {
  if (!msg || !multiplayer.roomId) return;
  switch (msg.type) {
    case 'JOIN_REQUEST': {
      if (multiplayer.isHost) {
        const existing = multiplayer.players.get(msg.player.id);
        if (!existing) {
          if (multiplayer.players.size >= mpCarIds.length) return;
          const index = multiplayer.players.size;
          msg.player.carId = mpCarIds[index % mpCarIds.length];
          msg.player.color = mpColors[index % mpColors.length];
          multiplayer.players.set(msg.player.id, msg.player);
        }
        broadcastMultiplayer({
          type: 'LOBBY_STATE',
          players: Array.from(multiplayer.players.values()),
          config: {
            difficulty: $('#mp-difficulty').value,
            duration: Number($('#mp-duration').value)
          }
        });
        updateLobbyUI();
      }
      break;
    }
    case 'LOBBY_STATE': {
      multiplayer.players.clear();
      msg.players.forEach(p => {
        multiplayer.players.set(p.id, p);
        if (p.id === multiplayer.localPlayer.id) {
          multiplayer.localPlayer.carId = p.carId;
          multiplayer.localPlayer.color = p.color;
        }
      });
      updateLobbyUI();
      break;
    }
    case 'START_COUNTDOWN': {
      startCountdownSequence(msg);
      break;
    }
    case 'PROGRESS': {
      const p = multiplayer.players.get(msg.playerId);
      if (p) {
        p.progress = msg.progress;
        p.wpm = msg.wpm;
      }
      break;
    }
    case 'FINISH': {
      recordMultiplayerResult(msg);
      break;
    }
    case 'REMATCH': {
      if (page === 'results' || page === 'typing') {
        const diff = $('#mp-difficulty').value;
        const dur = Number($('#mp-duration').value);
        const prompt = Zenith.PROMPTS[diff] || Zenith.PROMPTS.medium;
        startCountdownSequence({ config: { difficulty: diff, duration: dur }, prompt });
      }
      break;
    }
    case 'LEAVE': {
      multiplayer.players.delete(msg.playerId);
      updateLobbyUI();
      break;
    }
  }
}

function updateLobbyUI() {
  $('#mp-setup-view').hidden = true;
  $('#mp-lobby').hidden = false;
  $('#lobby-room-id').textContent = multiplayer.roomId;
  $('#lobby-count').textContent = multiplayer.players.size;
  const list = $('#lobby-racers-list');
  list.replaceChildren(...Array.from(multiplayer.players.values()).map(p => {
    const card = document.createElement('div');
    card.className = 'racer-card';
    const dot = document.createElement('span');
    dot.className = 'racer-color-dot';
    dot.style.backgroundColor = p.color;
    const name = document.createElement('strong');
    name.textContent = p.name + (p.id === multiplayer.localPlayer.id ? ' (You)' : '');
    card.append(dot, name);
    return card;
  }));

  const startBtn = $('#btn-start-multiplayer-race');
  if (multiplayer.isHost) {
    startBtn.hidden = false;
    $('#lobby-instructions').textContent = 'You are the host. Open the invite in another tab or device to add a rival.';
  } else {
    startBtn.hidden = true;
    $('#lobby-instructions').textContent = multiplayer.players.size > 1 ? 'Connected. Waiting for the host to start.' : 'Waiting for the host to start.';
  }
}

function createRoom() {
  const nick = $('#host-nickname').value.trim() || 'SpeedRacer';
  const roomId = 'TE-' + Math.floor(1000 + Math.random() * 9000);
  multiplayer.roomId = roomId;
  multiplayer.isHost = true;
  multiplayer.active = true;
  multiplayer.results = [];
  multiplayer.localPlayer.name = nick;
  multiplayer.localPlayer.carId = mpCarIds[0];
  multiplayer.localPlayer.color = mpColors[0];
  multiplayer.players.clear();
  multiplayer.players.set(multiplayer.localPlayer.id, multiplayer.localPlayer);

  initMultiplayerChannel(roomId);
  updateLobbyUI();
}

function joinRoom(inputRoomId) {
  let roomId = (inputRoomId || $('#join-room-input').value).trim();
  if (!roomId) {
    $('#join-error').textContent = 'Please enter a Room ID or paste an invite link.';
    return;
  }
  if (roomId.includes('room=')) {
    try {
      const url = new URL(roomId, window.location.origin);
      roomId = url.searchParams.get('room') || roomId.split('room=')[1].split('&')[0];
    } catch {
      roomId = roomId.split('room=')[1].split('&')[0];
    }
  }
  roomId = roomId.toUpperCase();
  const nick = $('#join-nickname').value.trim() || 'TurboRacer';
  $('#join-error').textContent = '';

  multiplayer.roomId = roomId;
  multiplayer.isHost = false;
  multiplayer.active = true;
  multiplayer.results = [];
  multiplayer.localPlayer.name = nick;
  multiplayer.players.clear();
  multiplayer.players.set(multiplayer.localPlayer.id, multiplayer.localPlayer);

  initMultiplayerChannel(roomId);
  updateLobbyUI();

  broadcastMultiplayer({
    type: 'JOIN_REQUEST',
    player: multiplayer.localPlayer
  });
}

function leaveRoom() {
  if (multiplayer.roomId) {
    broadcastMultiplayer({ type: 'LEAVE', playerId: multiplayer.localPlayer.id });
    if (multiplayer.channel) {
      try { multiplayer.channel.close(); } catch {}
    }
    if (wsClient) {
      try { wsClient.close(); } catch {}
      wsClient = null;
    }
  }
  multiplayer.active = false;
  multiplayer.channel = null;
  multiplayer.roomId = null;
  multiplayer.players.clear();
  $('#mp-lobby').hidden = true;
  $('#mp-setup-view').hidden = false;
  $('#join-room-input').value = '';
}

function startCountdownSequence(configMsg) {
  activeSession = true;
  result = null;
  drillContext = null;
  hideMultiplayerCars();
  multiplayer.players.forEach(p => {
    if (p.id !== multiplayer.localPlayer.id) {
      const car = $(`#${p.carId}`);
      if (car) {
        car.style.display = 'block';
        updateRacerCar(car, 0);
      }
    }
  });

  go('typing');
  try {
    engine.configure({
      difficulty: configMsg.config.difficulty || 'medium',
      duration: Number(configMsg.config.duration || 60),
      customText: configMsg.prompt || null,
      mode: 'test'
    });
    resetRendering();
    renderPracticeContext();
    renderTyping();

    const overlay = $('#race-countdown-overlay');
    const numEl = $('#countdown-number');
    const txtEl = $('#countdown-text');
    const input = $('#typing-input');
    if (input) input.disabled = true;

    if (overlay && numEl) {
      overlay.hidden = false;
      let count = 3;
      numEl.textContent = count;
      if (txtEl) txtEl.textContent = 'GET READY';
      playCountdownBeep(false);

      if (multiplayer.countdownTimer) clearInterval(multiplayer.countdownTimer);
      multiplayer.countdownTimer = setInterval(() => {
        count--;
        if (count > 0) {
          numEl.textContent = count;
          playCountdownBeep(false);
        } else if (count === 0) {
          numEl.textContent = 'GO!';
          if (txtEl) txtEl.textContent = 'FLOOR IT!';
          playCountdownBeep(true);
        } else {
          clearInterval(multiplayer.countdownTimer);
          multiplayer.countdownTimer = null;
          overlay.hidden = true;
          if (input) {
            input.disabled = false;
            input.focus();
          }
        }
      }, 700);
    } else {
      if (input) {
        input.disabled = false;
        input.focus();
      }
    }
  } catch (e) {
    console.error(e);
  }
}

function copyRoomId() {
  if (!multiplayer.roomId) return;
  copyToClipboard(multiplayer.roomId, 'Room ID copied to clipboard!');
}

function copyInviteLink() {
  if (!multiplayer.roomId) return;
  const url = `${window.location.origin}${window.location.pathname}#multiplayer?room=${multiplayer.roomId}`;
  copyToClipboard(url, 'Invite link copied to clipboard! Open it in another tab of this browser.');
}

function copyToClipboard(text, successMessage) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      $('#share-feedback').textContent = successMessage;
      setTimeout(() => { if ($('#share-feedback')) $('#share-feedback').textContent = ''; }, 3000);
    }).catch(() => fallbackCopy(text, successMessage));
  } else {
    fallbackCopy(text, successMessage);
  }
}

function fallbackCopy(text, successMessage) {
  const input = document.createElement('textarea');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  try {
    document.execCommand('copy');
    $('#share-feedback').textContent = successMessage;
    setTimeout(() => { if ($('#share-feedback')) $('#share-feedback').textContent = ''; }, 3000);
  } catch {
    $('#share-feedback').textContent = `Copy: ${text}`;
  } finally {
    input.remove();
  }
}

function checkUrlForInvite() {
  const fullSearch = window.location.search || '';
  const fullHash = window.location.hash || '';
  let roomId = null;
  if (fullSearch.includes('room=')) {
    roomId = new URLSearchParams(fullSearch).get('room');
  } else if (fullHash.includes('room=')) {
    const qPart = fullHash.slice(fullHash.indexOf('?'));
    roomId = new URLSearchParams(qPart).get('room');
  }
  if (roomId && !multiplayer.roomId) {
    $('#join-room-input').value = roomId;
    if (multiplayer.roomId !== roomId && location.hash.startsWith('#multiplayer')) joinRoom(roomId);
  }
}

// Syncing card options in Home view with underlying selects
let syncingCard = false;
function syncCardOption(target, val, fromSelect = false) {
  if (syncingCard) return;
  syncingCard = true;
  try {
    if (!fromSelect) {
      const selectMap = {
        difficulty: '#difficulty',
        duration: '#duration',
        source: '#source',
        theme: '#home-theme'
      };
      const sel = selectMap[target] ? $(selectMap[target]) : null;
      if (target === 'layout') document.documentElement.dataset.layout = val;
      if (sel && sel.value !== String(val)) {
        sel.value = String(val);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    $$(`.option-pill[data-target="${target}"]`).forEach(p => {
      const radio = p.querySelector('input');
      if (radio) radio.checked = p.dataset.val === String(val);
      if (p.dataset.val === String(val)) p.classList.add('selected');
      else p.classList.remove('selected');
    });
  } finally {
    syncingCard = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  let savedTheme = 'neo'; try { savedTheme = localStorage.getItem('zenith-theme') || 'neo'; } catch {}
  theme(savedTheme, false);
  setLayout(currentLayout);

  $$('[data-theme-select]').forEach(select => select.addEventListener('change', () => theme(select.value)));
  $('#mode').addEventListener('change', sourceVisibility);
  $('#source').addEventListener('change', sourceVisibility);

  // Sync select changes to Card pills
  $('#difficulty').addEventListener('change', () => syncCardOption('difficulty', $('#difficulty').value, true));
  $('#duration').addEventListener('change', () => syncCardOption('duration', $('#duration').value, true));
  $('#source').addEventListener('change', () => syncCardOption('source', $('#source').value, true));

  $$('.option-pill input').forEach(input => input.addEventListener('change', () => {
    const { target, val } = input.closest('.option-pill').dataset;
    if (target === 'difficulty' && val === 'custom') {
      syncCardOption('source', 'custom');
      $('#custom-text').focus();
    } else if (target === 'difficulty') {
      syncCardOption('source', 'default');
      syncCardOption(target, val);
    } else {
      syncCardOption(target, val);
    }
    if (target === 'source' || val === 'custom') {
      $$('.option-pill[data-target="difficulty"]').forEach(pill => {
        const selected = pill.dataset.val === ($('#source').value === 'custom' ? 'custom' : $('#difficulty').value);
        pill.classList.toggle('selected', selected);
        const radio = pill.querySelector('input');
        if (radio) radio.checked = selected;
      });
    }
  }));

  $('#session-form').addEventListener('submit', event => {
    event.preventDefault();
    begin($('#mode').value === 'practice');
  });

  $$('[data-practice]').forEach(button => button.addEventListener('click', startPractice));
  $('#restart').addEventListener('click', () => {
    result = null;
    resetRendering();
    engine.restart();
    renderTyping();
    $('#typing-input').focus();
  });
  $('#end-test').addEventListener('click', () => {
    const state = engine.getState();
    if (state.status !== 'finished') result = { state, saved: false, drill: drillContext, ghost: sessionStore.getGhost(state.duration, state.mode) };
    engine.restart();
    activeSession = false;
    go('results');
  });
  $('#try-again').addEventListener('click', () => {
    resetRendering();
    engine.restart();
    result = null;
    activeSession = true;
    go('typing');
  });
  $('#history-filter').addEventListener('change', renderStats);
  $('#export-csv').addEventListener('click', exportHistory);

  // Backup & Restore handlers
  $('#btn-export-json')?.addEventListener('click', exportJsonBackup);
  $('#input-restore-json')?.addEventListener('change', handleJsonRestore);

  // Rematch button in results
  $('#btn-rematch')?.addEventListener('click', () => {
    broadcastMultiplayer({ type: 'REMATCH' });
    const diff = $('#mp-difficulty').value;
    const dur = Number($('#mp-duration').value);
    const prompt = Zenith.PROMPTS[diff] || Zenith.PROMPTS.medium;
    startCountdownSequence({ config: { difficulty: diff, duration: dur }, prompt });
  });

  function editCustomPassage() {
    syncCardOption('source', 'custom');
    go('home');
    setTimeout(() => $('#custom-text').focus(), 0);
  }
  $('#btn-status-ready').addEventListener('click', () => $('#typing-input').focus());
  $$('#live-difficulty-group .ctrl-pill').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.diff === 'custom') return editCustomPassage();
    syncCardOption('difficulty', button.dataset.diff);
    syncCardOption('source', 'default');
    begin(engine.mode === 'practice');
  }));
  $$('#live-duration-group .ctrl-pill').forEach(button => button.addEventListener('click', () => {
    syncCardOption('duration', button.dataset.time);
    engine.configure({ difficulty: engine.difficulty, customText: engine.customText, mode: engine.mode, duration: Number(button.dataset.time) });
    resetRendering();
    renderTyping();
    $('#typing-input').focus();
  }));
  const alternates = {
    easy: 'a small red car rolls past the park and turns onto the quiet road',
    medium: 'The circuit opens at sunrise. Find a steady rhythm through the first turn.',
    hard: 'Lap 3: enter Sector_B at 09:42, hit 98% accuracy, then log {split: 12.75}.',
  };
  $('#btn-new-prompt').addEventListener('click', () => {
    if (engine.mode === 'practice') return startPractice();
    if (engine.mode === 'programming') return begin(false);
    const difficulty = engine.difficulty;
    const next = engine.prompt.join('') === alternates[difficulty] ? Zenith.PROMPTS[difficulty] : alternates[difficulty];
    syncCardOption('source', 'default');
    engine.configure({difficulty, duration: engine.duration, customText: next, mode: 'test'});
    resetRendering(); renderTyping(); $('#typing-input').focus();
  });
  $('#btn-custom-passage').addEventListener('click', editCustomPassage);
  $('#tab-race-track').addEventListener('click', event => {
    event.preventDefault();
    if (engine.mode === 'practice' || engine.mode === 'programming') {
      syncCardOption('source', 'default');
      begin(false);
    } else {
      $('#typing-input').focus();
    }
  });

  // Code Mode Tab
  $('#tab-code-mode')?.addEventListener('click', () => {
    syncCardOption('source', 'programming');
    begin(false);
  });

  // Code Symbols practice
  $('#btn-practice-symbols')?.addEventListener('click', () => {
    begin(true, true);
  });

  $('#btn-sprint-mode').addEventListener('click', () => {
    if (multiplayer.active) leaveRoom();
    begin(false);
  });

  // Sound Toggle & Volume Controls
  const updateSoundUI = () => {
    const btn = $('#btn-sound-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', String(soundEnabled));
      btn.textContent = soundEnabled ? '🔊 SOUND: ON' : '🔈 SOUND: OFF';
    }
    const chk = $('#settings-sound-chk');
    if (chk) chk.checked = soundEnabled;
  };
  updateSoundUI();

  $('#btn-sound-toggle')?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    try { localStorage.setItem('zenith-sound', String(soundEnabled)); } catch {}
    updateSoundUI();
  });
  $('#settings-sound-chk')?.addEventListener('change', e => {
    soundEnabled = e.target.checked;
    try { localStorage.setItem('zenith-sound', String(soundEnabled)); } catch {}
    updateSoundUI();
  });
  $('#settings-volume')?.addEventListener('input', e => {
    soundVolume = Number(e.target.value) / 100;
    try { localStorage.setItem('zenith-volume', e.target.value); } catch {}
  });

  // Ghost Toggle
  const updateGhostUI = () => {
    const btn = $('#btn-ghost-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', String(ghostEnabled));
      btn.textContent = ghostEnabled ? '👻 GHOST: ON' : '👻 GHOST: OFF';
    }
    const chk = $('#settings-ghost-chk');
    if (chk) chk.checked = ghostEnabled;
  };
  updateGhostUI();

  $('#btn-ghost-toggle')?.addEventListener('click', () => {
    ghostEnabled = !ghostEnabled;
    try { localStorage.setItem('zenith-ghost', String(ghostEnabled)); } catch {}
    updateGhostUI();
    if (activeSession) renderTyping();
  });
  $('#settings-ghost-chk')?.addEventListener('change', e => {
    ghostEnabled = e.target.checked;
    try { localStorage.setItem('zenith-ghost', String(ghostEnabled)); } catch {}
    updateGhostUI();
    if (activeSession) renderTyping();
  });

  // Keyboard Layout Listeners
  $('#racer-layout-select')?.addEventListener('change', e => setLayout(e.target.value));
  $('#settings-layout')?.addEventListener('change', e => setLayout(e.target.value));

  // Reduced Motion
  $('#settings-motion-chk')?.addEventListener('change', e => {
    document.documentElement.dataset.reducedMotion = String(e.target.checked);
    try { localStorage.setItem('zenith-motion', String(e.target.checked)); } catch {}
  });
  try {
    if (localStorage.getItem('zenith-motion') === 'true') {
      document.documentElement.dataset.reducedMotion = 'true';
      if ($('#settings-motion-chk')) $('#settings-motion-chk').checked = true;
    }
  } catch {}

  // Typing input handlers
  $('#typing-input').addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      event.preventDefault();
      playKeyClick();
      engine.handleKey('Tab');
      renderTyping();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.key === 'Process' || event.key === 'Unidentified') return;
    event.preventDefault();
    const stBefore = engine.getState();
    const expected = stBefore.characters[stBefore.position]?.expected;
    if (event.key === 'Backspace' || event.key === expected) {
      playKeyClick();
    } else {
      playErrorBuzz();
    }
    engine.handleKey(event.key);
    renderTyping();
  });

  $('#typing-input').addEventListener('beforeinput', event => {
    if (event.isComposing) return;
    event.preventDefault();
    if (event.inputType === 'deleteContentBackward') { engine.handleKey('Backspace'); renderTyping(); }
    else if (event.inputType === 'insertText' && event.data) applyKeys(event.data);
    else if (['insertLineBreak','insertParagraph'].includes(event.inputType)) applyKeys('\n');
  });
  $('#typing-input').addEventListener('compositionstart', () => { composing = true; });
  $('#typing-input').addEventListener('compositionend', event => { composing = false; if (activeSession && event.data) applyKeys(event.data); });
  $('#typing-input').addEventListener('paste', event => event.preventDefault());
  $('#typing-input').addEventListener('drop', event => event.preventDefault());
  $('#typing-input').addEventListener('input', event => { if (!event.isComposing) $('#typing-input').value = engine.getState().input; });

  // Multiplayer Event Listeners & Modal
  $('#btn-head-to-head')?.addEventListener('click', () => {
    go('multiplayer');
  });

  $('#btn-create-room')?.addEventListener('click', createRoom);
  $('#btn-join-room')?.addEventListener('click', () => joinRoom());
  $('#btn-copy-id')?.addEventListener('click', copyRoomId);
  $('#btn-copy-link')?.addEventListener('click', copyInviteLink);
  $('#btn-leave-room')?.addEventListener('click', leaveRoom);
  $('#btn-start-multiplayer-race')?.addEventListener('click', () => {
    if (!multiplayer.isHost) return;
    const diff = $('#mp-difficulty').value;
    const dur = Number($('#mp-duration').value);
    const prompt = Zenith.PROMPTS[diff] || Zenith.PROMPTS.medium;
    const startMsg = {
      type: 'START_COUNTDOWN',
      config: { difficulty: diff, duration: dur },
      prompt
    };
    broadcastMultiplayer(startMsg);
    startCountdownSequence(startMsg);
  });

  window.addEventListener('hashchange', () => {
    route();
    checkUrlForInvite();
  });
  window.addEventListener('pagehide', () => { stopTimer(); if (chart) { chart.destroy(); chart = null; } });
  window.addEventListener('pageshow', event => { if (event.persisted) route(); });
  sourceVisibility();
  route();
  checkUrlForInvite();
}, { once: true });
