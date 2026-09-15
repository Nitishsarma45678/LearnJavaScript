// Practice: dependency-aware async execution with bounded concurrency.
// Goals: topological scheduling, cycle detection, failure propagation, and Promise coordination.

function createTaskRunner(taskMap, { concurrency = 2 } = {}) {
  if (concurrency < 1) throw new RangeError("concurrency must be at least 1");

  const states = new Map();
  const dependents = new Map();
  const remainingDeps = new Map();

  for (const [name, task] of Object.entries(taskMap)) {
    states.set(name, "pending");
    remainingDeps.set(name, task.deps.length);

    for (const dependency of task.deps) {
      if (!taskMap[dependency]) {
        throw new Error(`Unknown dependency: ${dependency}`);
      }

      if (!dependents.has(dependency)) dependents.set(dependency, []);
      dependents.get(dependency).push(name);
    }
  }

  // Validate the dependency graph before any asynchronous work begins.
  const indegree = new Map(remainingDeps);
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([name]) => name);
  let visited = 0;

  while (queue.length) {
    const name = queue.shift();
    visited++;

    for (const child of dependents.get(name) ?? []) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }

  if (visited !== Object.keys(taskMap).length) {
    throw new Error("Task graph contains a dependency cycle");
  }

  return async function run() {
    const results = new Map();
    const failures = new Map();
    const ready = [];
    const active = new Set();
    let completed = 0;

    for (const [name, count] of remainingDeps) {
      if (count === 0) ready.push(name);
    }

    return new Promise((resolve) => {
      const schedule = () => {
        while (active.size < concurrency && ready.length) {
          const name = ready.shift();
          active.add(name);
          states.set(name, "running");

          Promise.resolve()
            .then(() => {
              const task = taskMap[name];
              const failedDependency = task.deps.find((dep) => failures.has(dep));

              if (failedDependency) {
                throw new Error(`Skipped ${name}: dependency ${failedDependency} failed`);
              }

              return task.run(results);
            })
            .then((value) => {
              results.set(name, value);
              states.set(name, "completed");
            })
            .catch((error) => {
              failures.set(name, error);
              states.set(name, "failed");
            })
            .finally(() => {
              active.delete(name);
              completed++;

              for (const child of dependents.get(name) ?? []) {
                remainingDeps.set(child, remainingDeps.get(child) - 1);
                if (remainingDeps.get(child) === 0) ready.push(child);
              }

              if (completed === Object.keys(taskMap).length) {
                resolve({ results, failures, states });
                return;
              }

              schedule();
            });
        }
      };

      schedule();
    });
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tasks = {
  fetchUser: {
    deps: [],
    run: async () => {
      await wait(80);
      return { id: 42, name: "Nit" };
    },
  },
  fetchPermissions: {
    deps: [],
    run: async () => {
      await wait(40);
      return ["read", "write"];
    },
  },
  buildProfile: {
    deps: ["fetchUser", "fetchPermissions"],
    run: async (results) => ({
      ...results.get("fetchUser"),
      permissions: results.get("fetchPermissions"),
    }),
  },
  auditProfile: {
    deps: ["buildProfile"],
    run: async (results) => `Audited user ${results.get("buildProfile").id}`,
  },
};

createTaskRunner(tasks, { concurrency: 2 })().then(({ results, failures }) => {
  console.log(Object.fromEntries(results));
  console.log("Failures:", [...failures.keys()]);
});
