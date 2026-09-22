/**
 * Practice: Transactional Async Job Queue
 *
 * Build a small job scheduler that demonstrates:
 * - closures for private queue state
 * - higher-order functions for job handlers
 * - async/await and Promise coordination
 * - priority-based scheduling
 * - per-job retry limits
 * - dependency handling
 * - cycle-safe dependency validation
 * - concurrency limiting
 * - event-style hooks
 *
 * Challenge:
 * A job can run only after all of its dependencies have succeeded.
 * Failed jobs may retry, but a permanently failed dependency blocks
 * every dependent job. The queue must never exceed its concurrency limit.
 */

function createJobQueue({ concurrency = 2, onEvent = () => {} } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError("concurrency must be a positive integer");
  }

  const jobs = new Map();
  let running = 0;
  let sequence = 0;

  function emit(type, job, extra = {}) {
    onEvent({
      type,
      jobId: job?.id ?? null,
      timestamp: Date.now(),
      ...extra
    });
  }

  function validateGraph() {
    const state = new Map();

    function visit(id) {
      const current = state.get(id);

      if (current === "visiting") {
        throw new Error(`Dependency cycle detected at job: ${id}`);
      }

      if (current === "visited") {
        return;
      }

      const job = jobs.get(id);
      if (!job) {
        throw new Error(`Unknown dependency: ${id}`);
      }

      state.set(id, "visiting");

      for (const dependency of job.dependencies) {
        visit(dependency);
      }

      state.set(id, "visited");
    }

    for (const id of jobs.keys()) {
      visit(id);
    }
  }

  function dependencyState(job) {
    const dependencies = job.dependencies.map(id => jobs.get(id));

    if (dependencies.some(dep => dep.status === "failed" || dep.status === "blocked")) {
      return "blocked";
    }

    if (dependencies.every(dep => dep.status === "completed")) {
      return "ready";
    }

    return "waiting";
  }

  function pickNextJob() {
    return [...jobs.values()]
      .filter(job => job.status === "pending" && dependencyState(job) === "ready")
      .sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }

        return a.sequence - b.sequence;
      })[0];
  }

  async function execute(job) {
    running++;
    job.status = "running";
    emit("started", job, { attempt: job.attempt + 1 });

    try {
      job.attempt++;
      job.result = await job.handler(job.context);
      job.status = "completed";
      emit("completed", job, { result: job.result });
    } catch (error) {
      job.error = error;

      if (job.attempt <= job.retries) {
        job.status = "pending";
        emit("retry", job, {
          attempt: job.attempt,
          retriesRemaining: job.retries - job.attempt + 1
        });
      } else {
        job.status = "failed";
        emit("failed", job, { error: error.message });
      }
    } finally {
      running--;
      schedule();
    }
  }

  function blockDependents() {
    for (const job of jobs.values()) {
      if (job.status === "pending" && dependencyState(job) === "blocked") {
        job.status = "blocked";
        emit("blocked", job);
      }
    }
  }

  function schedule() {
    blockDependents();

    while (running < concurrency) {
      const next = pickNextJob();

      if (!next) {
        break;
      }

      // Do not await here: multiple independent jobs can run concurrently.
      void execute(next);
    }
  }

  function add({
    id,
    handler,
    dependencies = [],
    priority = 0,
    retries = 0,
    context = {}
  }) {
    if (!id || typeof id !== "string") {
      throw new TypeError("Job id must be a non-empty string");
    }

    if (jobs.has(id)) {
      throw new Error(`Duplicate job id: ${id}`);
    }

    if (typeof handler !== "function") {
      throw new TypeError(`Handler for ${id} must be a function`);
    }

    if (!Array.isArray(dependencies) || dependencies.includes(id)) {
      throw new TypeError(`Invalid dependencies for ${id}`);
    }

    jobs.set(id, {
      id,
      handler,
      dependencies: [...new Set(dependencies)],
      priority,
      retries,
      context,
      sequence: sequence++,
      attempt: 0,
      status: "pending",
      result: undefined,
      error: null
    });

    return api;
  }

  function start() {
    validateGraph();
    schedule();
    return api;
  }

  async function waitForAll() {
    while ([...jobs.values()].some(job =>
      ["pending", "running"].includes(job.status)
    )) {
      await new Promise(resolve => setTimeout(resolve, 10));
      blockDependents();
      schedule();
    }

    return [...jobs.values()].map(job => ({
      id: job.id,
      status: job.status,
      attempt: job.attempt,
      result: job.result,
      error: job.error?.message ?? null
    }));
  }

  function snapshot() {
    return [...jobs.values()].map(job => ({
      id: job.id,
      dependencies: [...job.dependencies],
      priority: job.priority,
      status: job.status,
      attempt: job.attempt
    }));
  }

  const api = {
    add,
    start,
    waitForAll,
    snapshot
  };

  return api;
}

// Example usage
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const queue = createJobQueue({
  concurrency: 2,
  onEvent: event => console.log(`[${event.type}]`, event.jobId)
});

let deploymentAttempts = 0;

queue
  .add({
    id: "build",
    priority: 5,
    handler: async () => {
      await sleep(100);
      return "build complete";
    }
  })
  .add({
    id: "tests",
    dependencies: ["build"],
    priority: 10,
    handler: async () => {
      await sleep(80);
      return "tests passed";
    }
  })
  .add({
    id: "deploy",
    dependencies: ["tests"],
    retries: 2,
    handler: async () => {
      await sleep(60);
      deploymentAttempts++;

      if (deploymentAttempts < 2) {
        throw new Error("temporary deployment failure");
      }

      return "deployment successful";
    }
  })
  .add({
    id: "notify",
    dependencies: ["deploy"],
    priority: 1,
    handler: async () => "notification sent"
  })
  .start();

queue.waitForAll().then(results => {
  console.table(results);
  console.log(queue.snapshot());
});
