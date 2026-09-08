// Daily JavaScript practice — 2026-09-08
// Dependency-aware async task queue using graph traversal and concurrency control.

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runTasks(tasks, concurrency = 2) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const dependents = new Map(tasks.map(task => [task.id, []]));
  const remaining = new Map(tasks.map(task => [task.id, task.dependsOn.length]));

  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!byId.has(dependency)) {
        throw new Error(`Unknown dependency: ${dependency}`);
      }
      dependents.get(dependency).push(task.id);
    }
  }

  const ready = tasks.filter(task => remaining.get(task.id) === 0).map(task => task.id);
  const results = new Map();
  const active = new Set();
  let completed = 0;

  return new Promise((resolve, reject) => {
    const schedule = () => {
      if (completed === tasks.length) return resolve(results);
      if (!ready.length && active.size === 0) {
        return reject(new Error("Cyclic dependency detected"));
      }

      while (ready.length && active.size < concurrency) {
        const id = ready.shift();
        const task = byId.get(id);
        active.add(id);

        Promise.resolve()
          .then(task.run)
          .then(value => {
            results.set(id, value);
            completed++;

            for (const dependent of dependents.get(id)) {
              remaining.set(dependent, remaining.get(dependent) - 1);
              if (remaining.get(dependent) === 0) ready.push(dependent);
            }
          })
          .catch(reject)
          .finally(() => {
            active.delete(id);
            if (completed !== tasks.length) schedule();
          });
      }
    };

    schedule();
  });
}

const tasks = [
  { id: "config", dependsOn: [], run: async () => { await sleep(80); return "config loaded"; } },
  { id: "database", dependsOn: ["config"], run: async () => { await sleep(100); return "database ready"; } },
  { id: "cache", dependsOn: ["config"], run: async () => { await sleep(60); return "cache ready"; } },
  { id: "api", dependsOn: ["database", "cache"], run: async () => { await sleep(90); return "api ready"; } },
  { id: "report", dependsOn: ["api"], run: async () => { await sleep(50); return "report generated"; } }
];

runTasks(tasks, 2)
  .then(results => console.log(Object.fromEntries(results)))
  .catch(console.error);
