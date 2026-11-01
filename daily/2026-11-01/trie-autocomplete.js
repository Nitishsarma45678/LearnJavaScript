const assert = require('node:assert/strict');

class Trie {
  constructor() { this.root = { children: new Map(), frequency: 0, word: null }; }
  insert(word) {
    let node = this.root;
    for (const ch of word.toLowerCase()) {
      if (!node.children.has(ch)) node.children.set(ch, {children:new Map(), frequency:0, word:null});
      node = node.children.get(ch);
    }
    node.word = word; node.frequency++;
  }
  suggest(prefix, limit = 5) {
    let node = this.root;
    for (const ch of prefix.toLowerCase()) {
      node = node.children.get(ch);
      if (!node) return [];
    }
    const found = [];
    const visit = n => {
      if (n.word !== null) found.push({word:n.word, frequency:n.frequency});
      for (const child of n.children.values()) visit(child);
    };
    visit(node);
    return found.sort((a,b) => b.frequency-a.frequency || a.word.localeCompare(b.word))
      .slice(0, limit).map(x => x.word);
  }
}
const t = new Trie();
['JavaScript','Java','JavaScript','Jasmine','JSON','Java'].forEach(w => t.insert(w));
assert.deepEqual(t.suggest('ja'), ['JavaScript','Java','Jasmine']);
assert.deepEqual(t.suggest('js'), []);
assert.deepEqual(t.suggest('ja', 2), ['JavaScript','Java']);
console.log('Trie autocomplete tests passed');