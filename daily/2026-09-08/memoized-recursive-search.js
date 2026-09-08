// Daily JavaScript practice — 2026-09-08
// Memoized recursive search over a nested dependency graph.

function createMemoizedResolver(graph) {
  const cache = new Map();
  const visiting = new Set();

  function resolve(name) {
    if (cache.has(name)) return cache.get(name);
    if (visiting.has(name)) throw new Error(`Cycle detected at: ${name}`);
    if (!graph.has(name)) throw new Error(`Unknown node: ${name}`);

    visiting.add(name);
    const dependencies = graph.get(name);
    const result = new Set([name]);

    for (const dependency of dependencies) {
      for (const item of resolve(dependency)) result.add(item);
    }

    visiting.delete(name);
    const resolved = [...result];
    cache.set(name, resolved);
    return resolved;
  }

  return resolve;
}

const graph = new Map([
  ["app", ["auth", "billing"]],
  ["auth", ["logger", "crypto"]],
  ["billing", ["logger", "database"]],
  ["crypto", ["logger"]],
  ["database", []],
  ["logger", []]
]);

const resolveDependencies = createMemoizedResolver(graph);

console.log(resolveDependencies("app"));
console.log(resolveDependencies("billing"));
