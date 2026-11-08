'use strict';

/**
 * 2-SAT solver using an implication graph and iterative Kosaraju SCC.
 * Literal encoding: positive(v) = 2*v, negative(v) = 2*v + 1.
 * Returns one satisfying Boolean assignment, or null if unsatisfiable.
 */
class TwoSAT {
  constructor(variableCount) {
    if (!Number.isInteger(variableCount) || variableCount < 0) {
      throw new RangeError('variableCount must be a non-negative integer');
    }
    this.variableCount = variableCount;
    this.graph = Array.from({ length: variableCount * 2 }, () => []);
    this.reverseGraph = Array.from({ length: variableCount * 2 }, () => []);
    this.clauses = [];
  }

  positive(variable) {
    this._checkVariable(variable);
    return variable * 2;
  }

  negative(variable) {
    this._checkVariable(variable);
    return variable * 2 + 1;
  }

  _checkVariable(variable) {
    if (!Number.isInteger(variable) || variable < 0 || variable >= this.variableCount) {
      throw new RangeError(`variable index must be in [0, ${this.variableCount})`);
    }
  }

  _checkLiteral(literal) {
    if (!Number.isInteger(literal) || literal < 0 || literal >= this.variableCount * 2) {
      throw new RangeError('literal is not a valid encoded variable');
    }
  }

  negate(literal) {
    this._checkLiteral(literal);
    return literal ^ 1;
  }

  addClause(a, b) {
    this._checkLiteral(a);
    this._checkLiteral(b);
    this.clauses.push([a, b]);
    this._addImplication(this.negate(a), b);
    this._addImplication(this.negate(b), a);
    return this;
  }

  addImplication(a, b) {
    this._checkLiteral(a);
    this._checkLiteral(b);
    return this.addClause(this.negate(a), b);
  }

  addUnit(literal) {
    return this.addClause(literal, literal);
  }

  addXor(a, b) {
    this.addClause(a, b);
    this.addClause(this.negate(a), this.negate(b));
    return this;
  }

  addAtMostOne(literals) {
    if (!Array.isArray(literals)) throw new TypeError('literals must be an array');
    for (const literal of literals) this._checkLiteral(literal);
    for (let i = 0; i < literals.length; i += 1) {
      for (let j = i + 1; j < literals.length; j += 1) {
        this.addClause(this.negate(literals[i]), this.negate(literals[j]));
      }
    }
    return this;
  }

  _addImplication(from, to) {
    this.graph[from].push(to);
    this.reverseGraph[to].push(from);
  }

  solve() {
    const size = this.variableCount * 2;
    const visited = new Uint8Array(size);
    const finishOrder = [];

    // Iterative DFS avoids call-stack overflow on long implication chains.
    for (let start = 0; start < size; start += 1) {
      if (visited[start]) continue;
      visited[start] = 1;
      const stack = [{ vertex: start, nextIndex: 0 }];
      while (stack.length) {
        const frame = stack[stack.length - 1];
        const neighbors = this.graph[frame.vertex];
        if (frame.nextIndex < neighbors.length) {
          const neighbor = neighbors[frame.nextIndex++];
          if (!visited[neighbor]) {
            visited[neighbor] = 1;
            stack.push({ vertex: neighbor, nextIndex: 0 });
          }
        } else {
          finishOrder.push(frame.vertex);
          stack.pop();
        }
      }
    }

    const component = new Int32Array(size).fill(-1);
    let componentId = 0;
    for (let orderIndex = finishOrder.length - 1; orderIndex >= 0; orderIndex -= 1) {
      const start = finishOrder[orderIndex];
      if (component[start] !== -1) continue;
      component[start] = componentId;
      const stack = [start];
      while (stack.length) {
        const vertex = stack.pop();
        for (const neighbor of this.reverseGraph[vertex]) {
          if (component[neighbor] === -1) {
            component[neighbor] = componentId;
            stack.push(neighbor);
          }
        }
      }
      componentId += 1;
    }

    const assignment = Array(this.variableCount);
    for (let variable = 0; variable < this.variableCount; variable += 1) {
      const positive = variable * 2;
      const negative = positive + 1;
      if (component[positive] === component[negative]) return null;
      assignment[variable] = component[positive] > component[negative];
    }
    return assignment;
  }

  isSatisfiedBy(assignment) {
    if (!Array.isArray(assignment) || assignment.length !== this.variableCount ||
        assignment.some(value => typeof value !== 'boolean')) {
      throw new TypeError('assignment must be a Boolean array with one entry per variable');
    }
    const literalValue = literal =>
      (literal % 2 === 0) === assignment[Math.floor(literal / 2)];
    return this.clauses.every(([a, b]) => literalValue(a) || literalValue(b));
  }
}

function bruteForceSatisfiable(variableCount, clauses) {
  for (let mask = 0; mask < 2 ** variableCount; mask += 1) {
    const assignment = Array.from(
      { length: variableCount },
      (_, variable) => Boolean(mask & (1 << variable))
    );
    const literalValue = literal =>
      (literal % 2 === 0) === assignment[Math.floor(literal / 2)];
    if (clauses.every(([a, b]) => literalValue(a) || literalValue(b))) return assignment;
  }
  return null;
}

function runTests() {
  const assert = require('node:assert/strict');
  const sat = new TwoSAT(3);
  const x = sat.positive(0), y = sat.positive(1), z = sat.positive(2);
  sat.addClause(x, y).addClause(sat.negative(0), z).addUnit(y);
  const assignment = sat.solve();
  assert.notEqual(assignment, null);
  assert.equal(sat.isSatisfiedBy(assignment), true);

  const unsat = new TwoSAT(1);
  unsat.addUnit(unsat.positive(0)).addUnit(unsat.negative(0));
  assert.equal(unsat.solve(), null);

  const exactlyOne = new TwoSAT(3);
  const choices = [exactlyOne.positive(0), exactlyOne.positive(1), exactlyOne.positive(2)];
  exactlyOne.addClause(choices[0], choices[1]);
  exactlyOne.addAtMostOne(choices);
  const one = exactlyOne.solve();
  assert.equal(one.filter(Boolean).length, 1);
  assert.equal(exactlyOne.isSatisfiedBy(one), true);

  assert.throws(() => new TwoSAT(-1), RangeError);
  assert.throws(() => sat.addClause(99, x), RangeError);

  // Exhaustive differential testing against all assignments for small formulas.
  let seed = 0xdeadbeef;
  const random = max => ((seed = (seed * 1664525 + 1013904223) >>> 0) % max);
  for (let trial = 0; trial < 700; trial += 1) {
    const variables = 1 + random(7);
    const solver = new TwoSAT(variables);
    const clauses = [];
    const count = random(22);
    for (let i = 0; i < count; i += 1) {
      const a = random(variables * 2), b = random(variables * 2);
      clauses.push([a, b]);
      solver.addClause(a, b);
    }
    const expected = bruteForceSatisfiable(variables, clauses);
    const actual = solver.solve();
    assert.equal(actual === null, expected === null);
    if (actual !== null) assert.equal(solver.isSatisfiedBy(actual), true);
  }

  // Long implication chain validates non-recursive SCC traversal.
  const large = new TwoSAT(12000);
  for (let variable = 0; variable < 11999; variable += 1) {
    large.addImplication(large.positive(variable), large.positive(variable + 1));
  }
  assert.equal(large.solve().length, 12000);
  console.log('2-SAT constraint solver tests passed');
}

if (require.main === module) runTests();
module.exports = { TwoSAT, bruteForceSatisfiable };
