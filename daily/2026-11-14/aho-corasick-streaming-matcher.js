/**
 * Aho-Corasick Streaming Multi-Pattern Matcher
 * --------------------------------------------
 * Build a trie with failure links and output links, then scan text in linear
 * time plus the number of matches. The scanner preserves automaton state and
 * absolute code-point offsets across arbitrary chunk boundaries.
 *
 * Complexity:
 *   build: O(total pattern length * alphabet fallback work)
 *   scan:  O(text length + number of matches)
 *
 * Run: node aho-corasick-streaming-matcher.js
 */
'use strict';

const assert = require('node:assert/strict');

function makeNode() {
  return { next: new Map(), fail: null, output: [], dict: null };
}

class AhoCorasick {
  constructor() {
    this.root = makeNode();
    this.root.fail = this.root;
    this.patterns = [];
    this.built = false;
  }

  add(pattern, value = pattern) {
    if (this.built) throw new Error('Cannot add patterns after build()');
    const symbols = Array.from(String(pattern));
    if (symbols.length === 0) throw new RangeError('Empty patterns are not supported');

    const id = this.patterns.length;
    this.patterns.push({ text: String(pattern), symbols, value });
    let node = this.root;
    for (const symbol of symbols) {
      if (!node.next.has(symbol)) node.next.set(symbol, makeNode());
      node = node.next.get(symbol);
    }
    node.output.push(id);
    return id;
  }

  build() {
    if (this.built) return this;
    const queue = [];
    for (const child of this.root.next.values()) {
      child.fail = this.root;
      child.dict = null;
      queue.push(child);
    }

    for (let head = 0; head < queue.length; head += 1) {
      const node = queue[head];
      for (const [symbol, child] of node.next) {
        let fallback = node.fail;
        while (fallback !== this.root && !fallback.next.has(symbol)) {
          fallback = fallback.fail;
        }
        child.fail = fallback.next.get(symbol) || this.root;
        child.dict = child.fail.output.length > 0
          ? child.fail
          : child.fail.dict;
        queue.push(child);
      }
    }

    this.built = true;
    return this;
  }

  _advance(state, symbol) {
    while (state !== this.root && !state.next.has(symbol)) {
      state = state.fail;
    }
    return state.next.get(symbol) || this.root;
  }

  _emit(state, symbolIndex, target) {
    for (let node = state; node; node = node.dict) {
      for (const id of node.output) {
        const pattern = this.patterns[id];
        target.push({
          id,
          pattern: pattern.text,
          value: pattern.value,
          start: symbolIndex - pattern.symbols.length + 1,
          end: symbolIndex + 1
        });
      }
    }
  }

  search(text) {
    if (!this.built) throw new Error('Call build() before searching');
    const scanner = this.createScanner();
    return scanner.push(text);
  }

  createScanner() {
    if (!this.built) throw new Error('Call build() before creating a scanner');
    let state = this.root;
    let position = 0;
    let closed = false;

    return {
      push: (chunk) => {
        if (closed) throw new Error('Scanner is closed');
        const matches = [];
        for (const symbol of Array.from(String(chunk))) {
          state = this._advance(state, symbol);
          this._emit(state, position, matches);
          position += 1;
        }
        return matches;
      },
      close: () => {
        closed = true;
      },
      get position() {
        return position;
      }
    };
  }
}

// ---------------------------------------------------------------------------
// Examples and tests
// ---------------------------------------------------------------------------

const automaton = new AhoCorasick();
automaton.add('he');
automaton.add('she');
automaton.add('his');
automaton.add('hers');
automaton.build();

const classic = automaton.search('ushers');
assert.deepEqual(
  classic.map((m) => [m.pattern, m.start, m.end]).sort(),
  [['he', 2, 4], ['hers', 2, 6], ['she', 1, 4]].sort()
);

const overlaps = new AhoCorasick();
overlaps.add('a');
overlaps.add('aa');
overlaps.add('aaa');
overlaps.build();
assert.equal(overlaps.search('aaaa').length, 9);

const duplicates = new AhoCorasick();
const first = duplicates.add('cat', { kind: 'first' });
const second = duplicates.add('cat', { kind: 'second' });
duplicates.build();
assert.deepEqual(
  duplicates.search('cat').map((m) => m.id).sort((a, b) => a - b),
  [first, second]
);

const unicode = new AhoCorasick();
unicode.add('🐈');
unicode.add('猫');
unicode.build();
assert.deepEqual(
  unicode.search('🐈猫🐈').map((m) => [m.pattern, m.start, m.end]),
  [['🐈', 0, 1], ['猫', 1, 2], ['🐈', 2, 3]]
);

const scanner = automaton.createScanner();
const streamed = [
  ...scanner.push('us'),
  ...scanner.push('he'),
  ...scanner.push('rs')
];
assert.deepEqual(
  streamed.map((m) => [m.pattern, m.start, m.end]).sort(),
  classic.map((m) => [m.pattern, m.start, m.end]).sort()
);
assert.equal(scanner.position, 6);
scanner.close();
assert.throws(() => scanner.push('x'), /closed/);

assert.throws(() => new AhoCorasick().add(''), /Empty patterns/);
assert.throws(() => {
  const index = new AhoCorasick();
  index.add('x');
  index.build();
  index.add('y');
}, /after build/);

console.log('Aho-Corasick tests passed.');
