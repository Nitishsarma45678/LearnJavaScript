'use strict';

// Exercise: compose reusable comparators and perform stable multi-key sorting.
// Null placement is independent of ascending/descending value order.

const assert = require('node:assert/strict');

function valueAt(record, path) {
  if (typeof path === 'function') return path(record);
  const parts = Array.isArray(path) ? path : String(path).split('.');
  return parts.reduce((value, key) => value == null ? undefined : value[key], record);
}

function compareValues(a, b, collator) {
  if (Object.is(a, b)) return 0;
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (typeof a === 'string' && typeof b === 'string') return collator.compare(a, b);
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a)) return Number.isNaN(b) ? 0 : 1;
    if (Number.isNaN(b)) return -1;
    return a < b ? -1 : 1;
  }
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : 1;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a ? 1 : -1;
  const left = String(a);
  const right = String(b);
  return collator.compare(left, right);
}

function by(path, options = {}) {
  const { direction = 'asc', nulls = 'last', sensitivity = 'base', numeric = true } = options;
  if (!['asc', 'desc'].includes(direction)) throw new RangeError('direction must be asc or desc');
  if (!['first', 'last'].includes(nulls)) throw new RangeError('nulls must be first or last');
  const collator = new Intl.Collator(options.locale, { sensitivity, numeric });
  const sign = direction === 'asc' ? 1 : -1;

  return (left, right) => {
    const a = valueAt(left, path);
    const b = valueAt(right, path);
    const aNull = a == null;
    const bNull = b == null;
    if (aNull || bNull) {
      if (aNull && bNull) return 0;
      return aNull === (nulls === 'first') ? -1 : 1;
    }
    return sign * compareValues(a, b, collator);
  };
}

function composeComparators(...comparators) {
  if (comparators.some((fn) => typeof fn !== 'function')) {
    throw new TypeError('every comparator must be a function');
  }
  return (a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result < 0 ? -1 : 1;
    }
    return 0;
  };
}

function stableSort(items, comparator) {
  if (!Array.isArray(items) || typeof comparator !== 'function') {
    throw new TypeError('items and comparator are required');
  }
  return items.map((value, index) => ({ value, index }))
    .sort((a, b) => comparator(a.value, b.value) || a.index - b.index)
    .map((entry) => entry.value);
}

const employees = [
  { name: 'Mira', team: 'Platform', score: 91, joined: '2024-03-01' },
  { name: 'Asha', team: 'Platform', score: 91, joined: '2023-07-01' },
  { name: 'Zed', team: 'Data', score: 88, joined: '2022-01-01' },
  { name: 'Noor', team: 'Data', score: null, joined: '2024-01-01' }
];
const compareEmployees = composeComparators(
  by('team'),
  by('score', { direction: 'desc', nulls: 'last' }),
  by('joined'),
  by('name')
);
assert.deepEqual(stableSort(employees, compareEmployees).map((x) => x.name),
  ['Zed', 'Noor', 'Asha', 'Mira']);
assert.deepEqual(stableSort([3, 1, 2, 1], (a, b) => a - b), [1, 1, 2, 3]);
assert.equal(by('score', { direction: 'desc', nulls: 'first' })(employees[3], employees[0]), -1);
assert.throws(() => by('x', { direction: 'sideways' }), RangeError);

module.exports = { by, composeComparators, stableSort };
