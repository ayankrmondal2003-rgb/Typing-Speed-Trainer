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
    const validModes = ['test', 'custom', 'practice', 'programming'];
    const validDiffs = ['easy', 'medium', 'hard', 'beginner', 'intermediate', 'advanced'];
    return row && typeof row.sessionId === 'string' && row.sessionId.length > 0 &&
      typeof row.date === 'string' && Number.isFinite(Date.parse(row.date)) &&
      validModes.includes(row.mode) && validDiffs.includes(row.difficulty) &&
      [30, 60, 120].includes(row.duration) && ['completed', 'timeout'].includes(row.finishReason) &&
      finite(row.wpm) && finite(row.accuracy) && row.accuracy <= 100 && count(row.mistakes) &&
      finite(row.elapsed) && row.elapsed <= row.duration && validKeys(row.perKey) &&
      row.perKey.reduce((sum, key) => sum + key.errors, 0) === row.mistakes &&
      (!row.timeline || Array.isArray(row.timeline));
  }
  class SessionStore {
    constructor({ storage, limit = 100, now = () => new Date() } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('History limit must be 1–1000.');
      this.limit = limit;
      this.now = now;
      this.history = [];
      this.bests = { 30: 0, 60: 0, 120: 0 };
      this.programmingBests = { 30: 0, 60: 0, 120: 0 };
      this.ghosts = {};
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
            if (finite(saved.programmingBests?.[duration])) this.programmingBests[duration] = saved.programmingBests[duration];
          }
          if (saved.ghosts && typeof saved.ghosts === 'object') {
            this.ghosts = saved.ghosts;
          }
          for (const record of this.history) this.updateBest(record);
          this.history = this.history.slice(-this.limit);
        }
      } catch { /* Missing/corrupt data starts an empty in-memory store. */ }
      this.seen = new Set(this.history.map(record => record.sessionId));
    }
    updateBest(record) {
      if (record.mode === 'programming') {
        this.programmingBests[record.duration] = Math.max(this.programmingBests[record.duration] || 0, record.wpm);
      } else {
        this.bests[record.duration] = Math.max(this.bests[record.duration] || 0, record.wpm);
      }
    }
    getGhostKey(duration, mode = 'test') {
      const resolvedMode = mode === 'programming' ? 'prog' : 'normal';
      return `ghost-${resolvedMode}-${duration}`;
    }
    getGhost(duration = 60, mode = 'test') {
      const key = this.getGhostKey(duration, mode);
      const ghost = this.ghosts[key];
      if (ghost && Array.isArray(ghost.timeline) && ghost.timeline.length > 0) {
        return copy(ghost);
      }
      return null;
    }
    saveGhost(duration, sessionRecord, mode = 'test', persist = true) {
      if (!sessionRecord || !Array.isArray(sessionRecord.timeline) || sessionRecord.timeline.length < 2) return false;
      const key = this.getGhostKey(duration, mode);
      const current = this.getGhost(duration, mode);
      if (!current || sessionRecord.wpm > current.wpm || (sessionRecord.wpm === current.wpm && sessionRecord.accuracy > current.accuracy)) {
        this.ghosts[key] = {
          duration,
          mode,
          wpm: sessionRecord.wpm,
          accuracy: sessionRecord.accuracy,
          date: sessionRecord.date || this.now().toISOString(),
          timeline: copy(sessionRecord.timeline)
        };
        if (persist) this.persist();
        return true;
      }
      return false;
    }
    getAllGhosts() {
      return copy(this.ghosts);
    }
    persist() {
      try {
        if (!this.storage) throw new Error('Storage unavailable');
        this.storage.setItem(STORAGE_KEY, JSON.stringify({
          version: 1,
          history: this.history,
          bests: this.bests,
          programmingBests: this.programmingBests,
          ghosts: this.ghosts
        }));
        this.storageAvailable = true;
      } catch { this.storageAvailable = false; }
    }
    saveSession(state) {
      if (state.status !== 'finished' || this.seen.has(state.sessionId)) return false;
      const record = {
        sessionId: state.sessionId, date: this.now().toISOString(), mode: state.mode,
        difficulty: state.difficulty, duration: state.duration, elapsed: state.elapsed,
        finishReason: state.finishReason, wpm: state.wpm, accuracy: state.accuracy,
        mistakes: state.mistakes, perKey: copy(state.perKey),
        timeline: Array.isArray(state.timeline) ? copy(state.timeline) : [],
        language: state.language || null,
        consistency: typeof state.consistency === 'number' ? state.consistency : null,
        mistypedPairs: Array.isArray(state.mistypedPairs) ? copy(state.mistypedPairs) : []
      };
      if (!validRecord(record)) throw new TypeError('Invalid completed session.');
      this.seen.add(record.sessionId);
      this.history.push(record);
      this.history.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      this.history = this.history.slice(-this.limit);
      this.updateBest(record);
      if (record.timeline.length > 0) {
        this.saveGhost(record.duration, record, record.mode, false);
      }
      this.persist();
      return true;
    }
    getHistory(filters = {}) {
      return copy(this.history.filter(row => ['mode', 'difficulty', 'duration', 'language'].every(key =>
        filters[key] === undefined || filters[key] === row[key])));
    }
    getPersonalBests(mode = 'test') {
      if (mode === 'programming') return { ...this.programmingBests };
      return { ...this.bests };
    }
    getProgress(filters = {}) {
      return this.getHistory(filters).map(({ sessionId, date, mode, difficulty, duration, wpm, accuracy, consistency }) =>
        ({ sessionId, timestamp: Date.parse(date), date, mode, difficulty, duration, wpm, accuracy, consistency }));
    }
    getKeyStats({ keys = [], minAttempts = 3, ...filters } = {}) {
      return keyAnalytics(this.getHistory(filters), keys, minAttempts);
    }
    getWeakestKeys(options = {}) { return weakestKeys(this.getKeyStats(options)); }
    getOverallStats(filters = {}) {
      const records = this.getHistory(filters);
      if (!records.length) {
        return {
          totalTests: 0,
          totalCharacters: 0,
          highestWpm: 0,
          bestAccuracy: 0,
          averageWpm: 0,
          averageAccuracy: 0,
          averageConsistency: 100
        };
      }
      let highestWpm = 0;
      let bestAccuracy = 0;
      let totalWpm = 0;
      let totalAcc = 0;
      let totalChars = 0;
      let totalConsistency = 0;
      let consistencyCount = 0;
      for (const rec of records) {
        if (rec.wpm > highestWpm) highestWpm = rec.wpm;
        if (rec.accuracy > bestAccuracy) bestAccuracy = rec.accuracy;
        totalWpm += rec.wpm;
        totalAcc += rec.accuracy;
        const charsInRec = rec.perKey ? rec.perKey.reduce((sum, item) => sum + (item.attempts || 0), 0) : 0;
        totalChars += charsInRec;
        if (typeof rec.consistency === 'number') {
          totalConsistency += rec.consistency;
          consistencyCount++;
        }
      }
      return {
        totalTests: records.length,
        totalCharacters: totalChars,
        highestWpm: Math.round(highestWpm * 10) / 10,
        bestAccuracy: Math.round(bestAccuracy * 10) / 10,
        averageWpm: Math.round((totalWpm / records.length) * 10) / 10,
        averageAccuracy: Math.round((totalAcc / records.length) * 10) / 10,
        averageConsistency: consistencyCount > 0 ? Math.round(totalConsistency / consistencyCount) : 100
      };
    }
    getBigrams(filters = {}) {
      const records = this.getHistory(filters);
      const totals = new Map();
      for (const rec of records) {
        if (Array.isArray(rec.mistypedPairs)) {
          for (const item of rec.mistypedPairs) {
            totals.set(item.pair, (totals.get(item.pair) || 0) + item.count);
          }
        }
      }
      return Array.from(totals, ([pair, count]) => ({ pair, count })).sort((a, b) => b.count - a.count);
    }
    exportJson() {
      return JSON.stringify({
        version: 1,
        exportedAt: this.now().toISOString(),
        history: this.history,
        bests: this.bests,
        programmingBests: this.programmingBests,
        ghosts: this.ghosts
      }, null, 2);
    }
    importJson(jsonString) {
      if (typeof jsonString !== 'string' || !jsonString.trim()) throw new TypeError('Import payload must be a non-empty JSON string.');
      const parsed = JSON.parse(jsonString);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.history)) {
        throw new Error('Unsupported or corrupted backup format.');
      }
      let importedCount = 0;
      for (const row of parsed.history) {
        if (validRecord(row) && !this.seen.has(row.sessionId)) {
          this.seen.add(row.sessionId);
          this.history.push(row);
          this.updateBest(row);
          importedCount++;
        }
      }
      if (parsed.ghosts && typeof parsed.ghosts === 'object') {
        for (const [key, ghost] of Object.entries(parsed.ghosts)) {
          if (ghost && Array.isArray(ghost.timeline) && ghost.timeline.length > 0) {
            const current = this.ghosts[key];
            if (!current || ghost.wpm >= current.wpm) {
              this.ghosts[key] = copy(ghost);
            }
          }
        }
      }
      this.history.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      this.history = this.history.slice(-this.limit);
      this.persist();
      return importedCount;
    }
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
    generateCodeSymbols(rows = []) {
      const symbols = ['{}', '[]', '()', '=>', ';', '===', '!==', '&&', '||', '<=', '>=', '++', '+=', '::'];
      const targets = rows.map(r => r.key).filter(k => '()[]{};:=><!&|+-*/%'.includes(k));
      const pool = targets.length ? targets : ['{', '}', '(', ')', ';', '=', '[', ']'];
      const parts = Array.from({ length: 12 }, (_, i) => {
        const s = symbols[(this.sequence + i) % symbols.length];
        const t = pool[i % pool.length];
        return `fn(${t}) ${s}`;
      });
      return {
        text: parts.join(' '),
        targetKeys: pool,
        fallback: false,
        isSymbolDrill: true
      };
    }
  }
  const api = { SessionStore, PracticeGenerator, keyAnalytics, weakestKeys, STORAGE_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZenithAnalytics = Object.freeze(api);
})(globalThis);
