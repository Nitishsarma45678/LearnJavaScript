// Daily JavaScript practice — 2026-09-07
// Priority-aware async scheduler with bounded concurrency.

class AsyncScheduler {
  #queue = [];
  #active = 0;

  constructor(concurrency = 2) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new TypeError("Concurrency must be a positive integer");
    }
    this.concurrency = concurrency;
  }

  add(task, priority = 0) {
    return new Promise((resolve, reject) => {
      this.#queue.push({ task, priority, resolve, reject });
      this.#queue.sort((a, b) => b.priority - a.priority);
      this.#drain();
    });
  }

  #drain() {
    while (this.#active < this.concurrency && this.#queue.length) {
      const job = this.#queue.shift();
      this.#active++;

      Promise.resolve()
        .then(job.task)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.#active--;
          this.#drain();
        });
    }
  }
}

const scheduler = new AsyncScheduler(2);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const jobs = [
  ["cache-refresh", 1, 80],
  ["critical-payment", 100, 40],
  ["analytics", 5, 60],
  ["email-digest", 10, 30]
];

Promise.all(
  jobs.map(([name, priority, delay]) =>
    scheduler.add(async () => {
      await wait(delay);
      return `${name} completed`;
    }, priority)
  )
).then(results => console.log(results));
