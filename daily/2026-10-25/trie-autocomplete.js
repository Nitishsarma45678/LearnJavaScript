/**
 * Trie supporting insertion, exact lookup, and lexicographic autocomplete.
 * Duplicate words are stored once. Prefix search can be limited.
 */
class TrieNode {
  constructor() { this.children = new Map(); this.terminal = false; }
}
class Trie {
  constructor() { this.root = new TrieNode(); }
  insert(word) {
    if (typeof word !== "string" || word.length === 0) throw new TypeError("word must be a non-empty string");
    let node = this.root;
    for (const char of word.toLowerCase()) {
      if (!node.children.has(char)) node.children.set(char, new TrieNode());
      node = node.children.get(char);
    }
    node.terminal = true;
  }
  #walk(prefix) {
    let node = this.root;
    for (const char of prefix.toLowerCase()) {
      node = node.children.get(char);
      if (!node) return null;
    }
    return node;
  }
  has(word) {
    const node = this.#walk(word);
    return Boolean(node?.terminal);
  }
  autocomplete(prefix, limit = 10) {
    if (!Number.isInteger(limit) || limit < 0) throw new RangeError("limit must be a non-negative integer");
    const start = this.#walk(prefix);
    if (!start || limit === 0) return [];
    const found = [];
    const visit = (node, built) => {
      if (found.length >= limit) return;
      if (node.terminal) found.push(built);
      for (const char of [...node.children.keys()].sort()) {
        visit(node.children.get(char), built + char);
        if (found.length >= limit) break;
      }
    };
    visit(start, prefix.toLowerCase());
    return found;
  }
}
const trie = new Trie();
["javascript", "java", "javelin", "json", "jest"].forEach(word => trie.insert(word));
console.assert(trie.has("JAVA") && !trie.has("jav"));
console.assert(JSON.stringify(trie.autocomplete("jav")) === '["java","javascript","javelin"]');
console.assert(trie.autocomplete("j", 2).length === 2);
console.log("trie autocomplete practice passed");
