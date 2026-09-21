/**
 * Practice: Async Priority Concurrency Scheduler
 *
 * Build a small task scheduler that combines:
 * - closures for private scheduler state
 * - higher-order functions
 * - async/await and Promise coordination
 * - priority queues
 * - concurrency limiting
 * - task dependencies
 * - retries with exponential backoff
 * - cancellation and execution statistics
 *
 * Challenge:
 * A task may run only after all of its dependencies have completed.
 * Among ready tasks, the highest priority task runs first, while the
 * scheduler never exceeds the configured concurrency limit.
 */

function createScheduler({ concurrency = 2, retryLimit = 2 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrency must be a positive integer");
  }

  const tasks = new Map();
  const results = new Map();
  const running = new Set();
  const completed = new Set();
  const failed = new Set();
  const cancelled = new Set();

  let waiting = false;

  function addTask(id, task, { priority = 0, dependsOn = [] } = {}) {
    if (tasks.has(id)) {
      throw new Error(`Task already exists: ${id}`);
    }

    if (dependsOn.includes(id)) {
      throw new Error(`Task cannot depend on itself: ${id}`);
    }

    tasks.set(id, {
      id,
      task,
      priority,
      dependsOn: [...dependsOn],
      attempts: 0,
      status: "pending"
    });

    return api;
  }

  function cancel(id) {
    const item = tasks.get(id);

    if (!item || item.status !== "pending") {
      return false;
    }

    cancelled.add(id);
    item.status = "cancelled";
    return true;
  }

  function dependenciesReady(item) {
    return item.dependsOn.every(id => completed.has(id));
  }

  function dependencyFailed(item) {
    return item.dependsOn.some(id => failed.has(id) || cancelled.has(id));
  }

  function getReadyTasks() {
    return [...tasks.values()]
      .filter(item =>
        item.status === "pending" &&
        !cancelled.has(item.id) &&
        !dependencyFailed(item) &&
        dependenciesReady(item)
      )
      .sort((a, b) => b.priority - a.priority);
  }

  function markBlockedTasks() {
    for (const item of tasks.values()) {
      if (
        item.status === "pending" &&
        dependencyFailed(item)
      ) {
        item.status = "blocked";
        failed.add(item.id);
      }
    }
  }

  async function runItem(item) {
    running.add(item.id);
    item.status = "running";

    while (item.attempts <= retryLimit) {
      item.attempts++;

      try {
        const value = await item.task({
          id: item.id,
          attempt: item.attempts
        });

        results.set(item.id, value);
        completed.add(item.id);
        item.status = "completed";
        return;
      } catch (error) {
        if (item.attempts > retryLimit) {
          failed.add(item.id);
          item.status = "failed";
          results.set(item.id, error);
          return;
        }

        const delay = 100 * 2 ** (item.attempts - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async function drain() {
    if (waiting) return;
    waiting = true;

    try {
      while (completed.size + failed.size + cancelled.size < tasks.size) {
        markBlockedTasks();

        const ready = getReadyTasks();
        const slots = concurrency - running.size;
        const batch = ready.slice(0, Math.max(0, slots));

        if (batch.length === 0) {
          if (running.size === 0) {
            const unresolved = [...tasks.values()]
              .filter(item => item.status === "pending")
              .map(item => item.id);

            if (unresolved.length) {
              throw new Error(
                `Unresolvable dependency graph: ${unresolved.join(", ")}`
              );
            }
          }
        } else {
          await Promise.all(
            batch.map(item =>
              runItem(item).finally(() => running.delete(item.id))
            )
          );
        }
      }
    } finally {
      waiting = false;
    }
  }

  function status() {
    return [...tasks.values()].map(item => ({
      id: item.id,
      status: item.status,
      attempts: item.attempts,
      priority: item.priority
    }));
  }

  const api = {
    addTask,
    cancel,
    run: drain,
    status,
    getResult: id => results.get(id),
    stats: () => ({
      total: tasks.size,
      completed: completed.size,
      failed: failed.size,
      cancelled: cancelled.size,
      running: running.size
    })
  };

  return api;
}

// Example
const scheduler = createScheduler({
  concurrency: 2,
  retryLimit: 2
});

scheduler
  .addTask("fetch-user", async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return { id: 7, name: "Nitish" };
  }, { priority: 10 })
  .addTask("fetch-posts", async () => {
    await new Promise(resolve => setTimeout(resolve, 150));
    return ["post-1", "post-2"];
  }, { priority: 8 })
  .addTask("build-dashboard", async ({ attempt }) => {
    if (attempt < 2) {
      throw new Error("Temporary dashboard service failure");
    }

    return "dashboard-ready";
  }, {
    priority: 20,
    dependsOn: ["fetch-user", "fetch-posts"]
  });

(async () => {
  await scheduler.run();

  console.log("Status:", scheduler.status());
  console.log("Dashboard:", scheduler.getResult("build-dashboard"));
  console.log("Stats:", scheduler.stats());
})();
