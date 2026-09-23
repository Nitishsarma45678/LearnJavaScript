/**
 * Practice: Async DAG Concurrency Pool
 *
 * Challenge:
 * Execute asynchronous jobs described by a dependency graph while
 * respecting a concurrency limit. A job can start only after every
 * dependency succeeds.
 *
 * Concepts:
 * - closures for private scheduler state
 * - higher-order functions
 * - async/await and Promise coordination
 * - recursive dependency validation
 * - topological scheduling
 * - concurrency limiting
 * - failure propagation
 * - Map / Set based graph algorithms
 */

function createScheduler({ concurrency = 2 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive integer");
  }

  // Closure keeps scheduler state private.
  let running = 0;
  let completed = 0;
  let failed = 0;

  return async function run(jobs) {
    const byId = new Map(jobs.map(job => [job.id, job]));
    const state = new Map(jobs.map(job => [job.id, "pending"]));
    const results = new Map();

    validateGraph(jobs, byId);

    const ready = jobs
      .filter(job => job.dependencies.length === 0)
      .map(job => job.id);

    return new Promise((resolve, reject) => {
      let settled = false;

      const fail = error => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      const schedule = () => {
        if (settled) return;

        while (running < concurrency && ready.length > 0) {
          const id = ready.shift();
          if (state.get(id) !== "pending") continue;

          const job = byId.get(id);
          state.set(id, "running");
          running++;

          Promise.resolve()
            .then(() => job.run())
            .then(value => {
              running--;
              completed++;
              state.set(id, "completed");
              results.set(id, value);

              for (const candidate of jobs) {
                if (state.get(candidate.id) !== "pending") continue;

                const dependenciesDone = candidate.dependencies.every(
                  dependency => state.get(dependency) === "completed"
                );

                if (dependenciesDone && !ready.includes(candidate.id)) {
                  ready.push(candidate.id);
                }
              }

              if (completed === jobs.length) {
                settled = true;
                resolve({
                  results: Object.fromEntries(results),
                  stats: { completed, failed, maxConcurrency: concurrency }
                });
                return;
              }

              schedule();
            })
            .catch(error => {
              running--;
              failed++;
              state.set(id, "failed");

              // Dependents can never run because one of their prerequisites failed.
              fail(new Error(`Job ${id} failed: ${error.message}`));
            });
        }

        // No work is running and no job is ready: the graph is blocked.
        if (!running && !ready.length && completed !== jobs.length) {
          fail(new Error("Scheduler is blocked by unresolved dependencies"));
        }
      };

      schedule();
    });
  };
}

function validateGraph(jobs, byId) {
  const visiting = new Set();
  const visited = new Set();

  const visit = id => {
    if (visiting.has(id)) {
      throw new Error(`Dependency cycle detected at ${id}`);
    }

    if (visited.has(id)) return;

    const job = byId.get(id);
    if (!job) {
      throw new Error(`Unknown dependency: ${id}`);
    }

    visiting.add(id);
    job.dependencies.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };

  jobs.forEach(job => visit(job.id));
}

// Example asynchronous jobs.
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const jobs = [
  {
    id: "fetch-user",
    dependencies: [],
    run: async () => {
      await wait(120);
      return { id: 7, name: "Nitish" };
    }
  },
  {
    id: "fetch-orders",
    dependencies: [],
    run: async () => {
      await wait(180);
      return [101, 102, 103];
    }
  },
  {
    id: "build-profile",
    dependencies: ["fetch-user"],
    run: async () => {
      await wait(80);
      return "profile-ready";
    }
  },
  {
    id: "calculate-total",
    dependencies: ["fetch-orders"],
    run: async () => {
      await wait(60);
      return 4500;
    }
  },
  {
    id: "generate-dashboard",
    dependencies: ["build-profile", "calculate-total"],
    run: async () => {
      await wait(100);
      return "dashboard-ready";
    }
  }
];

const scheduler = createScheduler({ concurrency: 2 });

scheduler(jobs)
  .then(report => console.log(report))
  .catch(error => console.error(error.message));
