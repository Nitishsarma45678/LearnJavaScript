/**
 * Practice: Dependency Graph Critical Path Analyzer
 *
 * Build a reusable analyzer for a directed task graph.
 *
 * Concepts:
 * - closures for private graph state and memoization
 * - recursion with DFS
 * - higher-order array/object processing
 * - Map / Set based graph algorithms
 * - cycle detection
 * - topological ordering
 * - longest-path / critical-path calculation on a DAG
 *
 * Each task has a duration and a list of dependencies. A task can start
 * only after all of its dependencies finish.
 */

function createCriticalPathAnalyzer(tasks) {
  const graph = new Map();
  const memo = new Map();

  for (const task of tasks) {
    if (graph.has(task.id)) {
      throw new Error(`Duplicate task id: ${task.id}`);
    }

    graph.set(task.id, {
      duration: task.duration,
      dependencies: [...task.dependencies]
    });
  }

  // Validate that every dependency refers to an existing task.
  for (const [id, task] of graph) {
    for (const dependency of task.dependencies) {
      if (!graph.has(dependency)) {
        throw new Error(`Unknown dependency: ${dependency} -> ${id}`);
      }
    }
  }

  function getCriticalDuration(id, visiting = new Set()) {
    if (memo.has(id)) {
      return memo.get(id);
    }

    if (visiting.has(id)) {
      throw new Error(`Dependency cycle detected at task: ${id}`);
    }

    visiting.add(id);

    const task = graph.get(id);
    const dependencyFinish = task.dependencies.length === 0
      ? 0
      : Math.max(
          ...task.dependencies.map(dependency =>
            getCriticalDuration(dependency, visiting)
          )
        );

    visiting.delete(id);

    const finishTime = dependencyFinish + task.duration;
    memo.set(id, finishTime);

    return finishTime;
  }

  function topologicalSort() {
    const indegree = new Map(
      [...graph].map(([id]) => [id, 0])
    );

    const dependents = new Map(
      [...graph].map(([id]) => [id, []])
    );

    for (const [id, task] of graph) {
      indegree.set(id, task.dependencies.length);

      for (const dependency of task.dependencies) {
        dependents.get(dependency).push(id);
      }
    }

    const queue = [...indegree]
      .filter(([, count]) => count === 0)
      .map(([id]) => id);

    const order = [];

    while (queue.length) {
      const current = queue.shift();
      order.push(current);

      for (const dependent of dependents.get(current)) {
        const nextDegree = indegree.get(dependent) - 1;
        indegree.set(dependent, nextDegree);

        if (nextDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    if (order.length !== graph.size) {
      throw new Error("Cannot create schedule: dependency cycle detected");
    }

    return order;
  }

  return {
    getSchedule() {
      const order = topologicalSort();

      return order.map(id => ({
        id,
        duration: graph.get(id).duration,
        finishTime: getCriticalDuration(id)
      }));
    },

    getCriticalPath() {
      topologicalSort();

      const finishTimes = [...graph.keys()].map(id => ({
        id,
        finishTime: getCriticalDuration(id)
      }));

      const projectDuration = Math.max(
        ...finishTimes.map(task => task.finishTime)
      );

      const terminalTasks = finishTimes
        .filter(task => ![...graph.values()].some(item =>
          item.dependencies.includes(task.id)
        ))
        .map(task => task.id);

      const endTask = terminalTasks.reduce((best, id) =>
        getCriticalDuration(id) > getCriticalDuration(best) ? id : best
      );

      const path = [];

      function walk(id) {
        path.unshift(id);

        const dependencies = graph.get(id).dependencies;

        if (dependencies.length === 0) {
          return;
        }

        const next = dependencies.reduce((best, candidate) =>
          getCriticalDuration(candidate) > getCriticalDuration(best)
            ? candidate
            : best
        );

        walk(next);
      }

      walk(endTask);

      return {
        path,
        duration: projectDuration
      };
    },

    clearMemo() {
      memo.clear();
    }
  };
}

// Example
const tasks = [
  { id: "requirements", duration: 2, dependencies: [] },
  { id: "database", duration: 4, dependencies: ["requirements"] },
  { id: "api", duration: 5, dependencies: ["requirements"] },
  { id: "frontend", duration: 3, dependencies: ["api"] },
  { id: "integration", duration: 2, dependencies: ["database", "frontend"] },
  { id: "testing", duration: 4, dependencies: ["integration"] },
  { id: "deployment", duration: 1, dependencies: ["testing"] }
];

const analyzer = createCriticalPathAnalyzer(tasks);

console.table(analyzer.getSchedule());
console.log("Critical path:", analyzer.getCriticalPath());
