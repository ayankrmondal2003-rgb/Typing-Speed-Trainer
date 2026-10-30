// Programming Code Snippets for Type!e
(function (root) {
  const SNIPPETS = {
    python: {
      beginner: [
        'def add(a, b):\n    return a + b\n\ntotal = add(5, 10)\nprint(f"Sum: {total}")',
        'fruits = ["apple", "banana", "cherry"]\nfor fruit in fruits:\n    print(fruit.upper())',
        'name = "Python"\nversion = 3.12\nprint(f"{name} {version} is running.")',
        'def is_even(num):\n    return num % 2 == 0\n\nprint(is_even(42))'
      ],
      intermediate: [
        'def fibonacci(n):\n    a, b = 0, 1\n    for _ in range(n):\n        yield a\n        a, b = b, a + b',
        'class Rectangle:\n    def __init__(self, w, h):\n        self.w = w\n        self.h = h\n    def area(self):\n        return self.w * self.h',
        'def filter_evens(numbers):\n    return [x for x in numbers if x % 2 == 0]',
        'import json\n\ndata = {"status": "ok", "code": 200}\ntext = json.dumps(data, indent=2)\nprint(text)'
      ],
      advanced: [
        'class LRUCache:\n    def __init__(self, capacity: int):\n        self.cap = capacity\n        self.cache = {}\n    def get(self, key: int) -> int:\n        if key not in self.cache:\n            return -1\n        val = self.cache.pop(key)\n        self.cache[key] = val\n        return val',
        'def quicksort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[len(arr) // 2]\n    left = [x for x in arr if x < pivot]\n    mid = [x for x in arr if x == pivot]\n    right = [x for x in arr if x > pivot]\n    return quicksort(left) + mid + quicksort(right)',
        'import asyncio\n\nasync def fetch_data(url: str) -> dict:\n    await asyncio.sleep(0.1)\n    return {"url": url, "status": "done"}'
      ]
    },
    javascript: {
      beginner: [
        'function greet(name) {\n  return `Hello, ${name}!`;\n}\nconsole.log(greet("World"));',
        'const items = [1, 2, 3, 4, 5];\nconst doubled = items.map(n => n * 2);\nconsole.log(doubled);',
        'let count = 0;\nfunction increment() {\n  count += 1;\n  return count;\n}',
        'const user = { name: "Alex", role: "developer", active: true };\nconsole.log(user.name);'
      ],
      intermediate: [
        'const debounce = (fn, delay) => {\n  let timer = null;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), delay);\n  };\n};',
        'async function loadData(url) {\n  const response = await fetch(url);\n  if (!response.ok) throw new Error("HTTP error");\n  return response.json();\n}',
        'class EventEmitter {\n  constructor() {\n    this.events = new Map();\n  }\n  on(name, cb) {\n    if (!this.events.has(name)) this.events.set(name, []);\n    this.events.get(name).push(cb);\n  }\n}',
        'const deepClone = obj => JSON.parse(JSON.stringify(obj));'
      ],
      advanced: [
        'function memoize(fn) {\n  const cache = new Map();\n  return function (...args) {\n    const key = JSON.stringify(args);\n    if (cache.has(key)) return cache.get(key);\n    const result = fn.apply(this, args);\n    cache.set(key, result);\n    return result;\n  };\n}',
        'function binarySearch(arr, target) {\n  let left = 0, right = arr.length - 1;\n  while (left <= right) {\n    const mid = Math.floor((left + right) / 2);\n    if (arr[mid] === target) return mid;\n    if (arr[mid] < target) left = mid + 1;\n    else right = mid - 1;\n  }\n  return -1;\n}',
        'const pipeline = (...fns) => val => fns.reduce((acc, fn) => fn(acc), val);'
      ]
    },
    c: {
      beginner: [
        '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, World!\\n");\n    return 0;\n}',
        'int add(int a, int b) {\n    return a + b;\n}',
        '#define MAX 100\nint count = 0;\nif (count < MAX) {\n    count++;\n}',
        'for (int i = 0; i < 10; i++) {\n    printf("%d\\n", i);\n}'
      ],
      intermediate: [
        'int str_length(const char *s) {\n    int len = 0;\n    while (*s++ != \'\\0\') len++;\n    return len;\n}',
        'void swap(int *a, int *b) {\n    int temp = *a;\n    *a = *b;\n    *b = temp;\n}',
        'struct Point {\n    int x;\n    int y;\n};\nstruct Point p1 = {10, 20};',
        'int max_val(int a, int b) {\n    return (a > b) ? a : b;\n}'
      ],
      advanced: [
        'typedef struct Node {\n    int val;\n    struct Node *next;\n} Node;\n\nNode* create_node(int v) {\n    Node *n = malloc(sizeof(Node));\n    n->val = v;\n    n->next = NULL;\n    return n;\n}',
        'void reverse_array(int *arr, int size) {\n    int *start = arr;\n    int *end = arr + size - 1;\n    while (start < end) {\n        int tmp = *start;\n        *start++ = *end;\n        *end-- = tmp;\n    }\n}'
      ]
    },
    cpp: {
      beginner: [
        '#include <iostream>\n\nint main() {\n    std::cout << "Hello C++" << std::endl;\n    return 0;\n}',
        '#include <vector>\n\nstd::vector<int> numbers = {1, 2, 3, 4, 5};\nint size = numbers.size();',
        'int square(int n) {\n    return n * n;\n}',
        '#include <string>\nstd::string title = "Type!e Speed Trainer";'
      ],
      intermediate: [
        'template <typename T>\nT clamp_val(T val, T low, T high) {\n    return (val < low) ? low : (val > high) ? high : val;\n}',
        '#include <algorithm>\n#include <vector>\n\nvoid sort_items(std::vector<int>& items) {\n    std::sort(items.begin(), items.end());\n}',
        'class Timer {\n    double elapsed = 0.0;\npublic:\n    void reset() { elapsed = 0.0; }\n    double get() const { return elapsed; }\n};'
      ],
      advanced: [
        '#include <memory>\n\ntemplate <typename T>\nclass UniqueStack {\n    struct Node { T data; std::unique_ptr<Node> next; };\n    std::unique_ptr<Node> head;\npublic:\n    void push(T val) {\n        head = std::make_unique<Node>(Node{std::move(val), std::move(head)});\n    }\n};',
        'auto lambda = [](auto a, auto b) noexcept -> bool {\n    return a.first < b.first && a.second == b.second;\n};'
      ]
    },
    html: {
      beginner: [
        '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <title>Type!e</title>\n  </head>\n  <body>\n    <h1>Welcome</h1>\n  </body>\n</html>',
        '<div class="card">\n  <h2>Dashboard</h2>\n  <p>Track your typing metrics.</p>\n</div>',
        '<nav class="menu">\n  <a href="#home">Home</a>\n  <a href="#stats">Stats</a>\n</nav>',
        '<button type="button" class="btn primary">Start Race</button>'
      ],
      intermediate: [
        '<form class="session-form" novalidate>\n  <label for="username">Username</label>\n  <input type="text" id="username" required>\n  <button type="submit">Submit</button>\n</form>',
        '<table class="stats-table">\n  <thead>\n    <tr><th>Date</th><th>WPM</th><th>Accuracy</th></tr>\n  </thead>\n  <tbody><tr><td>Today</td><td>84</td><td>99%</td></tr></tbody>\n</table>',
        '<dialog id="modal-alert">\n  <h3>Notice</h3>\n  <p>Race starting in 3 seconds!</p>\n  <button id="btn-ok">OK</button>\n</dialog>'
      ],
      advanced: [
        '<main id="main" class="arena-view" aria-live="polite">\n  <section aria-labelledby="circuit-title">\n    <h1 id="circuit-title" class="sr-only">Circuit</h1>\n    <svg viewBox="0 0 1000 380" aria-hidden="true">\n      <path id="route" d="M 50 100 C 200 50, 400 150, 900 100" />\n    </svg>\n  </section>\n</main>'
      ]
    },
    css: {
      beginner: [
        'body {\n  margin: 0;\n  padding: 0;\n  font-family: sans-serif;\n  background: #f6f3e9;\n}',
        '.button {\n  padding: 8px 16px;\n  background: #ffe343;\n  border: 2px solid #111;\n  cursor: pointer;\n}',
        '.text-bold {\n  font-weight: 900;\n  letter-spacing: -0.5px;\n}',
        '.hidden {\n  display: none !important;\n}'
      ],
      intermediate: [
        '.grid-container {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));\n  gap: 16px;\n  align-items: stretch;\n}',
        '.card:hover {\n  transform: translateY(-2px);\n  box-shadow: 4px 4px 0 #111;\n  transition: transform 0.1s ease;\n}',
        '.badge-status {\n  display: inline-flex;\n  align-items: center;\n  border-radius: 999px;\n  padding: 4px 10px;\n}'
      ],
      advanced: [
        '@media (prefers-color-scheme: dark) {\n  :root {\n    --bg: #121316;\n    --card: #1e2025;\n    --ink: #f8fafc;\n    --line: #475569;\n  }\n  body { background: var(--bg); color: var(--ink); }\n}',
        '.circuit-car {\n  offset-path: path("M 50 100 C 200 50, 800 50, 950 100");\n  offset-rotate: auto 90deg;\n  animation: drive 5s linear infinite;\n}'
      ]
    },
    sql: {
      beginner: [
        'SELECT id, username, email FROM users WHERE is_active = true;',
        'INSERT INTO sessions (wpm, accuracy) VALUES (85, 98.5);',
        'UPDATE racers SET score = score + 10 WHERE player_id = 42;',
        'DELETE FROM temp_logs WHERE created_at < NOW() - INTERVAL 7 DAY;'
      ],
      intermediate: [
        'SELECT u.name, COUNT(s.id) AS total_races, AVG(s.wpm) AS avg_wpm\nFROM users u\nJOIN sessions s ON u.id = s.user_id\nGROUP BY u.name\nHAVING COUNT(s.id) >= 5\nORDER BY avg_wpm DESC;',
        'CREATE TABLE race_records (\n  id SERIAL PRIMARY KEY,\n  player_name VARCHAR(50) NOT NULL,\n  wpm NUMERIC(5, 2) NOT NULL,\n  accuracy NUMERIC(5, 2) NOT NULL\n);'
      ],
      advanced: [
        'WITH RankedBests AS (\n  SELECT user_id, duration, wpm, accuracy,\n         ROW_NUMBER() OVER (PARTITION BY duration ORDER BY wpm DESC) as rank\n  FROM race_sessions\n)\nSELECT user_id, duration, wpm, accuracy FROM RankedBests WHERE rank = 1;'
      ]
    }
  };

  const LANGUAGES = Object.freeze(['python', 'javascript', 'c', 'cpp', 'html', 'css', 'sql', 'random']);
  const LANGUAGE_NAMES = Object.freeze({
    python: 'Python',
    javascript: 'JavaScript',
    c: 'C',
    cpp: 'C++',
    html: 'HTML',
    css: 'CSS',
    sql: 'SQL',
    random: 'Random Language'
  });

  function getSnippet(lang = 'javascript', difficulty = 'intermediate', seed = 0) {
    let resolvedLang = lang.toLowerCase();
    if (resolvedLang === 'random') {
      const pool = ['python', 'javascript', 'c', 'cpp', 'html', 'css', 'sql'];
      resolvedLang = pool[Math.abs(seed) % pool.length];
    }
    const langObj = SNIPPETS[resolvedLang] || SNIPPETS.javascript;
    const diffList = langObj[difficulty] || langObj.intermediate || langObj.beginner;
    const index = Math.abs(seed) % diffList.length;
    return {
      language: resolvedLang,
      languageName: LANGUAGE_NAMES[resolvedLang] || resolvedLang,
      difficulty,
      code: diffList[index]
    };
  }

  const api = Object.freeze({
    SNIPPETS,
    LANGUAGES,
    LANGUAGE_NAMES,
    getSnippet
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (typeof root !== 'undefined') {
      root.ZenithProgramming = api;
      root.ProgrammingSnippets = api;
    }
  } else {
    root.ZenithProgramming = api;
    root.ProgrammingSnippets = api;
  }
})(globalThis);
