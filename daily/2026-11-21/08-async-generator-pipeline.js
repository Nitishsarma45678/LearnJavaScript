// Exercise: Compose lazy async-generator operators.
// Implement map, filter, take, and flatMap. Preserve order and close upstream iterators
// when a consumer stops early.

async function* mapAsync(iterable, mapper) {
  let index = 0;
  for await (const value of iterable) {
    yield await mapper(value, index++);
  }
}

async function* filterAsync(iterable, predicate) {
  let index = 0;
  for await (const value of iterable) {
    if (await predicate(value, index++)) yield value;
  }
}

async function* takeAsync(iterable, count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("count must be a non-negative integer");
  }
  if (count === 0) return;
  let emitted = 0;
  for await (const value of iterable) {
    yield value;
    emitted++;
    if (emitted >= count) return;
  }
}

async function* flatMapAsync(iterable, mapper) {
  let index = 0;
  for await (const value of iterable) {
    const inner = await mapper(value, index++);
    for await (const mapped of inner) yield mapped;
  }
}

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

// Tests
const assert = require("node:assert/strict");

async function* numbers() {
  try {
    for (let i = 1; i <= 6; i++) yield i;
  } finally {
    numbers.closed = true;
  }
}
numbers.closed = false;

(async () => {
  const pipeline = takeAsync(
    filterAsync(
      mapAsync(numbers(), async value => value * 3),
      value => value % 2 === 0
    ),
    2
  );
  assert.deepEqual(await collect(pipeline), [6, 12]);
  assert.equal(numbers.closed, true);

  const expanded = flatMapAsync([1, 2, 3], value => [value, value * 10]);
  assert.deepEqual(await collect(expanded), [1, 10, 2, 20, 3, 30]);
  assert.deepEqual(await collect(takeAsync([1, 2, 3], 0)), []);
  await assert.rejects(() => collect(takeAsync([1], -1)), RangeError);
  console.log("async generator pipeline tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
