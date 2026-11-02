const assert = require('node:assert/strict');

async function* slidingWindow(source, width, { step = 1, partial = false } = {}) {
  if (!Number.isInteger(width) || width < 1) throw new RangeError('width must be a positive integer');
  if (!Number.isInteger(step) || step < 1) throw new RangeError('step must be a positive integer');

  const buffer = [];
  let skip = 0;
  for await (const value of source) {
    if (skip > 0) {
      skip--;
      continue;
    }
    buffer.push(value);
    if (buffer.length === width) {
      yield buffer.slice();
      buffer.splice(0, Math.min(step, buffer.length));
      skip = Math.max(0, step - width);
    }
  }

  if (partial) {
    while (buffer.length > 0) {
      yield buffer.slice();
      const removed = Math.min(step, buffer.length);
      buffer.splice(0, removed);
    }
  }
}

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

(async () => {
  async function* source() {
    yield 1; await Promise.resolve();
    yield 2; yield 3; yield 4; yield 5; yield 6;
  }
  assert.deepEqual(
    await collect(slidingWindow(source(), 3, {step: 2, partial: true})),
    [[1,2,3], [3,4,5], [5,6]]
  );
  assert.deepEqual(
    await collect(slidingWindow([1,2,3,4,5,6,7,8,9], 3, {step: 4, partial: true})),
    [[1,2,3], [5,6,7], [9]]
  );
  assert.deepEqual(
    await collect(slidingWindow([1,2,3,4], 2, {step: 2})),
    [[1,2], [3,4]]
  );
  await assert.rejects(async () => collect(slidingWindow([], 0)), RangeError);
  console.log('Async sliding-window tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});