'use strict';

/**
 * 2-SAT solver using iterative Kosaraju SCC decomposition.
 * Literal encoding: node 2*v means x_v, node 2*v+1 means !x_v.
 * Clauses are (x_a === aValue) OR (x_b === bValue); omit b for a unit clause.
 */
class TwoSAT {
  constructor(variableCount) {
    if (!Number.isInteger(variableCount) || variableCount < 0) {
      throw new RangeError('variableCount must be a non-negative integer');
    }
    this.variableCount = variableCount;
    this.graph = Array.from({ length: variableCount * 2 }, () => []);
    this.reverse = Array.from({ length: variableCount * 2 }, () => []);
    this.clauses = [];
  }

  literal(variable, value = true) {
    if (!Number.isInteger(variable) || variable < 0 || variable >= this.variableCount) {
      throw new RangeError('variable index is out of range');
    }
    if (typeof value !== 'boolean') throw new TypeError('literal value must be boolean');
    return 2 * variable + (value ? 0 : 1);
  }

  addImplication(from, to) {
    this.graph[from].push(to);
    this.reverse[to].push(from);
  }

  addClause(a, aValue, b, bValue) {
    const left = this.literal(a, aValue);
    const right = b === undefined ? null : this.literal(b, bValue);
    if (right === null) {
      this.addImplication(left ^ 1, left);
    } else {
      this.addImplication(left ^ 1, right);
      this.addImplication(right ^ 1, left);
    }
    this.clauses.push(right === null ? [[a, aValue]] : [[a, aValue], [b, bValue]]);
    return this;
  }

  /** Iterative DFS avoids call-stack overflow on long implication chains. */
  stronglyConnectedComponents() {
    const count = this.graph.length;
    const visited = new Uint8Array(count);
    const order = [];

    for (let start = 0; start < count; start++) {
      if (visited[start]) continue;
      visited[start] = 1;
      const stack = [[start, 0]];
      while (stack.length) {
        const frame = stack[stack.length - 1];
        const neighbors = this.graph[frame[0]];
        if (frame[1] < neighbors.length) {
          const next = neighbors[frame[1]++];
          if (!visited[next]) {
            visited[next] = 1;
            stack.push([next, 0]);
          }
        } else {
          order.push(frame[0]);
          stack.pop();
        }
      }
    }

    const component = new Int32Array(count).fill(-1);
    let componentId = 0;
    for (let i = order.length - 1; i >= 0; i--) {
      const start = order[i];
      if (component[start] !== -1) continue;
      component[start] = componentId;
      const stack = [start];
      while (stack.length) {
        const vertex = stack.pop();
        for (const next of this.reverse[vertex]) {
          if (component[next] === -1) {
            component[next] = componentId;
            stack.push(next);
          }
        }
      }
      componentId++;
    }
    return component;
  }

  findPath(start, target, component, componentId) {
    const parent = new Int32Array(this.graph.length).fill(-1);
    const queue = [start];
    parent[start] = start;
    for (let head = 0; head < queue.length; head++) {
      const vertex = queue[head];
      if (vertex === target) break;
      for (const next of this.graph[vertex]) {
        if (component[next] === componentId && parent[next] === -1) {
          parent[next] = vertex;
          queue.push(next);
        }
      }
    }
    if (parent[target] === -1) return [];
    const path = [];
    for (let at = target; at !== start; at = parent[at]) path.push(at);
    path.push(start);
    return path.reverse();
  }

  solve({ explainUnsatisfiable = false } = {}) {
    const component = this.stronglyConnectedComponents();
    const assignment = Array(this.variableCount);
    for (let variable = 0; variable < this.variableCount; variable++) {
      const positive = 2 * variable;
      const negative = positive + 1;
      if (component[positive] === component[negative]) {
        const result = { satisfiable: false, assignment: null };
        if (explainUnsatisfiable) {
          const id = component[positive];
          result.conflict = {
            variable,
            trueToFalse: this.findPath(positive, negative, component, id),
            falseToTrue: this.findPath(negative, positive, component, id)
          };
        }
        return result;
      }
      assignment[variable] = component[positive] > component[negative];
    }
    return { satisfiable: true, assignment, component: Array.from(component) };
  }
}

function runTests() {
  const assert = require('node:assert/strict');
  const satisfiable = new TwoSAT(3)
    .addClause(0, true, 1, true)
    .addClause(0, false, 2, true)
    .addClause(1, false, 2, false)
    .solve();
  assert.equal(satisfiable.satisfiable, true);
  assert.deepEqual(satisfiable.assignment, [true, false, true]);

  const impossible = new TwoSAT(1)
    .addClause(0, true)
    .addClause(0, false)
    .solve({ explainUnsatisfiable: true });
  assert.equal(impossible.satisfiable, false);
  assert.equal(impossible.conflict.variable, 0);
  assert(impossible.conflict.trueToFalse.length > 1);
  assert(impossible.conflict.falseToTrue.length > 1);
  assert.equal(new TwoSAT(0).solve().satisfiable, true);
  assert.throws(() => new TwoSAT(1).addClause(2, true), RangeError);

  function brute(n, clauses) {
    for (let mask = 0; mask < 2 ** n; mask++) {
      const values = Array.from({ length: n }, (_, i) => Boolean(mask & (1 << i)));
      const valid = clauses.every(clause => clause.some(([v, wanted]) => values[v] === wanted));
      if (valid) return values;
    }
    return null;
  }
  let seed = 0x2a7;
  const random = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  for (let trial = 0; trial < 300; trial++) {
    const n = random(7);
    const solver = new TwoSAT(n);
    const clauses = [];
    const clauseCount = random(18);
    for (let i = 0; i < clauseCount; i++) {
      const a = random(n || 1);
      const av = Boolean(random(2));
      if (n === 0) break;
      if (random(5) === 0) {
        solver.addClause(a, av);
        clauses.push([[a, av]]);
      } else {
        const b = random(n);
        const bv = Boolean(random(2));
        solver.addClause(a, av, b, bv);
        clauses.push([[a, av], [b, bv]]);
      }
    }
    const expected = brute(n, clauses);
    const actual = solver.solve();
    assert.equal(actual.satisfiable, expected !== null);
    if (actual.satisfiable) {
      assert(clauses.every(clause => clause.some(([v, wanted]) => actual.assignment[v] === wanted)));
    }
  }
  console.log('2-SAT tests passed');
}

if (require.main === module) runTests();
module.exports = { TwoSAT };
