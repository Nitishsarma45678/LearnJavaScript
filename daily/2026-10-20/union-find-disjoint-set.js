/*
 * Practice: Union-Find (Disjoint Set Union)
 *
 * What: A data structure that tracks elements split into non-overlapping
 * groups. It answers "are a and b in the same group?" and merges groups.
 *
 * Why it matters: Kruskal's minimum spanning tree, counting connected
 * components, detecting cycles in undirected graphs, grouping accounts that
 * share an email (LeetCode 721), image segmentation, etc.
 *
 * Key ideas:
 *   - Each set is a tree; its root is the set's representative.
 *   - Path compression: while finding the root, point nodes straight at it.
 *   - Union by size: attach the smaller tree under the larger one.
 *   - Together these make find/union run in O(α(n)) amortized — effectively
 *     constant (α is the inverse Ackermann function).
 */

class UnionFind {
  #parent = new Map();
  #size = new Map();
  #count = 0;

  add(x) {
    if (this.#parent.has(x)) return false;
    this.#parent.set(x, x);
    this.#size.set(x, 1);
    this.#count++;
    return true;
  }

  find(x) {
    if (!this.#parent.has(x)) this.add(x);
    let root = x;
    while (this.#parent.get(root) !== root) root = this.#parent.get(root);
    // Path compression (iterative, so deep chains can't overflow the stack)
    while (x !== root) {
      const next = this.#parent.get(x);
      this.#parent.set(x, root);
      x = next;
    }
    return root;
  }

  union(a, b) {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;
    if (this.#size.get(ra) < this.#size.get(rb)) [ra, rb] = [rb, ra];
    this.#parent.set(rb, ra);
    this.#size.set(ra, this.#size.get(ra) + this.#size.get(rb));
    this.#count--;
    return true;
  }

  connected(a, b) {
    return this.find(a) === this.find(b);
  }

  sizeOf(x) {
    return this.#size.get(this.find(x));
  }

  get setCount() {
    return this.#count;
  }
}

// Kruskal's MST: sort edges by weight, keep an edge if it joins two components.
function kruskal(nodes, edges) {
  const uf = new UnionFind();
  nodes.forEach((n) => uf.add(n));
  const tree = edges.toSorted((a, b) => a[2] - b[2]).filter(([u, v]) => uf.union(u, v));
  return { tree, weight: tree.reduce((sum, [, , w]) => sum + w, 0) };
}

// ---------------------------------------------------------------------------
const assert = require("node:assert/strict");

const uf = new UnionFind();
["a", "b", "c", "d", "e"].forEach((x) => uf.add(x));
assert.equal(uf.setCount, 5);
assert.equal(uf.add("a"), false);

assert.equal(uf.union("a", "b"), true);
assert.equal(uf.union("c", "d"), true);
assert.equal(uf.union("b", "a"), false); // already together
assert.equal(uf.setCount, 3);
assert.ok(uf.connected("a", "b"));
assert.ok(!uf.connected("a", "c"));

uf.union("b", "d");
assert.ok(uf.connected("a", "c"));
assert.equal(uf.sizeOf("c"), 4);
assert.equal(uf.sizeOf("e"), 1);
assert.equal(uf.setCount, 2);

// find() auto-adds unknown elements as singletons
assert.equal(uf.find("z"), "z");
assert.equal(uf.setCount, 3);

// Long chain: path compression keeps this fast and stack-safe
const chain = new UnionFind();
for (let i = 1; i < 100_000; i++) chain.union(i - 1, i);
assert.ok(chain.connected(0, 99_999));
assert.equal(chain.setCount, 1);

// Kruskal
const { tree, weight } = kruskal(
  ["A", "B", "C", "D"],
  [["A", "B", 1], ["B", "C", 4], ["A", "C", 3], ["C", "D", 2], ["B", "D", 5]],
);
assert.equal(weight, 6);
assert.equal(tree.length, 3);
assert.deepEqual(kruskal(["X"], []), { tree: [], weight: 0 });

console.log("✓ Union-Find (Disjoint Set Union): all checks passed");
