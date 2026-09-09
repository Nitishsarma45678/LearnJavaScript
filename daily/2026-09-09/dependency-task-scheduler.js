// Daily JavaScript practice — 2026-09-09
// Dependency-aware task scheduler using graph traversal, cycle detection,
// bounded async concurrency, and failure propagation.

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function createTaskScheduler(tasks, { concurrency = 2 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("concurrency must be a positive integer");
  }

  const taskMap = new Map(tasks.map(task => [task.id, task]));
  if (taskMap.size !== tasks.length) {
    throw new Error("Task ids must be unique");
  }

  for (const task of tasks) {
    for (const dependency of task.dependsOn ?? []) {
      if (!taskMap.has(dependency)) {
        throw new Error(`Unknown dependency: ${dependency}`);
      }
    }
  }

  const state = new Map(tasks.map(task => [task.id, "pending"]));
  const results = new Map();

  // Detect cycles before any asynchronous work starts.
  function detectCycles() {
    const visiting = new Set();
    const visited = new Set();

    function visit(id, path = []) {
      if (visiting.has(id)) {
        const cycleStart = path.indexOf(id);
        throw new Error(
          `Circular dependency: ${[...path.slice(cycleStart), id].join(" -> ")}`
        );
      }
      if (visited.has(id)) return;

      visiting.add(id);
      const task = taskMap.get(id);
      for (const dependency of task.dependsOn ?? []) {
        visit(dependency, [...path, id]);
      }
      visiting.delete(id);
      visited.add(id);
    }

    for (const task of tasks) visit(task.id);
  }

  async function run() {
    detectCycles();

    let running = 0;
    let completed = 0;
    const total = tasks.length;

    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = () => {
        if (!settled && completed === total) {
          settled = true;
          resolve(Object.fromEntries(results));
        }
      };

      const markBlockedTasks = () => {
        let changed = true;
        while (changed) {
          changed = false;
          for (const task of tasks) {
            if (state.get(task.id) !== "pending") continue;

            const dependencies = task.dependsOn ?? [];
            if (dependencies.some(dep => state.get(dep) === "failed" || state.get(dep) === "blocked")) {
              state.set(task.id, "blocked");
              results.set(task.id, { status: "blocked" });
              completed++;
              changed = true;
            }
          }
        }
      };

      const schedule = () => {
        if (settled) return;

        markBlockedTasks();

        for (const task of tasks) {
          if (running >= concurrency) break;
          if (state.get(task.id) !== "pending") continue;

          const dependencies = task.dependsOn ?? [];
          if (!dependencies.every(dep => state.get(dep) === "completed")) continue;

          state.set(task.id, "running");
          running++;

          Promise.resolve()
            .then(() => task.run(Object.fromEntries(
              dependencies.map(dep => [dep, results.get(dep)?.value])
            )))
            .then(value => {
              state.set(task.id, "completed");
              results.set(task.id, { status: "completed", value });
              completed++;
            })
            .catch(error => {
              state.set(task.id, "failed");
              results.set(task.id, {
                status: "failed",
                error: error instanceof Error ? error.message : String(error)
              });
              completed++;
            })
            .finally(() => {
              running--;
              schedule();
            });
        }

        finish();

        // If pending tasks remain but none can run, the graph is inconsistent.
        if (running === 0 && completed < total && !tasks.some(task => state.get(task.id) === "pending" &&
          (task.dependsOn ?? []).every(dep => state.get(dep) === "completed"))) {
          settled = true;
          reject(new Error("Scheduler stalled: unresolved dependency state"));
        }
      };

      schedule();
    });
  }

  return { run };
}

// Example: lint and tests can run together; deployment waits for both.
const scheduler = createTaskScheduler([
  {
    id: "lint",
    dependsOn: [],
    run: async () => {
      await sleep(60);
      return "lint passed";
    }
  },
  {
    id: "tests",
    dependsOn: [],
    run: async () => {
      await sleep(90);
      return "tests passed";
    }
  },
  {
    id: "build",
    dependsOn: ["lint", "tests"],
    run: async inputs => {
      await sleep(50);
      return `build created from ${inputs.lint} + ${inputs.tests}`;
    }
  },
  {
    id: "deploy",
    dependsOn: ["build"],
    run: async inputs => {
      await sleep(40);
      return `deployed: ${inputs.build}`;
    }
  }
]);

scheduler.run().then(console.log).catch(console.error);
