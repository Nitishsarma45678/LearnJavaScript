// Async deduplicating task runner
// Practice: closures, higher-order functions, async/await, Map-based memoization,
// concurrency control, retry handling, and promise lifecycle management.

function createTaskRunner({ concurrency = 2, retries = 1, backoffMs = 50 } = {}) {
  if (concurrency < 1) throw new Error("concurrency must be at least 1");

  const pending = [];
  const inFlight = new Map();
  let active = 0;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function execute(task, key) {
    let attempt = 0;

    while (true) {
      try {
        return await task();
      } catch (error) {
        if (attempt++ >= retries) {
          throw new Error(`Task ${String(key)} failed after retries`, {
            cause: error,
          });
        }
        await sleep(backoffMs * 2 ** (attempt - 1));
      }
    }
  }

  function schedule() {
    while (active < concurrency && pending.length > 0) {
      const job = pending.shift();
      active++;

      execute(job.task, job.key)
        .then(job.resolve, job.reject)
        .finally(() => {
          active--;
          inFlight.delete(job.key);
          schedule();
        });
    }
  }

  return function run(key, task) {
    if (typeof task !== "function") {
      return Promise.reject(new TypeError("task must be a function"));
    }

    // Calls using the same key share the exact same Promise.
    if (inFlight.has(key)) return inFlight.get(key);

    const promise = new Promise((resolve, reject) => {
      pending.push({ key, task, resolve, reject });
      schedule();
    });

    inFlight.set(key, promise);
    return promise;
  };
}

// Example: duplicate requests for "users" are collapsed into one execution.
const runTask = createTaskRunner({ concurrency: 2, retries: 2 });
let fetchAttempts = 0;

const fetchUsers = async () => {
  fetchAttempts++;
  if (fetchAttempts < 2) throw new Error("temporary network failure");
  await new Promise((resolve) => setTimeout(resolve, 100));
  return ["Ada", "Grace", "Alan"];
};

async function demo() {
  const first = runTask("users", fetchUsers);
  const duplicate = runTask("users", fetchUsers);

  console.log("same promise:", first === duplicate); // true
  console.log("users:", await first);
  console.log("attempts:", fetchAttempts); // 2

  const report = await runTask("report", async () => ({
    generated: true,
    userCount: (await runTask("users", fetchUsers)).length,
  }));

  console.log("report:", report);
}

demo().catch(console.error);
