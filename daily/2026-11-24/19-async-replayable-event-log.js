'use strict';

const assert = require('node:assert/strict');

class ReplayGapError extends Error {
  constructor(requested, earliest) {
    super('Replay cursor ' + requested + ' is older than retained sequence ' + earliest);
    this.name = 'ReplayGapError';
    this.requested = requested;
    this.earliest = earliest;
  }
}

class ReplayLog {
  constructor(capacity = 100) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Capacity must be positive');
    this.capacity = capacity;
    this.entries = [];
    this.sequence = 0;
    this.closed = false;
    this.waiters = new Set();
  }

  get lastSequence() { return this.sequence; }

  append(value) {
    if (this.closed) throw new Error('Log is closed');
    const entry = Object.freeze({ sequence: ++this.sequence, value });
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
    for (const wake of Array.from(this.waiters)) wake();
    return entry.sequence;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const wake of Array.from(this.waiters)) wake();
  }

  subscribe({ after = 0, signal } = {}) {
    const log = this;
    return (async function* replay() {
      let cursor = after;
      while (true) {
        if (signal?.aborted) throw signal.reason || new Error('Subscription aborted');
        const earliest = log.entries.length ? log.entries[0].sequence : log.sequence + 1;
        if (cursor < earliest - 1) throw new ReplayGapError(cursor, earliest);

        const next = log.entries.find(entry => entry.sequence > cursor);
        if (next) {
          cursor = next.sequence;
          yield next;
          continue;
        }
        if (log.closed) return;

        await new Promise((resolve, reject) => {
          let settled = false;
          const cleanup = () => {
            log.waiters.delete(wake);
            signal?.removeEventListener('abort', abort);
          };
          const finish = callback => {
            if (settled) return;
            settled = true;
            cleanup();
            callback();
          };
          const wake = () => finish(resolve);
          const abort = () => finish(() => reject(signal.reason || new Error('Subscription aborted')));
          log.waiters.add(wake);
          signal?.addEventListener('abort', abort, { once: true });
          if (signal?.aborted) abort();
        });
      }
    })();
  }
}

(async () => {
  const log = new ReplayLog(3);
  log.append('one');
  log.append('two');
  log.append('three');
  log.append('four'); // sequence 1 has been evicted

  const replay = log.subscribe({ after: 2 });
  assert.deepEqual(await replay.next(), { value: { sequence: 3, value: 'three' }, done: false });
  log.append('five');
  assert.deepEqual(await replay.next(), { value: { sequence: 4, value: 'four' }, done: false });
  assert.deepEqual(await replay.next(), { value: { sequence: 5, value: 'five' }, done: false });
  await replay.return();

  await assert.rejects(log.subscribe({ after: 0 }).next(), ReplayGapError);
  const live = log.subscribe({ after: log.lastSequence });
  const pending = live.next();
  log.append('six');
  assert.deepEqual(await pending, { value: { sequence: 6, value: 'six' }, done: false });
  await live.return();
  log.close();
  assert.deepEqual(await log.subscribe({ after: 6 }).next(), { value: undefined, done: true });
  assert.throws(() => log.append('late'), /closed/);
  console.log('Replay-log examples passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { ReplayLog, ReplayGapError };
