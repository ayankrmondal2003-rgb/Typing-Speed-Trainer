// DOM-independent engine, shared by plain browser scripts and Node tests.
(function (root) {
  let SnippetProvider = null;
  try {
    if (typeof require !== 'undefined') SnippetProvider = require('./programming-snippets');
    else if (root.ZenithProgramming) SnippetProvider = root.ZenithProgramming;
  } catch {}

  const PROMPTS = Object.freeze({
    easy: 'the sun is warm and the sky is blue we walk home along the quiet road',
    medium: 'Steady practice builds confidence. Keep your hands relaxed and focus on each word.',
    hard: 'At 09:45, verify report_v2: accuracy >= 98%; then type {Ready? Yes!} (3 + 7 = 10).',
  });
  const DURATIONS = Object.freeze([30, 60, 120]);
  let sessionSequence = 0;
  class TypingEngine {
    constructor({ difficulty = 'easy', duration = 60, customText = null, mode = 'test', language = 'javascript', now = () => performance.now(), onComplete = () => {} } = {}) {
      this.now = now;
      this.onComplete = onComplete;
      this.language = language;
      this.configure({ difficulty, duration, customText, mode, language });
    }
    configure({ difficulty = this.difficulty, duration = this.duration, customText = this.customText, mode = (customText === null ? 'test' : 'custom'), language = this.language } = {}) {
      if (!['test', 'custom', 'practice', 'programming'].includes(mode)) throw new RangeError('Invalid mode.');
      if (!Object.prototype.hasOwnProperty.call(PROMPTS, difficulty)) throw new RangeError('Choose easy, medium, or hard.');
      if (!DURATIONS.includes(duration)) throw new RangeError('Choose 30, 60, or 120 seconds.');
      if (customText !== null && (typeof customText !== 'string' || !customText.trim())) throw new TypeError('Custom text must contain a non-whitespace character.');
      this.difficulty = difficulty;
      this.mode = mode;
      this.duration = duration;
      this.language = language || 'javascript';

      if (mode === 'programming') {
        if (customText !== null) {
          this.customText = customText.replace(/\r\n?/g, '\n');
        } else {
          const provider = SnippetProvider || (typeof root !== 'undefined' ? root.ZenithProgramming : null);
          if (provider && typeof provider.getSnippet === 'function') {
            const snip = provider.getSnippet(this.language, this.difficulty, Date.now());
            this.customText = snip.code;
          } else {
            this.customText = 'function greet(name) {\n  return `Hello, ${name}!`;\n}';
          }
        }
        this.prompt = Array.from(this.customText);
      } else {
        this.customText = customText === null ? null : customText.replace(/\r\n?/g, '\n');
        this.prompt = Array.from(this.customText === null ? PROMPTS[difficulty] : this.customText);
      }
      return this.restart();
    }
    restart() {
      this.status = 'ready';
      this.finishReason = null;
      this.startedAt = null;
      this.elapsed = 0;
      this.input = [];
      this.totalKeystrokes = 0;
      this.correctKeystrokes = 0;
      this.perKey = new Map();
      this.timeline = [];
      this.lastSampleTime = 0;
      this.mistypedPairs = new Map();
      this.intervalWpms = [];
      this.lastIntervalSecond = 0;
      return this.getState();
    }
    finish(reason) {
      if (this.status === 'finished') return;
      this.status = 'finished';
      this.finishReason = reason;
      this.sampleTimeline(true);
      const sessionId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++sessionSequence}-${Math.random()}`;
      this.onComplete({ ...this.snapshot(), sessionId });
    }
    calculateWpm(elapsedSec) {
      if (elapsedSec <= 0) return 0;
      const correctChars = this.prompt.slice(0, this.input.length).filter((exp, idx) => this.input[idx] === exp).length;
      return (correctChars / 5) / (elapsedSec / 60);
    }
    calculateConsistency() {
      if (this.intervalWpms.length < 3) return 100;
      const mean = this.intervalWpms.reduce((a, b) => a + b, 0) / this.intervalWpms.length;
      if (mean <= 0) return 100;
      const variance = this.intervalWpms.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / this.intervalWpms.length;
      const stdDev = Math.sqrt(variance);
      const cv = (stdDev / mean) * 100;
      return Math.max(0, Math.min(100, Math.round(100 - cv)));
    }
    sampleTimeline(force = false) {
      if (this.status === 'ready' && !force) return;
      const elapsed = this.elapsed;
      if (force || elapsed - this.lastSampleTime >= 0.15 || this.timeline.length === 0) {
        const progress = this.prompt.length > 0 ? this.input.length / this.prompt.length : 0;
        const currentWpm = this.calculateWpm(elapsed);
        this.timeline.push({
          t: Math.round(elapsed * 100) / 100,
          p: Math.round(progress * 1000) / 1000,
          w: Math.round(currentWpm * 10) / 10
        });
        this.lastSampleTime = elapsed;
      }
      const currentSec = Math.floor(elapsed);
      if (currentSec > this.lastIntervalSecond) {
        this.lastIntervalSecond = currentSec;
        this.intervalWpms.push(this.calculateWpm(elapsed));
      }
    }
    updateTime(time) {
      if (this.status !== 'running') return;
      this.elapsed = Math.min(this.duration, Math.max(this.elapsed, (time - this.startedAt) / 1000, 0));
      this.sampleTimeline(false);
      if (this.elapsed >= this.duration) {
        this.finish('timeout');
      }
    }
    handleKey(key, { ctrlKey = false, metaKey = false, altKey = false, isComposing = false } = {}) {
      const time = this.now();
      this.updateTime(time);
      if (this.status === 'finished' || ctrlKey || metaKey || altKey || isComposing) return this.snapshot();
      if (key === 'Backspace') {
        this.input.pop();
        this.sampleTimeline(false);
        return this.snapshot();
      }
      if (key === 'Enter') key = '\n';
      if (key === 'Tab') {
        // Tab key support in programming mode: insert spaces matching expected indentation if needed
        key = ' ';
      }
      if (typeof key !== 'string' || Array.from(key).length !== 1) return this.snapshot();
      if (this.status === 'ready') {
        this.status = 'running';
        this.startedAt = time;
        this.sampleTimeline(true);
      }
      this.totalKeystrokes++;
      const expected = this.prompt[this.input.length];
      const stats = this.perKey.get(expected) ?? { attempts: 0, errors: 0, incorrectKeys: new Map() };
      stats.attempts++;
      if (key === expected) {
        this.correctKeystrokes++;
      } else {
        stats.errors++;
        stats.incorrectKeys.set(key, (stats.incorrectKeys.get(key) ?? 0) + 1);
        if (this.input.length > 0) {
          const prevKey = this.prompt[this.input.length - 1];
          const pair = `${prevKey}${expected}`;
          this.mistypedPairs.set(pair, (this.mistypedPairs.get(pair) || 0) + 1);
        }
      }
      this.perKey.set(expected, stats);
      this.input.push(key);
      this.sampleTimeline(false);
      if (this.input.length === this.prompt.length) {
        this.finish('completed');
      }
      return this.snapshot();
    }
    getState() {
      this.updateTime(this.now());
      return this.snapshot();
    }
    snapshot() {
      const characters = this.prompt.map((expected, index) => ({
        expected, actual: this.input[index] ?? null,
        status: index >= this.input.length ? 'pending' : this.input[index] === expected ? 'correct' : 'incorrect',
      }));
      const correctCharacters = characters.filter(char => char.status === 'correct').length;
      return {
        status: this.status, finishReason: this.finishReason,
        difficulty: this.difficulty, duration: this.duration, mode: this.mode, language: this.language,
        perKey: Array.from(this.perKey, ([key, stats]) => ({
          key, attempts: stats.attempts, errors: stats.errors, errorRate: stats.errors / stats.attempts,
          incorrectKeys: Array.from(stats.incorrectKeys, ([key, count]) => ({ key, count })),
        })),
        prompt: this.prompt.join(''), input: this.input.join(''), position: this.input.length, characters,
        elapsed: this.elapsed, remaining: Math.max(0, this.duration - this.elapsed),
        totalKeystrokes: this.totalKeystrokes, correctKeystrokes: this.correctKeystrokes,
        mistakes: this.totalKeystrokes - this.correctKeystrokes, correctCharacters,
        wpm: this.elapsed > 0 ? (correctCharacters / 5) / (this.elapsed / 60) : 0,
        accuracy: this.totalKeystrokes > 0 ? this.correctKeystrokes / this.totalKeystrokes * 100 : 0,
        timeline: this.timeline.slice(),
        consistency: this.calculateConsistency(),
        mistypedPairs: Array.from(this.mistypedPairs, ([pair, count]) => ({ pair, count })).sort((a, b) => b.count - a.count)
      };
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { TypingEngine, PROMPTS, DURATIONS };
  else root.Zenith = Object.freeze({ TypingEngine, PROMPTS, DURATIONS });
})(globalThis);
