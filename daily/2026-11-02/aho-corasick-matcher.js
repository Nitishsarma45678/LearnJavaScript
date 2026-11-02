const assert = require('node:assert/strict');

class AhoCorasick {
  constructor(patterns) {
    this.root = this.node();
    this.lengths = new Map();
    for (const pattern of patterns) {
      if (typeof pattern !== 'string' || pattern.length === 0) {
        throw new TypeError('patterns must be non-empty strings');
      }
      const chars = Array.from(pattern);
      this.lengths.set(pattern, chars.length);
      let current = this.root;
      for (const char of chars) {
        if (!current.next.has(char)) current.next.set(char, this.node());
        current = current.next.get(char);
      }
      current.output.push(pattern);
    }
    this.buildFailureLinks();
  }

  node() {
    return { next: new Map(), fail: null, output: [] };
  }

  buildFailureLinks() {
    this.root.fail = this.root;
    const queue = [];
    for (const child of this.root.next.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      for (const [char, child] of current.next) {
        let fallback = current.fail;
        while (fallback !== this.root && !fallback.next.has(char)) fallback = fallback.fail;
        child.fail = fallback.next.has(char) ? fallback.next.get(char) : this.root;
        child.output.push(...child.fail.output);
        queue.push(child);
      }
    }
  }

  search(text) {
    const chars = Array.from(text);
    const matches = [];
    let current = this.root;

    for (let index = 0; index < chars.length; index++) {
      const char = chars[index];
      while (current !== this.root && !current.next.has(char)) current = current.fail;
      if (current.next.has(char)) current = current.next.get(char);

      for (const pattern of current.output) {
        matches.push({ pattern, index: index - this.lengths.get(pattern) + 1 });
      }
    }

    return matches.sort((a, b) => a.index - b.index || a.pattern.localeCompare(b.pattern));
  }
}

const matcher = new AhoCorasick(['he', 'she', 'his', 'hers']);
assert.deepEqual(matcher.search('ushers'), [
  { pattern: 'she', index: 1 },
  { pattern: 'he', index: 2 },
  { pattern: 'hers', index: 2 }
]);
const unicode = new AhoCorasick(['猫', '猫咪']);
assert.deepEqual(unicode.search('小猫咪'), [
  { pattern: '猫', index: 1 },
  { pattern: '猫咪', index: 1 }
]);
assert.deepEqual(new AhoCorasick(['aba']).search('ababa'), [
  { pattern: 'aba', index: 0 },
  { pattern: 'aba', index: 2 }
]);
assert.throws(() => new AhoCorasick(['']), TypeError);
console.log('Aho-Corasick matcher tests passed');