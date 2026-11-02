const assert = require('node:assert/strict');

function* encodeRuns(chunks, { maxRunLength = 255 } = {}) {
  if (!Number.isInteger(maxRunLength) || maxRunLength < 1)
    throw new RangeError('maxRunLength must be a positive integer');

  let current = null;
  let count = 0;
  let pendingHighSurrogate = '';

  const emit = function* () {
    if (count > 0) yield { symbol: current, count };
  };
  const accept = function* (symbol) {
    if (current !== symbol || count === maxRunLength) {
      yield* emit();
      current = symbol;
      count = 0;
    }
    count++;
  };

  for (const chunk of chunks) {
    if (typeof chunk !== 'string') throw new TypeError('Chunks must be strings');
    let text = pendingHighSurrogate + chunk;
    pendingHighSurrogate = '';
    if (text.length > 0) {
      const last = text.charCodeAt(text.length - 1);
      if (last >= 0xD800 && last <= 0xDBFF) {
        pendingHighSurrogate = text.slice(-1);
        text = text.slice(0, -1);
      }
    }
    for (const symbol of text) yield* accept(symbol);
  }

  if (pendingHighSurrogate) yield* accept(pendingHighSurrogate);
  yield* emit();
}

function* decodeRuns(runs) {
  for (const run of runs) {
    if (!run || typeof run.symbol !== 'string' || Array.from(run.symbol).length !== 1)
      throw new TypeError('Each run must contain exactly one Unicode symbol');
    if (!Number.isSafeInteger(run.count) || run.count < 1)
      throw new RangeError('Run count must be a positive safe integer');
    yield run.symbol.repeat(run.count);
  }
}

const encoded = [...encodeRuns(['aa', '\uD83D', '\uDE00😀', 'bbb'], {maxRunLength: 3})];
assert.deepEqual(encoded, [
  {symbol: 'a', count: 2},
  {symbol: '😀', count: 2},
  {symbol: 'b', count: 3}
]);
assert.equal([...decodeRuns(encoded)].join(''), 'aa😀😀bbb');
assert.deepEqual(
  [...encodeRuns(['xxxxx'], {maxRunLength: 2})],
  [{symbol:'x',count:2}, {symbol:'x',count:2}, {symbol:'x',count:1}]
);
assert.throws(() => [...decodeRuns([{symbol:'x', count:0}])], RangeError);
assert.throws(() => [...encodeRuns([42])], TypeError);
console.log('Unicode streaming RLE tests passed');