'use strict';

const assert = require('node:assert/strict');

/**
 * Compute dominators for nodes reachable from entry using the
 * Cooper-Harvey-Kennedy iterative algorithm.
 *
 * graph: Map<Node, Node[]> or object mapping node labels to successor labels.
 * Returns reverse postorder, immediate dominators, dominator-tree children,
 * dominance frontiers, and a dominates(a, b) query.
 */
function computeDominators(graph, entry) {
  const adjacency = graph instanceof Map
    ? new Map([...graph].map(([node, edges]) => [node, [...edges]]))
    : new Map(Object.entries(graph).map(([node, edges]) => [node, [...edges]]));

  for (const edges of adjacency.values()) {
    for (const next of edges) if (!adjacency.has(next)) adjacency.set(next, []);
  }
  if (!adjacency.has(entry)) throw new Error('entry node is not in the graph');

  const visited = new Set([entry]);
  const postorder = [];
  const stack = [{ node: entry, nextIndex: 0 }];
  while (stack.length) {
    const frame = stack[stack.length - 1];
    const edges = adjacency.get(frame.node);
    if (frame.nextIndex < edges.length) {
      const next = edges[frame.nextIndex++];
      if (!visited.has(next)) {
        visited.add(next);
        stack.push({ node: next, nextIndex: 0 });
      }
    } else {
      postorder.push(frame.node);
      stack.pop();
    }
  }

  const rpo = postorder.reverse();
  const rpoIndex = new Map(rpo.map((node, index) => [node, index]));
  const predecessors = new Map(rpo.map(node => [node, []]));
  for (const node of rpo) {
    for (const next of adjacency.get(node)) {
      if (visited.has(next)) predecessors.get(next).push(node);
    }
  }

  const idom = new Map([[entry, entry]]);
  const intersect = (left, right) => {
    let a = left, b = right;
    while (a !== b) {
      while (rpoIndex.get(a) > rpoIndex.get(b)) a = idom.get(a);
      while (rpoIndex.get(b) > rpoIndex.get(a)) b = idom.get(b);
    }
    return a;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of rpo) {
      if (node === entry) continue;
      const knownPreds = predecessors.get(node).filter(pred => idom.has(pred));
      if (knownPreds.length === 0) continue;

      let candidate = knownPreds[0];
      for (let i = 1; i < knownPreds.length; i++) {
        candidate = intersect(knownPreds[i], candidate);
      }
      if (idom.get(node) !== candidate) {
        idom.set(node, candidate);
        changed = true;
      }
    }
  }

  const children = new Map(rpo.map(node => [node, []]));
  for (const node of rpo) {
    if (node !== entry && idom.has(node)) children.get(idom.get(node)).push(node);
  }

  const frontier = new Map(rpo.map(node => [node, new Set()]));
  for (const node of rpo) {
    const preds = predecessors.get(node);
    if (preds.length < 2 || !idom.has(node)) continue;
    for (const pred of preds) {
      let runner = pred;
      while (runner !== idom.get(node)) {
        frontier.get(runner).add(node);
        const parent = idom.get(runner);
        if (parent === undefined || parent === runner) break;
        runner = parent;
      }
    }
  }

  function dominates(a, b) {
    if (!idom.has(a) || !idom.has(b)) return false;
    let current = b;
    while (current !== idom.get(current)) {
      if (current === a) return true;
      current = idom.get(current);
    }
    return current === a;
  }

  return { rpo, idom, children, frontier, dominates };
}

const diamond = computeDominators({
  entry: ['left', 'right'],
  left: ['join'],
  right: ['join'],
  join: ['exit'],
  exit: [],
  unreachable: ['unreachable']
}, 'entry');

assert.equal(diamond.idom.get('entry'), 'entry');
assert.equal(diamond.idom.get('left'), 'entry');
assert.equal(diamond.idom.get('right'), 'entry');
assert.equal(diamond.idom.get('join'), 'entry');
assert.equal(diamond.idom.get('exit'), 'join');
assert.equal(diamond.dominates('entry', 'exit'), true);
assert.equal(diamond.dominates('left', 'join'), false);
assert.equal(diamond.idom.has('unreachable'), false);
assert.equal(diamond.frontier.get('left').has('join'), true);
assert.equal(diamond.frontier.get('right').has('join'), true);

const loop = computeDominators({
  entry: ['header'],
  header: ['body', 'exit'],
  body: ['header'],
  exit: []
}, 'entry');
assert.equal(loop.idom.get('header'), 'entry');
assert.equal(loop.idom.get('body'), 'header');
assert.equal(loop.idom.get('exit'), 'header');
assert.equal(loop.frontier.get('body').has('header'), true);
assert.equal(loop.dominates('header', 'body'), true);
assert.equal(loop.dominates('body', 'exit'), false);

assert.throws(() => computeDominators({ a: [] }, 'missing'), /entry node/);

console.log('Control-flow dominator tests passed');