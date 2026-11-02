const assert = require('node:assert/strict');

function createAbortError(reason) {
  const error = new Error(reason instanceof Error ? reason.message : (reason ? String(reason) : 'Operation aborted'));
  error.name = 'AbortError';
  return error;
}

class Semaphore {
  constructor(limit) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be a positive integer');
    this.limit = limit;
    this.active = 0;
    this.queue = [];
  }

  acquire({ signal } = {}) {
    if (signal?.aborted) return Promise.reject(createAbortError(signal.reason));
    if (this.active < this.limit && this.queue.length === 0) {
      this.active++;
      return Promise.resolve(this.#makeRelease());
    }

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, abortHandler: null };
      if (signal) {
        waiter.abortHandler = () => {
          const index = this.queue.indexOf(waiter);
          if (index !== -1) {
            this.queue.splice(index, 1);
            reject(createAbortError(signal.reason));
            this.#drain();
          }
        };
        signal.addEventListener('abort', waiter.abortHandler, { once: true });
        if (signal.aborted) {
          waiter.abortHandler();
          return;
        }
      }
      this.queue.push(waiter);
      this.#drain();
    });
  }

  async run(task, options) {
    if (typeof task !== 'function') throw new TypeError('task must be a function');
    const release = await this.acquire(options);
    try {
      return await task();
    } finally {
      release();
    }
  }

  #makeRelease() {
    let released = false;
    return () => {
      if (released) throw new Error('Semaphore permit already released');
      released = true;
      this.active--;
      this.#drain();
    };
  }

  #drain() {
    while (this.active < this.limit && this.queue.length) {
      const waiter = this.queue.shift();
      if (waiter.signal?.aborted) {
        if (waiter.abortHandler) waiter.signal.removeEventListener('abort', waiter.abortHandler);
        waiter.reject(createAbortError(waiter.signal.reason));
        continue;
      }
      if (waiter.abortHandler) waiter.signal.removeEventListener('abort', waiter.abortHandler);
      this.active++;
      waiter.resolve(this.#makeRelease());
    }
  }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const semaphore = new Semaphore(2);
  let active = 0;
  let peak = 0;
  const results = await Promise.all([35, 15, 25, 5].map(ms =>
    semaphore.run(async () => {
      active++;
      peak = Math.max(peak, active);
      await delay(ms);
      active--;
      return ms;
    })
  ));
  assert.deepEqual(results, [35, 15, 25, 5]);
  assert.equal(peak, 2);
  assert.equal(semaphore.active, 0);

  const fifo = new Semaphore(1);
  const releaseFirst = await fifo.acquire();
  const order = [];
  const second = fifo.acquire().then(release => { order.push(2); release(); });
  const third = fifo.acquire().then(release => { order.push(3); release(); });
  releaseFirst();
  await Promise.all([second, third]);
  assert.deepEqual(order, [2, 3]);

  const abortable = new Semaphore(1);
  const hold = await abortable.acquire();
  const controller = new AbortController();
  const waiting = abortable.acquire({ signal: controller.signal });
  controller.abort('cancel queued permit');
  await assert.rejects(waiting, { name: 'AbortError' });
  hold();
  await assert.rejects(() => abortable.run(async () => { throw new Error('task failed'); }), /task failed/);
  assert.equal(abortable.active, 0);
  console.log('Async semaphore tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});