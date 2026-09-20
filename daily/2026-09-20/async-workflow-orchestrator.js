// Daily JavaScript Practice — 2026-09-20
// Challenge: Build an async workflow orchestrator with dependencies,
// concurrency limits, retries, and dependency-aware scheduling.

function createWorkflowRunner({ concurrency = 2, retryLimit = 2, backoffMs = 100 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("concurrency must be a positive integer");
  }

  const tasks = new Map();
  const results = new Map();
  const attempts = new Map();

  function addTask(id, dependencies, work) {
    if (tasks.has(id)) throw new Error(`Duplicate task: ${id}`);
    if (!Array.isArray(dependencies) || typeof work !== "function") {
      throw new TypeError("Invalid task definition");
    }
    tasks.set(id, { id, dependencies: [...dependencies], work });
    return api;
  }

  function validateGraph() {
    const visiting = new Set();
    const visited = new Set();

    function visit(id) {
      if (visiting.has(id)) throw new Error(`Dependency cycle detected at: ${id}`);
      if (visited.has(id)) return;

      const task = tasks.get(id);
      if (!task) throw new Error(`Unknown dependency: ${id}`);

      visiting.add(id);
      for (const dependency of task.dependencies) visit(dependency);
      visiting.delete(id);
      visited.add(id);
    }

    for (const id of tasks.keys()) visit(id);
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function runWithRetry(task, context) {
    let attempt = 0;

    while (true) {
      attempt += 1;
      attempts.set(task.id, attempt);

      try {
        return await task.work(context);
      } catch (error) {
        if (attempt > retryLimit) throw error;
        await sleep(backoffMs * 2 ** (attempt - 1));
      }
    }
  }

  async function run() {
    validateGraph();

    const pending = new Set(tasks.keys());
    const running = new Set();
    const failed = new Set();

    const context = {
      get: (id) => results.get(id),
      has: (id) => results.has(id),
    };

    while (pending.size || running.size) {
      let started = false;

      for (const id of [...pending]) {
        if (running.size >= concurrency) break;

        const task = tasks.get(id);
        if (task.dependencies.some((dependency) => failed.has(dependency))) {
          pending.delete(id);
          failed.add(id);
          results.set(id, { status: "blocked" });
          started = true;
          continue;
        }

        if (!task.dependencies.every((dependency) => results.has(dependency))) {
          continue;
        }

        pending.delete(id);
        running.add(id);
        started = true;

        runWithRetry(task, context)
          .then((value) => results.set(id, { status: "fulfilled", value }))
          .catch((error) => {
            failed.add(id);
            results.set(id, { status: "rejected", error: error.message });
          })
          .finally(() => running.delete(id));
      }

      if (running.size) {
        await Promise.race(
          [...running].map(async (id) => {
            while (running.has(id)) await sleep(0);
          })
        );
      } else if (pending.size && !started) {
        throw new Error("Workflow cannot make progress");
      }
    }

    return {
      results: Object.fromEntries(results),
      attempts: Object.fromEntries(attempts),
    };
  }

  const api = { addTask, run };
  return api;
}

// Example
const workflow = createWorkflowRunner({ concurrency: 2, retryLimit: 2 });

workflow
  .addTask("fetchUser", [], async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { id: 42, name: "Nitish" };
  })
  .addTask("fetchOrders", ["fetchUser"], async ({ get }) => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    return [`orders-for-${get("fetchUser").id}`];
  })
  .addTask("buildReport", ["fetchUser", "fetchOrders"], ({ get }) => ({
    user: get("fetchUser"),
    orders: get("fetchOrders"),
  }));

workflow.run().then(console.log).catch(console.error);
