// Practice: Recursive dependency resolver with cycle detection and memoization.
// Goal: Return a valid execution order for a dependency graph.

function createDependencyResolver(graph) {
  const state = new Map();
  const memo = new Map();

  function resolve(moduleName) {
    if (memo.has(moduleName)) return [...memo.get(moduleName)];

    const currentState = state.get(moduleName);
    if (currentState === "visiting") {
      throw new Error(`Circular dependency detected at: ${moduleName}`);
    }
    if (currentState === "visited") return [];

    state.set(moduleName, "visiting");
    const dependencies = graph[moduleName] ?? [];
    const order = [];

    for (const dependency of dependencies) {
      if (!(dependency in graph)) {
        throw new Error(`Unknown dependency: ${dependency}`);
      }
      order.push(...resolve(dependency));
    }

    state.set(moduleName, "visited");
    order.push(moduleName);

    const uniqueOrder = [...new Set(order)];
    memo.set(moduleName, uniqueOrder);
    return [...uniqueOrder];
  }

  return (entryPoints) => {
    state.clear();
    memo.clear();

    const result = [];
    for (const entry of entryPoints) {
      if (!(entry in graph)) {
        throw new Error(`Unknown entry module: ${entry}`);
      }
      result.push(...resolve(entry));
    }

    return [...new Set(result)];
  };
}

const dependencies = {
  app: ["api", "ui"],
  api: ["auth", "http"],
  ui: ["components", "utils"],
  auth: ["crypto", "http"],
  components: ["utils"],
  crypto: [],
  http: [],
  utils: [],
};

const resolve = createDependencyResolver(dependencies);

console.log(resolve(["app"]));
// ["crypto", "http", "auth", "api", "utils", "components", "ui", "app"]

// Challenge: uncomment to test cycle detection.
// dependencies.crypto.push("app");
// console.log(resolve(["app"]));
