/**
 * Practice: Async Dependency Retry Orchestrator
 *
 * Build a small workflow engine that executes tasks from a dependency graph.
 *
 * Concepts:
 * - closures and encapsulated state
 * - higher-order functions
 * - async/await and Promise coordination
 * - recursion / graph traversal
 * - topological scheduling
 * - bounded concurrency
 * - retry with exponential backoff
 * - failure propagation
 * - Map / Set based algorithms
 *
 * Rules:
 * 1. A task can run only after every dependency succeeds.
 * 2. A failed task is retried up to its configured retry count.
 * 3. Dependants of a failed task are skipped.
 * 4. Independent tasks may execute concurrently.
 * 5. The concurrency limit must never be exceeded.
 */

function createWorkflowRunner(taskDefinitions, {
  concurrency = 2,
  defaultRetries = 2,
  baseDelayMs = 50,
  backoff = 2
} = {}) {
  const definitions = new Map(
    taskDefinitions.map(task => [task.id, task])
  );

  const state = new Map();
  const results = new Map();

  let running = 0;

  function validateGraph() {
    for (const task of taskDefinitions) {
      for (const dependency of task.dependencies || []) {
        if (!definitions.has(dependency)) {
          throw new Error(
            `Task "${task.id}" depends on unknown task "${dependency}"`
          );
        }
      }
    }

    const visiting = new Set();
    const visited = new Set();

    function visit(id) {
      if (visiting.has(id)) {
        throw new Error(`Dependency cycle detected at "${id}"`);
      }

      if (visited.has(id)) {
        return;
      }

      visiting.add(id);

      for (const dependency of definitions.get(id).dependencies || []) {
        visit(dependency);
      }

      visiting.delete(id);
      visited.add(id);
    }

    for (const id of definitions.keys()) {
      visit(id);
    }
  }

  async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  async function executeWithRetry(task) {
    const retries = task.retries ?? defaultRetries;
    let attempt = 0;

    while (true) {
      attempt++;

      try {
        return await task.run({
          attempt,
          results: Object.fromEntries(results)
        });
      } catch (error) {
        if (attempt > retries) {
          throw new Error(
            `Task "${task.id}" failed after ${attempt} attempt(s): ${error.message}`
          );
        }

        const delay = baseDelayMs * backoff ** (attempt - 1);
        await sleep(delay);
      }
    }
  }

  async function execute(id) {
    const task = definitions.get(id);

    if (state.get(id) === "success") {
      return results.get(id);
    }

    if (state.get(id) === "failed" || state.get(id) === "skipped") {
      throw new Error(`Task "${id}" is not executable`);
    }

    const dependencies = task.dependencies || [];

    for (const dependency of dependencies) {
      if (state.get(dependency) === "failed" ||
          state.get(dependency) === "skipped") {
        state.set(id, "skipped");
        throw new Error(
          `Task "${id}" skipped because "${dependency}" failed`
        );
      }
    }

    for (const dependency of dependencies) {
      if (!state.has(dependency)) {
        try {
          await execute(dependency);
        } catch {
          state.set(id, "skipped");
          throw new Error(
            `Task "${id}" skipped because a dependency failed`
          );
        }
      }
    }

    if (state.get(id) === "success") {
      return results.get(id);
    }

    while (running >= concurrency) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    running++;
    state.set(id, "running");

    try {
      const value = await executeWithRetry(task);
      results.set(id, value);
      state.set(id, "success");
      return value;
    } catch (error) {
      state.set(id, "failed");
      throw error;
    } finally {
      running--;
    }
  }

  async function run() {
    validateGraph();

    const ids = [...definitions.keys()];

    // Start every root independently. Recursive dependency execution
    // guarantees that prerequisites are resolved first.
    await Promise.allSettled(
      ids
        .filter(id => !(definitions.get(id).dependencies || []).length)
        .map(execute)
    );

    // Some tasks may have become runnable after their dependencies completed.
    await Promise.allSettled(ids.map(id => {
      if (!state.has(id)) {
        return execute(id);
      }
      return Promise.resolve();
    }));

    return {
      results: Object.fromEntries(results),
      state: Object.fromEntries(state)
    };
  }

  return {
    run,
    getState: () => Object.fromEntries(state),
    getResults: () => Object.fromEntries(results)
  };
}

// Example workflow.
let unstableAttempts = 0;

const tasks = [
  {
    id: "fetch-config",
    dependencies: [],
    retries: 1,
    run: async () => {
      await new Promise(resolve => setTimeout(resolve, 40));
      return { region: "ap-south-1", version: 3 };
    }
  },
  {
    id: "fetch-users",
    dependencies: [],
    retries: 2,
    run: async () => {
      await new Promise(resolve => setTimeout(resolve, 70));
      return ["alice", "bob", "charlie"];
    }
  },
  {
    id: "prepare-index",
    dependencies: ["fetch-users"],
    run: async ({ results }) => {
      return results["fetch-users"].map(
        user => user.toUpperCase()
      );
    }
  },
  {
    id: "build-report",
    dependencies: ["fetch-config", "prepare-index"],
    retries: 2,
    run: async ({ results, attempt }) => {
      unstableAttempts++;

      if (unstableAttempts < 2) {
        throw new Error("Temporary report service failure");
      }

      return {
        region: results["fetch-config"].region,
        users: results["prepare-index"],
        attempt
      };
    }
  },
  {
    id: "publish",
    dependencies: ["build-report"],
    run: async ({ results }) => {
      return `Published report for ${results["build-report"].users.length} users`;
    }
  }
];

const runner = createWorkflowRunner(tasks, {
  concurrency: 2,
  defaultRetries: 1,
  baseDelayMs: 25
});

runner.run().then(report => {
  console.log("Final state:", report.state);
  console.log("Results:", report.results);
});
