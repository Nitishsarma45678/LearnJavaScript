'use strict';

const assert = require('node:assert/strict');

function minimumRotation(input) {
  const chars = Array.from(input);
  const n = chars.length;
  if (n === 0) return { index: 0, rotation: '' };

  const doubled = chars.concat(chars);
  let i = 0, j = 1, offset = 0;
  while (i < n && j < n && offset < n) {
    const a = doubled[i + offset];
    const b = doubled[j + offset];
    if (a === b) {
      offset++;
      continue;
    }
    if (a > b) {
      i += offset + 1;
      if (i <= j) i = j + 1;
    } else {
      j += offset + 1;
      if (j <= i) j = i + 1;
    }
    offset = 0;
  }

  const index = Math.min(i, j);
  return { index, rotation: chars.slice(index).concat(chars.slice(0, index)).join('') };
}

assert.deepEqual(minimumRotation('bbaaccaadd'), { index: 2, rotation: 'aaccaaddbb' });
assert.deepEqual(minimumRotation('caba'), { index: 1, rotation: 'abac' });
assert.deepEqual(minimumRotation('aaaa'), { index: 0, rotation: 'aaaa' });
assert.deepEqual(minimumRotation(''), { index: 0, rotation: '' });
assert.deepEqual(minimumRotation('😀b😀a').rotation, 'a😀b😀');
console.log('Booth-rotation examples passed.');

module.exports = { minimumRotation };
