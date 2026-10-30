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
let soundEnabled = false;

// Audio click synthesis for sound toggle
let audioCtx = null;
function playKeyClick() {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300 + Math.random() * 200, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.04);
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

function stopTimer() { if (timer !== null) clearInterval(timer); timer = null; }
function resetRendering() { renderedPrompt = null; renderedInput = null; renderedAttempts = -1; composing = false; }
const engine = new Zenith.TypingEngine({ difficulty: 'medium', onComplete: state => {
  const previousBest = sessionStore.getPersonalBests()[state.duration];
  sessionStore.saveSession(state);
  result = { state, saved: true, personalBest: state.wpm > previousBest, drill: drillContext };
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
const modeName = mode => ({ test: 'Race Track', custom: 'Custom Text', practice: 'Practice Drill' })[mode];
const keyName = key => key === ' ' ? 'Space' : key === '\n' ? 'Enter' : key;
const format = number => number.toFixed(1);
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
  else $(`#${page}-title`)?.focus({ preventScroll: true });
}

function sourceVisibility() {
  const practice = $('#mode').value === 'practice';
  $('#source').disabled = practice;
  $('#custom-wrap').hidden = practice || $('#source').value !== 'custom';
  $('#practice-note').hidden = !practice;
}

function begin(practice = false) {
  const current = activeSession ? engine.getState() : null;
  const records = sessionStore.getHistory();
  if (current && current.status !== 'finished') records.push(current);
  const keyStats = ZenithAnalytics.keyAnalytics(records);
  const drill = practice ? practiceGenerator.generate(keyStats) : null;
  try {
    engine.configure({
      difficulty: $('#difficulty').value,
      duration: Number($('#duration').value),
      customText: drill ? drill.text : $('#source').value === 'custom' ? $('#custom-text').value : null,
      mode: drill ? 'practice' : $('#source').value === 'custom' ? 'custom' : 'test'
    });
    $('#config-error').textContent = '';
    $('#custom-text').removeAttribute('aria-invalid');
    result = null;
    drillContext = drill ? { ...drill, baseline: keyStats.filter(row => drill.targetKeys.includes(row.key)) } : null;
    multiplayer.active = false;
    hideMultiplayerCars();
    renderPracticeContext();
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

// FULL QWERTY ERROR HEATMAP KEYBOARD (MATCHING IMAGE 1)
function renderKeyboard(target, stats = []) {
  const map = new Map(stats.map(row => [row.key.toLowerCase(), row]));
  const rows = [
    ['`','1','2','3','4','5','6','7','8','9','0','-','=','BACKSPACE'],
    ['TAB','Q','W','E','R','T','Y','U','I','O','P','[',']','\\'],
    ['CAPS','A','S','D','F','G','H','J','K','L',';',"'",'ENTER'],
    ['SHIFT','Z','X','C','V','B','N','M',',','.','/','SHIFT']
  ];
  const fragment = document.createDocumentFragment();
  rows.forEach((row, rowIndex) => {
    const div = document.createElement('div');
    div.className = 'keyboard-row';
    row.forEach(keyStr => {
      const lower = keyStr.toLowerCase();
      const stat = map.get(lower);
      const keyEl = document.createElement('div');
      keyEl.className = 'key';
      keyEl.textContent = keyStr;
      if (['BACKSPACE', 'TAB', 'CAPS', 'ENTER', 'SHIFT'].includes(keyStr)) {
        keyEl.classList.add('wide');
      }
      if (stat && stat.attempts > 0) {
        if (stat.attempts < 3) keyEl.classList.add('sample');
        if (stat.errorRate > 0.15) keyEl.classList.add('high');
        if (stat.errorRate > 0.50) keyEl.classList.add('critical');
        else if (stat.errorRate >= 0.05) keyEl.classList.add('mid');
        else keyEl.classList.add('low');
        keyEl.title = `${keyStr} · ${Math.round(stat.errorRate * 100)}% error rate · ${stat.attempts} attempts`;
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
    const distance = length * (Math.max(0, Math.min(100, progressPercent)) / 100);
    const point = routePath.getPointAtLength(distance);
    const before = routePath.getPointAtLength(Math.max(0, distance - 1));
    const after = routePath.getPointAtLength(Math.min(length, distance + 1));
    const angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
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

function renderTyping() {
  const state = engine.getState();
  const progress = state.position / state.characters.length * 100;
  $('#racer').style.left = `${progress}%`;
  updateRacerCar($('#racer'), progress, $('#car-tag-you'), `YOU: ${Math.round(state.wpm)} WPM`);

  // Update Telemetry & Status matching Image 1
  $('#live-wpm').textContent = format(state.wpm);
  $('#live-accuracy').textContent = `${format(state.accuracy)}%`;
  $('#live-time').textContent = `${Math.ceil(state.remaining)}s`;
  $('#live-mistakes').textContent = state.mistakes;
  if ($('#stat-total-attempted')) $('#stat-total-attempted').textContent = state.totalKeystrokes;
  if ($('#stat-correct-chars')) $('#stat-correct-chars').textContent = state.correctCharacters;
  if ($('#player-percent-label')) $('#player-percent-label').textContent = `${Math.round(progress)}% Done`;
  if ($('#player-wpm-label')) $('#player-wpm-label').textContent = `${format(state.wpm)} WPM`;
  if ($('#btn-status-ready')) {
    $('#btn-status-ready').textContent = state.status === 'ready' ? '🏁 READY TO RACE' : state.status === 'finished' ? '🏁 FINISHED' : '⚡ RACING';
  }

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

    let telemetryStr = `YOU · ${format(state.wpm)} WPM`;
    multiplayer.players.forEach(p => {
      if (p.id !== multiplayer.localPlayer.id) {
        const carEl = $(`#${p.carId}`);
        updateRacerCar(carEl, p.progress || 0, $('#car-tag-ghost'), `${p.name.toUpperCase()}: ${Math.round(p.wpm || 0)} WPM`);
        if ($('#opponent-name-label')) $('#opponent-name-label').textContent = p.name.toUpperCase();
        if ($('#ghost-percent-label')) $('#ghost-percent-label').textContent = `${Math.round(p.progress || 0)}% Done`;
        if ($('#ghost-wpm-label')) $('#ghost-wpm-label').textContent = `${p.wpm || '0.0'} WPM`;
        telemetryStr += ` · ${p.name.toUpperCase()} · ${p.wpm || '0.0'} WPM`;
      }
    });
    $('#race-telemetry').textContent = telemetryStr;
  } else {
    $('#race-telemetry').textContent = `YOU · ${format(state.wpm)} WPM`;
    // Simulated ghost car based on PB or standard pace
    const ghostProgress = Math.min(100, progress * 0.92);
    const ghostWpm = format(Math.max(0, state.wpm * 0.95));
    updateRacerCar($('#racer-p2'), ghostProgress, $('#car-tag-ghost'), `GHOST: ${Math.round(ghostWpm)} WPM`);
    if ($('#ghost-percent-label')) $('#ghost-percent-label').textContent = `${Math.round(ghostProgress)}% Done`;
    if ($('#ghost-wpm-label')) $('#ghost-wpm-label').textContent = `${ghostWpm} WPM`;
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
      const container = $('#prompt');
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
    renderKeyboard('#live-keyboard', state.perKey);
    $('#live-weak').textContent = weakText(keyAnalytics);
    // Render weak keys badges from Image 1
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
        badgesWrap.innerHTML = '<span class="key-badge" style="background:#85d7a0;color:#111">CLEAN</span>';
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
  $('#result-details').textContent = `${modeName(state.mode)} · ${state.difficulty} · ${state.duration}s mode · ${format(state.elapsed)}s elapsed · ${state.correctCharacters} correct characters`;
  $('#result-weak').textContent = weakText(ZenithAnalytics.keyAnalytics([state]));
  $('#save-status').textContent = saved ? sessionStore.storageAvailable ? 'Saved on this device. Your next session starts here.' : 'Saved for this visit only. Browser storage is unavailable.' : 'Only completed and timed-out sessions enter your history.';
  $('#personal-best-achievement').hidden = !saved || !result.personalBest;
  $('#personal-best-achievement').textContent = saved && result.personalBest ? `New ${state.duration}s personal best · ${format(state.wpm)} WPM · all modes` : '';
  $('#practice-feedback').hidden = state.mode !== 'practice';
  $('#practice-feedback').textContent = state.mode === 'practice' ? practiceFeedback(state, result.drill) : '';
  $('#result-practice').textContent = state.mode === 'practice' ? 'New Drill' : 'Practice Weak Keys';

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
    row.innerHTML = `<span>#${i + 1} ${res.name}</span><span>${res.wpm} WPM · ${res.accuracy}% ACC</span>`;
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
  const bests = sessionStore.getPersonalBests();
  $('#personal-bests').replaceChildren(...[30,60,120].map(duration => {
    const div = document.createElement('div'); const strong = document.createElement('strong'); const label = document.createElement('span');
    strong.textContent = format(bests[duration]); label.textContent = `${duration} SECOND BEST`; div.append(strong,label); return div;
  }));
  $('#accuracy-summary').textContent = history.length ? `${history.length} sessions · Average accuracy ${format(history.reduce((sum, row) => sum + row.accuracy, 0) / history.length)}% · Latest ${format(history.at(-1).accuracy)}%` : 'Your first completed session is the start of your story.';
  $('#history-empty').textContent = history.length ? '' : 'No completed sessions yet for this mode. Start a test or try a practice drill.';
  $('#history-body').replaceChildren(...history.slice().reverse().map(row => {
    const tr = document.createElement('tr');
    for (const text of [new Date(row.date).toLocaleString(), modeName(row.mode), row.difficulty, `${row.duration}s`, format(row.wpm), `${format(row.accuracy)}%`, row.mistakes]) {
      const td = document.createElement('td'); td.textContent = text; tr.append(td);
    }
    return tr;
  }));
  const rows = sessionStore.getKeyStats(filters); renderKeyboard('#stats-keyboard', rows);
  $('#stats-weak').textContent = weakText(rows);
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
  window.addEventListener('storage', event => {
    if (event.key === channelName && event.newValue) {
      try {
        const msg = JSON.parse(event.newValue);
        if (msg.senderId !== multiplayer.localPlayer.id) handleMultiplayerMessage(msg);
      } catch {}
    }
  });
}

function broadcastMultiplayer(msg) {
  msg.senderId = multiplayer.localPlayer.id;
  msg.timestamp = Date.now();
  if (multiplayer.channel) {
    try { multiplayer.channel.postMessage(msg); } catch {}
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
      $('#mp-modal-backdrop').hidden = true;
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
    card.innerHTML = `
      <div class="racer-color-dot" style="background:${p.color}"></div>
      <div class="racer-info">
        <strong>${p.name}${p.id === multiplayer.localPlayer.id ? ' (You)' : ''}</strong>
        <span>Car: ${p.carId.toUpperCase()}</span>
      </div>
    `;
    return card;
  }));

  const startBtn = $('#btn-start-multiplayer-race');
  if (multiplayer.isHost) {
    startBtn.hidden = false;
    $('#lobby-instructions').textContent = 'You are the host. Share the invite link or Room ID, then click Start Race when ready.';
  } else {
    startBtn.hidden = true;
    $('#lobby-instructions').textContent = 'Connected to room! Waiting for the host to start the race...';
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
  }
  multiplayer.active = false;
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
    $('#typing-input').focus();
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
  copyToClipboard(url, 'Invite link copied to clipboard! Send it to your friend.');
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
  if (roomId) {
    $('#join-room-input').value = roomId;
    $('#mp-modal-backdrop').hidden = false;
    joinRoom(roomId);
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
      const sel = $(selectMap[target]);
      if (sel && sel.value !== String(val)) {
        sel.value = String(val);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    $$(`.option-pill[data-target="${target}"]`).forEach(p => {
      if (p.dataset.val === String(val)) p.classList.add('selected');
      else p.classList.remove('selected');
    });
  } finally {
    syncingCard = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  let savedTheme = 'neo'; try { savedTheme = localStorage.getItem('zenith-theme') || 'neo'; } catch { /* default */ }
  theme(savedTheme, false);
  $$('[data-theme-select]').forEach(select => select.addEventListener('change', () => theme(select.value)));
  $('#mode').addEventListener('change', sourceVisibility);
  $('#source').addEventListener('change', sourceVisibility);

  // Sync select changes to Card pills
  $('#difficulty').addEventListener('change', () => syncCardOption('difficulty', $('#difficulty').value, true));
  $('#duration').addEventListener('change', () => syncCardOption('duration', $('#duration').value, true));
  $('#source').addEventListener('change', () => syncCardOption('source', $('#source').value, true));

  // Card option click handler
  $$('.option-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const target = pill.dataset.target;
      const val = pill.dataset.val;
      if (target === 'source' && val === 'custom') {
        $('#source').value = 'custom';
        $('#source').dispatchEvent(new Event('change', { bubbles: true }));
        syncCardOption('source', 'custom');
      } else if (target) {
        syncCardOption(target, val);
      }
    });
  });

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
    if (state.status !== 'finished') result = { state, saved: false, drill: drillContext };
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

  // Image 1 Racer Live Controls
  $$('#live-difficulty-group .ctrl-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#live-difficulty-group .ctrl-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const diff = btn.dataset.diff;
      if (diff === 'custom') {
        go('home');
        syncCardOption('source', 'custom');
      } else {
        $('#difficulty').value = diff;
        $('#source').value = 'default';
        engine.configure({ difficulty: diff, duration: Number($('#duration').value), customText: null, mode: 'test' });
        resetRendering();
        engine.restart();
        renderTyping();
        $('#typing-input').focus();
      }
    });
  });

  $$('#live-duration-group .ctrl-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#live-duration-group .ctrl-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const dur = Number(btn.dataset.time);
      $('#duration').value = dur;
      engine.configure({ difficulty: $('#difficulty').value, duration: dur, customText: null, mode: 'test' });
      resetRendering();
      engine.restart();
      renderTyping();
      $('#typing-input').focus();
    });
  });

  $('#btn-new-prompt')?.addEventListener('click', () => {
    const diff = $('#difficulty').value;
    const prompts = Zenith.PROMPTS[diff] || Zenith.PROMPTS.medium;
    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
    engine.configure({ difficulty: diff, duration: Number($('#duration').value), customText: randomPrompt, mode: 'test' });
    resetRendering();
    engine.restart();
    renderTyping();
    $('#typing-input').focus();
  });

  $('#btn-custom-passage')?.addEventListener('click', () => {
    go('home');
    syncCardOption('source', 'custom');
    $('#custom-text').focus();
  });

  // Sound Toggle
  $('#btn-sound-toggle')?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    $('#btn-sound-toggle').textContent = soundEnabled ? '🔊 SOUND: ON' : '🔈 SOUND: OFF';
  });

  // Typing input handlers
  $('#typing-input').addEventListener('keydown', event => {
    playKeyClick();
    if (event.key === 'Enter' && (engine.getState().status === 'ready' || engine.getState().status === 'finished')) {
      event.preventDefault();
      result = null;
      resetRendering();
      engine.restart();
      renderTyping();
      return;
    }
    if (event.key === 'Tab' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.key === 'Process' || event.key === 'Unidentified') return;
    event.preventDefault();
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
    $('#mp-modal-backdrop').hidden = false;
  });
  $('#btn-close-mp-modal')?.addEventListener('click', () => {
    $('#mp-modal-backdrop').hidden = true;
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
    const prompt = Zenith.PROMPTS[diff] ? Zenith.PROMPTS[diff][0] : 'The quick brown fox jumps over the lazy dog.';
    const startMsg = {
      type: 'START_COUNTDOWN',
      config: { difficulty: diff, duration: dur },
      prompt
    };
    broadcastMultiplayer(startMsg);
    $('#mp-modal-backdrop').hidden = true;
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
