"use strict";

/*
 * Exercise: maintain a valid topological ordering while directed edges are
 * inserted. If a new edge violates the current order, search only the affected
 * prefix. Reject the edge if it closes a cycle; otherwise move the reachable
 * block immediately after the edge's source.
 *
 * Complexity: an already-forward insertion is O(1); a backward insertion is
 * O(V + E) in the affected prefix.
 */

function createIncrementalDAG(initialEdges = []) {
  const adjacency = new Map();
  let order = [];
  let position = new Map();

  function addNode(node) {
    if (!adjacency.has(node)) {
      adjacency.set(node, new Set());
      position.set(node, order.length);
      order.push(node);
    }
    return node;
  }

  function rebuildPositions() {
    position = new Map(order.map((node, index) => [node, index]));
  }

  function addEdge(from, to) {
    addNode(from);
    addNode(to);

    if (adjacency.get(from).has(to)) {
      return { added: false, cycle: false, reordered: false };
    }
    if (from === to) {
      return { added: false, cycle: true, cyclePath: [from, from] };
    }

    const fromPosition = position.get(from);
    const toPosition = position.get(to);

    if (fromPosition < toPosition) {
      adjacency.get(from).add(to);
      return { added: true, cycle: false, reordered: false };
    }

    // Search forward from "to", but only inside the violated order interval.
    const parent = new Map([[to, null]]);
    const stack = [to];
    let reachedSource = false;

    while (stack.length > 0 && !reachedSource) {
      const current = stack.pop();

      for (const next of adjacency.get(current)) {
        if (position.get(next) > fromPosition || parent.has(next)) continue;
        parent.set(next, current);

        if (next === from) {
          reachedSource = true;
          break;
        }
        stack.push(next);
      }
    }

    if (reachedSource) {
      const path = [from];
      let cursor = from;
      while (cursor !== to) {
        cursor = parent.get(cursor);
        path.push(cursor);
      }
      path.reverse();
      return {
        added: false,
        cycle: true,
        cyclePath: [from, ...path]
      };
    }

    // Every node reachable from "to" in the affected prefix must move after
    // "from". Keeping their previous relative order preserves valid edges.
    const moving = new Set(parent.keys());
    const movedBlock = order.filter(node => moving.has(node));
    const remaining = order.filter(node => !moving.has(node));
    const sourceIndex = remaining.indexOf(from);
    remaining.splice(sourceIndex + 1, 0, ...movedBlock);

    order = remaining;
    rebuildPositions();
    adjacency.get(from).add(to);

    return {
      added: true,
      cycle: false,
      reordered: true,
      moved: movedBlock.slice()
    };
  }

  function removeEdge(from, to) {
    return adjacency.get(from)?.delete(to) ?? false;
  }

  function validate() {
    for (const [from, neighbors] of adjacency) {
      for (const to of neighbors) {
        if (position.get(from) >= position.get(to)) {
          throw new Error("Invalid topological order for edge " + String(from) + " -> " + String(to));
        }
      }
    }
    return true;
  }

  for (const [from, to] of initialEdges) {
    const result = addEdge(from, to);
    if (result.cycle) {
      throw new Error("Initial edges contain a directed cycle: " + result.cyclePath.map(String).join(" -> "));
    }
  }

  return Object.freeze({
    addNode,
    addEdge,
    removeEdge,
    hasEdge: (from, to) => adjacency.get(from)?.has(to) ?? false,
    getOrder: () => order.slice(),
    getNeighbors: node => [...(adjacency.get(node) ?? [])],
    validate,
    get size() {
      return order.length;
    }
  });
}

if (require.main === module) {
  const assert = require("node:assert/strict");

  const dag = createIncrementalDAG([
    ["A", "B"],
    ["C", "D"]
  ]);

  assert.deepEqual(dag.getOrder(), ["A", "B", "C", "D"]);

  const reordered = dag.addEdge("D", "B");
  assert.equal(reordered.added, true);
  assert.equal(reordered.reordered, true);
  assert.deepEqual(dag.getOrder(), ["A", "C", "D", "B"]);
  assert.equal(dag.validate(), true);

  // D -> B -> C -> D would close a cycle, so the insertion is rejected.
  const rejected = dag.addEdge("B", "C");
  assert.equal(rejected.added, false);
  assert.equal(rejected.cycle, true);
  assert.deepEqual(rejected.cyclePath, ["B", "C", "D", "B"]);
  assert.equal(dag.hasEdge("B", "C"), false);
  assert.equal(dag.validate(), true);

  assert.equal(dag.addEdge("D", "B").added, false); // duplicate
  assert.equal(dag.addEdge("X", "X").cycle, true);  // self-loop
  assert.equal(dag.removeEdge("D", "B"), true);
  assert.equal(dag.validate(), true);

  const empty = createIncrementalDAG();
  empty.addNode("isolated");
  assert.deepEqual(empty.getOrder(), ["isolated"]);

  assert.throws(() => createIncrementalDAG([["p", "q"], ["q", "p"]]), /cycle/i);
  console.log("Incremental topological ordering: all tests passed.");
}

module.exports = { createIncrementalDAG };
