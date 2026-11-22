/**
 * Exercise: Solve a 2-SAT formula using implication graphs and Kosaraju SCC.
 * A literal is a signed integer: +k means x_k, -k means NOT x_k.
 * Each clause is [a, b] and represents (a OR b).
 * Return one satisfying assignment or null when the formula is unsatisfiable.
 * Run: node 16-two-sat-implication-graph.js
 */
"use strict";
const assert = require("node:assert/strict");

function solveTwoSat(variableCount, clauses) {
  if (!Number.isInteger(variableCount) || variableCount < 0) throw new RangeError("invalid variable count");
  const size = variableCount * 2;
  const graph = Array.from({ length: size }, () => []);
  const reverse = Array.from({ length: size }, () => []);
  const vertex = literal => {
    if (!Number.isInteger(literal) || literal === 0 || Math.abs(literal) > variableCount) {
      throw new RangeError("literal outside declared variable range");
    }
    const positive = 2 * (Math.abs(literal) - 1);
    return literal > 0 ? positive : positive + 1;
  };
  const addEdge = (from, to) => { graph[from].push(to); reverse[to].push(from); };

  for (const clause of clauses) {
    if (!Array.isArray(clause) || clause.length !== 2) throw new TypeError("each clause must contain two literals");
    const a = vertex(clause[0]), b = vertex(clause[1]);
    addEdge(a ^ 1, b);
    addEdge(b ^ 1, a);
  }

  const visited = Array(size).fill(false), order = [];
  function dfs1(start) {
    const stack = [[start, 0]];
    visited[start] = true;
    while (stack.length) {
      const frame = stack.at(-1);
      const neighbors = graph[frame[0]];
      if (frame[1] < neighbors.length) {
        const next = neighbors[frame[1]++];
        if (!visited[next]) { visited[next] = true; stack.push([next, 0]); }
      } else {
        order.push(frame[0]);
        stack.pop();
      }
    }
  }
  for (let v = 0; v < size; v++) if (!visited[v]) dfs1(v);

  const component = Array(size).fill(-1);
  let componentId = 0;
  for (let i = order.length - 1; i >= 0; i--) {
    const start = order[i];
    if (component[start] !== -1) continue;
    const stack = [start];
    component[start] = componentId;
    while (stack.length) {
      const current = stack.pop();
      for (const next of reverse[current]) {
        if (component[next] === -1) {
          component[next] = componentId;
          stack.push(next);
        }
      }
    }
    componentId++;
  }

  const assignment = Array(variableCount).fill(false);
  for (let i = 0; i < variableCount; i++) {
    const positive = 2 * i, negative = positive + 1;
    if (component[positive] === component[negative]) return null;
    assignment[i] = component[positive] > component[negative];
  }
  return assignment;
}

function satisfies(assignment, clauses) {
  const value = literal => literal > 0 ? assignment[literal - 1] : !assignment[-literal - 1];
  return clauses.every(([a, b]) => value(a) || value(b));
}

const clauses = [[1, 2], [-1, 3], [-2, 3], [-3, 1]];
const assignment = solveTwoSat(3, clauses);
assert.ok(assignment);
assert.ok(satisfies(assignment, clauses));
assert.equal(solveTwoSat(1, [[1, 1], [-1, -1]]), null);
assert.deepEqual(solveTwoSat(0, []), []);
assert.throws(() => solveTwoSat(2, [[0, 1]]), RangeError);
console.log("2-SAT tests passed");
module.exports = { solveTwoSat, satisfies };
