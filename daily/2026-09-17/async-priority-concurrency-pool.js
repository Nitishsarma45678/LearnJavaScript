// Async Priority Concurrency Pool
// Challenge: combine closures, async JavaScript, a binary heap, retries,
// and concurrency control into a reusable task runner.

function createPriorityPool({ concurrency = 2, retries = 2 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError("concurrency must be a positive integer");
  }

  const heap = [];
  const results = new Map();
  let running = 0;
  let sequence = 0;
  let settled = false;
  let resolveDone;
  let rejectDone;

  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  function higherPriority(a, b) {
    return a.priority > b.priority ||
      (a.priority === b.priority && a.sequence < b.sequence);
  }

  function swap(i, j) {
    [heap[i], heap[j]] = [heap[j], heap[i]];
  }

  function push(task) {
    heap.push(task);
    let i = heap.length - 1;

    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (higherPriority(heap[parent], heap[i])) break;
      swap(parent, i);
      i = parent;
    }
  }

  function pop() {
    if (!heap.length) return null;
    const top = heap[0];
    const last = heap.pop();

    if (heap.length) {
      heap[0] = last;
      let i = 0;

      while (true) {
        const left = i * 2 + 1;
        const right = left + 1;
        let best = i;

        if (left < heap.length && higherPriority(heap[left], heap[best])) {
          best = left;
        }
        if (right < heap.length && higherPriority(heap[right], heap[best])) {
          best = right;
        }
        if (best === i) break;
        swap(i, best);
        i = best;
      }
    }

    return top;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function execute(task) {
    let attempt = 0;

    while (true) {
      try {
        return await task.fn();
      } catch (error) {
        if (attempt++ >= retries) throw error;
        await sleep(25 * 2 ** (attempt - 1));
      }
    }
  }

  function drain() {
    while (running < concurrency && heap.length) {
      const task = pop();
      running++;

      execute(task)
        .then((value) => results.set(task.id, { status: "fulfilled", value }))
        .catch((error) => results.set(task.id, { status: "rejected", reason: error.message }))
        .finally(() => {
          running--;
          if (!heap.length && running === 0 && !settled) {
            settled = true;
            resolveDone(results);
          } else {
            drain();
          }
        });
    }
  }

  function add(fn, { id = `task-${sequence}`, priority = 0 } = {}) {
    if (typeof fn !== "function") throw new TypeError("task must be a function");
    if (settled) throw new Error("Pool has already settled");

    const task = { id, priority, sequence: sequence++, fn };
    push(task);
    drain();
    return id;
  }

  return {
    add,
    wait: () => done,
    snapshot: () => ({ queued: heap.length, running, completed: results.size }),
  };
}

// Example: higher priority tasks are preferred, while equal priorities stay FIFO.
const pool = createPriorityPool({ concurrency: 2, retries: 2 });
let unstableAttempts = 0;

pool.add(async () => "low priority", { id: "low", priority: 1 });
pool.add(async () => {
  unstableAttempts++;
  if (unstableAttempts < 2) throw new Error("temporary failure");
  return "recovered after retry";
}, { id: "critical", priority: 10 });
pool.add(async () => "normal work", { id: "normal", priority: 5 });

pool.wait().then((results) => console.log(Object.fromEntries(results)));
