'use strict';

const assert = require('node:assert/strict');

/**
 * Solve a 2-SAT instance.
 * Literals are signed, one-based variable numbers: 1 means x1, -1 means !x1.
 * Each clause is a pair [a, b] representing (a OR b).
 * Returns a boolean assignment, or null when the instance is unsatisfiable.
 */
function solveTwoSAT(variableCount, clauses) {
  if (!Number.isInteger(variableCount) || variableCount < 0) {
    throw new RangeError('variableCount must be a non-negative integer');
  }
  if (!Array.isArray(clauses)) throw new TypeError('clauses must be an array');

  const nodeCount = variableCount * 2;
  const graph = Array.from({ length: nodeCount }, () => []);
  const reverse = Array.from({ length: nodeCount }, () => []);

  const nodeOf = literal => {
    if (!Number.isInteger(literal) || literal === 0 || Math.abs(literal) > variableCount) {
      throw new RangeError(`Invalid literal: ${literal}`);
    }
    return 2 * (Math.abs(literal) - 1) + (literal > 0 ? 1 : 0);
  };
  const addEdge = (from, to) => {
    graph[from].push(to);
    reverse[to].push(from);
  };

  for (const clause of clauses) {
    if (!Array.isArray(clause) || clause.length !== 2) {
      throw new TypeError('Each clause must contain exactly two literals');
    }
    const a = nodeOf(clause[0]);
    const b = nodeOf(clause[1]);
    addEdge(a ^ 1, b);
    addEdge(b ^ 1, a);
  }

  // First Kosaraju pass: iterative DFS finishing order avoids call-stack limits.
  const visited = new Uint8Array(nodeCount);
  const finishOrder = [];
  for (let start = 0; start < nodeCount; start++) {
    if (visited[start]) continue;
    visited[start] = 1;
    const stack = [[start, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const vertex = top[0];
      if (top[1] < graph[vertex].length) {
        const next = graph[vertex][top[1]++];
        if (!visited[next]) {
          visited[next] = 1;
          stack.push([next, 0]);
        }
      } else {
        finishOrder.push(vertex);
        stack.pop();
      }
    }
  }

  // Second pass assigns strongly connected component identifiers.
  const component = new Int32Array(nodeCount);
  component.fill(-1);
  let componentId = 0;
  for (let i = finishOrder.length - 1; i >= 0; i--) {
    const start = finishOrder[i];
    if (component[start] !== -1) continue;
    component[start] = componentId;
    const stack = [start];
    while (stack.length) {
      const vertex = stack.pop();
      for (const next of reverse[vertex]) {
        if (component[next] === -1) {
          component[next] = componentId;
          stack.push(next);
        }
      }
    }
    componentId++;
  }

  const assignment = new Array(variableCount);
  for (let variable = 0; variable < variableCount; variable++) {
    const falseNode = 2 * variable;
    const trueNode = falseNode + 1;
    if (component[falseNode] === component[trueNode]) return null;
    assignment[variable] = component[trueNode] > component[falseNode];
  }
  return assignment;
}

function satisfies(assignment, clauses) {
  const value = literal => literal > 0
    ? assignment[literal - 1]
    : !assignment[-literal - 1];
  return clauses.every(([a, b]) => value(a) || value(b));
}

if (require.main === module) {
  const clauses = [[1, 2], [-1, 2], [1, -2]];
  const solution = solveTwoSAT(2, clauses);
  assert.ok(solution);
  assert.equal(satisfies(solution, clauses), true);
  assert.equal(solveTwoSAT(1, [[1, 1], [-1, -1]]), null);
  assert.deepEqual(solveTwoSAT(0, []), []);
  assert.throws(() => solveTwoSAT(1, [[0, 1]]), RangeError);
  assert.throws(() => solveTwoSAT(1, [[1]]), TypeError);
  console.log('2-SAT solver tests passed');
}

module.exports = { solveTwoSAT, satisfies };
