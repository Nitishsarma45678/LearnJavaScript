'use strict';

/**
 * A synchronous reactive spreadsheet with lazy formula evaluation, caching,
 * dynamic dependency tracking and cycle detection. Formula functions receive
 * { get } and may choose dependencies conditionally; dependencies are rewired
 * after each successful evaluation.
 */
class ReactiveSheet {
  constructor() {
    this.cells = new Map();
    this.evaluationStack = [];
  }

  _requireName(name) {
    if (typeof name !== 'string' || name.length === 0) throw new TypeError('cell name must be a non-empty string');
  }

  _cell(name) {
    const cell = this.cells.get(name);
    if (!cell) throw new Error(`unknown cell: ${name}`);
    return cell;
  }

  set(name, value) {
    this._requireName(name);
    let cell = this.cells.get(name);
    if (!cell) {
      cell = { kind: 'input', value, compute: null, dependencies: new Set(), dependents: new Set(), dirty: false, evaluating: false, listeners: new Set() };
      this.cells.set(name, cell);
    } else {
      this._detachDependencies(name, cell);
      cell.kind = 'input';
      cell.value = value;
      cell.compute = null;
      cell.dirty = false;
      cell.evaluating = false;
    }
    this._invalidateDependents(name);
    this._notifyIfChanged(name, value);
    return this;
  }

  define(name, compute) {
    this._requireName(name);
    if (typeof compute !== 'function') throw new TypeError('formula must be a function');
    let cell = this.cells.get(name);
    if (!cell) {
      cell = { kind: 'formula', value: undefined, compute, dependencies: new Set(), dependents: new Set(), dirty: true, evaluating: false, listeners: new Set() };
      this.cells.set(name, cell);
    } else {
      this._detachDependencies(name, cell);
      cell.kind = 'formula';
      cell.compute = compute;
      cell.dirty = true;
      cell.evaluating = false;
    }
    this._invalidateDependents(name);
    return this;
  }

  _detachDependencies(name, cell) {
    for (const dependency of cell.dependencies) this.cells.get(dependency)?.dependents.delete(name);
    cell.dependencies.clear();
  }

  _invalidateDependents(name) {
    const queue = [...(this.cells.get(name)?.dependents || [])];
    const visited = new Set();
    while (queue.length) {
      const dependentName = queue.shift();
      if (visited.has(dependentName)) continue;
      visited.add(dependentName);
      const dependent = this.cells.get(dependentName);
      if (!dependent) continue;
      if (dependent.kind === 'formula') dependent.dirty = true;
      queue.push(...dependent.dependents);
    }
  }

  get(name) {
    this._requireName(name);
    const parentName = this.evaluationStack[this.evaluationStack.length - 1];
    if (parentName !== undefined) this._cell(parentName).pendingDependencies.add(name);

    const cell = this._cell(name);
    if (cell.kind === 'input') return cell.value;
    if (!cell.dirty) return cell.value;
    if (cell.evaluating) {
      const cycleStart = this.evaluationStack.indexOf(name);
      const cycle = [...this.evaluationStack.slice(cycleStart), name].join(' -> ');
      throw new Error(`formula cycle detected: ${cycle}`);
    }

    cell.evaluating = true;
    cell.pendingDependencies = new Set();
    this.evaluationStack.push(name);
    let nextValue;
    try {
      nextValue = cell.compute({ get: dependency => this.get(dependency) });
      if (nextValue && typeof nextValue.then === 'function') {
        throw new TypeError(`formula ${name} returned a Promise; formulas must be synchronous`);
      }
    } catch (error) {
      cell.dirty = true;
      throw error;
    } finally {
      this.evaluationStack.pop();
      cell.evaluating = false;
    }

    const previousValue = cell.value;
    const nextDependencies = cell.pendingDependencies;
    delete cell.pendingDependencies;
    for (const dependency of cell.dependencies) {
      if (!nextDependencies.has(dependency)) this.cells.get(dependency)?.dependents.delete(name);
    }
    for (const dependency of nextDependencies) {
      if (!this.cells.has(dependency)) throw new Error(`formula ${name} read unknown cell: ${dependency}`);
      this.cells.get(dependency).dependents.add(name);
    }
    cell.dependencies = nextDependencies;
    cell.value = nextValue;
    cell.dirty = false;
    if (!Object.is(previousValue, nextValue)) this._notifyIfChanged(name, nextValue, previousValue);
    return nextValue;
  }

  subscribe(name, listener) {
    this._requireName(name);
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    const cell = this._cell(name);
    cell.listeners.add(listener);
    return () => cell.listeners.delete(listener);
  }

  _notifyIfChanged(name, value, previousValue) {
    const cell = this.cells.get(name);
    if (!cell) return;
    for (const listener of [...cell.listeners]) listener(value, previousValue, name);
  }

  inspect(name) {
    const cell = this._cell(name);
    return {
      kind: cell.kind,
      dirty: cell.dirty,
      dependencies: [...cell.dependencies].sort(),
      dependents: [...cell.dependents].sort()
    };
  }
}

function runTests() {
  const assert = require('node:assert/strict');
  const sheet = new ReactiveSheet();
  let evaluations = 0;
  sheet.set('mode', 'gross').set('gross', 120).set('net', 90).set('tax', 0.2);
  sheet.define('total', ({ get }) => {
    evaluations += 1;
    return get('mode') === 'gross' ? get('gross') : get('net') * (1 + get('tax'));
  });
  assert.equal(sheet.get('total'), 120);
  assert.equal(sheet.get('total'), 120);
  assert.equal(evaluations, 1);
  assert.deepEqual(sheet.inspect('total').dependencies, ['gross', 'mode']);

  sheet.set('net', 100);
  assert.equal(sheet.get('total'), 120);
  assert.equal(evaluations, 1);
  sheet.set('mode', 'net');
  assert.equal(sheet.get('total'), 120);
  assert.deepEqual(sheet.inspect('total').dependencies, ['mode', 'net', 'tax']);
  sheet.set('gross', 500);
  assert.equal(sheet.get('total'), 120);
  assert.equal(evaluations, 2);
  sheet.set('tax', 0.1);
  assert.ok(Math.abs(sheet.get('total') - 110) < 1e-10);

  let notifications = 0;
  const unsubscribe = sheet.subscribe('net', () => { notifications += 1; });
  sheet.set('net', 200);
  assert.equal(notifications, 1);
  unsubscribe();
  sheet.set('net', 300);
  assert.equal(notifications, 1);

  const cyclic = new ReactiveSheet();
  cyclic.define('A', ({ get }) => get('B') + 1);
  cyclic.define('B', ({ get }) => get('A') + 1);
  assert.throws(() => cyclic.get('A'), /cycle detected/);

  const recovery = new ReactiveSheet();
  recovery.set('denominator', 0).set('numerator', 10);
  recovery.define('quotient', ({ get }) => {
    const denominator = get('denominator');
    if (denominator === 0) throw new RangeError('division by zero');
    return get('numerator') / denominator;
  });
  assert.throws(() => recovery.get('quotient'), /division by zero/);
  recovery.set('denominator', 2);
  assert.equal(recovery.get('quotient'), 5);
  recovery.define('asyncCell', async () => 1);
  assert.throws(() => recovery.get('asyncCell'), /must be synchronous/);
  console.log('Reactive spreadsheet engine tests passed');
}

if (require.main === module) runTests();
module.exports = { ReactiveSheet };
