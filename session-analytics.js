// Storage and analytics are independent of both the DOM and typing engine.
(function (root) {
  const STORAGE_KEY = 'zenith-phase2-v1';
  const copy = value => JSON.parse(JSON.stringify(value));
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const finite = value => Number.isFinite(value) && value >= 0;
  const character = value => typeof value === 'string' && Array.from(value).length === 1;
  function validKeys(rows) {
    return Array.isArray(rows) && new Set(rows.map(row => row?.key)).size === rows.length && rows.every(row =>
      row && character(row.key) && count(row.attempts) && count(row.errors) && row.errors <= row.attempts &&
      Array.isArray(row.incorrectKeys) && new Set(row.incorrectKeys.map(item => item?.key)).size === row.incorrectKeys.length &&
      row.incorrectKeys.every(item => item && character(item.key) && item.key !== row.key && count(item.count)) &&
      row.incorrectKeys.reduce((sum, item) => sum + item.count, 0) === row.errors);
  }
  function keyAnalytics(sessions, keys = [], minAttempts = 3) {
    if (!Number.isInteger(minAttempts) || minAttempts < 1) throw new RangeError('Minimum attempts must be positive.');
    const totals = new Map(keys.map(key => [key, { key, attempts: 0, errors: 0, wrong: new Map() }]));
    for (const session of sessions) for (const row of session.perKey) {
      const total = totals.get(row.key) ?? { key: row.key, attempts: 0, errors: 0, wrong: new Map() };
      total.attempts += row.attempts;
      total.errors += row.errors;
      for (const wrong of row.incorrectKeys) total.wrong.set(wrong.key, (total.wrong.get(wrong.key) ?? 0) + wrong.count);
      totals.set(row.key, total);
    }
    return Array.from(totals.values(), row => ({
      key: row.key, attempts: row.attempts, errors: row.errors,
      errorRate: row.attempts ? row.errors / row.attempts : 0,
      tested: row.attempts > 0, sufficient: row.attempts >= minAttempts,
      incorrectKeys: Array.from(row.wrong, ([key, count]) => ({ key, count })),
    }));
  }
  function weakestKeys(rows) {
    return rows.filter(row => row.sufficient && row.errors > 0).sort((a, b) =>
      b.errorRate - a.errorRate || b.errors - a.errors || b.attempts - a.attempts || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }
  function validRecord(row) {
    return row && typeof row.sessionId === 'string' && row.sessionId.length > 0 &&
      typeof row.date === 'string' && Number.isFinite(Date.parse(row.date)) &&
      ['test', 'custom', 'practice'].includes(row.mode) && ['easy', 'medium', 'hard'].includes(row.difficulty) &&
      [30, 60, 120].includes(row.duration) && ['completed', 'timeout'].includes(row.finishReason) &&
      finite(row.wpm) && finite(row.accuracy) && row.accuracy <= 100 && count(row.mistakes) &&
      finite(row.elapsed) && row.elapsed <= row.duration && validKeys(row.perKey) &&
      row.perKey.reduce((sum, key) => sum + key.errors, 0) === row.mistakes;
  }
  class SessionStore {
    constructor({ storage, limit = 100, now = () => new Date() } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('History limit must be 1–1000.');
      this.limit = limit;
      this.now = now;
      this.history = [];
      this.bests = { 30: 0, 60: 0, 120: 0 };
      this.storageAvailable = true;
      try { this.storage = storage === undefined ? root.localStorage : storage; }
      catch { this.storage = null; }
      if (!this.storage) this.storageAvailable = false;
      let serialized = null;
      try { serialized = this.storage?.getItem(STORAGE_KEY) ?? null; }
      catch { this.storageAvailable = false; }
      try {
        const saved = JSON.parse(serialized ?? 'null');
        if (saved?.version === 1 && Array.isArray(saved.history)) {
          const unique = new Map();
          for (const record of saved.history) if (validRecord(record)) unique.set(record.sessionId, record);
          this.history = Array.from(unique.values()).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
          for (const duration of [30, 60, 120]) {
            if (finite(saved.bests?.[duration])) this.bests[duration] = saved.bests[duration];
          }
          for (const record of this.history) this.updateBest(record);
          this.history = this.history.slice(-this.limit);
        }
      } catch { /* Missing/corrupt data starts an empty in-memory store. */ }
      this.seen = new Set(this.history.map(record => record.sessionId));
    }
    updateBest(record) {
      this.bests[record.duration] = Math.max(this.bests[record.duration], record.wpm);
    }
    saveSession(state) {
      if (state.status !== 'finished' || this.seen.has(state.sessionId)) return false;
      const record = {
        sessionId: state.sessionId, date: this.now().toISOString(), mode: state.mode,
        difficulty: state.difficulty, duration: state.duration, elapsed: state.elapsed,
        finishReason: state.finishReason, wpm: state.wpm, accuracy: state.accuracy,
        mistakes: state.mistakes, perKey: copy(state.perKey),
      };
      if (!validRecord(record)) throw new TypeError('Invalid completed session.');
      this.seen.add(record.sessionId);
      this.history.push(record);
      this.history.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      this.history = this.history.slice(-this.limit);
      this.updateBest(record);
      try {
        if (!this.storage) throw new Error('Storage unavailable');
        this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, history: this.history, bests: this.bests }));
        this.storageAvailable = true;
      } catch { this.storageAvailable = false; }
      return true;
    }
    getHistory(filters = {}) {
      return copy(this.history.filter(row => ['mode', 'difficulty', 'duration'].every(key =>
        filters[key] === undefined || filters[key] === row[key])));
    }
    getPersonalBests() { return { ...this.bests }; }
    getProgress(filters = {}) {
      return this.getHistory(filters).map(({ sessionId, date, mode, difficulty, duration, wpm, accuracy }) =>
        ({ sessionId, timestamp: Date.parse(date), date, mode, difficulty, duration, wpm, accuracy }));
    }
    getKeyStats({ keys = [], minAttempts = 3, ...filters } = {}) {
      return keyAnalytics(this.getHistory(filters), keys, minAttempts);
    }
    getWeakestKeys(options = {}) { return weakestKeys(this.getKeyStats(options)); }
  }
  const WORDS = 'quiet quick question quiz zebra zero zone zip happy help home hope jump joy just joke kind keep kite know love light little look moon make more music night near nice new open over ocean often paper people place play red river read road sun smile small slow time tree train true under use until up very voice visit view warm water walk word extra example exact six yellow year young yes bright breeze calm clear dance dream fresh friend gentle green soft spring steady story'.split(' ');
  class PracticeGenerator {
    constructor() { this.sequence = 0; }
    generate(rows = []) {
      const weak = weakestKeys(rows).slice(0, 5);
      const sequence = this.sequence++;
      const targets = weak.map(row => row.key);
      const selected = Array.from({ length: 16 }, (_, index) => {
        const key = targets.length ? targets[index % targets.length] : null;
        const words = key === null ? WORDS : WORDS.filter(word => word.includes(key.toLowerCase()));
        if (words.length) {
          const word = words[(sequence + index) % words.length];
          return key && key !== key.toLowerCase() ? word.replaceAll(key.toLowerCase(), key) : word;
        }
        // Rule-based readable context for punctuation, digits, whitespace and Unicode.
        const contexts = ['type', 'read', 'write', 'check'];
        return `${contexts[(sequence + index) % contexts.length]}${key} then${key} rest`;
      });
      return { text: selected.join(' '), targetKeys: targets, fallback: targets.length === 0 };
    }
  }
  const api = { SessionStore, PracticeGenerator, keyAnalytics, weakestKeys, STORAGE_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZenithAnalytics = Object.freeze(api);
})(globalThis);
