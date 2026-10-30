/*
 * Compressed radix trie with Unicode code-point edges.
 * Supports insert, has, startsWith, delete, and lexicographic suggestions.
 */
class CompressedRadixTrie {
  constructor() {
    this.root = { terminal: false, children: new Map() };
    this.wordCount = 0;
  }
  static chars(word) {
    if (typeof word !== "string") throw new TypeError("word must be a string");
    return Array.from(word);
  }
  insert(word) {
    const chars = CompressedRadixTrie.chars(word);
    let node = this.root, i = 0;
    if (!chars.length) {
      if (node.terminal) return false;
      node.terminal = true; this.wordCount++; return true;
    }
    while (i < chars.length) {
      const key = chars[i], edge = node.children.get(key);
      if (!edge) {
        node.children.set(key, {
          label: chars.slice(i).join(""),
          node: { terminal: true, children: new Map() }
        });
        this.wordCount++; return true;
      }
      const label = Array.from(edge.label);
      let common = 0;
      while (common < label.length && i + common < chars.length &&
             label[common] === chars[i + common]) common++;
      if (common === label.length) {
        i += common; node = edge.node;
        if (i === chars.length) {
          if (node.terminal) return false;
          node.terminal = true; this.wordCount++; return true;
        }
        continue;
      }
      const oldChild = edge.node;
      const prefix = label.slice(0, common).join("");
      const oldSuffix = label.slice(common).join("");
      const middle = { terminal: false, children: new Map() };
      edge.label = prefix; edge.node = middle;
      middle.children.set(Array.from(oldSuffix)[0], { label: oldSuffix, node: oldChild });
      const newSuffix = chars.slice(i + common).join("");
      if (!newSuffix) middle.terminal = true;
      else middle.children.set(Array.from(newSuffix)[0], {
        label: newSuffix, node: { terminal: true, children: new Map() }
      });
      this.wordCount++; return true;
    }
    return false;
  }
  has(word) {
    const chars = CompressedRadixTrie.chars(word);
    let node = this.root, i = 0;
    while (i < chars.length) {
      const edge = node.children.get(chars[i]);
      if (!edge) return false;
      const label = Array.from(edge.label);
      for (let j = 0; j < label.length; j++) {
        if (chars[i + j] !== label[j]) return false;
      }
      i += label.length; node = edge.node;
    }
    return node.terminal;
  }
  _locatePrefix(prefix) {
    const chars = CompressedRadixTrie.chars(prefix);
    let node = this.root, i = 0, base = "";
    while (i < chars.length) {
      const edge = node.children.get(chars[i]);
      if (!edge) return null;
      const label = Array.from(edge.label);
      let common = 0;
      while (common < label.length && i + common < chars.length &&
             label[common] === chars[i + common]) common++;
      if (common === chars.length - i) return { node: edge.node, base: base + edge.label };
      if (common !== label.length) return null;
      base += edge.label; i += common; node = edge.node;
    }
    return { node, base };
  }
  startsWith(prefix) { return this._locatePrefix(prefix) !== null; }
  delete(word) {
    const chars = CompressedRadixTrie.chars(word);
    let node = this.root, i = 0;
    const path = [];
    while (i < chars.length) {
      const key = chars[i], edge = node.children.get(key);
      if (!edge) return false;
      const label = Array.from(edge.label);
      for (let j = 0; j < label.length; j++) {
        if (chars[i + j] !== label[j]) return false;
      }
      path.push({ parent: node, key, edge });
      i += label.length; node = edge.node;
    }
    if (!node.terminal) return false;
    node.terminal = false; this.wordCount--;
    for (let p = path.length - 1; p >= 0; p--) {
      const { parent, key, edge } = path[p], child = edge.node;
      if (child.terminal) break;
      if (child.children.size === 0) parent.children.delete(key);
      else if (child.children.size === 1) {
        const only = child.children.values().next().value;
        edge.label += only.label; edge.node = only.node;
        parent.children.set(key, edge);
      } else break;
    }
    return true;
  }
  suggest(prefix, limit = 10) {
    if (!Number.isInteger(limit) || limit < 0) throw new RangeError("invalid limit");
    if (limit === 0) return [];
    const located = this._locatePrefix(prefix);
    if (!located) return [];
    const out = [];
    const visit = (node, base) => {
      if (out.length >= limit) return;
      if (node.terminal) out.push(base);
      const children = Array.from(node.children.values())
        .sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
      for (const edge of children) {
        visit(edge.node, base + edge.label);
        if (out.length >= limit) return;
      }
    };
    visit(located.node, located.base);
    return out;
  }
}
function assert(ok, message) { if (!ok) throw new Error(message || "assertion failed"); }
function same(a, b) { assert(JSON.stringify(a) === JSON.stringify(b), "array mismatch"); }
async function runTests() {
  const trie = new CompressedRadixTrie();
  for (const word of ["car", "cart", "carbon", "cat", "dog", "😀smile", ""]) {
    assert(trie.insert(word));
  }
  assert(!trie.insert("car"));
  assert(trie.has("car") && trie.has("carbon") && trie.has("") && !trie.has("ca"));
  assert(trie.startsWith("car") && trie.startsWith("carb") && trie.startsWith(""));
  assert(!trie.startsWith("cab"));
  same(trie.suggest("car"), ["car", "carbon", "cart"]);
  same(trie.suggest("ca", 2), ["car", "carbon"]);
  assert(trie.delete("car") && !trie.has("car") && trie.has("carbon"));
  assert(trie.delete("carbon") && trie.delete("cart"));
  same(trie.suggest("car"), []);
  assert(trie.delete("") && trie.wordCount === 3);
}
if (typeof module !== "undefined" && require.main === module) {
  runTests().then(() => console.log("compressed-radix-trie: tests passed"))
    .catch(e => { console.error(e); process.exitCode = 1; });
}
