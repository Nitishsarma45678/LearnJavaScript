// Practice: Memoized Dependency Planner
// Topics: recursion, closures, memoization, graph traversal, topological ordering

function createDependencyPlanner(dependencies) {
  const memo = new Map();

  function getDependencies(task) {
    if (memo.has(task)) return memo.get(task);

    const result = [];
    const visiting = new Set();
    const visited = new Set();

    function visit(current) {
      if (visiting.has(current)) {
        throw new Error(`Circular dependency detected: ${current}`);
      }
      if (visited.has(current)) return;

      visiting.add(current);

      for (const dependency of dependencies[current] ?? []) {
        if (!Object.prototype.hasOwnProperty.call(dependencies, dependency)) {
          throw new Error(`Unknown task: ${dependency}`);
        }
        visit(dependency);
      }

      visiting.delete(current);
      visited.add(current);

      if (current !== task) result.push(current);
    }

    visit(task);
    result.push(task);
    memo.set(task, result);
    return result;
  }

  return {
    plan(task) {
      return [...getDependencies(task)];
    },

    clearCache() {
      memo.clear();
    },

    cacheSize() {
      return memo.size;
    },
  };
}

const dependencies = {
  deploy: ["test", "build"],
  test: ["unit", "lint"],
  build: ["compile", "lint"],
  compile: ["source"],
  unit: ["source"],
  lint: ["source"],
  source: [],
};

const planner = createDependencyPlanner(dependencies);

console.log(planner.plan("deploy"));
console.log("Cached plans:", planner.cacheSize());
console.log(planner.plan("deploy"));

// Uncomment to test cycle detection:
// dependencies.source = ["deploy"];
// planner.clearCache();
// console.log(planner.plan("deploy"));
