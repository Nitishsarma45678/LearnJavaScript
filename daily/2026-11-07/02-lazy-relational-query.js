'use strict';

/**
 * Exercise: Implement a small immutable, deferred relational query builder.
 *
 * The builder should support where/select/flatMap/skip/take/distinct/orderBy,
 * a hash join that preserves left-row and right-match order, grouping, and
 * aggregation. Query construction must not execute user callbacks; every
 * terminal operation performs a fresh evaluation.
 */

function requireFunction(fn, name) {
  if (typeof fn !== 'function') throw new TypeError(`${name} must be a function`);
  return fn;
}

function requireCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
  return value;
}

class Query {
  constructor(sourceFactory, operations = []) {
    this._sourceFactory = sourceFactory;
    this._operations = operations;
    Object.freeze(this._operations);
    Object.freeze(this);
  }

  _append(operation) {
    return new Query(this._sourceFactory, [...this._operations, Object.freeze(operation)]);
  }

  where(predicate) { return this._append({ type: 'where', fn: requireFunction(predicate, 'predicate') }); }
  select(project) { return this._append({ type: 'select', fn: requireFunction(project, 'project') }); }
  flatMap(project) { return this._append({ type: 'flatMap', fn: requireFunction(project, 'project') }); }
  skip(count) { return this._append({ type: 'skip', count: requireCount(count, 'skip count') }); }
  take(count) { return this._append({ type: 'take', count: requireCount(count, 'take count') }); }
  distinctBy(keyFn = (value) => value) {
    return this._append({ type: 'distinctBy', fn: requireFunction(keyFn, 'keyFn') });
  }
  orderBy(compare) {
    return this._append({ type: 'orderBy', fn: requireFunction(compare, 'compare') });
  }
  join(other, leftKey, rightKey, project = (left, right) => [left, right]) {
    if (!(other instanceof Query)) throw new TypeError('join expects another Query');
    return this._append({
      type: 'join', other,
      leftKey: requireFunction(leftKey, 'leftKey'),
      rightKey: requireFunction(rightKey, 'rightKey'),
      project: requireFunction(project, 'project'),
    });
  }

  toArray() {
    let rows = Array.from(this._sourceFactory());
    for (const operation of this._operations) {
      switch (operation.type) {
        case 'where':
          rows = rows.filter(operation.fn);
          break;
        case 'select':
          rows = rows.map(operation.fn);
          break;
        case 'flatMap':
          rows = rows.flatMap((row, index) => {
            const result = operation.fn(row, index);
            if (result == null || typeof result[Symbol.iterator] !== 'function') {
              throw new TypeError('flatMap callback must return an iterable');
            }
            return Array.from(result);
          });
          break;
        case 'skip':
          rows = rows.slice(operation.count);
          break;
        case 'take':
          rows = rows.slice(0, operation.count);
          break;
        case 'distinctBy': {
          const seen = new Set();
          rows = rows.filter((row, index) => {
            const key = operation.fn(row, index);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          break;
        }
        case 'orderBy':
          rows = rows.map((value, index) => ({ value, index }))
            .sort((a, b) => operation.fn(a.value, b.value) || a.index - b.index)
            .map((entry) => entry.value);
          break;
        case 'join': {
          const rightRows = operation.other.toArray();
          const index = new Map();
          for (const right of rightRows) {
            const key = operation.rightKey(right);
            if (!index.has(key)) index.set(key, []);
            index.get(key).push(right);
          }
          const joined = [];
          for (const left of rows) {
            const matches = index.get(operation.leftKey(left)) || [];
            for (const right of matches) joined.push(operation.project(left, right));
          }
          rows = joined;
          break;
        }
        default:
          throw new Error(`unknown query operation: ${operation.type}`);
      }
    }
    return rows;
  }

  groupBy(keyFn) {
    requireFunction(keyFn, 'keyFn');
    const groups = new Map();
    for (const row of this.toArray()) {
      const key = keyFn(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return groups;
  }

  reduce(reducer, initialValue) {
    requireFunction(reducer, 'reducer');
    if (arguments.length < 2) return this.toArray().reduce(reducer);
    return this.toArray().reduce(reducer, initialValue);
  }

  count(predicate = null) {
    if (predicate === null) return this.toArray().length;
    requireFunction(predicate, 'predicate');
    return this.toArray().filter(predicate).length;
  }
}

function from(iterable) {
  if (iterable == null || typeof iterable[Symbol.iterator] !== 'function') {
    throw new TypeError('from expects an iterable');
  }
  // Snapshot the iterable once so one-shot generators remain repeatable.
  const snapshot = Array.from(iterable);
  return new Query(() => snapshot.slice());
}

// ------------------------------ Tests ------------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  let predicateCalls = 0;
  const source = from([
    { id: 1, dept: 'eng', score: 8 },
    { id: 2, dept: 'sales', score: 6 },
    { id: 3, dept: 'eng', score: 9 },
    { id: 4, dept: 'sales', score: 6 },
  ]);
  const deferred = source.where((row) => { predicateCalls++; return row.score >= 6; })
    .select((row) => ({ ...row, passed: true }));
  assert.equal(predicateCalls, 0, 'callbacks must be deferred until execution');
  assert.equal(deferred.count(), 4);
  assert.equal(predicateCalls, 4);
  assert.equal(deferred.toArray().length, 4, 'each terminal call performs a fresh evaluation');
  assert.equal(predicateCalls, 8);

  const distinct = from([1, 2, 2, 3, 1, 4]).distinctBy().skip(1).take(2).toArray();
  assert.deepEqual(distinct, [2, 3]);
  assert.deepEqual(from([3, 1, 2, 2]).orderBy((a, b) => a - b).toArray(), [1, 2, 2, 3]);
  assert.deepEqual(from([1, 2, 3]).flatMap((n) => [n, -n]).toArray(), [1, -1, 2, -2, 3, -3]);

  const employees = from([
    { name: 'Ada', teamId: 1 },
    { name: 'Lin', teamId: 2 },
    { name: 'Grace', teamId: 1 },
    { name: 'NoTeam', teamId: null },
  ]);
  const teams = from([
    { id: 1, label: 'Platform' },
    { id: 1, label: 'Platform-Backup' },
    { id: 2, label: 'Research' },
    { id: null, label: 'Unassigned' },
  ]);
  const joined = employees.join(teams, (e) => e.teamId, (t) => t.id,
    (employee, team) => `${employee.name}:${team.label}`).toArray();
  assert.deepEqual(joined, [
    'Ada:Platform', 'Ada:Platform-Backup', 'Lin:Research',
    'Grace:Platform', 'Grace:Platform-Backup', 'NoTeam:Unassigned',
  ]);

  const groups = source.groupBy((row) => row.dept);
  assert.deepEqual(groups.get('eng').map((row) => row.id), [1, 3]);
  assert.equal(source.reduce((sum, row) => sum + row.score, 0), 29);
  assert.throws(() => from([1]).take(-1), /non-negative/);
  assert.throws(() => from([1]).flatMap(() => 7).toArray(), /iterable/);

  console.log('lazy-relational-query: all tests passed');
}

module.exports = { Query, from };
